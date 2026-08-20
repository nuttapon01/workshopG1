# syntax=docker/dockerfile:1.7

# PointHub runtime image.
#
# Three build stages feed one small runtime stage:
#   client-build : webpack compiles the React/antd CS UI into public/
#   server-build : tsc compiles src/ into dist/
#   certs        : fetches the Amazon RDS trust store
#   runtime      : production dependencies + the two build outputs
#
# The base image is pinned by digest, not just by tag. `node:20-alpine` is a
# moving target; a digest makes the build reproducible and means a compromised
# upstream tag cannot silently change what ships. Dependabot does not update
# digests, so bump this deliberately alongside the Node 20 LTS line.
ARG NODE_IMAGE=node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

# =============================================================================
# Stage 1 — Customer-service UI
# =============================================================================
FROM ${NODE_IMAGE} AS client-build

WORKDIR /build

# Dependencies first so the layer caches independently of source changes.
COPY client/package.json client/package-lock.json ./client/
# --ignore-scripts throughout this file, for two reasons:
#   1. The root package.json `prepare` script runs husky, a devDependency. With
#      --omit=dev in the runtime stage the binary is absent and `npm ci` exits
#      127. Git hooks are a developer-machine concern and have no business
#      running during an image build.
#   2. It blocks arbitrary install-time code execution from the dependency tree,
#      which is the main supply-chain foothold in an npm build.
# Nothing in either dependency tree needs a postinstall step: tsc and webpack
# both run from checked-in JavaScript.
RUN cd client && npm ci --no-audit --no-fund --ignore-scripts

# webpack.config.js resolves output to `path.resolve(__dirname, '..', 'public')`
# and reads its HTML template from `./public/index.html` — the same directory it
# wipes via `clean: true`. The template must therefore be in place *before* the
# build runs, and the build must not be pointed at a directory holding anything
# else worth keeping. Copying just the template into an otherwise empty
# public/ satisfies both.
COPY public/index.html ./public/index.html
COPY client/ ./client/

RUN cd client && npm run build

# Fail early and loudly if webpack silently produced nothing — otherwise the
# error surfaces much later as a blank page in the browser.
RUN test -s /build/public/bundle.js && test -s /build/public/index.html

# =============================================================================
# Stage 2 — API server
# =============================================================================
FROM ${NODE_IMAGE} AS server-build

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build && test -s /build/dist/index.js

# =============================================================================
# Stage 3 — Amazon RDS trust store
# =============================================================================
# Fetched at build time, not at runtime: the platform rule is that nothing is
# pulled from the internet while the service is running.
FROM ${NODE_IMAGE} AS certs

RUN apk add --no-cache ca-certificates curl \
    && curl -fsSL --retry 3 \
        https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
        -o /tmp/rds-global-bundle.pem \
    && test -s /tmp/rds-global-bundle.pem \
    && grep -q "BEGIN CERTIFICATE" /tmp/rds-global-bundle.pem

# =============================================================================
# Stage 4 — Runtime
# =============================================================================
FROM ${NODE_IMAGE} AS runtime

# Business timezone. Expiry month boundaries and the day-of-week campaign rules
# are read by people in Bangkok, so the container must not run on UTC.
ENV TZ=Asia/Bangkok \
    NODE_ENV=production \
    PORT=3000

# `apk upgrade` picks up OS package fixes published after the base image was
# built. Without it the image ships whatever OpenSSL was current at base-image
# build time, which is what the Trivy gate flags (libcrypto3/libssl3 3.5.6-r0 ->
# 3.5.7-r0 at the time of writing).
# tzdata must STAY installed. musl resolves the TZ environment variable by
# reading /usr/share/zoneinfo at runtime, so `apk del tzdata` after copying
# /etc/localtime silently drops the container back to UTC — which would shift
# expiry month boundaries and day-of-week campaign matching by up to 7 hours.
RUN apk upgrade --no-cache \
    && apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Bangkok /etc/localtime \
    && echo "Asia/Bangkok" > /etc/timezone

WORKDIR /app

# Production dependencies only. tsx, vitest, eslint and the rest of the
# toolchain stay out of the runtime image — smaller surface, fewer advisories
# for Trivy to flag on something that never executes in production.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
    && npm cache clean --force \
    # Remove npm and corepack once the install is done. The container's command
    # is `node dist/index.js` — npm is never invoked at runtime.
    #
    # This is not cosmetic. npm vendors its own dependency tree at
    # /usr/local/lib/node_modules/npm/node_modules, and that tree accounted for
    # all 18 HIGH/CRITICAL findings Trivy reported against this image (tar,
    # sigstore, cross-spawn, minimatch, glob, brace-expansion, ip-address) —
    # none of them reachable from the application. Deleting the code is a real
    # fix; a .trivyignore entry would only have hidden it.
    && rm -rf /usr/local/lib/node_modules/npm \
              /usr/local/lib/node_modules/corepack \
              /usr/local/bin/npm /usr/local/bin/npx \
              /usr/local/bin/corepack \
              /root/.npm \
    # yarn ships in the base image and is likewise never used at runtime.
    && rm -rf /opt/yarn-v* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# src/app.ts serves statics from `path.join(__dirname, '..', 'public')`, and
# __dirname is /app/dist at runtime — so dist/ and public/ must be siblings.
COPY --from=server-build /build/dist ./dist
COPY --from=client-build /build/public ./public

# Source maps are 4 MB of the bundle output and are only useful to a debugger.
RUN rm -f ./public/*.map

COPY --from=certs /tmp/rds-global-bundle.pem /app/certs/rds-global-bundle.pem

ENV DB_CA_PATH=/app/certs/rds-global-bundle.pem

# `node` (uid 1000) ships with the base image. Running as root inside a task
# that faces the internet through an ALB buys nothing.
USER node

EXPOSE 3000

# Uses node rather than curl so the runtime image needs no HTTP client on PATH.
# /api/health is liveness only; /api/ready is the one that touches the database
# and is what the ALB target group and the post-deploy smoke test check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/api/health',timeout:4000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Direct exec form, no shell and no init wrapper: src/index.ts installs SIGTERM
# and SIGINT handlers that drain the HTTP server and the pg pool, and those only
# receive the signal if node is PID 1.
CMD ["node", "dist/index.js"]

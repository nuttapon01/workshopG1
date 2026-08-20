# CI/CD — PointHub

Two workflows. `ci.yml` gates every change; `deploy.yml` is the only thing that
can reach AWS, and only from the `production` branch.

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push (any branch except `production`), pull request, `workflow_call` | quality, tests, security, image build, e2e |
| `deploy.yml` | push to `production` | calls `ci.yml`, then builds, pushes to ECR and deploys |

## Why the split

`ci.yml` has no `id-token: write` permission anywhere in the file. The repository
is public, so anyone can open a pull request and run it. Keeping the OIDC
capability out of `ci.yml` means a pull request cannot assume the AWS deployment
role no matter what it changes. The credential path exists only in `deploy.yml`,
which never runs on a pull request.

Every `uses:` is pinned to a commit SHA rather than a tag. Tags are mutable — an
attacker who compromises an action repository can repoint `v4` at new code.
Dependabot (`dependabot.yml`, `github-actions` ecosystem) raises PRs to move the
pins forward.

## Jobs in `ci.yml`

| Job | Gate |
|---|---|
| `quality` | eslint (`--max-warnings=23`), prettier `--check`, `tsc --noEmit` for both `pointhub/` and `qa-automation/` |
| `test` | vitest unit + route + integration against a `postgres:15-alpine` service; integration replays all 43 sample transactions and asserts the eight closing balances |
| `secrets` | gitleaks over **full history** (`fetch-depth: 0`), config `.gitleaks.toml`, SARIF to the Security tab |
| `deps` | `npm audit --audit-level=high` in `pointhub/`, `pointhub/client/`, `qa-automation/`, `infra/` |
| `sast` | CodeQL `javascript-typescript`, `security-extended` query suite |

## Local hooks

`pointhub/.husky/` holds the same checks, shifted left:

| Hook | Runs |
|---|---|
| `pre-commit` | `lint-staged` (eslint --fix + prettier --write on staged files), then `gitleaks git --staged` |
| `commit-msg` | commitlint, Conventional Commits (`pointhub/commitlint.config.js`) |
| `pre-push` | `tsc --noEmit` + unit tests |

Installed by `npm install` in `pointhub/` via the `prepare` script. Because the
package lives one directory below the git root, that script is
`cd .. && husky pointhub/.husky` and it sets `core.hooksPath` in the repository's
local git config.

The `pre-commit` secret scan **fails open** when neither the `gitleaks` binary
nor Docker is available — it warns and continues. That is only safe because two
blocking gates sit downstream: the `secrets` job, and GitHub push protection.
Do not remove either.

Install gitleaks locally to get the fast path: `brew install gitleaks`.

Note for gitleaks 8.x: the `protect` subcommand was removed. Staged scanning is
`gitleaks git --staged`.

## Run the production image locally

The same image the pipeline builds and deploys:

```bash
cd local-environment && docker compose up -d          # PostgreSQL 15
cd ../pointhub && npm run migrate && npm run seed

docker build -t pointhub:local .
docker run --rm -p 3100:3000 \
  -e DB_HOST=host.docker.internal \
  -e DB_USER=pointhub -e DB_PASSWORD=pointhub -e DB_NAME=pointhub \
  pointhub:local
```

Then `http://localhost:3100/` for the CS UI and `/api/ready` for the database
probe.

Notes on the image:

- Four stages. `client-build` runs webpack, `server-build` runs tsc, `certs`
  fetches the Amazon RDS trust store, `runtime` carries only production
  dependencies plus those outputs. No tsx, vitest, eslint or prettier.
- Base image is pinned **by digest**. Dependabot does not update digests, so bump
  it deliberately.
- `npm`, `npx`, `yarn` and `corepack` are deleted from the runtime stage. They
  are never invoked (`CMD` is `node dist/index.js`), and npm's vendored
  dependency tree was the source of all 18 HIGH/CRITICAL findings Trivy reported
  against the image. Removing the code is the fix; a `.trivyignore` would have
  been a mute.
- `apk upgrade` runs in the runtime stage to pick up OS fixes published after the
  base image was built.
- `tzdata` stays installed on purpose. musl resolves `TZ` against
  `/usr/share/zoneinfo` at runtime, so removing it would silently drop the
  container to UTC and shift expiry month boundaries and day-of-week campaign
  matching.
- Source maps are stripped from `public/`: 4 MB, useful only to a debugger.

## Deployer isolation

The AWS account is shared between workshop groups, so the CDK app refuses to
synthesise without `DEPLOYER`. It is read from the repository-root `.env` (see
`.env.example`), or from the environment, which is how CI will set it.

`DEPLOYER` prefixes every name that is unique per account or region — not just
stack names. Stack names alone would still collide on the ECR repository, the RDS
instance identifier, security group names, the Secrets Manager secret, log groups
and SSM parameter paths. All of them are derived in one place,
`infra/lib/config.ts` → `resourceNames()`, so adding a resource means adding its
name there rather than inlining a literal and discovering the collision when a
second group deploys.

For `DEPLOYER=SIAM-MEGAMART-POINT-HUB`:

| Thing | Name |
|---|---|
| Stacks | `SIAM-MEGAMART-POINT-HUB-PointhubEcr`, `-PointhubNetwork`, `-PointhubData`, … |
| ECR repository | `siam-megamart-point-hub/pointhub` |
| RDS instance | `siam-megamart-point-hub-pointhub-prod` |
| SSM namespace | `/siam-megamart-point-hub/prod/…` |
| Tag on every resource | `Deployer=SIAM-MEGAMART-POINT-HUB` |

`resolveDeployer()` throws when the value is missing, does not start with a
letter, or is long enough to breach the 63-character RDS identifier limit. The
`Deployer` tag is what makes a shared account's bill attributable.

## Required repository settings (manual, once)

These cannot be set from a workflow file. Settings → Code security:

- [ ] **Secret scanning** — on
- [ ] **Push protection** — on. This is the gate that rejects a push containing a
      credential, which is strictly better than finding it after the fact.
- [ ] **Dependabot alerts** and **security updates** — on
- [ ] **CodeQL** — the `sast` job uploads results; no extra setup needed for a
      public repository

Settings → Branches, for `production`:

- [ ] Require a pull request before merging
- [ ] Require status checks: `quality`, `test`, `secrets`, `deps`, `sast`, `image`, `e2e`
- [ ] Do not allow bypassing the above

Without the branch protection rule, `deploy.yml` is the only thing standing
between a direct push and production.

## Known gaps

- `vitest.config.mts` collects coverage but sets no threshold, so the coverage
  artifact is informational rather than a gate.
- `pointhub/public/bundle.js` is a 5 MB committed build artifact. It is
  allowlisted in `.gitleaks.toml` (minified vendor code triggers the
  `generic-api-key` rule, and scanning it took 95% of the scan time). It is
  reproducible from `pointhub/client/` and should be untracked.
- `pointhub/eslint.config.js` carries a warning budget of 23, all
  `no-explicit-any` in `src/routes/**` plus two unused variables. The number is a
  ratchet: it should only ever move down.

# Design Decisions

## Context Summary
- **Project**: PointHub — Feature completion (CS UI + Expiry + Tests)
- **Stack**: TypeScript / Express 4.18 / PostgreSQL 15 (established)
- **Mode**: Comprehensive (3 units in parallel)
- **Units**: CS UI (Dev A), Expiry+Foundation (Dev B), Validation (Dev C)
- **D1 Decisions**: UI=React/Vue SPA, Testing=Full coverage, Expiry=Script+Endpoint, NFR=Performance
- **Constraints**: No ORM, no floating-point, UI offline (no CDN), Asia/Bangkok timezone
- **Existing patterns**: Raw pg queries, inline validation, console.log, no test framework yet

---

## Decision Questions

### D3-1: Frontend Framework
**Question**: Which framework for the customer-service SPA (built to static output, served by Express)?
- 1) React (most popular, largest ecosystem, well-known by most teams)
- 2) Vue (simpler learning curve, great for small-medium SPAs) **(Recommended)**
- 3) Svelte (smallest bundle, compile-time approach, less ecosystem)
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-2: Frontend Build Tool
**Question**: Which build tool to bundle the SPA into static files in `pointhub/public/`?
- 1) Vite (fast, modern, supports React/Vue/Svelte out of box) **(Recommended)**
- 2) Webpack (mature, more config, larger community)
- 3) esbuild (fastest, less plugin ecosystem)
- 4) Other (please specify): _______

**Answer**: 2

---

### D3-3: UI Styling Approach
**Question**: How should the CS UI be styled (must work offline — no CDN fonts/icons)?
- 1) Tailwind CSS (utility-first, bundled at build time, no runtime CDN needed) **(Recommended)**
- 2) Plain CSS / CSS Modules (zero dependencies, simple)
- 3) CSS-in-JS (styled-components / Emotion — bundled at build)
- 4) Other (please specify): _______

**Answer**: 4. use ant

---

### D3-4: Unit Test Framework
**Question**: Which test framework for unit and integration tests?
- 1) Vitest (fast, Vite-native, ESM-first, Jest-compatible API) **(Recommended)**
- 2) Jest (most popular, mature, large ecosystem)
- 3) Mocha + Chai (flexible, older, more config)
- 4) Other (please specify): _______

**Answer**: 2

---

### D3-5: Integration Test Approach
**Question**: How should API route-level tests interact with the database?
- 1) Real test DB (Docker PostgreSQL) with migrate/seed per test suite **(Recommended)**
- 2) In-memory PostgreSQL (pg-mem) — faster but less accurate
- 3) Mock the database layer entirely — fast but doesn't test SQL
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-6: HTTP Client for API Tests
**Question**: How should route tests call the Express endpoints?
- 1) Supertest (standard for Express, in-process, no network) **(Recommended)**
- 2) Native fetch against running server (more realistic, slower)
- 3) Axios against running server
- 4) Other (please specify): _______

**Answer**: 3

---

### D3-7: Code Style Enforcement
**Question**: Should we add linting/formatting now?
- 1) ESLint + Prettier (standard combo, catches bugs + consistent formatting) **(Recommended)**
- 2) Biome (faster, single tool for lint + format, newer)
- 3) None — skip for workshop scope (existing code has no linter)
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-8: Validation Library
**Question**: Should we add a schema validation library for API input (existing code uses inline checks)?
- 1) Zod (TypeScript-first, great inference, small) **(Recommended)**
- 2) Joi (mature, Hapi ecosystem)
- 3) None — keep inline validation (matches existing pattern, less churn)
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-9: Correctness & Property-Based Testing
**Question**: How should calculation correctness be verified beyond the replay test?
- 1) Property-based tests with fast-check (generate random transactions, verify invariants: non-negative milli-points, deterministic output, sum consistency) **(Recommended)**
- 2) Exhaustive example-based tests only (hand-written cases from campaign-examples.md)
- 3) Replay test is sufficient — expected-points.csv covers all edge cases
- 4) Other (please specify): _______

**Answer**: 3

---

### D3-10: Observability Strategy
**Question**: What level of observability does this service need?
- 1) Minimal — structured logging + health endpoint (sufficient for workshop/dev scope) **(Recommended)**
- 2) Standard — logging + metrics + health + readiness
- 3) Full — logging + metrics + distributed tracing + alerting + dashboards
- 4) None — skip observability entirely

**Answer**: 2

---

### D3-11: Error Tracking
**Question**: How should runtime errors be captured and reported?
- 1) Log-based only — errors in structured logs **(Recommended — workshop scope)**
- 2) Dedicated error tracking service (Sentry)
- 3) None — no error tracking beyond console.error
- 4) Other (please specify): _______

**Answer**: 1

---

### D3-12: Health & Lifecycle Management
**Question**: What lifecycle management does the service need?
- 1) Basic health endpoint only (already exists at `/api/health`) **(Recommended)**
- 2) Health + readiness + graceful shutdown
- 3) Health + readiness + graceful shutdown + startup probe
- 4) Other (please specify): _______

**Answer**: 3

---

## Decisions Summary
<!-- Machine-readable compact summary. Downstream phases: read ONLY this section. -->
- D3-1 Frontend Framework: React
- D3-2 Build Tool: Webpack
- D3-3 UI Styling: Ant Design (component library)
- D3-4 Test Framework: Jest
- D3-5 Integration Tests: Real test DB (Docker PostgreSQL) with migrate/seed per suite
- D3-6 API Test Client: Axios against running server
- D3-7 Code Style: ESLint + Prettier
- D3-8 Validation: Zod
- D3-9 Correctness Testing: Replay test is sufficient (expected-points.csv)
- D3-10 Observability: Standard — logging + metrics + health + readiness
- D3-11 Error Tracking: Log-based only (structured logs)
- D3-12 Lifecycle: Health + readiness + graceful shutdown + startup probe

---

**Instructions**: Fill in your answers above and respond with "done"

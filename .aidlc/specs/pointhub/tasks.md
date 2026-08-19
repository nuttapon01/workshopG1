# Implementation Tasks

## Summary
- **Total Tasks**: 28 across 6 phases
- **Execution Waves**: 3 waves (Wave 1: Foundation, Wave 2: CS UI + Expiry parallel, Wave 3: Validation + Polish)
- **Coverage**: 4 components, 5 entities, 15 endpoints, 12 user stories
- **Strategy**: By unit, test-after, single-concern granularity, mock-first integration

## Execution Waves

### Wave 1: Foundation (Dev B) — Sync point
File ownership: `tests/setup/`, `jest.config.ts`, `package.json` (test deps), `.eslintrc.js`, `.prettierrc`

### Wave 2: Features (Dev A + Dev B parallel)
- Dev A: `client/`, `pointhub/public/`
- Dev B: `src/jobs/`, `src/routes/admin.ts`, `src/scripts/run-expiry.ts`, `src/middleware/`

### Wave 3: Validation + Polish (Dev C, after Wave 1 sync)
File ownership: `tests/unit/`, `tests/routes/`, `tests/integration/`

---

## Phase 1: Foundation (Dev B) — Wave 1

- [ ] 1. Install and configure Jest
  - Install jest, ts-jest, @types/jest
  - Create `jest.config.ts` with TypeScript support, test paths, global setup/teardown
  - Add npm scripts: `test`, `test:unit`, `test:routes`, `test:integration`
  - **Ref**: design/testing-strategy.md, design/implementation.md
  - **Files**: `package.json`, `tests/jest.config.ts`

- [ ] 2. Create test DB lifecycle (global-setup/teardown)
  - `tests/setup/global-setup.ts`: create `pointhub_test` DB, run migrations
  - `tests/setup/global-teardown.ts`: drop test DB, close connections
  - Use environment variable `DB_NAME_TEST` to isolate
  - **Ref**: design/testing-strategy.md
  - **Files**: `tests/setup/global-setup.ts`, `tests/setup/global-teardown.ts`

- [ ] 3. Create shared test helpers
  - `tests/setup/test-helpers.ts`: seedMembers(), seedCampaigns(), clearLedger(), getBalance(), apiClient (Axios)
  - API client configured to hit `http://localhost:3001` (test port)
  - **Ref**: design/testing-strategy.md
  - **Files**: `tests/setup/test-helpers.ts`

- [ ] 4. Configure ESLint + Prettier
  - Install eslint, prettier, @typescript-eslint/*, eslint-config-prettier
  - Create `.eslintrc.js` and `.prettierrc`
  - Add npm script: `lint`, `format`
  - **Ref**: D3-7, design/implementation.md
  - **Files**: `.eslintrc.js`, `.prettierrc`, `package.json`

- [ ] 5. Set up pino structured logging
  - Install pino, pino-http
  - Create `src/middleware/request-logger.ts` — pino-http middleware with reqId, method, path, statusCode, duration
  - Wire into `src/index.ts`
  - **Ref**: design/operations.md, design/components.md
  - **Files**: `src/middleware/request-logger.ts`, `src/index.ts`, `package.json`

- [ ] 6. Create centralized error handler middleware
  - Create `src/middleware/error-handler.ts` — catches unhandled errors, logs via pino, returns consistent `{ error, detail }` JSON
  - Wire into `src/index.ts` (after routes)
  - **Ref**: design/operations.md, design/components.md
  - **Files**: `src/middleware/error-handler.ts`, `src/index.ts`

---

## Phase 2: Customer-Service UI (Dev A) — Wave 2

- [ ] 7. Initialize React + Webpack + Ant Design project
  - Create `client/` directory with `package.json`, `tsconfig.json`, `webpack.config.js`
  - Install react, react-dom, antd, axios, webpack, webpack-cli, ts-loader, css-loader, html-webpack-plugin
  - Configure webpack to output to `../public/` (overwrite)
  - **Ref**: D3-1, D3-2, D3-3, design/components.md
  - **Files**: `client/package.json`, `client/tsconfig.json`, `client/webpack.config.js`

- [ ] 8. Create entry point and App shell
  - `client/src/index.tsx` — React entry, renders App
  - `client/src/App.tsx` — layout with Ant Design ConfigProvider (no global CSS CDN)
  - `client/public/index.html` — HTML template
  - **Ref**: design/components.md (React SPA)
  - **Files**: `client/src/index.tsx`, `client/src/App.tsx`, `client/public/index.html`

- [ ] 9. Create API client module
  - `client/src/api/client.ts` — Axios instance, functions: getMember(), getBalance(), getHistory(), postAdjustment()
  - TypeScript types for API responses in `client/src/types/index.ts`
  - **Ref**: design/api-spec.md, design/components.md
  - **Files**: `client/src/api/client.ts`, `client/src/types/index.ts`

- [ ] 10. Implement MemberLookup component
  - `client/src/components/MemberLookup.tsx` — Ant Design Input.Search, calls getMember + getBalance on submit
  - Handle loading, error (member not found), success states
  - **Ref**: US-001, design/components.md
  - **Files**: `client/src/components/MemberLookup.tsx`

- [ ] 11. Implement MemberInfo component
  - `client/src/components/MemberInfo.tsx` — displays balance, tier (colored tag), joined date
  - Uses Ant Design Card, Tag, Statistic
  - **Ref**: US-001, design/components.md
  - **Files**: `client/src/components/MemberInfo.tsx`

- [ ] 12. Implement TransactionHistory component
  - `client/src/components/TransactionHistory.tsx` — Ant Design Table with expandable rows
  - Columns: date, type, points, description
  - Expanded row: line details (category, amount, campaign, multiplier)
  - Pagination via API (limit/offset)
  - **Ref**: US-002, design/components.md, design/api-spec.md
  - **Files**: `client/src/components/TransactionHistory.tsx`

- [ ] 13. Implement AdjustmentForm component
  - `client/src/components/AdjustmentForm.tsx` — Ant Design Form with: points (InputNumber), reason code (Select), description (TextArea)
  - Reason codes: GOODWILL, SYSTEM_ERROR, FRAUD_DEDUCT, EVENT_BONUS
  - On success: show message, refresh balance + history
  - **Ref**: US-003, design/components.md
  - **Files**: `client/src/components/AdjustmentForm.tsx`

- [ ] 14. Build and verify offline compliance
  - Run `npm run build` in client/ → verify output in `public/`
  - Verify: no external network requests in bundle (no CDN links in HTML, no external font imports)
  - Test: disconnect internet, load page → everything renders
  - **Ref**: US-004, technical-environment.md
  - **Files**: `pointhub/public/*` (webpack output)

---

## Phase 3: Point Expiry (Dev B) — Wave 2

- [ ] 15. Implement expiry logic (expire-points.ts)
  - Create `src/jobs/expire-points.ts` with `runExpiry()` function
  - SQL: find earned_month + 12 months < current Bangkok month, sum points per member×month, insert EXPIRY entries
  - Idempotent: use NOT EXISTS to skip already-expired batches
  - Return `{ batchesExpired, totalPointsExpired, executedAt }`
  - **Ref**: US-005, design/components.md (Expiry Job)
  - **Files**: `src/jobs/expire-points.ts`

- [ ] 16. Create admin route (run-expiry endpoint)
  - Create `src/routes/admin.ts` with `POST /api/admin/run-expiry`
  - Calls `runExpiry()`, returns JSON result
  - Wire into `src/index.ts`
  - **Ref**: US-005, design/api-spec.md
  - **Files**: `src/routes/admin.ts`, `src/index.ts`

- [ ] 17. Create standalone expiry script
  - Create `src/scripts/run-expiry.ts` — imports runExpiry(), executes, logs result, exits
  - Add npm script: `"expiry": "tsx src/scripts/run-expiry.ts"`
  - **Ref**: US-005, design/components.md
  - **Files**: `src/scripts/run-expiry.ts`, `package.json`

- [ ] 18. Add readiness probe endpoint
  - Create `GET /api/ready` — checks DB connection with simple `SELECT 1`
  - Returns 200 `{ status: "ready", db: "connected" }` or 503 `{ status: "not_ready" }`
  - **Ref**: D3-12, design/operations.md
  - **Files**: `src/routes/admin.ts` or `src/index.ts`

- [ ] 19. Add graceful shutdown handler
  - Listen for SIGTERM/SIGINT
  - Stop accepting new connections
  - Wait for in-flight requests (30s timeout)
  - Close pg pool
  - Exit 0
  - **Ref**: D3-12, design/operations.md
  - **Files**: `src/index.ts`

- [ ] 20. Add metrics endpoint (prom-client)
  - Install prom-client
  - Add request counter + duration histogram middleware
  - Expose `GET /api/metrics` (Prometheus text format)
  - **Ref**: D3-10, design/operations.md
  - **Files**: `src/index.ts`, `package.json`

---

## Phase 4: Validation — Unit Tests (Dev C) — Wave 3

- [ ] 21. Unit tests: calculateLineMilliPoints
  - Test base rate, x2, x2.5, x3, x5 multipliers
  - Edge cases: 0 THB, large amounts, exact division proof
  - **Ref**: US-007, design/testing-strategy.md
  - **Files**: `tests/unit/calculate-points.test.ts`

- [ ] 22. Unit tests: campaign matching
  - Test: category filter, tier filter, day-of-week, date range
  - Test: best-wins (highest multiplier), priority tie-break, alphabetical tie-break
  - Test: no campaigns → base rate, campaign below x1 → base rate
  - **Ref**: US-007, design/testing-strategy.md
  - **Files**: `tests/unit/campaign-matching.test.ts`

- [ ] 23. Unit tests: basket rounding
  - Test: floor division of totalMilliPoints / 1000
  - Test: multi-line basket sums correctly before rounding
  - **Ref**: US-007, design/testing-strategy.md
  - **Files**: `tests/unit/calculate-points.test.ts` (append)

---

## Phase 5: Validation — Route Tests (Dev C) — Wave 3

- [ ] 24. Route tests: earn + refund
  - Earn: valid sale, missing fields, duplicate (idempotency)
  - Refund: full refund, partial refund, missing original, duplicate
  - **Ref**: US-008, US-011, design/testing-strategy.md
  - **Files**: `tests/routes/earn.test.ts`, `tests/routes/refund.test.ts`

- [ ] 25. Route tests: burn + adjustments
  - Burn: valid burn, < 100 pts, not ×100, > 50% cap, insufficient balance
  - Adjustments: valid, invalid reason code, zero points, member not found
  - **Ref**: US-008, US-012, design/testing-strategy.md
  - **Files**: `tests/routes/burn.test.ts`, `tests/routes/adjustments.test.ts`

- [ ] 26. Route tests: members + campaigns + reports + admin
  - Members: found, not found, balance, history pagination
  - Campaigns: list, create, duplicate, activate, deactivate
  - Reports: liability summary
  - Admin: run-expiry, idempotent re-run
  - **Ref**: US-008, US-009, US-010, design/testing-strategy.md
  - **Files**: `tests/routes/members.test.ts`, `tests/routes/campaigns.test.ts`, `tests/routes/reports.test.ts`, `tests/routes/admin.test.ts`

---

## Phase 6: Validation — Integration (Dev C) — Wave 3

- [ ] 27. Integration test: full transaction replay
  - Load transactions.csv, group by transactionId
  - Process 40 sales via POST /api/earn
  - Process 3 refunds via POST /api/refund
  - Assert final balances: M1001=383, M1002=254, M1003=374, M1004=156, M1005=567, M1006=452, M1007=624, M1008=78
  - **Ref**: US-006, design/testing-strategy.md
  - **Files**: `tests/integration/replay.test.ts`

- [ ] 28. Verify per-transaction points against expected-points.csv
  - After each earn, compare pointsPosted to expected-points.csv
  - On mismatch: log which transaction, expected vs actual, per-line breakdown
  - **Ref**: US-006, sample-data/expected-points.csv
  - **Files**: `tests/integration/replay.test.ts` (extend)

---

## Requirements Coverage

| Story | Tasks |
|-------|-------|
| US-001 | 10, 11 |
| US-002 | 12 |
| US-003 | 13 |
| US-004 | 14 |
| US-005 | 15, 16, 17 |
| US-006 | 27, 28 |
| US-007 | 21, 22, 23 |
| US-008 | 24, 25, 26 |
| US-009 | 26 |
| US-010 | 16, 26 |
| US-011 | 24 |
| US-012 | 25 |

## Design Coverage

| Component | Tasks |
|-----------|-------|
| React SPA | 7, 8, 9, 10, 11, 12, 13, 14 |
| Express API (extensions) | 5, 6, 16, 18, 19, 20 |
| Expiry Job | 15, 16, 17 |
| Test Suite | 1, 2, 3, 21–28 |

## Developer Assignment

| Dev | Wave | Tasks | Effort |
|-----|------|-------|--------|
| Dev B | 1 | 1–6 (Foundation) | ~3–4 hours |
| Dev A | 2 | 7–14 (CS UI) | ~6–8 hours |
| Dev B | 2 | 15–20 (Expiry + Ops) | ~4–5 hours |
| Dev C | 3 | 21–28 (All tests) | ~6–8 hours |
| BA | All | Review, acceptance testing | Ongoing |

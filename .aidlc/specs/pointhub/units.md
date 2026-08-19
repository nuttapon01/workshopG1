# Units of Work

## Summary
- **Units**: 4 units — Customer-Service UI (Dev A), Expiry + Foundation (Dev B), Validation & Testing (Dev C), QA Testing (Test1)
- **Strategy**: Layer-Based (frontend, backend jobs, tests — within a monolith)
- **Architecture**: Modular Monolith (logical units in single codebase, shared DB)
- **Story Distribution**: CS UI: 4 stories, Expiry+Foundation: 2 stories + infra, Validation: 6 stories, QA: 52 test cases
- **Key Dependencies**: None blocking — all 3 dev units can start in parallel; Test1 starts testing as each dev delivers
- **Development Sequence**: All parallel (Phase 1) → Integration verification (Phase 2) → QA sign-off (Phase 3)
- **Team**: Dev A (CS UI), Dev B (Expiry + Foundation), Dev C (Validation), Test1 (QA), BA (cross-unit review + test scenarios)

## Overview
Feature decomposed into 4 units — one per developer + one for QA tester. The existing backend API is stable and complete, so all dev units can start simultaneously without blocking dependencies. Test1 begins testing incrementally as each dev delivers.

**Strategy**: Layer-Based
**Rationale**: Remaining work divides cleanly by technical layer: UI (frontend), background job + test infra (backend), and test suite (quality). Each developer owns a complete vertical slice.

---

## Unit 1: Customer-Service UI (Dev A)

**Purpose**: Build the single-page customer-service agent screen for member lookup, history viewing, and manual adjustments
**Owner**: Dev A
**Priority**: High
**Complexity**: Medium
**Stories**: 4 stories — US-001, US-002, US-003, US-004

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| LookupMember | Enter member ID, fetch balance + tier | CS Agent |
| ViewHistory | Display paginated transaction history with campaign attribution | CS Agent |
| MakeAdjustment | Submit points add/deduct with reason code | CS Agent |

### Domain Model
**Aggregates**: N/A (UI layer — consumes existing API)
**Entities**: Member (read), LedgerEntry (read), Adjustment (write)
**Value Objects**: ReasonCode (GOODWILL, SYSTEM_ERROR, FRAUD_DEDUCT, EVENT_BONUS)

### Scope
- React or Vue SPA with build step (output to `pointhub/public/`)
- Member lookup page: balance, tier, joined date
- Transaction history with per-line campaign attribution
- Manual adjustment form with reason code dropdown
- All assets bundled locally (no CDN, no external requests at runtime)
- Responsive layout for desktop (agents use laptops)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| Members API (existing) | API | GET /api/members/:id, GET /api/members/:id/balance, GET /api/members/:id/history |
| Adjustments API (existing) | API | POST /api/adjustments |

### Parallel Note
Can start immediately — all required API endpoints already exist and are stable.

---

## Unit 2: Expiry + Foundation (Dev B)

**Purpose**: Implement point-expiry job + endpoint, set up test framework and shared test utilities for the whole team
**Owner**: Dev B
**Priority**: High
**Complexity**: Low–Medium
**Stories**: 2 stories — US-005, US-010 (+ infrastructure: test framework setup)

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| RunExpiry | Execute point expiry for all eligible earned months | System (cron via API) |
| GetLiabilityReport | Get current liability with expiry projections | Finance (API) |

### Domain Model
**Aggregates**: PointsLedger (append-only)
**Entities**: LedgerEntry (EXPIRY type)
**Value Objects**: EarnedMonth, ExpiryWindow (12 months from earned month)

### Scope — Expiry
- Expiry logic: find earned_month + 12 months < current Bangkok month, post negative EXPIRY entries
- Expose as `POST /api/admin/run-expiry` endpoint (triggerable by OS cron)
- Idempotent: don't double-expire already-expired months
- Update liability report to reflect expiry data accurately

### Scope — Foundation (shared infra)
- Install and configure Vitest (or Jest) as test framework
- Create shared test utilities: DB setup/teardown, test API client, seed helpers
- npm scripts: `test`, `test:unit`, `test:integration`
- Test database management (setup/migrate/seed/teardown per test suite)

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| Points Ledger (existing DB) | Data | Reads/writes points_ledger table |
| Reports route (existing) | API | Validates liability report reflects expiry |

### Parallel Note
Can start immediately — points_ledger table and reports endpoint already exist. Foundation work (test setup) should be merged first so Dev A and Dev C can use shared test utilities.

---

## Unit 3: Validation & Testing (Dev C)

**Purpose**: Comprehensive test suite validating the calculation engine, all API endpoints, and end-to-end transaction replay
**Owner**: Dev C
**Priority**: Medium
**Complexity**: Medium
**Stories**: 6 stories — US-006, US-007, US-008, US-009, US-011, US-012

### Commands
| Command | Description | Actor |
|---------|-------------|-------|
| RunUnitTests | Execute engine calculation tests | Developer |
| RunRouteTests | Execute per-endpoint API tests | Developer |
| RunReplayTest | Replay transactions.csv and verify balances | Developer |

### Domain Model
**Aggregates**: N/A (test layer — validates existing domain)
**Entities**: TestFixtures (campaigns, members, transactions)
**Value Objects**: ExpectedBalance, ExpectedPoints

### Scope
- Unit tests for `calculateBasketPoints`, `calculateLineMilliPoints`, `getBangkokDayOfWeek`
- Unit tests for campaign matching: category filter, tier filter, day-of-week, date range, priority tie-breaking
- Route-level tests for every endpoint: earn, refund, burn, members, campaigns, adjustments, reports
- Idempotency tests: duplicate transactionId returns same result
- Burn validation tests: minimum 100, multiples of 100, 50% cap, insufficient balance
- Integration replay test: process all 43 transactions, verify 8 member final balances match expected

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| Foundation (Dev B) | Data | Uses test framework and shared utilities once available |
| All API routes (existing) | API | Tests call every endpoint |
| Calculation Engine (existing) | API | Unit tests import calculateBasketPoints directly |
| sample-data/ | Data | transactions.csv, expected-points.csv for replay verification |

### Parallel Note
Can start immediately — write tests against existing code. Uses test framework from Dev B (coordinate on Vitest config early). Can use temporary inline test setup if foundation isn't merged yet.

---

## BA Role (Cross-Unit)

**Owner**: BA
**Responsibilities**:
- Review requirements with CS team (validate UI wireframe for US-001–004)
- Prepare detailed test scenarios for Dev C (edge cases from campaign-examples.md)
- Verify expected-points.csv coverage against stakeholder rules
- Acceptance testing across all units as they complete
- Document any decisions/clarifications in team-log.md

---

## Context Map

| Upstream | Downstream | Pattern |
|----------|------------|---------|
| Existing API (routes) | Unit 1: CS UI | Customer/Supplier (UI consumes API) |
| Points Ledger (DB) | Unit 2: Expiry | Shared Kernel (direct DB access) |
| Existing API (routes) | Unit 3: Validation | Customer/Supplier (tests validate API) |
| Unit 2: Foundation setup | Unit 1 & 3 | Shared Kernel (test utilities) |

---

## Development Sequence

### Phase 1: All Parallel (Day 1–2)
- [ ] Unit 1: CS UI (Dev A) — React/Vue SPA, all 4 CS stories
- [ ] Unit 2: Expiry + Foundation (Dev B) — Test framework first, then expiry job
- [ ] Unit 3: Validation & Testing (Dev C) — Start writing tests immediately

### Phase 2: Integration (Day 2–3)
- [ ] Cross-unit integration verification
- [ ] BA acceptance testing
- [ ] Final replay verification (all balances match)

### Phase 3: QA Sign-off (Day 2–3)
- [ ] Test1: Section A (Dev B deliverables) — available once Dev B merges Wave 1+2
- [ ] Test1: Section B (Dev A deliverables) — available once Dev A merges Wave 2
- [ ] Test1: Section C (Dev C deliverables) — available once Dev C merges Wave 3
- [ ] Test1: Section D (Cross-unit integration) — available after all devs merge
- [ ] Test1: Section E (Non-functional) — final verification
- [ ] Sign-off: All 52 test cases passed

### Coordination Points
- **Day 1 morning**: Dev B shares Vitest config + DB helpers → Dev A & C pull
- **Day 1 end**: Dev A demo UI wireframe to BA for feedback
- **Day 1 end**: Test1 begins Section A testing (Dev B foundation ready)
- **Day 2**: Dev C runs full replay → validates Dev B's expiry against liability report
- **Day 2**: Test1 begins Section B testing (Dev A UI ready)
- **Day 2–3**: Test1 runs Section D + E (all merged)

---

## Unit 4: QA Testing (Test1)

**Purpose**: Independent QA verification of all deliverables from Dev A, Dev B, and Dev C. Execute 52 manual/automated test cases covering functional, integration, and non-functional requirements.
**Owner**: Test1 (QA Tester)
**Priority**: High
**Complexity**: Medium
**Stories**: Validates all 12 stories (US-001 through US-012)

### Responsibilities
- Execute test plan (`test-plan-test1.md`) — 52 test cases across 5 sections
- Verify Dev B: Foundation (Jest, ESLint), Expiry job, Operations (logging, health, metrics, shutdown)
- Verify Dev A: CS UI (member lookup, history, adjustments, offline compliance)
- Verify Dev C: Unit tests pass, route tests pass, integration replay matches expected balances
- Cross-unit integration: end-to-end scenarios, idempotency, campaign scenarios, burn rules
- Non-functional: latency, concurrency, data integrity, reproducibility
- Log defects with severity, assign back to responsible dev
- Re-test after fixes
- Sign-off when all 52 tests pass

### Test Sections

| Section | Tests | Tests For | Can Start When |
|---------|-------|-----------|----------------|
| A: Foundation + Expiry + Ops | 14 | Dev B | Dev B merges Wave 1+2 |
| B: CS UI | 15 | Dev A | Dev A merges Wave 2 |
| C: Test Suite Verification | 6 | Dev C | Dev C merges Wave 3 |
| D: Cross-Unit Integration | 13 | All devs | All merged |
| E: Non-Functional | 4 | All | All merged |

### Dependencies
| Depends On | Type | Description |
|------------|------|-------------|
| Dev B (Wave 1+2) | Deliverable | Foundation + Expiry must be merged for Section A |
| Dev A (Wave 2) | Deliverable | CS UI must be built and served for Section B |
| Dev C (Wave 3) | Deliverable | Test suite must be complete for Section C |
| All devs merged | Integration | Cross-unit tests require full system |

### Deliverables
- Completed `test-plan-test1.md` with all Pass/Fail columns filled
- Defect log with all issues found and their resolution status
- Sign-off sheet with all roles signed

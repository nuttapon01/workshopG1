# Context Assessment

## Summary
- **Type**: Brownfield
- **Scope**: feature
- **Stack**: TypeScript / Express / PostgreSQL 15
- **Architecture**: Layered monolith (routes → engine → DB pool)
- **Feature**: Complete the PointHub loyalty service — the backend API exists; the customer-service UI and point-expiry job are missing
- **Impact**: Extends existing
- **Complexity**: Medium — 7 stories, 2 domains (points engine, CS UI), 5 user types
- **Recommendations**: Personas No, Units No, NFR Yes

## Project Overview
- **Type**: Brownfield (partial implementation exists)
- **Assessment Date**: 2026-08-19T13:22:00+07:00

## Technology Stack
- **Languages**: TypeScript (strict mode, ES2022 target)
- **Frameworks**: Express 4.18
- **Build System**: tsc (TypeScript compiler), tsx for dev watch
- **Testing**: None configured yet
- **Infrastructure**: Local PostgreSQL 15 via Docker Compose; no cloud deployment

## Patterns & Conventions

- **Architecture pattern**: Flat layered — `routes/` handlers call `engine/` and `db/pool` directly; no service/repository abstraction
- **Data access**: Raw `pg` Pool with parameterized queries (no ORM — prohibited)
- **API response format**: Direct JSON; no envelope wrapper
- **Error handling**: try/catch in each route, returns `{ error, detail? }`
- **Authentication**: Trusted headers (`x-member-id`, `x-system-id`) — API Gateway validates upstream
- **Validation**: Inline checks in route handlers (no schema library)
- **Logging**: `console.log` / `console.error` only
- **Integer arithmetic**: milli-points (×1000) for exact calculation; multipliers stored as millipercent (×1000); avoids floating point per platform mandate
- **Idempotency**: Earn and Refund endpoints check for duplicate `transactionId` before processing

## Codebase Analysis

**Entry Points**:

| Entry Point | Type | Description |
|-------------|------|-------------|
| src/index.ts | Express API server | Mounts 7 route files, serves static `public/` dir, health endpoint |
| src/db/migrate.ts | CLI script | Creates tables (members, campaigns, transactions, transaction_lines, points_ledger) |
| src/db/seed.ts | CLI script | Seeds 8 members + 5 campaigns from stakeholder specs |
| src/scripts/replay.ts | CLI script | Replays sample-data/transactions.csv through the API, verifies balances |

**Module Dependencies**:
```
index.ts
 ├── routes/earn.ts ──────► engine/calculate-points.ts ──► db/pool.ts
 ├── routes/refund.ts ────► engine/calculate-points.ts ──► db/pool.ts
 ├── routes/burn.ts ──────► db/pool.ts
 ├── routes/members.ts ───► db/pool.ts
 ├── routes/campaigns.ts ─► db/pool.ts
 ├── routes/adjustments.ts► db/pool.ts
 └── routes/reports.ts ───► db/pool.ts
```

**Key Abstractions**:

| Abstraction | Location | Purpose |
|-------------|----------|---------|
| TransactionLine | engine/calculate-points.ts | Line item input for points calc |
| LineResult | engine/calculate-points.ts | Per-line output with winning campaign |
| calculateBasketPoints | engine/calculate-points.ts | Core earn calculation (campaign match + milli-point math) |
| calculateLineMilliPoints | engine/calculate-points.ts | Single-line integer arithmetic |

**Data Flow**:
```
POS → POST /api/earn → earnRouter
  → idempotency check (transactions table)
  → calculateBasketPoints (fetches campaigns, resolves best-multiplier per line, sums milli-points, floor-divides to posted points)
  → DB transaction: insert transactions + transaction_lines + points_ledger
  → response { pointsPosted, lineResults }
```

**Integration Points**:
- Member DB stub: seeded from `sample-data/members.csv` (8 members)
- POS: calls `/api/earn` synchronously; retries idempotently
- POS refunds: calls `/api/refund` with negative line amounts + `originalTransactionId`
- Finance: `GET /api/reports/liability`

## Feature Impact

**Affected Areas**: Extends existing — adds UI layer and background job to a working API

| Area | Impact | Reason |
|------|--------|--------|
| public/ (new) | New | Customer-service single-page UI served by Express |
| Point expiry job | New | Nightly job to expire points 12 months after earned month |
| routes/members.ts | Minor extend | UI may need additional query params |
| package.json | Extend | May add devDependencies if a build step is chosen for UI |

## Recommendations

- Story Count: Medium (5–8 stories: UI, expiry, testing, integration validation)
- Domain Boundaries: Points Engine (existing), Customer Service UI (new), Scheduler (new)
- User Types: POS system, Mobile app, Marketing (API), Customer Service agents (UI), Finance (report)
- Integration Points: Member DB stub, POS earn/refund, ledger
- **Personas**: No — user types are well-documented in vision doc; no ambiguity
- **Units**: No — scope is small enough (one UI + one job + testing) for a single pass
- **NFR**: Yes — p95 latency target (150 ms @ 50 tx/sec), reproducibility requirement, offline browser constraint

## Scope

- **Detected scope**: feature
- **Rationale**: This is a brownfield project with a functioning backend. The user wants to complete the service by implementing the missing customer-service UI and point-expiry job, then validate correctness against the expected-points answer key. This is adding new capability to existing code.
- **Phases skipped**: None — full workflow

## Recommended Workflow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────┐     ┌───────────┐     ┌─────────────┐     ┌────────────────┐
│   Context   │────►│  Requirements    │────►│  Design │────►│   Tasks   │────►│  Implement  │────►│ Build & Test   │
│  (current)  │     │  (user stories)  │     │  (D3)   │     │  (waves)  │     │  (code)     │     │ (verify)       │
└─────────────┘     └──────────────────┘     └─────────┘     └───────────┘     └─────────────┘     └────────────────┘
```

## External References

| Source | Type | What was used |
|--------|------|---------------|
| vision-document.md | Product vision | Features, scope, success metrics, open questions |
| technical-environment.md | Platform constraints | Stack mandates, prohibitions, integration contracts |
| stakeholder-notes.md | Business rules | Campaign stacking (best-wins), rounding (floor per basket), tie-breaking, refund semantics |
| sample-data/campaign-examples.md | Test scenarios | 5 campaigns, overlap questions, floating-point reconciliation |

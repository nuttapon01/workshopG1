# Components

## Overview

PointHub is a layered monolith with 4 main components: an Express API server (existing), a React SPA frontend (new), a point-expiry job (new), and a test suite (new). All share the same PostgreSQL database.

```
┌─────────────────────────────────────────────────────────┐
│                    CS Agent Browser                       │
│              React SPA (Ant Design + Webpack)             │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP (fetch /api/*)
┌────────────────────────▼────────────────────────────────┐
│                   Express API Server                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ earn.ts  │ │ burn.ts  │ │members.ts│ │ admin.ts │   │
│  │refund.ts │ │campaigns │ │adjust.ts │ │(expiry)  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       └─────────────┴────────────┴────────────┘          │
│                      │ Zod validation                     │
│              ┌───────▼────────┐                           │
│              │ engine/        │                           │
│              │ calculate-pts  │                           │
│              └───────┬────────┘                           │
└──────────────────────┼──────────────────────────────────┘
                       │ pg Pool (raw SQL)
┌──────────────────────▼──────────────────────────────────┐
│                   PostgreSQL 15                           │
│  members │ campaigns │ transactions │ transaction_lines  │
│  points_ledger                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Component 1: React SPA (Customer-Service UI)

**Purpose**: Single-page application for CS agents to look up members, view history, and make adjustments
**Technology**: React, Ant Design, Webpack, TypeScript
**Owner**: Dev A (US-001, US-002, US-003, US-004)

### Responsibilities
- Member ID input and lookup (balance, tier, joined date)
- Transaction history display with campaign attribution per line
- Pagination for history
- Manual adjustment form (points, reason code dropdown, description)
- Error handling and loading states

### Exposes
- N/A (browser application — no API exposed)

### Consumes
- `GET /api/members/:id` — member info
- `GET /api/members/:id/balance` — current balance
- `GET /api/members/:id/history?limit=&offset=` — transaction history
- `POST /api/adjustments` — manual adjustment

### Internal Structure
```
pointhub/
  client/                    # React SPA source
    src/
      App.tsx                # Main app component
      components/
        MemberLookup.tsx     # ID input + search
        MemberInfo.tsx       # Balance, tier, joined date
        TransactionHistory.tsx  # History table with pagination
        AdjustmentForm.tsx   # Points +/- form with reason codes
      api/
        client.ts            # Axios instance + API functions
      types/
        index.ts             # Shared TypeScript types
    public/
      index.html             # SPA entry point
    webpack.config.js        # Bundles to ../public/
    tsconfig.json            # Frontend TS config
  public/                    # Webpack output (served by Express)
    index.html
    bundle.js
    bundle.css
```

### Key Decisions
1. **Ant Design** — full component library (Table, Form, Input, Button, message) bundled at build time; no runtime CDN
2. **Webpack** — builds to `pointhub/public/` which Express already serves via `express.static`
3. **Axios** — HTTP client for API calls (reused in tests per D3-6)
4. **No routing library** — single page, no navigation needed

### Error Handling
- API errors displayed as Ant Design `message.error()` notifications
- Network errors show "Cannot reach server" message
- 404 member → "Member not found" inline message

---

## Component 2: Express API Server (Existing + Extensions)

**Purpose**: REST API backend serving all business logic endpoints
**Technology**: Express 4.18, TypeScript, pg, Zod (new)
**Owner**: Existing (Dev B extends with admin route, Dev C tests)

### Responsibilities
- Earn, refund, burn, members, campaigns, adjustments, reports (existing)
- Admin endpoints: `POST /api/admin/run-expiry` (new)
- Input validation via Zod schemas (new — migrate incrementally)
- Structured logging with pino (new)
- Metrics endpoint (new)
- Health + readiness + graceful shutdown (extend existing)

### Exposes
- REST API at `http://localhost:3000/api/*`
- Static files at `http://localhost:3000/` (React SPA)
- Health: `GET /api/health`
- Readiness: `GET /api/ready` (new)
- Metrics: `GET /api/metrics` (new)

### Consumes
- PostgreSQL 15 via `pg` Pool
- Engine: `calculateBasketPoints()` for earn/refund

### Internal Structure (additions to existing)
```
pointhub/src/
  routes/
    admin.ts               # NEW: expiry endpoint
  middleware/
    request-logger.ts      # NEW: pino structured logging
    error-handler.ts       # NEW: centralized error middleware
  schemas/
    earn.schema.ts         # NEW: Zod schemas (optional migration)
  jobs/
    expire-points.ts       # NEW: expiry logic (shared with script)
  scripts/
    run-expiry.ts          # NEW: standalone script wrapper
```

### Key Decisions
1. **Zod validation** — add to new routes first; existing routes migrated in Validation unit if time allows
2. **pino** — structured JSON logging (replaces console.log)
3. **Centralized error handler** — middleware catches unhandled errors, logs structured, returns consistent format
4. **Graceful shutdown** — listens for SIGTERM, drains connections, closes pool

### Error Handling
- Zod parse errors → 400 with validation details
- Business errors → appropriate 4xx with `{ error, detail }`
- Unexpected errors → 500, logged with stack trace, generic message to client

---

## Component 3: Point Expiry Job

**Purpose**: Expires points older than 12 months (per earned_month) and exposes via API endpoint
**Technology**: TypeScript, pg, same DB pool
**Owner**: Dev B (US-005, US-010)

### Responsibilities
- Calculate which earned_months have expired (earned_month + 12 months < current Bangkok month start)
- Post EXPIRY ledger entries (negative points) for each member × earned_month
- Idempotent: skip months already expired
- Return summary (batches expired, total points)

### Exposes
- `POST /api/admin/run-expiry` — triggers expiry, returns result
- `runExpiry(): Promise<ExpiryResult>` — function for direct invocation (script + endpoint share logic)

### Consumes
- PostgreSQL points_ledger table
- Asia/Bangkok timezone for month boundary

### Internal Structure
```
pointhub/src/
  jobs/
    expire-points.ts       # Core logic: runExpiry()
  routes/
    admin.ts               # POST /api/admin/run-expiry → calls runExpiry()
  scripts/
    run-expiry.ts          # Standalone: imports runExpiry(), runs, exits
```

### Key Decisions
1. **Shared logic** — `expire-points.ts` exports `runExpiry()` used by both endpoint and script
2. **Idempotent** — uses `NOT EXISTS` subquery to skip already-expired months
3. **Bangkok timezone** — uses `AT TIME ZONE 'Asia/Bangkok'` in SQL for month boundary
4. **Batch processing** — one INSERT per member×month (not one giant batch) for auditability

### Error Handling
- DB errors → logged + returned in response/exit code
- Partial failure → transaction per member×month batch, continues on individual failures

---

## Component 4: Test Suite

**Purpose**: Comprehensive test coverage for the entire PointHub service
**Technology**: Jest, Supertest (via Axios), real PostgreSQL test DB
**Owner**: Dev C (US-006, US-007, US-008, US-009, US-011, US-012)

### Responsibilities
- Unit tests: calculation engine (campaign matching, milli-point math, rounding)
- Route tests: every API endpoint (happy path + error cases + idempotency)
- Integration test: full transaction replay against expected-points.csv
- Test DB lifecycle: create, migrate, seed, teardown

### Exposes
- N/A (test infrastructure only)

### Consumes
- All API endpoints (via Axios against running test server)
- Calculation engine directly (unit tests import functions)
- PostgreSQL test database
- sample-data/*.csv for replay

### Internal Structure
```
pointhub/
  tests/
    setup/
      global-setup.ts      # Create test DB, run migrations
      global-teardown.ts   # Drop test DB
      test-helpers.ts      # Seed, API client, assertions
    unit/
      calculate-points.test.ts
      campaign-matching.test.ts
    routes/
      earn.test.ts
      refund.test.ts
      burn.test.ts
      members.test.ts
      campaigns.test.ts
      adjustments.test.ts
      reports.test.ts
      admin.test.ts
    integration/
      replay.test.ts       # Full replay of transactions.csv
    jest.config.ts
```

### Key Decisions
1. **Real test DB** — not mocks; catches SQL issues, runs migrations same as prod
2. **Axios client** — tests run against actual Express server (matches D3-6 choice)
3. **Per-suite seed** — each test file seeds only what it needs, tears down after
4. **Replay as test** — loads transactions.csv, processes sequentially, asserts final balances

### Error Handling
- Test failures produce clear assertion messages with expected vs actual
- DB connection errors in setup → skip test suite with clear message

---

## Interactions

### Data Flow: CS Agent Lookup
```
Agent → React SPA → GET /api/members/:id/balance → Express → SELECT SUM(points) FROM points_ledger → Response
Agent → React SPA → GET /api/members/:id/history → Express → SELECT from ledger+transactions → Response with line details
```

### Data Flow: Point Expiry
```
Cron → POST /api/admin/run-expiry → Express → admin.ts → runExpiry() → INSERT INTO points_ledger (EXPIRY entries) → Response {count, total}
```

### Data Flow: Test Replay
```
Jest → replay.test.ts → Axios POST /api/earn (×40) → Express → calculateBasketPoints → DB
Jest → Axios POST /api/refund (×3) → Express → recompute + clawback → DB
Jest → GET /api/members/:id/balance (×8) → Assert against expected balances
```

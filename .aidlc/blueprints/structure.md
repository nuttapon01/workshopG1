# Structure

## Summary
Single-repo Node.js project at `pointhub/`. Source in `src/` with routes, engine, db, and scripts subdirectories. Entry point: `src/index.ts` (Express server).

## Repository

- **Type**: Single repo (monorepo-like workspace with `pointhub/` as the service and `sample-data/`, `local-environment/` alongside)
- **Root**: `d:\Workshop\group1-retail\`

## Key Directories

| Directory | Purpose | Key Contents |
|-----------|---------|--------------|
| `pointhub/` | Main service | package.json, tsconfig.json, src/ |
| `pointhub/src/` | Source root | index.ts (entry), routes/, engine/, db/, scripts/ |
| `pointhub/src/routes/` | API route handlers | earn.ts, refund.ts, burn.ts, members.ts, campaigns.ts, adjustments.ts, reports.ts |
| `pointhub/src/engine/` | Business logic | calculate-points.ts (core earn calculation) |
| `pointhub/src/db/` | Database layer | pool.ts (pg Pool), migrate.ts, seed.ts |
| `pointhub/src/scripts/` | CLI utilities | replay.ts (transaction replay + balance verification) |
| `pointhub/public/` | Static CS UI (NOT YET CREATED) | Will serve customer-service browser UI |
| `sample-data/` | Test/validation data | transactions.csv, expected-points.csv, members.csv, campaign-examples.md |
| `local-environment/` | Docker dev env | docker-compose.yml (PostgreSQL 15) |

## Key Files

| File | Purpose | Notes |
|------|---------|-------|
| `pointhub/package.json` | Dependencies & scripts | build, start, dev, migrate, seed, replay |
| `pointhub/tsconfig.json` | TS config | strict, ES2022, commonjs output |
| `local-environment/docker-compose.yml` | Local PostgreSQL | Port 5432, user/pass: pointhub/pointhub |
| `sample-data/expected-points.csv` | Ground truth | Points the earn API must produce for all 43 transactions |
| `sample-data/check-points.mjs` | Verification tool | Diffs posted points against expected |
| `vision-document.md` | Product scope | MVP features, out-of-scope, success metrics |
| `technical-environment.md` | Platform mandates | Stack, prohibitions, integration contracts |
| `stakeholder-notes.md` | Business rules | Stacking, rounding, refunds, reason codes |

## Entry Points

| Entry | Type | Description |
|-------|------|-------------|
| `src/index.ts` | Express HTTP server | Listens on PORT (default 3000), mounts routes + static |
| `src/db/migrate.ts` | CLI (tsx) | Creates DB schema |
| `src/db/seed.ts` | CLI (tsx) | Seeds members + campaigns |
| `src/scripts/replay.ts` | CLI (tsx) | Replays transactions.csv, verifies final balances |

## Module Dependencies

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

## Data Flow

```
POS/Client → Express middleware (JSON parse)
  → Route handler (validation)
    → Engine (calculateBasketPoints) [earn/refund only]
      → pg Pool query (campaigns table)
    → pg Pool transaction (insert transactions + lines + ledger)
  → JSON response
```

## Key Abstractions

| Abstraction | Location | Purpose | Used By |
|-------------|----------|---------|---------|
| TransactionLine | engine/calculate-points.ts | Input line item | earn, refund |
| LineResult | engine/calculate-points.ts | Output with campaign attribution | earn response, history |
| calculateBasketPoints | engine/calculate-points.ts | Core earn calc | earnRouter, refundRouter |
| pool | db/pool.ts | PostgreSQL connection pool | All routes |

## Test Organization

- **Location**: None (no test files exist)
- **Types present**: None
- **Utilities**: `sample-data/check-points.mjs` serves as an integration verification tool
- **Coverage**: Not measured
- **Run command**: Not configured

## Build & Deploy

- **Build output**: `dist/` (tsc compilation)
- **Container**: Not containerized (only DB is in Docker)
- **Deploy target**: Local only (workshop scope)

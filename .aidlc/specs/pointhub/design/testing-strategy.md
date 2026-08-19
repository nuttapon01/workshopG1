# Testing Strategy

## Overview

| Type | Framework | Scope | Owner |
|------|-----------|-------|-------|
| Unit | Jest | Calculation engine, campaign matching | Dev C |
| Route | Jest + Axios | All API endpoints | Dev C |
| Integration | Jest + Axios | Full transaction replay | Dev C |
| Frontend | Jest + React Testing Library | React components (optional) | Dev A |

## Test Database

- **Name**: `pointhub_test`
- **Lifecycle**: Created in global-setup, dropped in global-teardown
- **Migration**: Same `migrate.ts` script against test DB
- **Seed**: Test-specific seed per test file (not shared seed — avoids test coupling)

## Unit Tests (tests/unit/)

### calculate-points.test.ts
| Test Case | Input | Expected |
|-----------|-------|----------|
| Base rate calculation | 100 THB, multiplier 1000 | 4000 milli-points |
| x3 multiplier | 250 THB, multiplier 3000 | 30000 milli-points |
| x2.5 multiplier (integer proof) | 47 THB, multiplier 2500 | 4700 milli-points |
| Zero amount | 0 THB, any multiplier | 0 milli-points |
| Large amount | 9999 THB, multiplier 5000 | 1999800 milli-points |

### campaign-matching.test.ts
| Test Case | Scenario | Expected Winner |
|-----------|----------|-----------------|
| No campaigns active | SILVER, ELECTRONICS, weekday | BASE (1000) |
| Single category match | FRESH, Saturday, C1 active | C1 (3000) |
| Tier filter excludes | SILVER member, C2 (GOLD only) | BASE (1000) |
| Day-of-week filter | FRESH on Wednesday, C1 (Sat-Sun) | BASE (1000) |
| Date range filter | Date before C1 start | BASE (1000) |
| Best-wins (C4 > C1) | FRESH, Saturday 27 Sep | C4 (5000) |
| Tie-break by priority | GOLD + HOME on Sep 12, C2=C5 both x2 | C2 (priority 20 > 15) |
| Tie-break by ID | Same priority, same multiplier | Alphabetically first campaign_id |
| Basket floor rounding | Sum 17600 milli-points | 17 points (not 18) |

## Route Tests (tests/routes/)

### Per-endpoint coverage

| Endpoint | Happy Path | Error Cases | Idempotency |
|----------|-----------|-------------|-------------|
| POST /api/earn | Valid sale → points posted | Missing fields → 400 | Duplicate txId → same result |
| POST /api/refund | Full refund → clawback | Missing original → 404 | Duplicate → same result |
| POST /api/burn | Valid burn → discount | < 100 pts, not ×100, > 50% | — |
| GET /api/members/:id | Found → member info | Not found → 404 | — |
| GET /api/members/:id/balance | Sum of ledger | — | — |
| GET /api/members/:id/history | Paginated entries | — | — |
| POST /api/adjustments | Valid → new balance | Invalid reason → 400 | — |
| GET /api/campaigns | All or active only | — | — |
| POST /api/campaigns | Create → 201 | Duplicate → 409 | — |
| PATCH /api/campaigns/:id/activate | Active → true | Not found → 404 | — |
| POST /api/admin/run-expiry | Expire → count | — | Idempotent (re-run safe) |
| GET /api/reports/liability | Summary JSON | — | — |

## Integration Test (tests/integration/)

### replay.test.ts
1. Seed: 8 members + 5 campaigns (same as `seed.ts`)
2. Read `sample-data/transactions.csv`
3. Group by transactionId
4. Process sales (×40) via POST /api/earn — verify each response
5. Process refunds (×3) via POST /api/refund
6. Assert final balances:
   - M1001=383, M1002=254, M1003=374, M1004=156
   - M1005=567, M1006=452, M1007=624, M1008=78
7. Optional: compare per-transaction output against `expected-points.csv`

## Test Infrastructure

### global-setup.ts
```typescript
// 1. Create pointhub_test database
// 2. Run migrations against it
// 3. Export test DB connection string
```

### global-teardown.ts
```typescript
// 1. Close all connections
// 2. Drop pointhub_test database
```

### test-helpers.ts
```typescript
// - seedMembers(): insert 8 members
// - seedCampaigns(): insert 5 campaigns
// - clearLedger(): truncate points_ledger + transactions + transaction_lines
// - getBalance(memberId): quick balance lookup
// - apiClient: pre-configured Axios instance pointing to test server
```

## npm Scripts

```json
{
  "test": "jest --runInBand",
  "test:unit": "jest --testPathPattern=tests/unit",
  "test:routes": "jest --testPathPattern=tests/routes --runInBand",
  "test:integration": "jest --testPathPattern=tests/integration --runInBand"
}
```

Note: `--runInBand` for route/integration tests (shared DB, sequential execution).

# Test Plan — Test1 (QA Tester)

## Role: Test1
**หน้าที่**: ทดสอบผลงานของ Dev A, Dev B, Dev C ทั้งหมด ก่อน merge เข้า main
**เป้าหมาย**: ยืนยันว่าทุก feature ทำงานถูกต้อง, ไม่มี bug, ผ่าน acceptance criteria ทุกข้อ

---

## Prerequisites (สิ่งที่ต้องมีก่อนเริ่มทดสอบ)

```bash
# 1. Start PostgreSQL
cd local-environment && docker compose up -d

# 2. Install dependencies
cd ../pointhub && npm install

# 3. Run migrations + seed
npm run migrate && npm run seed

# 4. Build frontend
cd client && npm install && npm run build && cd ..

# 5. Start server
npm run dev
# Server should be running at http://localhost:3000
```

---

## Section A: ทดสอบงาน Dev B — Foundation + Expiry + Operations

### A1: Test Framework (ตรวจว่า Jest ใช้งานได้)

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| A1.1 | Jest runs | `npm test` | Tests execute without config error | ☐ |
| A1.2 | Test DB created | Check during test run | `pointhub_test` DB created and dropped automatically | ☐ |
| A1.3 | npm scripts exist | `npm run test:unit`, `test:routes`, `test:integration` | All scripts defined and runnable | ☐ |

### A2: ESLint + Prettier (ตรวจ linting)

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| A2.1 | Lint runs | `npm run lint` | No fatal errors (warnings OK) | ☐ |
| A2.2 | Format check | `npm run format -- --check` | Files are formatted consistently | ☐ |

### A3: Structured Logging (pino)

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| A3.1 | JSON log on request | `curl http://localhost:3000/api/health` | Server logs JSON with `level`, `time`, `msg`, `reqId` | ☐ |
| A3.2 | Error logged | Send invalid JSON to `/api/earn` | Error logged with stack trace in structured format | ☐ |

### A4: Point Expiry Job

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| A4.1 | Expiry endpoint works | `curl -X POST http://localhost:3000/api/admin/run-expiry` | Returns `{ batchesExpired, totalPointsExpired, executedAt }` | ☐ |
| A4.2 | Idempotent | Run expiry twice | Second run returns 0 batches expired (no double-expire) | ☐ |
| A4.3 | Standalone script | `npm run expiry` | Script executes, prints result, exits cleanly | ☐ |
| A4.4 | Only expired months | Seed points with recent earned_month | Recent points NOT expired (< 12 months) | ☐ |

### A5: Health & Lifecycle

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| A5.1 | Health endpoint | `GET /api/health` | `{ "status": "ok", "service": "pointhub" }` | ☐ |
| A5.2 | Readiness probe | `GET /api/ready` | `{ "status": "ready", "db": "connected" }` with 200 | ☐ |
| A5.3 | Readiness fails | Stop PostgreSQL, then `GET /api/ready` | Returns 503 `{ "status": "not_ready" }` | ☐ |
| A5.4 | Metrics endpoint | `GET /api/metrics` | Returns Prometheus format metrics | ☐ |
| A5.5 | Graceful shutdown | Send SIGTERM to server | Server stops accepting connections, drains, exits 0 | ☐ |

---

## Section B: ทดสอบงาน Dev A — Customer-Service UI

### B1: UI Loading & Offline

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| B1.1 | Page loads | Open `http://localhost:3000` in browser | CS UI renders (React app loads) | ☐ |
| B1.2 | No external requests | Open DevTools Network tab, reload page | Zero requests to external domains (no CDN, no fonts) | ☐ |
| B1.3 | Offline works | Disconnect internet, reload page | Page still loads and functions from local server | ☐ |

### B2: Member Lookup (US-001)

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| B2.1 | Valid member | Enter "M1001", submit | Shows balance, tier "GOLD", joined date | ☐ |
| B2.2 | Invalid member | Enter "M9999", submit | Shows "Member not found" message | ☐ |
| B2.3 | Empty input | Submit with empty field | Validation prevents submission or shows error | ☐ |
| B2.4 | Response time | Enter "M1001", submit | Result displays within 2 seconds | ☐ |

### B3: Transaction History (US-002)

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| B3.1 | History displays | Look up M1001, view history | Shows ledger entries with date, type, points, description | ☐ |
| B3.2 | Campaign attribution | Find an EARN entry | Expandable detail shows: category, amount, campaign name, multiplier | ☐ |
| B3.3 | Pagination | Member with 20+ entries | Pagination controls work (next/prev page) | ☐ |
| B3.4 | Entry types shown | Check various entries | Shows EARN, BURN, REFUND_CLAWBACK, ADJUSTMENT, EXPIRY correctly | ☐ |

### B4: Manual Adjustment (US-003)

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| B4.1 | Add points | M1001, +100 points, reason=GOODWILL | Success message, balance increases by 100 | ☐ |
| B4.2 | Deduct points | M1001, -50 points, reason=FRAUD_DEDUCT | Success message, balance decreases by 50 | ☐ |
| B4.3 | Invalid reason | Try submitting with non-standard reason | Error message shown | ☐ |
| B4.4 | Zero points | Submit with 0 points | Validation prevents or shows error | ☐ |
| B4.5 | Appears in history | After adjustment, check history | New entry visible immediately with reason code | ☐ |
| B4.6 | All reason codes | Check dropdown options | GOODWILL, SYSTEM_ERROR, FRAUD_DEDUCT, EVENT_BONUS all present | ☐ |

---

## Section C: ทดสอบงาน Dev C — Correctness Validation (ตรวจว่า tests ถูกต้อง)

### C1: Unit Tests Pass

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| C1.1 | Engine tests pass | `npm run test:unit` | All tests green | ☐ |
| C1.2 | Coverage areas | Check test files | Tests cover: calculateLineMilliPoints, campaign matching, basket rounding | ☐ |

### C2: Route Tests Pass

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| C2.1 | Route tests pass | `npm run test:routes` | All tests green | ☐ |
| C2.2 | Endpoints covered | Check test files | earn, refund, burn, members, campaigns, adjustments, reports, admin all tested | ☐ |
| C2.3 | Error cases tested | Check tests | 400 errors (validation), 404 errors, duplicate handling all tested | ☐ |

### C3: Integration Replay

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| C3.1 | Replay passes | `npm run test:integration` | All 43 transactions processed, all 8 balances match | ☐ |
| C3.2 | Balance verification | Check final balances | M1001=383, M1002=254, M1003=374, M1004=156, M1005=567, M1006=452, M1007=624, M1008=78 | ☐ |
| C3.3 | All test suites | `npm test` | All tests (unit + route + integration) pass together | ☐ |

---

## Section D: Cross-Unit Integration Tests (ทดสอบข้ามงาน)

### D1: End-to-End Scenarios

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| D1.1 | Earn → UI shows | POST earn via curl for M1001, then check UI history | New earn entry visible in UI with correct campaign | ☐ |
| D1.2 | Adjustment → Balance | Make adjustment via UI, then `GET /api/members/M1001/balance` | API balance matches what UI shows | ☐ |
| D1.3 | Expiry → Report | Run expiry, then `GET /api/reports/liability` | Report reflects expired points correctly | ☐ |
| D1.4 | Expiry → UI | Run expiry, check member history in UI | EXPIRY entries visible in transaction history | ☐ |
| D1.5 | Refund → Negative | Earn 50pts, burn 40pts, refund original | Balance goes negative, UI shows correctly | ☐ |

### D2: Idempotency (POS retry simulation)

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| D2.1 | Duplicate earn | POST same transactionId twice | Second returns `duplicate: true`, balance unchanged | ☐ |
| D2.2 | Duplicate refund | POST same refund transactionId twice | Second returns `duplicate: true`, no double clawback | ☐ |

### D3: Campaign Scenarios (from campaign-examples.md)

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| D3.1 | C4 beats C1 | GOLD member buys FRESH on Sat 27 Sep | Gets x5 (C4), not x3 (C1) | ☐ |
| D3.2 | C3 vs C4 | PLATINUM member during payday | Gets x5 (C4 highest), not x2.5 (C3) | ☐ |
| D3.3 | Tie-break C2 vs C5 | GOLD member buys HOME on 12 Sep | Gets C2 (priority 20 > C5 priority 15), same points | ☐ |
| D3.4 | Partial refund recompute | Refund 1 line from 3-line basket | Clawback = original - recomputed (not just line points) | ☐ |

### D4: Burn Rules

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| D4.1 | Minimum 100 | Try to burn 50 points | Rejected: "Minimum redemption is 100 points" | ☐ |
| D4.2 | Multiples of 100 | Try to burn 150 points | Rejected: "Points must be redeemed in multiples of 100" | ☐ |
| D4.3 | 50% cap | Basket 200 THB, try burn 300 pts (75 THB > 50%) | Rejected with maxRedeemable shown | ☐ |
| D4.4 | Insufficient balance | Try burn more than member has | Rejected: "Insufficient balance" | ☐ |
| D4.5 | Valid burn | 200 pts on 500 THB basket | Success: 50 THB discount, earnableAmount = 450 | ☐ |

---

## Section E: Non-Functional Tests

### E1: Performance

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| E1.1 | Earn latency | Time 10 consecutive earn requests | Average < 150ms per request | ☐ |
| E1.2 | Concurrent requests | Send 5 earn requests simultaneously | All succeed, no deadlocks, no wrong balances | ☐ |

### E2: Data Integrity

| # | Test Case | Steps | Expected Result | Pass? |
|---|-----------|-------|-----------------|-------|
| E2.1 | Replay reproducibility | Run replay twice (reset between) | Identical balances both times | ☐ |
| E2.2 | No floating point | Check all point values in DB | All values are integers (no .5, no .333) | ☐ |

---

## Test Summary Sheet

| Section | Total Tests | Passed | Failed | Blocked |
|---------|-------------|--------|--------|---------|
| A: Foundation + Expiry (Dev B) | 14 | | | |
| B: CS UI (Dev A) | 15 | | | |
| C: Test Suite (Dev C) | 6 | | | |
| D: Cross-Unit Integration | 13 | | | |
| E: Non-Functional | 4 | | | |
| **TOTAL** | **52** | | | |

---

## Defect Log

| # | Date | Section | Test Case | Description | Severity | Assigned To | Status |
|---|------|---------|-----------|-------------|----------|-------------|--------|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Test1 (QA) | | | |
| Dev A | | | |
| Dev B | | | |
| Dev C | | | |
| BA | | | |

---

## Notes
- ทดสอบ Section A, B, C ได้ทันทีเมื่อ Dev แต่ละคนส่งงาน (ไม่ต้องรอทุกคน)
- Section D ต้องรอ merge ทุกคนก่อน (cross-unit)
- ถ้า test fail → log defect → assign กลับไป Dev เจ้าของ → re-test เมื่อ fix แล้ว
- Severity: Critical (blocks other tests) / Major (feature broken) / Minor (cosmetic/edge case)

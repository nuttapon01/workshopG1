# Requirements

## Summary
- **Total Stories**: 12 across 5 functional areas
- **Priority**: 5 High, 5 Medium, 2 Low
- **User Types**: POS (system), Mobile app (system), Customer Service Agent (UI), Marketing (API), Finance (API)
- **Key Entities**: Member, Transaction, Points Ledger, Campaign, Adjustment
- **Integrations**: Member DB stub, POS earn/refund, CS UI → API
- **Core Flows**:
  - POS sends sale → earn points (existing, validate)
  - POS sends refund → clawback points (existing, validate)
  - CS agent looks up member → sees balance + history + makes adjustments (new UI)
  - System expires points monthly (new job)
  - Replay all transactions → balances match expected (new tests)

---

## Functional Area 1: Customer-Service UI

### US-001: Member Lookup
**As a** customer-service agent,
**I want** to enter a member ID and see their current balance and tier,
**So that** I can quickly verify their account status during a dispute call.

**Priority**: High
**Acceptance Criteria**:
- WHEN agent enters a valid member ID and submits, THEN the system displays current point balance, tier (SILVER/GOLD/PLATINUM), and joined date within 2 seconds.
- WHEN agent enters a non-existent member ID, THEN the system displays a clear "Member not found" message.
- The system shall serve the UI as static files from the Express server with no external network requests at runtime.

**Dependencies**: None (members API exists)
**Source**: D1-2, Vision Document (CS screen), Persona

---

### US-002: Transaction History with Campaign Attribution
**As a** customer-service agent,
**I want** to see a member's transaction history showing which campaign or rule produced each entry,
**So that** I can explain to the customer exactly why they received or lost points.

**Priority**: High
**Acceptance Criteria**:
- WHEN agent views a member's history, THEN each ledger entry shows: date, entry type (EARN/BURN/REFUND_CLAWBACK/ADJUSTMENT/EXPIRY), points, and description.
- WHEN an entry is type EARN, THEN line-level details show: category, amount, winning campaign name (or "BASE"), and multiplier.
- WHEN history has more than 20 entries, THEN pagination controls allow navigating older records.

**Dependencies**: US-001
**Source**: Vision Document, Persona, Stakeholder (Khun May)

---

### US-003: Manual Point Adjustment
**As a** customer-service agent,
**I want** to add or deduct points for a member with a reason code,
**So that** I can resolve point disputes immediately without calling IT.

**Priority**: High
**Acceptance Criteria**:
- WHEN agent submits an adjustment with valid member ID, points (non-zero integer), and reason code, THEN the system posts the adjustment to the ledger and displays the new balance.
- IF reason code is not one of GOODWILL, SYSTEM_ERROR, FRAUD_DEDUCT, EVENT_BONUS, THEN the system rejects the request with a validation error.
- WHEN adjustment is posted, THEN it appears immediately in the member's transaction history with the reason code visible.

**Dependencies**: US-001
**Source**: D1-5, Stakeholder (Khun May)

---

### US-004: UI Offline Compliance
**As a** platform team member,
**I want** the CS UI to load and function without any external network requests,
**So that** it works reliably on venue Wi-Fi that may be unreliable.

**Priority**: Medium
**Acceptance Criteria**:
- The system shall serve all HTML, CSS, JS, and assets from the Express static directory with zero requests to external CDNs, fonts, or icon services.
- WHEN the browser has no internet access but can reach the local server, THEN the UI loads and functions fully.

**Dependencies**: US-001
**Source**: Technical Environment (platform rules)

---

## Functional Area 2: Point Expiry

### US-005: Nightly Point Expiry
**As a** finance analyst,
**I want** points to automatically expire 12 months after the month they were earned,
**So that** outstanding point liability is accurately reduced per the accounting policy.

**Priority**: High
**Acceptance Criteria**:
- WHEN the expiry job runs, THEN all points with earned_month older than 12 months (relative to current Bangkok month) are expired by posting negative EXPIRY entries to the ledger.
- IF a member's earned points for a given month have already been fully expired or clawed back, THEN no additional expiry entry is created for that month.
- The system shall expose the expiry logic as an API endpoint (`POST /api/admin/run-expiry`) triggerable by OS cron.
- WHEN the expiry job completes, THEN it returns the count of expired batches and total points expired.

**Dependencies**: None (ledger table exists)
**Source**: D1-3, Vision Document, Stakeholder (Khun Nok: "12 months, end of month")

---

## Functional Area 3: Correctness Validation

### US-006: Transaction Replay Verification
**As a** finance analyst,
**I want** to replay all sample transactions and verify that final balances match the expected values,
**So that** the calculation engine is proven correct and audit-reproducible.

**Priority**: High
**Acceptance Criteria**:
- WHEN the replay script processes all 40 sales and 3 refunds from transactions.csv, THEN final member balances match: M1001=383, M1002=254, M1003=374, M1004=156, M1005=567, M1006=452, M1007=624, M1008=78.
- WHEN any balance does not match, THEN the test fails with a clear indication of which member diverged and by how much.
- The system shall produce a per-transaction points output comparable to expected-points.csv.

**Dependencies**: US-008 (campaigns seeded)
**Source**: Technical Environment (finance reproducibility), sample-data/expected-points.csv

---

### US-007: Unit Tests for Calculation Engine
**As a** developer,
**I want** unit tests covering the points calculation engine,
**So that** regressions in campaign matching, multiplier selection, or rounding are caught immediately.

**Priority**: Medium
**Acceptance Criteria**:
- WHEN tests run, THEN calculateLineMilliPoints is tested with known inputs (including edge cases: 0 THB, large amounts, x2.5 multiplier).
- WHEN tests run, THEN campaign matching is tested: category filter, tier filter, day-of-week filter, date range, priority tie-breaking.
- WHEN tests run, THEN basket-level floor rounding is verified (sum of milli-points ÷ 1000 floors correctly).

**Dependencies**: None
**Source**: D1-4

---

### US-008: Route-Level API Tests
**As a** developer,
**I want** route-level tests for each API endpoint,
**So that** I can verify request validation, idempotency, and correct responses without manual testing.

**Priority**: Medium
**Acceptance Criteria**:
- WHEN earn endpoint receives a valid transaction, THEN it returns pointsPosted, lineResults, and stores in DB.
- WHEN earn endpoint receives a duplicate transactionId, THEN it returns the existing result with `duplicate: true` (idempotency).
- WHEN burn endpoint receives points below 100 or not a multiple of 100, THEN it returns 400 with appropriate error.
- WHEN refund endpoint processes a partial refund, THEN it recomputes the basket and claws back the correct difference.

**Dependencies**: US-007
**Source**: D1-4

---

## Functional Area 4: Campaign Management (Existing — Validate)

### US-009: Campaign CRUD via API
**As a** marketing team member,
**I want** to create, list, activate, and deactivate campaigns via the API,
**So that** I can launch promotions without an IT change request.

**Priority**: Medium
**Acceptance Criteria**:
- WHEN a campaign is created with valid fields (campaignId, name, multiplier, optional: category, tier, dayOfWeek, startDate, endDate, priority), THEN it appears in the campaign list as active.
- WHEN a campaign is deactivated, THEN it no longer affects earn calculations for new transactions.
- IF a duplicate campaignId is submitted, THEN the system returns 409 Conflict.

**Dependencies**: None (exists — validate via tests)
**Source**: Vision Document

---

## Functional Area 5: Reporting

### US-010: Point Liability Report
**As a** finance analyst,
**I want** an API endpoint that returns total outstanding points, breakdown by tier, and points expiring in the next 1/2/3 months,
**So that** I can prepare monthly liability reports.

**Priority**: Medium
**Acceptance Criteria**:
- WHEN the liability endpoint is called, THEN it returns: totalOutstandingPoints, byTier (array with tier, totalPoints, memberCount), and expiring (next1Month, next2Months, next3Months).
- The system shall calculate expiry windows relative to the current month in Asia/Bangkok timezone.

**Dependencies**: US-005 (expiry job should have run for accurate expiring figures)
**Source**: Stakeholder (Khun Tan), Vision Document

---

### US-011: Earn/Burn Idempotency
**As a** POS system,
**I want** earn and refund requests to be idempotent,
**So that** retry-after-timeout does not double-post points.

**Priority**: Medium
**Acceptance Criteria**:
- WHEN an earn request with a previously-processed transactionId is received, THEN the system returns the original result with `duplicate: true` and does NOT post additional points.
- WHEN a refund request with a previously-processed transactionId is received, THEN the system returns the original clawback result with `duplicate: true`.

**Dependencies**: None (exists — validate via tests)
**Source**: Technical Environment (POS retries), Stakeholder (Khun Beer)

---

### US-012: Burn Validation Rules
**As a** POS system,
**I want** burn (redemption) to enforce minimum 100 pts, multiples of 100, and 50% basket cap,
**So that** the redemption stays within the financial provision model.

**Priority**: Low
**Acceptance Criteria**:
- IF points < 100, THEN the system returns 400 error "Minimum redemption is 100 points".
- IF points is not a multiple of 100, THEN the system returns 400 error.
- IF points value in THB (points × 0.25) exceeds 50% of basketTotalTHB, THEN the system returns 400 with maxRedeemable.
- IF member balance < requested points, THEN the system returns 400 "Insufficient balance".

**Dependencies**: None (exists — validate via tests)
**Source**: Stakeholder (Khun Tan), Vision Document

---

## Story Summary

| ID | Title | Area | Priority | Dependencies |
|----|-------|------|----------|--------------|
| US-001 | Member Lookup | CS UI | High | — |
| US-002 | Transaction History with Attribution | CS UI | High | US-001 |
| US-003 | Manual Point Adjustment | CS UI | High | US-001 |
| US-004 | UI Offline Compliance | CS UI | Medium | US-001 |
| US-005 | Nightly Point Expiry | Expiry | High | — |
| US-006 | Transaction Replay Verification | Validation | High | US-008 |
| US-007 | Unit Tests for Calculation Engine | Validation | Medium | — |
| US-008 | Route-Level API Tests | Validation | Medium | US-007 |
| US-009 | Campaign CRUD via API | Campaigns | Medium | — |
| US-010 | Point Liability Report | Reporting | Medium | US-005 |
| US-011 | Earn/Burn Idempotency | Validation | Medium | — |
| US-012 | Burn Validation Rules | Validation | Low | — |

## Story–Persona Matrix

| Story | Khun Nee (CS Agent) |
|-------|---------------------|
| US-001 | Primary |
| US-002 | Primary |
| US-003 | Primary |
| US-004 | Secondary |
| US-005 | — |
| US-006 | — |
| US-007 | — |
| US-008 | — |
| US-009 | — |
| US-010 | — |
| US-011 | — |
| US-012 | — |

## Non-Functional Notes

- **Performance**: Earn API p95 < 150 ms at 50 tx/sec (see Technical Environment)
- **Reproducibility**: Replay of all transactions must produce identical balances (integer arithmetic, deterministic tie-breaking)
- **Offline UI**: CS screen must work without internet (no CDN, no external fonts/icons)
- **Idempotency**: Earn and refund must be safe to retry (POS timeout behavior)

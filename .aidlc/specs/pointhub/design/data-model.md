# Data Model

## Overview
- **Database**: PostgreSQL 15
- **Client**: pg (raw SQL with parameterized queries — no ORM)
- **Schema status**: Already migrated (5 tables exist). Minor additions needed for expiry idempotency.

## Existing Entities (No Changes)

### members
**Purpose**: Read-only member stub (sourced from external Member DB)

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| member_id | VARCHAR(20) | PK | — |
| tier | VARCHAR(10) | Yes | CHECK IN ('SILVER', 'GOLD', 'PLATINUM') |
| joined_at | DATE | Yes | — |

### campaigns
**Purpose**: Marketing campaign earn-rule definitions

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| campaign_id | VARCHAR(20) | PK | — |
| name | VARCHAR(200) | Yes | — |
| multiplier_millipercent | INT | Yes | e.g. 2500 = x2.5 |
| category | VARCHAR(50) | No | NULL = all categories |
| tier | VARCHAR(10) | No | NULL = all tiers |
| day_of_week | INT[] | No | NULL = all days (0=Sun, 6=Sat) |
| start_date | DATE | No | NULL = no start restriction |
| end_date | DATE | No | NULL = always-on |
| is_active | BOOLEAN | Yes | Default true |
| priority | INT | Yes | Higher = wins ties. Default 0 |
| created_at | TIMESTAMPTZ | Yes | Default NOW() |

### transactions
**Purpose**: Header record for every earn/refund transaction processed

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| transaction_id | VARCHAR(30) | PK | Idempotency key |
| type | VARCHAR(10) | Yes | CHECK IN ('SALE', 'REFUND') |
| original_transaction_id | VARCHAR(30) | No | Set for REFUND |
| date | DATE | Yes | Transaction date |
| time | TIME | Yes | Transaction time |
| store_id | VARCHAR(20) | Yes | — |
| member_id | VARCHAR(20) | Yes | — |
| tier | VARCHAR(10) | Yes | Member tier at time of tx |
| total_amount_thb | INT | Yes | Negative for refunds |
| total_milli_points | INT | Yes | Default 0 |
| points_posted | INT | Yes | Default 0 (negative for refunds) |
| processed_at | TIMESTAMPTZ | Yes | Default NOW() |

### transaction_lines
**Purpose**: Per-line detail with campaign attribution

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | SERIAL | PK | — |
| transaction_id | VARCHAR(30) | Yes | FK → transactions |
| line_no | INT | Yes | UNIQUE with transaction_id |
| category | VARCHAR(50) | Yes | — |
| amount_thb | INT | Yes | Negative for refund lines |
| winning_campaign | VARCHAR(20) | No | NULL = BASE rate |
| multiplier_millipercent | INT | Yes | Default 1000 (x1) |
| milli_points | INT | Yes | Default 0 |

### points_ledger
**Purpose**: Append-only ledger of all point movements

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| id | SERIAL | PK | — |
| member_id | VARCHAR(20) | Yes | — |
| transaction_id | VARCHAR(30) | No | NULL for adjustments/expiry |
| entry_type | VARCHAR(20) | Yes | CHECK IN ('EARN', 'BURN', 'REFUND_CLAWBACK', 'ADJUSTMENT', 'EXPIRY') |
| points | INT | Yes | Positive=credit, negative=debit |
| description | TEXT | No | Human-readable explanation |
| reason_code | VARCHAR(30) | No | For ADJUSTMENT entries |
| earned_month | DATE | No | First-of-month for EARN entries (used for expiry) |
| created_at | TIMESTAMPTZ | Yes | Default NOW() |

**Indexes** (existing):
- `idx_ledger_member` ON points_ledger(member_id)
- `idx_ledger_earned_month` ON points_ledger(earned_month)
- `idx_transactions_member` ON transactions(member_id)
- `idx_transaction_lines_txid` ON transaction_lines(transaction_id)

## ER Diagram

```
┌──────────┐       ┌──────────────┐       ┌──────────────────┐
│ members  │       │  campaigns   │       │   transactions   │
│──────────│       │──────────────│       │──────────────────│
│ member_id│◄──┐   │ campaign_id  │       │ transaction_id   │
│ tier     │   │   │ name         │       │ type             │
│ joined_at│   │   │ multiplier   │       │ original_tx_id   │
└──────────┘   │   │ category     │       │ date, time       │
               │   │ tier         │       │ store_id         │
               │   │ day_of_week  │       │ member_id ───────┼──┐
               │   │ start/end    │       │ tier             │  │
               │   │ priority     │       │ total_amount     │  │
               │   │ is_active    │       │ points_posted    │  │
               │   └──────────────┘       └────────┬─────────┘  │
               │                                    │ 1:N        │
               │                          ┌────────▼─────────┐  │
               │                          │transaction_lines │  │
               │                          │──────────────────│  │
               │                          │ transaction_id   │  │
               │                          │ line_no          │  │
               │                          │ category         │  │
               │                          │ amount_thb       │  │
               │                          │ winning_campaign │  │
               │                          │ multiplier       │  │
               │                          │ milli_points     │  │
               │                          └──────────────────┘  │
               │                                                 │
               │   ┌───────────────────┐                        │
               └───┤  points_ledger    │◄───────────────────────┘
                   │───────────────────│
                   │ member_id         │
                   │ transaction_id    │
                   │ entry_type        │
                   │ points            │
                   │ description       │
                   │ reason_code       │
                   │ earned_month      │
                   │ created_at        │
                   └───────────────────┘
```

## Access Patterns

| Query | Frequency | Index Used |
|-------|-----------|------------|
| Member balance: `SUM(points) WHERE member_id = ?` | High (every lookup) | idx_ledger_member |
| Member history: `ledger JOIN transactions WHERE member_id = ? ORDER BY created_at DESC LIMIT/OFFSET` | High | idx_ledger_member |
| Idempotency: `SELECT FROM transactions WHERE transaction_id = ?` | High (every earn/refund) | PK |
| Active campaigns: `SELECT FROM campaigns WHERE is_active = true` | High (every earn) | Full scan OK (small table) |
| Expiry candidates: `SELECT FROM points_ledger WHERE earned_month + 12mo < now GROUP BY member_id, earned_month HAVING SUM(points) > 0` | Daily (nightly job) | idx_ledger_earned_month |
| Liability by tier: `SUM(points) GROUP BY tier` | Low (monthly report) | idx_ledger_member + members PK |
| Transaction lines: `SELECT FROM transaction_lines WHERE transaction_id = ?` | Medium (history, refund) | idx_transaction_lines_txid |

## Business Rules (enforced in application, not schema)

1. Earn calculation: milli-point integer arithmetic only — no floating point
2. Best-wins: per line, highest multiplier campaign wins (no stacking)
3. Rounding: floor(totalMilliPoints / 1000) once per basket
4. Idempotency: duplicate transactionId returns existing result
5. Expiry: earned_month + 12 months. Idempotent (don't re-expire)
6. Negative balance: allowed (refund clawback may exceed remaining balance)
7. Burn rules: min 100, multiples of 100, ≤50% basket value

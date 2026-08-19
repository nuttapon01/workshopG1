# Product

## Summary
PointHub is a loyalty points & rewards backend service for Siam MegaMart (120 stores, 800K members). Target users: POS systems, mobile app, marketing team, customer-service agents, finance. Scope: complete existing feature implementation (CS UI + expiry job + validation).

## Overview
PointHub centralizes earn/burn logic behind an API so campaigns can go live in one day instead of four weeks. The backend API is largely implemented; remaining work is the customer-service agent screen, the point-expiry nightly job, and full correctness validation against the expected-points answer key.

## Problem Statement
- Points logic duplicated in 3 systems (POS, e-commerce, mobile) — they disagree, causing ~400 dispute tickets/month.
- Marketing cannot run tier/category/day-of-week promotions without a 3–4 week IT change request.
- Finance has no single report of outstanding point liability.
- Customer-service agents must phone IT to settle point disputes — no self-service screen.

## Target Users

| Type | Description | Primary Need |
|------|-------------|--------------|
| POS terminals (system) | 120 stores, ~50 tx/sec peak | Fast, reliable earn calculation at checkout (< 150 ms p95) |
| Mobile app / website (system) | 800K members | Balance display, redemption, history |
| Marketing team | 6 campaign planners | Create/adjust earn campaigns without IT involvement |
| Customer service | 25 agents | Look up member, see history + reasons, make manual adjustments |
| Finance | 3 analysts | Monthly point liability & expiry reports |

## Key Features

| Area | Description |
|------|-------------|
| Earn points | Base rate 25 THB = 1 pt; campaign multipliers by category, tier, day-of-week; best-single-multiplier wins |
| Burn (redeem) | 1 pt = 0.25 THB; min 100 pts; multiples of 100; capped at 50% basket |
| Refunds | Full refund reverses original points; partial refund recomputes basket without returned lines, claws back difference; negative balance allowed |
| Member API | Balance, tier, transaction history with per-line campaign attribution |
| Campaign management | CRUD + activate/deactivate via API; start/end dates; no UI in MVP |
| Manual adjustments | Add/deduct with reason code (GOODWILL, SYSTEM_ERROR, FRAUD_DEDUCT, EVENT_BONUS); full audit trail |
| Customer-service screen | Single-page browser UI: look up member by ID, see balance + tier + history with "why", make adjustments |
| Point expiry | 12 months after month earned; nightly job |
| Liability report | Total outstanding, by tier, expiring in next 1/2/3 months |

## Domain Language

| Term | Definition | Example |
|------|------------|---------|
| Milli-point | 1/1000 of a point; used for exact integer arithmetic | 1880 milli-points = 1.88 → floors to 1 point at basket level |
| Millipercent | Multiplier × 1000; avoids floating point | x2.5 = 2500 millipercent |
| Earned month | First day of the month a transaction occurred | Transaction on 2026-09-15 → earned_month = 2026-09-01 |
| Clawback | Negative ledger entry reversing previously earned points on refund | REFUND_CLAWBACK entry type |
| Best-wins | When multiple campaigns match, the highest multiplier applies (no stacking) | GOLD member on weekend: gets x3 Fresh Weekend, not x3 × x2 |

## Success Criteria

| Metric | Target |
|--------|--------|
| Campaign go-live lead time | 4 weeks → 1 day |
| Point calculation disputes | 400/month → under 50/month |
| Earn API p95 latency | < 150 ms at 50 tx/sec |
| Balance consistency | Zero mismatch between app display and POS redemption |
| CS agent self-service | Settle disputes from own screen without calling IT |
| Finance reproducibility | Replay year's transactions → same balances exactly |

## Constraints & Assumptions

**Constraints**:
- TypeScript on Node.js 20 LTS only
- PostgreSQL 15 only datastore
- No ORMs (raw SQL with typed helpers)
- No floating-point for money/points
- CS UI served by own service, runs in browser, nothing fetched from internet at runtime
- Business timezone: Asia/Bangkok
- Idempotent earn/refund (POS may retry twice)

**Assumptions**:
- API Gateway validates auth (trust x-member-id / x-system-id headers)
- Member DB is read-only; stubbed from 8-member CSV
- No cloud deployment needed — local Docker Compose environment
- Workshop ends at working, tested code

## Project Type
- **Type**: Brownfield (backend API exists, UI and expiry job missing)
- **Scope**: Feature completion

# Vision: PointHub — Loyalty Points & Rewards Service (Siam MegaMart)

> Workshop Group 1 · Greenfield project · Suggested depth: Standard

## Executive Summary

PointHub is a backend service that enables Siam MegaMart (a fictional Thai retail chain with 120 stores and a mobile app with 800,000 members) to run a unified loyalty program across POS, mobile app, and online store. Today, points are calculated inside the legacy POS with rules hard-coded per campaign, so marketing cannot launch a promotion without an IT change request that takes 3–4 weeks. PointHub centralizes earn/burn logic behind an API so a campaign can go live in one day. The expected outcome is campaign lead time reduced from 4 weeks to 1 day and a 15% increase in redemption rate within 6 months.

## Business Context

### Problem Statement
- Points logic is duplicated in 3 systems (POS, e-commerce, mobile backend) and they disagree — customer service handles ~400 point-dispute tickets/month.
- Marketing cannot run tier-based or category-based promotions (e.g., "x3 points on fresh food for Gold members on weekends") without code changes.
- Finance has no single report of outstanding point liability.

### Target Users and Stakeholders

| User Type | Description | Primary Need |
|-----------|-------------|--------------|
| POS terminals (system) | 120 stores, ~50 tx/sec at peak | Fast, reliable earn calculation at checkout |
| Mobile app / website (system) | 800K members | Balance display, redemption, history |
| Marketing team | 6 campaign planners | Create/adjust earn rules & campaigns without IT |
| Customer service | 25 agents | Look up & manually adjust a member's points with audit trail |
| Finance | 3 analysts | Monthly point liability & expiry reports |

### Business Constraints
- Must integrate with existing member database (member IDs already exist; do NOT build member registration).
- Point calculations must be reproducible for audit: given the same transaction and rules, always the same result.
- Launch pilot in 10 stores within 3 months.

## Features In Scope (MVP)

- Earn points from a purchase transaction (base rate: 25 THB = 1 point) with campaign multipliers by product category, member tier (Silver/Gold/Platinum), and day-of-week
- Burn (redeem) points as discount at checkout (1 point = 0.25 THB), minimum 100 points, in multiples of 100, capped at 50% of the basket total (see the redemption table in `technical-environment.md`)
- Refunds: a refund transaction claws back the points its original transaction earned; partial refunds claw back the difference after recomputing the basket. Balances may go negative
- Member point balance, tier status, and transaction history API
- Campaign management API: create/activate/deactivate earn-rule campaigns with start/end dates (no UI needed — API only)
- Manual adjustment API for customer service (add/deduct with reason code, full audit trail)
- **Customer-service screen** — the 25 agents currently phone IT to settle a point dispute. They need to look up a member and see, on one page: the balance, the tier, and the transaction history with **why** each entry happened (which campaign or rule produced it), plus a way to make a manual adjustment with a reason code. Agents work from a member id — the
  member database is read-only and has no search, so looking someone up by name or phone is not
  possible and is not asked for. **This is the only user interface in the MVP:** marketing
  configure campaigns through the API, and Finance take the liability report as a file. Neither
  of them gets a screen, and building one for them is scope you did not agree to
- Point expiry: points expire 12 months after the month earned; nightly expiry job
- Point liability summary report endpoint for finance (total outstanding points, by tier)

## Features Explicitly Out of Scope (MVP)

- Member registration / profile management (exists in member DB)
- Coupons, vouchers, stamp cards (Phase 2)
- Partner point exchange (airline miles etc.) (Phase 2)
- Marketing campaign UI — campaigns are configured through the API in the MVP (Phase 2). Note this is *not* the same thing as the customer-service screen above, which is in scope
- Real-time fraud detection (Phase 2)
- Data warehouse / BI integration (Phase 2)

## Key Success Metrics

- Campaign go-live lead time: 4 weeks → 1 day
- Point calculation disputes: 400/month → under 50/month
- Earn API p95 latency under 150 ms at 50 tx/sec
- Zero balance-mismatch incidents between app display and POS redemption
- A customer-service agent can settle a point dispute from their own screen, without calling IT

## Open Questions (the team should expect the AI to ask about these)

- When a transaction is refunded, are earned points clawed back — and what if the member already spent them (negative balance allowed?)
- A refund that returns only *some* of the basket: reverse those lines on their own, or recompute the basket without them?
- Do multiple active campaigns stack (multiply), take the best single multiplier, or sum? And what happens when two campaigns tie on multiplier?
- Rounding rules: per line item or per basket total? Round down, up, or half-up?
- Is redemption allowed on discounted items / during promotions?

# Stakeholder Interview Notes — PointHub Kickoff (excerpts)

> These are raw meeting notes, as you would receive them in real life.
> They contain useful details, some contradictions, and some noise — exactly like reality.
> Use them to answer the AI's clarification questions. Where notes conflict, the team must decide and record the decision.

## From: Khun Nok — Head of Marketing (30 min call)

- "The whole point is speed. I want to type a campaign in on Monday and it's live Tuesday."
- Wants category multipliers ("x3 on fresh food"), tier multipliers, weekend bonuses.
- When asked about stacking: "If someone qualifies for two promos, they should get the best one. We'd go broke if they stack."
- Wants campaigns capped: "a campaign can have a total point budget, when it's used up the campaign stops." — *added late in the call; treat as nice-to-have; check with sponsor if in MVP*
- Expiry: "12 months, end of month. Everyone does it that way."

## From: Khun Beer — POS Team Lead (45 min call)

- POS timeout budget for the earn call is **300 ms total**, "so your API has to answer well under that."
- Offline mode: if PointHub doesn't answer in 300 ms, POS finishes the sale and retries the earn later — "sometimes the retry fires twice, your side has to handle that."
- Refunds: POS sends a refund event referencing the original transactionId. "Points should come back off. If the balance goes negative, so be it — finance said they'd rather see a negative balance than lose money."
- Partial refunds: "Customers return one item all the time, not the whole basket. We send the returned lines only." When asked how many points come off: *"Whatever they'd have got if they'd never bought that item. Work out the basket again without it and take the difference."*
- Rounding: "Today the POS rounds down per basket. Customers complain but that's the rule."
- Ties: "Two promos worth the same? Doesn't matter which one you print, just always print the same one."

## From: Khun May — Customer Service Manager (20 min call)

- Needs: search member's point history, see *why* each entry happened (which campaign/rule), manual add/deduct with reason codes.
- Reason codes today: GOODWILL, SYSTEM_ERROR, FRAUD_DEDUCT, EVENT_BONUS.
- "Every manual adjustment over 5,000 points needs supervisor approval." — *out of scope for MVP? The team must decide and record it.*

## From: Khun Tan — Finance (email)

> "For month-end we need: total outstanding points, breakdown by tier, and points expiring in the next 3 months. CSV is fine. Also — legal says point liability must be reproducible: if auditors replay the year's transactions they must get the same balances."

> Follow-up email, same day: "On redemption — 1 point is 25 satang, minimum 100 points, only in hundreds, and never more than half the basket. That is not negotiable, it is what the provision is modelled on. And no earning points on the part of the basket paid for with points."

## Noise / parking lot (do not build)

- Nok floated partner point exchange with an airline — sponsor already deferred to Phase 2.
- Beer mentioned the POS team might rewrite in Flutter next year — irrelevant to this service.

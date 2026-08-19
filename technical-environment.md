# Technical Environment: PointHub — Siam MegaMart

> From the CIO office, not from the business. These are the few things the platform team will
> not let you change. **Everything not listed here is yours to decide** — and to defend at a gate.

## Platform standards

| | Standard | Why it is not negotiable |
|---|---|---|
| Language & runtime | TypeScript on Node.js 20 LTS | every service the platform team operates runs on it |
| Database | PostgreSQL 15 | the only datastore ops will run in production |
| Business timezone | Asia/Bangkok | expiry month boundaries and day-of-week rules are read by people in Bangkok |

Framework, project layout, test runner, linting, how you talk to the database, how you model
the domain — none of that is standardised here. Choose, and record why.

## Prohibited

| Prohibited | Reason |
|---|---|
| ORMs (Prisma, TypeORM, Sequelize) | the platform team supports raw SQL with typed query helpers; nobody here can debug an ORM's query planner at 2am |
| Floating-point arithmetic for money or points | external audit finding last year. A replay of the year's transactions has to reproduce the same balances, exactly |

## Integration Contracts

These come from systems other teams own. You cannot negotiate them.

- **Member DB (read-only)**: `GET /members/{memberId}` → `{ memberId, tier: "SILVER"|"GOLD"|"PLATINUM", joinedAt }` — it already exists; stub it from `sample-data/members.csv` (8 members).
- **Authentication**: an API key per calling system, and a JWT for member-facing endpoints. Assume the API Gateway has already validated both — trust the `x-member-id` / `x-system-id` headers it passes you.
- **POS**: calls PointHub synchronously at checkout. If PointHub is down the POS completes the sale anyway and queues the earn request for retry — and the POS team say the retry sometimes fires twice.
- **POS refunds**: a refund arrives as its own transaction with `type = REFUND`, its own `transactionId`, an `originalTransactionId`, and negative line amounts. A refund may return **all** lines of the original or only **some** of them.

## The screen

One user interface is in scope (see the vision document). The platform team has exactly two
rules about it, and no opinion on anything else:

- **It is served by your own service and runs in a browser on this laptop.** No separate
  frontend server, no deployment, no build pipeline required.
- **Nothing is fetched from the internet at runtime.** No CDN for a framework, a font or an
  icon set — the venue Wi-Fi is not part of your architecture, and the demo has to work when it
  is not there.

Framework or no framework, one page or several, a build step or plain files served as-is —
that is a design decision like any other. Make it, record why, and be ready to defend it at a
gate. A single page your API serves is a completely respectable answer for two days of work.


## Environment

You need Node 20 and a PostgreSQL 15 you can reach. `local-environment/` has a compose file that
gives you one on your own machine — see `../README.md` §1.2. There is no cloud account, nothing
to deploy, and no infrastructure to provision: the workshop ends at working, tested code.

## Data Provided

| File | What it is |
|---|---|
| `sample-data/transactions.csv` | 40 POS sales (81 line items) plus 3 refunds — 2 full and 1 partial. Columns: `transactionId, type, originalTransactionId, date, time, storeId, memberId, tier, lineNo, category, amountTHB`. Refund lines carry negative amounts |
| `sample-data/members.csv` | The 8 members with tier and join date — stub the Member DB from this |
| `sample-data/campaign-examples.md` | The 5 campaigns marketing wants to run, and the questions they raise. The answers are in the stakeholder interviews, not here |
| `sample-data/expected-points.csv` | **The answer key.** The points your earn API must post for every transaction |
| `sample-data/check-points.mjs` | Diff your posted points against the answer key. On a mismatch it shows the per-line breakdown so you can see where your calculation diverged |

Replaying the whole file in order (sales then refunds) must leave these balances — this is the finance-reproducibility check in one line:

| M1001 | M1002 | M1003 | M1004 | M1005 | M1006 | M1007 | M1008 |
|---|---|---|---|---|---|---|---|
| 383 | 254 | 374 | 156 | 567 | 452 | 624 | 78 |

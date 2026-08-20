# PointHub QA Automation (Cypress)

Automated execution of `test-plan-test1.md` — owned by the QA unit (Test1, Unit 4).
Kept in its own npm project so it never touches `pointhub/package.json` (Dev B's foundation).

Branch: `feature/unit4-qa-automation`

## Prerequisites

The suite runs against a live server; it does not start one.

```powershell
# 1. Database
cd local-environment; docker compose up -d

# 2. Backend deps, schema, seed data
cd ..\pointhub; npm install; npm run migrate; npm run seed

# 3. Build the CS UI into pointhub/public
cd client; npm install; npm run build; cd ..

# 4. Server (leave running in its own terminal)
npm run dev      # http://localhost:3000
```

Then install the QA project once:

```powershell
cd ..\qa-automation; npm install
```

## Running

```powershell
npm run cy:open        # interactive runner
npm test               # full headless suite
npm run test:a         # Section A  — Dev B: health, metrics, expiry
npm run test:b         # Section B  — Dev A: CS UI
npm run test:d         # Section D  — cross-unit, idempotency, campaigns, burn
npm run test:e         # Section E  — non-functional
npm run test:report    # headless + JUnit XML into results/
npm run typecheck      # compile-only check of the specs
```

Override the target host with `POINTHUB_BASE_URL` (defaults to `http://localhost:3000`).

## Coverage against test-plan-test1.md

| Test case | Automated | Where |
|---|---|---|
| A1.1–A1.3 (jest/vitest, test DB) | No — CLI | manual: `npm test` in `pointhub/` |
| A2.1–A2.2 (eslint, prettier) | No — CLI | manual: `npm run lint`, `npm run format:check` |
| A3.1–A3.2 (pino stdout) | No — process stdout | manual: inspect server logs |
| A4.1, A4.2, A4.4 | Yes | `a-foundation-expiry.cy.ts` |
| A4.3 (`npm run expiry`) | No — CLI | manual |
| A5.1, A5.2, A5.4 | Yes | `a-foundation-expiry.cy.ts` |
| A5.3 (DB down → 503) | No — infra | manual: stop the container |
| A5.5 (SIGTERM drain) | No — infra | manual |
| B1.1, B1.2 | Yes | `b-cs-ui.cy.ts` |
| B1.3 (true offline) | No — host network | manual |
| B2.1–B2.4 | Yes | `b-cs-ui.cy.ts` |
| B3.1–B3.4 | Yes | `b-cs-ui.cy.ts` |
| B4.1–B4.6 | Yes | `b-cs-ui.cy.ts` |
| C1–C3 (Dev C's vitest suite) | No — CLI | manual: `npm run test:unit`, `test:integration` |
| D1.1–D1.5 | Yes | `d1-cross-unit.cy.ts` |
| D2.1–D2.2 | Yes | `d2-idempotency.cy.ts` |
| D3.1–D3.4 | Yes | `d3-campaigns.cy.ts` |
| D4.1–D4.5 | Yes | `d4-burn-rules.cy.ts` |
| E1.1, E1.2 | Yes | `e-non-functional.cy.ts` |
| E2.1 (replay twice) | No — CLI | manual |
| E2.2 | Yes | `e-non-functional.cy.ts` |

Extra cases beyond the plan (`A4.1b`, `A4.4b`, `D2.3`, `D3.5`–`D3.11`, `D4.6`, `D4.7`, `E2.3`)
cover contract deviations, boundaries and the `expected-points.csv` ground truth.

## Data side effects

Cypress runs against the **dev** database (`pointhub`), not the vitest database
(`pointhub_test`), so it cannot disturb Dev C's replay suite. Within the dev DB the specs:

- use unique transaction ids (`txId()`), so re-runs never collide;
- assert **deltas** rather than absolute balances, so they are order-independent;
- keep the B3.3 pagination fixture net-zero (+1/-1 pairs);
- call `POST /api/admin/run-expiry`, which expires *any* eligible batch. Sample transactions
  are dated 2026-09 and are not yet eligible, so replay expectations stay intact.

`M1003` and `M1007` receive top-ups and a reset in D1.5/D4, so re-seed before a fresh
replay verification: `cd pointhub; npm run migrate; npm run seed`.

## Run results

57 tests across 7 specs. Every failure is a real defect; nothing is skipped or muted.

| Spec | Tests | `7a13862` (first run) | `85ef270` (after the fix PR) |
|---|---|---|---|
| `a-foundation-expiry.cy.ts` | 10 | 7 pass / 3 fail | 9 pass / 1 fail |
| `b-cs-ui.cy.ts` | 16 | 16 / 0 | 16 / 0 |
| `d1-cross-unit.cy.ts` | 5 | 5 / 0 | 5 / 0 |
| `d2-idempotency.cy.ts` | 3 | 3 / 0 | 3 / 0 |
| `d3-campaigns.cy.ts` | 12 | 11 / 1 | 11 / 1 |
| `d4-burn-rules.cy.ts` | 7 | 7 / 0 | 7 / 0 |
| `e-non-functional.cy.ts` | 4 | 4 / 0 | 4 / 0 |
| **Total** | **57** | **53 / 4** | **55 / 2** |

Re-test verdict on `85ef270` (PR #5): **DEF-001 and DEF-003 closed. DEF-002 and DEF-004
reopened** — the shared date fix does not work, see DEF-005 below.

Verified environment: PostgreSQL 15 in Docker, `npm run dev` on port 3000, Cypress 15.21.0,
Electron 37 headless.

### DEF-005 (Major, Dev B) — the fix for DEF-002/DEF-004 reproduces the same bug

`pointhub/src/utils/date.ts` `formatPgDate()` reads the date with `getUTCFullYear()`,
`getUTCMonth()` and `getUTCDate()`, on the stated premise that "pg returns DATE as Date at
midnight UTC". The premise is inverted: node-postgres builds a DATE as **local** midnight, so
UTC getters roll back to the previous calendar day — the identical behaviour of the
`toISOString().substring(0, 10)` code it replaced.

Probed against the running server for a column storing `2026-09-12`:

```
raw from pg        : Sat Sep 12 2026 00:00:00 GMT+0700
toISOString()      : 2026-09-11T17:00:00.000Z
toISOString().sub  : 2026-09-11   <- old code
UTC getters        : 2026-09-11   <- new code, same wrong answer
LOCAL getters      : 2026-09-12   <- correct
date::text         : 2026-09-12   <- correct
```

Still reproducing on `85ef270`: `D3.4` claws back 9 instead of 4, and a fresh expiry run
returns `details: [{ memberId: "M1004", earnedMonth: "2023-06-30" }]` for a batch whose stored
`earned_month` is `2023-07-01`.

Fix — swap the UTC getters for local ones, or select `date::text` / `earned_month::text` in SQL
so no `Date` object is ever constructed. The second option removes the trap for good.

### DEF-001 (Minor, Dev B) — CLOSED, verified on `85ef270`

`design/api-spec.md` and `design/integration.md` both specify
`{ batchesExpired, totalPointsExpired, executedAt }`; `src/routes/admin.ts` returns
`{ success, expiredCount, totalPointsExpired, details }`. Behaviour is correct, only the field
names are wrong, so it breaks any cron/consumer written against the spec. Fix the route or
amend the spec — test `A4.1b` pins whichever is chosen.

Resolved on `85ef270`: the route now returns the field names from the spec. `A4.1b` green.

### DEF-002 (Major, Dev B) — REOPENED — partial refunds recompute against the wrong date

`src/routes/refund.ts` turns the stored transaction date back into a string one day earlier
than it is, so the recompute can land outside a campaign's day-of-week or date window. On
`7a13862` that was `original.date.toISOString().substring(0, 10)`; on `85ef270` it is
`formatPgDate(original.date)`, which computes the same wrong value (DEF-005).

Reproduced by `D3.4`: basket dated Sat 12 Sep 2026 (GOLD) — FRESH 137 at C1 x3, HOME 89 at
C2 x2, GROCERY 47 at C2 x2 → 27320 milli → 27 points. Returning line 3 should recompute the
remaining lines to 23560 milli → 23 points, clawing back **4**. The API claws back **9**,
because the recompute runs as Fri 11 Sep where C1 (weekend-only) no longer applies, giving
18080 milli → 18 points.

`D3.4b` isolates the cause: the same basket dated Sun 6 Sep shifts to Sat 5 Sep, still inside
C1's weekend window, and the clawback is correct (2). So the bug only bites when the one-day
shift crosses a campaign boundary — which includes every Saturday transaction under C1 and
every transaction on a campaign's first day.

Impact: wrong member balances after partial refunds, and Finance's year replay will not
reproduce. Suggested fix — format the date in Bangkok time instead of UTC, or select
`date::text` from PostgreSQL so no `Date` object is involved.

### DEF-003 (Minor, Dev B) — CLOSED, verified on `85ef270`

`runExpiry()` skips any `(member_id, earned_month)` pair that already has an EXPIRY row
(`NOT EXISTS`). If an EARN is later posted into that month — a back-dated correction — those
points are older than 12 months yet never expire.

`requirements.md` only exempts months that are **fully** expired, and after a new EARN the
month no longer is, so this contradicts US-005. Reproduced by `A4.2b`: settle
(M1005, 2024-02), post 20 more points into it, run expiry → 0 expired, balance unchanged.

Suggested fix — compare the net sum per member×month instead of testing for the existence of
an EXPIRY row, so a top-up in a settled month is picked up on the next run.

Resolved on `85ef270`: the query now sums `EARN + EXPIRY` per member×month with `HAVING > 0`,
which both preserves idempotency and picks up back-dated earns. `A4.2b` green.

### DEF-004 (Minor, Dev B) — REOPENED — the EXPIRY audit description names the wrong month

Same UTC-shift root cause as DEF-002, this time in `src/jobs/expire-points.ts`. The stored
`earned_month` is correct but the human-readable description is a day early:

```
member_id | earned_month | description
M1005     | 2024-01-01   | Points expired for earned month 2023-12-31
M1002     | 2024-03-01   | Points expired for earned month 2024-02-29
```

The `details[].earnedMonth` field in the endpoint response carries the same shift. Since the
ledger is Finance's audit trail, a month label that disagrees with the stored month will not
survive review. Pinned by `A4.5`. Fixing the shared date formatting resolves DEF-002 and
DEF-004 together.

Still reproducing on `85ef270`. A fresh expiry run for an EARN dated 2023-07-15 wrote
`earned_month = 2023-07-01` but described it as `earned month 2023-06-30`, and the endpoint
reported `earnedMonth: "2023-06-30"`. Root cause of the failed fix: DEF-005.

Note for the re-test: `A4.5` scans all EXPIRY rows for the member, so rows written by the old
code keep it red even after a correct fix lands. Re-seed the dev DB
(`cd pointhub; npm run migrate; npm run seed`, or recreate the container volume) before
treating `A4.5` as a clean pass.

## Maintenance note

The CS UI ships no `data-testid` attributes, so selectors rely on antd classes. They are
centralised in `cypress/support/selectors.ts`. Requested from Dev A: add `data-testid` to the
search input, member card, adjustment fields and history table.

# Campaign Examples from Marketing (validate your rules design against all 5)

These are the first five campaigns Marketing wants to run. Your rules engine has to give the
right answer for every one of them, including the days where they overlap.

| # | Campaign | Rule | Period | Notes |
|---|---|---|---|---|
| C1 | Fresh Weekend | x3 points on category FRESH, Sat–Sun only | 1 Sep – 30 Sep | all tiers |
| C2 | Gold Boost | x2 points on everything for GOLD | 1 Sep – 15 Sep | GOLD only |
| C3 | Platinum Everyday | x2.5 points on everything for PLATINUM | always-on | no end date |
| C4 | Payday Splurge | x5 points storewide | 25 Sep – 28 Sep | all tiers; marketing expects this to be "the best deal" and override others |
| C5 | Home & Living Push | x2 on category HOME | 10 Sep – 10 Oct | overlaps C1/C2/C4 on some days |

## The questions these campaigns raise

Expect the AI to ask you most of these. The answers are not here — they are in
`../stakeholder-notes.md`, in the words of the people who will have to live with your
decision, and in a couple of places those people disagree with each other. Where they do, your
Product Owner decides and your Scribe records **why** in `team-log.md`.

- On Sat 27 Sep a GOLD member buys FRESH items. C1 and C4 both apply, C2 has ended. What does
  the member earn — and what does the ledger say they earned it under?
- Does the always-on C3 combine with C4 during payday, or not?
- On Sat 12 Sep a GOLD member buys HOME: C2 and C5 both apply **at the same multiplier**. The
  points are identical either way, so does it matter which one you credit?
- 749 THB on a x2 campaign is not a whole number of points. What gets posted?
- A basket has three line items on three different campaigns. Where in that calculation does
  the rounding happen — and how many times?
- A campaign is deactivated after members have already earned under it. What happens to those
  points?

## C3 is x2.5, and floating point is prohibited

`technical-environment.md` forbids floating-point arithmetic for money and points, because
Finance needs a replay of the year to reproduce the same balances exactly. Marketing still
wants a x2.5 multiplier, and they are not going to drop it.

Both of those are requirements. Reconciling them is your design problem, and it is worth
solving before you write the earn calculation rather than after.

## Checking your work

`expected-points.csv` is the ground truth: the points your earn API must post for each of the
40 sales and 3 refunds. Reproducing it exactly is the exercise.

When a number does not match, run the diff tool — it tells you which transaction disagrees and
shows the per-line breakdown so you can see where your calculation diverged:

```
node check-points.mjs your-points.csv
```

Several of those transactions were chosen precisely because a plausible-but-wrong design gets
them wrong. If your total is off by one or two points, you have not made a small error — you
have made a design decision that does not match what the business told you.

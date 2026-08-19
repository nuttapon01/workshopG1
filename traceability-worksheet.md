# Traceability Worksheet — PointHub

> Fill this in on Day 2, before your demo. It is the single most useful thing you will take
> home, and it is what your demo is built on.

## What this is for

Anyone can show working code. The question AI-DLC is actually answering is:

> **Why does the software behave this way, and who decided that?**

Pick a behaviour your system has. Walk it backwards until you reach a sentence a human said.
If you can do that for five behaviours, the process worked. If the chain breaks somewhere —
a number nobody can explain, a decision with no recorded why — that break is the most
valuable thing you will find today. Write it down honestly; it scores better than hiding it.

## The chain

```
  a sentence someone said              (memo / vision / stakeholder-notes)
    └─ the question the AI asked       (aidlc-docs/.../*-questions.md)
        └─ the answer you typed        ([Answer]: ...)
            └─ the decision recorded   (team-log.md + audit.md)
                └─ requirement / story (aidlc-docs/)
                    └─ design element  (aidlc-docs/design/)
                        └─ code        (file:line)
                            └─ test    (the one that would fail if the decision flipped)
                                └─ THE OBSERVABLE   (a number you can point at)
```

---

## Worked example — do not reuse this one, it is here to show the shape

| Step | Where | What it says |
|---|---|---|
| **The sentence** | `stakeholder-notes.md`, Khun Beer (POS Team Lead) | *"Today the POS rounds down per basket. Customers complain but that's the rule."* |
| **The question** | Requirements question file | "Rounding: per line item or per basket total? Round down, up, or half-up?" |
| **Our answer** | `[Answer]:` | Round down, per basket — POS lead was explicit, and Finance needs replayable balances |
| **The decision** | `team-log.md` #_ | Floor once, at basket level, on integer milli-points. Chosen over per-line flooring, which loses points customers earned |
| **Story / requirement** | | "As the POS, when I post a basket, the points awarded are the floor of the basket total" |
| **Design** | | Multiplier held as integer ×1000; `milli = amountTHB × (mult/25)`; single `floor()` at the end |
| **Code** | `_______:__` | |
| **Test** | `_______` | The test that fails if someone moves the floor inside the loop |
| **THE OBSERVABLE** | `expected-points.csv` | **TX90007 posts 29 points.** Flooring per line gives 27. One line of design, two points of difference, and a customer complaint either way |

**Why this example is the whole point:** 29 vs 27 is not a bug you would find by reading the
code. You find it because a person in a meeting said "per basket", someone wrote that down,
and the number now proves the sentence survived all the way into production.

---

## Your five

Choose behaviours that were **genuinely decided**, not ones that were obvious. A good pick is
one where a reasonable team could have gone the other way.

Candidates for PointHub — pick from these or find your own:
campaign stacking · the x2.5 multiplier without floats · partial refund clawback · the C2/C5
tie-break · negative balances after a refund · earn idempotency on POS retry · the campaign
budget cap you did (or did not) build · point expiry at month end

### 1.

| Step | Where | What it says |
|---|---|---|
| The sentence | | |
| The question | | |
| Our answer | | |
| The decision | | |
| Story / requirement | | |
| Design | | |
| Code | | |
| Test | | |
| **THE OBSERVABLE** | | |

### 2.

| Step | Where | What it says |
|---|---|---|
| The sentence | | |
| The question | | |
| Our answer | | |
| The decision | | |
| Story / requirement | | |
| Design | | |
| Code | | |
| Test | | |
| **THE OBSERVABLE** | | |

### 3.

| Step | Where | What it says |
|---|---|---|
| The sentence | | |
| The question | | |
| Our answer | | |
| The decision | | |
| Story / requirement | | |
| Design | | |
| Code | | |
| Test | | |
| **THE OBSERVABLE** | | |

### 4.

| Step | Where | What it says |
|---|---|---|
| The sentence | | |
| The question | | |
| Our answer | | |
| The decision | | |
| Story / requirement | | |
| Design | | |
| Code | | |
| Test | | |
| **THE OBSERVABLE** | | |

### 5.

| Step | Where | What it says |
|---|---|---|
| The sentence | | |
| The question | | |
| Our answer | | |
| The decision | | |
| Story / requirement | | |
| Design | | |
| Code | | |
| Test | | |
| **THE OBSERVABLE** | | |

---

## Where the chain broke

Be honest. Every team has at least one. Naming it is worth more than pretending you do not.

| # | The behaviour | Where the chain stops | What we would have needed |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

Common shapes: a number nobody can source · a design choice the AI made that we approved
without asking why · a requirement with no story · a story with no test · a decision that
only exists in someone's memory.

---

## Your demo (10 minutes)

1. **Run the acceptance scenario.** Two minutes. Show it works.
2. **Then pick ONE row from above and walk it backwards, out loud.** Start at the number,
   end at the sentence. This is the demo — the rest is context.
3. **Say where the chain broke** and what you would do differently.

The teams that land this do not talk about their code at all.

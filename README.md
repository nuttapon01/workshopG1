# Group 1 · PointHub

**Loyalty Points & Rewards Service for Siam MegaMart** — a greenfield build.

One central points service behind an API, replacing three systems that disagree with each other. Yours is the richest Inception of the four groups: you start from nothing but business intent and four stakeholders who do not fully agree.

> **Read this file first.** It gets you from an empty machine to a running AI-DLC workflow.
> Your full brief is `Group1-Project-Brief.docx` — open it once setup is done.

---

## 1 · Set up (30 minutes, before you type anything at the AI)

### 1.1 Install the AI-DLC rules

Follow §2 of the **Participant Setup Guide**. In short: drop `aws-aidlc-rules/` and
`aws-aidlc-rule-details/` into the folders your assistant expects — the table in that guide
lists the path for Kiro, Amazon Q, Cursor, Cline, Claude Code, Copilot and Codex.

Install them **into this folder** (the one holding this README). This folder is your workspace.

Use the rules version your facilitator names. Do not just grab "latest".

### 1.2 Bring up your environment

```
node -v                   # v20.x or newer
cd local-environment
docker compose up -d      # PostgreSQL 15; the first run pulls the image, ~30 s
docker compose ps         # must say "healthy"
node check-db.mjs         # "database is up."
cd ..
```

Node 20 or newer, and **Docker Desktop running**. That is the whole environment.

There is no starter project. Node 20 and PostgreSQL 15 are the platform standards; the
framework, the layout, the test runner and how you reach the database are **your team's
decisions**, made through the workflow and recorded at a gate — so `npm init` and everything
after it happens when your design says it should, not before.

Everything is local: the database is a container on your own machine on localhost:5432.
`docker compose down` stops it; `down -v` also throws the data away.

If any of that is not green, call the facilitator **now**, not at 14:00.

### 1.3 Verify the rules took

Open a **fresh** session in this folder and paste your trigger phrase (below). You should get
the AI-DLC welcome message, and after the first stage an `aidlc-docs/` folder appears here with
`aidlc-state.md` and `audit.md` in it. If not, the rules are in the wrong place — call the
facilitator.

> **Where to open your assistant:** here, at the group folder.
> Everything the workflow needs to answer its own questions — the vision, the technical environment, the stakeholder notes and `sample-data/` — lives at this
> level, and your project root goes here too. `local-environment/` holds only the database.

---

## 2 · Your trigger phrase

Paste this exactly, into a fresh session, in this folder:

```
Using AI-DLC, build the PointHub loyalty points service described in vision-document.md and technical-environment.md in this workspace. This is a new greenfield project.
```

Then let the workflow lead.

---

## 3 · What is in this folder

### Read these first, in this order

| # | File | Why |
|---|---|---|
| 1 | `Group1-Project-Brief.docx` | Your mission, the shape of the two days, the ground rules |
| 2 | `Group1-Business-Project-Memo.docx` | The CCO's authorisation. Why the business is doing this, the budget, and the numbers success is measured by |
| 3 | `Group1-Kickoff-Deck.pptx` | The same story as the memo, as the sponsor would present it. Skim it — it is the fastest way for the whole team to share context |
| 4 | `vision-document.md` | Scope, what is explicitly out of scope, success metrics. Your primary input |
| 5 | `technical-environment.md` | The few platform standards you cannot change, and the contracts of systems other teams own. Short on purpose — **everything not in it is your decision** |
| 6 | `stakeholder-notes.md` | Raw interview notes from four stakeholders. **This is where the answers are** — and where they disagree with each other |
| 7 | `sample-data/campaign-examples.md` | The 5 campaigns your rules engine must handle, and the questions they raise |

Read them **before** the AI asks its first question. Almost everything it will ask is already
answered somewhere in here — including the places where two people answer differently.

### Data you build against

| File | What it is |
|---|---|
| `sample-data/transactions.csv` | 40 POS sales (81 line items) plus 3 refunds. This is what you replay through your earn API |
| `sample-data/members.csv` | The 8 members with tier and join date. Stub the Member DB from this |
| `sample-data/expected-points.csv` | **The answer key** — the points your API must post for every transaction |
| `sample-data/expected-points-by-line.csv` | The same answer broken down per line item. You do not need to read it; the checker uses it to explain a mismatch |
| `sample-data/check-points.mjs` | `node sample-data/check-points.mjs your-output.csv` — diffs any CSV of `transactionId,pointsPosted` against the answer key. Run it before your demo |

### Your environment

| | |
|---|---|
| `local-environment/` | A `docker-compose.yml` that gives you an empty PostgreSQL, and `check-db.mjs` to prove it is reachable. **Not your project** — it has its own README explaining why |
| `.gitignore` | Already covers `node_modules/`, `.env`, local databases. Your `git init` starts clean |

### Files you fill in and hand back

| File | Who owns it |
|---|---|
| `team-log.md` | The Scribe, continuously — roles, decisions with the **why**, contradictions you resolved, gate approvals, hand edits, retro |
| `traceability-worksheet.md` | The whole team, Day 2 morning — five behaviours walked backwards to the sentence that caused them |
| `aidlc-docs/` | The workflow creates it. Do not hand-edit it |

See §7 for what "handing back" means.

---

## 4 · How to work (the six rules)

1. **Answer in files, not in chat.** The AI writes questions into markdown files with lettered
   options and an `[Answer]:` tag. Open the file, type after the tag, save, tell the AI you are
   done. Answering in chat costs you points the second time the facilitator sees it.
2. **Read before you approve.** Every stage ends at a gate with two options — Continue, or
   Request Changes. Actually open the artifacts it points at. A gate you rubber-stamp is a gate
   you did not use.
3. **Never vibe code.** No editing files outside the workflow. If you do it anyway, tell the AI
   so the docs and state stay true. Undeclared hand edits are audit findings.
4. **Source your answers.** From the documents in section 3. Where they conflict, the Product
   Owner decides and the Scribe records **why** in `team-log.md`.
5. **Record the why, not just the what.** "We chose b" is worth nothing. "We chose b because
   Khun Nok said X, over option a which Khun Beer would have preferred" is worth everything.
6. **Rotate the keyboard.** Driver, Product Owner, Reviewer, Scribe — swap at least once per
   half day. Track it in `team-log.md`.

> **Your extension decision:** you are expected to **decline all three** extensions
> (Security, Resiliency, Property-Based Testing) — and to record *why* each one does not apply
> here. An unrecorded "no" scores the same as never having been asked.

---

## 5 · Expected shape of your two days

| When | You should be… |
|---|---|
| Day 1 morning | Through Requirements Analysis (extensions declined, on record) and into User Stories |
| Day 1 afternoon | Workflow Planning approved; Application Design and Units Generation done — expect 2–3 units, e.g. points-engine / campaign-management / reporting |
| Day 2 morning | Construction: points-engine unit complete (earn / burn / ledger with idempotency), second unit underway |
| Day 2 afternoon | Build & Test; the customer-service screen on top of the finished points engine; demo — look a member up on screen and match `expected-points.csv` |

---

## 6 · Definition of Done

- Earn API reproduces **every row** of `sample-data/expected-points.csv`.
  Checker provided: `node sample-data/check-points.mjs <your-output.csv>` diffs any CSV of
  `transactionId,pointsPosted` against the answer key — run it before your demo
- Refund clawback works for full **and** partial refunds (RF90001–3); negative balances allowed;
  every change is a ledger entry
- Earn is idempotent by `transactionId` — show the test that proves the POS retry is safe
- Point liability summary endpoint returns totals by tier, and replaying the whole file gives
  the eight member balances in `technical-environment.md`
- **The customer-service screen works**: look up a member, see the balance, the tier, and the
  history with the reason behind each entry; make an adjustment with a reason code. The balance
  it shows for a member is the one in `expected-points.csv`
- `aidlc-docs/` complete: requirements, stories, Mermaid execution plan, design, unit docs, audit trail

> **Build the screen last.** It sits on top of everything else, so a team that runs short still
> has a working, tested service to show. A team that starts with the screen has neither.

---

## 7 · What you hand in

- **`aidlc-docs/`** — state file, audit trail, requirements, stories, execution plan (with the
  Mermaid diagram), design, per-unit docs
- **Working code with passing tests**, in this folder
- **`team-log.md`** — decisions with the why, contradictions you found and how you resolved
  them, gate approvals, any hand edits, retro. Fill it in **as you go**; reconstructing it on
  Day 2 afternoon does not convince anyone
- **`traceability-worksheet.md`** — five behaviours of your system walked backwards to the
  sentence that caused each one, plus an honest note on where your chain broke
- **The Day-2 demo, 10 minutes** — run your acceptance scenario for two minutes, then pick ONE
  number your software produces and walk it backwards, out loud, to the sentence someone said
  that caused it. Then say where the chain broke

---

## 8 · When you are stuck

| Symptom | Do this |
|---|---|
| No welcome message / no `aidlc-docs/` | Rules are in the wrong folder for your assistant. Check the table in the Participant Setup Guide, then start a **fresh** session |
| The AI keeps asking the same thing | Your answer was vague. That follow-up clarification file is the system working — answer it more specifically |
| The AI proposes something your tech environment prohibits | Say so at the gate and point at the rule. Do not silently accept it, and do not switch the rule off |
| You cannot answer a question from the documents | Record an assumption, say it is an assumption, and move on. Timebox it — an honest recorded assumption scores better than twenty minutes of debate |
| Kiro suggests switching to Spec mode | Decline. Stay in Vibe mode; AI-DLC replaces that workflow |
| Your points are off by one or two | That is a design decision that disagrees with what the business asked for, not a typo. Run `node sample-data/check-points.mjs your-points.csv` to see which transactions diverge, then go back to what the stakeholders actually said |

---

**Remember:** you are not judged on how much code you produce. You are judged on whether the
process would survive contact with a real project — gates honored, decisions recorded, nothing
vibe-coded — and on whether you can still explain, two days later, *why* your software does
what it does.

# Requirements Decisions

## Context Summary
- **Project**: PointHub — Loyalty Points & Rewards Service for Siam MegaMart
- **Type**: Brownfield (backend API exists; CS UI + expiry job missing)
- **Stack**: TypeScript / Express / PostgreSQL 15
- **Scope**: Feature completion — add customer-service UI, point-expiry job, validate correctness
- **Existing**: 7 API routes (earn, refund, burn, members, campaigns, adjustments, reports), calculation engine, DB schema, seed/replay scripts
- **Constraints**: No ORM, no floating-point, CS UI served locally (no CDN/internet), Asia/Bangkok timezone

---

## Decision Questions

### D1-1: Feature Scope
**Question**: What is the scope of this implementation phase?
- 1) Full product build — implement everything described in vision-document.md from scratch
- 2) Feature completion — build only the missing pieces (CS UI, expiry job) on top of the existing backend **(Recommended)**
- 3) Validation only — verify the existing backend against expected-points.csv, fix any bugs found
- 4) Other (please specify): _______

**Answer**: 2

---

### D1-2: Customer-Service UI Approach
**Question**: What approach for the customer-service agent screen (the only UI in MVP)?
- 1) Plain HTML/CSS/JS served as static files — no build step, no framework **(Recommended)**
- 2) Lightweight framework (e.g., Alpine.js, htmx) bundled into static files
- 3) React/Vue SPA with a build step producing static output
- 4) Other (please specify): _______

**Answer**: 3

---

### D1-3: Point Expiry Job Implementation
**Question**: How should the nightly point-expiry job be implemented?
- 1) A standalone Node.js script invoked by OS scheduler (cron / Task Scheduler) **(Recommended)**
- 2) An in-process timer within the Express server (setInterval / node-cron)
- 3) A separate endpoint triggered externally (e.g., `POST /api/admin/run-expiry`)
- 4) Other (please specify): _______

**Answer**: 4. use cronjob OS apply with api

---

### D1-4: Testing Strategy
**Question**: What testing approach for this project?
- 1) Integration tests only — replay transactions.csv and verify balances match expected-points.csv **(Recommended)**
- 2) Unit tests for the calculation engine + integration test for the full replay
- 3) Full coverage — unit tests for engine, route-level tests for each endpoint, integration replay
- 4) Other (please specify): _______

**Answer**: 3

---

### D1-5: Business Rules Confirmation
**Question**: The stakeholder notes define these rules. Confirm they are correctly understood:
  - Campaign stacking: best single multiplier wins (no stacking)
  - Rounding: floor (round down) once per basket total
  - Ties: higher priority wins; if equal priority, alphabetical campaign_id
  - Partial refunds: recompute basket without returned lines, claw back difference
  - Negative balances: allowed after refunds
- 1) All correct as stated **(Recommended)**
- 2) Some rules need adjustment (please specify): _______
- 3) Need to re-check with stakeholders
- 4) Other (please specify): _______

**Answer**: 1 All correct as stated (negative balances allowed after refunds)

---

### D1-6: Personas
**Question**: Should we generate detailed user personas for the 5 user types (POS, mobile app, marketing, customer service, finance)?
- 1) No — user types are well-documented in vision doc, personas add no value for this scope **(Recommended)**
- 2) Yes — generate personas to clarify needs and edge cases
- 3) Partial — only for customer-service agents (the UI user)
- 4) Other (please specify): _______

**Answer**: 3

---

### D1-7: Team Size
**Question**: How many developers will work on this project?
- 1) Solo (1 developer) **(Recommended)**
- 2) Small team (2–3)
- 3) Medium team (4–8)
- 4) Large team (9+)

**Answer**: 3

---

### D1-8: Non-Functional Requirements
**Question**: Which NFRs should be formally specified?
- 1) Performance only — p95 < 150 ms earn latency at 50 tx/sec **(Recommended)**
- 2) Performance + reproducibility (audit replay produces identical balances)
- 3) Full NFR analysis (performance, reproducibility, availability, security)
- 4) Other (please specify): _______

**Answer**: 1

---

## Decisions Summary
<!-- Machine-readable compact summary. Downstream phases: read ONLY this section. -->
- D1-1 Feature Scope: Feature completion — build missing pieces (CS UI, expiry job) on existing backend
- D1-2 CS UI Approach: React/Vue SPA with build step producing static output
- D1-3 Expiry Job: Hybrid — standalone script exposed as API endpoint, triggered by OS cron
- D1-4 Testing Strategy: Full coverage — unit tests for engine, route-level tests for each endpoint, integration replay
- D1-5 Business Rules: All correct as stated (best-wins, floor per basket, priority tie-break, recompute partial refunds, negative balances allowed)
- D1-6 Personas: Partial — generate persona for customer-service agents only
- D1-7 Team Size: Medium team (4–8 developers)
- D1-8 NFR: Performance only — p95 < 150 ms earn latency at 50 tx/sec

---

**Instructions**: Fill in your answers above and respond with "done"

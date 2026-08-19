# Decomposition Decisions

## Context Summary
- **Project**: PointHub — Feature completion (CS UI + expiry job + full test suite)
- **Stories**: 12 across 5 functional areas (5 High, 5 Medium, 2 Low)
- **Domains**: CS UI, Point Expiry, Correctness Validation, Campaigns (existing), Reporting (existing)
- **Stack**: TypeScript / Express / PostgreSQL 15 (monolith)
- **Team**: Medium (4–8 developers)
- **Existing code**: Backend API fully implemented; missing CS UI + expiry job

---

## Decision Questions

### D2-1: Architecture Pattern
**Question**: What architecture pattern should the units follow within the existing monolith?
- 1) Single Unit — keep everything in one deliverable **(Recommended against — you asked for decomposition)**
- 2) Modular Monolith — units as logical modules within the same codebase, clear boundaries **(Recommended)**
- 3) Microservices — units as separate deployable services
- 4) Other (please specify): _______

**Answer**: 1
---

### D2-2: Decomposition Strategy
**Question**: How should units be divided?
- 1) Domain-Driven — by business domain/bounded context (CS UI domain, Expiry domain, Testing domain) **(Recommended)**
- 2) Layer-Based — by technical layer (frontend, backend, database, tests)
- 3) User Journey-Based — by end-to-end user flow
- 4) Hybrid (please specify): _______

**Answer**: 2

---

### D2-3: Shared Foundation Unit
**Question**: Should there be a foundation unit for shared infrastructure (test framework setup, common utilities, DB schema changes)?
- 1) Yes — create a foundation unit that other units depend on (test framework, shared types, any schema updates) **(Recommended)**
- 2) No — each unit handles its own setup independently
- 3) Minimal — only shared test configuration, no other shared unit

**Answer**: 1

---

### D2-4: Unit Proposals
**Question**: Review the proposed unit breakdown and confirm or adjust:

**Unit A: Foundation** (US-007 partial — test setup)
- Set up test framework (Vitest/Jest), shared test utilities, any missing DB migrations

**Unit B: Customer-Service UI** (US-001, US-002, US-003, US-004)
- React/Vue SPA build, member lookup, history display, adjustment form, offline compliance

**Unit C: Point Expiry** (US-005, US-010)
- Expiry job script + endpoint, update liability report to reflect expired points

**Unit D: Validation & Testing** (US-006, US-007, US-008, US-009, US-011, US-012)
- Unit tests for engine, route-level tests, integration replay, validate campaigns/idempotency/burn

Which grouping do you prefer?
- 1) As proposed above (4 units) **(Recommended)**
- 2) Merge Foundation into Validation (3 units: CS UI, Expiry, Validation)
- 3) Split Validation further (5 units: Foundation, CS UI, Expiry, Engine Tests, API Tests)
- 4) Other (please specify): _______

**Answer**: 1

---

### D2-5: Development Sequence
**Question**: In what order should units be developed?
- 1) Foundation → Validation → Expiry → CS UI (validate correctness first, then build new features) **(Recommended)**
- 2) Foundation → CS UI → Expiry → Validation (features first, test last)Expiry in parallel → Validation (maximize parallelism)
- 3) Foundation → CS UI + 
- 4) Other (please specify): _______

**Answer**: 2

---

### D2-6: Unit Dependencies
**Question**: How should units communicate/depend on each other?
- 1) Shared database — units read/write same tables, no API between units **(Recommended — it's a monolith)**
- 2) Internal API — units expose internal interfaces to each other
- 3) Event-driven — units communicate via events/messages
- 4) Other (please specify): _______

**Answer**: 2

---

## Decisions Summary
<!-- Machine-readable compact summary. Downstream phases: read ONLY this section. -->
- D2-1 Architecture: Single Unit (all in one deliverable within the monolith)
- D2-2 Strategy: Layer-Based (divide by technical layer — frontend, backend, database, tests)
- D2-3 Foundation: Yes — create foundation unit (test framework, shared types, schema updates)
- D2-4 Units: 4 units as proposed (Foundation, CS UI, Expiry, Validation & Testing)
- D2-5 Sequence: Foundation → CS UI → Expiry → Validation (features first, test last)
- D2-6 Dependencies: Internal API — units expose internal interfaces to each other

---

**Instructions**: Fill in your answers above and respond with "done"

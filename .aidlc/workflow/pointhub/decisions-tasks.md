# Tasks Decisions

## Context Summary
- **Components**: 4 (React SPA, Express API extensions, Expiry Job, Test Suite)
- **Entities**: 5 (no schema changes needed)
- **Endpoints**: 15 (13 existing + 2 new)
- **Integrations**: 4
- **Team**: 3 Dev (parallel) + 1 BA
- **Units**: CS UI (Dev A), Expiry+Foundation (Dev B), Validation (Dev C)
- **D3 Stack**: React/Ant Design/Webpack, Jest/Axios, ESLint/Prettier, Zod, pino, prom-client

---

## Decision Questions

### D4-1: Task Breakdown Strategy
**Question**: How should tasks be organized across the 3 parallel developers?
- 1) By unit — each dev gets their unit's tasks in sequence (Dev A: all CS UI tasks, Dev B: all Expiry tasks, Dev C: all test tasks) **(Recommended)**
- 2) By layer — frontend tasks, backend tasks, test tasks grouped regardless of unit
- 3) By story — each user story becomes a task with all layers included
- 4) Other (please specify): _______

**Answer**: 1

---

### D4-2: Implementation Approach
**Question**: Should tests be written before or after implementation code?
- 1) Test-after — implement the feature first, write tests after to verify **(Recommended)**
- 2) TDD — write failing tests first, then implement to make them pass
- 3) Mixed — TDD for engine/critical logic, test-after for UI and routes
- 4) Other (please specify): _______

**Answer**: 1

---

### D4-3: Component Priority (Dev B — Foundation)
**Question**: Dev B handles both foundation (test framework) and expiry. Which first?
- 1) Foundation first — set up Jest + test helpers so Dev A and Dev C can start using them early **(Recommended)**
- 2) Expiry first — deliver business value, then do foundation
- 3) Interleave — minimal Jest setup, then expiry, then complete test helpers
- 4) Other (please specify): _______

**Answer**: 1

---

### D4-4: Integration Strategy During Development
**Question**: How should developers handle dependencies on each other during parallel work?
- 1) Contract-first — agree on API contracts upfront, each dev works against the contract **(Recommended)**
- 2) Mock-first — each dev mocks what they don't own, integrate at the end
- 3) Trunk-based — merge frequently, resolve conflicts immediately
- 4) Other (please specify): _______

**Answer**: 2

---

### D4-5: Task Granularity
**Question**: How large should each task be?
- 1) Single-concern — one task per file or small logical unit (15-30 min each, many tasks) **(Recommended)**
- 2) Feature-chunk — one task per feature area (1-2 hours each, fewer tasks)
- 3) Story-sized — one task per user story (half day each, fewest tasks)
- 4) Other (please specify): _______

**Answer**: 1

---

### D4-6: Sync Points
**Question**: When should the 3 devs sync their work?
- 1) After foundation is done (Dev B merges test framework → Dev A & C start using it) **(Recommended)**
- 2) No sync — each dev works independently, integrate at the end
- 3) Daily sync — merge all work daily regardless of completion
- 4) Other (please specify): _______

**Answer**: 1

---

## Decisions Summary
<!-- Machine-readable compact summary. Downstream phases: read ONLY this section. -->
- D4-1 Breakdown: By unit — each dev gets their unit's tasks in sequence
- D4-2 Approach: Test-after — implement first, test after to verify
- D4-3 Priority: Foundation first — Jest + test helpers before expiry
- D4-4 Integration: Mock-first — each dev mocks what they don't own, integrate at end
- D4-5 Granularity: Single-concern — one task per file/small unit (15-30 min each)
- D4-6 Sync: After foundation — Dev B merges test framework, then Dev A & C use it

---

**Instructions**: Fill in your answers above and respond with "done"

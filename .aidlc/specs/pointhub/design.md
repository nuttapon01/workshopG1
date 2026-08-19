# Design

## Summary
- **Architecture**: Layered monolith — Express API + React SPA + PostgreSQL
- **Stack**: React 18 / Ant Design 5 / Webpack 5 / Express 4.18 / pg / PostgreSQL 15
- **Components**: 4 (React SPA, Express API, Expiry Job, Test Suite)
- **Entities**: 5 (members, campaigns, transactions, transaction_lines, points_ledger)
- **Endpoints**: 15 (13 existing + 2 new: admin/run-expiry, ready)
- **Integrations**: 4 (Member DB stub, POS, CS Browser, OS Cron)
- **Operations**: Standard (pino logging + prom-client metrics + health/ready + graceful shutdown)
- **Testing**: Jest + Axios + real test DB; unit + route + integration replay
- **NFR**: Earn API p95 < 150ms at 50 tx/sec

## Architecture

```
                    ┌─────────────────┐
                    │   CS Agent      │
                    │   (Browser)     │
                    └────────┬────────┘
                             │ fetch /api/*
┌────────────────────────────▼────────────────────────────┐
│                  Express Server (:3000)                   │
│                                                          │
│  Static Files (public/) ←── Webpack output               │
│                                                          │
│  Routes: earn│refund│burn│members│campaigns│adj│reports│admin│
│       │                                                  │
│  Middleware: pino-http │ error-handler │ Zod validation   │
│       │                                                  │
│  Engine: calculate-points.ts                             │
│  Jobs: expire-points.ts                                  │
│       │                                                  │
│  DB: pg Pool (raw SQL, parameterized queries)            │
└────────┼────────────────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────┐
│              PostgreSQL 15 (Docker)                       │
│  members│campaigns│transactions│transaction_lines│ledger  │
└─────────────────────────────────────────────────────────┘
```

## Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | React + Ant Design for CS UI | D3-1/D3-3: Full component library (Table, Form, Input), team familiarity, offline-safe when bundled |
| 2 | Webpack bundler | D3-2: Mature, well-understood, outputs to Express static dir |
| 3 | Jest for tests | D3-4: Most popular, mature, works well with TypeScript |
| 4 | Real test DB | D3-5: Catches SQL bugs, tests migrations, most realistic |
| 5 | Axios for API tests | D3-6: Also used in React SPA, consistent HTTP client across project |
| 6 | ESLint + Prettier | D3-7: Catches bugs + ensures consistent style |
| 7 | Zod validation | D3-8: TypeScript-first, great error messages, small |
| 8 | Replay test as correctness proof | D3-9: expected-points.csv is the ground truth |
| 9 | pino + prom-client | D3-10/D3-11: Standard observability without heavy infra |
| 10 | Graceful shutdown + startup probe | D3-12: Production-ready lifecycle management |

## Traceability

| Story | Components | Design Files |
|-------|-----------|--------------|
| US-001 Member Lookup | React SPA (MemberLookup, MemberInfo) | components.md, api-spec.md |
| US-002 Transaction History | React SPA (TransactionHistory) | components.md, api-spec.md |
| US-003 Manual Adjustment | React SPA (AdjustmentForm) | components.md, api-spec.md |
| US-004 UI Offline | React SPA (Webpack config, no CDN) | components.md, implementation.md |
| US-005 Point Expiry | Expiry Job, admin route | components.md, api-spec.md |
| US-006 Replay Verification | Test Suite (replay.test.ts) | testing-strategy.md |
| US-007 Engine Unit Tests | Test Suite (unit/) | testing-strategy.md |
| US-008 Route Tests | Test Suite (routes/) | testing-strategy.md |
| US-009 Campaign CRUD | Express API (campaigns.ts) — validate via tests | api-spec.md, testing-strategy.md |
| US-010 Liability Report | Express API (reports.ts) + Expiry Job | api-spec.md, components.md |
| US-011 Idempotency | Express API (earn, refund) — validate via tests | api-spec.md, testing-strategy.md |
| US-012 Burn Validation | Express API (burn.ts) — validate via tests | api-spec.md, testing-strategy.md |

## Design Files

| File | Content |
|------|---------|
| design/components.md | 4 components with responsibilities, interfaces, internal structure |
| design/data-model.md | 5 entities, ER diagram, access patterns, business rules |
| design/api-spec.md | 15 REST endpoints with request/response examples |
| design/integration.md | External systems, internal integration, error handling |
| design/implementation.md | Directory structure, tech stack with versions, dev setup, test commands |
| design/operations.md | Logging, metrics, health, graceful shutdown |
| design/testing-strategy.md | Unit/route/integration test plans, test DB lifecycle |

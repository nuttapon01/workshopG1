# Implementation

## Code Organization

**Architecture**: Layered monolith (routes → engine/jobs → db pool)
**Repository**: Single repo with backend + frontend co-located

### Directory Structure
```
pointhub/
├── client/                         # React SPA (Dev A)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── MemberLookup.tsx
│   │   │   ├── MemberInfo.tsx
│   │   │   ├── TransactionHistory.tsx
│   │   │   └── AdjustmentForm.tsx
│   │   ├── api/
│   │   │   └── client.ts           # Axios API wrapper
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── index.tsx                # React entry
│   ├── public/
│   │   └── index.html               # HTML template
│   ├── webpack.config.js
│   ├── tsconfig.json
│   └── package.json                 # Frontend deps (React, Ant Design, Webpack)
├── src/                             # Express backend
│   ├── index.ts                     # Entry point (existing)
│   ├── routes/
│   │   ├── earn.ts                  # Existing
│   │   ├── refund.ts                # Existing
│   │   ├── burn.ts                  # Existing
│   │   ├── members.ts              # Existing
│   │   ├── campaigns.ts            # Existing
│   │   ├── adjustments.ts          # Existing
│   │   ├── reports.ts              # Existing
│   │   └── admin.ts                # NEW: /api/admin/run-expiry
│   ├── engine/
│   │   └── calculate-points.ts     # Existing
│   ├── jobs/
│   │   └── expire-points.ts        # NEW: expiry logic
│   ├── middleware/
│   │   ├── request-logger.ts       # NEW: pino structured logging
│   │   └── error-handler.ts        # NEW: centralized error handler
│   ├── schemas/                    # NEW: Zod validation schemas
│   │   └── earn.schema.ts
│   ├── db/
│   │   ├── pool.ts                 # Existing
│   │   ├── migrate.ts              # Existing
│   │   └── seed.ts                 # Existing
│   └── scripts/
│       ├── replay.ts               # Existing
│       └── run-expiry.ts           # NEW: standalone script
├── tests/                           # Test suite (Dev C)
│   ├── setup/
│   │   ├── global-setup.ts
│   │   ├── global-teardown.ts
│   │   └── test-helpers.ts
│   ├── unit/
│   │   ├── calculate-points.test.ts
│   │   └── campaign-matching.test.ts
│   ├── routes/
│   │   ├── earn.test.ts
│   │   ├── refund.test.ts
│   │   ├── burn.test.ts
│   │   ├── members.test.ts
│   │   ├── campaigns.test.ts
│   │   ├── adjustments.test.ts
│   │   ├── reports.test.ts
│   │   └── admin.test.ts
│   ├── integration/
│   │   └── replay.test.ts
│   └── jest.config.ts
├── public/                          # Webpack output (served by Express)
│   ├── index.html
│   ├── bundle.js
│   └── bundle.css
├── package.json
├── tsconfig.json
└── .eslintrc.js                    # NEW: ESLint config
```

### Module Boundaries
- `client/` — completely independent; communicates only via HTTP to `/api/*`
- `src/jobs/` — business logic importable by both routes and standalone scripts
- `tests/` — depends on everything but nothing depends on it

### Naming Conventions
- Files: kebab-case (`expire-points.ts`, `test-helpers.ts`)
- Variables/functions: camelCase
- Interfaces/Types: PascalCase
- DB columns: snake_case
- React components: PascalCase files (`MemberLookup.tsx`)

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.3.3 |
| Backend Framework | Express | 4.18.2 |
| Database Client | pg | 8.11.3 |
| Frontend Framework | React | 18.2.0 |
| UI Library | Ant Design | 5.x |
| Bundler | Webpack | 5.x |
| Test Framework | Jest | 29.x |
| HTTP Client | Axios | 1.x |
| Validation | Zod | 3.x |
| Logging | pino | 8.x |
| Linting | ESLint + Prettier | Latest |
| Dev Runner | tsx | 4.7.0 |

---

## Development Setup

### Prerequisites
- Node.js 20 LTS
- Docker (for PostgreSQL via `local-environment/docker-compose.yml`)
- npm

### Setup Commands
```bash
# Start PostgreSQL
cd local-environment && docker compose up -d

# Install backend deps
cd pointhub && npm install

# Run migrations + seed
npm run migrate && npm run seed

# Install frontend deps
cd client && npm install

# Build frontend (output to ../public/)
npm run build

# Start dev server (backend)
cd .. && npm run dev

# Run tests
npm test
```

### Environment Variables

| Name | Description | Example |
|------|-------------|---------|
| PORT | Express server port | 3000 |
| DB_HOST | PostgreSQL host | localhost |
| DB_PORT | PostgreSQL port | 5432 |
| DB_USER | Database user | pointhub |
| DB_PASSWORD | Database password | pointhub |
| DB_NAME | Database name | pointhub |
| DB_NAME_TEST | Test database name | pointhub_test |
| NODE_ENV | Environment | development |
| LOG_LEVEL | pino log level | info |

---

## Testing

| Type | Framework | Command | Coverage |
|------|-----------|---------|----------|
| Unit | Jest | `npm run test:unit` | Engine calculation, campaign matching |
| Route | Jest + Axios | `npm run test:routes` | All API endpoints |
| Integration | Jest + Axios | `npm run test:integration` | Full transaction replay |
| All | Jest | `npm test` | Everything |

### npm Scripts (additions to package.json)
```json
{
  "test": "jest",
  "test:unit": "jest --testPathPattern=tests/unit",
  "test:routes": "jest --testPathPattern=tests/routes",
  "test:integration": "jest --testPathPattern=tests/integration",
  "lint": "eslint src/ tests/ --ext .ts,.tsx",
  "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\" \"client/src/**/*.{ts,tsx}\"",
  "client:build": "cd client && npm run build",
  "client:dev": "cd client && npm run dev",
  "expiry": "tsx src/scripts/run-expiry.ts"
}
```

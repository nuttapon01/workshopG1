# Tech

## Summary
TypeScript/Express/PostgreSQL 15 monolith. Raw SQL via `pg` pool (no ORM). Local Docker Compose infrastructure — no cloud.

## Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | TypeScript 5.3 (strict) | Platform mandate |
| Runtime | Node.js 20 LTS | Platform mandate |
| Framework | Express 4.18 | Already in use |
| Database | PostgreSQL 15 | Platform mandate; local via Docker Compose |
| Package manager | npm | lockfile present |
| Build | tsc (TypeScript compiler) | Outputs to `dist/` |
| Dev runner | tsx 4.7 (watch mode) | Hot-reload during development |
| Testing | Pending D3 decision | No test framework configured yet |

## Architecture

- **Pattern**: Layered monolith — routes → engine → db pool
- **API style**: REST (JSON over HTTP)
- **Static serving**: Express `express.static` serves `public/` for CS UI

## Infrastructure

- **Cloud provider**: None (local only)
- **Compute**: Local Node.js process
- **Database**: PostgreSQL 15 via `local-environment/docker-compose.yml`
- **IaC tool**: Docker Compose (dev environment only)

## Patterns & Conventions

- **Architecture pattern**: Flat layered — route handlers call engine functions and db pool directly
- **Data access**: Raw `pg` Pool with parameterized queries; no ORM (prohibited)
- **API response format**: Direct JSON objects (no envelope)
- **Error handling**: try/catch per route; returns `{ error: string, detail?: string }`
- **Authentication**: Trusted headers from API Gateway (`x-member-id`, `x-system-id`)
- **Validation**: Inline checks in route handlers (no schema library)
- **Logging**: `console.log` / `console.error`
- **Integer arithmetic**: Milli-points (÷1000 for display) and millipercent multipliers to avoid floating point
- **Idempotency**: Check `transactionId` existence before processing earn/refund
- **Code style**: No linter configured; consistent 2-space indent, single quotes in source
- **Naming**: camelCase for variables/functions, PascalCase for interfaces/types, snake_case for DB columns
- **Branch strategy**: Not detected (single workspace)

## Environment Configuration

- **Config approach**: Environment variables with sensible defaults (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`)
- **Environments**: Local development only
- **Secrets management**: Hardcoded defaults for local dev (`pointhub`/`pointhub`)

## CI/CD Pipeline

- Not configured (workshop scope — local only)

## Dependency Management

- **Lockfile**: `package-lock.json` present
- **Version strategy**: Exact versions pinned in `package.json`
- **Production deps**: express 4.18.2, pg 8.11.3
- **Dev deps**: @types/express, @types/node, @types/pg, tsx, typescript

## Known Technical Debt

- No test framework or test files
- No linter / formatter configured
- `console.log` only logging (no structured logging)
- No input validation library (inline checks only)
- Reports endpoint uses `toLocaleString` which is not timezone-safe on all platforms
- `public/` directory (CS UI) referenced in index.ts but does not exist yet
- Point expiry job not implemented

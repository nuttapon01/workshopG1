# Integration

## External Systems

### Member Database (Stub)
- **Type**: Read-only stub seeded from `sample-data/members.csv`
- **Pattern**: Direct DB table (not a separate service call)
- **Contract**: `members` table with member_id, tier, joined_at
- **Failure handling**: 404 if member not found

### POS System
- **Type**: Inbound HTTP calls to `/api/earn` and `/api/refund`
- **Pattern**: Synchronous request-response
- **Contract**: POS sends JSON with transactionId, date, time, storeId, memberId, tier, lines
- **Failure handling**: Idempotent — duplicate transactionId returns existing result
- **Timeout**: POS expects response within 300ms; if PointHub doesn't answer, POS completes sale and retries later

### OS Cron Scheduler
- **Type**: Outbound trigger to `/api/admin/run-expiry`
- **Pattern**: HTTP POST triggered by cron job (daily at 01:00 Bangkok time)
- **Contract**: No request body needed; returns { batchesExpired, totalPointsExpired, executedAt }
- **Failure handling**: If endpoint unreachable, cron retries next day. Expiry is idempotent.

### CS Agent Browser
- **Type**: React SPA served as static files
- **Pattern**: Browser fetches from same-origin `/api/*`
- **Contract**: Standard REST JSON endpoints
- **Failure handling**: Axios interceptor shows error messages; no retry for user actions

---

## Internal Integration

### Frontend → Backend
- Same-origin: React SPA served from `express.static('public')` at `/`
- API calls to `/api/*` — no CORS needed (same origin)
- No auth tokens needed (API Gateway handles auth upstream)

### Expiry Job → Database
- Shared `pg` pool connection
- Standalone script creates its own pool instance (not sharing with server)
- Endpoint version uses the server's existing pool

### Test Suite → Server
- Tests start Express app programmatically (or against running server via Axios)
- Test DB: separate database (`pointhub_test`) with same schema
- Global setup: create DB, migrate, seed
- Global teardown: drop DB

---

## Integration Error Handling

| Scenario | Behavior |
|----------|----------|
| DB connection lost | Readiness probe returns 503; requests get 500; pino logs error |
| POS sends duplicate | Return existing result (idempotent) — no error |
| POS sends invalid JSON | Zod validation → 400 with details |
| Expiry job partially fails | Per-batch transaction; continues on individual failures; logs errors |
| CS UI can't reach API | Axios error → "Cannot reach server" message in UI |
| Test DB not available | Jest global-setup fails fast with clear "DB not reachable" message |

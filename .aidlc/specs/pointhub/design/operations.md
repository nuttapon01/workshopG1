# Operations

## Observability Level: Standard

### Structured Logging (pino)

| Component | Log Events |
|-----------|-----------|
| Earn route | Transaction processed (txId, memberId, points, duration) |
| Refund route | Refund processed (txId, originalTxId, clawback, isFullRefund) |
| Burn route | Redemption processed (memberId, points, discount) |
| Adjustments | Adjustment posted (memberId, points, reasonCode, agentId) |
| Expiry job | Batch expired (count, totalPoints, duration) |
| Error handler | Unhandled error (stack, request path, method) |
| Startup/shutdown | Server started/stopped (port, duration) |

**Format**: JSON with fields: `level`, `time`, `msg`, `reqId`, `method`, `path`, `statusCode`, `duration`
**Library**: pino 8.x with `pino-http` middleware

### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `http_requests_total` | Counter | method, path, status_code |
| `http_request_duration_seconds` | Histogram | method, path |
| `db_pool_active_connections` | Gauge | — |
| `points_earned_total` | Counter | tier, campaign |
| `points_expired_total` | Counter | — |

**Endpoint**: `GET /api/metrics` (Prometheus text format via prom-client)

### Health Endpoints

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `GET /api/health` | Liveness | Process alive (always 200) |
| `GET /api/ready` | Readiness | DB connection alive (200/503) |

### Graceful Shutdown

```
SIGTERM received
  → Stop accepting new connections
  → Wait for in-flight requests (30s timeout)
  → Close database pool
  → Exit 0
```

### Startup Probe
- Server logs "PointHub listening on port {PORT}" only after DB connection verified
- Startup probe: hit `/api/ready` — returns 200 when DB connected

---

## Configuration

All via environment variables (see implementation.md for full list).

| Variable | Default | Required |
|----------|---------|----------|
| PORT | 3000 | No |
| DB_HOST | localhost | No |
| DB_PORT | 5432 | No |
| DB_USER | pointhub | No |
| DB_PASSWORD | pointhub | No |
| DB_NAME | pointhub | No |
| LOG_LEVEL | info | No |
| NODE_ENV | development | No |

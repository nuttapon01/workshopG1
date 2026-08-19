import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// Collect default Node.js metrics (GC, event loop, memory, etc.)
client.collectDefaultMetrics({ prefix: 'pointhub_' });

/**
 * Custom metrics for the PointHub service.
 */

// HTTP request counter
export const httpRequestsTotal = new client.Counter({
  name: 'pointhub_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// HTTP request duration histogram
export const httpRequestDuration = new client.Histogram({
  name: 'pointhub_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// Active DB connections gauge
export const dbActiveConnections = new client.Gauge({
  name: 'pointhub_db_active_connections',
  help: 'Number of active database connections',
});

/**
 * Middleware to track request metrics.
 * Records count and duration per route.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip metrics endpoint itself to avoid self-referential noise
  if (req.path === '/api/metrics') {
    return next();
  }

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;

    // Normalize route to avoid high-cardinality labels
    const route = normalizeRoute(req.route?.path || req.path, req.baseUrl);
    const statusCode = String(res.statusCode);

    httpRequestsTotal.inc({ method: req.method, route, status_code: statusCode });
    httpRequestDuration.observe(
      { method: req.method, route, status_code: statusCode },
      durationSec
    );
  });

  next();
}

/**
 * Normalize routes to reduce cardinality.
 * e.g. /api/members/M1001 → /api/members/:id
 */
function normalizeRoute(routePath: string, baseUrl: string): string {
  const full = baseUrl + routePath;
  // Replace common ID patterns
  return full
    .replace(/\/M\d+/g, '/:id')
    .replace(/\/[A-Z]{1,5}\d{3,}/g, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Handler for GET /api/metrics
 * Returns Prometheus text format metrics.
 */
export async function metricsHandler(_req: Request, res: Response) {
  try {
    res.set('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end('Error collecting metrics');
  }
}

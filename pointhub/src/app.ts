import express from 'express';
import path from 'path';
import { earnRouter } from './routes/earn';
import { refundRouter } from './routes/refund';
import { burnRouter } from './routes/burn';
import { membersRouter } from './routes/members';
import { campaignsRouter } from './routes/campaigns';
import { adjustmentsRouter } from './routes/adjustments';
import { reportsRouter } from './routes/reports';
import { adminRouter } from './routes/admin';
import { requestLogger, logger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { metricsMiddleware, metricsHandler, dbActiveConnections } from './middleware/metrics';
import pool from './db/pool';

/**
 * The Express application, with no side effects beyond wiring.
 *
 * Deliberately does NOT call listen() — that belongs to index.ts. Tests import
 * this module and drive it through supertest, so importing it must never bind a
 * TCP port (otherwise a running dev server makes the whole suite fail with
 * EADDRINUSE).
 */
const app = express();

// Middleware
app.use(express.json());
app.use(requestLogger);
app.use(metricsMiddleware);

// Serve static files for the customer-service UI
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/earn', earnRouter);
app.use('/api/refund', refundRouter);
app.use('/api/burn', burnRouter);
app.use('/api/members', membersRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/adjustments', adjustmentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);

// Health check (liveness)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pointhub' });
});

// Readiness probe — verifies DB connectivity
app.get('/api/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    // Update active connections gauge
    dbActiveConnections.set(pool.totalCount - pool.idleCount);
    res.status(200).json({ status: 'ready', db: 'connected' });
  } catch (err) {
    logger.error({ err }, 'Readiness check failed');
    res.status(503).json({ status: 'not ready', db: 'disconnected' });
  }
});

// Prometheus metrics endpoint
app.get('/api/metrics', metricsHandler);

// Error handling (must be after all routes)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

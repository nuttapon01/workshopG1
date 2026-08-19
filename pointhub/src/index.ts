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

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

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

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'PointHub listening');
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error closing HTTP server');
    } else {
      logger.info('HTTP server closed');
    }

    // Drain and close the database pool
    pool.end().then(() => {
      logger.info('Database pool closed');
      process.exit(0);
    }).catch((poolErr) => {
      logger.error({ err: poolErr }, 'Error closing database pool');
      process.exit(1);
    });
  });

  // Force exit if graceful shutdown takes too long (10s)
  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

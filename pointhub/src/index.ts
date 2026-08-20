import app from './app';
import { logger } from './middleware/logger';
import pool from './db/pool';

/**
 * Server bootstrap. Keep listen() and process-signal handling here so that
 * importing the app (tests, tooling) has no side effects.
 */
const PORT = parseInt(process.env.PORT || '3000', 10);

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
    pool
      .end()
      .then(() => {
        logger.info('Database pool closed');
        process.exit(0);
      })
      .catch((poolErr) => {
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

export { app, server };
export default app;

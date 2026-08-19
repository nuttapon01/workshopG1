import pino from 'pino';
import pinoHttp from 'pino-http';

/**
 * Application logger instance.
 * Use this for structured logging throughout the app.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino/file', options: { destination: 1 } } // stdout pretty in dev
      : undefined,
  base: { service: 'pointhub' },
});

/**
 * HTTP request logging middleware.
 * Logs method, url, status, and response time for every request.
 */
export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => {
      // Skip health check noise
      return req.url === '/api/health' || req.url === '/api/ready';
    },
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

import pino from 'pino';
import pinoHttp from 'pino-http';

/**
 * Application logger instance.
 * Use this for structured logging throughout the app.
 */
const isTest = Boolean(process.env.VITEST);

// Under vitest the per-request log lines bury the assertion output, so default
// to silent there. LOG_LEVEL still wins if you need the logs back while debugging.
const defaultLevel = isTest ? 'silent' : 'info';

// A pino transport runs on a worker thread. Nothing closes that thread when a
// test file finishes, which leaves the vitest worker alive and the run hangs
// after the summary. Tests therefore log straight to stdout, no transport.
const transport =
  isTest || process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } };

export const logger = pino({
  level: process.env.LOG_LEVEL || defaultLevel,
  transport,
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

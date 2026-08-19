import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

/**
 * Centralized error-handling middleware.
 * Must be registered AFTER all routes.
 * Catches unhandled errors, logs them, and returns structured JSON.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error(
    {
      err,
      method: req.method,
      url: req.url,
      body: req.body,
    },
    'Unhandled error'
  );

  const statusCode = (err as any).statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    error: message,
    detail: process.env.NODE_ENV !== 'production' ? err.message : undefined,
  });
}

/**
 * 404 handler for routes that don't match any defined route.
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Not found',
    detail: `${req.method} ${req.url} does not exist`,
  });
}

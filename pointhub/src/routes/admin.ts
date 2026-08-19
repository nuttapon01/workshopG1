import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { runExpiry } from '../jobs/expire-points';
import { logger } from '../middleware/logger';

export const adminRouter = Router();

/**
 * POST /api/admin/run-expiry
 *
 * Triggers the point expiry job manually.
 * Designed to be called by OS cron or an admin user.
 *
 * Optional body:
 *   { "currentMonth": "2026-08-01" }  — override for testing
 *
 * Returns:
 *   { expiredCount, totalPointsExpired, details }
 */
adminRouter.post('/run-expiry', async (req: Request, res: Response) => {
  try {
    const overrideMonth = req.body?.currentMonth || undefined;

    if (overrideMonth && !/^\d{4}-\d{2}-01$/.test(overrideMonth)) {
      res.status(400).json({
        error: 'Invalid currentMonth format. Expected YYYY-MM-01',
      });
      return;
    }

    const result = await runExpiry(pool, overrideMonth);

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    logger.error({ err }, 'POST /api/admin/run-expiry failed');
    res.status(500).json({
      error: 'Expiry job failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

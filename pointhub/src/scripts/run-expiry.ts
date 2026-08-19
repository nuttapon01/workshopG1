/**
 * Standalone script to run the point expiry job.
 * Usage: npm run expiry
 *
 * Can be triggered by OS cron outside the HTTP server.
 * Connects to DB, runs expiry, prints results, exits.
 */

import pool from '../db/pool';
import { runExpiry } from '../jobs/expire-points';
import { logger } from '../middleware/logger';

async function main() {
  logger.info('Running point expiry (standalone script)');

  try {
    const result = await runExpiry(pool);

    if (result.expiredCount === 0) {
      logger.info('No points to expire');
    } else {
      logger.info(
        {
          expiredCount: result.expiredCount,
          totalPointsExpired: result.totalPointsExpired,
        },
        'Expiry complete'
      );

      for (const d of result.details) {
        logger.info(
          { memberId: d.memberId, earnedMonth: d.earnedMonth, points: d.pointsExpired },
          'Expired'
        );
      }
    }

    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Expiry script failed');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

import { Pool } from 'pg';
import { logger } from '../middleware/logger';
import { formatPgDate, getCurrentBangkokMonth } from '../utils/date';

/**
 * Point Expiry Job
 *
 * Business rule: Points expire 12 months after their earned month.
 * Timezone: All month calculations use Bangkok time (Asia/Bangkok).
 *
 * Logic:
 * 1. Determine current month in Bangkok timezone (first day of month).
 * 2. Find all (member_id, earned_month) combinations where
 *    earned_month + 12 months < current Bangkok month.
 * 3. Sum EARN + EXPIRY entries per member×month. If net > 0, there are
 *    unexpired points remaining (handles back-dated earns into settled months).
 * 4. Insert a negative EXPIRY entry for the remaining net points.
 *
 * Idempotency: Uses net sum (EARN + EXPIRY) with HAVING > 0. If all points
 * for a member×month are already expired, the sum is 0 and the row is skipped.
 * Safe to run multiple times — also picks up back-dated earns.
 */

export interface ExpiryResult {
  expiredCount: number;
  totalPointsExpired: number;
  details: Array<{
    memberId: string;
    earnedMonth: string;
    pointsExpired: number;
  }>;
}

/**
 * Run the point expiry job.
 *
 * @param pool - Database connection pool
 * @param overrideCurrentMonth - Optional override for testing (format: "YYYY-MM-01")
 * @returns ExpiryResult with details of what was expired
 */
export async function runExpiry(
  pool: Pool,
  overrideCurrentMonth?: string
): Promise<ExpiryResult> {
  const currentMonth = overrideCurrentMonth || getCurrentBangkokMonth();

  logger.info({ currentMonth }, 'Starting point expiry job');

  // Find all member×earned_month pairs that are eligible for expiry:
  // - earned_month + 12 months < current Bangkok month
  // - Net sum of EARN + EXPIRY entries is still positive (handles back-dated earns)
  const eligibleQuery = `
    SELECT
      pl.member_id,
      pl.earned_month,
      SUM(pl.points) AS net_points
    FROM points_ledger pl
    WHERE pl.entry_type IN ('EARN', 'EXPIRY')
      AND pl.earned_month IS NOT NULL
      AND pl.earned_month + INTERVAL '12 months' < $1::date
    GROUP BY pl.member_id, pl.earned_month
    HAVING SUM(pl.points) > 0
    ORDER BY pl.earned_month, pl.member_id
  `;

  const { rows } = await pool.query(eligibleQuery, [currentMonth]);

  if (rows.length === 0) {
    logger.info('No points eligible for expiry');
    return { expiredCount: 0, totalPointsExpired: 0, details: [] };
  }

  // Insert EXPIRY entries in a single transaction
  const client = await pool.connect();
  const details: ExpiryResult['details'] = [];
  let totalPointsExpired = 0;

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const pointsToExpire = -Math.abs(row.net_points); // negative entry
      const earnedMonthStr = formatPgDate(row.earned_month);

      await client.query(
        `INSERT INTO points_ledger (member_id, entry_type, points, description, earned_month)
         VALUES ($1, 'EXPIRY', $2, $3, $4)`,
        [
          row.member_id,
          pointsToExpire,
          `Points expired for earned month ${earnedMonthStr}`,
          row.earned_month,
        ]
      );

      details.push({
        memberId: row.member_id,
        earnedMonth: earnedMonthStr,
        pointsExpired: Math.abs(row.net_points),
      });
      totalPointsExpired += Math.abs(row.net_points);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Expiry job failed — rolled back');
    throw err;
  } finally {
    client.release();
  }

  logger.info(
    { expiredCount: details.length, totalPointsExpired },
    'Point expiry job completed'
  );

  return {
    expiredCount: details.length,
    totalPointsExpired,
    details,
  };
}

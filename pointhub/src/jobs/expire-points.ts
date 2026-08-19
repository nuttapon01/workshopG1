import { Pool } from 'pg';
import { logger } from '../middleware/logger';

/**
 * Point Expiry Job
 *
 * Business rule: Points expire 12 months after their earned month.
 * Timezone: All month calculations use Bangkok time (Asia/Bangkok).
 *
 * Logic:
 * 1. Determine current month in Bangkok timezone (first day of month).
 * 2. Find all (member_id, earned_month) combinations from EARN entries
 *    where earned_month + 12 months < current Bangkok month.
 * 3. For each eligible combination, sum the net points (EARN minus any
 *    already-posted EXPIRY for that member×month).
 * 4. If net remaining > 0 and no EXPIRY entry already exists for that
 *    member×month, insert a negative EXPIRY entry.
 *
 * Idempotency: Uses NOT EXISTS to skip member×month pairs that already
 * have an EXPIRY entry. Safe to run multiple times.
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
 * Get the current Bangkok month as a date string (first day of month).
 * e.g. "2026-08-01"
 */
export function getCurrentBangkokMonth(): string {
  const now = new Date();
  // Get current date in Bangkok timezone
  const bangkokDate = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  );
  const year = bangkokDate.getFullYear();
  const month = String(bangkokDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
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
  // - Have EARN entries with positive net points
  // - Do NOT already have an EXPIRY entry for that member×month
  const eligibleQuery = `
    SELECT
      pl.member_id,
      pl.earned_month,
      SUM(pl.points) AS net_points
    FROM points_ledger pl
    WHERE pl.entry_type = 'EARN'
      AND pl.earned_month IS NOT NULL
      AND pl.earned_month + INTERVAL '12 months' < $1::date
      AND NOT EXISTS (
        SELECT 1 FROM points_ledger ex
        WHERE ex.member_id = pl.member_id
          AND ex.earned_month = pl.earned_month
          AND ex.entry_type = 'EXPIRY'
      )
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
      const earnedMonthStr = row.earned_month instanceof Date
        ? row.earned_month.toISOString().substring(0, 10)
        : String(row.earned_month);

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

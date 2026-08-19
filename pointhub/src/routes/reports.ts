import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { logger } from '../middleware/logger';

export const reportsRouter = Router();

/**
 * GET /api/reports/liability
 * 
 * Point liability summary for Finance:
 * - Total outstanding points (sum of all ledger entries)
 * - Breakdown by tier
 * - Points expiring in the next 1, 2, 3 months
 */
reportsRouter.get('/liability', async (_req: Request, res: Response) => {
  try {
    // Total outstanding points, grouped by tier
    const byTier = await pool.query(
      `SELECT m.tier, COALESCE(SUM(pl.points), 0) AS total_points, COUNT(DISTINCT pl.member_id) AS member_count
       FROM points_ledger pl
       JOIN members m ON pl.member_id = m.member_id
       GROUP BY m.tier
       ORDER BY m.tier`
    );

    const totalPoints = byTier.rows.reduce((sum: number, r: any) => sum + parseInt(r.total_points, 10), 0);

    // Points expiring in the next 3 months
    // Points expire 12 months after the month earned
    // earned_month + 12 months = expiry date
    // So if earned_month = '2026-01-01', expires at end of '2027-01-31'
    // NOTE: We sum EARN + EXPIRY entries per earned_month so that already-expired
    // points are not double-counted in projections.
    const now = new Date();
    // Use Bangkok time for "now"
    const bangkokNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const currentMonth = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), 1);

    const expiringResult = await pool.query(
      `SELECT
         pl.earned_month,
         COALESCE(SUM(pl.points), 0) AS points
       FROM points_ledger pl
       WHERE pl.earned_month IS NOT NULL
         AND pl.entry_type IN ('EARN', 'EXPIRY')
       GROUP BY pl.earned_month
       HAVING SUM(pl.points) > 0
       ORDER BY pl.earned_month`
    );

    // Calculate which months are expiring in next 1, 2, 3 months
    const expiringIn1Month = { month: '', points: 0 };
    const expiringIn2Months = { month: '', points: 0 };
    const expiringIn3Months = { month: '', points: 0 };

    for (const row of expiringResult.rows) {
      if (!row.earned_month) continue;
      const earnedDate = new Date(row.earned_month);
      // Expiry: 12 months after the earned month (end of that month)
      const expiryMonth = new Date(earnedDate.getFullYear(), earnedDate.getMonth() + 12, 1);

      const monthsUntilExpiry = (expiryMonth.getFullYear() - currentMonth.getFullYear()) * 12
        + (expiryMonth.getMonth() - currentMonth.getMonth());

      if (monthsUntilExpiry <= 1 && monthsUntilExpiry > 0) {
        expiringIn1Month.points += parseInt(row.points, 10);
      }
      if (monthsUntilExpiry <= 2 && monthsUntilExpiry > 0) {
        expiringIn2Months.points += parseInt(row.points, 10);
      }
      if (monthsUntilExpiry <= 3 && monthsUntilExpiry > 0) {
        expiringIn3Months.points += parseInt(row.points, 10);
      }
    }

    return res.json({
      totalOutstandingPoints: totalPoints,
      byTier: byTier.rows.map(r => ({
        tier: r.tier,
        totalPoints: parseInt(r.total_points, 10),
        memberCount: parseInt(r.member_count, 10),
      })),
      expiring: {
        next1Month: expiringIn1Month.points,
        next2Months: expiringIn2Months.points,
        next3Months: expiringIn3Months.points,
      },
      generatedAt: bangkokNow.toISOString(),
    });
  } catch (err: any) {
    logger.error({ err }, 'Report error');
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

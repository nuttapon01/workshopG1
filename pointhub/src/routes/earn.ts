import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { calculateBasketPoints, TransactionLine } from '../engine/calculate-points';

export const earnRouter = Router();

interface EarnRequest {
  transactionId: string;
  type?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  storeId: string;
  memberId: string;
  tier: string;
  lines: { lineNo: number; category: string; amountTHB: number }[];
}

/**
 * POST /api/earn
 *
 * Accepts a POS sale transaction and calculates + posts earn points.
 * Idempotent: if the same transactionId is submitted twice, returns the existing result.
 */
earnRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body: EarnRequest = req.body;
    const { transactionId, date, time, storeId, memberId, tier, lines } = body;

    if (!transactionId || !date || !time || !storeId || !memberId || !tier || !lines?.length) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Idempotency check: if transaction already processed, return existing result
    const existing = await pool.query(
      'SELECT transaction_id, points_posted, total_milli_points FROM transactions WHERE transaction_id = $1',
      [transactionId]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.json({
        transactionId: row.transaction_id,
        pointsPosted: row.points_posted,
        totalMilliPoints: row.total_milli_points,
        duplicate: true,
      });
    }

    // Calculate points
    const txLines: TransactionLine[] = lines.map((l) => ({
      lineNo: l.lineNo,
      category: l.category,
      amountTHB: l.amountTHB,
    }));

    const { lineResults, totalMilliPoints, pointsPosted } = await calculateBasketPoints(
      txLines,
      tier,
      date
    );

    // Store in a DB transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert transaction header
      const totalAmount = lines.reduce((sum, l) => sum + l.amountTHB, 0);
      await client.query(
        `INSERT INTO transactions (transaction_id, type, date, time, store_id, member_id, tier, total_amount_thb, total_milli_points, points_posted)
         VALUES ($1, 'SALE', $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          transactionId,
          date,
          time,
          storeId,
          memberId,
          tier,
          totalAmount,
          totalMilliPoints,
          pointsPosted,
        ]
      );

      // Insert line items
      for (const lr of lineResults) {
        await client.query(
          `INSERT INTO transaction_lines (transaction_id, line_no, category, amount_thb, winning_campaign, multiplier_millipercent, milli_points)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            transactionId,
            lr.lineNo,
            lr.category,
            lr.amountTHB,
            lr.winningCampaign,
            lr.multiplierMillipercent,
            lr.milliPoints,
          ]
        );
      }

      // Post to ledger
      // earned_month: first day of the month the transaction occurred
      const earnedMonth = date.substring(0, 7) + '-01'; // e.g. "2026-09-01"
      await client.query(
        `INSERT INTO points_ledger (member_id, transaction_id, entry_type, points, description, earned_month)
         VALUES ($1, $2, 'EARN', $3, $4, $5)`,
        [
          memberId,
          transactionId,
          pointsPosted,
          `Earned from transaction ${transactionId}`,
          earnedMonth,
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({
      transactionId,
      pointsPosted,
      totalMilliPoints,
      lineResults,
      duplicate: false,
    });
  } catch (err: any) {
    console.error('Earn error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

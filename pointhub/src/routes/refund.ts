import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { calculateBasketPoints, TransactionLine } from '../engine/calculate-points';

export const refundRouter = Router();

interface RefundRequest {
  transactionId: string;
  originalTransactionId: string;
  date: string;
  time: string;
  storeId: string;
  memberId: string;
  tier: string;
  lines: { lineNo: number; category: string; amountTHB: number }[]; // amountTHB is negative
}

/**
 * POST /api/refund
 * 
 * Processes a refund transaction:
 * - Full refund: reverses exactly the points earned by the original transaction.
 * - Partial refund: recomputes the basket without the returned lines, then claws back
 *   the difference (originalPoints - recomputedPoints).
 * 
 * Idempotent: duplicate refund transactionId returns existing result.
 */
refundRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body: RefundRequest = req.body;
    const { transactionId, originalTransactionId, date, time, storeId, memberId, tier, lines } = body;

    if (!transactionId || !originalTransactionId || !date || !memberId || !lines?.length) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Idempotency check
    const existing = await pool.query(
      'SELECT transaction_id, points_posted FROM transactions WHERE transaction_id = $1',
      [transactionId]
    );
    if (existing.rows.length > 0) {
      return res.json({
        transactionId: existing.rows[0].transaction_id,
        pointsClawedBack: -existing.rows[0].points_posted,
        duplicate: true,
      });
    }

    // Get the original transaction
    const origTx = await pool.query(
      'SELECT * FROM transactions WHERE transaction_id = $1',
      [originalTransactionId]
    );
    if (origTx.rows.length === 0) {
      return res.status(404).json({ error: `Original transaction ${originalTransactionId} not found` });
    }
    const original = origTx.rows[0];
    const originalPointsPosted: number = original.points_posted;

    // Get the original line items
    const origLines = await pool.query(
      'SELECT line_no, category, amount_thb FROM transaction_lines WHERE transaction_id = $1 ORDER BY line_no',
      [originalTransactionId]
    );

    // Determine which original lines are being refunded
    // Refund lines have negative amounts; match by lineNo
    const refundedLineNos = new Set(lines.map(l => l.lineNo));

    // Check if it's a full or partial refund
    const isFullRefund = origLines.rows.length === lines.length &&
      origLines.rows.every((ol: any) => refundedLineNos.has(ol.line_no));

    let pointsToClawBack: number;

    if (isFullRefund) {
      // Full refund: claw back exactly the points that were earned
      pointsToClawBack = originalPointsPosted;
    } else {
      // Partial refund: recompute the basket without the returned lines
      const remainingLines: TransactionLine[] = origLines.rows
        .filter((ol: any) => !refundedLineNos.has(ol.line_no))
        .map((ol: any) => ({
          lineNo: ol.line_no,
          category: ol.category,
          amountTHB: ol.amount_thb,
        }));

      // Recompute with original date and tier
      const { pointsPosted: recomputedPoints } = await calculateBasketPoints(
        remainingLines, original.tier, original.date instanceof Date
          ? original.date.toISOString().substring(0, 10)
          : String(original.date).substring(0, 10)
      );

      // Claw back = original - recomputed
      pointsToClawBack = originalPointsPosted - recomputedPoints;
    }

    // Store refund transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const totalAmount = lines.reduce((sum, l) => sum + l.amountTHB, 0); // negative
      await client.query(
        `INSERT INTO transactions (transaction_id, type, original_transaction_id, date, time, store_id, member_id, tier, total_amount_thb, total_milli_points, points_posted)
         VALUES ($1, 'REFUND', $2, $3, $4, $5, $6, $7, $8, 0, $9)`,
        [transactionId, originalTransactionId, date, time || '00:00', storeId || original.store_id, memberId, tier, totalAmount, -pointsToClawBack]
      );

      // Insert refund line items
      for (const l of lines) {
        await client.query(
          `INSERT INTO transaction_lines (transaction_id, line_no, category, amount_thb, winning_campaign, multiplier_millipercent, milli_points)
           VALUES ($1, $2, $3, $4, NULL, 1000, 0)`,
          [transactionId, l.lineNo, l.category, l.amountTHB]
        );
      }

      // Post clawback to ledger (negative points)
      await client.query(
        `INSERT INTO points_ledger (member_id, transaction_id, entry_type, points, description)
         VALUES ($1, $2, 'REFUND_CLAWBACK', $3, $4)`,
        [memberId, transactionId, -pointsToClawBack, `Refund of ${originalTransactionId}: clawed back ${pointsToClawBack} points`]
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
      originalTransactionId,
      pointsClawedBack: pointsToClawBack,
      isFullRefund,
      duplicate: false,
    });
  } catch (err: any) {
    console.error('Refund error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

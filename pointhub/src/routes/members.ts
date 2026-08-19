import { Router, Request, Response } from 'express';
import pool from '../db/pool';

export const membersRouter = Router();

/**
 * GET /api/members/:id
 * Returns member info (tier, joinedAt) from the member stub table.
 */
membersRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT member_id, tier, joined_at FROM members WHERE member_id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const m = result.rows[0];
    return res.json({
      memberId: m.member_id,
      tier: m.tier,
      joinedAt: m.joined_at,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * GET /api/members/:id/balance
 * Returns current point balance (sum of all ledger entries).
 */
membersRouter.get('/:id/balance', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT COALESCE(SUM(points), 0) AS balance FROM points_ledger WHERE member_id = $1',
      [id]
    );
    return res.json({
      memberId: id,
      balance: parseInt(result.rows[0].balance, 10),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * GET /api/members/:id/history
 * Returns transaction/ledger history for a member.
 * Includes which campaign/rule produced each entry.
 */
membersRouter.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get ledger entries with transaction details
    const result = await pool.query(
      `SELECT
         pl.id,
         pl.entry_type,
         pl.points,
         pl.description,
         pl.reason_code,
         pl.transaction_id,
         pl.created_at,
         t.type AS tx_type,
         t.date AS tx_date,
         t.store_id,
         t.total_amount_thb
       FROM points_ledger pl
       LEFT JOIN transactions t ON pl.transaction_id = t.transaction_id
       WHERE pl.member_id = $1
       ORDER BY pl.created_at DESC, pl.id DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    // For earn entries, also fetch the line-level detail
    const entries = [];
    for (const row of result.rows) {
      const entry: any = {
        id: row.id,
        entryType: row.entry_type,
        points: row.points,
        description: row.description,
        reasonCode: row.reason_code,
        transactionId: row.transaction_id,
        createdAt: row.created_at,
        txType: row.tx_type,
        txDate: row.tx_date,
        storeId: row.store_id,
        totalAmountTHB: row.total_amount_thb,
      };

      if (row.transaction_id && (row.entry_type === 'EARN' || row.tx_type === 'SALE')) {
        const linesResult = await pool.query(
          `SELECT line_no, category, amount_thb, winning_campaign, multiplier_millipercent, milli_points
           FROM transaction_lines WHERE transaction_id = $1 ORDER BY line_no`,
          [row.transaction_id]
        );
        entry.lineDetails = linesResult.rows.map((l: any) => ({
          lineNo: l.line_no,
          category: l.category,
          amountTHB: l.amount_thb,
          winningCampaign: l.winning_campaign || 'BASE',
          multiplier: l.multiplier_millipercent / 1000,
          milliPoints: l.milli_points,
        }));
      }

      entries.push(entry);
    }

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM points_ledger WHERE member_id = $1',
      [id]
    );

    return res.json({
      memberId: id,
      entries,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

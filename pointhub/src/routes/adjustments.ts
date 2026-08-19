import { Router, Request, Response } from 'express';
import pool from '../db/pool';

export const adjustmentsRouter = Router();

// Valid reason codes per stakeholder
const VALID_REASON_CODES = ['GOODWILL', 'SYSTEM_ERROR', 'FRAUD_DEDUCT', 'EVENT_BONUS'];

interface AdjustmentRequest {
  memberId: string;
  points: number; // positive = add, negative = deduct
  reasonCode: string;
  description?: string;
}

/**
 * POST /api/adjustments
 * 
 * Manual point adjustment by customer service.
 * Full audit trail via the points_ledger.
 */
adjustmentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { memberId, points, reasonCode, description }: AdjustmentRequest = req.body;

    if (!memberId || points === undefined || points === null || !reasonCode) {
      return res.status(400).json({ error: 'Required: memberId, points, reasonCode' });
    }

    if (points === 0) {
      return res.status(400).json({ error: 'Points adjustment cannot be zero' });
    }

    if (!VALID_REASON_CODES.includes(reasonCode)) {
      return res.status(400).json({
        error: `Invalid reason code. Must be one of: ${VALID_REASON_CODES.join(', ')}`,
      });
    }

    // Verify member exists
    const memberResult = await pool.query(
      'SELECT member_id FROM members WHERE member_id = $1',
      [memberId]
    );
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Insert adjustment into ledger
    const result = await pool.query(
      `INSERT INTO points_ledger (member_id, entry_type, points, reason_code, description)
       VALUES ($1, 'ADJUSTMENT', $2, $3, $4)
       RETURNING id, created_at`,
      [memberId, points, reasonCode, description || `Manual adjustment: ${reasonCode}`]
    );

    // Get new balance
    const balanceResult = await pool.query(
      'SELECT COALESCE(SUM(points), 0) AS balance FROM points_ledger WHERE member_id = $1',
      [memberId]
    );

    return res.status(201).json({
      adjustmentId: result.rows[0].id,
      memberId,
      points,
      reasonCode,
      description: description || `Manual adjustment: ${reasonCode}`,
      newBalance: parseInt(balanceResult.rows[0].balance, 10),
      createdAt: result.rows[0].created_at,
    });
  } catch (err: any) {
    console.error('Adjustment error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * GET /api/adjustments?memberId=M1001
 * Lists adjustments for a member.
 */
adjustmentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const memberId = req.query.memberId as string;
    if (!memberId) {
      return res.status(400).json({ error: 'Query parameter memberId is required' });
    }

    const result = await pool.query(
      `SELECT id, member_id, points, reason_code, description, created_at
       FROM points_ledger
       WHERE member_id = $1 AND entry_type = 'ADJUSTMENT'
       ORDER BY created_at DESC`,
      [memberId]
    );

    return res.json({
      memberId,
      adjustments: result.rows.map(r => ({
        id: r.id,
        points: r.points,
        reasonCode: r.reason_code,
        description: r.description,
        createdAt: r.created_at,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

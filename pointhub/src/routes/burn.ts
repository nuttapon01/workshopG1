import { Router, Request, Response } from 'express';
import pool from '../db/pool';

export const burnRouter = Router();

interface BurnRequest {
  memberId: string;
  points: number; // must be >= 100, multiple of 100
  basketTotalTHB: number; // total basket amount
  transactionId?: string; // optional reference
}

/**
 * POST /api/burn
 *
 * Redeems (burns) points at checkout.
 * Rules:
 * - 1 point = 0.25 THB
 * - Minimum 100 points
 * - Must be in multiples of 100
 * - Cannot exceed 50% of basket total
 * - No earning points on the portion paid by points
 */
burnRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { memberId, points, basketTotalTHB, transactionId }: BurnRequest = req.body;

    if (!memberId || !points || !basketTotalTHB) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: memberId, points, basketTotalTHB' });
    }

    // Validation: minimum 100 points
    if (points < 100) {
      return res.status(400).json({ error: 'Minimum redemption is 100 points' });
    }

    // Validation: multiples of 100
    if (points % 100 !== 0) {
      return res.status(400).json({ error: 'Points must be redeemed in multiples of 100' });
    }

    // Validation: 50% cap
    // 1 point = 0.25 THB, so points * 0.25 = THB value, which must be <= 50% of basket
    // Using integer math: points * 25 (satang) vs basketTotalTHB * 100 (satang) * 50%
    // points * 25 <= basketTotalTHB * 50  =>  points <= basketTotalTHB * 2
    const maxPoints = Math.floor((basketTotalTHB * 2) / 100) * 100; // max redeemable, rounded down to multiple of 100
    if (points > maxPoints) {
      return res.status(400).json({
        error: `Cannot redeem more than 50% of basket. Max redeemable: ${maxPoints} points`,
        maxRedeemable: maxPoints,
      });
    }

    // Check member balance
    const balanceResult = await pool.query(
      'SELECT COALESCE(SUM(points), 0) AS balance FROM points_ledger WHERE member_id = $1',
      [memberId]
    );
    const balance = parseInt(balanceResult.rows[0].balance, 10);

    if (balance < points) {
      return res.status(400).json({
        error: `Insufficient balance. Current: ${balance}, requested: ${points}`,
        currentBalance: balance,
      });
    }

    // Calculate THB discount: points * 0.25 = points / 4
    const discountTHB = points / 4;

    // Post burn to ledger
    await pool.query(
      `INSERT INTO points_ledger (member_id, transaction_id, entry_type, points, description)
       VALUES ($1, $2, 'BURN', $3, $4)`,
      [
        memberId,
        transactionId || null,
        -points,
        `Redeemed ${points} points for ${discountTHB} THB discount`,
      ]
    );

    // The earn calculation for this basket should be on (basketTotalTHB - discountTHB) only
    // This is enforced by the POS: it sends the earn request with reduced basket amount.
    // We return the earnableAmountTHB for the POS to use.
    const earnableAmountTHB = basketTotalTHB - discountTHB;

    return res.json({
      memberId,
      pointsBurned: points,
      discountTHB,
      remainingBalance: balance - points,
      earnableAmountTHB,
    });
  } catch (err: any) {
    console.error('Burn error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

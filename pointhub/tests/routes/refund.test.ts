import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  getTestPool,
  seedMembers,
  seedCampaigns,
  clearAll,
  apiClient,
  earnPoints,
  getBalance,
} from '../helpers';
import { buildEarnPayload } from '../helpers/fixtures';

describe('POST /api/refund', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await clearAll(pool);
    await seedMembers(pool, [{ id: 'M001', tier: 'GOLD', joinedAt: '2020-01-15' }]);
    await seedCampaigns(pool, [
      {
        id: 'C1',
        name: 'Fresh Weekend',
        multiplier: 3000,
        category: 'FRESH',
        tier: null,
        dayOfWeek: [0, 6],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        priority: 10,
      },
    ]);

    // Seed an original transaction for refund tests
    const payload = buildEarnPayload({
      transactionId: 'TX-ORIG-001',
      memberId: 'M001',
      tier: 'GOLD',
      date: '2026-09-27', // Saturday — FRESH x3
      lines: [
        { lineNo: 1, category: 'FRESH', amountTHB: 200 },
        { lineNo: 2, category: 'GROCERY', amountTHB: 100 },
      ],
    });
    await earnPoints(payload);
  });

  describe('full refund', () => {
    it('claws back exactly the points earned by the original transaction', async () => {
      // Get original points
      const originalBalance = await getBalance(pool, 'M001');

      const res = await apiClient()
        .post('/api/refund')
        .send({
          transactionId: 'RF-FULL-001',
          originalTransactionId: 'TX-ORIG-001',
          date: '2026-09-28',
          time: '14:00',
          storeId: 'S001',
          memberId: 'M001',
          tier: 'GOLD',
          lines: [
            { lineNo: 1, category: 'FRESH', amountTHB: -200 },
            { lineNo: 2, category: 'GROCERY', amountTHB: -100 },
          ],
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.isFullRefund).toBe(true);
      expect(res.body.pointsClawedBack).toBe(originalBalance);
      expect(res.body.duplicate).toBe(false);

      // Balance should be 0
      const newBalance = await getBalance(pool, 'M001');
      expect(newBalance).toBe(0);
    });
  });

  describe('partial refund', () => {
    it('recomputes basket without refunded lines and claws back the difference', async () => {
      // Refund only line 1 (FRESH 200 THB at x3)
      const res = await apiClient()
        .post('/api/refund')
        .send({
          transactionId: 'RF-PART-001',
          originalTransactionId: 'TX-ORIG-001',
          date: '2026-09-28',
          time: '14:00',
          storeId: 'S001',
          memberId: 'M001',
          tier: 'GOLD',
          lines: [{ lineNo: 1, category: 'FRESH', amountTHB: -200 }],
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.isFullRefund).toBe(false);
      // Original: FRESH 200 at x3 + GROCERY 100 at x3 (Sat so C1 FRESH only → GROCERY at base)
      // Original milli: 200*3000/25 + 100*3000/25 = 24000 + 12000... wait
      // Actually C1 is FRESH category only. GROCERY doesn't match.
      // Original: FRESH 200 at x3=24000, GROCERY 100 at x1=4000 → total 28000 → 28 pts
      // After removing line 1: only GROCERY 100 at x1=4000 → 4 pts
      // Clawback: 28 - 4 = 24
      expect(res.body.pointsClawedBack).toBe(24);

      const newBalance = await getBalance(pool, 'M001');
      expect(newBalance).toBe(4); // only line 2 value remains
    });
  });

  describe('missing original transaction', () => {
    it('returns 404 when original transaction does not exist', async () => {
      const res = await apiClient()
        .post('/api/refund')
        .send({
          transactionId: 'RF-NOTFOUND-001',
          originalTransactionId: 'TX-NONEXISTENT',
          date: '2026-09-28',
          time: '14:00',
          storeId: 'S001',
          memberId: 'M001',
          tier: 'GOLD',
          lines: [{ lineNo: 1, category: 'FRESH', amountTHB: -200 }],
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('idempotency (duplicate refund)', () => {
    it('returns the same result without creating a duplicate entry', async () => {
      const refundPayload = {
        transactionId: 'RF-IDEM-001',
        originalTransactionId: 'TX-ORIG-001',
        date: '2026-09-28',
        time: '14:00',
        storeId: 'S001',
        memberId: 'M001',
        tier: 'GOLD',
        lines: [
          { lineNo: 1, category: 'FRESH', amountTHB: -200 },
          { lineNo: 2, category: 'GROCERY', amountTHB: -100 },
        ],
      };

      const first = await apiClient()
        .post('/api/refund')
        .send(refundPayload)
        .set('Content-Type', 'application/json');

      const second = await apiClient()
        .post('/api/refund')
        .send(refundPayload)
        .set('Content-Type', 'application/json');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.duplicate).toBe(true);

      // Only one clawback in ledger
      const ledger = await pool.query(
        "SELECT * FROM points_ledger WHERE entry_type = 'REFUND_CLAWBACK' AND member_id = 'M001'"
      );
      expect(ledger.rows.length).toBe(1);
    });
  });

  describe('missing required fields', () => {
    it('returns 400 when originalTransactionId is missing', async () => {
      const res = await apiClient()
        .post('/api/refund')
        .send({
          transactionId: 'RF-BAD-001',
          date: '2026-09-28',
          memberId: 'M001',
          lines: [{ lineNo: 1, category: 'FRESH', amountTHB: -200 }],
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
    });
  });
});

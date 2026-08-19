import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  getTestPool,
  seedMembers,
  seedCampaigns,
  clearAll,
  apiClient,
  earnPoints,
} from '../helpers';
import { buildEarnPayload } from '../helpers/fixtures';

describe('POST /api/earn', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await clearAll(pool);
    await seedMembers(pool, [
      { id: 'M001', tier: 'GOLD', joinedAt: '2020-01-15' },
      { id: 'M002', tier: 'SILVER', joinedAt: '2023-06-01' },
    ]);
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
  });

  describe('valid sale', () => {
    it('returns 200 with pointsPosted and lineResults', async () => {
      const payload = buildEarnPayload({
        transactionId: 'TX-TEST-001',
        memberId: 'M001',
        tier: 'GOLD',
        date: '2026-09-27', // Saturday
        lines: [
          { lineNo: 1, category: 'FRESH', amountTHB: 100 },
          { lineNo: 2, category: 'GROCERY', amountTHB: 200 },
        ],
      });

      const res = await earnPoints(payload);

      expect(res.status).toBe(200);
      expect(res.body.transactionId).toBe('TX-TEST-001');
      expect(res.body.pointsPosted).toBeGreaterThan(0);
      expect(res.body.lineResults).toHaveLength(2);
      expect(res.body.duplicate).toBe(false);
    });

    it('correctly calculates points using campaign multiplier', async () => {
      const payload = buildEarnPayload({
        transactionId: 'TX-TEST-002',
        memberId: 'M001',
        tier: 'GOLD',
        date: '2026-09-27', // Saturday — C1 FRESH x3 applies
        lines: [
          { lineNo: 1, category: 'FRESH', amountTHB: 250 },
        ],
      });

      const res = await earnPoints(payload);

      expect(res.status).toBe(200);
      // 250 * 3000 / 25 = 30000 milli-points → 30 points
      expect(res.body.totalMilliPoints).toBe(30000);
      expect(res.body.pointsPosted).toBe(30);
    });

    it('posts earn entry to the ledger', async () => {
      const payload = buildEarnPayload({
        transactionId: 'TX-TEST-003',
        memberId: 'M001',
        tier: 'GOLD',
        date: '2026-09-10', // Wednesday — base rate
        lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: 100 }],
      });

      await earnPoints(payload);

      const ledger = await pool.query(
        "SELECT * FROM points_ledger WHERE member_id = 'M001' AND entry_type = 'EARN'"
      );
      expect(ledger.rows.length).toBe(1);
      expect(ledger.rows[0].points).toBe(4); // 100 * 1000 / 25 = 4000 milli → 4 pts
    });
  });

  describe('missing fields', () => {
    it('returns 400 when transactionId is missing', async () => {
      const res = await apiClient()
        .post('/api/earn')
        .send({ date: '2026-09-10', time: '10:00', storeId: 'S001', memberId: 'M001', tier: 'GOLD', lines: [{ lineNo: 1, category: 'FRESH', amountTHB: 100 }] })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing');
    });

    it('returns 400 when lines are empty', async () => {
      const res = await apiClient()
        .post('/api/earn')
        .send({ transactionId: 'TX-BAD', date: '2026-09-10', time: '10:00', storeId: 'S001', memberId: 'M001', tier: 'GOLD', lines: [] })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing');
    });

    it('returns 400 when memberId is missing', async () => {
      const res = await apiClient()
        .post('/api/earn')
        .send({ transactionId: 'TX-BAD2', date: '2026-09-10', time: '10:00', storeId: 'S001', tier: 'GOLD', lines: [{ lineNo: 1, category: 'FRESH', amountTHB: 100 }] })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
    });
  });

  describe('idempotency (duplicate transactionId)', () => {
    it('returns the same result without creating a duplicate entry', async () => {
      const payload = buildEarnPayload({
        transactionId: 'TX-IDEM-001',
        memberId: 'M001',
        tier: 'GOLD',
        date: '2026-09-10',
        lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: 500 }],
      });

      const first = await earnPoints(payload);
      const second = await earnPoints(payload);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.duplicate).toBe(true);
      expect(second.body.pointsPosted).toBe(first.body.pointsPosted);

      // Only one ledger entry
      const ledger = await pool.query(
        "SELECT * FROM points_ledger WHERE transaction_id = 'TX-IDEM-001'"
      );
      expect(ledger.rows.length).toBe(1);
    });
  });
});

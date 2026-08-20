import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, seedMembers, clearAll, makeAdjustment } from '../helpers';

describe('POST /api/adjustments', () => {
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
  });

  describe('valid adjustment', () => {
    it('adds positive points with GOODWILL reason', async () => {
      const res = await makeAdjustment({
        memberId: 'M001',
        points: 500,
        reasonCode: 'GOODWILL',
        description: 'Customer compensation',
      });

      expect(res.status).toBe(201);
      expect(res.body.memberId).toBe('M001');
      expect(res.body.points).toBe(500);
      expect(res.body.reasonCode).toBe('GOODWILL');
      expect(res.body.newBalance).toBe(500);
      expect(res.body.adjustmentId).toBeDefined();
    });

    it('deducts negative points with FRAUD_DEDUCT reason', async () => {
      // First give some points
      await makeAdjustment({
        memberId: 'M001',
        points: 1000,
        reasonCode: 'EVENT_BONUS',
      });

      const res = await makeAdjustment({
        memberId: 'M001',
        points: -200,
        reasonCode: 'FRAUD_DEDUCT',
        description: 'Fraudulent activity deduction',
      });

      expect(res.status).toBe(201);
      expect(res.body.points).toBe(-200);
      expect(res.body.newBalance).toBe(800);
    });

    it('allows balance to go negative (per business rule)', async () => {
      const res = await makeAdjustment({
        memberId: 'M001',
        points: -100,
        reasonCode: 'FRAUD_DEDUCT',
      });

      expect(res.status).toBe(201);
      expect(res.body.newBalance).toBe(-100);
    });
  });

  describe('invalid reason code', () => {
    it('returns 400 for unrecognized reason code', async () => {
      const res = await makeAdjustment({
        memberId: 'M001',
        points: 100,
        reasonCode: 'INVALID_CODE',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid reason code');
    });
  });

  describe('zero points', () => {
    it('returns 400 when points is zero', async () => {
      const res = await makeAdjustment({
        memberId: 'M001',
        points: 0,
        reasonCode: 'GOODWILL',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('zero');
    });
  });

  describe('member not found', () => {
    it('returns 404 when member does not exist', async () => {
      const res = await makeAdjustment({
        memberId: 'M999',
        points: 100,
        reasonCode: 'GOODWILL',
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Member not found');
    });
  });

  describe('missing required fields', () => {
    it('returns 400 when reasonCode is missing', async () => {
      const res = await makeAdjustment({
        memberId: 'M001',
        points: 100,
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when memberId is missing', async () => {
      const res = await makeAdjustment({
        points: 100,
        reasonCode: 'GOODWILL',
      });

      expect(res.status).toBe(400);
    });
  });
});

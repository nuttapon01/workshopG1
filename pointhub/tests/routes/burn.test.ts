import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, seedMembers, clearAll, insertLedgerEntry, apiClient } from '../helpers';

describe('POST /api/burn', () => {
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
    // Give member 1000 points balance
    await insertLedgerEntry(pool, {
      memberId: 'M001',
      entryType: 'EARN',
      points: 1000,
      description: 'Test seed balance',
    });
  });

  describe('valid burn', () => {
    it('burns points and returns discount info', async () => {
      const res = await apiClient()
        .post('/api/burn')
        .send({
          memberId: 'M001',
          points: 400,
          basketTotalTHB: 1000,
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);
      expect(res.body.pointsBurned).toBe(400);
      expect(res.body.discountTHB).toBe(100); // 400 / 4
      expect(res.body.remainingBalance).toBe(600);
      expect(res.body.earnableAmountTHB).toBe(900); // 1000 - 100
    });
  });

  describe('minimum 100 points validation', () => {
    it('returns 400 when trying to burn less than 100 points', async () => {
      const res = await apiClient()
        .post('/api/burn')
        .send({
          memberId: 'M001',
          points: 50,
          basketTotalTHB: 1000,
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('100');
    });
  });

  describe('multiples of 100 validation', () => {
    it('returns 400 when points are not a multiple of 100', async () => {
      const res = await apiClient()
        .post('/api/burn')
        .send({
          memberId: 'M001',
          points: 150,
          basketTotalTHB: 1000,
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('multiples of 100');
    });
  });

  describe('50% cap validation', () => {
    it('returns 400 when burn exceeds 50% of basket value', async () => {
      // basketTotalTHB = 200, max points = 200 * 2 / 100 * 100 = 400 → rounded: floor(400/100)*100 = 400
      // Actually: maxPoints = Math.floor(basketTotalTHB * 2 / 100) * 100
      // For basket 200: Math.floor(200*2/100)*100 = Math.floor(4)*100 = 400
      // For basket 100: Math.floor(100*2/100)*100 = Math.floor(2)*100 = 200
      // Trying to burn 400 with basket 100 → exceeds
      const res = await apiClient()
        .post('/api/burn')
        .send({
          memberId: 'M001',
          points: 400,
          basketTotalTHB: 100, // max redeemable = Math.floor(100*2/100)*100 = 200
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('50%');
      expect(res.body.maxRedeemable).toBe(200);
    });
  });

  describe('insufficient balance', () => {
    it('returns 400 when member does not have enough points', async () => {
      const res = await apiClient()
        .post('/api/burn')
        .send({
          memberId: 'M001',
          points: 2000, // only has 1000
          basketTotalTHB: 10000,
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Insufficient');
      expect(res.body.currentBalance).toBe(1000);
    });
  });

  describe('missing fields', () => {
    it('returns 400 when memberId is missing', async () => {
      const res = await apiClient()
        .post('/api/burn')
        .send({ points: 100, basketTotalTHB: 1000 })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
    });
  });
});

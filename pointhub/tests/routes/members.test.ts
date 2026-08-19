import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  getTestPool,
  seedMembers,
  clearAll,
  insertLedgerEntry,
  apiClient,
  getMemberBalance,
  getMemberHistory,
} from '../helpers';

describe('GET /api/members', () => {
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
  });

  describe('GET /api/members/:id', () => {
    it('returns member info when found', async () => {
      const res = await apiClient().get('/api/members/M001');

      expect(res.status).toBe(200);
      expect(res.body.memberId).toBe('M001');
      expect(res.body.tier).toBe('GOLD');
      expect(res.body.joinedAt).toBeDefined();
    });

    it('returns 404 when member not found', async () => {
      const res = await apiClient().get('/api/members/NONEXISTENT');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('GET /api/members/:id/balance', () => {
    it('returns correct balance from ledger', async () => {
      await insertLedgerEntry(pool, {
        memberId: 'M001',
        entryType: 'EARN',
        points: 500,
        description: 'Test earn',
      });
      await insertLedgerEntry(pool, {
        memberId: 'M001',
        entryType: 'BURN',
        points: -100,
        description: 'Test burn',
      });

      const res = await getMemberBalance('M001');

      expect(res.status).toBe(200);
      expect(res.body.memberId).toBe('M001');
      expect(res.body.balance).toBe(400); // 500 - 100
    });

    it('returns 0 balance when no ledger entries exist', async () => {
      const res = await getMemberBalance('M002');

      expect(res.status).toBe(200);
      expect(res.body.balance).toBe(0);
    });
  });

  describe('GET /api/members/:id/history', () => {
    beforeEach(async () => {
      // Insert multiple ledger entries
      for (let i = 1; i <= 10; i++) {
        await insertLedgerEntry(pool, {
          memberId: 'M001',
          entryType: 'EARN',
          points: i * 10,
          description: `Earn entry ${i}`,
        });
      }
    });

    it('returns paginated history', async () => {
      const res = await getMemberHistory('M001', { limit: '5', offset: '0' });

      expect(res.status).toBe(200);
      expect(res.body.memberId).toBe('M001');
      expect(res.body.entries).toHaveLength(5);
      expect(res.body.total).toBe(10);
      expect(res.body.limit).toBe(5);
      expect(res.body.offset).toBe(0);
    });

    it('returns second page with offset', async () => {
      const res = await getMemberHistory('M001', { limit: '5', offset: '5' });

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(5);
      expect(res.body.offset).toBe(5);
    });

    it('returns empty entries for member with no history', async () => {
      const res = await getMemberHistory('M002');

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });
});

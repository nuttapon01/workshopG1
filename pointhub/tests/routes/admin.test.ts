import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  getTestPool,
  seedMembers,
  clearAll,
  insertLedgerEntry,
  runExpiry,
} from '../helpers';

describe('POST /api/admin/run-expiry', () => {
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

  describe('basic expiry', () => {
    it('expires points older than 12 months', async () => {
      // Insert points earned in Sep 2025 — should expire by Oct 2026
      await insertLedgerEntry(pool, {
        memberId: 'M001',
        entryType: 'EARN',
        points: 200,
        earnedMonth: '2025-08-01', // 12+ months ago from currentMonth override
      });

      // Still valid points (recent)
      await insertLedgerEntry(pool, {
        memberId: 'M001',
        entryType: 'EARN',
        points: 300,
        earnedMonth: '2026-09-01',
      });

      const res = await runExpiry()
        .send({ currentMonth: '2026-09-01' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalPointsExpired).toBeGreaterThanOrEqual(200);
    });
  });

  describe('idempotent re-run', () => {
    it('does not expire points twice', async () => {
      await insertLedgerEntry(pool, {
        memberId: 'M001',
        entryType: 'EARN',
        points: 500,
        earnedMonth: '2025-06-01',
      });

      // First run
      const first = await runExpiry()
        .send({ currentMonth: '2026-09-01' });
      expect(first.status).toBe(200);
      const firstExpired = first.body.totalPointsExpired;

      // Second run (same month) — should expire nothing new
      const second = await runExpiry()
        .send({ currentMonth: '2026-09-01' });
      expect(second.status).toBe(200);
      expect(second.body.totalPointsExpired).toBe(0);

      // Verify only one EXPIRY entry in ledger
      const ledger = await pool.query(
        "SELECT * FROM points_ledger WHERE entry_type = 'EXPIRY' AND member_id = 'M001'"
      );
      expect(ledger.rows.length).toBe(1);
      expect(ledger.rows[0].points).toBe(-firstExpired);
    });
  });

  describe('no expired points', () => {
    it('returns 0 when all points are within 12 months', async () => {
      await insertLedgerEntry(pool, {
        memberId: 'M001',
        entryType: 'EARN',
        points: 100,
        earnedMonth: '2026-08-01', // only 1 month old
      });

      const res = await runExpiry()
        .send({ currentMonth: '2026-09-01' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalPointsExpired).toBe(0);
    });
  });

  describe('multiple members', () => {
    it('expires points for all qualifying members', async () => {
      await insertLedgerEntry(pool, {
        memberId: 'M001',
        entryType: 'EARN',
        points: 100,
        earnedMonth: '2025-07-01',
      });
      await insertLedgerEntry(pool, {
        memberId: 'M002',
        entryType: 'EARN',
        points: 200,
        earnedMonth: '2025-07-01',
      });

      const res = await runExpiry()
        .send({ currentMonth: '2026-09-01' });

      expect(res.status).toBe(200);
      expect(res.body.totalPointsExpired).toBe(300);
    });
  });
});

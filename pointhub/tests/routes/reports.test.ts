import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import {
  getTestPool,
  seedMembers,
  clearAll,
  insertLedgerEntry,
  getLiabilityReport,
} from '../helpers';

describe('GET /api/reports/liability', () => {
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
      { id: 'M003', tier: 'PLATINUM', joinedAt: '2018-03-20' },
    ]);
  });

  it('returns liability summary with total points and breakdown by tier', async () => {
    await insertLedgerEntry(pool, {
      memberId: 'M001',
      entryType: 'EARN',
      points: 500,
      earnedMonth: '2026-09-01',
    });
    await insertLedgerEntry(pool, {
      memberId: 'M002',
      entryType: 'EARN',
      points: 300,
      earnedMonth: '2026-09-01',
    });
    await insertLedgerEntry(pool, {
      memberId: 'M003',
      entryType: 'EARN',
      points: 200,
      earnedMonth: '2026-09-01',
    });

    const res = await getLiabilityReport();

    expect(res.status).toBe(200);
    expect(res.body.totalOutstandingPoints).toBe(1000);
    expect(res.body.byTier).toBeInstanceOf(Array);
    expect(res.body.byTier.length).toBe(3);
    expect(res.body.generatedAt).toBeDefined();
  });

  it('returns 0 when no points exist', async () => {
    const res = await getLiabilityReport();

    expect(res.status).toBe(200);
    expect(res.body.totalOutstandingPoints).toBe(0);
    expect(res.body.byTier).toHaveLength(0);
  });

  it('includes expiring points projections', async () => {
    await insertLedgerEntry(pool, {
      memberId: 'M001',
      entryType: 'EARN',
      points: 100,
      earnedMonth: '2026-09-01',
    });

    const res = await getLiabilityReport();

    expect(res.status).toBe(200);
    expect(res.body.expiring).toBeDefined();
    expect(res.body.expiring).toHaveProperty('next1Month');
    expect(res.body.expiring).toHaveProperty('next2Months');
    expect(res.body.expiring).toHaveProperty('next3Months');
  });
});

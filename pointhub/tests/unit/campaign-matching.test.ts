import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { calculateBasketPoints } from '../../src/engine/calculate-points';
import { getTestPool, seedMembers, seedCampaigns, clearAll } from '../helpers';

/**
 * Campaign matching tests.
 * Since resolveWinningCampaign is private, we test through calculateBasketPoints
 * which queries the DB for active campaigns.
 */
describe('campaign matching', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await clearAll(pool);
  });

  describe('no campaigns active', () => {
    it('returns base rate (1000) when no campaigns exist', async () => {
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'ELECTRONICS', amountTHB: 100 }],
        'SILVER',
        '2026-09-10' // Wednesday
      );

      expect(result.lineResults[0].multiplierMillipercent).toBe(1000);
      expect(result.lineResults[0].winningCampaign).toBeNull();
      expect(result.lineResults[0].milliPoints).toBe(4000);
    });
  });

  describe('category filter', () => {
    beforeEach(async () => {
      await seedCampaigns(pool, [
        {
          id: 'C1',
          name: 'Fresh Weekend',
          multiplier: 3000,
          category: 'FRESH',
          tier: null,
          dayOfWeek: [0, 6], // Sat+Sun
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          priority: 10,
        },
      ]);
    });

    it('matches when line category equals campaign category', async () => {
      // Saturday + FRESH → C1 x3
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'FRESH', amountTHB: 100 }],
        'SILVER',
        '2026-09-27' // Saturday
      );

      expect(result.lineResults[0].winningCampaign).toBe('C1');
      expect(result.lineResults[0].multiplierMillipercent).toBe(3000);
    });

    it('does not match when category differs', async () => {
      // Saturday + GROCERY (not FRESH) → base rate
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'GROCERY', amountTHB: 100 }],
        'SILVER',
        '2026-09-27' // Saturday
      );

      expect(result.lineResults[0].multiplierMillipercent).toBe(1000);
    });
  });

  describe('tier filter', () => {
    beforeEach(async () => {
      await seedCampaigns(pool, [
        {
          id: 'C2',
          name: 'Gold Boost',
          multiplier: 2000,
          category: null,
          tier: 'GOLD',
          dayOfWeek: null,
          startDate: '2026-09-01',
          endDate: '2026-09-15',
          priority: 20,
        },
      ]);
    });

    it('matches when member tier equals campaign tier', async () => {
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'HOME', amountTHB: 300 }],
        'GOLD',
        '2026-09-12' // Within date range
      );

      expect(result.lineResults[0].winningCampaign).toBe('C2');
      expect(result.lineResults[0].multiplierMillipercent).toBe(2000);
    });

    it('does not match when member tier differs from campaign tier', async () => {
      // SILVER member, C2 is GOLD only → base
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'HOME', amountTHB: 300 }],
        'SILVER',
        '2026-09-12'
      );

      expect(result.lineResults[0].multiplierMillipercent).toBe(1000);
    });
  });

  describe('day-of-week filter', () => {
    beforeEach(async () => {
      await seedCampaigns(pool, [
        {
          id: 'C1',
          name: 'Fresh Weekend',
          multiplier: 3000,
          category: 'FRESH',
          tier: null,
          dayOfWeek: [0, 6], // Sat + Sun only
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          priority: 10,
        },
      ]);
    });

    it('matches on qualifying day (Saturday)', async () => {
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'FRESH', amountTHB: 200 }],
        'SILVER',
        '2026-09-27' // Saturday
      );

      expect(result.lineResults[0].winningCampaign).toBe('C1');
      expect(result.lineResults[0].multiplierMillipercent).toBe(3000);
    });

    it('does not match on non-qualifying day (Wednesday)', async () => {
      // 2026-09-09 is a Tuesday
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'FRESH', amountTHB: 200 }],
        'SILVER',
        '2026-09-09' // Tuesday
      );

      expect(result.lineResults[0].multiplierMillipercent).toBe(1000);
    });
  });

  describe('date range filter', () => {
    beforeEach(async () => {
      await seedCampaigns(pool, [
        {
          id: 'C2',
          name: 'Gold Boost',
          multiplier: 2000,
          category: null,
          tier: 'GOLD',
          dayOfWeek: null,
          startDate: '2026-09-01',
          endDate: '2026-09-15',
          priority: 20,
        },
      ]);
    });

    it('matches when date is within range', async () => {
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'HOME', amountTHB: 100 }],
        'GOLD',
        '2026-09-10'
      );

      expect(result.lineResults[0].winningCampaign).toBe('C2');
      expect(result.lineResults[0].multiplierMillipercent).toBe(2000);
    });

    it('does not match when date is before start_date', async () => {
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'HOME', amountTHB: 100 }],
        'GOLD',
        '2026-08-31' // Before Sep 1
      );

      expect(result.lineResults[0].multiplierMillipercent).toBe(1000);
    });

    it('does not match when date is after end_date', async () => {
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'HOME', amountTHB: 100 }],
        'GOLD',
        '2026-09-16' // After Sep 15
      );

      expect(result.lineResults[0].multiplierMillipercent).toBe(1000);
    });
  });

  describe('best-wins (highest multiplier)', () => {
    beforeEach(async () => {
      await seedCampaigns(pool, [
        {
          id: 'C1',
          name: 'Fresh Weekend x3',
          multiplier: 3000,
          category: 'FRESH',
          tier: null,
          dayOfWeek: [0, 6],
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          priority: 10,
        },
        {
          id: 'C4',
          name: 'Payday x5',
          multiplier: 5000,
          category: null,
          tier: null,
          dayOfWeek: null,
          startDate: '2026-09-25',
          endDate: '2026-09-28',
          priority: 30,
        },
      ]);
    });

    it('chooses the campaign with the highest multiplier (C4 x5 beats C1 x3)', async () => {
      // Saturday Sep 27 - both C1 (FRESH+weekend x3) and C4 (payday x5) qualify for FRESH
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'FRESH', amountTHB: 600 }],
        'GOLD',
        '2026-09-27' // Saturday, within payday range
      );

      expect(result.lineResults[0].winningCampaign).toBe('C4');
      expect(result.lineResults[0].multiplierMillipercent).toBe(5000);
      expect(result.lineResults[0].milliPoints).toBe(120000); // 600 * 5000 / 25
    });
  });

  describe('tie-break by priority', () => {
    beforeEach(async () => {
      await seedCampaigns(pool, [
        {
          id: 'C2',
          name: 'Gold Boost',
          multiplier: 2000,
          category: null,
          tier: 'GOLD',
          dayOfWeek: null,
          startDate: '2026-09-01',
          endDate: '2026-09-15',
          priority: 20,
        },
        {
          id: 'C5',
          name: 'Home Lover',
          multiplier: 2000,
          category: 'HOME',
          tier: null,
          dayOfWeek: null,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          priority: 15,
        },
      ]);
    });

    it('breaks ties by higher priority (C2 priority=20 beats C5 priority=15)', async () => {
      // GOLD member, HOME category, Sep 12 — both C2 and C5 match at x2
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'HOME', amountTHB: 300 }],
        'GOLD',
        '2026-09-12'
      );

      expect(result.lineResults[0].winningCampaign).toBe('C2');
      expect(result.lineResults[0].multiplierMillipercent).toBe(2000);
    });
  });

  describe('tie-break by campaign_id (alphabetical)', () => {
    beforeEach(async () => {
      await seedCampaigns(pool, [
        {
          id: 'CB',
          name: 'Campaign B',
          multiplier: 2000,
          category: null,
          tier: null,
          dayOfWeek: null,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          priority: 10,
        },
        {
          id: 'CA',
          name: 'Campaign A',
          multiplier: 2000,
          category: null,
          tier: null,
          dayOfWeek: null,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          priority: 10,
        },
      ]);
    });

    it('breaks same-priority ties alphabetically by campaign_id (CA < CB)', async () => {
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'GROCERY', amountTHB: 100 }],
        'SILVER',
        '2026-09-15'
      );

      expect(result.lineResults[0].winningCampaign).toBe('CA');
      expect(result.lineResults[0].multiplierMillipercent).toBe(2000);
    });
  });

  describe('campaign below x1 still returns base rate', () => {
    beforeEach(async () => {
      await seedCampaigns(pool, [
        {
          id: 'CLOW',
          name: 'Low Campaign',
          multiplier: 500, // x0.5 — below base
          category: null,
          tier: null,
          dayOfWeek: null,
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          priority: 10,
        },
      ]);
    });

    it('uses base rate (1000) when winning campaign multiplier <= 1000', async () => {
      const result = await calculateBasketPoints(
        [{ lineNo: 1, category: 'GROCERY', amountTHB: 100 }],
        'SILVER',
        '2026-09-15'
      );

      expect(result.lineResults[0].multiplierMillipercent).toBe(1000);
      expect(result.lineResults[0].milliPoints).toBe(4000);
    });
  });
});

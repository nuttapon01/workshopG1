import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { getTestPool, clearAll, apiClient } from '../helpers';

describe('/api/campaigns', () => {
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

  describe('GET /api/campaigns', () => {
    beforeEach(async () => {
      // Seed campaigns directly
      await pool.query(
        `INSERT INTO campaigns (campaign_id, name, multiplier_millipercent, category, tier, is_active, priority)
         VALUES ('C1', 'Weekend Fresh', 3000, 'FRESH', NULL, true, 10),
                ('C2', 'Gold Boost', 2000, NULL, 'GOLD', true, 20),
                ('C3', 'Inactive Campaign', 2500, NULL, NULL, false, 5)`
      );
    });

    it('lists all campaigns', async () => {
      const res = await apiClient().get('/api/campaigns');

      expect(res.status).toBe(200);
      expect(res.body.campaigns).toHaveLength(3);
    });

    it('filters by active only', async () => {
      const res = await apiClient().get('/api/campaigns?active=true');

      expect(res.status).toBe(200);
      expect(res.body.campaigns).toHaveLength(2);
      expect(res.body.campaigns.every((c: any) => c.isActive === true)).toBe(true);
    });
  });

  describe('POST /api/campaigns', () => {
    it('creates a new campaign and returns 201', async () => {
      const res = await apiClient()
        .post('/api/campaigns')
        .send({
          campaignId: 'C-NEW-1',
          name: 'New Test Campaign',
          multiplier: 2.5,
          category: 'ELECTRONICS',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          priority: 15,
        })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(201);
      expect(res.body.campaignId).toBe('C-NEW-1');
      expect(res.body.multiplier).toBe(2.5);
      expect(res.body.multiplierMillipercent).toBe(2500);
      expect(res.body.isActive).toBe(true);
    });

    it('returns 409 on duplicate campaign_id', async () => {
      const payload = {
        campaignId: 'C-DUP',
        name: 'Duplicate Test',
        multiplier: 2,
      };

      await apiClient()
        .post('/api/campaigns')
        .send(payload)
        .set('Content-Type', 'application/json');

      const res = await apiClient()
        .post('/api/campaigns')
        .send(payload)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await apiClient()
        .post('/api/campaigns')
        .send({ name: 'No ID' })
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/campaigns/:id/activate', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO campaigns (campaign_id, name, multiplier_millipercent, is_active, priority)
         VALUES ('C-TOGGLE', 'Toggle Campaign', 2000, false, 10)`
      );
    });

    it('activates a deactivated campaign', async () => {
      const res = await apiClient().patch('/api/campaigns/C-TOGGLE/activate');

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
    });

    it('returns 404 for non-existent campaign', async () => {
      const res = await apiClient().patch('/api/campaigns/NONEXISTENT/activate');

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/campaigns/:id/deactivate', () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO campaigns (campaign_id, name, multiplier_millipercent, is_active, priority)
         VALUES ('C-DEACT', 'Deactivate Campaign', 2000, true, 10)`
      );
    });

    it('deactivates an active campaign', async () => {
      const res = await apiClient().patch('/api/campaigns/C-DEACT/deactivate');

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });

    it('returns 404 for non-existent campaign', async () => {
      const res = await apiClient().patch('/api/campaigns/NONEXISTENT/deactivate');

      expect(res.status).toBe(404);
    });
  });
});

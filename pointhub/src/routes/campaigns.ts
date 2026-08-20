import { Router, Request, Response } from 'express';
import pool from '../db/pool';

export const campaignsRouter = Router();

/**
 * GET /api/campaigns
 * Lists all campaigns (optionally filter by active status).
 */
campaignsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active === 'true';
    let query = `SELECT campaign_id, name, multiplier_millipercent, category, tier,
                        day_of_week, start_date, end_date, is_active, priority, created_at
                 FROM campaigns`;
    if (activeOnly) query += ' WHERE is_active = true';
    query += ' ORDER BY priority DESC, campaign_id';

    const result = await pool.query(query);
    const campaigns = result.rows.map((c) => ({
      campaignId: c.campaign_id,
      name: c.name,
      multiplier: c.multiplier_millipercent / 1000,
      multiplierMillipercent: c.multiplier_millipercent,
      category: c.category,
      tier: c.tier,
      dayOfWeek: c.day_of_week,
      startDate: c.start_date,
      endDate: c.end_date,
      isActive: c.is_active,
      priority: c.priority,
      createdAt: c.created_at,
    }));

    return res.json({ campaigns });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * GET /api/campaigns/:id
 */
campaignsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT campaign_id, name, multiplier_millipercent, category, tier,
              day_of_week, start_date, end_date, is_active, priority, created_at
       FROM campaigns WHERE campaign_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const c = result.rows[0];
    return res.json({
      campaignId: c.campaign_id,
      name: c.name,
      multiplier: c.multiplier_millipercent / 1000,
      multiplierMillipercent: c.multiplier_millipercent,
      category: c.category,
      tier: c.tier,
      dayOfWeek: c.day_of_week,
      startDate: c.start_date,
      endDate: c.end_date,
      isActive: c.is_active,
      priority: c.priority,
      createdAt: c.created_at,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * POST /api/campaigns
 * Creates a new campaign.
 */
campaignsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      name,
      multiplier,
      category,
      tier,
      dayOfWeek,
      startDate,
      endDate,
      priority,
    } = req.body;

    if (!campaignId || !name || !multiplier) {
      return res.status(400).json({ error: 'Required: campaignId, name, multiplier' });
    }

    // Convert multiplier to millipercent (e.g. 2.5 -> 2500)
    const multiplierMillipercent = Math.round(multiplier * 1000);

    await pool.query(
      `INSERT INTO campaigns (campaign_id, name, multiplier_millipercent, category, tier, day_of_week, start_date, end_date, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
      [
        campaignId,
        name,
        multiplierMillipercent,
        category || null,
        tier || null,
        dayOfWeek || null,
        startDate || null,
        endDate || null,
        priority || 0,
      ]
    );

    return res.status(201).json({
      campaignId,
      name,
      multiplier,
      multiplierMillipercent,
      isActive: true,
    });
  } catch (err: any) {
    if (err.code === '23505') {
      // unique violation
      return res.status(409).json({ error: 'Campaign ID already exists' });
    }
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * PATCH /api/campaigns/:id/activate
 */
campaignsRouter.patch('/:id/activate', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'UPDATE campaigns SET is_active = true WHERE campaign_id = $1 RETURNING campaign_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    return res.json({ campaignId: req.params.id, isActive: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

/**
 * PATCH /api/campaigns/:id/deactivate
 */
campaignsRouter.patch('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'UPDATE campaigns SET is_active = false WHERE campaign_id = $1 RETURNING campaign_id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    return res.json({ campaignId: req.params.id, isActive: false });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

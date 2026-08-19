import pool from './pool';

/**
 * Seeds: members from sample data and the 5 campaigns from marketing.
 */
async function seed() {
  console.log('Seeding database...');

  // Seed members
  const members = [
    { id: 'M1001', tier: 'GOLD', joinedAt: '2019-03-14' },
    { id: 'M1002', tier: 'SILVER', joinedAt: '2023-11-02' },
    { id: 'M1003', tier: 'PLATINUM', joinedAt: '2017-06-21' },
    { id: 'M1004', tier: 'SILVER', joinedAt: '2024-02-09' },
    { id: 'M1005', tier: 'GOLD', joinedAt: '2021-08-30' },
    { id: 'M1006', tier: 'SILVER', joinedAt: '2025-01-17' },
    { id: 'M1007', tier: 'PLATINUM', joinedAt: '2016-10-05' },
    { id: 'M1008', tier: 'GOLD', joinedAt: '2022-05-26' },
  ];

  for (const m of members) {
    await pool.query(
      `INSERT INTO members (member_id, tier, joined_at) VALUES ($1, $2, $3)
       ON CONFLICT (member_id) DO UPDATE SET tier = $2, joined_at = $3`,
      [m.id, m.tier, m.joinedAt]
    );
  }
  console.log(`  Seeded ${members.length} members`);

  // Seed campaigns
  // multiplier_millipercent: multiplier * 1000 (so x3 = 3000, x2.5 = 2500)
  // day_of_week: PostgreSQL style 0=Sun, 6=Sat
  // priority: higher wins ties. C4 is explicitly "the best deal" so highest priority.
  const campaigns = [
    {
      id: 'C1', name: 'Fresh Weekend', multiplier: 3000,
      category: 'FRESH', tier: null, dayOfWeek: [0, 6], // Sun, Sat
      startDate: '2026-09-01', endDate: '2026-09-30', priority: 10
    },
    {
      id: 'C2', name: 'Gold Boost', multiplier: 2000,
      category: null, tier: 'GOLD', dayOfWeek: null,
      startDate: '2026-09-01', endDate: '2026-09-15', priority: 20
    },
    {
      id: 'C3', name: 'Platinum Everyday', multiplier: 2500,
      category: null, tier: 'PLATINUM', dayOfWeek: null,
      startDate: null, endDate: null, priority: 30
    },
    {
      id: 'C4', name: 'Payday Splurge', multiplier: 5000,
      category: null, tier: null, dayOfWeek: null,
      startDate: '2026-09-25', endDate: '2026-09-28', priority: 100
    },
    {
      id: 'C5', name: 'Home & Living Push', multiplier: 2000,
      category: 'HOME', tier: null, dayOfWeek: null,
      startDate: '2026-09-10', endDate: '2026-10-10', priority: 15
    },
  ];

  for (const c of campaigns) {
    await pool.query(
      `INSERT INTO campaigns (campaign_id, name, multiplier_millipercent, category, tier, day_of_week, start_date, end_date, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       ON CONFLICT (campaign_id) DO UPDATE SET
         name = $2, multiplier_millipercent = $3, category = $4, tier = $5,
         day_of_week = $6, start_date = $7, end_date = $8, priority = $9, is_active = true`,
      [c.id, c.name, c.multiplier, c.category, c.tier, c.dayOfWeek, c.startDate, c.endDate, c.priority]
    );
  }
  console.log(`  Seeded ${campaigns.length} campaigns`);

  console.log('Seeding complete.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

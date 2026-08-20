import * as fs from 'fs';
import * as path from 'path';
import pool from './pool';

/**
 * Seeds reference data:
 *   - members: read from sample-data/members.csv (single source of truth)
 *   - campaigns: the 5 campaigns from sample-data/campaign-examples.md
 *
 * Transactions are NOT seeded here on purpose — points must be produced by the
 * earn/refund engine so Finance can replay them. Load those with `npm run replay`
 * against a running API.
 *
 * Usage:
 *   npm run seed            reference data only (idempotent upsert)
 *   npm run seed -- --reset also clears transactions / lines / ledger first,
 *                           so a following replay starts from a clean slate
 */

const SAMPLE_DATA_DIR = path.join(__dirname, '..', '..', '..', 'sample-data');

interface MemberRow {
  memberId: string;
  tier: string;
  joinedAt: string;
}

function readMembersCsv(filePath: string): MemberRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',').map((h) => h.trim());

  const idx = {
    memberId: header.indexOf('memberId'),
    tier: header.indexOf('tier'),
    joinedAt: header.indexOf('joinedAt'),
  };

  for (const [field, position] of Object.entries(idx)) {
    if (position === -1) {
      throw new Error(`members.csv is missing the "${field}" column (found: ${header.join(', ')})`);
    }
  }

  return lines
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const values = line.split(',').map((v) => v.trim());
      return {
        memberId: values[idx.memberId],
        tier: values[idx.tier],
        joinedAt: values[idx.joinedAt],
      };
    });
}

async function reset() {
  console.log('  --reset: clearing transactions, transaction_lines, points_ledger');
  await pool.query(
    'TRUNCATE transaction_lines, transactions, points_ledger RESTART IDENTITY CASCADE'
  );
}

async function seed() {
  const shouldReset = process.argv.includes('--reset');

  console.log('Seeding database...');
  console.log(`  sample data: ${SAMPLE_DATA_DIR}`);

  if (shouldReset) {
    await reset();
  }

  // Members — from sample-data/members.csv
  const members = readMembersCsv(path.join(SAMPLE_DATA_DIR, 'members.csv'));
  if (members.length === 0) {
    throw new Error('members.csv contained no data rows');
  }

  for (const m of members) {
    await pool.query(
      `INSERT INTO members (member_id, tier, joined_at) VALUES ($1, $2, $3)
       ON CONFLICT (member_id) DO UPDATE SET tier = $2, joined_at = $3`,
      [m.memberId, m.tier, m.joinedAt]
    );
  }
  console.log(`  Seeded ${members.length} members from members.csv`);

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
  console.log('Next: start the API (npm run dev) then load transactions with npm run replay');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

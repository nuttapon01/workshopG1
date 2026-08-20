import * as fs from 'fs';
import * as path from 'path';
import { Queryable } from './types';

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
 *
 * Structure note: the exported routines take already-parsed data and a pg
 * connection, and touch no filesystem. Only the CLI at the bottom reads files.
 * That is what lets the CDK migration Lambda reuse this logic — it runs in
 * Lambda with the CSV bundled in as a string, not on a disk where
 * `sample-data/` exists.
 */

/**
 * Where the CLI looks for sample-data/.
 *
 * The relative fallback resolves differently depending on whether this runs
 * from source or from the compiled output:
 *   tsx      → pointhub/src/db      → ../../../sample-data = <repo>/sample-data  ✓
 *   compiled → /app/dist/db         → ../../../sample-data = /sample-data
 * The compiled path is outside the image (sample-data/ sits above the Docker
 * build context), so anything running the compiled CLI must either set
 * SAMPLE_DATA_DIR or mount the directory. The CI e2e job mounts it read-only.
 */
export const SAMPLE_DATA_DIR =
  process.env.SAMPLE_DATA_DIR || path.join(__dirname, '..', '..', '..', 'sample-data');

export interface MemberRow {
  memberId: string;
  tier: string;
  joinedAt: string;
}

/** Parses members.csv content. Pure — no filesystem access. */
export function parseMembersCsv(content: string): MemberRow[] {
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

/**
 * Clears the transactional tables. Reference data (members, campaigns) is left
 * alone. Destructive — only the CLI's explicit `--reset` flag reaches this.
 */
export async function resetTransactionalData(db: Queryable): Promise<void> {
  await db.query(
    'TRUNCATE transaction_lines, transactions, points_ledger RESTART IDENTITY CASCADE'
  );
}

/** Upserts the member stub rows. Idempotent. */
export async function seedMembers(db: Queryable, members: MemberRow[]): Promise<number> {
  if (members.length === 0) {
    throw new Error('refusing to seed an empty member list');
  }

  for (const m of members) {
    await db.query(
      `INSERT INTO members (member_id, tier, joined_at) VALUES ($1, $2, $3)
       ON CONFLICT (member_id) DO UPDATE SET tier = $2, joined_at = $3`,
      [m.memberId, m.tier, m.joinedAt]
    );
  }

  return members.length;
}

/**
 * The five campaigns marketing asked for, from sample-data/campaign-examples.md.
 *
 * multiplier_millipercent: multiplier * 1000 (so x3 = 3000, x2.5 = 2500)
 * day_of_week: PostgreSQL style 0=Sun, 6=Sat
 * priority: higher wins ties. C4 is explicitly "the best deal" so highest priority.
 */
export const CAMPAIGNS = [
  {
    id: 'C1',
    name: 'Fresh Weekend',
    multiplier: 3000,
    category: 'FRESH',
    tier: null,
    dayOfWeek: [0, 6], // Sun, Sat
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    priority: 10,
  },
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
    id: 'C3',
    name: 'Platinum Everyday',
    multiplier: 2500,
    category: null,
    tier: 'PLATINUM',
    dayOfWeek: null,
    startDate: null,
    endDate: null,
    priority: 30,
  },
  {
    id: 'C4',
    name: 'Payday Splurge',
    multiplier: 5000,
    category: null,
    tier: null,
    dayOfWeek: null,
    startDate: '2026-09-25',
    endDate: '2026-09-28',
    priority: 100,
  },
  {
    id: 'C5',
    name: 'Home & Living Push',
    multiplier: 2000,
    category: 'HOME',
    tier: null,
    dayOfWeek: null,
    startDate: '2026-09-10',
    endDate: '2026-10-10',
    priority: 15,
  },
];

/** Upserts the campaign rows. Idempotent. */
export async function seedCampaigns(db: Queryable): Promise<number> {
  for (const c of CAMPAIGNS) {
    await db.query(
      `INSERT INTO campaigns (campaign_id, name, multiplier_millipercent, category, tier, day_of_week, start_date, end_date, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       ON CONFLICT (campaign_id) DO UPDATE SET
         name = $2, multiplier_millipercent = $3, category = $4, tier = $5,
         day_of_week = $6, start_date = $7, end_date = $8, priority = $9, is_active = true`,
      [
        c.id,
        c.name,
        c.multiplier,
        c.category,
        c.tier,
        c.dayOfWeek,
        c.startDate,
        c.endDate,
        c.priority,
      ]
    );
  }

  return CAMPAIGNS.length;
}

/**
 * Seeds all reference data. This is the entry point the migration Lambda calls.
 */
export async function runSeed(db: Queryable, members: MemberRow[]): Promise<void> {
  await seedMembers(db, members);
  await seedCampaigns(db);
}

// ---------------------------------------------------------------------------
// CLI: npm run seed [-- --reset]
// ---------------------------------------------------------------------------
if (require.main === module) {
  (async () => {
    // Required rather than imported for the same reason as migrate.ts: importing
    // ./pool constructs a connection pool as a side effect, and the migration
    // Lambda imports this module's routines with its own client.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pool = require('./pool').default as Queryable & { end(): Promise<void> };

    const shouldReset = process.argv.includes('--reset');

    console.log('Seeding database...');
    console.log(`  sample data: ${SAMPLE_DATA_DIR}`);

    if (shouldReset) {
      console.log('  --reset: clearing transactions, transaction_lines, points_ledger');
      await resetTransactionalData(pool);
    }

    const csvPath = path.join(SAMPLE_DATA_DIR, 'members.csv');
    if (!fs.existsSync(csvPath)) {
      throw new Error(
        `members.csv not found at ${csvPath}. ` +
          'Set SAMPLE_DATA_DIR when running the compiled CLI outside the repository ' +
          '(the container image does not include sample-data/).'
      );
    }

    const members = parseMembersCsv(fs.readFileSync(csvPath, 'utf-8'));
    const memberCount = await seedMembers(pool, members);
    console.log(`  Seeded ${memberCount} members from members.csv`);

    const campaignCount = await seedCampaigns(pool);
    console.log(`  Seeded ${campaignCount} campaigns`);

    console.log('Seeding complete.');
    console.log('Next: start the API (npm run dev) then load transactions with npm run replay');
    await pool.end();
  })().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

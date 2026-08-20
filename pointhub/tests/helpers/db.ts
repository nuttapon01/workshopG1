import { Pool } from 'pg';

/**
 * Creates a Pool connected to the test database.
 * Uses the same env vars as the app pool.
 *
 * Guarded: helpers here truncate whole tables, so refuse to hand back a pool
 * pointing at anything other than a *_test database.
 */
export function getTestPool(): Pool {
  const database = process.env.DB_NAME || 'pointhub_test';

  if (!/_test$/.test(database)) {
    throw new Error(
      `Refusing to open a test pool against "${database}". Test helpers delete all ` +
        'rows; the target database name must end with "_test". Check DB_NAME.'
    );
  }

  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'pointhub',
    password: process.env.DB_PASSWORD || 'pointhub',
    database,
  });
}

/**
 * Seed members into the test database.
 */
export async function seedMembers(
  pool: Pool,
  members: Array<{ id: string; tier: string; joinedAt: string }>
) {
  for (const m of members) {
    await pool.query(
      `INSERT INTO members (member_id, tier, joined_at) VALUES ($1, $2, $3)
       ON CONFLICT (member_id) DO UPDATE SET tier = $2, joined_at = $3`,
      [m.id, m.tier, m.joinedAt]
    );
  }
}

/**
 * Seed campaigns into the test database.
 */
export async function seedCampaigns(
  pool: Pool,
  campaigns: Array<{
    id: string;
    name: string;
    multiplier: number;
    category?: string | null;
    tier?: string | null;
    dayOfWeek?: number[] | null;
    startDate?: string | null;
    endDate?: string | null;
    priority?: number;
  }>
) {
  for (const c of campaigns) {
    await pool.query(
      `INSERT INTO campaigns (campaign_id, name, multiplier_millipercent, category, tier, day_of_week, start_date, end_date, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       ON CONFLICT (campaign_id) DO UPDATE SET
         name = $2, multiplier_millipercent = $3, category = $4, tier = $5,
         day_of_week = $6, start_date = $7, end_date = $8, priority = $9, is_active = true`,
      [
        c.id, c.name, c.multiplier,
        c.category ?? null, c.tier ?? null, c.dayOfWeek ?? null,
        c.startDate ?? null, c.endDate ?? null, c.priority ?? 0,
      ]
    );
  }
}

/**
 * Clear all entries from points_ledger (and optionally transactions).
 */
export async function clearLedger(pool: Pool) {
  await pool.query('DELETE FROM points_ledger');
}

/**
 * Clear all test data — full reset of all tables.
 */
export async function clearAll(pool: Pool) {
  await pool.query('DELETE FROM transaction_lines');
  await pool.query('DELETE FROM points_ledger');
  await pool.query('DELETE FROM transactions');
  await pool.query('DELETE FROM campaigns');
  await pool.query('DELETE FROM members');
}

/**
 * Get the current balance for a member (sum of all ledger points).
 */
export async function getBalance(pool: Pool, memberId: string): Promise<number> {
  const result = await pool.query(
    'SELECT COALESCE(SUM(points), 0)::int AS balance FROM points_ledger WHERE member_id = $1',
    [memberId]
  );
  return result.rows[0].balance;
}

/**
 * Insert a points_ledger entry directly (for test setup).
 */
export async function insertLedgerEntry(
  pool: Pool,
  entry: {
    memberId: string;
    transactionId?: string | null;
    entryType: string;
    points: number;
    description?: string;
    reasonCode?: string | null;
    earnedMonth?: string | null;
  }
) {
  await pool.query(
    `INSERT INTO points_ledger (member_id, transaction_id, entry_type, points, description, reason_code, earned_month)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.memberId,
      entry.transactionId ?? null,
      entry.entryType,
      entry.points,
      entry.description ?? null,
      entry.reasonCode ?? null,
      entry.earnedMonth ?? null,
    ]
  );
}

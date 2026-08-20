import { Queryable } from './types';

/**
 * The schema, as one idempotent statement batch.
 *
 * Exported so there is exactly one copy of it. Three callers apply it:
 *   - the `npm run migrate` CLI at the bottom of this file
 *   - tests/global-setup.ts, against the throwaway `pointhub_test` database
 *   - the CDK TriggerFunction, against RDS during deployment
 *
 * Every statement is `IF NOT EXISTS`, so re-running is safe. The deploy-time
 * trigger relies on that.
 */
export const MIGRATION_SQL = `
-- Members stub (read-only reference)
CREATE TABLE IF NOT EXISTS members (
  member_id VARCHAR(20) PRIMARY KEY,
  tier VARCHAR(10) NOT NULL CHECK (tier IN ('SILVER', 'GOLD', 'PLATINUM')),
  joined_at DATE NOT NULL
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  multiplier_millipercent INT NOT NULL, -- e.g. 2500 means x2.5 (stored as multiplier * 1000)
  category VARCHAR(50), -- NULL means all categories
  tier VARCHAR(10), -- NULL means all tiers
  day_of_week INT[], -- NULL means all days (0=Sun, 6=Sat)
  start_date DATE,
  end_date DATE, -- NULL means always-on
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 0, -- higher number = higher priority for tie-breaking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions log
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id VARCHAR(30) PRIMARY KEY,
  type VARCHAR(10) NOT NULL CHECK (type IN ('SALE', 'REFUND')),
  original_transaction_id VARCHAR(30),
  date DATE NOT NULL,
  time TIME NOT NULL,
  store_id VARCHAR(20) NOT NULL,
  member_id VARCHAR(20) NOT NULL,
  tier VARCHAR(10) NOT NULL,
  total_amount_thb INT NOT NULL, -- sum of line amounts (negative for refunds)
  total_milli_points INT NOT NULL DEFAULT 0,
  points_posted INT NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaction line items
CREATE TABLE IF NOT EXISTS transaction_lines (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(30) NOT NULL REFERENCES transactions(transaction_id),
  line_no INT NOT NULL,
  category VARCHAR(50) NOT NULL,
  amount_thb INT NOT NULL, -- negative for refund lines
  winning_campaign VARCHAR(20), -- NULL means BASE rate
  multiplier_millipercent INT NOT NULL DEFAULT 1000, -- 1000 = x1
  milli_points INT NOT NULL DEFAULT 0,
  UNIQUE(transaction_id, line_no)
);

-- Points ledger (append-only)
CREATE TABLE IF NOT EXISTS points_ledger (
  id SERIAL PRIMARY KEY,
  member_id VARCHAR(20) NOT NULL,
  transaction_id VARCHAR(30), -- NULL for manual adjustments
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('EARN', 'BURN', 'REFUND_CLAWBACK', 'ADJUSTMENT', 'EXPIRY')),
  points INT NOT NULL,
  description TEXT,
  reason_code VARCHAR(30), -- for manual adjustments
  earned_month DATE, -- first day of the month the points were earned (for expiry)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for balance lookups
CREATE INDEX IF NOT EXISTS idx_ledger_member ON points_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_ledger_earned_month ON points_ledger(earned_month);
CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_txid ON transaction_lines(transaction_id);
`;

/**
 * Applies the schema. Accepts any pg connection so the caller decides whether
 * that is a pool, a pooled client or a single client.
 */
export async function runMigration(db: Queryable): Promise<void> {
  await db.query(MIGRATION_SQL);
}

// ---------------------------------------------------------------------------
// CLI: npm run migrate
// ---------------------------------------------------------------------------
// Guarded so importing this module has no side effects. `./pool` is required
// here rather than imported at the top because importing it constructs a
// connection pool immediately — the migration Lambda imports runMigration and
// supplies its own client, and should not open a second, unused pool (nor read
// the DB_SSL/DB_CA_PATH variables that pool.ts validates).
if (require.main === module) {
  (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pool = require('./pool').default as Queryable & { end(): Promise<void> };

    console.log('Running migrations...');
    await runMigration(pool);
    console.log('Migrations complete.');
    await pool.end();
  })().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

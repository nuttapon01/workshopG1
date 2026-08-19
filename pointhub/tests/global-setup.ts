import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const TEST_DB = process.env.DB_NAME || 'pointhub_test';
const ADMIN_DB = 'postgres';

/**
 * Global setup: create the test database, run migrations, seed base data.
 * Runs once before all test suites.
 */
export async function setup() {
  // Connect to admin DB to create the test database
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'pointhub',
    password: process.env.DB_PASSWORD || 'pointhub',
    database: ADMIN_DB,
  });

  try {
    // Drop and recreate for a clean slate
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB}`);
    console.log(`✓ Created test database: ${TEST_DB}`);
  } finally {
    await adminPool.end();
  }

  // Connect to the test DB to run migrations
  const testPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'pointhub',
    password: process.env.DB_PASSWORD || 'pointhub',
    database: TEST_DB,
  });

  try {
    // Read and run migration SQL from the migrate.ts file (extract the SQL string)
    const migrationSQL = `
      CREATE TABLE IF NOT EXISTS members (
        member_id VARCHAR(20) PRIMARY KEY,
        tier VARCHAR(10) NOT NULL CHECK (tier IN ('SILVER', 'GOLD', 'PLATINUM')),
        joined_at DATE NOT NULL
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        campaign_id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        multiplier_millipercent INT NOT NULL,
        category VARCHAR(50),
        tier VARCHAR(10),
        day_of_week INT[],
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        priority INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id VARCHAR(30) PRIMARY KEY,
        type VARCHAR(10) NOT NULL CHECK (type IN ('SALE', 'REFUND')),
        original_transaction_id VARCHAR(30),
        date DATE NOT NULL,
        time TIME NOT NULL,
        store_id VARCHAR(20) NOT NULL,
        member_id VARCHAR(20) NOT NULL,
        tier VARCHAR(10) NOT NULL,
        total_amount_thb INT NOT NULL,
        total_milli_points INT NOT NULL DEFAULT 0,
        points_posted INT NOT NULL DEFAULT 0,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS transaction_lines (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(30) NOT NULL REFERENCES transactions(transaction_id),
        line_no INT NOT NULL,
        category VARCHAR(50) NOT NULL,
        amount_thb INT NOT NULL,
        winning_campaign VARCHAR(20),
        multiplier_millipercent INT NOT NULL DEFAULT 1000,
        milli_points INT NOT NULL DEFAULT 0,
        UNIQUE(transaction_id, line_no)
      );
      CREATE TABLE IF NOT EXISTS points_ledger (
        id SERIAL PRIMARY KEY,
        member_id VARCHAR(20) NOT NULL,
        transaction_id VARCHAR(30),
        entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('EARN', 'BURN', 'REFUND_CLAWBACK', 'ADJUSTMENT', 'EXPIRY')),
        points INT NOT NULL,
        description TEXT,
        reason_code VARCHAR(30),
        earned_month DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_member ON points_ledger(member_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_earned_month ON points_ledger(earned_month);
      CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
      CREATE INDEX IF NOT EXISTS idx_transaction_lines_txid ON transaction_lines(transaction_id);
    `;

    await testPool.query(migrationSQL);
    console.log('✓ Migrations applied to test database');
  } finally {
    await testPool.end();
  }

  // Set env so the app pool connects to test DB
  process.env.DB_NAME = TEST_DB;
}

/**
 * Global teardown: drop the test database.
 */
export async function teardown() {
  const TEST_DB = process.env.DB_NAME || 'pointhub_test';

  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'pointhub',
    password: process.env.DB_PASSWORD || 'pointhub',
    database: 'postgres',
  });

  try {
    // Terminate any remaining connections
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid()
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    console.log(`✓ Dropped test database: ${TEST_DB}`);
  } finally {
    await adminPool.end();
  }
}

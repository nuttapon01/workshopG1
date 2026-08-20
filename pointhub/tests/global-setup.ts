import { Pool } from 'pg';
import { runMigration } from '../src/db/migrate';

/**
 * The test database name is read from TEST_DB_NAME, never from DB_NAME.
 * This file DROPs the database it is given, so taking that name from the same
 * variable the app uses would let a stray `DB_NAME=pointhub` in the environment
 * destroy the seeded development database.
 */
const TEST_DB = process.env.TEST_DB_NAME || 'pointhub_test';
const ADMIN_DB = 'postgres';

if (!/_test$/.test(TEST_DB)) {
  throw new Error(
    `Refusing to run: TEST_DB_NAME must end with "_test" (got "${TEST_DB}"). ` +
      'The test harness drops and recreates this database.'
  );
}

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
    // Schema comes from src/db/migrate.ts so the test database can never
    // drift from the one the CLI and the deploy-time migration apply. This
    // file previously held a second, hand-maintained copy of the DDL.
    await runMigration(testPool);
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

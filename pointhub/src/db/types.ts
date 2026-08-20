/**
 * Minimal surface shared by `Pool`, `PoolClient` and `Client`.
 *
 * Lets the migration and seed routines run against a pooled connection (the CLI
 * and the test harness) or a single connection (the CDK migration Lambda)
 * without either one depending on how the caller connected.
 *
 * Kept in its own module, separate from pool.ts, so that importing the migration
 * or seed logic does not execute pool.ts and construct a connection pool as a
 * side effect. The Lambda imports those routines and supplies its own client.
 */
export interface Queryable {
  query(queryText: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

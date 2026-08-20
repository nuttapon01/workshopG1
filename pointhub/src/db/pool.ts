import { Pool, PoolConfig } from 'pg';
import * as fs from 'fs';

export { Queryable } from './types';

/**
 * Builds the pg pool configuration from the environment.
 *
 * Exported separately from the pool itself so it can be asserted on without
 * opening a socket.
 */
export function buildPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const config: PoolConfig = {
    host: env.DB_HOST || 'localhost',
    port: parseInt(env.DB_PORT || '5432', 10),
    user: env.DB_USER || 'pointhub',
    password: env.DB_PASSWORD || 'pointhub',
    database: env.DB_NAME || 'pointhub',
  };

  // TLS is opt-in so local Docker Compose and CI service containers, which do
  // not serve TLS, keep working unchanged. Amazon RDS is created with
  // `rds.force_ssl = 1`, so the deployed task sets DB_SSL=true.
  if (env.DB_SSL === 'true') {
    const caPath = env.DB_CA_PATH;

    // RDS server certificates are issued by the Amazon RDS certificate
    // authorities, which are not in Node's default trust store. Verification
    // therefore needs the RDS bundle explicitly, and without it the only ways
    // to connect would be to disable verification (defeating the point) or to
    // fail at the first query. Refuse up front with something actionable
    // instead.
    if (!caPath) {
      throw new Error(
        'DB_SSL=true requires DB_CA_PATH to point at the Amazon RDS CA bundle. ' +
          'The container image ships it at /app/certs/rds-global-bundle.pem.'
      );
    }

    if (!fs.existsSync(caPath)) {
      throw new Error(
        `DB_SSL=true but the CA bundle at DB_CA_PATH="${caPath}" does not exist. ` +
          'Check the Dockerfile certs stage.'
      );
    }

    config.ssl = {
      ca: fs.readFileSync(caPath, 'utf8'),
      // Never relaxed. An unverified TLS connection to the points ledger is
      // worse than a clear failure.
      rejectUnauthorized: true,
    };
  }

  return config;
}

const pool = new Pool(buildPoolConfig());

export default pool;

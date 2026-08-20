import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { runMigration } from '../../pointhub/src/db/migrate';
import { parseMembersCsv, runSeed } from '../../pointhub/src/db/seed';

// Inlined by esbuild at build time. The Lambda sits in an isolated subnet with
// no NAT gateway, so neither of these can be fetched at runtime.
import rdsCaBundle from '../assets/rds-global-bundle.pem';
import membersCsv from '../../sample-data/members.csv';

/**
 * Applies the PointHub schema to RDS during deployment.
 *
 * Invoked by a CDK TriggerFunction, which blocks the CloudFormation deployment
 * until this returns — so the Fargate service is never created against a
 * database that has no tables.
 *
 * The schema and the seed routines are imported from pointhub/src/db rather than
 * reimplemented. That is the whole point: the DDL exists once, and the same
 * function runs from `npm run migrate`, from the test harness, from the container
 * (`dist/db/migrate.js`) and from here.
 */

interface DatabaseSecret {
  username: string;
  password: string;
  host?: string;
  port?: number;
  dbname?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set on the migration function`);
  }
  return value;
}

async function readDatabaseSecret(secretArn: string): Promise<DatabaseSecret> {
  // Reached over the Secrets Manager interface endpoint in the isolated subnet.
  const secrets = new SecretsManagerClient({});
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));

  if (!response.SecretString) {
    throw new Error('database secret has no SecretString');
  }

  const parsed = JSON.parse(response.SecretString) as DatabaseSecret;

  if (!parsed.username || !parsed.password) {
    throw new Error('database secret is missing username or password');
  }

  return parsed;
}

/** True when the schema has no reference data yet. */
async function needsSeeding(client: Client): Promise<boolean> {
  const result = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM members');
  return result.rows[0].count === '0';
}

export async function handler(): Promise<{ migrated: boolean; seeded: boolean }> {
  const secretArn = requireEnv('DB_SECRET_ARN');
  const host = requireEnv('DB_HOST');
  const database = requireEnv('DB_NAME');
  const port = parseInt(process.env.DB_PORT ?? '5432', 10);

  // GIT_SHA is not read here. It exists as an environment variable so that the
  // function's configuration changes on every deployment, which is what makes
  // the TriggerFunction re-execute rather than being skipped as unchanged. The
  // migration is idempotent (every statement is IF NOT EXISTS), so re-running is
  // safe and re-running is what keeps a new schema arriving with a new release.
  const gitSha = process.env.GIT_SHA ?? 'unknown';
  console.log(`migration starting for ${gitSha} against ${host}/${database}`);

  const secret = await readDatabaseSecret(secretArn);

  const client = new Client({
    host,
    port,
    database,
    user: secret.username,
    password: secret.password,
    // The instance is created with rds.force_ssl=1, so a non-TLS connection is
    // refused outright. Verification uses the bundled Amazon RDS trust store —
    // those CAs are not in Node's default store, and rejectUnauthorized is never
    // relaxed to work around that.
    ssl: {
      ca: rdsCaBundle,
      rejectUnauthorized: true,
    },
    // A hung connection should fail the deployment quickly rather than sit until
    // the Lambda timeout.
    connectionTimeoutMillis: 20_000,
    statement_timeout: 120_000,
  });

  await client.connect();

  try {
    await runMigration(client);
    console.log('schema applied');

    let seeded = false;
    if (await needsSeeding(client)) {
      // Members come from the CSV that technical-environment.md designates as the
      // Member DB stub, inlined at build time; campaigns come from the CAMPAIGNS
      // constant in seed.ts. Only on an empty database, so a redeploy never
      // overwrites reference data an operator has since changed.
      await runSeed(client, parseMembersCsv(membersCsv));
      seeded = true;
      console.log('reference data seeded');
    } else {
      console.log('members table already populated, skipping seed');
    }

    return { migrated: true, seeded };
  } finally {
    await client.end();
  }
}

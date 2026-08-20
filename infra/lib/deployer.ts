import * as fs from 'fs';
import * as path from 'path';

/**
 * Deployer identity.
 *
 * The AWS account is shared between workshop groups, so every account-unique
 * name has to carry an owner or the second person to deploy either collides or,
 * worse, adopts someone else's resources. Stack names alone are not enough —
 * ECR repository names, the RDS instance identifier, security group names, log
 * group names and SSM parameter paths are all unique per account or per region.
 *
 * Two forms are needed because AWS naming rules disagree:
 *   stackPrefix  CloudFormation stack names allow [A-Za-z0-9-]
 *   slug         ECR repositories and RDS identifiers must be lowercase
 */
export interface Deployer {
  /** The value exactly as configured, for logs and tags. */
  readonly raw: string;
  /** Mixed-case-safe prefix for CloudFormation stack names. */
  readonly stackPrefix: string;
  /** Lowercase, hyphenated form for physical resource names. */
  readonly slug: string;
}

/**
 * Reads KEY=VALUE pairs from a .env file.
 *
 * Hand-rolled rather than pulling in dotenv: this needs to read one string, and
 * a deployment tool's dependency list is worth keeping short. Values already
 * present in the environment win, so CI can override without editing a file.
 *
 * Note the file at the repository root also holds AWS access keys. Nothing here
 * reads or logs them — credentials come from the ambient AWS credential chain,
 * not from this parser.
 */
export function loadDotEnv(envPath: string, into: NodeJS.ProcessEnv = process.env): void {
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    if (key !== '' && into[key] === undefined) {
      into[key] = value;
    }
  }
}

/** Path to the repository-root .env, from infra/lib. */
export const REPO_ENV_PATH = path.join(__dirname, '..', '..', '.env');

/**
 * Turns a raw DEPLOYER value into the two forms AWS needs.
 *
 * Throws rather than falling back to a default. A silent default is how two
 * people end up sharing one database.
 */
export function resolveDeployer(env: NodeJS.ProcessEnv = process.env): Deployer {
  const raw = (env.DEPLOYER ?? '').trim();

  if (raw === '') {
    throw new Error(
      'DEPLOYER is not set. Every stack and every account-unique resource name is ' +
        'prefixed with it so that groups sharing this AWS account cannot collide. ' +
        'Set it in the repository-root .env (DEPLOYER=YOUR-TEAM-NAME) or export it.'
    );
  }

  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  const stackPrefix = raw
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (slug === '') {
    throw new Error(
      `DEPLOYER="${raw}" contains no alphanumeric characters, so no valid resource ` +
        'name can be derived from it.'
    );
  }

  if (!/^[a-z]/.test(slug)) {
    // RDS instance identifiers must begin with a letter.
    throw new Error(
      `DEPLOYER="${raw}" must start with a letter — it is used as the prefix of the ` +
        'RDS instance identifier, which cannot begin with a digit or a hyphen.'
    );
  }

  // The longest derived name is the RDS instance identifier,
  // `<slug>-pointhub-prod`, capped at 63 characters by RDS.
  const RDS_IDENTIFIER_SUFFIX = '-pointhub-prod'.length;
  if (slug.length + RDS_IDENTIFIER_SUFFIX > 63) {
    throw new Error(
      `DEPLOYER="${raw}" is too long: the derived slug "${slug}" (${slug.length} chars) ` +
        `plus "-pointhub-prod" exceeds the 63-character limit on RDS instance identifiers. ` +
        `Use at most ${63 - RDS_IDENTIFIER_SUFFIX} characters.`
    );
  }

  return { raw, stackPrefix, slug };
}

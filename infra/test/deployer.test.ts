import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadDotEnv, resolveDeployer } from '../lib/deployer';
import { resourceNames } from '../lib/config';

describe('resolveDeployer', () => {
  it('derives a lowercase slug and a stack prefix from the configured value', () => {
    const deployer = resolveDeployer({ DEPLOYER: 'SIAM-MEGAMART-POINT-HUB' });

    expect(deployer.raw).toBe('SIAM-MEGAMART-POINT-HUB');
    expect(deployer.stackPrefix).toBe('SIAM-MEGAMART-POINT-HUB');
    // ECR repositories and RDS identifiers reject uppercase, so a separate
    // lowercase form is required rather than optional.
    expect(deployer.slug).toBe('siam-megamart-point-hub');
  });

  it('normalises separators and surrounding noise', () => {
    const deployer = resolveDeployer({ DEPLOYER: '  Team_One  ' });

    expect(deployer.slug).toBe('team-one');
    expect(deployer.stackPrefix).toBe('Team-One');
  });

  it('collapses runs of invalid characters into a single hyphen', () => {
    expect(resolveDeployer({ DEPLOYER: 'a!!!b' }).slug).toBe('a-b');
  });

  it('refuses to run without DEPLOYER', () => {
    // Defaulting is the failure mode worth preventing: it is how two groups end
    // up sharing one database in a shared account.
    expect(() => resolveDeployer({})).toThrow(/DEPLOYER is not set/);
    expect(() => resolveDeployer({ DEPLOYER: '   ' })).toThrow(/DEPLOYER is not set/);
  });

  it('rejects a value with no alphanumeric characters', () => {
    expect(() => resolveDeployer({ DEPLOYER: '---' })).toThrow(/no alphanumeric/);
  });

  it('rejects a value that does not start with a letter', () => {
    // RDS instance identifiers must begin with a letter.
    expect(() => resolveDeployer({ DEPLOYER: '1st-team' })).toThrow(/must start with a letter/);
  });

  it('rejects a value too long for an RDS instance identifier', () => {
    expect(() => resolveDeployer({ DEPLOYER: 'a'.repeat(60) })).toThrow(/63-character limit/);
  });

  it('accepts the longest value that still fits', () => {
    const longest = 'a'.repeat(63 - '-pointhub-prod'.length);
    const names = resourceNames(resolveDeployer({ DEPLOYER: longest }));

    expect(names.dbInstance.length).toBe(63);
  });
});

describe('resourceNames', () => {
  const names = resourceNames(resolveDeployer({ DEPLOYER: 'SIAM-MEGAMART-POINT-HUB' }));

  it('prefixes every account-unique name', () => {
    expect(names.stack('data')).toBe('SIAM-MEGAMART-POINT-HUB-PointhubData');
    expect(names.ecrRepository).toBe('siam-megamart-point-hub/pointhub');
    expect(names.dbInstance).toBe('siam-megamart-point-hub-pointhub-prod');
    expect(names.dbSecurityGroup).toBe('siam-megamart-point-hub-pointhub-db');
    expect(names.dbClientSecurityGroup).toBe('siam-megamart-point-hub-pointhub-db-client');
    expect(names.dbSecret).toBe('siam-megamart-point-hub/prod/pointhub-db');
    expect(names.vpc).toBe('siam-megamart-point-hub-pointhub-vpc');
    expect(names.vpcFlowLogGroup).toBe('/aws/vpc/siam-megamart-point-hub-pointhub-flow-logs');
  });

  it('scopes the whole SSM namespace under the deployer', () => {
    for (const value of Object.values(names.ssm)) {
      expect(value).toMatch(/^\/siam-megamart-point-hub\/prod\//);
    }
  });

  it('produces names that satisfy the AWS naming rules they are used for', () => {
    // ECR: lowercase alphanumerics with . _ - and / separators.
    expect(names.ecrRepository).toMatch(/^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/);
    // RDS: starts with a letter, lowercase alphanumerics and hyphens, <= 63.
    expect(names.dbInstance).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(names.dbInstance.length).toBeLessThanOrEqual(63);
    expect(names.dbInstance.endsWith('-')).toBe(false);
    // CloudFormation stack names.
    for (const key of ['ecr', 'network', 'data', 'app', 'cicdRole'] as const) {
      expect(names.stack(key)).toMatch(/^[A-Za-z][A-Za-z0-9-]*$/);
      expect(names.stack(key).length).toBeLessThanOrEqual(128);
    }
    // SSM parameter paths.
    for (const value of Object.values(names.ssm)) {
      expect(value).toMatch(/^[a-zA-Z0-9_.\-/]+$/);
    }
  });

  it('gives two different deployers entirely disjoint names', () => {
    const other = resourceNames(resolveDeployer({ DEPLOYER: 'Other-Team' }));

    expect(other.ecrRepository).not.toBe(names.ecrRepository);
    expect(other.dbInstance).not.toBe(names.dbInstance);
    expect(other.stack('data')).not.toBe(names.stack('data'));
    for (const key of Object.keys(names.ssm) as Array<keyof typeof names.ssm>) {
      expect(other.ssm[key]).not.toBe(names.ssm[key]);
    }
  });
});

describe('loadDotEnv', () => {
  function withTempEnv(contents: string, run: (file: string) => void) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pointhub-env-'));
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, contents);
    try {
      run(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('reads KEY=VALUE pairs', () => {
    withTempEnv('DEPLOYER=From-File\n', (file) => {
      const env: NodeJS.ProcessEnv = {};
      loadDotEnv(file, env);

      expect(env.DEPLOYER).toBe('From-File');
    });
  });

  it('does not override a value already in the environment', () => {
    // Lets CI set DEPLOYER without editing a file that is not committed.
    withTempEnv('DEPLOYER=From-File\n', (file) => {
      const env: NodeJS.ProcessEnv = { DEPLOYER: 'From-Environment' };
      loadDotEnv(file, env);

      expect(env.DEPLOYER).toBe('From-Environment');
    });
  });

  it('ignores comments, blank lines and malformed lines', () => {
    withTempEnv('# comment\n\nnot-a-pair\nDEPLOYER=Ok\n', (file) => {
      const env: NodeJS.ProcessEnv = {};
      loadDotEnv(file, env);

      expect(env.DEPLOYER).toBe('Ok');
      expect(Object.keys(env)).toEqual(['DEPLOYER']);
    });
  });

  it('strips surrounding quotes and keeps = inside values', () => {
    withTempEnv('DEPLOYER="Quoted"\nOTHER=a=b\n', (file) => {
      const env: NodeJS.ProcessEnv = {};
      loadDotEnv(file, env);

      expect(env.DEPLOYER).toBe('Quoted');
      expect(env.OTHER).toBe('a=b');
    });
  });

  it('is a no-op when the file does not exist', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(() => loadDotEnv('/nonexistent/.env', env)).not.toThrow();
    expect(Object.keys(env)).toHaveLength(0);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildPoolConfig } from '../../src/db/pool';

/**
 * TLS configuration for the pg pool.
 *
 * Worth pinning because the failure modes are quiet: a pool that silently
 * connects without TLS, or one that skips certificate verification, both look
 * exactly like a working pool until someone reads the traffic.
 */
describe('buildPoolConfig', () => {
  let caPath: string;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pointhub-ca-'));
    caPath = path.join(tmpDir, 'bundle.pem');
    fs.writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nstub\n-----END CERTIFICATE-----\n');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('connection parameters', () => {
    it('falls back to the local development defaults', () => {
      const config = buildPoolConfig({});

      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
      expect(config.user).toBe('pointhub');
      expect(config.database).toBe('pointhub');
    });

    it('reads host, port and database from the environment', () => {
      const config = buildPoolConfig({
        DB_HOST: 'pointhub.abc123.ap-southeast-1.rds.amazonaws.com',
        DB_PORT: '5433',
        DB_USER: 'appuser',
        DB_PASSWORD: 'from-secrets-manager',
        DB_NAME: 'pointhub_prod',
      });

      expect(config.host).toBe('pointhub.abc123.ap-southeast-1.rds.amazonaws.com');
      expect(config.port).toBe(5433);
      expect(config.user).toBe('appuser');
      expect(config.database).toBe('pointhub_prod');
    });
  });

  describe('TLS', () => {
    it('is off by default, so Docker Compose and CI service containers work unchanged', () => {
      expect(buildPoolConfig({}).ssl).toBeUndefined();
    });

    it('is off for any DB_SSL value other than the exact string "true"', () => {
      // Guards against a truthiness bug making DB_SSL=false enable TLS.
      for (const value of ['false', '0', '', 'TRUE', 'yes']) {
        expect(buildPoolConfig({ DB_SSL: value }).ssl, `DB_SSL=${value}`).toBeUndefined();
      }
    });

    it('loads the CA bundle and verifies the certificate when DB_SSL=true', () => {
      const config = buildPoolConfig({ DB_SSL: 'true', DB_CA_PATH: caPath });

      expect(config.ssl).toBeDefined();
      const ssl = config.ssl as { ca: string; rejectUnauthorized: boolean };
      expect(ssl.rejectUnauthorized).toBe(true);
      expect(ssl.ca).toContain('BEGIN CERTIFICATE');
    });

    it('refuses to start when DB_SSL=true but no CA path is given', () => {
      // Connecting without the RDS bundle would mean either disabling
      // verification or failing on first query; neither should be reachable.
      expect(() => buildPoolConfig({ DB_SSL: 'true' })).toThrow(/requires DB_CA_PATH/);
    });

    it('refuses to start when the CA bundle is missing from disk', () => {
      expect(() =>
        buildPoolConfig({ DB_SSL: 'true', DB_CA_PATH: '/nonexistent/bundle.pem' })
      ).toThrow(/does not exist/);
    });

    it('never disables certificate verification', () => {
      const config = buildPoolConfig({ DB_SSL: 'true', DB_CA_PATH: caPath });
      const ssl = config.ssl as { rejectUnauthorized: boolean };

      expect(ssl.rejectUnauthorized).not.toBe(false);
    });
  });
});

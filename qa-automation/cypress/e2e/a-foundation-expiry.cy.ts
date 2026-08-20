/// <reference types="cypress" />

import { api, earnSimple, getBalance, txId } from '../support/api';

/**
 * Section A — Dev B deliverables: health/lifecycle, metrics, point expiry.
 *
 * Manual-only cases (CLI / infrastructure, not reachable from a browser runner):
 *   A1.1–A1.3  npm test / test DB lifecycle
 *   A2.1–A2.2  eslint / prettier
 *   A3.1–A3.2  pino stdout inspection
 *   A4.3       `npm run expiry` standalone script
 *   A5.3       readiness returns 503 with PostgreSQL stopped
 *   A5.5       SIGTERM graceful shutdown
 */
describe('Section A — Foundation, Expiry, Operations (Dev B)', () => {
  describe('A5: Health & Lifecycle', () => {
    it('A5.1 — GET /api/health returns ok', () => {
      api.health().then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({ status: 'ok', service: 'pointhub' });
      });
    });

    it('A5.2 — GET /api/ready reports a connected database', () => {
      api.ready().then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.status).to.eq('ready');
        expect(res.body.db).to.eq('connected');
      });
    });

    it('A5.4 — GET /api/metrics returns Prometheus exposition format', () => {
      api.metrics().then((res) => {
        expect(res.status).to.eq(200);
        expect(res.headers['content-type']).to.contain('text/plain');
        expect(res.body, 'metric help lines').to.match(/^# HELP /m);
        expect(res.body, 'metric type lines').to.match(/^# TYPE /m);
      });
    });
  });

  describe('A4: Point Expiry Job', () => {
    it('A4.1 — POST /api/admin/run-expiry succeeds and reports expired totals', () => {
      api.runExpiry().then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.have.property('totalPointsExpired');
        expect(res.body.totalPointsExpired).to.be.a('number');
      });
    });

    it('A4.1b — response matches the api-spec contract (DEF-001: implementation deviates)', () => {
      // design/api-spec.md and design/integration.md both specify
      //   { batchesExpired, totalPointsExpired, executedAt }
      // src/routes/admin.ts currently returns
      //   { success, expiredCount, totalPointsExpired, details }
      api.runExpiry().then((res) => {
        expect(res.body, 'batchesExpired per api-spec').to.have.property('batchesExpired');
        expect(res.body, 'executedAt per api-spec').to.have.property('executedAt');
      });
    });

    it('A4.2 — expiry is idempotent: a second run expires nothing new', () => {
      const memberId = 'M1005';
      const oldDate = '2024-01-15'; // earned_month 2024-01 → long past the 12-month window

      earnSimple(memberId, 'GOLD', 250, { date: oldDate }).then((earn) => {
        expect(earn.status).to.eq(200);
        expect(earn.body.pointsPosted, 'base rate 250 THB / 25').to.eq(10);
      });

      // The first run may or may not find an eligible batch — that depends on whether an
      // earlier run already expired (M1005, 2024-01). Either way the run must succeed and
      // the liability report must move by exactly what was expired.
      api.liability().then((before) => {
        api.runExpiry().then((first) => {
          expect(first.status).to.eq(200);
          const expired = first.body.totalPointsExpired;
          expect(expired, 'expired total is a non-negative integer').to.be.gte(0);

          api.liability().then((after) => {
            expect(
              after.body.totalOutstandingPoints,
              'liability drops by exactly the expired total'
            ).to.eq(before.body.totalOutstandingPoints - expired);
          });
        });
      });

      // The requirement under test: a second run is always a no-op.
      api.runExpiry().then((second) => {
        expect(second.status).to.eq(200);
        expect(second.body.totalPointsExpired, 'no double-expire').to.eq(0);
        const batches = second.body.expiredCount ?? second.body.batchesExpired;
        expect(batches, 'zero batches on re-run').to.eq(0);
      });
    });

    it('A4.2b — points back-dated into an already-expired month never expire (DEF-003)', () => {
      // Deterministic regardless of DB history: the first two runs guarantee that
      // (M1005, 2024-02) carries an EXPIRY entry, then a fresh EARN is posted into that same
      // month. runExpiry() skips any member×month that already has an EXPIRY row (NOT EXISTS),
      // so the new points stay outstanding forever — they are older than 12 months but never
      // expire, which contradicts US-005.
      const memberId = 'M1005';

      earnSimple(memberId, 'GOLD', 250, { date: '2024-02-14' });
      api.runExpiry();
      api.runExpiry().then((res) => {
        expect(res.body.totalPointsExpired, 'month is now settled').to.eq(0);
      });

      // Back-dated correction into the settled month
      earnSimple(memberId, 'GOLD', 500, { date: '2024-02-20' }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.pointsPosted).to.eq(20);
      });

      getBalance(memberId).then((afterBackdatedEarn) => {
        api.runExpiry().then((res) => {
          expect(res.status).to.eq(200);
        });
        // US-005: every point whose earned_month is older than 12 months must be expired.
        // The guard in requirements.md only exempts months that are *fully* expired, and this
        // one no longer is. Expected balance therefore drops by the back-dated 20 points.
        getBalance(memberId).then((afterExpiry) => {
          expect(afterExpiry, 'back-dated points older than 12 months must expire').to.eq(
            afterBackdatedEarn - 20
          );
        });
      });
    });

    it('A4.4 — recent points are not expired (inside the 12-month window)', () => {
      const memberId = 'M1006';
      // earned_month = current month → expires 12 months from now
      const recent = new Date();
      const recentDate = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, '0')}-05`;

      earnSimple(memberId, 'SILVER', 500, { date: recentDate, transactionId: txId('QAREC') });

      getBalance(memberId).then((balanceBefore) => {
        api.runExpiry().then((res) => {
          expect(res.status).to.eq(200);
        });
        getBalance(memberId).then((balanceAfter) => {
          expect(balanceAfter, 'recent points survive expiry').to.eq(balanceBefore);
        });
      });
    });

    it('A4.4b — expiry posts a negative EXPIRY ledger entry, never a positive one', () => {
      api.history('M1005', 500).then((res) => {
        expect(res.status).to.eq(200);
        const expiryEntries = res.body.entries.filter(
          (e: { entryType: string }) => e.entryType === 'EXPIRY'
        );
        expect(expiryEntries.length, 'M1005 has expiry history from A4.2/A4.2b').to.be.gte(1);
        expiryEntries.forEach((e: { points: number }) => {
          expect(e.points, 'EXPIRY entries are negative').to.be.lessThan(0);
        });
      });
    });

    it('A4.5 — the EXPIRY audit description names the correct earned month (DEF-004)', () => {
      // earned_month is always the first day of a month, so every description must end in -01.
      // expire-points.ts formats it with `earned_month.toISOString()`, which shifts the date one
      // day earlier under UTC+7: the ledger row stores 2024-03-01 but the audit text reads
      // "earned month 2024-02-29". Same root cause as DEF-002.
      api.history('M1005', 500).then((res) => {
        const expiryEntries = res.body.entries.filter(
          (e: { entryType: string }) => e.entryType === 'EXPIRY'
        );
        expect(expiryEntries.length, 'expiry history exists').to.be.gte(1);
        expiryEntries.forEach((e: { description: string }) => {
          const month = e.description.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
          expect(month, `description "${e.description}" names a date`).to.be.a('string');
          expect(month, 'earned month must be the first of the month').to.match(/-01$/);
        });
      });
    });
  });
});

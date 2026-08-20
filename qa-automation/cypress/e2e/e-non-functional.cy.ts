/// <reference types="cypress" />

import { api, getBalance, txId, type EarnPayload } from '../support/api';

/**
 * Section E — non-functional requirements.
 *
 * Manual/CLI-only case:
 *   E2.1  replay reproducibility (`npm run test:integration` twice against a reset DB)
 */
describe('Section E — Non-functional', () => {
  describe('E1: Performance (NFR: p95 < 150ms for earn)', () => {
    it('E1.1 — earn latency p95 stays under 150ms', () => {
      // Measured with the browser's own fetch so the number reflects what the CS UI and the
      // POS see. Timing through `cy.request` would add the Cypress proxy hop on top.
      const SAMPLES = 12;
      cy.visit('/');

      cy.window().then((win) => {
        const durations: number[] = [];

        const fire = (i: number): PromiseLike<void> => {
          const body = JSON.stringify({
            transactionId: txId(`QAE1${i}`),
            date: '2026-08-03',
            time: '10:00',
            storeId: 'S001',
            memberId: 'M1005',
            tier: 'SILVER',
            lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: 100 }],
          });
          const started = win.performance.now();
          return win
            .fetch('/api/earn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            })
            .then((r) => {
              expect(r.status, `earn #${i} status`).to.eq(200);
              // The warm-up request pays for pool creation and JIT, so it is not sampled.
              if (i > 0) durations.push(win.performance.now() - started);
            });
        };

        // Sequential on purpose: p95 of a single-request path, not throughput.
        let chain: PromiseLike<void> = Cypress.Promise.resolve();
        for (let i = 0; i <= SAMPLES; i += 1) {
          chain = chain.then(() => fire(i));
        }

        return Cypress.Promise.resolve(chain).then(() => {
          const sorted = [...durations].sort((a, b) => a - b);
          const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
          const p95 = sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
          cy.log(
            `earn latency p95=${p95.toFixed(1)}ms avg=${avg.toFixed(1)}ms n=${durations.length}`
          );
          // eslint-disable-next-line no-console
          console.table(sorted.map((d, i) => ({ rank: i + 1, ms: Number(d.toFixed(1)) })));
          expect(p95, `earn p95 latency (ms), avg=${avg.toFixed(1)}`).to.be.lessThan(150);
        });
      });
    });

    it('E1.2 — 5 concurrent earns all succeed with a correct final balance', () => {
      const memberId = 'M1006';
      const amountTHB = 250; // 10 points each at base rate
      const count = 5;

      // A visited page is required so `win.fetch` resolves relative URLs against the app origin.
      cy.visit('/');

      getBalance(memberId).then((before) => {
        cy.window().then((win) => {
          const payloads: EarnPayload[] = Array.from({ length: count }, (_, i) => ({
            transactionId: txId(`QAE2${i}`),
            date: '2026-08-03',
            time: '10:00',
            storeId: 'S001',
            memberId,
            tier: 'SILVER',
            lines: [{ lineNo: 1, category: 'GROCERY', amountTHB }],
          }));

          // Genuine parallelism: fire all requests from the browser before awaiting any.
          const inflight = payloads.map((body) =>
            win
              .fetch('/api/earn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              })
              .then((r) => r.json().then((json: unknown) => ({ status: r.status, json })))
          );

          return Cypress.Promise.all(inflight).then((results) => {
            results.forEach((r, i) => {
              expect(r.status, `concurrent earn #${i} status`).to.eq(200);
              expect((r.json as { pointsPosted: number }).pointsPosted).to.eq(10);
            });
          });
        });

        getBalance(memberId).should('eq', before + count * 10);
      });
    });
  });

  describe('E2: Data integrity', () => {
    it('E2.2 — every ledger value is a whole integer (no floating point)', () => {
      const members = ['M1001', 'M1002', 'M1003', 'M1004', 'M1005', 'M1006', 'M1007', 'M1008'];

      members.forEach((memberId) => {
        api.history(memberId, 200).then((res) => {
          expect(res.status).to.eq(200);
          res.body.entries.forEach((entry: Record<string, unknown>) => {
            expect(
              Number.isInteger(entry.points),
              `${memberId} ledger #${entry.id} points=${entry.points}`
            ).to.eq(true);

            const lines = entry.lineDetails as { milliPoints: number; amountTHB: number }[] | undefined;
            (lines ?? []).forEach((line) => {
              expect(Number.isInteger(line.milliPoints), 'milliPoints is an integer').to.eq(true);
              expect(Number.isInteger(line.amountTHB), 'amountTHB is an integer').to.eq(true);
            });
          });
        });

        getBalance(memberId).then((balance) => {
          expect(Number.isInteger(balance), `${memberId} balance=${balance}`).to.eq(true);
        });
      });
    });

    it('E2.3 — the liability report total equals the sum of its tier breakdown', () => {
      api.liability().then((res) => {
        expect(res.status).to.eq(200);
        const sum = res.body.byTier.reduce(
          (acc: number, t: { totalPoints: number }) => acc + t.totalPoints,
          0
        );
        expect(res.body.totalOutstandingPoints, 'total matches tier breakdown').to.eq(sum);
        expect(Number.isInteger(res.body.totalOutstandingPoints)).to.eq(true);
      });
    });
  });
});

/// <reference types="cypress" />

import { sel } from '../support/selectors';
import { api, earnSimple, getBalance, txId } from '../support/api';

/** Section D1 — end-to-end scenarios that cross unit boundaries (Dev A + B + C). */
describe('Section D1 — Cross-unit end-to-end scenarios', () => {
  it('D1.1 — an earn posted via API appears in the UI history with its campaign', () => {
    const transactionId = txId('QAD1');

    api
      .earn({
        transactionId,
        date: '2026-09-27', // Sat, payday window → C4 x5 wins over C1 x3
        time: '11:20',
        storeId: 'S003',
        memberId: 'M1001',
        tier: 'GOLD',
        lines: [
          { lineNo: 1, category: 'FRESH', amountTHB: 600 },
          { lineNo: 2, category: 'GROCERY', amountTHB: 250 },
        ],
      })
      .then((res) => {
        expect(res.status).to.eq(200);
        // (600 + 250) THB x5 → 850 * 5000 / 25 = 170_000 milli-points → 170 points
        expect(res.body.pointsPosted).to.eq(170);
        res.body.lineResults.forEach((line: { winningCampaign: string }) => {
          expect(line.winningCampaign).to.eq('C4');
        });
      });

    cy.openCsUi();
    cy.lookupMember('M1001');
    cy.get(sel.historyRow).first().should('contain.text', transactionId);
    cy.get(sel.historyRow).first().should('contain.text', '+170');
    cy.get(sel.historyRow).first().find(sel.historyExpandIcon).click();
    cy.get(sel.historyExpandedRow).should('contain.text', 'C4').and('contain.text', 'x5');
  });

  it('D1.2 — a UI adjustment matches the API balance afterwards', () => {
    cy.openCsUi();
    cy.lookupMember('M1004');
    cy.uiBalance().then((before) => {
      cy.submitAdjustment(75, 'GOODWILL', 'QA D1.2');
      cy.expectMessage(/Adjustment posted/);
      cy.uiBalance().should('eq', before + 75);
      getBalance('M1004').should('eq', before + 75);
    });
  });

  it('D1.3 — expiry is reflected in the finance liability report', () => {
    const memberId = 'M1002';

    earnSimple(memberId, 'SILVER', 500, { date: '2024-03-11' }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.pointsPosted).to.eq(20); // 500 / 25 at base rate
    });

    api.liability().then((before) => {
      expect(before.status).to.eq(200);
      const totalBefore = before.body.totalOutstandingPoints;

      api.runExpiry().then((expiry) => {
        expect(expiry.status).to.eq(200);
        const expired = expiry.body.totalPointsExpired;

        api.liability().then((after) => {
          // The invariant that must always hold, whether or not this run found a batch.
          expect(after.body.totalOutstandingPoints, 'liability drops by the expired total').to.eq(
            totalBefore - expired
          );
          expect(after.body.expiring.next3Months).to.be.a('number');
          expect(Number.isInteger(after.body.totalOutstandingPoints)).to.eq(true);
        });
      });
    });

    // The 2024-03 batch is settled by now, either by this run or an earlier one.
    api.history(memberId, 500).then((res) => {
      const expiryEntries = res.body.entries.filter(
        (e: { entryType: string }) => e.entryType === 'EXPIRY'
      );
      expect(expiryEntries.length, 'the member carries at least one EXPIRY entry').to.be.gte(1);
    });
  });

  it('D1.4 — EXPIRY entries are visible in the UI transaction history', () => {
    const memberId = 'M1006';
    const PAGE_SIZE = 20;

    earnSimple(memberId, 'SILVER', 250, { date: '2024-05-08' });
    api.runExpiry().then((res) => expect(res.status).to.eq(200));

    // The entry can sit on any page, so locate it through the API first and open that page.
    api.history(memberId, 500).then((res) => {
      const index = res.body.entries.findIndex(
        (e: { entryType: string }) => e.entryType === 'EXPIRY'
      );
      expect(index, 'an EXPIRY entry exists for this member').to.be.gte(0);
      const page = Math.floor(index / PAGE_SIZE) + 1;

      cy.openCsUi();
      cy.lookupMember(memberId);
      cy.get(sel.historyCard).within(() => {
        if (page > 1) {
          cy.get(`${sel.paginationItem}[title="${page}"]`).click();
          cy.get('.ant-pagination-item-active').should('have.text', String(page));
        }
        cy.get(sel.historyRow).should('contain.text', 'EXPIRY');
      });
    });
  });

  it('D1.5 — a refund can drive the balance negative and the UI shows it', () => {
    const memberId = 'M1007';
    const earnTx = txId('QAD15E');
    const refundTx = txId('QAD15R');

    // Drain the balance to a known small number, then earn / burn / refund
    getBalance(memberId).then((start) => {
      if (start > 0) {
        api.adjustment({
          memberId,
          points: -start,
          reasonCode: 'SYSTEM_ERROR',
          description: 'QA D1.5 reset to zero',
        });
      }

      // Earn 50 points: 2.5 (C3 PLATINUM always-on) → need base-rate date instead
      api
        .earn({
          transactionId: earnTx,
          date: '2026-08-03',
          time: '10:00',
          storeId: 'S001',
          memberId,
          tier: 'SILVER', // request tier drives campaign matching, keeps this at base rate
          lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: 1250 }],
        })
        .then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.pointsPosted, '1250 / 25 at base rate').to.eq(50);
        });

      // Burn 100 requires a balance of 100 — burn is capped, so use an adjustment top-up
      api.adjustment({
        memberId,
        points: 50,
        reasonCode: 'EVENT_BONUS',
        description: 'QA D1.5 top-up to allow a burn',
      });
      api.burn({ memberId, points: 100, basketTotalTHB: 500 }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.pointsBurned).to.eq(100);
      });

      // Full refund of the original earn claws back all 50 points → balance goes negative
      api
        .refund({
          transactionId: refundTx,
          originalTransactionId: earnTx,
          date: '2026-08-04',
          time: '10:00',
          storeId: 'S001',
          memberId,
          tier: 'SILVER',
          lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: -1250 }],
        })
        .then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.isFullRefund).to.eq(true);
          expect(res.body.pointsClawedBack).to.eq(50);
        });

      getBalance(memberId).then((final) => {
        expect(final, 'balance is allowed to go negative').to.be.lessThan(0);

        cy.openCsUi();
        cy.lookupMember(memberId);
        cy.uiBalance().should('eq', final);
        cy.get(sel.historyCard).find(sel.historyRow).should('contain.text', 'REFUND_CLAWBACK');
      });
    });
  });
});

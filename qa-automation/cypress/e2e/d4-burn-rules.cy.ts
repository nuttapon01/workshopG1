/// <reference types="cypress" />

import { api, getBalance, txId } from '../support/api';

/**
 * Section D4 — redemption rules: 1 point = 0.25 THB, minimum 100, multiples of 100,
 * capped at 50% of the basket, and the burned portion earns nothing.
 */
describe('Section D4 — Burn rules', () => {
  const memberId = 'M1003';

  /** Guarantees the member can afford `points` before a burn attempt. */
  const ensureBalance = (points: number) =>
    getBalance(memberId).then((balance) => {
      if (balance < points) {
        api.adjustment({
          memberId,
          points: points - balance + 100,
          reasonCode: 'EVENT_BONUS',
          description: 'QA D4 balance top-up',
        });
      }
    });

  it('D4.1 — below the 100 point minimum is rejected', () => {
    api.burn({ memberId, points: 50, basketTotalTHB: 1000 }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body.error).to.contain('Minimum redemption is 100 points');
    });
  });

  it('D4.2 — a non-multiple of 100 is rejected', () => {
    api.burn({ memberId, points: 150, basketTotalTHB: 1000 }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body.error).to.contain('multiples of 100');
    });
  });

  it('D4.3 — more than 50% of the basket is rejected and maxRedeemable is returned', () => {
    // Basket 200 THB → 50% = 100 THB → 400 points max. 500 points is over the cap.
    api.burn({ memberId, points: 500, basketTotalTHB: 200 }).then((res) => {
      expect(res.status).to.eq(400);
      expect(res.body.error).to.contain('50%');
      expect(res.body.maxRedeemable, 'cap rounded down to a multiple of 100').to.eq(400);
    });
  });

  it('D4.4 — insufficient balance is rejected with the current balance echoed back', () => {
    getBalance(memberId).then((balance) => {
      const tooMany = Math.ceil((balance + 1000) / 100) * 100;
      api.burn({ memberId, points: tooMany, basketTotalTHB: tooMany * 10 }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body.error).to.contain('Insufficient balance');
        expect(res.body.currentBalance).to.eq(balance);
      });
    });
  });

  it('D4.5 — a valid burn of 200 points on a 500 THB basket gives 50 THB off', () => {
    ensureBalance(200);
    getBalance(memberId).then((before) => {
      api
        .burn({ memberId, points: 200, basketTotalTHB: 500, transactionId: txId('QAD45') })
        .then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.pointsBurned).to.eq(200);
          expect(res.body.discountTHB, '200 x 0.25 THB').to.eq(50);
          expect(res.body.earnableAmountTHB, 'burned portion does not earn').to.eq(450);
          expect(res.body.remainingBalance).to.eq(before - 200);
        });
      getBalance(memberId).should('eq', before - 200);
    });
  });

  it('D4.6 — exactly 50% of the basket is allowed (boundary)', () => {
    ensureBalance(100);
    // Basket 50 THB → 50% = 25 THB → 100 points is exactly at the cap.
    api.burn({ memberId, points: 100, basketTotalTHB: 50 }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.discountTHB).to.eq(25);
      expect(res.body.earnableAmountTHB).to.eq(25);
    });
  });

  it('D4.7 — a burn writes a negative BURN entry to the ledger', () => {
    api.history(memberId, 20).then((res) => {
      const burns = res.body.entries.filter((e: { entryType: string }) => e.entryType === 'BURN');
      expect(burns.length, 'burn history exists after D4.5/D4.6').to.be.greaterThan(0);
      burns.forEach((b: { points: number }) => {
        expect(b.points, 'BURN entries are negative').to.be.lessThan(0);
      });
    });
  });
});

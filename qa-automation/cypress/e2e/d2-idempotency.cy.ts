/// <reference types="cypress" />

import { api, getBalance, txId } from '../support/api';

/** Section D2 — POS retry simulation: the same transaction id must never post twice. */
describe('Section D2 — Idempotency', () => {
  it('D2.1 — a duplicate earn returns duplicate:true and leaves the balance unchanged', () => {
    const memberId = 'M1005';
    const transactionId = txId('QAD21');
    const payload = {
      transactionId,
      date: '2026-09-08',
      time: '18:42',
      storeId: 'S002',
      memberId,
      tier: 'GOLD' as const,
      lines: [{ lineNo: 1, category: 'FRESH', amountTHB: 500 }],
    };

    api.earn(payload).then((first) => {
      expect(first.status).to.eq(200);
      expect(first.body.duplicate).to.eq(false);
      const posted = first.body.pointsPosted;

      getBalance(memberId).then((afterFirst) => {
        api.earn(payload).then((second) => {
          expect(second.status).to.eq(200);
          expect(second.body.duplicate, 'second POST flagged as duplicate').to.eq(true);
          expect(second.body.pointsPosted, 'same points returned').to.eq(posted);

          getBalance(memberId).should('eq', afterFirst);
        });
      });
    });
  });

  it('D2.2 — a duplicate refund does not claw back twice', () => {
    const memberId = 'M1005';
    const earnTx = txId('QAD22E');
    const refundTx = txId('QAD22R');

    api
      .earn({
        transactionId: earnTx,
        date: '2026-08-03',
        time: '09:00',
        storeId: 'S001',
        memberId,
        tier: 'SILVER',
        lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: 750 }],
      })
      .then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.pointsPosted).to.eq(30);
      });

    const refundPayload = {
      transactionId: refundTx,
      originalTransactionId: earnTx,
      date: '2026-08-04',
      time: '09:00',
      storeId: 'S001',
      memberId,
      tier: 'SILVER' as const,
      lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: -750 }],
    };

    api.refund(refundPayload).then((first) => {
      expect(first.status).to.eq(200);
      expect(first.body.duplicate).to.eq(false);
      expect(first.body.pointsClawedBack).to.eq(30);

      getBalance(memberId).then((afterFirst) => {
        api.refund(refundPayload).then((second) => {
          expect(second.status).to.eq(200);
          expect(second.body.duplicate, 'second refund flagged as duplicate').to.eq(true);
          expect(second.body.pointsClawedBack, 'same clawback returned').to.eq(30);

          getBalance(memberId).should('eq', afterFirst);
        });
      });
    });
  });

  it('D2.3 — an adjustment has no idempotency key, so repeats stack (documented behaviour)', () => {
    const memberId = 'M1008';
    getBalance(memberId).then((before) => {
      api.adjustment({ memberId, points: 3, reasonCode: 'GOODWILL', description: 'QA D2.3 a' });
      api.adjustment({ memberId, points: -3, reasonCode: 'SYSTEM_ERROR', description: 'QA D2.3 b' });
      getBalance(memberId).should('eq', before);
    });
  });
});

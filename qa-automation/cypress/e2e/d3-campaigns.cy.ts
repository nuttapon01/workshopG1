/// <reference types="cypress" />

import { api, txId, type Tier, type TxLine } from '../support/api';

/**
 * Section D3 — campaign resolution scenarios from sample-data/campaign-examples.md.
 * Expected values are taken from sample-data/expected-points.csv (the ground truth).
 *
 * Seeded campaigns: C1 FRESH x3 weekends 1–30 Sep | C2 GOLD x2 1–15 Sep |
 * C3 PLATINUM x2.5 always-on | C4 storewide x5 25–28 Sep | C5 HOME x2 10 Sep–10 Oct.
 */

interface EarnCase {
  id: string;
  title: string;
  date: string;
  memberId: string;
  tier: Tier;
  lines: TxLine[];
  expectedPoints: number;
  expectedMilliPoints: number;
  expectedCampaigns: (string | null)[];
}

const postEarn = (c: EarnCase) => {
  const transactionId = txId('QAD3');
  return api
    .earn({
      transactionId,
      date: c.date,
      time: '12:00',
      storeId: 'S001',
      memberId: c.memberId,
      tier: c.tier,
      lines: c.lines,
    })
    .then((res) => {
      expect(res.status, `${c.id} HTTP status`).to.eq(200);
      expect(res.body.pointsPosted, `${c.id} pointsPosted`).to.eq(c.expectedPoints);
      expect(res.body.totalMilliPoints, `${c.id} totalMilliPoints`).to.eq(c.expectedMilliPoints);
      const winners = res.body.lineResults.map(
        (l: { winningCampaign: string | null }) => l.winningCampaign
      );
      expect(winners, `${c.id} winning campaigns`).to.deep.eq(c.expectedCampaigns);
      return res;
    });
};

describe('Section D3 — Campaign resolution', () => {
  const cases: EarnCase[] = [
    {
      id: 'D3.1',
      title: 'C4 x5 beats C1 x3 — GOLD buys FRESH inside the payday window',
      date: '2026-09-27',
      memberId: 'M1001',
      tier: 'GOLD',
      lines: [
        { lineNo: 1, category: 'FRESH', amountTHB: 600 },
        { lineNo: 2, category: 'GROCERY', amountTHB: 250 },
      ],
      expectedMilliPoints: 170000,
      expectedPoints: 170,
      expectedCampaigns: ['C4', 'C4'],
    },
    {
      id: 'D3.2',
      title: 'C4 x5 beats always-on C3 x2.5 — PLATINUM during payday',
      date: '2026-09-26',
      memberId: 'M1007',
      tier: 'PLATINUM',
      lines: [{ lineNo: 1, category: 'ELECTRONICS', amountTHB: 990 }],
      expectedMilliPoints: 198000,
      expectedPoints: 198,
      expectedCampaigns: ['C4'],
    },
    {
      id: 'D3.3',
      title: 'x2 tie is broken deterministically by priority — C2 (20) over C5 (15)',
      date: '2026-09-12',
      memberId: 'M1001',
      tier: 'GOLD',
      lines: [
        { lineNo: 1, category: 'FRESH', amountTHB: 400 },
        { lineNo: 2, category: 'HOME', amountTHB: 300 },
      ],
      expectedMilliPoints: 72000,
      expectedPoints: 72,
      expectedCampaigns: ['C1', 'C2'],
    },
    {
      id: 'D3.5',
      title: 'C1 is weekend-only — a Tuesday FRESH line falls back to C2 x2',
      date: '2026-09-08',
      memberId: 'M1001',
      tier: 'GOLD',
      lines: [{ lineNo: 1, category: 'FRESH', amountTHB: 500 }],
      expectedMilliPoints: 40000,
      expectedPoints: 40,
      expectedCampaigns: ['C2'],
    },
    {
      id: 'D3.6',
      title: 'C3 x2.5 fractional multiplier stays exact in integer arithmetic',
      date: '2026-09-18',
      memberId: 'M1007',
      tier: 'PLATINUM',
      lines: [
        { lineNo: 1, category: 'GROCERY', amountTHB: 1000 },
        { lineNo: 2, category: 'HEALTH', amountTHB: 260 },
      ],
      expectedMilliPoints: 126000,
      expectedPoints: 126,
      expectedCampaigns: ['C3', 'C3'],
    },
    {
      id: 'D3.7',
      title: '749 THB at x2 rounds DOWN at basket level (59, not 60)',
      date: '2026-09-14',
      memberId: 'M1002',
      tier: 'SILVER',
      lines: [{ lineNo: 1, category: 'HOME', amountTHB: 749 }],
      expectedMilliPoints: 59920,
      expectedPoints: 59,
      expectedCampaigns: ['C5'],
    },
    {
      id: 'D3.8',
      title: 'rounding happens once per basket, not per line (29, not 27)',
      date: '2026-09-06',
      memberId: 'M1004',
      tier: 'SILVER',
      lines: [
        { lineNo: 1, category: 'FRESH', amountTHB: 137 },
        { lineNo: 2, category: 'FRESH', amountTHB: 89 },
        { lineNo: 3, category: 'GROCERY', amountTHB: 47 },
      ],
      expectedMilliPoints: 29000,
      expectedPoints: 29,
      expectedCampaigns: ['C1', 'C1', null],
    },
    {
      id: 'D3.9',
      title: 'a basket under the 25 THB base floor still earns at x5',
      date: '2026-09-28',
      memberId: 'M1008',
      tier: 'GOLD',
      lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: 24 }],
      expectedMilliPoints: 4800,
      expectedPoints: 4,
      expectedCampaigns: ['C4'],
    },
    {
      id: 'D3.10',
      title: 'the day after C2 ends, GOLD drops to base rate',
      date: '2026-09-16',
      memberId: 'M1005',
      tier: 'GOLD',
      lines: [{ lineNo: 1, category: 'GROCERY', amountTHB: 480 }],
      expectedMilliPoints: 19200,
      expectedPoints: 19,
      expectedCampaigns: [null],
    },
  ];

  cases.forEach((c) => {
    it(`${c.id} — ${c.title}`, () => {
      postEarn(c);
    });
  });

  it('D3.4 — a partial refund claws back original minus recomputed, not the line total (DEF-002)', () => {
    const memberId = 'M1004';
    const earnTx = txId('QAD34E');
    const refundTx = txId('QAD34R');

    // Sat 12 Sep, GOLD: FRESH 137 -> C1 x3 (16440), HOME 89 -> C2 x2 (7120),
    // GROCERY 47 -> C2 x2 (3760). Basket = 27320 milli -> 27 points.
    api
      .earn({
        transactionId: earnTx,
        date: '2026-09-12',
        time: '12:00',
        storeId: 'S001',
        memberId,
        tier: 'GOLD',
        lines: [
          { lineNo: 1, category: 'FRESH', amountTHB: 137 },
          { lineNo: 2, category: 'HOME', amountTHB: 89 },
          { lineNo: 3, category: 'GROCERY', amountTHB: 47 },
        ],
      })
      .then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.totalMilliPoints).to.eq(27320);
        expect(res.body.pointsPosted).to.eq(27);
      });

    // Return only line 3. Remaining basket = 16440 + 7120 = 23560 -> 23 points.
    // Correct clawback = 27 - 23 = 4. A naive "just the line" clawback would be 3.
    api
      .refund({
        transactionId: refundTx,
        originalTransactionId: earnTx,
        date: '2026-09-13',
        time: '12:00',
        storeId: 'S001',
        memberId,
        tier: 'GOLD',
        lines: [{ lineNo: 3, category: 'GROCERY', amountTHB: -47 }],
      })
      .then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.isFullRefund, 'partial refund detected').to.eq(false);
        expect(res.body.pointsClawedBack, 'recomputed difference, not the line points').to.eq(4);
      });
  });

  it('D3.4b — the same partial refund is correct when the date shift cannot change day-of-week', () => {
    // Root-cause isolation for DEF-002. Identical basket shape to D3.4 but dated Sunday
    // 6 Sep: shifting the recompute date back one day lands on Saturday, which is still
    // inside C1's weekend window, so the clawback comes out right.
    // Original: FRESH 137 -> C1 x3 (16440), FRESH 89 -> C1 x3 (10680),
    //           GROCERY 47 -> base (1880). Basket = 29000 milli -> 29 points.
    // Remaining after returning line 3 = 27120 milli -> 27 points. Clawback = 2.
    const memberId = 'M1004';
    const earnTx = txId('QAD34BE');
    const refundTx = txId('QAD34BR');

    api
      .earn({
        transactionId: earnTx,
        date: '2026-09-06',
        time: '14:48',
        storeId: 'S007',
        memberId,
        tier: 'SILVER',
        lines: [
          { lineNo: 1, category: 'FRESH', amountTHB: 137 },
          { lineNo: 2, category: 'FRESH', amountTHB: 89 },
          { lineNo: 3, category: 'GROCERY', amountTHB: 47 },
        ],
      })
      .then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.totalMilliPoints).to.eq(29000);
        expect(res.body.pointsPosted).to.eq(29);
      });

    api
      .refund({
        transactionId: refundTx,
        originalTransactionId: earnTx,
        date: '2026-09-07',
        time: '14:48',
        storeId: 'S007',
        memberId,
        tier: 'SILVER',
        lines: [{ lineNo: 3, category: 'GROCERY', amountTHB: -47 }],
      })
      .then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.isFullRefund).to.eq(false);
        expect(res.body.pointsClawedBack, 'unaffected by the UTC date shift').to.eq(2);
      });
  });

  it('D3.11 — GET /api/campaigns exposes all five seeded campaigns', () => {
    api.campaigns().then((res) => {
      expect(res.status).to.eq(200);
      const list = Array.isArray(res.body) ? res.body : res.body.campaigns;
      const ids = list.map((c: { campaignId: string }) => c.campaignId);
      expect(ids).to.include.members(['C1', 'C2', 'C3', 'C4', 'C5']);
    });
  });
});

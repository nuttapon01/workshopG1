/**
 * Standard test fixtures used across test suites.
 */

export const TEST_MEMBERS = [
  { id: 'T001', tier: 'GOLD', joinedAt: '2020-01-15' },
  { id: 'T002', tier: 'SILVER', joinedAt: '2023-06-01' },
  { id: 'T003', tier: 'PLATINUM', joinedAt: '2018-03-20' },
];

export const TEST_CAMPAIGNS = [
  {
    id: 'TC1',
    name: 'Test Fresh Weekend',
    multiplier: 3000,
    category: 'FRESH',
    tier: null,
    dayOfWeek: [0, 6],
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    priority: 10,
  },
  {
    id: 'TC2',
    name: 'Test Gold Boost',
    multiplier: 2000,
    category: null,
    tier: 'GOLD',
    dayOfWeek: null,
    startDate: '2026-09-01',
    endDate: '2026-09-15',
    priority: 20,
  },
];

/**
 * Helper to build a simple earn transaction payload.
 */
export function buildEarnPayload(opts: {
  transactionId: string;
  memberId: string;
  tier: string;
  date: string;
  time?: string;
  storeId?: string;
  lines: Array<{ lineNo: number; category: string; amountTHB: number }>;
}) {
  return {
    transactionId: opts.transactionId,
    type: 'SALE',
    date: opts.date,
    time: opts.time || '10:00:00',
    storeId: opts.storeId || 'S001',
    memberId: opts.memberId,
    tier: opts.tier,
    lines: opts.lines.map((l) => ({
      lineNo: l.lineNo,
      category: l.category,
      amountTHB: l.amountTHB,
    })),
  };
}

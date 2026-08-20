/// <reference types="cypress" />

/**
 * Typed API helpers for the PointHub REST surface.
 * All helpers use `failOnStatusCode: false` so specs can assert on 4xx/5xx explicitly.
 */

export type Tier = 'SILVER' | 'GOLD' | 'PLATINUM';
export type EntryType = 'EARN' | 'BURN' | 'REFUND_CLAWBACK' | 'ADJUSTMENT' | 'EXPIRY';

export interface TxLine {
  lineNo: number;
  category: string;
  amountTHB: number;
}

export interface EarnPayload {
  transactionId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  storeId: string;
  memberId: string;
  tier: Tier;
  lines: TxLine[];
}

export interface RefundPayload {
  transactionId: string;
  originalTransactionId: string;
  date: string;
  time: string;
  storeId: string;
  memberId: string;
  tier: Tier;
  lines: TxLine[]; // negative amounts
}

export interface HistoryEntry {
  id: number;
  entryType: EntryType;
  points: number;
  description: string;
  reasonCode: string | null;
  transactionId: string | null;
  createdAt: string;
  lineDetails?: {
    lineNo: number;
    category: string;
    amountTHB: number;
    winningCampaign: string;
    multiplier: number;
    milliPoints: number;
  }[];
}

type Req = Cypress.Chainable<Cypress.Response<any>>;

const req = (options: Partial<Cypress.RequestOptions>): Req =>
  cy.request({ failOnStatusCode: false, ...options } as Partial<Cypress.RequestOptions>);

/** Unique transaction id so re-runs never collide with earlier runs. */
export const txId = (prefix = 'QA'): string =>
  `${prefix}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;

export const api = {
  health: (): Req => req({ method: 'GET', url: '/api/health' }),
  ready: (): Req => req({ method: 'GET', url: '/api/ready' }),
  metrics: (): Req => req({ method: 'GET', url: '/api/metrics' }),

  member: (memberId: string): Req => req({ method: 'GET', url: `/api/members/${memberId}` }),

  balance: (memberId: string): Req =>
    req({ method: 'GET', url: `/api/members/${memberId}/balance` }),

  history: (memberId: string, limit = 50, offset = 0): Req =>
    req({ method: 'GET', url: `/api/members/${memberId}/history?limit=${limit}&offset=${offset}` }),

  earn: (payload: EarnPayload): Req => req({ method: 'POST', url: '/api/earn', body: payload }),

  refund: (payload: RefundPayload): Req =>
    req({ method: 'POST', url: '/api/refund', body: payload }),

  burn: (body: {
    memberId: string;
    points: number;
    basketTotalTHB: number;
    transactionId?: string;
  }): Req => req({ method: 'POST', url: '/api/burn', body }),

  adjustment: (body: {
    memberId: string;
    points: number;
    reasonCode: string;
    description?: string;
  }): Req => req({ method: 'POST', url: '/api/adjustments', body }),

  adjustments: (memberId: string): Req =>
    req({ method: 'GET', url: `/api/adjustments?memberId=${memberId}` }),

  campaigns: (): Req => req({ method: 'GET', url: '/api/campaigns' }),

  liability: (): Req => req({ method: 'GET', url: '/api/reports/liability' }),

  runExpiry: (currentMonth?: string): Req =>
    req({
      method: 'POST',
      url: '/api/admin/run-expiry',
      body: currentMonth ? { currentMonth } : {},
    }),
};

/** Reads the current balance as a number. */
export const getBalance = (memberId: string): Cypress.Chainable<number> =>
  api.balance(memberId).then((res) => {
    expect(res.status, `balance lookup ${memberId}`).to.eq(200);
    return res.body.balance as number;
  });

/**
 * Posts a single-line SALE. Base rate is 25 THB = 1 point, so `amountTHB` of 250
 * on a non-campaign date/category yields 10 points.
 */
export const earnSimple = (
  memberId: string,
  tier: Tier,
  amountTHB: number,
  opts: { date?: string; category?: string; transactionId?: string } = {}
): Cypress.Chainable<Cypress.Response<any>> =>
  api.earn({
    transactionId: opts.transactionId ?? txId('QAE'),
    date: opts.date ?? '2026-08-03', // Monday, outside every seeded campaign window
    time: '10:00',
    storeId: 'S001',
    memberId,
    tier,
    lines: [{ lineNo: 1, category: opts.category ?? 'GROCERY', amountTHB }],
  });

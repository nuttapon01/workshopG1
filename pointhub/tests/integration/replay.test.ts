import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import {
  getTestPool,
  seedMembers,
  seedCampaigns,
  clearAll,
  apiClient,
  getBalance,
} from '../helpers';

/**
 * Integration test: full transaction replay
 *
 * Reads transactions.csv, processes all 40 sales + 3 refunds via the API,
 * and verifies final balances against the spec.
 */

interface CsvRow {
  transactionId: string;
  type: string;
  originalTransactionId: string;
  date: string;
  time: string;
  storeId: string;
  memberId: string;
  tier: string;
  lineNo: number;
  category: string;
  amountTHB: number;
}

interface ExpectedRow {
  transactionId: string;
  type: string;
  originalTransactionId: string;
  date: string;
  memberId: string;
  tier: string;
  lines: number;
  basketTHB: number;
  basketMilliPoints: number;
  pointsPosted: number;
  note: string;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).filter(line => line.trim()).map(line => {
    const values = line.split(',');
    return {
      transactionId: values[0],
      type: values[1],
      originalTransactionId: values[2] || '',
      date: values[3],
      time: values[4],
      storeId: values[5],
      memberId: values[6],
      tier: values[7],
      lineNo: parseInt(values[8], 10),
      category: values[9],
      amountTHB: parseInt(values[10], 10),
    };
  });
}

function parseExpectedCsv(filePath: string): ExpectedRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  return lines.slice(1).filter(line => line.trim()).map(line => {
    // Handle CSV with possible quoted fields containing commas
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    return {
      transactionId: values[0],
      type: values[1],
      originalTransactionId: values[2] || '',
      date: values[3],
      memberId: values[4],
      tier: values[5],
      lines: parseInt(values[6], 10),
      basketTHB: parseInt(values[7], 10),
      basketMilliPoints: parseInt(values[8] || '0', 10),
      pointsPosted: parseInt(values[9], 10),
      note: values[10] || '',
    };
  });
}

interface GroupedTransaction {
  transactionId: string;
  type: string;
  originalTransactionId: string;
  date: string;
  time: string;
  storeId: string;
  memberId: string;
  tier: string;
  lines: Array<{ lineNo: number; category: string; amountTHB: number }>;
}

function groupByTransactionId(rows: CsvRow[]): GroupedTransaction[] {
  const map = new Map<string, GroupedTransaction>();

  for (const row of rows) {
    if (!map.has(row.transactionId)) {
      map.set(row.transactionId, {
        transactionId: row.transactionId,
        type: row.type,
        originalTransactionId: row.originalTransactionId,
        date: row.date,
        time: row.time,
        storeId: row.storeId,
        memberId: row.memberId,
        tier: row.tier,
        lines: [],
      });
    }
    map.get(row.transactionId)!.lines.push({
      lineNo: row.lineNo,
      category: row.category,
      amountTHB: row.amountTHB,
    });
  }

  // Return in original order (Map preserves insertion order)
  return Array.from(map.values());
}

// Expected final balances from the spec
const EXPECTED_BALANCES: Record<string, number> = {
  M1001: 383,
  M1002: 254,
  M1003: 374,
  M1004: 156,
  M1005: 567,
  M1006: 452,
  M1007: 624,
  M1008: 78,
};

// Members and campaigns matching seed.ts
const INTEGRATION_MEMBERS = [
  { id: 'M1001', tier: 'GOLD', joinedAt: '2019-03-14' },
  { id: 'M1002', tier: 'SILVER', joinedAt: '2023-11-02' },
  { id: 'M1003', tier: 'PLATINUM', joinedAt: '2017-06-21' },
  { id: 'M1004', tier: 'SILVER', joinedAt: '2024-02-09' },
  { id: 'M1005', tier: 'GOLD', joinedAt: '2021-08-30' },
  { id: 'M1006', tier: 'SILVER', joinedAt: '2025-01-17' },
  { id: 'M1007', tier: 'PLATINUM', joinedAt: '2016-10-05' },
  { id: 'M1008', tier: 'GOLD', joinedAt: '2022-05-26' },
];

const INTEGRATION_CAMPAIGNS = [
  {
    id: 'C1', name: 'Fresh Weekend', multiplier: 3000,
    category: 'FRESH', tier: null, dayOfWeek: [0, 6],
    startDate: '2026-09-01', endDate: '2026-09-30', priority: 10,
  },
  {
    id: 'C2', name: 'Gold Boost', multiplier: 2000,
    category: null, tier: 'GOLD', dayOfWeek: null,
    startDate: '2026-09-01', endDate: '2026-09-15', priority: 20,
  },
  {
    id: 'C3', name: 'Platinum Everyday', multiplier: 2500,
    category: null, tier: 'PLATINUM', dayOfWeek: null,
    startDate: null, endDate: null, priority: 30,
  },
  {
    id: 'C4', name: 'Payday Splurge', multiplier: 5000,
    category: null, tier: null, dayOfWeek: null,
    startDate: '2026-09-25', endDate: '2026-09-28', priority: 100,
  },
  {
    id: 'C5', name: 'Home & Living Push', multiplier: 2000,
    category: 'HOME', tier: null, dayOfWeek: null,
    startDate: '2026-09-10', endDate: '2026-10-10', priority: 15,
  },
];

describe('Integration: Full Transaction Replay', () => {
  let pool: Pool;
  let transactions: GroupedTransaction[];
  let expectedPoints: ExpectedRow[];

  beforeAll(async () => {
    pool = getTestPool();
    await clearAll(pool);
    await seedMembers(pool, INTEGRATION_MEMBERS);
    await seedCampaigns(pool, INTEGRATION_CAMPAIGNS);

    // Parse CSV files
    const txCsvPath = path.resolve(__dirname, '../../../sample-data/transactions.csv');
    const expectedCsvPath = path.resolve(__dirname, '../../../sample-data/expected-points.csv');

    const rows = parseCsv(txCsvPath);
    transactions = groupByTransactionId(rows);
    expectedPoints = parseExpectedCsv(expectedCsvPath);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('processes 40 sales and 3 refunds from transactions.csv', async () => {
    const sales = transactions.filter(tx => tx.type === 'SALE');
    const refunds = transactions.filter(tx => tx.type === 'REFUND');

    expect(sales.length).toBe(40);
    expect(refunds.length).toBe(3);
  });

  it('correctly calculates points for each transaction (vs expected-points.csv)', async () => {
    const sales = transactions.filter(tx => tx.type === 'SALE');
    const mismatches: string[] = [];

    // Process all sales
    for (const sale of sales) {
      const payload = {
        transactionId: sale.transactionId,
        type: 'SALE',
        date: sale.date,
        time: sale.time,
        storeId: sale.storeId,
        memberId: sale.memberId,
        tier: sale.tier,
        lines: sale.lines,
      };

      const res = await apiClient()
        .post('/api/earn')
        .send(payload)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);

      // Compare with expected-points.csv
      const expected = expectedPoints.find(e => e.transactionId === sale.transactionId);
      if (expected) {
        if (res.body.pointsPosted !== expected.pointsPosted) {
          mismatches.push(
            `${sale.transactionId}: expected=${expected.pointsPosted}, actual=${res.body.pointsPosted}, ` +
            `milliPoints expected=${expected.basketMilliPoints}, actual=${res.body.totalMilliPoints}`
          );
        }
      }
    }

    // Report mismatches
    if (mismatches.length > 0) {
      console.error('=== POINT MISMATCHES ===');
      mismatches.forEach(m => console.error(m));
    }
    expect(mismatches).toHaveLength(0);
  });

  it('correctly processes refunds', async () => {
    const refunds = transactions.filter(tx => tx.type === 'REFUND');

    for (const refund of refunds) {
      const payload = {
        transactionId: refund.transactionId,
        originalTransactionId: refund.originalTransactionId,
        date: refund.date,
        time: refund.time,
        storeId: refund.storeId,
        memberId: refund.memberId,
        tier: refund.tier,
        lines: refund.lines,
      };

      const res = await apiClient()
        .post('/api/refund')
        .send(payload)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(200);

      // Compare with expected-points.csv
      const expected = expectedPoints.find(e => e.transactionId === refund.transactionId);
      if (expected) {
        // pointsPosted in expected CSV for refunds is negative (the clawback amount)
        const expectedClawback = -expected.pointsPosted; // e.g., -(-507) = 507
        expect(res.body.pointsClawedBack).toBe(expectedClawback);
      }
    }
  });

  it('final balances match expected values', async () => {
    const balanceMismatches: string[] = [];

    for (const [memberId, expectedBalance] of Object.entries(EXPECTED_BALANCES)) {
      const actualBalance = await getBalance(pool, memberId);
      if (actualBalance !== expectedBalance) {
        balanceMismatches.push(
          `${memberId}: expected=${expectedBalance}, actual=${actualBalance}`
        );
      }
    }

    if (balanceMismatches.length > 0) {
      console.error('=== BALANCE MISMATCHES ===');
      balanceMismatches.forEach(m => console.error(m));
    }

    // Assert each balance individually for clear error messages
    for (const [memberId, expectedBalance] of Object.entries(EXPECTED_BALANCES)) {
      const actualBalance = await getBalance(pool, memberId);
      expect(actualBalance, `Balance mismatch for ${memberId}`).toBe(expectedBalance);
    }
  });
});

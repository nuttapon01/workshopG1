import * as fs from 'fs';
import * as path from 'path';

/**
 * Replays all transactions from sample-data/transactions.csv through the PointHub API.
 * Groups line items by transactionId, then sends each transaction to /api/earn or /api/refund.
 *
 * Usage: tsx src/scripts/replay.ts [baseUrl]
 * Default baseUrl: http://localhost:3000
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

interface RawLine {
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

/**
 * Shapes of the API responses this script consumes.
 *
 * Node 20's built-in `fetch` types `response.json()` as `Promise<unknown>`, so
 * each call site needs an explicit assertion. Fields are optional because the
 * error branch returns `{ error }` instead of the success payload.
 */
interface EarnResponse {
  pointsPosted?: number;
  duplicate?: boolean;
  error?: string;
}

interface RefundResponse {
  pointsClawedBack?: number;
  duplicate?: boolean;
  error?: string;
}

interface BalanceResponse {
  balance?: number;
}

/** Narrows an unknown thrown value to a printable message. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseCSV(filePath: string): RawLine[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  // Columns are read positionally below; the header row is skipped, not parsed.
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return {
      transactionId: values[0],
      type: values[1],
      originalTransactionId: values[2],
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

interface Transaction {
  transactionId: string;
  type: string;
  originalTransactionId: string;
  date: string;
  time: string;
  storeId: string;
  memberId: string;
  tier: string;
  lines: { lineNo: number; category: string; amountTHB: number }[];
}

function groupByTransaction(rawLines: RawLine[]): Transaction[] {
  const map = new Map<string, Transaction>();

  for (const raw of rawLines) {
    if (!map.has(raw.transactionId)) {
      map.set(raw.transactionId, {
        transactionId: raw.transactionId,
        type: raw.type,
        originalTransactionId: raw.originalTransactionId,
        date: raw.date,
        time: raw.time,
        storeId: raw.storeId,
        memberId: raw.memberId,
        tier: raw.tier,
        lines: [],
      });
    }
    map.get(raw.transactionId)!.lines.push({
      lineNo: raw.lineNo,
      category: raw.category,
      amountTHB: raw.amountTHB,
    });
  }

  return Array.from(map.values());
}

async function replay() {
  const csvPath = path.join(__dirname, '..', '..', '..', 'sample-data', 'transactions.csv');
  console.log(`Reading transactions from: ${csvPath}`);
  console.log(`Replaying to: ${BASE_URL}`);

  const rawLines = parseCSV(csvPath);
  const transactions = groupByTransaction(rawLines);

  // Separate sales and refunds — process sales first, then refunds
  const sales = transactions.filter((t) => t.type === 'SALE');
  const refunds = transactions.filter((t) => t.type === 'REFUND');

  console.log(`\nFound ${sales.length} sales, ${refunds.length} refunds\n`);

  // Process sales
  let successCount = 0;
  let errorCount = 0;

  for (const tx of sales) {
    try {
      const response = await fetch(`${BASE_URL}/api/earn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      const data = (await response.json()) as EarnResponse;

      if (response.ok) {
        const dup = data.duplicate ? ' (duplicate)' : '';
        console.log(`  ✓ ${tx.transactionId}: ${data.pointsPosted} pts${dup}`);
        successCount++;
      } else {
        console.error(`  ✗ ${tx.transactionId}: ${data.error}`);
        errorCount++;
      }
    } catch (err) {
      console.error(`  ✗ ${tx.transactionId}: ${errorMessage(err)}`);
      errorCount++;
    }
  }

  // Process refunds
  for (const tx of refunds) {
    try {
      const response = await fetch(`${BASE_URL}/api/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      const data = (await response.json()) as RefundResponse;

      if (response.ok) {
        const dup = data.duplicate ? ' (duplicate)' : '';
        console.log(
          `  ✓ ${tx.transactionId} (refund of ${tx.originalTransactionId}): -${data.pointsClawedBack} pts${dup}`
        );
        successCount++;
      } else {
        console.error(`  ✗ ${tx.transactionId}: ${data.error}`);
        errorCount++;
      }
    } catch (err) {
      console.error(`  ✗ ${tx.transactionId}: ${errorMessage(err)}`);
      errorCount++;
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Success: ${successCount}, Errors: ${errorCount}`);

  // Check final balances
  console.log(`\n--- Final Balances ---`);
  const expectedBalances: Record<string, number> = {
    M1001: 383,
    M1002: 254,
    M1003: 374,
    M1004: 156,
    M1005: 567,
    M1006: 452,
    M1007: 624,
    M1008: 78,
  };

  let allMatch = true;
  for (const [memberId, expected] of Object.entries(expectedBalances)) {
    try {
      const response = await fetch(`${BASE_URL}/api/members/${memberId}/balance`);
      const data = (await response.json()) as BalanceResponse;
      const actual = data.balance;
      const match = actual === expected ? '✓' : '✗';
      if (actual !== expected) allMatch = false;
      console.log(`  ${match} ${memberId}: expected=${expected}, actual=${actual}`);
    } catch (err) {
      console.log(`  ✗ ${memberId}: ${errorMessage(err)}`);
      allMatch = false;
    }
  }

  if (allMatch) {
    console.log('\n✓ All balances match! Finance-reproducibility check passed.');
  } else {
    console.log('\n✗ BALANCE MISMATCH — see above for details.');
    process.exit(1);
  }
}

replay().catch((err) => {
  console.error('Replay failed:', err);
  process.exit(1);
});

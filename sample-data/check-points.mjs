#!/usr/bin/env node
/**
 * check-points.mjs — diff your earn-API output against the answer key.
 *
 * Group 1 is the only group whose ground truth is a CSV your own service must
 * reproduce, so this is the harness for the Day-2 demo: produce a CSV of what
 * your API posted per transaction, then run this to see exactly which
 * transactions disagree and why (winning campaign + milli-points per line).
 *
 * Usage:
 *   node check-points.mjs your-points.csv
 *
 * your-points.csv needs a header row with (at least) two columns:
 *   - the transaction id:  transactionId | id | txId
 *   - the points posted:   pointsPosted  | points
 * Column order and extra columns do not matter. How you produce the file is up
 * to you — a small replay script that POSTs ../sample-data/transactions.csv to
 * your API and writes one line per transaction is the usual way.
 *
 * Exit code 0 = every transaction matches the answer key. 1 = something differs.
 * Zero dependencies; Node 20+.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const load = f => parseCsv(readFileSync(join(HERE, f), "utf8"));

const expected = load("expected-points.csv");
const byLine = load("expected-points-by-line.csv");

const yourFile = process.argv[2];
if (!yourFile) {
  console.error("usage: node check-points.mjs <your-points.csv>   (see header comment for the format)");
  process.exit(2);
}
const yours = parseCsv(readFileSync(yourFile, "utf8"));

const idCol = o => o.transactionId ?? o.id ?? o.txId;
const ptsCol = o => o.pointsPosted ?? o.points;
if (yours.length === 0 || idCol(yours[0]) === undefined || ptsCol(yours[0]) === undefined) {
  console.error("could not find a transaction-id and points column in " + yourFile);
  console.error("header needs: transactionId (or id/txId) and pointsPosted (or points)");
  process.exit(2);
}
const got = new Map(yours.map(o => [idCol(o), Number(ptsCol(o))]));

let bad = 0, missing = 0;
for (const e of expected) {
  const id = e.transactionId, want = Number(e.pointsPosted);
  if (!got.has(id)) { missing++; console.log(`MISSING   ${id}  (expected ${want})`); continue; }
  const have = got.get(id);
  if (have === want) continue;
  bad++;
  console.log(`MISMATCH  ${id}  yours=${have}  expected=${want}` + (e.note ? `\n          why: ${e.note}` : ""));
  const lines = byLine.filter(l => l.transactionId === id);
  for (const l of lines)
    console.log(`          line ${l.lineNo}: ${l.category} ${l.amountTHB} THB -> ${l.winningCampaign} x${l.multiplier} = ${l.milliPoints} milli-points`);
}
const extras = [...got.keys()].filter(id => !expected.some(e => e.transactionId === id));
for (const id of extras) console.log(`EXTRA     ${id}  (not in the answer key)`);

const total = expected.length;
console.log(`\n${total - bad - missing}/${total} transactions match` +
  (bad || missing ? ` — ${bad} mismatch, ${missing} missing` : " — clean. Replay-ready for the demo."));
process.exit(bad || missing ? 1 : 0);

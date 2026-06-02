import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals13 from "../data/backtest_13.json" with { type: "json" }; // Heat pool=9, sharpe null
import signals1 from "../data/backtest_1.json" with { type: "json" };   // Heat happy path
import {
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "./_measure_helpers.mjs";

// Column formatters defence — every column maps `null` to "N/A" rather than
// e.g. "0.000" or the literal string "null". The full Heat table is rendered
// through the COLUMN_CONFIG.heat_columns pipeline; this test feeds a fixture
// that forces a column-wide null for sharpeRatio and asserts the rendered
// cells say "N/A".

const renderHeat = async (rows) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of rows) await svc.tick(toClosedTick(row));
  return await svc.getReport("md-columns", EXCHANGE, FRAME, true);
};

// Extract the column table body — rows between header separator and trailing
// empty line. Returns array of cell-string arrays.
const extractTableRows = (md) => {
  const lines = md.split("\n");
  const sepIdx = lines.findIndex((l) => /^\| ---/.test(l));
  if (sepIdx < 0) return [];
  const out = [];
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith("|")) break;
    const cells = l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    out.push(cells);
  }
  return out;
};

// ---------------------------------------------------------------------------
// 1. Heat with pool < MIN_SIGNALS_FOR_RATIOS — every per-symbol sharpeRatio
//    is null. Every "Sharpe" column cell must render as "N/A", not "0.000".
// ---------------------------------------------------------------------------
test("columns: heat — null sharpeRatio renders 'N/A' across all symbol rows", async ({ pass, fail }) => {
  const md = await renderHeat(signals13);

  // First row is the header (symbol names like "POOL9-A", etc.). Find the
  // Sharpe column index by header.
  const headerLine = md.split("\n").find((l) => /^\| Symbol \|/.test(l));
  if (!headerLine) {
    fail(`heat report header line not found:\n${md.slice(0, 600)}`);
    return;
  }
  const headers = headerLine.split("|").slice(1, -1).map((c) => c.trim());
  const sharpeIdx = headers.indexOf("Sharpe");
  if (sharpeIdx < 0) {
    fail(`'Sharpe' column not found in headers: ${JSON.stringify(headers)}`);
    return;
  }

  const rows = extractTableRows(md);
  if (rows.length === 0) {
    fail(`no data rows extracted from table`);
    return;
  }

  for (const cells of rows) {
    const sharpeCell = cells[sharpeIdx];
    if (sharpeCell !== "N/A") {
      fail(`per-symbol Sharpe cell must be 'N/A' for pool=9 (each symbol <10 trades), got '${sharpeCell}' in row: ${JSON.stringify(cells)}`);
      return;
    }
  }
  pass(`All ${rows.length} per-symbol Sharpe cells render 'N/A'`);
});

// ---------------------------------------------------------------------------
// 2. Heat happy path — Sharpe cells render numerically (or 'N/A' if gated).
//    Verifies that the column pipeline doesn't accidentally strip the
//    numeric value or insert NaN/null literals.
// ---------------------------------------------------------------------------
test("columns: heat — numeric or 'N/A', never 'NaN' or literal 'null'", async ({ pass, fail }) => {
  const md = await renderHeat(signals1);

  if (/\bNaN\b/.test(md)) {
    fail(`report contains 'NaN':\n${md.slice(0, 1200)}`);
    return;
  }
  // The word "null" must not appear in column cells (allowed only inside
  // explanatory legend lines, but Heat legend doesn't include it).
  const lines = md.split("\n");
  for (const l of lines) {
    if (l.startsWith("|") && /\bnull\b/.test(l)) {
      fail(`table row contains literal 'null': ${l}`);
      return;
    }
  }
  pass(`Heat columns contain no 'NaN' or literal 'null'`);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_24.json" with { type: "json" };
import { runHeat } from "../utils/_measure_helpers.mjs";

// Edge case: Heat sort order.
// 3 symbols × 12 trades each, each with a distinct Sharpe (high / mid / negative).
// stats.symbols must come back sorted by sharpeRatio DESCENDING (best first).
// Locks in regression-safety on the comparator (e.g. ascending sort, or
// nulls-first instead of nulls-last).

const assertHeatSort = (stats) => {
  const symbols = stats.symbols;
  if (symbols.length < 3) return `expected ≥3 symbols, got ${symbols.length}`;

  // Check every adjacent pair is non-increasing.
  for (let i = 1; i < symbols.length; i++) {
    const prev = symbols[i - 1].sharpeRatio;
    const curr = symbols[i].sharpeRatio;
    // null must come AFTER non-null (nulls last).
    if (prev === null && curr !== null) {
      return `sort violation: null at index ${i - 1} but non-null (${curr}) at ${i} — nulls must be last`;
    }
    if (prev !== null && curr !== null && prev < curr) {
      return `sort violation: ${symbols[i - 1].symbol}.sharpe=${prev} < ${symbols[i].symbol}.sharpe=${curr} — expected DESCending`;
    }
  }

  // Sanity: the first (highest) Sharpe must be > 0; the last (lowest) of the
  // three real symbols must be < 0 in this synthetic.
  const realSharpes = symbols.filter((s) => s.sharpeRatio !== null).map((s) => s.sharpeRatio);
  if (realSharpes.length !== 3) return `expected 3 non-null sharpes, got ${realSharpes.length}`;
  if (realSharpes[0] <= 0) return `top symbol must have positive Sharpe, got ${realSharpes[0]}`;
  if (realSharpes[realSharpes.length - 1] >= 0) {
    return `bottom symbol must have negative Sharpe, got ${realSharpes[realSharpes.length - 1]}`;
  }
  return null;
};

test("backtest_24.json: Heat — symbols sorted by sharpeRatio DESC, nulls last", async (ctx) => {
  await runHeat(lib.heatMarkdownService, signals, "Heat sort order verified", ctx, assertHeatSort);
});

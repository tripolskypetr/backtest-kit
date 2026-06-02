import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_13.json" with { type: "json" };
import { runHeat } from "../utils/_measure_helpers.mjs";

// Edge case: Heat pool below MIN_SIGNALS_FOR_RATIOS.
// 3 symbols × 3 trades = 9 pooled. portfolioSharpeRatio must be gated to null
// — bug history: pool Sharpe used to be computed at allReturns.length > 1
// without the MIN_SIGNALS_FOR_RATIOS gate, yielding noisy ±Sharpe with
// effectively no statistical meaning.

const assertHeatPoolGated = (stats) => {
  if (stats.portfolioTotalTrades !== 9) {
    return `portfolioTotalTrades must be 9, got ${stats.portfolioTotalTrades}`;
  }
  if (stats.portfolioSharpeRatio !== null) {
    return `portfolioSharpeRatio must be null when pool=9 < MIN_SIGNALS_FOR_RATIOS=10, got ${stats.portfolioSharpeRatio}`;
  }
  // Each symbol has 3 trades → all per-symbol Sharpe null too.
  for (const s of stats.symbols) {
    if (s.sharpeRatio !== null) {
      return `${s.symbol} per-symbol Sharpe must be null (3 trades < 10), got ${s.sharpeRatio}`;
    }
  }
  return null;
};

test("backtest_13.json: Heat pool=9 — portfolioSharpe gated to null", async (ctx) => {
  await runHeat(lib.heatMarkdownService, signals, "Heat pool-gate null verified", ctx, assertHeatPoolGated);
});

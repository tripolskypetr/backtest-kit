import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_79.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "./_measure_helpers.mjs";

// MAX_EXPECTED_YEARLY_RETURNS just-OVER cap.
// 30 trades, avg ≈ 0.198% → compound ≈ +105% (over 100% cap).
// expectedYearlyReturns must be NULL.

const POOL = "POOL-B79";

const assertYearlyOver = (stats) => {
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (compound ~105% over cap), got ${stats.expectedYearlyReturns}. ` +
      `Cap regression — value above 100% leaked through.`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null when yearly is null, got ${stats.calmarRatio}`;
  }
  // Sharpe and recovery still computed
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  return null;
};

test("backtest_79.json: compound ~105% just over cap → expectedYearly null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest yearly-over-cap verified", ctx, assertYearlyOver);
});

test("backtest_79.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live yearly-over-cap verified", ctx, assertYearlyOver);
});

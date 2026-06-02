import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_69.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_TRADES_PER_YEAR } from "../utils/_measure_helpers.mjs";

// Edge case: pyramid frequency — clustering toward the end.
// 30 signals: first 10 spread over 25 days, last 20 squeezed into last 5 days.
// span = 30 days, tradesPerYear = 30/30*365 = 365 (right at MAX boundary).
// avgPnl ≈ +0.7, sharpe ≈ 1.15.
// compound = (eqFinal)^(365/30) - 1 ≈ +1167% → OVER cap → expectedYearly = NULL
//
// Tests:
//   - tpy at boundary (365) — annualization passes (gate is <=)
//   - sharpe and annualizedSharpe computed
//   - expectedYearly null (compound exceeds 100% cap)
//   - Calmar null (depends on expectedYearly)
//   - recoveryFactor computed (time-independent)

const POOL = "POOL-B69";

const assertPyramid = (stats) => {
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio <= 0) return `sharpeRatio must be positive, got ${stats.sharpeRatio}`;

  // tpy = 365 exactly → annualizedSharpe computed
  if (stats.annualizedSharpeRatio === null) {
    return `annualizedSharpeRatio must be computed at tpy=${MAX_TRADES_PER_YEAR} boundary, got null`;
  }

  // compound > cap → expectedYearly null
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (compound > 100% cap), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) return `calmarRatio must be null, got ${stats.calmarRatio}`;

  // recoveryFactor still works
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor <= 0) return `recoveryFactor must be positive, got ${stats.recoveryFactor}`;
  return null;
};

test("backtest_69.json: pyramid frequency — tpy=365 boundary, compound over cap → yearly null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest pyramid frequency verified", ctx, assertPyramid);
});

test("backtest_69.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live pyramid frequency verified", ctx, assertPyramid);
});

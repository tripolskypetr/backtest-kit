import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_57.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// User scenario #3: mathematical expectation → 0.
// 30 signals: 15 wins of +0.6%, 15 losses of -0.6%. avgWin = |avgLoss|.
//   avgPnl = 0 (exactly)
//   totalPnl = 0
//   winRate = 50%
//   sharpeRatio = 0
//   sortinoRatio = 0
//   certaintyRatio = avgWin / |avgLoss| = 1.0 (the canonical "EV=0" alarm)
//   expectedYearlyReturns ≈ -0.65% (tiny volatility drag)
//
// Analytics MUST be capable of detecting and exposing such a strategy:
//   - avgPnl/totalPnl exactly 0 (NOT showing rounding noise)
//   - sharpe/sortino exactly 0 (NOT NaN)
//   - certaintyRatio = 1.0 (the BREAK-EVEN bell)
//   - expectedYearlyReturns slightly NEGATIVE due to compound volatility drag
//     (the user must see they're losing money even at "even" expectation)
//   - winRate 50% — looks healthy but isn't

const POOL = "POOL-B57";

const assertZeroEv = (stats) => {
  // avgPnl exactly 0 (within float epsilon)
  if (!approx(stats.avgPnl, 0, 1e-9)) {
    return `avgPnl must be EXACTLY 0 (avgWin = |avgLoss|), got ${stats.avgPnl}`;
  }
  if (!approx(stats.totalPnl, 0, 1e-9)) {
    return `totalPnl must be 0, got ${stats.totalPnl}`;
  }
  if (stats.winCount !== 15 || stats.lossCount !== 15) {
    return `expected 15W/15L, got ${stats.winCount}W/${stats.lossCount}L`;
  }
  if (!approx(stats.winRate, 50, 1e-9)) {
    return `winRate must be 50%, got ${stats.winRate}`;
  }

  // sharpe = avgPnl / stdDev = 0 / stdDev = 0 (stdDev > 0 since returns vary)
  if (stats.sharpeRatio === null) {
    return `sharpeRatio must be computed (stdDev > 0), got null`;
  }
  if (!approx(stats.sharpeRatio, 0, 1e-9)) {
    return `sharpeRatio must be EXACTLY 0 (avgPnl = 0), got ${stats.sharpeRatio}`;
  }

  // Sortino = 0 for the same reason
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed, got null`;
  if (!approx(stats.sortinoRatio, 0, 1e-9)) {
    return `sortinoRatio must be EXACTLY 0, got ${stats.sortinoRatio}`;
  }

  // certaintyRatio = avgWin / |avgLoss| = 0.6 / 0.6 = 1.0 (the alarm)
  if (!approx(stats.certaintyRatio, 1.0, 1e-9)) {
    return `certaintyRatio must be 1.0 (canonical break-even bell), got ${stats.certaintyRatio}`;
  }

  // The IMPORTANT INSIGHT for the user:
  // compounded expectedYearlyReturns is slightly NEGATIVE due to volatility
  // drag, even though arithmetic avgPnl is 0. This demonstrates to the user
  // that "EV = 0 arithmetically" actually MEANS "losing money compounded".
  if (stats.expectedYearlyReturns === null) {
    return `expectedYearlyReturns must be computed (under cap), got null`;
  }
  if (stats.expectedYearlyReturns >= 0) {
    return `expectedYearlyReturns must be NEGATIVE (volatility drag from compound), got ${stats.expectedYearlyReturns}. ` +
      `Locks in the key insight: EV=0 arithmetic ≠ break-even on compound returns.`;
  }
  // Magnitude check: should be very small negative (≈ -0.65%)
  if (Math.abs(stats.expectedYearlyReturns) > 5) {
    return `expectedYearlyReturns should be small negative (≈ -0.65%), got ${stats.expectedYearlyReturns}`;
  }
  return null;
};

test("backtest_57.json: zero-EV strategy — avgPnl=0, sharpe=0, certainty=1.0, expectedYearly slightly negative (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest zero-EV detection verified", ctx, assertZeroEv);
});

test("backtest_57.json: same zero-EV detection in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live zero-EV detection verified", ctx, assertZeroEv);
});

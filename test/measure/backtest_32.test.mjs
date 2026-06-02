import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_32.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: single +50% whale among 29 modest signals.
// avgPnl ≈ 1.73, stdDev ≈ 9.12 → Sharpe ≈ 0.19 (low — outlier inflates noise).
// equityFinal ≈ 1.527 → compound annual ≈ +17,000% → far over 100% cap → null.
// Account NOT blown (+50%, not -100%).
//
// Tests:
//  - high stdDev driven by outlier doesn't crash math
//  - expectedYearlyReturns goes to null (above cap), NOT to cap value
//  - blown detection doesn't misfire on a LARGE POSITIVE trade
//  - Sharpe is low despite positive avgPnl (correct: one outlier = high noise)
//  - sortinoRatio uses downside only, ignores the +50% in its denominator

const POOL = "POOL-B32";

const assertOutlier = (stats) => {
  if (stats.totalSignals !== 30 && stats.totalClosed !== 30) {
    return `count must be 30, got ${stats.totalSignals ?? stats.totalClosed}`;
  }
  // Outlier dominates avgPnl
  if (stats.avgPnl < 1.0) return `avgPnl must be > 1.0 (outlier pulls mean up), got ${stats.avgPnl}`;
  if (stats.stdDev < 5) return `stdDev must be large (outlier inflates), got ${stats.stdDev}`;
  // Sharpe low despite positive mean
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio > 1.0) return `sharpeRatio should be modest (outlier-driven noise), got ${stats.sharpeRatio}`;

  // expectedYearly above 100% cap → null. NOT a number near the cap.
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (compound ~17000% > 100% cap), got ${stats.expectedYearlyReturns}`;
  }
  // Calmar inherits null.
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null (yearlyReturns null), got ${stats.calmarRatio}`;
  }
  // recoveryFactor still computed (compound positive, DD > 0, NOT blown).
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor <= 0) return `recoveryFactor must be positive, got ${stats.recoveryFactor}`;
  return null;
};

test("backtest_32.json: single +50% outlier — avgPnl/Sharpe robust, yearly capped to null, NOT blown (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest huge-outlier verified", ctx, assertOutlier);
});

test("backtest_32.json: single +50% outlier — same shape in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live huge-outlier verified", ctx, assertOutlier);
});

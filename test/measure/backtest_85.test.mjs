import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_85.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Extreme single +1000% trade in a 30-trade pool.
// 14 wins +0.5%, 1 monster +1000%, 15 wins +0.5%.
//   stdDev ≈ 182 (huge).
//   sharpeRatio = avg/stdDev ≈ 0.185 (modest — outlier dominates noise).
//   equityFinal = (1.005)^29 * 11 ≈ 12.71 (huge compound).
//   expectedYearly massively over cap → null.
//   No NaN/Infinity from extreme magnitudes.

const POOL = "POOL-B85";

const assertExtremeWin = (stats) => {
  if (stats.winCount !== 30) return `winCount must be 30, got ${stats.winCount}`;
  if (stats.lossCount !== 0) return `lossCount must be 0, got ${stats.lossCount}`;

  // stdDev huge
  if (stats.stdDev === null || stats.stdDev < 100) {
    return `stdDev must be huge (≈182, dominated by outlier), got ${stats.stdDev}`;
  }
  // sharpe modest, NOT null and NOT astronomical
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (!isFinite(stats.sharpeRatio)) return `sharpeRatio non-finite: ${stats.sharpeRatio}`;
  if (Math.abs(stats.sharpeRatio) > 10) {
    return `sharpeRatio should be modest (outlier inflates stdDev), got ${stats.sharpeRatio}`;
  }

  // sortino null (no negatives)
  if (stats.sortinoRatio !== null) return `sortinoRatio must be null (no negatives), got ${stats.sortinoRatio}`;

  // expectedYearly above cap → null
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (compound massively over cap), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) return `calmarRatio must be null, got ${stats.calmarRatio}`;
  // recoveryFactor null (DD=0, all positive)
  if (stats.recoveryFactor !== null) return `recoveryFactor must be null (DD=0), got ${stats.recoveryFactor}`;

  // Sweep for non-finite
  for (const k of Object.keys(stats)) {
    const v = stats[k];
    if (typeof v === "number" && !isFinite(v)) {
      return `field ${k} is non-finite: ${v} — extreme value leaked through`;
    }
  }
  return null;
};

test("backtest_85.json: single +1000% trade → sharpe modest, no NaN, yearly capped (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest extreme-win bounded verified", ctx, assertExtremeWin);
});

test("backtest_85.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live extreme-win bounded verified", ctx, assertExtremeWin);
});

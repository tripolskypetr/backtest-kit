import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_39.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "./_measure_helpers.mjs";

// Edge case: lucky streak then crash. 25 wins of +1%, then 5 catastrophic
// losses of -6%. The "overconfident trader" pattern.
//
// Numbers:
//   winRate = 25/30 = 83.3%
//   totalPnl (arithmetic sum) = 25 - 30 = -5
//   equityFinal = 1.01^25 * 0.94^5 ≈ 0.9412   (COMPOUNDED, < 1)
//   maxDD = (peak 1.282 - trough 0.941) / peak ≈ 26.6%
//   recoveryFactor = (0.941 - 1) * 100 / 26.6 ≈ -0.221
//
// The surprising/educational finding: WIN RATE > 80% with NEGATIVE recovery.
// Recovery uses COMPOUNDED total return as the numerator, not winRate. The
// late losses, despite being a smaller count, dominate compounded equity.
// This locks in that recovery is NOT secretly a win-rate proxy.

const POOL = "POOL-B39";

const assertOverconfTrader = (stats) => {
  if (stats.winCount !== 25) return `winCount must be 25, got ${stats.winCount}`;
  if (stats.lossCount !== 5) return `lossCount must be 5, got ${stats.lossCount}`;
  if (Math.abs(stats.winRate - (25 / 30) * 100) > 1e-9) {
    return `winRate must be 83.33%, got ${stats.winRate}`;
  }

  // totalPnl is arithmetic sum, must be NEGATIVE (-5).
  if (stats.totalPnl >= 0) return `totalPnl must be negative (-5), got ${stats.totalPnl}`;
  if (Math.abs(stats.totalPnl - -5) > 1e-9) return `totalPnl must be -5, got ${stats.totalPnl}`;

  // recoveryFactor: COMPOUNDED numerator → negative.
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor >= 0) {
    return `SURPRISE: recoveryFactor must be NEGATIVE despite winRate=83% — compound late losses dominate. Got ${stats.recoveryFactor}`;
  }
  // Specific magnitude: ~-0.22
  if (stats.recoveryFactor < -0.5 || stats.recoveryFactor > -0.05) {
    return `recoveryFactor expected ~-0.22, got ${stats.recoveryFactor}`;
  }

  // Sharpe should also be negative — avgPnl is negative.
  if (stats.sharpeRatio === null || stats.sharpeRatio >= 0) {
    return `sharpeRatio must be negative (avgPnl < 0), got ${stats.sharpeRatio}`;
  }
  return null;
};

test("backtest_39.json: lucky streak then crash — winRate 83% but recovery NEGATIVE (compound dominates) (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest overconf-trader paradox verified", ctx, assertOverconfTrader);
});

test("backtest_39.json: lucky streak then crash — same paradox in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live overconf-trader paradox verified", ctx, assertOverconfTrader);
});

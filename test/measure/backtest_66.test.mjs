import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_66.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "./_measure_helpers.mjs";

// Edge case: TREND REVERSAL mid-period. Time-averaged metrics are BLIND.
// 20 signals: first 10 winning trend (avgPnl ≈ 0.51), last 10 losing trend (avgPnl ≈ -0.42).
// Overall avgPnl ≈ 0.045 (near zero) → sharpe ≈ 0.08 (mute).
// But equity curve climbed +5% then fell to +0.9% → maxDD ≈ 4.1%.
// recoveryFactor = 0.9 / 4.1 ≈ 0.21 (REVEALS the asymmetry).
//
// THE INSIGHT: Sharpe alone misses regime-change. RecoveryFactor and the
// equity-curve drawdown expose it. User must look at the maxDD/totalPnl
// ratio to see "compound was eaten by the reversal".

const POOL = "POOL-B66";

const assertRegimeFlip = (stats) => {
  if (stats.totalSignals !== undefined && stats.totalSignals !== 20) return `totalSignals=20, got ${stats.totalSignals}`;
  if (stats.totalClosed !== undefined && stats.totalClosed !== 20) return `totalClosed=20, got ${stats.totalClosed}`;

  // Aggregates: avgPnl near zero, sharpe near zero (the BLINDNESS)
  if (Math.abs(stats.avgPnl) > 0.1) return `avgPnl must be near zero (regime cancellation), got ${stats.avgPnl}`;
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (Math.abs(stats.sharpeRatio) > 0.2) {
    return `sharpeRatio must be near zero (mute to regime change), got ${stats.sharpeRatio}`;
  }

  // But RecoveryFactor exposes the trap: DD substantial relative to profit
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor >= 0.5) {
    return `recoveryFactor (${stats.recoveryFactor}) must be < 0.5 — DD ate the gains.`;
  }
  if (!approx(stats.recoveryFactor, 0.21, 0.05)) {
    return `recoveryFactor must be ≈0.21, got ${stats.recoveryFactor}`;
  }

  return null;
};

test("backtest_66.json: trend reversal — sharpe near zero (blind), recovery exposes the trap (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest regime flip detection verified", ctx, assertRegimeFlip);
});

test("backtest_66.json: same blindness in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live regime flip detection verified", ctx, assertRegimeFlip);
});

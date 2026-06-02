import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_7.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: all wins, no losses.
// Expectation:
// - winRate = 100, lossCount = 0, avgLoss = 0
// - certaintyRatio = null (avgLoss = 0, ratio is undefined — NOT zero)
// - sortinoRatio = null (no negative returns, downside deviation undefined)
// - equityMaxDrawdown ≈ 0 → recoveryFactor = null (DD ≤ 0)
// - sharpe positive, expectedYearlyReturns may be positive or null (cap)

const POOL = "POOL-B7";

const assertAllWins = (stats) => {
  if (stats.lossCount !== 0) return `lossCount must be 0 (all wins), got ${stats.lossCount}`;
  if (stats.winRate !== 100) return `winRate must be 100, got ${stats.winRate}`;
  if (stats.certaintyRatio !== null) {
    return `certaintyRatio must be null when no losses (undefined ratio), got ${stats.certaintyRatio}`;
  }
  if (stats.sortinoRatio !== null) {
    return `sortinoRatio must be null when no negative returns, got ${stats.sortinoRatio}`;
  }
  if (stats.recoveryFactor !== null) {
    return `recoveryFactor must be null when DD ≤ 0, got ${stats.recoveryFactor}`;
  }
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (positive), got null`;
  if (stats.sharpeRatio <= 0) return `sharpeRatio must be > 0 for all-wins, got ${stats.sharpeRatio}`;
  return null;
};

test("backtest_7.json: all wins — certainty/sortino/recovery null, Sharpe positive (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest all-wins gating verified", ctx, assertAllWins);
});

test("backtest_7.json: all wins — certainty/sortino/recovery null, Sharpe positive (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live all-wins gating verified", ctx, assertAllWins);
});

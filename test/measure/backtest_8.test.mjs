import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_8.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: all losses (no winning trades).
// Expectation:
// - winRate = 0, winCount = 0
// - sharpe, sortino, calmar all NEGATIVE (not null) — losing strategy
// - certaintyRatio = 0 (numerator avgWin = 0 / denominator avgLoss = -X) — explicitly 0, not null
// - recoveryFactor < 0 (compounded totalReturn is negative, DD > 0)
// - totalPnl strongly negative
//
// Bug history: "negative Sharpe / Sortino" — the formulas correctly produce
// negative numbers for losing strategies; the legend explains "higher is better".

const POOL = "POOL-B8";

const assertAllLosses = (stats) => {
  if (stats.winCount !== 0) return `winCount must be 0 (all losses), got ${stats.winCount}`;
  if (stats.winRate !== 0) return `winRate must be 0, got ${stats.winRate}`;
  if (stats.totalPnl >= 0) return `totalPnl must be < 0, got ${stats.totalPnl}`;
  if (stats.sharpeRatio === null || stats.sharpeRatio >= 0) {
    return `sharpeRatio must be negative (losing strategy), got ${stats.sharpeRatio}`;
  }
  if (stats.sortinoRatio === null || stats.sortinoRatio >= 0) {
    return `sortinoRatio must be negative, got ${stats.sortinoRatio}`;
  }
  // certaintyRatio: avgWin=0, avgLoss<0 → 0/|avgLoss| = 0. Explicit zero, NOT null.
  if (stats.certaintyRatio !== 0) {
    return `certaintyRatio must be 0 when no wins (avgWin=0), got ${stats.certaintyRatio}`;
  }
  if (stats.recoveryFactor === null || stats.recoveryFactor >= 0) {
    return `recoveryFactor must be negative, got ${stats.recoveryFactor}`;
  }
  return null;
};

test("backtest_8.json: all losses — negative ratios verified (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest all-losses verified", ctx, assertAllLosses);
});

test("backtest_8.json: all losses — negative ratios verified (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live all-losses verified", ctx, assertAllLosses);
});

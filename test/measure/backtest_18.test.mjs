import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_18.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: all identical returns (stdDev = 0).
// 12 signals at exactly +1.5%. Sharpe = avgPnl / stdDev = 1.5/0 — must be
// guarded to null, not Infinity / NaN. Same for sortinoRatio (no negatives)
// and annualizedSharpeRatio.

const POOL = "POOL-B18";

const assertIdentical = (stats) => {
  if (Math.abs(stats.stdDev) > 1e-9) {
    return `stdDev must be 0 for identical returns, got ${stats.stdDev}`;
  }
  if (stats.sharpeRatio !== null) {
    return `sharpeRatio must be null when stdDev=0 (division by zero guard), got ${stats.sharpeRatio}`;
  }
  if (stats.sortinoRatio !== null) {
    return `sortinoRatio must be null (no negative returns), got ${stats.sortinoRatio}`;
  }
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null when sharpeRatio is null, got ${stats.annualizedSharpeRatio}`;
  }
  if (Math.abs(stats.avgPnl - 1.5) > 1e-9) {
    return `avgPnl must be 1.5, got ${stats.avgPnl}`;
  }
  return null;
};

test("backtest_18.json: identical returns (stdDev=0) — Sharpe/Sortino null, avgPnl correct (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest stdDev=0 guards verified", ctx, assertIdentical);
});

test("backtest_18.json: identical returns (stdDev=0) — Sharpe/Sortino null, avgPnl correct (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live stdDev=0 guards verified", ctx, assertIdentical);
});

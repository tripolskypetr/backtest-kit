import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_37.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: every signal lacks peakProfit / maxDrawdown fields.
// avgPeakPnl, avgFallPnl must be null (filtered set is empty) — NOT 0 from
// the old `?? 0` bug that diluted the mean with zeros.
// All other metrics (avgPnl, sharpe, sortino, etc.) compute as normal since
// they read pnl.pnlPercentage, which IS present on every signal.

const POOL = "POOL-B37";

const assertNoPeakFall = (stats) => {
  if (stats.avgPeakPnl !== null) {
    return `avgPeakPnl must be null when NO signals provide peakProfit (no zero-dilution), got ${stats.avgPeakPnl}`;
  }
  if (stats.avgFallPnl !== null) {
    return `avgFallPnl must be null when NO signals provide maxDrawdown, got ${stats.avgFallPnl}`;
  }

  // Sanity: math that doesn't depend on peak/fall should still work.
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (N=12, varied returns), got null`;
  if (stats.totalPnl === null) return `totalPnl must be computed, got null`;
  if (stats.avgPnl === null) return `avgPnl must be computed, got null`;
  return null;
};

test("backtest_37.json: missing peakProfit/maxDrawdown — avgPeakPnl/avgFallPnl null, no zero-dilution (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest no-peakfall non-dilution verified", ctx, assertNoPeakFall);
});

test("backtest_37.json: missing peakProfit/maxDrawdown — same shape in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live no-peakfall non-dilution verified", ctx, assertNoPeakFall);
});

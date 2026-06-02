import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_76.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "./_measure_helpers.mjs";

// STDDEV_EPSILON just-ABOVE boundary.
// 30 returns of +0.5%, one offset by +1e-8 → sample stdDev ≈ 1.86e-9 > 1e-9.
// Gate `stdDev > STDDEV_EPSILON` passes → sharpe COMPUTED (very large but finite).

const POOL = "POOL-B76";

const assertEpsAbove = (stats) => {
  if (stats.stdDev === null) return `stdDev must be computed, got null`;
  if (stats.stdDev <= 1e-9) return `stdDev must be ABOVE 1e-9, got ${stats.stdDev}`;
  if (stats.stdDev > 1e-7) return `stdDev should be barely above 1e-9, got ${stats.stdDev}`;

  // sharpe computed
  if (stats.sharpeRatio === null) {
    return `sharpeRatio must be computed (stdDev > epsilon), got null. Boundary regression.`;
  }
  if (!isFinite(stats.sharpeRatio)) return `sharpeRatio non-finite: ${stats.sharpeRatio}`;
  return null;
};

test("backtest_76.json: stdDev ≈ 1.86e-9 (just above epsilon) → Sharpe computed (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest stdDev above-epsilon verified", ctx, assertEpsAbove);
});

test("backtest_76.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live stdDev above-epsilon verified", ctx, assertEpsAbove);
});

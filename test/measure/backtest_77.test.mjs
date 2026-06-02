import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_77.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// STDDEV_EPSILON just-BELOW boundary.
// 30 returns of +0.5%, one offset by +1e-11 → sample stdDev ≈ 1.86e-12 < 1e-9.
// Gate `stdDev > STDDEV_EPSILON` fails → sharpe = null.

const POOL = "POOL-B77";

const assertEpsBelow = (stats) => {
  if (stats.stdDev === null) return `stdDev must be computed, got null`;
  if (stats.stdDev >= 1e-9) return `stdDev must be BELOW 1e-9 (epsilon), got ${stats.stdDev}`;

  // sharpe null
  if (stats.sharpeRatio !== null) {
    return `sharpeRatio must be null (stdDev < epsilon), got ${stats.sharpeRatio}. Boundary regression — epsilon guard didn't trigger.`;
  }
  if (stats.sortinoRatio !== null) return `sortinoRatio must be null, got ${stats.sortinoRatio}`;
  return null;
};

test("backtest_77.json: stdDev ≈ 1.86e-12 (below epsilon) → Sharpe null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest stdDev below-epsilon verified", ctx, assertEpsBelow);
});

test("backtest_77.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live stdDev below-epsilon verified", ctx, assertEpsBelow);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_71.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "./_measure_helpers.mjs";

// Float-artifact target: certaintyRatio with epsilon-scale avgLoss.
// 29 wins of +0.4%, 1 loss of -1e-15 (artifact magnitude).
//   winCount=29, lossCount=1, avgWin=0.4, avgLoss ≈ -1e-15
//   Without epsilon guard: certaintyRatio = 0.4 / 1e-15 = 4e14 (spurious)
//   With STDDEV_EPSILON guard on |avgLoss|: certaintyRatio = null.
//
// Locks in the documented behaviour: float-artifact losses are NOT counted
// as meaningful losses for the certainty calculation.

const POOL = "POOL-B71";

const assertCertaintyEpsilon = (stats) => {
  if (stats.winCount !== 29) return `winCount must be 29, got ${stats.winCount}`;
  if (stats.lossCount !== 1) return `lossCount must be 1 (one artifact loss), got ${stats.lossCount}`;

  // The key assertion: certaintyRatio must be null, NOT an astronomical
  // value like 4e14. Locks in the STDDEV_EPSILON guard on |avgLoss|.
  if (stats.certaintyRatio !== null) {
    return `certaintyRatio must be null (|avgLoss| ≈ 1e-15 below STDDEV_EPSILON), got ${stats.certaintyRatio}. ` +
      `If non-null, the epsilon guard regressed and a float-artifact loss is producing spurious certainty.`;
  }

  // Other metrics still compute normally
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (variance from win/loss mix), got null`;
  if (!isFinite(stats.sharpeRatio)) return `sharpeRatio must be finite, got ${stats.sharpeRatio}`;
  return null;
};

test("backtest_71.json: avgLoss ≈ -1e-15 (artifact) → certaintyRatio null, not 4e14 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest certainty epsilon guard verified", ctx, assertCertaintyEpsilon);
});

test("backtest_71.json: same epsilon guard in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live certainty epsilon guard verified", ctx, assertCertaintyEpsilon);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_84.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// Sortino boundary: exactly 1 negative return.
// 29 wins of +0.5%, 1 real loss -0.5%. negativeReturns.length=1.
// downsideDev = sqrt(0.25/30) ≈ 0.0913 → > STDDEV_EPSILON.
// Sortino = avgPnl / downsideDev = ((29*0.5 - 0.5)/30) / 0.0913 ≈ 5.11.

const POOL = "POOL-B84";

const assertSortinoOneLoss = (stats) => {
  if (stats.lossCount !== 1) return `lossCount must be 1 (boundary), got ${stats.lossCount}`;
  if (stats.sortinoRatio === null) {
    return `sortinoRatio must be computed with exactly 1 negative return, got null. ` +
      `If null, the N>0 negative-returns guard is failing on the singleton case.`;
  }
  if (!isFinite(stats.sortinoRatio)) return `sortinoRatio non-finite: ${stats.sortinoRatio}`;
  if (!approx(stats.sortinoRatio, 5.11, 0.1)) {
    return `sortinoRatio must be ≈5.11, got ${stats.sortinoRatio}`;
  }
  // certaintyRatio: avgWin=0.5, avgLoss=-0.5 → 1.0 exactly
  if (!approx(stats.certaintyRatio, 1.0, 1e-6)) {
    return `certaintyRatio must be 1.0, got ${stats.certaintyRatio}`;
  }
  return null;
};

test("backtest_84.json: exactly 1 negative return → Sortino computed (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest sortino one-loss verified", ctx, assertSortinoOneLoss);
});

test("backtest_84.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live sortino one-loss verified", ctx, assertSortinoOneLoss);
});

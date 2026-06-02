import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_38.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// Edge case: extreme win/loss imbalance.
// 29 wins of +0.1% + 1 loss of -0.01%.
//
// Reference numbers:
//   avgPnl ≈ +0.0963
//   stdDev ≈ 0.0201   → sharpeRatio ≈ 4.80
//   downsideDev = √(0.01² / 30) ≈ 0.00183  (canonical: /N_total)
//   sortinoRatio = 0.0963 / 0.00183 ≈ 52.76  (huge but FINITE)
//   certaintyRatio = avgWin/|avgLoss| = 0.1/0.01 = 10
//
// Tests:
//   - sortinoRatio is finite (NOT Infinity / NaN) despite tiny downside
//   - sortinoRatio is NOT outrageous due to "modified" formula (which would
//     divide by N_negative=1 → downsideDev=0.01 → sortino=9.63)
//   - certaintyRatio = 10 exactly

const POOL = "POOL-B38";

const assertImbalance = (stats) => {
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed, got null`;
  if (!isFinite(stats.sortinoRatio)) return `sortinoRatio must be finite, got ${stats.sortinoRatio}`;

  // Canonical Sortino (N_total denominator) should be around 52, NOT 9.6
  // (the modified version). Regression-safety on the denominator choice.
  if (stats.sortinoRatio < 40 || stats.sortinoRatio > 70) {
    if (stats.sortinoRatio >= 7 && stats.sortinoRatio <= 12) {
      return `sortinoRatio=${stats.sortinoRatio} matches the "modified" formula (N_negative denom). Canonical Sortino (N_total denom) must give ~52.`;
    }
    return `sortinoRatio must be ~52 (canonical N_total denom), got ${stats.sortinoRatio}`;
  }

  // certaintyRatio
  if (stats.certaintyRatio === null) return `certaintyRatio must be computed, got null`;
  if (!approx(stats.certaintyRatio, 10, 1e-6)) {
    return `certaintyRatio must be ~10 (0.1/0.01), got ${stats.certaintyRatio}`;
  }
  return null;
};

test("backtest_38.json: extreme imbalance — Sortino finite (canonical N_total formula) (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest imbalance Sortino verified", ctx, assertImbalance);
});

test("backtest_38.json: extreme imbalance — Sortino finite in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live imbalance Sortino verified", ctx, assertImbalance);
});

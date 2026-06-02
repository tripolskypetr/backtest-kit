import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_63.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// Intermediate scenario: N=11 — just above MIN_SIGNALS_FOR_RATIOS=10.
// Between #60 (silent, n=3) and #58/#59 (full n=30).
// 7 wins +0.6%, 4 losses -0.4%, span 25 days.
//   n=11 → ratios computed but NOISY (small sample)
//   avgPnl = 0.236
//   sample stdDev ≈ 0.505
//   sharpe ≈ 0.47 (noisy but real)
//   sortino ≈ 0.98
//   profitFactor = 4.2/1.6 = 2.625
//   certaintyRatio = 0.6/0.4 = 1.5
//   span 25d ≥ 14d → annualization gate passes
//
// User insight: just enough data to compute everything, but sharpe is
// statistically unreliable. The analytics SHOULD compute the values
// (no gate), but the user must be aware the small-sample noise is high.

const POOL = "POOL-B63";

const assertBoundaryN11 = (stats) => {
  const n = stats.totalSignals ?? stats.totalClosed;
  if (n !== 11) return `count must be 11 (boundary above ratio gate), got ${n}`;
  if (stats.winCount !== 7) return `winCount must be 7, got ${stats.winCount}`;
  if (stats.lossCount !== 4) return `lossCount must be 4, got ${stats.lossCount}`;

  // ratios computed at the boundary
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed at N=11 (boundary), got null`;
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed, got null`;
  if (stats.stdDev === null || stats.stdDev <= 0) return `stdDev must be positive, got ${stats.stdDev}`;

  // sharpe / sortino positive (winning strategy)
  if (stats.sharpeRatio <= 0) return `sharpeRatio must be positive, got ${stats.sharpeRatio}`;
  if (stats.sortinoRatio <= 0) return `sortinoRatio must be positive, got ${stats.sortinoRatio}`;
  if (!approx(stats.sharpeRatio, 0.4685, 0.01)) {
    return `sharpeRatio must be ≈0.47, got ${stats.sharpeRatio}`;
  }

  // certaintyRatio above 1.0
  if (stats.certaintyRatio === null) return `certaintyRatio must be computed, got null`;
  if (!approx(stats.certaintyRatio, 1.5, 0.01)) {
    return `certaintyRatio must be 1.5, got ${stats.certaintyRatio}`;
  }

  // span 25d ≥ 14d → annualization computed
  if (stats.annualizedSharpeRatio === null) {
    return `annualizedSharpeRatio must be computed (span≥14d, N≥10), got null`;
  }
  return null;
};

test("backtest_63.json: N=11 boundary — ratios just barely computable (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest N=11 boundary verified", ctx, assertBoundaryN11);
});

test("backtest_63.json: same boundary in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live N=11 boundary verified", ctx, assertBoundaryN11);
});

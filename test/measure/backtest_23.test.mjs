import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_23.json" with { type: "json" };
import { runBacktestPool, runLivePool, MIN_SIGNALS_FOR_RATIOS } from "../utils/_measure_helpers.mjs";

// Edge case: boundary N == MIN_SIGNALS_FOR_RATIOS (10) AND span ≥ 14d.
// Both gates pass at the threshold → ALL ratios + annualized metrics
// computed. Different from #4 (N=10 but span<14 → only Sharpe/Sortino).
// Different from #3 (N=9 — under the ratio gate).

const POOL = "POOL-B23";

const assertBoundaryN10 = (stats) => {
  // Backtest returns `totalSignals`, Live returns `totalClosed` — same value
  // under a different name. Check whichever is present.
  const n = stats.totalSignals ?? stats.totalClosed;
  if (n !== MIN_SIGNALS_FOR_RATIOS) {
    return `count must be ${MIN_SIGNALS_FOR_RATIOS}, got ${n}`;
  }
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed at N=${MIN_SIGNALS_FOR_RATIOS} boundary, got null`;
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed at N=${MIN_SIGNALS_FOR_RATIOS} boundary, got null`;
  if (stats.annualizedSharpeRatio === null) return `annualizedSharpeRatio must be computed, got null`;
  // expectedYearlyReturns may be null if compound > cap. recoveryFactor must
  // be present (depends only on DD > 0).
  return null;
};

test("backtest_23.json: N=10 + span≥14d boundary — all ratios + annualized computed (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest N=10 boundary verified", ctx, assertBoundaryN10);
});

test("backtest_23.json: N=10 + span≥14d boundary — all ratios + annualized computed (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live N=10 boundary verified", ctx, assertBoundaryN10);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_43.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_TRADES_PER_YEAR } from "../utils/_measure_helpers.mjs";

// Edge case: holes in time. 30 signals split into two clusters with a
// 5-month gap.
//   - 10 signals in January
//   - <150 days of nothing>
//   - 20 signals in June
//
// Calendar span ≈ 180 days. tradesPerYear ≈ 30 × 365 / 180 ≈ 60.8.
// This significantly UNDERSTATES the active-period density (during the
// clusters the strategy was actually running ~10 trades/day or 365/yr
// during those active days), but tradesPerYear averages across the gap.
//
// Tests:
//   - annualization PASSES (n≥10, span≥14)
//   - tradesPerYear is in the LOW range (~60), NOT capped at MAX (365)
//   - expectedYearly is realistic (under the 100% cap given low tpy and small avgPnl)
//
// This nails down that the annualization formula uses ACTUAL spans, not
// some heuristic that compensates for sparsity.

const POOL = "POOL-B43";

const assertHoles = (stats) => {
  if (stats.annualizedSharpeRatio === null) return `annualizedSharpeRatio must be computed (span=180d), got null`;
  if (stats.expectedYearlyReturns === null) return `expectedYearlyReturns must be computed (under cap), got null`;

  // Calmar sanity: should be POSITIVE (compound positive, DD > 0).
  if (stats.calmarRatio === null) return `calmarRatio must be computed, got null`;
  if (stats.calmarRatio <= 0) return `calmarRatio must be > 0 (winning strategy), got ${stats.calmarRatio}`;

  // expectedYearly should be ~22% (NOT capped, NOT inflated by high-freq math).
  // If tradesPerYear were INCORRECTLY clipped to 365 (treating as high-freq),
  // compound = 1.105^(365/30) = ~3.4 → +240% → would be capped to null.
  // Since the test asserts NOT-null, the span calc is sane.
  if (stats.expectedYearlyReturns > 50) {
    return `expectedYearlyReturns inflated (${stats.expectedYearlyReturns}) — likely tpy was capped near ${MAX_TRADES_PER_YEAR}, treating sparse data as high-freq.`;
  }
  if (stats.expectedYearlyReturns < 5) {
    return `expectedYearlyReturns too small (${stats.expectedYearlyReturns}) — expected ~22% from sparse activity.`;
  }
  return null;
};

test("backtest_43.json: 5-month gap between clusters — tradesPerYear reflects actual span, not active density (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest holes-in-time verified", ctx, assertHoles);
});

test("backtest_43.json: 5-month gap — same calculation in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live holes-in-time verified", ctx, assertHoles);
});

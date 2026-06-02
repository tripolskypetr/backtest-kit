import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_25.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_EXPECTED_YEARLY_RETURNS } from "../utils/_measure_helpers.mjs";

// Edge case: deeply negative compound, NOT blown.
// 30 signals, each -2%. equity = 0.98^30 ≈ 0.545. span = 30 days exactly →
// tradesPerYear = 365. expectedYearly = 0.545^(365/30) - 1 ≈ -99.94%.
//
// This sits JUST INSIDE the -100% boundary: it's a real number, not the
// blown-account sentinel (-100). recoveryFactor is negative (compounded
// total return < 0). calmar is moderately negative.
//
// Background: a symmetric `-cap` clamp on Calmar exists in code, but
// reaching it requires near-zero DD with deeply-negative compound — a
// physical impossibility in equity-curve math (negative compound implies
// proportional DD). This test instead verifies the BOUNDARY behaviour
// inside the natural range: deep losses surface as deep negatives, not as
// null/0/sentinel.

const POOL = "POOL-B25";

const assertDeepNeg = (stats) => {
  // Account is NOT blown (no single trade at -100%). blown sentinel would
  // be expectedYearly = -100 exactly. We expect a real number < -99 > -100.
  if (stats.expectedYearlyReturns === null) {
    return `expectedYearlyReturns must be computed (within ±${MAX_EXPECTED_YEARLY_RETURNS}% cap), got null`;
  }
  if (stats.expectedYearlyReturns === -100) {
    return `expectedYearlyReturns must NOT be the blown sentinel -100 (no -100% trade); got -100. Means blow detection misfired.`;
  }
  if (stats.expectedYearlyReturns >= -90) {
    return `expectedYearlyReturns must be deeply negative (< -90), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.expectedYearlyReturns <= -MAX_EXPECTED_YEARLY_RETURNS) {
    return `expectedYearlyReturns must be > -${MAX_EXPECTED_YEARLY_RETURNS} (cap not triggered, real value), got ${stats.expectedYearlyReturns}`;
  }
  // Recovery must be negative (compounded total return < 0, DD > 0). Not null.
  if (stats.recoveryFactor === null) {
    return `recoveryFactor must be computed (not blown, DD > 0), got null`;
  }
  if (stats.recoveryFactor >= 0) {
    return `recoveryFactor must be < 0 (losing strategy, compound return negative), got ${stats.recoveryFactor}`;
  }
  // Calmar negative — losing annualized return divided by positive DD.
  if (stats.calmarRatio === null || stats.calmarRatio >= 0) {
    return `calmarRatio must be < 0, got ${stats.calmarRatio}`;
  }
  // Sortino strongly negative — all returns are losses.
  if (stats.sortinoRatio === null || stats.sortinoRatio >= 0) {
    return `sortinoRatio must be < 0 (all losses), got ${stats.sortinoRatio}`;
  }
  return null;
};

test("backtest_25.json: deep negative compound (close to -100% but not blown) — all metrics negative, not null/sentinel (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest deep-negative not-blown verified", ctx, assertDeepNeg);
});

test("backtest_25.json: deep negative compound — all metrics negative (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live deep-negative not-blown verified", ctx, assertDeepNeg);
});

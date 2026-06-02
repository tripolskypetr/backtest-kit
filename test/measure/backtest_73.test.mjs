import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_73.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_CALMAR_RATIO, approx } from "./_measure_helpers.mjs";

// Float-artifact target: BOTH Calmar AND Recovery hit cap on near-zero DD.
// 60 signals: 59 wins +0.05%, 1 REAL loss -0.001% (not artifact, genuine).
//   tradesPerYear = 365, compound ≈ +19.6% (under cap)
//   equityMaxDrawdown = 0.001% (real, small)
//   raw Calmar = 19.6 / 0.001 ≈ 19,600 → clamped to +1000
//   raw Recovery = compound_profit / 0.001 ≈ 3,000 → clamped to +1000 (NEW)
//
// Locks in:
//   - calmarRatio = +MAX_CALMAR_RATIO (already covered in #20, but with REAL DD)
//   - recoveryFactor ALSO clamped at +MAX_CALMAR_RATIO (NEW guard)

const POOL = "POOL-B73";

const assertBothCaps = (stats) => {
  // expectedYearly is computed, under cap
  if (stats.expectedYearlyReturns === null) {
    return `expectedYearlyReturns must be computed (compound ~19.6% under 100% cap), got null`;
  }
  if (stats.expectedYearlyReturns > 50) {
    return `expectedYearlyReturns must be ≈+19.6%, got ${stats.expectedYearlyReturns}`;
  }

  // Calmar hits +cap
  if (stats.calmarRatio === null) return `calmarRatio must be computed, got null`;
  if (!approx(stats.calmarRatio, MAX_CALMAR_RATIO, 1e-6)) {
    return `calmarRatio must be clamped to +${MAX_CALMAR_RATIO}, got ${stats.calmarRatio}`;
  }

  // Recovery ALSO hits +cap (the new behaviour)
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (!approx(stats.recoveryFactor, MAX_CALMAR_RATIO, 1e-6)) {
    return `recoveryFactor must be clamped to +${MAX_CALMAR_RATIO} (NEW: same clamp as Calmar), got ${stats.recoveryFactor}. ` +
      `If above 1000, the recovery cap regressed.`;
  }

  return null;
};

test("backtest_73.json: small real DD → BOTH calmarRatio AND recoveryFactor clamped to +1000 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest both-caps verified", ctx, assertBothCaps);
});

test("backtest_73.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live both-caps verified", ctx, assertBothCaps);
});

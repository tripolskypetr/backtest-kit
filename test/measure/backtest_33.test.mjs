import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_33.json" with { type: "json" };
import {
  runBacktestPool,
  runLivePool,
  equityMaxDrawdown,
  approx,
} from "../utils/_measure_helpers.mjs";

// Edge case: equity climbs to ~+20%, falls to ~-16%, partially recovers to
// ~+5%. The high-water-mark must remain at the +20% PEAK throughout the
// descent and partial recovery — NOT reset to the current peak after the
// recovery begins.
//
// Reference numbers (from the equity-curve generator):
//   eqFinal ≈ 1.046
//   maxDD ≈ 20.7%  (from peak ~1.21 down to ~0.96)
//
// If the algorithm reset peak after each new local peak, DD would be much
// smaller. If it failed to update peak during the climb, DD would also be
// off. This pins down the canonical high-water-mark behaviour.

const POOL = "POOL-B33";

const refReturns = signals.map((s) => s.pnl.pnlPercentage);
const refEq = equityMaxDrawdown(refReturns);

const assertRecovery = (stats) => {
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;

  // We can't read maxDrawdown directly off BacktestStatisticsModel, but we
  // can derive what recoveryFactor SHOULD be from refEq and check it matches.
  const expectedRecovery = ((refEq.equityFinal - 1) * 100) / refEq.maxDD;
  if (!approx(stats.recoveryFactor, expectedRecovery, 1e-6)) {
    return `recoveryFactor mismatch: service=${stats.recoveryFactor} expected=${expectedRecovery} (eqFinal=${refEq.equityFinal}, maxDD=${refEq.maxDD})`;
  }

  // Sanity: DD must be substantial (>15%), recovery must be small but positive.
  if (refEq.maxDD < 15) {
    return `fixture mis-built: refMaxDD must be > 15%, got ${refEq.maxDD}`;
  }
  if (refEq.maxDD > 30) {
    return `fixture mis-built: refMaxDD must be < 30%, got ${refEq.maxDD}`;
  }
  if (stats.recoveryFactor <= 0 || stats.recoveryFactor > 1) {
    return `recoveryFactor should be small positive (compound 5% / DD 20% ≈ 0.25), got ${stats.recoveryFactor}`;
  }

  // expectedYearly and Calmar: total ~5%, span 30d, tpy=365 → compound 76%, under cap.
  if (stats.expectedYearlyReturns === null) {
    return `expectedYearlyReturns must be computed (under 100% cap), got null`;
  }
  if (stats.calmarRatio === null) return `calmarRatio must be computed, got null`;
  return null;
};

test("backtest_33.json: high-water-mark holds the +20% peak through recovery (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest high-water-mark verified", ctx, assertRecovery);
});

test("backtest_33.json: high-water-mark holds the +20% peak through recovery (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live high-water-mark verified", ctx, assertRecovery);
});

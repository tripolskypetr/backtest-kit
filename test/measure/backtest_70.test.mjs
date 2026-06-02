import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_70.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// Edge case: steady annuity — 60 identical +0.1% trades over 60 days.
// avgPnl = 0.1, stdDev = 0 → sharpe NULL.
// equityFinal = 1.001^60 ≈ 1.062.
// tradesPerYear = 365 → compound = 1.062^(365/60) - 1 ≈ +44% → UNDER cap → COMPUTED.
//
// KEY INSIGHT: this is the COMPLEMENT of #68 unicorn. Same "zero stdDev"
// issue, but compound is MILD enough to pass the 100% yearly cap → analytics
// surfaces a useful number (expectedYearly ≈ 44%). Compound captures what
// Sharpe can't (zero variance).
//
// Tests:
//   - Sharpe null (stdDev=0)
//   - But expectedYearlyReturns COMPUTED (≈ +44%)
//   - recoveryFactor null (DD=0)
//   - Demonstrates: compound metric is the only meaningful signal for
//     zero-variance positive strategies under the cap.

const POOL = "POOL-B70";

const assertAnnuity = (stats) => {
  if (stats.winCount !== 60) return `winCount must be 60, got ${stats.winCount}`;
  if (stats.lossCount !== 0) return `lossCount must be 0, got ${stats.lossCount}`;
  if (!approx(stats.avgPnl, 0.1, 1e-9)) return `avgPnl must be 0.1, got ${stats.avgPnl}`;
  // stdDev: identical returns produce a float artifact (~1e-16) instead of
  // exactly 0 due to (x-mean) accumulation. The service applies a
  // STDDEV_EPSILON guard (1e-9) so the artifact is treated as zero — sharpe
  // and sortino must surface as null, not astronomical.
  if (Math.abs(stats.stdDev) > 1e-9) return `stdDev must be ≈0 (identical returns), got ${stats.stdDev}`;
  if (stats.sharpeRatio !== null) {
    return `sharpeRatio must be null (stdDev below STDDEV_EPSILON guard), got ${stats.sharpeRatio}. ` +
      `If non-null, the float-artifact stdDev passed the gate — regression.`;
  }
  if (stats.sortinoRatio !== null) return `sortinoRatio must be null, got ${stats.sortinoRatio}`;

  // BUT expectedYearlyReturns COMPUTED — compound ≈ +44% under cap
  if (stats.expectedYearlyReturns === null) {
    return `expectedYearlyReturns must be computed (compound ≈ +44% under 100% cap), got null. ` +
      `THE KEY INSIGHT: compound metric captures zero-variance strategies where Sharpe is blind.`;
  }
  if (!approx(stats.expectedYearlyReturns, 44, 1.0)) {
    return `expectedYearlyReturns must be ≈+44%, got ${stats.expectedYearlyReturns}`;
  }

  // DD=0 → recoveryFactor null, calmar null
  if (stats.recoveryFactor !== null) return `recoveryFactor must be null (DD=0), got ${stats.recoveryFactor}`;
  if (stats.calmarRatio !== null) return `calmarRatio must be null (DD=0), got ${stats.calmarRatio}`;
  return null;
};

test("backtest_70.json: steady annuity — Sharpe null but expectedYearly ≈ +44% (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest annuity compound verified", ctx, assertAnnuity);
});

test("backtest_70.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live annuity compound verified", ctx, assertAnnuity);
});

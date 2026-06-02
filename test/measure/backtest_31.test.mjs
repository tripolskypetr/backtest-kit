import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_31.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "./_measure_helpers.mjs";

// Edge case: microscopic returns (±0.001% range).
// avgPnl ≈ +0.0005%, stdDev ≈ 0.0015%, sharpe ≈ 0.33.
// compound (1.0001500075)^(365/30) - 1 ≈ +0.018% annual — far under the
// 100% cap. equityFinal essentially 1.0.
//
// Tests float-precision robustness:
//  - avgPnl / stdDev / sharpeRatio must be well-defined finite numbers
//  - compound geometric annualization must NOT produce NaN/Infinity at near-1 base
//  - equityMaxDrawdown ≈ 0.001% (positive but tiny) → recoveryFactor finite
//  - annualization should be computed (N=30, span=30d both pass gates)

const POOL = "POOL-B31";

const assertMicro = (stats) => {
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed at microscopic scale, got null`;
  if (!isFinite(stats.sharpeRatio)) return `sharpeRatio must be finite, got ${stats.sharpeRatio}`;
  if (stats.stdDev <= 0) return `stdDev must be positive (varied returns), got ${stats.stdDev}`;
  if (stats.stdDev > 0.01) return `stdDev should be tiny (~0.0015%), got ${stats.stdDev}`;

  if (stats.annualizedSharpeRatio === null) return `annualizedSharpeRatio must be computed, got null`;
  if (!isFinite(stats.annualizedSharpeRatio)) return `annualizedSharpeRatio must be finite, got ${stats.annualizedSharpeRatio}`;

  if (stats.expectedYearlyReturns === null) return `expectedYearlyReturns must be computed (well under 100% cap), got null`;
  if (!isFinite(stats.expectedYearlyReturns)) return `expectedYearlyReturns must be finite, got ${stats.expectedYearlyReturns}`;
  if (Math.abs(stats.expectedYearlyReturns) > 1) {
    return `expectedYearlyReturns should be tiny (~0.018%), got ${stats.expectedYearlyReturns} — possible precision blow-up`;
  }

  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (!isFinite(stats.recoveryFactor)) return `recoveryFactor must be finite (DD tiny but > 0), got ${stats.recoveryFactor}`;
  return null;
};

test("backtest_31.json: microscopic returns — math survives near-zero, no NaN/Infinity (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest microscopic precision verified", ctx, assertMicro);
});

test("backtest_31.json: microscopic returns — math survives near-zero, no NaN/Infinity (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live microscopic precision verified", ctx, assertMicro);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_75.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_CALMAR_RATIO } from "./_measure_helpers.mjs";

// Float-artifact target: calendar span ≈ 1 millisecond.
// 30 trades packed within 30 milliseconds total.
// spanDays = 30 ms / 86400000 ms ≈ 3.47e-7 days (far below 14d gate).
//
// Expected behaviour:
//   - canAnnualize = false (span << MIN_CALENDAR_SPAN_DAYS) → tradesPerYear = 0
//   - annualizedSharpe / expectedYearly / calmar → all null
//   - sharpeRatio, sortinoRatio computed (N=30 ≥ MIN_SIGNALS_FOR_RATIOS, returns vary)
//   - recoveryFactor computed (time-independent), clamped if needed
//   - NO NaN/Infinity anywhere from div by epsilon span
//
// Locks in: time-degenerate input is gated cleanly, doesn't leak NaN.

const POOL = "POOL-B75";

const assertSpanEpsilon = (stats) => {
  const n = stats.totalSignals ?? stats.totalClosed;
  if (n !== 30) return `count must be 30, got ${n}`;

  // Ratios computed (N gate passes, returns vary, stdDev > epsilon)
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (varied returns), got null`;
  if (!isFinite(stats.sharpeRatio)) return `sharpeRatio non-finite: ${stats.sharpeRatio}`;
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed, got null`;
  if (!isFinite(stats.sortinoRatio)) return `sortinoRatio non-finite: ${stats.sortinoRatio}`;

  // Annualization gated off (span ≈ 0)
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null (span << 14d), got ${stats.annualizedSharpeRatio}`;
  }
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null, got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null (depends on expectedYearly), got ${stats.calmarRatio}`;
  }

  // recoveryFactor computed and bounded by cap
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed (time-independent), got null`;
  if (!isFinite(stats.recoveryFactor)) {
    return `recoveryFactor non-finite: ${stats.recoveryFactor}`;
  }
  if (Math.abs(stats.recoveryFactor) > MAX_CALMAR_RATIO) {
    return `recoveryFactor must be clamped at ±${MAX_CALMAR_RATIO}, got ${stats.recoveryFactor}`;
  }

  // Comprehensive NaN/Infinity sweep
  for (const k of Object.keys(stats)) {
    const v = stats[k];
    if (typeof v === "number" && !isFinite(v)) {
      return `field ${k} is non-finite: ${v} — likely division by epsilon span leaked`;
    }
  }
  return null;
};

test("backtest_75.json: 30 trades within 30 ms — span gates off cleanly, no NaN (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest span-epsilon clean gating verified", ctx, assertSpanEpsilon);
});

test("backtest_75.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live span-epsilon clean gating verified", ctx, assertSpanEpsilon);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_35.json" with { type: "json" };
import {
  runBacktestPool,
  runLivePool,
  MIN_CALENDAR_SPAN_DAYS,
} from "../utils/_measure_helpers.mjs";

// Edge case: each signal closes instantly — pendingAt === updatedAt.
// span = 11 days (12 signals at 1-day pendingAt steps, but each closes at
// pendingAt + 0).
//
// Tests:
//  - Per-signal duration = 0 must NOT crash sum/divide operations
//  - N=12 ≥ MIN_SIGNALS_FOR_RATIOS → Sharpe/Sortino computed
//  - span = 11 days < MIN_CALENDAR_SPAN_DAYS=14 → annualization gate fires
//    → annualizedSharpeRatio/expectedYearlyReturns/calmarRatio all null
//  - recoveryFactor still computed (compound + DD only, no time)
//  - tradesPerYear formula must not divide by zero anywhere

const POOL = "POOL-B35";

const assertZeroDuration = (stats) => {
  // Sharpe + Sortino computed
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (N=12), got null`;
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed (has losses), got null`;

  // Annualization gated off (span < MIN_CALENDAR_SPAN_DAYS)
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null (span=11d < ${MIN_CALENDAR_SPAN_DAYS}d), got ${stats.annualizedSharpeRatio}`;
  }
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (annualization gate fires), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null (yearlyReturns null), got ${stats.calmarRatio}`;
  }

  // recoveryFactor: depends only on compound equity + DD, NOT on time
  if (stats.recoveryFactor === null) {
    return `recoveryFactor must be computed (compound + DD, no time dependency), got null`;
  }
  if (!isFinite(stats.recoveryFactor)) {
    return `recoveryFactor must be finite, got ${stats.recoveryFactor}`;
  }

  // No NaN/Infinity anywhere
  for (const k of Object.keys(stats)) {
    const v = stats[k];
    if (typeof v === "number" && !isFinite(v)) {
      return `field ${k} is non-finite: ${v}`;
    }
  }
  return null;
};

test("backtest_35.json: zero-duration signals — span gate hits, no NaN, recovery still computed (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest zero-duration verified", ctx, assertZeroDuration);
});

test("backtest_35.json: zero-duration signals — same shape in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live zero-duration verified", ctx, assertZeroDuration);
});

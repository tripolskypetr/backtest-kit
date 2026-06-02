import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_42.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: signals fed in REVERSED chronological order.
// signals[0] has the LATEST pendingAt; signals[19] has the EARLIEST.
//
// The service computes calendar span via Math.min(pendingAt) /
// Math.max(updatedAt) across ALL valid signals, NOT via [0] / [n-1] of the
// stored list. So the span must still be positive 20 days, gates must pass,
// annualization must work.
//
// Regression-safety: if someone ever swaps the min/max loop for
// `signals[0].pendingAt` and `signals[signals.length-1].closeTimestamp`,
// span will become NEGATIVE (because signals[0] is LATER than signals[n-1]),
// the gate `calendarSpanDays >= MIN_CALENDAR_SPAN_DAYS` will fail, and
// annualization will silently null out — this test would catch it.

const POOL = "POOL-B42";

const assertReversed = (stats) => {
  // The span gate must have passed: the only signal we have to confirm this
  // through is annualizedSharpe (which depends on tradesPerYear > 0). If the
  // min/max span calculation regressed to using [0]/[n-1] of a reverse-
  // sorted list, span would be NEGATIVE → annualizedSharpe would be null.
  if (stats.annualizedSharpeRatio === null) {
    return `annualizedSharpeRatio must be computed (real span=20d, reversed storage shouldn't matter). If null, min/max likely regressed to [0]/[n-1] → negative span.`;
  }
  // expectedYearlyReturns may be null because compound > 100% cap (separate
  // gate from span). What we MUST confirm is that annualized Sharpe AND
  // per-trade Sharpe both exist.
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio <= 0) return `sharpeRatio must be > 0 (avg of returns positive), got ${stats.sharpeRatio}`;
  // recoveryFactor doesn't depend on annualization or yearly cap — must be present
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor <= 0) return `recoveryFactor must be > 0, got ${stats.recoveryFactor}`;
  return null;
};

test("backtest_42.json: reversed chronological storage order — span computed via min/max, annualization passes (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest reversed-chrono span verified", ctx, assertReversed);
});

test("backtest_42.json: reversed chronological storage order — same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live reversed-chrono span verified", ctx, assertReversed);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_22.json" with { type: "json" };
import { runBacktestPool, runLivePool, MIN_CALENDAR_SPAN_DAYS } from "./_measure_helpers.mjs";

// Edge case: boundary calendarSpanDays == MIN_CALENDAR_SPAN_DAYS exactly.
// N=10, span=14 days. Gate uses `>= MIN_CALENDAR_SPAN_DAYS`, so 14.0 PASSES
// (regression safety on `>` vs `>=`). Annualization metrics computed.

const POOL = "POOL-B22";

const assertBoundarySpan14 = (stats) => {
  if (stats.annualizedSharpeRatio === null) {
    return `annualizedSharpeRatio must be computed at span=${MIN_CALENDAR_SPAN_DAYS}d boundary, got null`;
  }
  if (stats.sharpeRatio === null) {
    return `sharpeRatio must be computed, got null`;
  }
  return null;
};

test("backtest_22.json: span=14d boundary — annualization passes (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest span=14 boundary verified", ctx, assertBoundarySpan14);
});

test("backtest_22.json: span=14d boundary — annualization passes (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live span=14 boundary verified", ctx, assertBoundarySpan14);
});

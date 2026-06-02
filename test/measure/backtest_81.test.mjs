import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_81.json" with { type: "json" };
import { runBacktestPool, runLivePool, MIN_CALENDAR_SPAN_DAYS } from "../utils/_measure_helpers.mjs";

// span just BELOW 14 days. n=10 (≥ MIN_SIGNALS_FOR_RATIOS) and span=13.999d.
// Gate `calendarSpanDays >= MIN_CALENDAR_SPAN_DAYS` is false → annualization null.
// Per-trade ratios still computed.

const POOL = "POOL-B81";

const assertSpanBelow = (stats) => {
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (N=10 ≥ gate), got null`;
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed, got null`;

  // Annualization gated off
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null (span 13.999 < ${MIN_CALENDAR_SPAN_DAYS}d), got ${stats.annualizedSharpeRatio}. ` +
      `If non-null, the span boundary regressed.`;
  }
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null, got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) return `calmarRatio must be null, got ${stats.calmarRatio}`;

  // recoveryFactor still computed (time-independent)
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed (no time dep), got null`;
  return null;
};

test("backtest_81.json: span 13.999d (just below gate) → annualization null, ratios computed (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest span just-below verified", ctx, assertSpanBelow);
});

test("backtest_81.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live span just-below verified", ctx, assertSpanBelow);
});

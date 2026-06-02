import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_54.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "./_measure_helpers.mjs";

// Tied timestamps + buffer overflow.
// 300 signals all carry the IDENTICAL pendingAt and closeTimestamp (bulk-
// loaded from a single snapshot, or replay of an event at the same moment).
// Span = 0 days → annualization MUST gate off (calendarSpanDays < 14).
// After trim: 250 signals survive (250 newest by arrival).
//
// Tests:
//   - Sharpe is computed (N=250, stdDev>0)
//   - annualizedSharpe / expectedYearly / calmar all null (span gate)
//   - recoveryFactor computed (time-independent)
//   - No NaN/Infinity from divide-by-zero on span

const POOL = "POOL-B54";

const assertTied = (stats, countField) => {
  if (stats[countField] !== 250) {
    return `${countField} must be 250 after trim, got ${stats[countField]}`;
  }
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (N=250, varied returns), got null`;
  if (!isFinite(stats.sharpeRatio)) return `sharpeRatio must be finite, got ${stats.sharpeRatio}`;

  // span = 0 days → annualization gate fails
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null (span=0 < MIN_CALENDAR_SPAN_DAYS), got ${stats.annualizedSharpeRatio}`;
  }
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (span gate fails), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null (expectedYearly null), got ${stats.calmarRatio}`;
  }
  // recoveryFactor is time-independent
  if (stats.recoveryFactor === null) {
    return `recoveryFactor must be computed (no time dependency), got null`;
  }
  // Sanity: no Infinity sneaking through
  for (const k of Object.keys(stats)) {
    const v = stats[k];
    if (typeof v === "number" && !isFinite(v)) {
      return `field ${k} is non-finite: ${v} — likely span=0 divide-by-zero`;
    }
  }
  return null;
};

test("backtest_54.json: 300 signals with tied timestamps — span gate fires, no NaN (Backtest)", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row, { symbolOverride: POOL }));
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, true);
  const err = assertTied(stats, "totalSignals");
  if (err) { fail(err); return; }
  pass(`Backtest tied-timestamps span gate verified, sharpe=${stats.sharpeRatio.toFixed(3)}`);
});

test("backtest_54.json: same in Live", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });

  for (const row of signals) {
    await svc.tick({ ...toClosedTick(row, { symbolOverride: POOL }), backtest: false });
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, false);
  const err = assertTied(stats, "totalClosed");
  if (err) { fail(err); return; }
  pass(`Live tied-timestamps span gate verified, sharpe=${stats.sharpeRatio.toFixed(3)}`);
});

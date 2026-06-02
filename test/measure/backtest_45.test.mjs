import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_45.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  MAX_TRADES_PER_YEAR,
} from "../utils/_measure_helpers.mjs";

// Buffer overflow SHRINKS the post-trim calendar span.
// 300 signals at 16h cadence. Full real span = 200 days.
// After trim: 250 signals over ≈ 166.7 days → tpy = 250/166.7*365 ≈ 549.6
// → EXCEEDS MAX_TRADES_PER_YEAR (365) → annualization gates off.
//
// Service uses POST-TRIM data for its gates. The retained-period density
// looks like a high-freq strategy even though the full dataset was the same
// 1-per-16h cadence — the service has no memory of evicted signals.

const POOL = "POOL-B45";

const assertShrink = (stats, countField) => {
  if (stats[countField] !== 250) {
    return `${countField} must be 250 after trim, got ${stats[countField]}`;
  }
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (N=250), got null`;

  // tpy after trim ≈ 549 > MAX_TRADES_PER_YEAR. Annualization MUST gate off.
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null — post-trim tpy ≈549 > ${MAX_TRADES_PER_YEAR}, got ${stats.annualizedSharpeRatio}`;
  }
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null, got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null, got ${stats.calmarRatio}`;
  }
  // recoveryFactor is time-independent — still computes
  if (stats.recoveryFactor === null) {
    return `recoveryFactor must be computed (no time dep), got null`;
  }
  return null;
};

test("backtest_45.json: 300 signals → trim shrinks span → post-trim tpy > MAX → annualization null (Backtest)", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) {
    await svc.tick(toClosedTick(row, { symbolOverride: POOL }));
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, true);
  const err = assertShrink(stats, "totalSignals");
  if (err) { fail(err); return; }
  pass(`Backtest span-shrink gating verified (300→${stats.totalSignals})`);
});

test("backtest_45.json: same in Live", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });
  for (const row of signals) {
    await svc.tick({ ...toClosedTick(row, { symbolOverride: POOL }), backtest: false });
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, false);
  const err = assertShrink(stats, "totalClosed");
  if (err) { fail(err); return; }
  pass(`Live span-shrink gating verified (300→${stats.totalClosed})`);
});

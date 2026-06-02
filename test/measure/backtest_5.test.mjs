import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_5.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_TRADES_PER_YEAR } from "../utils/_measure_helpers.mjs";

// Edge case: rawTradesPerYear > MAX_TRADES_PER_YEAR=365.
// 30 signals over 14 days → 30/14*365 ≈ 782 > 365.
// Expectation: NO clipping. Annualized metrics fall through to null entirely,
// per-trade Sharpe still computed (it doesn't depend on annualization).
// recoveryFactor uses compounded equity, not annualization, so it IS computed.

const POOL = "POOL-B5";

const assertOverFreqGate = (stats) => {
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed, got null`;
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null (rawTPY > ${MAX_TRADES_PER_YEAR}), got ${stats.annualizedSharpeRatio}`;
  }
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (rawTPY > ${MAX_TRADES_PER_YEAR}), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null (annualization gated off), got ${stats.calmarRatio}`;
  }
  // recoveryFactor does not depend on annualization — should be present.
  if (stats.recoveryFactor === null) {
    return `recoveryFactor must be computed (it uses compounded equity, not annualization)`;
  }
  return null;
};

test("backtest_5.json: rawTradesPerYear > 365 — annualization null, no clipping (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest over-frequency null verified", ctx, assertOverFreqGate);
});

test("backtest_5.json: rawTradesPerYear > 365 — annualization null, no clipping (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live over-frequency null verified", ctx, assertOverFreqGate);
});

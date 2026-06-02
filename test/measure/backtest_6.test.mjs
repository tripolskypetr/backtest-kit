import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_6.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_EXPECTED_YEARLY_RETURNS } from "../utils/_measure_helpers.mjs";

// Edge case: compound expectedYearlyReturns > MAX_EXPECTED_YEARLY_RETURNS=100.
// 30 signals of steady +0.3% over 30 days → tradesPerYear=365, compound
// (1.003)^365 - 1 ≈ +199% > 100% cap → null. BUT annualizedSharpe still
// computed (it has no compound-yield cap).

const POOL = "POOL-B6";

const assertYearlyCap = (stats) => {
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.annualizedSharpeRatio === null) {
    return `annualizedSharpeRatio must be computed (cap is on yearly returns, not on Sharpe), got null`;
  }
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (compound > ${MAX_EXPECTED_YEARLY_RETURNS}%), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null (its numerator expectedYearlyReturns is null), got ${stats.calmarRatio}`;
  }
  return null;
};

test("backtest_6.json: compound > 100% — expectedYearly null, annualizedSharpe still computed (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest yearly-cap null verified", ctx, assertYearlyCap);
});

test("backtest_6.json: compound > 100% — expectedYearly null, annualizedSharpe still computed (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live yearly-cap null verified", ctx, assertYearlyCap);
});

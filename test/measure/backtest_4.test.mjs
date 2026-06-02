import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_4.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: N=10 (ratios pass) AND span<14 days (annualization fails).
// Expectation: sharpeRatio + sortinoRatio computed, annualizedSharpeRatio +
// expectedYearlyReturns + calmarRatio = null. This separates the two gates.

const POOL = "POOL-B4";

const assertSpanGate = (stats) => {
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (N=10 passes ratio gate), got null`;
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed (negative returns exist), got null`;
  if (stats.annualizedSharpeRatio !== null) return `annualizedSharpeRatio must be null (span<14), got ${stats.annualizedSharpeRatio}`;
  if (stats.expectedYearlyReturns !== null) return `expectedYearlyReturns must be null (span<14), got ${stats.expectedYearlyReturns}`;
  if (stats.calmarRatio !== null) return `calmarRatio must be null (annualization gated off), got ${stats.calmarRatio}`;
  return null;
};

test("backtest_4.json: N=10, span<14 days — Sharpe computed, annualized null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest span<14 gate verified", ctx, assertSpanGate);
});

test("backtest_4.json: N=10, span<14 days — Sharpe computed, annualized null (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live span<14 gate verified", ctx, assertSpanGate);
});

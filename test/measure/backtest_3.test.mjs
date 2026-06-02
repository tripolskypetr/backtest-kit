import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_3.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: N=9 < MIN_SIGNALS_FOR_RATIOS=10
// Expectation: sharpeRatio / sortinoRatio / annualizedSharpeRatio /
// expectedYearlyReturns / calmarRatio = null. winRate, avgPnl, totalPnl,
// recoveryFactor still computed (none of those depend on the ratio gate).

const POOL = "POOL-B3";

const assertGatedRatios = (stats) => {
  if (stats.sharpeRatio !== null) return `sharpeRatio must be null when N<10, got ${stats.sharpeRatio}`;
  if (stats.sortinoRatio !== null) return `sortinoRatio must be null when N<10, got ${stats.sortinoRatio}`;
  if (stats.annualizedSharpeRatio !== null) return `annualizedSharpeRatio must be null when N<10, got ${stats.annualizedSharpeRatio}`;
  if (stats.expectedYearlyReturns !== null) return `expectedYearlyReturns must be null when N<10, got ${stats.expectedYearlyReturns}`;
  if (stats.calmarRatio !== null) return `calmarRatio must be null when N<10, got ${stats.calmarRatio}`;
  return null;
};

test("backtest_3.json: N=9 below MIN_SIGNALS_FOR_RATIOS — all ratios gated to null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest N=9 gate verified", ctx, assertGatedRatios);
});

test("backtest_3.json: N=9 below MIN_SIGNALS_FOR_RATIOS — all ratios gated to null (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live N=9 gate verified", ctx, assertGatedRatios);
});

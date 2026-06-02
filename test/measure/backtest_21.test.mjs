import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_21.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_TRADES_PER_YEAR } from "./_measure_helpers.mjs";

// Edge case: boundary rawTradesPerYear == MAX_TRADES_PER_YEAR exactly.
// 30 signals / 30 days span = 1/day → tpy = 365.0.
// Gate uses `<= MAX_TRADES_PER_YEAR`, so 365 PASSES (regression safety on
// `<` vs `<=`). Annualization MUST be computed at the boundary, not null.

const POOL = "POOL-B21";

const assertBoundary365 = (stats) => {
  if (stats.annualizedSharpeRatio === null) {
    return `annualizedSharpeRatio must be computed at rawTPY=${MAX_TRADES_PER_YEAR} boundary, got null`;
  }
  // expectedYearlyReturns may be null IF the compound > 100% cap. Check both
  // possibilities — we mostly care that the annualization gate did not gate
  // off at boundary.
  if (stats.sharpeRatio === null) {
    return `sharpeRatio must be computed, got null`;
  }
  return null;
};

test("backtest_21.json: rawTPY=365 boundary — annualization passes (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest tpy=365 boundary verified", ctx, assertBoundary365);
});

test("backtest_21.json: rawTPY=365 boundary — annualization passes (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live tpy=365 boundary verified", ctx, assertBoundary365);
});

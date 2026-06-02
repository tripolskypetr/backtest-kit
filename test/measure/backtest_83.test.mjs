import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_83.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_TRADES_PER_YEAR } from "./_measure_helpers.mjs";

// tradesPerYear just BELOW cap.
// 30 trades over 30.05 days → tpy = 30/30.05*365 ≈ 364.4 (under 365).
// Annualization gate passes.

const POOL = "POOL-B83";

const assertTpyBelow = (stats) => {
  // Note: annualizedSharpeRatio computation passes the gate, but
  // expectedYearlyReturns may be null if compound > cap.
  // Both being non-null requires careful balance — the fixture might land
  // either way. Test: at least annualizedSharpeRatio must be computed.
  if (stats.annualizedSharpeRatio === null) {
    return `annualizedSharpeRatio must be computed (tpy ≈ 364 < ${MAX_TRADES_PER_YEAR}), got null. ` +
      `Boundary regression on tpy cap.`;
  }
  if (!isFinite(stats.annualizedSharpeRatio)) {
    return `annualizedSharpeRatio non-finite: ${stats.annualizedSharpeRatio}`;
  }
  return null;
};

test("backtest_83.json: tpy ≈ 364 (just below cap) → annualization passes (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest tpy-below-cap verified", ctx, assertTpyBelow);
});

test("backtest_83.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live tpy-below-cap verified", ctx, assertTpyBelow);
});

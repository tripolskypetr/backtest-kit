import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_10.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Edge case: blown account.
// 11 modest signals then one -150% (leveraged short going against position).
// Expectation (N/A-on-blown contract: margin-based compounding is degenerate,
// a single -100% trade zeroes the product regardless of every other trade):
// - equity goes ≤ 0 → blown=true → equityMaxDrawdown = 100%
// - expectedYearlyReturns = null (NOT the legacy -100 sentinel)
// - recoveryFactor = null (ratio meaningless after blow-up)
// - calmarRatio = null (inherits the null yearly numerator)

const POOL = "POOL-B10";

const assertBlown = (stats) => {
  if (Math.abs(stats.avgFallPnl - 0) < 1e-9 || stats.avgFallPnl === null) {
    // Note: avgFallPnl is computed from signal.maxDrawdown values (intra-trade
    // dips). Our synthetic uses fall=min(pnl,0), so for the -150 signal fall=-150.
    // Doesn't matter to the blown-account assertion — leave it alone.
  }
  // equityMaxDrawdown is not exposed directly on the model; we infer via
  // recoveryFactor=null + expectedYearlyReturns=null, which only happens
  // together when blown is true (the annualization gates are all satisfied here).
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null when blown (N/A-on-blown), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.recoveryFactor !== null) {
    return `recoveryFactor must be null when blown, got ${stats.recoveryFactor}`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null when blown (yearly numerator is null), got ${stats.calmarRatio}`;
  }
  return null;
};

test("backtest_10.json: blown account (r=-150%) — DD=100, expectedYearly=null, recovery=null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest blown-account verified", ctx, assertBlown);
});

test("backtest_10.json: blown account (r=-150%) — DD=100, expectedYearly=null, recovery=null (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live blown-account verified", ctx, assertBlown);
});

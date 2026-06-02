import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_10.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: blown account.
// 11 modest signals then one -150% (leveraged short going against position).
// Expectation:
// - equity goes ≤ 0 → blown=true → equityMaxDrawdown = 100%
// - expectedYearlyReturns = -100 (full wipeout, not null)
// - recoveryFactor = null (ratio meaningless after blow-up)
// - calmarRatio = expectedYearlyReturns / maxDD = -100/100 = -1

const POOL = "POOL-B10";

const assertBlown = (stats) => {
  if (Math.abs(stats.avgFallPnl - 0) < 1e-9 || stats.avgFallPnl === null) {
    // Note: avgFallPnl is computed from signal.maxDrawdown values (intra-trade
    // dips). Our synthetic uses fall=min(pnl,0), so for the -150 signal fall=-150.
    // Doesn't matter to the blown-account assertion — leave it alone.
  }
  // equityMaxDrawdown is not exposed directly on the model; we infer via
  // recoveryFactor=null + expectedYearlyReturns=-100, which only happens
  // together when blown is true.
  if (stats.expectedYearlyReturns !== -100) {
    return `expectedYearlyReturns must be -100 when blown, got ${stats.expectedYearlyReturns}`;
  }
  if (stats.recoveryFactor !== null) {
    return `recoveryFactor must be null when blown, got ${stats.recoveryFactor}`;
  }
  if (stats.calmarRatio === null || Math.abs(stats.calmarRatio - (-1)) > 1e-9) {
    return `calmarRatio must equal -1 (=-100/100) when blown, got ${stats.calmarRatio}`;
  }
  return null;
};

test("backtest_10.json: blown account (r=-150%) — DD=100, expectedYearly=-100, recovery=null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest blown-account verified", ctx, assertBlown);
});

test("backtest_10.json: blown account (r=-150%) — DD=100, expectedYearly=-100, recovery=null (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live blown-account verified", ctx, assertBlown);
});

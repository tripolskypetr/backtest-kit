import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_82.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/measure_helpers.mjs";

// Exact-zero blown boundary: one trade with pnl = -100% (equity * 0 = 0).
// 15 modest wins + 1 catastrophic -100%.
//   In equity loop: equity *= 1 + (-100/100) = 0 → equity <= 0 → blown=true.
// Locks in the EXACT boundary: pnl=-100 must be detected as blown
// (vs pnl=-99.99 which would NOT blow but would still create deep DD).

const POOL = "POOL-B82";

const assertBlownExact = (stats) => {
  // N/A-on-blown contract: expectedYearlyReturns = null (margin-based
  // compounding is degenerate once a single trade hits -100% — e.g. a
  // liquidation zeroes the product regardless of every other trade)
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null when blown (N/A-on-blown), got ${stats.expectedYearlyReturns}. ` +
      `If a number, blown detection didn't fire on exact pnl=-100%.`;
  }
  // recoveryFactor = null (blown → ratio meaningless)
  if (stats.recoveryFactor !== null) {
    return `recoveryFactor must be null when blown, got ${stats.recoveryFactor}`;
  }
  // calmar inherits the null yearly numerator
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null when blown (yearly numerator is null), got ${stats.calmarRatio}`;
  }
  return null;
};

test("backtest_82.json: pnl=-100% exact → blown detected → eyr=null, recovery=null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest exact-blown verified", ctx, assertBlownExact);
});

test("backtest_82.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live exact-blown verified", ctx, assertBlownExact);
});

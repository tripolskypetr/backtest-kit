import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_82.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// Exact-zero blown boundary: one trade with pnl = -100% (equity * 0 = 0).
// 15 modest wins + 1 catastrophic -100%.
//   In equity loop: equity *= 1 + (-100/100) = 0 → equity <= 0 → blown=true.
// Locks in the EXACT boundary: pnl=-100 must be detected as blown
// (vs pnl=-99.99 which would NOT blow but would still create deep DD).

const POOL = "POOL-B82";

const assertBlownExact = (stats) => {
  // expectedYearlyReturns = -100 (the blown sentinel)
  if (stats.expectedYearlyReturns !== -100) {
    return `expectedYearlyReturns must be exactly -100 (blown sentinel), got ${stats.expectedYearlyReturns}. ` +
      `If not -100, blown detection didn't fire on exact pnl=-100%.`;
  }
  // recoveryFactor = null (blown → ratio meaningless)
  if (stats.recoveryFactor !== null) {
    return `recoveryFactor must be null when blown, got ${stats.recoveryFactor}`;
  }
  // calmar = -100 / DD where DD = 100 (clamped to 100 in blown case)
  if (stats.calmarRatio === null) return `calmarRatio must be computed (yearly=-100, DD=100), got null`;
  if (!approx(stats.calmarRatio, -1.0, 1e-6)) {
    return `calmarRatio must be -1.0 (-100/100), got ${stats.calmarRatio}`;
  }
  return null;
};

test("backtest_82.json: pnl=-100% exact → blown detected → eyr=-100, recovery=null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest exact-blown verified", ctx, assertBlownExact);
});

test("backtest_82.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live exact-blown verified", ctx, assertBlownExact);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_78.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_EXPECTED_YEARLY_RETURNS } from "./_measure_helpers.mjs";

// MAX_EXPECTED_YEARLY_RETURNS just-UNDER cap.
// 30 trades with avg ≈ 0.164% → compound ≈ +82% (under 100% cap).
// expectedYearlyReturns must be COMPUTED (not null).

const POOL = "POOL-B78";

const assertYearlyUnder = (stats) => {
  if (stats.expectedYearlyReturns === null) {
    return `expectedYearlyReturns must be computed (~82% under cap), got null. Cap regression.`;
  }
  if (Math.abs(stats.expectedYearlyReturns) >= MAX_EXPECTED_YEARLY_RETURNS) {
    return `expectedYearlyReturns must be under |${MAX_EXPECTED_YEARLY_RETURNS}%|, got ${stats.expectedYearlyReturns}`;
  }
  if (stats.expectedYearlyReturns < 50 || stats.expectedYearlyReturns > 95) {
    return `expectedYearlyReturns should be in ~[50, 95]%, got ${stats.expectedYearlyReturns}`;
  }
  // calmar also computed (yearly not null)
  if (stats.calmarRatio === null && stats.recoveryFactor !== null) {
    // recovery exists → DD > 0 → calmar should exist too
    return `calmarRatio must be computed when yearly is under cap and DD > 0, got null`;
  }
  return null;
};

test("backtest_78.json: compound ~82% just under cap → expectedYearly computed (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest yearly-under-cap verified", ctx, assertYearlyUnder);
});

test("backtest_78.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live yearly-under-cap verified", ctx, assertYearlyUnder);
});

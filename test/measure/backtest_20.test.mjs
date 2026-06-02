import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_20.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: Calmar cap.
// 30 signals at +0.3% with ONE -0.01% dip. Compound expectedYearly ≈ +72%
// (under 100% cap, passes). Equity drawdown ≈ 0.01% (tiny but >0). Raw
// calmar = 72/0.01 ≈ 7200 → clamped to MAX_CALMAR_RATIO=1000.
//
// Bug history: without the cap, near-zero DD produced exploding calmar
// (10^6+). Cap value (1000) is shown as a real number, NOT null — calmar
// semantics differ from expectedYearly (which goes to null above its cap).

const POOL = "POOL-B20";
const MAX_CALMAR_RATIO = 1000;

const assertCalmarCap = (stats) => {
  if (stats.expectedYearlyReturns === null) {
    return `expectedYearlyReturns must be computed (~72%, < 100% cap), got null`;
  }
  if (Math.abs(stats.expectedYearlyReturns) >= 100) {
    return `expectedYearlyReturns must be < 100%, got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== MAX_CALMAR_RATIO) {
    return `calmarRatio must be clamped to ${MAX_CALMAR_RATIO}, got ${stats.calmarRatio}`;
  }
  return null;
};

test("backtest_20.json: tiny DD with positive compound — calmarRatio clamped to +MAX_CALMAR_RATIO (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest calmar +cap verified", ctx, assertCalmarCap);
});

test("backtest_20.json: tiny DD with positive compound — calmarRatio clamped to +MAX_CALMAR_RATIO (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live calmar +cap verified", ctx, assertCalmarCap);
});

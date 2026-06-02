import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_11.json" with { type: "json" };
import { runBacktestPool, runLivePool, equityMaxDrawdown } from "../utils/_measure_helpers.mjs";

// Edge case: deep but not blown drawdown + heavy first loss.
// First signal is -10% so high-water-mark starts at peak=1.0 and DD is
// immediately 10% from the initial reference. Series then climbs and dives
// again to carve a substantial peak-to-trough DD.
// Expectation:
// - blown = false
// - equityMaxDrawdown > 20% (deep DD)
// - recoveryFactor uses COMPOUNDED total return (equityFinal-1)*100,
//   not arithmetic totalPnl. Verified implicitly by service==ref equality;
//   here we explicitly check that recoveryFactor has the expected sign and
//   magnitude.

const POOL = "POOL-B11";

const assertDeepDD = (stats) => {
  const returns = signals.map((s) => s.pnl.pnlPercentage);
  const { maxDD, equityFinal, blown } = equityMaxDrawdown(returns);
  if (blown) return `synthetic dataset should not be blown — got blown=true`;
  if (maxDD < 20) return `synthetic dataset should carve DD > 20%, got ${maxDD}`;

  if (stats.recoveryFactor === null) return `recoveryFactor must be computed (not blown), got null`;
  const expectedRecovery = ((equityFinal - 1) * 100) / maxDD;
  if (Math.abs(stats.recoveryFactor - expectedRecovery) > 1e-6) {
    return `recoveryFactor must use compounded numerator. expected=${expectedRecovery}, got=${stats.recoveryFactor}`;
  }
  return null;
};

test("backtest_11.json: deep DD + first-loss high-water-mark — compound recovery verified (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest deep-DD compounded recovery verified", ctx, assertDeepDD);
});

test("backtest_11.json: deep DD + first-loss high-water-mark — compound recovery verified (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live deep-DD compounded recovery verified", ctx, assertDeepDD);
});

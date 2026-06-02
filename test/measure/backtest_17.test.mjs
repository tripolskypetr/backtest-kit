import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_17.json" with { type: "json" };
import { runBacktestPool, runLivePool, equityMaxDrawdown } from "../utils/_measure_helpers.mjs";

// Edge case: symmetric +X / -X — geometric ≠ arithmetic.
// 12 signals alternating +10%, -10%. avgPnl = 0 BUT equityFinal = (1.1*0.9)^6 < 1.
// Service uses geometric compounding so expectedYearlyReturns < 0 even though
// avgPnl = 0 — captures volatility drag that the old arithmetic formula missed.
//
// Bug history: original code did avgPnl * tradesPerYear (arithmetic). On the
// +10/-10 series that gives 0% yearly, completely missing the -1% per-cycle
// drag. Fixed by switching to equityFinal^(tradesPerYear/n) - 1.

const POOL = "POOL-B17";

const assertDrag = (stats) => {
  if (Math.abs(stats.avgPnl) > 1e-9) {
    return `avgPnl must be ≈0 for symmetric +X/-X, got ${stats.avgPnl}`;
  }
  if (Math.abs(stats.totalPnl) > 1e-9) {
    return `totalPnl must be ≈0 for symmetric +X/-X, got ${stats.totalPnl}`;
  }

  // Equity strictly decays: each (+10%, -10%) pair multiplies equity by 0.99.
  const returns = signals.map((s) => s.pnl.pnlPercentage);
  const { equityFinal, maxDD, blown } = equityMaxDrawdown(returns);
  if (blown) return `dataset should not be blown, got blown=true`;
  if (equityFinal >= 1) return `equityFinal must be < 1 (volatility drag), got ${equityFinal}`;
  if (maxDD <= 0) return `equityMaxDrawdown must be > 0, got ${maxDD}`;

  // expectedYearlyReturns must be NEGATIVE despite avgPnl=0, OR null if the
  // raw compound exceeds the cap on the negative side.
  if (stats.expectedYearlyReturns !== null && stats.expectedYearlyReturns >= 0) {
    return `expectedYearlyReturns must be < 0 (geometric drag), got ${stats.expectedYearlyReturns}`;
  }
  return null;
};

test("backtest_17.json: symmetric +X/-X — geometric drag yields negative expectedYearly despite avgPnl=0 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest volatility-drag verified", ctx, assertDrag);
});

test("backtest_17.json: symmetric +X/-X — geometric drag yields negative expectedYearly despite avgPnl=0 (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live volatility-drag verified", ctx, assertDrag);
});

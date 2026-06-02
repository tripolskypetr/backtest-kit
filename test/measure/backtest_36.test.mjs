import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_36.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: all 12 signals are exact break-even (pnl=0).
// winCount=0, lossCount=0, decisiveTrades=0 → winRate=0 (guard branch).
// avgPnl=0, totalPnl=0, stdDev=0 → sharpeRatio gated to null (divide-by-zero).
// No negatives → sortinoRatio=null.
// Equity flat at 1.0 → maxDD=0 → recoveryFactor=null (DD ≤ 0).
// certaintyRatio=null (avgLoss not < 0).
// expectedYearlyReturns: compound 1^k - 1 = 0 → exactly 0% (annualization
// passes — span and N are big enough).

const POOL = "POOL-B36";

const assertAllBE = (stats) => {
  if (stats.winCount !== 0) return `winCount must be 0, got ${stats.winCount}`;
  if (stats.lossCount !== 0) return `lossCount must be 0, got ${stats.lossCount}`;
  if (stats.winRate !== 0) return `winRate must be 0 (no decisive trades), got ${stats.winRate}`;
  if (stats.avgPnl !== 0) return `avgPnl must be exactly 0, got ${stats.avgPnl}`;
  if (stats.totalPnl !== 0) return `totalPnl must be exactly 0, got ${stats.totalPnl}`;
  if (stats.stdDev !== 0) return `stdDev must be 0 (identical returns), got ${stats.stdDev}`;
  if (stats.sharpeRatio !== null) return `sharpeRatio must be null (stdDev=0 div guard), got ${stats.sharpeRatio}`;
  if (stats.sortinoRatio !== null) return `sortinoRatio must be null (no negative returns), got ${stats.sortinoRatio}`;
  if (stats.certaintyRatio !== null) return `certaintyRatio must be null (no losses), got ${stats.certaintyRatio}`;
  if (stats.recoveryFactor !== null) return `recoveryFactor must be null (DD=0), got ${stats.recoveryFactor}`;
  // Annualized: Sharpe is null so annualized is also null.
  if (stats.annualizedSharpeRatio !== null) return `annualizedSharpeRatio must be null (sharpe null), got ${stats.annualizedSharpeRatio}`;
  // expectedYearlyReturns: gates pass (n≥10, span≥14), compound 1^k - 1 = 0.
  if (stats.expectedYearlyReturns !== 0) {
    return `expectedYearlyReturns must be exactly 0 (flat equity, gates passed), got ${stats.expectedYearlyReturns}`;
  }
  // Calmar: numerator 0 / denominator 0 → null (DD condition fails).
  if (stats.calmarRatio !== null) return `calmarRatio must be null (DD=0), got ${stats.calmarRatio}`;
  return null;
};

test("backtest_36.json: all break-even — winRate=0, sharpe/sortino/recovery null, expectedYearly=0 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest all-BE verified", ctx, assertAllBE);
});

test("backtest_36.json: all break-even — same shape in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live all-BE verified", ctx, assertAllBE);
});

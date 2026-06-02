import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_68.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "./_measure_helpers.mjs";

// Edge case: "Unicorn" — all 30 signals exactly +0.5%.
// avgPnl = 0.5, stdDev = 0 → sharpe NULL (division by zero gate).
// No negatives → sortino NULL.
// Equity = 1.005^30 ≈ 1.161 (positive compound).
// maxDD = 0 → recoveryFactor NULL.
// compound annual = 1.005^365 - 1 ≈ +518% → OVER MAX_EXPECTED_YEARLY_RETURNS=100% → NULL.
//
// User insight: even a "perfect" strategy returns LOTS of N/A in the
// analytics, because most metrics require variance to compute. Only
// totalPnl tells the story. Frame this as a fundamental limitation of
// variance-based metrics, not a bug.

const POOL = "POOL-B68";

const assertUnicorn = (stats) => {
  if (stats.winCount !== 30) return `winCount must be 30 (all wins), got ${stats.winCount}`;
  if (stats.lossCount !== 0) return `lossCount must be 0, got ${stats.lossCount}`;
  if (!approx(stats.avgPnl, 0.5, 1e-9)) return `avgPnl must be exactly 0.5, got ${stats.avgPnl}`;
  if (!approx(stats.totalPnl, 15, 1e-9)) return `totalPnl must be 15, got ${stats.totalPnl}`;

  // ALL variance-based metrics null
  if (stats.stdDev !== 0) return `stdDev must be 0 (identical returns), got ${stats.stdDev}`;
  if (stats.sharpeRatio !== null) return `sharpeRatio must be null (stdDev=0), got ${stats.sharpeRatio}`;
  if (stats.sortinoRatio !== null) return `sortinoRatio must be null (no negatives), got ${stats.sortinoRatio}`;
  if (stats.annualizedSharpeRatio !== null) return `annualizedSharpe must be null, got ${stats.annualizedSharpeRatio}`;
  if (stats.recoveryFactor !== null) return `recoveryFactor must be null (DD=0), got ${stats.recoveryFactor}`;

  // expectedYearlyReturns: compound 518% > cap → null
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (compound 518% > 100% cap), got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) return `calmarRatio must be null, got ${stats.calmarRatio}`;
  return null;
};

test("backtest_68.json: 'unicorn' (all identical +0.5%) — Sharpe/Sortino/Recovery/Yearly ALL null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest unicorn nullity verified", ctx, assertUnicorn);
});

test("backtest_68.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live unicorn nullity verified", ctx, assertUnicorn);
});

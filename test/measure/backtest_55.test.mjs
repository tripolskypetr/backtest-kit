import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_55.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "./_measure_helpers.mjs";

// User scenario #1: a strategy can REACH Sharpe ≥ 1.0.
// 30 signals: 25 wins of +0.5%, 5 interleaved losses of -0.2%.
// Reference: avgPnl ≈ 0.383, sample stdDev ≈ 0.265 → sharpe ≈ 1.44.
//
// This locks in that the analytics machinery is capable of recognising
// "good" Sharpe values, not just gating everything to null. If a future
// regression flipped a sign or scaled stdDev wrong, this test would catch
// it: the reference number is a concrete target, not a gate.

const POOL = "POOL-B55";

const assertSharpeReachable = (stats) => {
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio < 1.0) {
    return `sharpeRatio must be ≥ 1.0 for this strategy (avgPnl=0.38, stdDev=0.27), got ${stats.sharpeRatio}. ` +
      `If significantly lower, stdDev calc may have regressed.`;
  }
  if (!approx(stats.sharpeRatio, 1.4447, 1e-3)) {
    return `sharpeRatio should be ≈1.4447, got ${stats.sharpeRatio}`;
  }
  // Sortino even higher: avgPnl / downsideDev where downsideDev uses N_total.
  // 5 negatives × (-0.2)² = 0.20  → /30 = 0.00667 → √ = 0.0816  → sortino = 4.69
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed, got null`;
  if (!approx(stats.sortinoRatio, 4.6949, 1e-3)) {
    return `sortinoRatio should be ≈4.6949, got ${stats.sortinoRatio}`;
  }
  // Certainty ratio: 0.5 / |-0.2| = 2.5
  if (!approx(stats.certaintyRatio, 2.5, 1e-3)) {
    return `certaintyRatio must be 2.5, got ${stats.certaintyRatio}`;
  }
  // Compound 303% > 100% cap → expectedYearlyReturns null. Same for calmar.
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null (compound 303% > 100% cap), got ${stats.expectedYearlyReturns}`;
  }
  // BUT annualizedSharpeRatio is NOT capped — it should be computed.
  if (stats.annualizedSharpeRatio === null) {
    return `annualizedSharpeRatio must be computed (no cap on Sharpe), got null`;
  }
  return null;
};

test("backtest_55.json: a real strategy reaches Sharpe ≈ 1.44 (≥ 1.0 achievable) (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest sharpe≥1 reachable verified", ctx, assertSharpeReachable);
});

test("backtest_55.json: same Sharpe in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live sharpe≥1 reachable verified", ctx, assertSharpeReachable);
});

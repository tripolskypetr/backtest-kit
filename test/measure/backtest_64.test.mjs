import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_64.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "./_measure_helpers.mjs";

// Intermediate scenario: small N (6) + catastrophic black swan.
// 4 wins +0.5%, 1 small loss -0.3%, 1 black swan -12%.
//   n=6 → BELOW ratio gate → sharpe/sortino null
//   totalPnl = 2 - 0.3 - 12 = -10.3 (strongly negative)
//   avgPnl ≈ -1.72
//   winCount=4, lossCount=2, winRate=66.67% (LOOKS HEALTHY)
//   certaintyRatio: avgWin=0.5, avgLoss=-6.15 → 0.5/6.15 ≈ 0.081
//
// MOST DANGEROUS REAL-WORLD CASE: small sample, large loss.
// User sees:
//   - winRate 66.67% (sounds great!)
//   - totalPnl -10.3% (strongly negative)
//   - certaintyRatio 0.08 (catastrophic asymmetry)
//   - But NO sharpe/sortino to confirm
// They must rely on aggregates alone. Analytics correctly gates ratios
// (not enough data for variance estimation) but exposes the catastrophe
// via aggregates AND certaintyRatio (which doesn't require N≥10).

const POOL = "POOL-B64";

const assertSmallNSwan = (stats, countField) => {
  if (stats[countField] !== 6) return `${countField} must be 6, got ${stats[countField]}`;
  if (stats.winCount !== 4) return `winCount must be 4, got ${stats.winCount}`;
  if (stats.lossCount !== 2) return `lossCount must be 2, got ${stats.lossCount}`;
  if (!approx(stats.winRate, 66.67, 0.01)) {
    return `winRate must be ≈66.67% (the illusion), got ${stats.winRate}`;
  }

  // totalPnl strongly negative — the catastrophe is visible at aggregate level
  if (stats.totalPnl >= 0) return `totalPnl must be strongly negative, got ${stats.totalPnl}`;
  if (!approx(stats.totalPnl, -10.3, 0.01)) {
    return `totalPnl must be ≈-10.3, got ${stats.totalPnl}`;
  }
  if (!approx(stats.avgPnl, -1.72, 0.01)) {
    return `avgPnl must be ≈-1.72, got ${stats.avgPnl}`;
  }

  // Ratios gated to null due to N<10
  if (stats.sharpeRatio !== null) {
    return `sharpeRatio must be null (N=6 < MIN), got ${stats.sharpeRatio}`;
  }
  if (stats.sortinoRatio !== null) {
    return `sortinoRatio must be null, got ${stats.sortinoRatio}`;
  }
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null, got ${stats.annualizedSharpeRatio}`;
  }

  // BUT certaintyRatio IS computed (not N-gated) — and it screams
  if (stats.certaintyRatio === null) {
    return `certaintyRatio must be computed (no N-gate on it), got null`;
  }
  if (stats.certaintyRatio >= 0.2) {
    return `certaintyRatio must be FAR below 1.0 (≈0.08) — the catastrophic asymmetry, got ${stats.certaintyRatio}`;
  }
  if (!approx(stats.certaintyRatio, 0.0813, 0.01)) {
    return `certaintyRatio must be ≈0.081, got ${stats.certaintyRatio}`;
  }

  // recoveryFactor: DD > 0 → computed. Negative because compound loss.
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed (DD>0), got null`;
  if (stats.recoveryFactor >= 0) return `recoveryFactor must be negative (losing), got ${stats.recoveryFactor}`;
  return null;
};

test("backtest_64.json: small-N (6) + black swan — totalPnl screams, certainty=0.08, ratios gated (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest small-N+swan verified", ctx, (stats) => assertSmallNSwan(stats, "totalSignals"));
});

test("backtest_64.json: same exposure in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live small-N+swan verified", ctx, (stats) => assertSmallNSwan(stats, "totalClosed"));
});

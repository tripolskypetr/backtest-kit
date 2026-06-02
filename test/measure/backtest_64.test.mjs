import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_64.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// Intermediate scenario: small N (6) + catastrophic black swan.
// 4 wins +0.5%, 1 small loss -0.3%, 1 black swan -12%.
//   n=6 → BELOW ratio gate → ALL ratios null (sharpe/sortino/certainty/recovery)
//   totalPnl = 2 - 0.3 - 12 = -10.3 (strongly negative)
//   avgPnl ≈ -1.72
//   winCount=4, lossCount=2, winRate=66.67% (LOOKS HEALTHY)
//
// MOST DANGEROUS REAL-WORLD CASE: small sample, large loss.
// User sees:
//   - winRate 66.67% (sounds great!)
//   - totalPnl -10.3% (strongly negative — the ONLY signal of the catastrophe)
//   - ALL ratios N/A (not enough data for any of them to be trustworthy)
// They must rely on the aggregates alone. The point: on a 6-trade sample no
// ratio — not even certainty/recovery — is published, because none of them
// are statistically meaningful. Only totalPnl/avgPnl reveal the loss.

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

  // certaintyRatio — N-gated like the others (N=6 < MIN). The catastrophic
  // asymmetry is NOT exposed via a ratio on this tiny sample; only the
  // aggregates (totalPnl/avgPnl, asserted above) reveal it. Surfacing a
  // certainty ratio on 6 trades would be statistically misleading.
  if (stats.certaintyRatio !== null) {
    return `certaintyRatio must be null (N=6 < MIN_SIGNALS_FOR_RATIOS), got ${stats.certaintyRatio}`;
  }

  // recoveryFactor — also N-gated now: null on a 6-trade sample.
  if (stats.recoveryFactor !== null) {
    return `recoveryFactor must be null (N=6 < MIN_SIGNALS_FOR_RATIOS), got ${stats.recoveryFactor}`;
  }
  return null;
};

test("backtest_64.json: small-N (6) + black swan — totalPnl screams, ALL ratios gated to null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest small-N+swan verified", ctx, (stats) => assertSmallNSwan(stats, "totalSignals"));
});

test("backtest_64.json: same exposure in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live small-N+swan verified", ctx, (stats) => assertSmallNSwan(stats, "totalClosed"));
});

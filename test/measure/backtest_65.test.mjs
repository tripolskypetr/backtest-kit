import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_65.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "./_measure_helpers.mjs";

// Intermediate scenario: small N (9) + single prophet trade.
// 8 small losses -0.3%, 1 prophet +15%.
//   n=9 → BELOW ratio gate → sharpe/sortino null
//   totalPnl = -2.4 + 15 = 12.6 (strongly positive)
//   avgPnl ≈ 1.4
//   winCount=1, lossCount=8, winRate = 1/9 ≈ 11.11% (LOOKS TERRIBLE)
//   certaintyRatio: avgWin=15, avgLoss=-0.3 → 50 (extreme)
//
// MIRROR of #64: small sample, but extreme POSITIVE outlier.
// User sees:
//   - winRate 11.11% (looks awful)
//   - totalPnl +12.6% (strongly positive)
//   - certaintyRatio 50 (extreme — one trade wins huge)
//   - But NO sharpe/sortino to confirm
// Analytics correctly gates ratios. User must understand that one lucky
// trade dominates total — no statistical confidence the pattern repeats.

const POOL = "POOL-B65";

const assertSmallNProphet = (stats, countField) => {
  if (stats[countField] !== 9) return `${countField} must be 9, got ${stats[countField]}`;
  if (stats.winCount !== 1) return `winCount must be 1 (only the prophet), got ${stats.winCount}`;
  if (stats.lossCount !== 8) return `lossCount must be 8, got ${stats.lossCount}`;
  if (!approx(stats.winRate, 11.11, 0.01)) {
    return `winRate must be ≈11.11% (looks terrible), got ${stats.winRate}`;
  }

  // totalPnl strongly POSITIVE despite low winRate — the prophet dominates
  if (stats.totalPnl <= 0) return `totalPnl must be positive (prophet wins), got ${stats.totalPnl}`;
  if (!approx(stats.totalPnl, 12.6, 0.01)) {
    return `totalPnl must be ≈12.6, got ${stats.totalPnl}`;
  }
  if (!approx(stats.avgPnl, 1.4, 0.01)) {
    return `avgPnl must be ≈1.4, got ${stats.avgPnl}`;
  }

  // Ratios gated to null
  if (stats.sharpeRatio !== null) {
    return `sharpeRatio must be null (N=9 < MIN), got ${stats.sharpeRatio}`;
  }
  if (stats.sortinoRatio !== null) {
    return `sortinoRatio must be null, got ${stats.sortinoRatio}`;
  }

  // certaintyRatio is EXTREME — exposes the lopsidedness
  if (stats.certaintyRatio === null) {
    return `certaintyRatio must be computed, got null`;
  }
  if (stats.certaintyRatio < 20) {
    return `certaintyRatio must be HIGH (≈50), got ${stats.certaintyRatio}`;
  }
  if (!approx(stats.certaintyRatio, 50, 0.01)) {
    return `certaintyRatio must be ≈50, got ${stats.certaintyRatio}`;
  }

  // recoveryFactor positive: compound positive, DD exists from the small
  // losses before the prophet trade
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor <= 0) return `recoveryFactor must be positive, got ${stats.recoveryFactor}`;
  return null;
};

test("backtest_65.json: small-N (9) + prophet — winRate=11% LOOKS BAD, totalPnl positive, certainty=50, ratios null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest small-N+prophet verified", ctx, (stats) => assertSmallNProphet(stats, "totalSignals"));
});

test("backtest_65.json: same exposure in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live small-N+prophet verified", ctx, (stats) => assertSmallNProphet(stats, "totalClosed"));
});

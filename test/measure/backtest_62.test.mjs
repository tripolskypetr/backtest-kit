import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_62.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// Intermediate scenario: swans AND prophets combined.
// 22 wins (20 small +0.5%, 2 prophets +20%), 8 losses (5 small -0.5%, 3 black swans -10%).
//   winRate = 73.33% (HIGH — looks great)
//   sumWins = 50, sumLosses = 32.5
//   profitFactor = 50/32.5 ≈ 1.54  (positive, looks OK)
//   avgPnl = +0.583 (positive, looks profitable)
//   avgWin = 2.27, avgLoss = -4.06
//   certaintyRatio = 2.27/4.06 ≈ 0.56  (< 1.0 — the SUBTLE warning)
//   sharpe ≈ 0.095 (modest)
//   maxDD = 17.78%
//
// THE TRICKIEST scenario: nearly all surface indicators look healthy
// (winRate, profitFactor, avgPnl positive). The ONLY analytics signal that
// something is off is certaintyRatio < 1.0.
//
// User insight: even with positive profitFactor, if certaintyRatio < 1,
// the strategy is sensitive to win-rate fluctuations. A small dip in
// winRate would flip the strategy from profitable to losing.

const POOL = "POOL-B62";

const assertSwanProphet = (stats) => {
  // Surface indicators all look healthy
  if (!approx(stats.winRate, 73.33, 0.01)) {
    return `winRate must be ≈73.33% (looks great), got ${stats.winRate}`;
  }
  if (stats.winCount !== 22) return `winCount must be 22 (20 small + 2 prophets), got ${stats.winCount}`;
  if (stats.lossCount !== 8) return `lossCount must be 8 (5 small + 3 swans), got ${stats.lossCount}`;

  // avgPnl positive (the prophet trades win)
  if (stats.avgPnl <= 0) return `avgPnl must be positive (prophets > swans), got ${stats.avgPnl}`;
  if (!approx(stats.avgPnl, 0.583, 0.01)) {
    return `avgPnl must be ≈+0.583, got ${stats.avgPnl}`;
  }

  // sharpeRatio modest positive
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio <= 0) return `sharpeRatio must be positive, got ${stats.sharpeRatio}`;
  if (stats.sharpeRatio > 0.3) {
    return `sharpeRatio (${stats.sharpeRatio}) should be modest (≈0.095) — stdDev inflated by swans+prophets`;
  }

  // THE SUBTLE WARNING: certaintyRatio < 1.0 despite all other surfaces looking healthy
  if (stats.certaintyRatio === null) return `certaintyRatio must be computed, got null`;
  if (stats.certaintyRatio >= 1.0) {
    return `certaintyRatio (${stats.certaintyRatio}) must be BELOW 1.0 — the subtle warning that avgLoss exceeds avgWin despite profitable PnL`;
  }
  if (!approx(stats.certaintyRatio, 0.56, 0.01)) {
    return `certaintyRatio must be ≈0.56, got ${stats.certaintyRatio}`;
  }

  // The full picture: profitFactor > 1, avgPnl > 0, winRate high — but
  // certainty < 1. Analytics catches the asymmetry.
  return null;
};

test("backtest_62.json: swan+prophet combo — profitable BUT certaintyRatio<1 warns (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest swan-prophet combo verified", ctx, assertSwanProphet);
});

test("backtest_62.json: same subtle warning in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live swan-prophet combo verified", ctx, assertSwanProphet);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_61.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// Intermediate scenario: grey swans (lighter version of #58 black swans).
// 20 wins +0.5%, 8 small losses -0.5%, 2 grey swans -8%.
// Same 66.67% winRate as #58, but losses are smaller in magnitude.
//   profitFactor = 10/20 = 0.5 (losing, NOT catastrophic)
//   certaintyRatio = 0.5/2.0 = 0.25 (alarm bell, but recoverable scale)
//   avgPnl = -0.333 (negative but milder than #58's -2.25)
//   sharpe = -0.156 (negative, mild)
//   maxDD = 17%
//
// User scenario: trader thinks "I have a high win rate, occasional losses
// are tolerable". Analytics still says NO via certaintyRatio < 0.5 and
// profitFactor < 1.0 — but the warnings are LESS LOUD than #58.

const POOL = "POOL-B61";

const assertGreySwan = (stats) => {
  // winRate still looks healthy
  if (!approx(stats.winRate, 66.67, 0.01)) {
    return `winRate must be ≈66.67% (the illusion), got ${stats.winRate}`;
  }
  if (stats.winCount !== 20) return `winCount must be 20, got ${stats.winCount}`;
  if (stats.lossCount !== 10) return `lossCount must be 10 (8 small + 2 grey swans), got ${stats.lossCount}`;

  // certaintyRatio below 1.0 — still alarming but less than #58
  if (stats.certaintyRatio === null) return `certaintyRatio must be computed, got null`;
  if (stats.certaintyRatio >= 0.5) {
    return `certaintyRatio must be below 0.5 (≈0.25), got ${stats.certaintyRatio}`;
  }
  if (!approx(stats.certaintyRatio, 0.25, 0.01)) {
    return `certaintyRatio must be ≈0.25, got ${stats.certaintyRatio}`;
  }

  // Critical comparison: grey swans gentler than black swans (#58)
  // - #58: certaintyRatio ≈ 0.065 (catastrophic)
  // - #61: certaintyRatio ≈ 0.25 (alarming but milder)
  // Locks in that the certainty metric scales with severity.
  if (stats.certaintyRatio <= 0.1) {
    return `certaintyRatio (${stats.certaintyRatio}) must be milder than #58 black swans (0.065)`;
  }

  // avgPnl still negative
  if (stats.avgPnl >= 0) return `avgPnl must be negative, got ${stats.avgPnl}`;
  if (!approx(stats.avgPnl, -0.333, 0.01)) {
    return `avgPnl must be ≈-0.333, got ${stats.avgPnl}`;
  }

  // sharpeRatio negative
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio >= 0) {
    return `sharpeRatio must be negative, got ${stats.sharpeRatio}`;
  }
  // But milder than #58 (which had ≈-0.39)
  if (stats.sharpeRatio < -0.3) {
    return `sharpeRatio (${stats.sharpeRatio}) should be milder than #58 black swans (-0.39)`;
  }
  return null;
};

test("backtest_61.json: grey swans — milder version of #58, certaintyRatio≈0.25 vs 0.065 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest grey-swan exposure verified", ctx, assertGreySwan);
});

test("backtest_61.json: same milder warning in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live grey-swan exposure verified", ctx, assertGreySwan);
});

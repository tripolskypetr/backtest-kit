import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_9.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: break-even trades (pnl === 0).
// 12 signals: 6 wins, 4 losses, 2 break-even.
// Expectation:
// - winCount = 6, lossCount = 4 (break-evens excluded from BOTH)
// - winRate = 6 / (6+4) * 100 = 60% (NOT 6/12 = 50%)
// - totalSignals = 12 (still all in the count)

const POOL = "POOL-B9";

const assertBreakeven = (stats) => {
  if (stats.totalSignals !== 12) return `totalSignals must be 12, got ${stats.totalSignals}`;
  if (stats.winCount !== 6) return `winCount must be 6, got ${stats.winCount}`;
  if (stats.lossCount !== 4) return `lossCount must be 4 (break-evens excluded), got ${stats.lossCount}`;
  if (Math.abs(stats.winRate - 60) > 1e-9) {
    return `winRate must be 60% (6/(6+4)), got ${stats.winRate} — break-evens should not dilute the denominator`;
  }
  return null;
};

const assertBreakevenLive = (stats) => {
  if (stats.totalClosed !== 12) return `totalClosed must be 12, got ${stats.totalClosed}`;
  if (stats.winCount !== 6) return `winCount must be 6, got ${stats.winCount}`;
  if (stats.lossCount !== 4) return `lossCount must be 4 (break-evens excluded), got ${stats.lossCount}`;
  if (Math.abs(stats.winRate - 60) > 1e-9) {
    return `winRate must be 60% (6/(6+4)), got ${stats.winRate}`;
  }
  return null;
};

test("backtest_9.json: break-even trades — winRate excludes them from denominator (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest break-even winRate verified", ctx, assertBreakeven);
});

test("backtest_9.json: break-even trades — winRate excludes them from denominator (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live break-even winRate verified", ctx, assertBreakevenLive);
});

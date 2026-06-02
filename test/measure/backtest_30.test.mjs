import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_30.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "./_measure_helpers.mjs";

// DCA signals (totalEntries > 1) must aggregate exactly like single-entry
// signals — the services read pnl.pnlPercentage, not entry-level data.
//
// Fixture: 12 signals. Even-indexed = single-entry +1.5%; odd-indexed = DCA
// 3-entry -0.5%. Half wins, half losses.
//
// Order-INDEPENDENT aggregates:
//   totalSignals = 12, winCount = 6, lossCount = 6
//   avgPnl = (6*1.5 + 6*-0.5) / 12 = 0.5
//   totalPnl = 6.0
//   winRate = 50%
//
// DCA signals must not be silently dropped (would give totalSignals=6) nor
// double-counted (would give totalSignals=18) nor scaled by cost (avgPnl
// would deviate from the simple per-trade mean).

const POOL = "POOL-B30";

const assertDcaAggregation = (stats) => {
  const n = stats.totalSignals ?? stats.totalClosed;
  if (n !== 12) return `count must be 12 (DCA must not skip/duplicate), got ${n}`;
  if (stats.winCount !== 6) return `winCount must be 6 (even-indexed wins), got ${stats.winCount}`;
  if (stats.lossCount !== 6) return `lossCount must be 6 (odd-indexed DCA losses), got ${stats.lossCount}`;

  // avgPnl reads pnl.pnlPercentage only — DCA cost shouldn't weight it.
  if (!approx(stats.avgPnl, 0.5, 1e-9)) {
    return `avgPnl must be 0.5 (per-trade simple mean, no cost weighting), got ${stats.avgPnl}`;
  }
  if (!approx(stats.totalPnl, 6.0, 1e-9)) {
    return `totalPnl must be 6.0, got ${stats.totalPnl}`;
  }
  if (!approx(stats.winRate, 50.0, 1e-9)) {
    return `winRate must be 50%, got ${stats.winRate}`;
  }
  return null;
};

test("backtest_30.json: DCA signals (totalEntries > 1) aggregate like single-entry signals (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest DCA aggregation verified", ctx, assertDcaAggregation);
});

test("backtest_30.json: DCA signals aggregate identically (Live)", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live DCA aggregation verified", ctx, assertDcaAggregation);
});

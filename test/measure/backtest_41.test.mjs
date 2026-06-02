import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_41.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Edge case: ALL signals share the same id="duplicate".
// Realistic cause: broken persist wrote the same signal multiple times under
// the same id (race condition, retry without dedup, replay attack on logs).
//
// Documented behaviour: services have no dedup logic. They unshift each tick
// onto a list. So 12 ticks with the same id produce 12 entries, NOT 1.
//
// This test LOCKS IN that behaviour. If anyone later adds dedup-by-id, this
// test will fail, prompting an explicit conversation about whether that's
// intended (e.g. it would BREAK the live-replay scenario where the same
// signal id legitimately appears twice as it transitions through states).

const POOL = "POOL-B41";

const assertClonesCount = (stats) => {
  const n = stats.totalSignals ?? stats.totalClosed;
  if (n !== 12) {
    return `12 ticks with the SAME id must all be retained (no dedup contract), got ${n}`;
  }
  // Math operates on pnl.pnlPercentage — duplicate ids don't affect numerics.
  if (stats.avgPnl === null) return `avgPnl must be computed, got null`;
  if (stats.totalPnl === null) return `totalPnl must be computed, got null`;
  // sharpeRatio: N=12 ≥ MIN_SIGNALS_FOR_RATIOS so it's computed
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (N=12), got null`;
  return null;
};

test("backtest_41.json: 12 signals with duplicate id — all retained (no dedup contract) (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest no-dedup contract verified", ctx, assertClonesCount);
});

test("backtest_41.json: 12 signals with duplicate id — same retention in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live no-dedup contract verified", ctx, assertClonesCount);
});

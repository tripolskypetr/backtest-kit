import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_15.json" with { type: "json" };
import { runBacktestPool } from "../utils/_measure_helpers.mjs";

// Edge case: one signal with corrupted pendingAt=0.
// Bug history: validSignals filter (pendingAt > 0 AND closeTimestamp > 0) is
// the single source of truth for EVERY metric. The corrupted row is silently
// dropped — totalSignals in stats reflects the filtered count, not raw input.
// 11 good rows + 1 corrupted → totalSignals = 11.

const POOL = "POOL-B15";

const assertFiltered = (stats) => {
  if (stats.totalSignals !== 11) {
    return `totalSignals must be 11 (12 rows - 1 corrupted pendingAt), got ${stats.totalSignals}`;
  }
  // All other ratios should still be computed (11 ≥ MIN_SIGNALS_FOR_RATIOS=10).
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed (n=11), got null`;
  return null;
};

test("backtest_15.json: corrupted pendingAt — validSignals filter drops it, totalSignals=11", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest corrupted-timestamp filter verified", ctx, assertFiltered);
});

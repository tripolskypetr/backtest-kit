import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_72.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/_measure_helpers.mjs";

// Float-artifact target: recoveryFactor when equityMaxDrawdown ≈ 1e-16.
// 30 nearly-identical wins (+0.5%, one +0.5 + 1e-14 to force float drift).
//   Equity climbs monotonically through compound; the tiny 1e-14 noise
//   would otherwise produce DD ≈ 1e-16 and recoveryFactor ≈ 1e15.
//
// Service behaviour now:
//   - stdDev passes STDDEV_EPSILON gate → sharpe = null (covered in #18, #70)
//   - sortino = null (no negatives)
//   - equityMaxDrawdown rounds to 0 (or near it) → recoveryFactor = null
//     (`equityMaxDrawdown <= 0` branch). NEW: even if DD > 0 by epsilon,
//     the result is clamped by MAX_CALMAR_RATIO=1000.
//
// Locks in: zero/epsilon DD never produces astronomical recovery.

const POOL = "POOL-B72";

const assertRecoveryEpsilon = (stats) => {
  if (stats.winCount !== 30) return `winCount must be 30, got ${stats.winCount}`;
  if (stats.lossCount !== 0) return `lossCount must be 0 (all wins), got ${stats.lossCount}`;

  // recoveryFactor: either null (DD ≤ 0) or finite ≤ 1000 (clamped)
  if (stats.recoveryFactor !== null) {
    if (!isFinite(stats.recoveryFactor)) {
      return `recoveryFactor non-finite: ${stats.recoveryFactor}`;
    }
    if (Math.abs(stats.recoveryFactor) > 1000) {
      return `recoveryFactor must be clamped at ±1000 (MAX_CALMAR_RATIO), got ${stats.recoveryFactor}. ` +
        `If exceeds 1000, the cap regressed and float-artifact DD produces astronomical recovery.`;
    }
  }
  return null;
};

test("backtest_72.json: float-drift equity → recoveryFactor never astronomical (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest recovery epsilon guard verified", ctx, assertRecoveryEpsilon);
});

test("backtest_72.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live recovery epsilon guard verified", ctx, assertRecoveryEpsilon);
});

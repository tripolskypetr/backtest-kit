import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_80.json" with { type: "json" };
import { runBacktestPool, runLivePool, MAX_CALMAR_RATIO, approx } from "../utils/_measure_helpers.mjs";

// Negative compound + negative Calmar/Recovery.
// 60 losses of -0.05%. compound ≈ -16.7%, DD ≈ 2.96%.
// calmar = -16.7/2.96 ≈ -5.64 (signed, NOT capped — well within bounds).
// recovery: with the new clamp, magnitude must be ≤ MAX_CALMAR_RATIO.
//   (eqFinal-1)*100 / DD = -2.96/2.96 ≈ -1.0 (negative, small magnitude).
//
// Locks in:
//   - calmar signed correctly (negative for losing strategy)
//   - recovery clamped if needed (here it's well within, so just signed)
//   - both within ±MAX_CALMAR_RATIO

const POOL = "POOL-B80";

const assertNegBounds = (stats) => {
  if (stats.calmarRatio === null) return `calmarRatio must be computed, got null`;
  if (stats.calmarRatio >= 0) return `calmarRatio must be negative (losing strategy), got ${stats.calmarRatio}`;
  if (Math.abs(stats.calmarRatio) > MAX_CALMAR_RATIO) {
    return `calmarRatio must be within ±${MAX_CALMAR_RATIO}, got ${stats.calmarRatio}`;
  }
  if (!approx(stats.calmarRatio, -5.64, 0.5)) {
    return `calmarRatio should be ≈ -5.64, got ${stats.calmarRatio}`;
  }

  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor >= 0) return `recoveryFactor must be negative, got ${stats.recoveryFactor}`;
  if (Math.abs(stats.recoveryFactor) > MAX_CALMAR_RATIO) {
    return `recoveryFactor must be within ±${MAX_CALMAR_RATIO}, got ${stats.recoveryFactor}. ` +
      `If exceeds ${MAX_CALMAR_RATIO}, the new negative cap regressed.`;
  }
  if (!approx(stats.recoveryFactor, -1.0, 0.1)) {
    return `recoveryFactor should be ≈ -1.0, got ${stats.recoveryFactor}`;
  }
  return null;
};

test("backtest_80.json: negative compound → calmar/recovery negative AND within ±cap (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest negative bounds verified", ctx, assertNegBounds);
});

test("backtest_80.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live negative bounds verified", ctx, assertNegBounds);
});

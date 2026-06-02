import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_67.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "./_measure_helpers.mjs";

// Edge case: positive avgPnl AND positive Sharpe BUT Recovery < 1.0.
// 27 wins +0.4% + 3 losses -3% (clustered).
//   avgPnl = +0.06 → arithmetic positive
//   sharpe ≈ +0.058 → positive
//   totalPnl ≈ +1.8
//   equityFinal ≈ 1.017, maxDD ≈ 8.7%
//   recoveryFactor = 1.7 / 8.7 ≈ 0.19 → BELOW 1.0
//
// User insight: sharpe says "ok", but recoveryFactor says "DD wasn't worth it".
// User should look at multiple metrics, not just sharpe.

const POOL = "POOL-B67";

const assertDdNotWorth = (stats) => {
  // Surface metrics look ok
  if (stats.avgPnl <= 0) return `avgPnl must be positive, got ${stats.avgPnl}`;
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio <= 0) return `sharpeRatio must be positive (avgPnl positive), got ${stats.sharpeRatio}`;
  if (stats.totalPnl <= 0) return `totalPnl must be positive, got ${stats.totalPnl}`;

  // BUT recoveryFactor < 1.0 → DD wasn't worth it
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor >= 1.0) {
    return `recoveryFactor (${stats.recoveryFactor}) must be < 1.0 — DD ate the profit. ` +
      `Sharpe alone misleads: positive sharpe doesn't mean the DD was justified.`;
  }
  if (!approx(stats.recoveryFactor, 0.19, 0.05)) {
    return `recoveryFactor must be ≈0.19, got ${stats.recoveryFactor}`;
  }
  return null;
};

test("backtest_67.json: positive Sharpe but Recovery<1 — DD wasn't worth it (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest dd-not-worth verified", ctx, assertDdNotWorth);
});

test("backtest_67.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live dd-not-worth verified", ctx, assertDdNotWorth);
});

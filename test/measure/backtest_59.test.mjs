import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_59.json" with { type: "json" };
import {
  runBacktestPool,
  runLivePool,
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "../utils/_measure_helpers.mjs";

// User scenario: winRate = 50% (looks mediocre) but profitable outliers
// dominate profit factor.
// 30 signals: 15 wins / 15 losses.
//   12 wins of +0.5%, 3 prophet trades of +20%
//   15 losses of -0.5%
//   avgWin = (6 + 60)/15 = 4.4
//   avgLoss = -0.5
//   profitFactor = 66 / 7.5 = 8.8  (excellent)
//   certaintyRatio = 4.4 / 0.5 = 8.8
//   avgPnl = (66 - 7.5) / 30 = 1.95  (highly positive)
//   stdDev: high (≈6.14) due to 20% outliers → sharpe is MODEST (≈0.32)
//
// The KEY INSIGHT:
//   winRate = 50% looks unimpressive, but profitFactor and certaintyRatio
//   reveal an excellent strategy whose profitability comes from a few
//   massive hits. sharpe ALONE (modest) would also mislead.
//
// Required from analytics:
//   - winRate = 50% (the misleading number)
//   - certaintyRatio HIGH (≈ 8.8)
//   - profitFactor HIGH (≈ 8.8)
//   - avgPnl positive and notable
//   - sharpe MODEST despite great PnL (stdDev inflated by outliers)
//   - sortino HIGHER than sharpe (downside is mild — small losses only)

const POOL = "POOL-B59";

const assertProphet = (stats) => {
  // winRate = 50% looks mediocre
  if (!approx(stats.winRate, 50, 1e-9)) {
    return `winRate must be EXACTLY 50%, got ${stats.winRate}`;
  }
  if (stats.winCount !== 15 || stats.lossCount !== 15) {
    return `expected 15W/15L, got ${stats.winCount}W/${stats.lossCount}L`;
  }

  // certaintyRatio reveals the truth — HIGH
  if (stats.certaintyRatio === null) return `certaintyRatio must be computed, got null`;
  if (stats.certaintyRatio < 5) {
    return `certaintyRatio must be HIGH (≈8.8) to expose prophet trades, got ${stats.certaintyRatio}`;
  }
  if (!approx(stats.certaintyRatio, 8.8, 0.01)) {
    return `certaintyRatio must be ≈8.8, got ${stats.certaintyRatio}`;
  }

  // avgPnl strongly positive (the prophets dominate)
  if (stats.avgPnl <= 0) {
    return `avgPnl must be positive (prophets dominate), got ${stats.avgPnl}`;
  }
  if (!approx(stats.avgPnl, 1.95, 0.01)) {
    return `avgPnl must be ≈+1.95, got ${stats.avgPnl}`;
  }

  // sharpeRatio MODEST — the outlier-inflated stdDev hides the prophet quality
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio > 0.6) {
    return `sharpeRatio should be MODEST (outliers inflate stdDev), got ${stats.sharpeRatio}. ` +
      `If high, the outlier-weight is wrong.`;
  }
  if (stats.sharpeRatio <= 0) {
    return `sharpeRatio must be positive (avgPnl positive), got ${stats.sharpeRatio}`;
  }

  // sortinoRatio HIGHER than sharpe — downside risk is mild
  if (stats.sortinoRatio === null) return `sortinoRatio must be computed, got null`;
  if (stats.sortinoRatio <= stats.sharpeRatio) {
    return `sortinoRatio (${stats.sortinoRatio}) must be > sharpeRatio (${stats.sharpeRatio}) — ` +
      `prophet trades only inflate POSITIVE volatility; sortino sees only the small losses.`;
  }

  // totalPnl strongly positive
  if (!approx(stats.totalPnl, 58.5, 0.01)) {
    return `totalPnl must be ≈58.5, got ${stats.totalPnl}`;
  }
  return null;
};

test("backtest_59.json: 50% winRate + prophet trades → certaintyRatio=8.8, sortino > sharpe (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest prophet-trade detection verified", ctx, assertProphet);
});

test("backtest_59.json: same exposure in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live prophet-trade detection verified", ctx, assertProphet);
});

// Heat profitFactor exposes the same insight from a different angle.
test("backtest_59.json: Heat profitFactor ≈ 8.8 — outlier hits dominate", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) await svc.tick(toClosedTick(row));
  const stats = await svc.getData(EXCHANGE, FRAME, true);
  const row = stats.symbols.find((s) => s.symbol === "SCEN-PROPHET");
  if (!row) return fail(`SCEN-PROPHET row missing`);
  if (row.profitFactor === null) return fail(`profitFactor must be computed, got null`);
  if (!approx(row.profitFactor, 8.8, 0.01)) {
    return fail(`profitFactor must be ≈8.8, got ${row.profitFactor}`);
  }
  pass(`Heat profitFactor=${row.profitFactor.toFixed(2)} — prophet trades dominate`);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_58.json" with { type: "json" };
import {
  runBacktestPool,
  runLivePool,
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "../utils/_measure_helpers.mjs";

// User scenario: winRate looks healthy (≈68%) but BLACK SWANS destroy
// risk management.
// 30 signals: 20 wins +0.5%, 5 small losses -0.5%, 5 catastrophic -15%.
//   winRate = 20/30 = 66.67%  (looks "healthy")
//   sumWins = 10, sumLosses = 77.5
//   profitFactor = 10/77.5 ≈ 0.129  (BELOW 1.0 → losing strategy)
//   avgWin = 0.5, avgLoss = -7.75
//   certaintyRatio = 0.5/7.75 ≈ 0.065  (FAR below 1.0 → THE alarm bell)
//   avgPnl = -2.25, totalPnl = -67.5
//   maxDD ≈ 55.85% (catastrophic — five 15% losses in a row)
//   sharpe = -0.39 (negative)
//
// The KEY INSIGHT for the user:
//   winRate ALONE is misleading. certaintyRatio < 0.1 and profitFactor < 0.5
//   together expose that the strategy is wiped out by tail events.
//
// Analytics MUST surface this contradiction:
//   - winRate around 66.7% (looks OK)
//   - certaintyRatio FAR below 1.0 (catastrophic asymmetry)
//   - profitFactor (Heat) FAR below 1.0
//   - sharpe NEGATIVE
//   - totalPnl/avgPnl strongly NEGATIVE

const POOL = "POOL-B58";

const assertBlackSwan = (stats) => {
  // winRate looks healthy — locks in the illusion
  if (!approx(stats.winRate, 66.67, 0.01)) {
    return `winRate must be ≈66.67% (the misleading number), got ${stats.winRate}`;
  }
  if (stats.winCount !== 20) return `winCount must be 20, got ${stats.winCount}`;
  if (stats.lossCount !== 10) return `lossCount must be 10 (5 small + 5 swans), got ${stats.lossCount}`;

  // certaintyRatio = THE alarm bell — far below 1.0
  if (stats.certaintyRatio === null) return `certaintyRatio must be computed, got null`;
  if (stats.certaintyRatio >= 0.2) {
    return `certaintyRatio must be FAR below 1.0 (≈0.065) to expose the asymmetry, got ${stats.certaintyRatio}`;
  }
  if (!approx(stats.certaintyRatio, 0.0645, 0.01)) {
    return `certaintyRatio must be ≈0.065, got ${stats.certaintyRatio}`;
  }

  // avgPnl strongly negative — average trade is a LOSS despite 68% wins
  if (stats.avgPnl >= 0) {
    return `avgPnl must be NEGATIVE despite 68% winRate (swans dominate), got ${stats.avgPnl}`;
  }
  if (!approx(stats.avgPnl, -2.25, 0.01)) {
    return `avgPnl must be ≈-2.25, got ${stats.avgPnl}`;
  }

  // sharpeRatio negative
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio >= 0) {
    return `sharpeRatio must be NEGATIVE (losing strategy), got ${stats.sharpeRatio}`;
  }

  // recoveryFactor strongly negative
  if (stats.recoveryFactor === null) return `recoveryFactor must be computed, got null`;
  if (stats.recoveryFactor >= 0) {
    return `recoveryFactor must be negative (compound loss / massive DD), got ${stats.recoveryFactor}`;
  }
  return null;
};

test("backtest_58.json: 68% winRate but black swans → certaintyRatio ≈ 0.065, sharpe negative (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest black-swan exposure verified", ctx, assertBlackSwan);
});

test("backtest_58.json: same exposure in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live black-swan exposure verified", ctx, assertBlackSwan);
});

// Heat exposes profitFactor — verify the same dataset shows pF ≈ 0.13.
test("backtest_58.json: Heat profitFactor below 1.0 — strategy is losing", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) await svc.tick(toClosedTick(row));
  const stats = await svc.getData(EXCHANGE, FRAME, true);
  const row = stats.symbols.find((s) => s.symbol === "SCEN-BLACK-SWAN");
  if (!row) return fail(`SCEN-BLACK-SWAN row missing`);
  if (row.profitFactor === null) return fail(`profitFactor must be computed, got null`);
  if (row.profitFactor >= 1.0) {
    return fail(`profitFactor must be BELOW 1.0 (≈0.129), got ${row.profitFactor}. Losing strategy.`);
  }
  if (!approx(row.profitFactor, 0.129, 0.01)) {
    return fail(`profitFactor must be ≈0.129, got ${row.profitFactor}`);
  }
  pass(`Heat profitFactor=${row.profitFactor.toFixed(3)} (< 1.0 → losing), certainty=${row.expectancy === null ? "N/A" : row.expectancy.toFixed(3)}`);
});

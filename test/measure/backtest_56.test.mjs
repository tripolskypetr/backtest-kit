import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_56.json" with { type: "json" };
import { runBacktestPool, runLivePool, approx } from "../utils/_measure_helpers.mjs";

// User scenario #2: DCA trader with HUGE intra-trade swing but tiny realized PnL.
// Each signal: pnl ≈ ±0.05% to 0.15%, peakProfit=+10%, maxDrawdown=-10%.
// Trader DCA'd into adverse moves; the average price moved closer to close,
// so realised PnL is tame, but the position was wildly volatile in flight.
//
// THIS IS THE CRUX: realized-only Sharpe/Sortino COMPLETELY MISS the
// intra-trade risk. Only avgPeakPnl / avgFallPnl expose it.
//
// Required signals from analytics:
//   - avgPeakPnl ≈ +10  (extreme, screams)
//   - avgFallPnl ≈ -10  (extreme, screams)
//   - gap = avgPeakPnl - avgFallPnl ≈ 20% — the "swing alarm"
//   - sharpeRatio: modest ≈ 0.5 (LOW, looks unimpressive)
//   - The gap between (peak-fall) and realised stdDev demonstrates the
//     hidden risk the trader is carrying.

const POOL = "POOL-B56";

const assertDcaSwing = (stats) => {
  // Realized aggregate is mild
  if (Math.abs(stats.avgPnl) > 0.1) {
    return `avgPnl should be near zero (DCA flattens realized), got ${stats.avgPnl}`;
  }
  if (stats.winCount !== 15 || stats.lossCount !== 15) {
    return `expected 15W/15L, got ${stats.winCount}W/${stats.lossCount}L`;
  }

  // The "swing alarm" — analytics MUST expose intra-trade volatility.
  if (stats.avgPeakPnl === null) return `avgPeakPnl must be computed, got null`;
  if (stats.avgFallPnl === null) return `avgFallPnl must be computed, got null`;
  if (!approx(stats.avgPeakPnl, 10, 1e-6)) {
    return `avgPeakPnl must be ≈+10 (extreme intra-trade rallies), got ${stats.avgPeakPnl}`;
  }
  if (!approx(stats.avgFallPnl, -10, 1e-6)) {
    return `avgFallPnl must be ≈-10 (extreme intra-trade drawdowns), got ${stats.avgFallPnl}`;
  }

  // The KEY INSIGHT: peak-fall gap (20%) is ORDERS OF MAGNITUDE larger than
  // the realised range. This is the analytics surfacing the hidden DCA risk.
  const swing = stats.avgPeakPnl - stats.avgFallPnl;
  if (swing < 15) {
    return `swing gap (avgPeak - avgFall) must be ≥ 15% for this DCA scenario, got ${swing}`;
  }

  // Realised Sharpe is MODEST despite the violent intra-trade swings — proof
  // that Sharpe alone would mislead a reviewer.
  if (stats.sharpeRatio === null) return `sharpeRatio must be computed, got null`;
  if (stats.sharpeRatio > 1.0) {
    return `sharpeRatio should be modest (≈0.5) — realized returns are tame; got ${stats.sharpeRatio}`;
  }

  // Demonstrate the false-positive risk: a reviewer looking ONLY at Sharpe
  // would miss that this strategy is carrying ±10% intra-trade risk.
  return null;
};

test("backtest_56.json: DCA strategy — analytics surfaces ±10% intra-trade swing despite mild realized PnL (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest DCA swing exposed verified", ctx, assertDcaSwing);
});

test("backtest_56.json: same DCA exposure in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live DCA swing exposed verified", ctx, assertDcaSwing);
});

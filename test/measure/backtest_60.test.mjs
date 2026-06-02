import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_60.json" with { type: "json" };
import {
  runBacktestPool,
  runLivePool,
  approx,
} from "./_measure_helpers.mjs";

// User scenario: a completely silent strategy — only 3 trades over 20 days.
// 3 signals: +1%, -0.5%, +0.5% at 0, 10, 20-day pendingAt offsets.
//   n=3 → BELOW MIN_SIGNALS_FOR_RATIOS=10 → all ratio metrics null
//   span=20d → would pass MIN_CALENDAR_SPAN_DAYS=14, but N gate fires first
//   winCount=2, lossCount=1, winRate = 2/3 = 66.67%
//   avgPnl ≈ 0.333, totalPnl = 1
//   equityFinal = 1.01 * 0.995 * 1.005 ≈ 1.010
//   maxDD ≈ 0.5% (between trade 1 peak and trade 2)
//
// Analytics MUST:
//   - Compute basic aggregates (totalSignals, winRate, avgPnl, totalPnl)
//   - Gate ALL ratio metrics (sharpe, sortino, annualizedSharpe, expectedYearly, calmar)
//   - recoveryFactor: depends on DD>0 only (time-independent) — but it's
//     compounded equity/DD, NOT ratio-gated. Check what the service does.
//   - No NaN/Infinity anywhere — must show "N/A" silently
//
// This is the canonical "not enough data" report. User should see lots of
// N/A and understand they need more signals before drawing conclusions.

const POOL = "POOL-B60";

const assertSilent = (stats, countField) => {
  // Basic aggregates COMPUTED
  if (stats[countField] !== 3) return `${countField} must be 3, got ${stats[countField]}`;
  if (stats.winCount !== 2) return `winCount must be 2, got ${stats.winCount}`;
  if (stats.lossCount !== 1) return `lossCount must be 1, got ${stats.lossCount}`;
  if (!approx(stats.winRate, 66.67, 0.01)) {
    return `winRate must be ≈66.67%, got ${stats.winRate}`;
  }
  if (!approx(stats.avgPnl, 0.333, 0.01)) {
    return `avgPnl must be ≈0.333, got ${stats.avgPnl}`;
  }
  if (!approx(stats.totalPnl, 1.0, 1e-9)) {
    return `totalPnl must be 1.0, got ${stats.totalPnl}`;
  }

  // ALL ratio metrics gated to null due to N < MIN_SIGNALS_FOR_RATIOS
  if (stats.sharpeRatio !== null) {
    return `sharpeRatio must be null (N=3 < MIN_SIGNALS_FOR_RATIOS), got ${stats.sharpeRatio}`;
  }
  if (stats.sortinoRatio !== null) {
    return `sortinoRatio must be null, got ${stats.sortinoRatio}`;
  }
  if (stats.annualizedSharpeRatio !== null) {
    return `annualizedSharpeRatio must be null, got ${stats.annualizedSharpeRatio}`;
  }
  if (stats.expectedYearlyReturns !== null) {
    return `expectedYearlyReturns must be null, got ${stats.expectedYearlyReturns}`;
  }
  if (stats.calmarRatio !== null) {
    return `calmarRatio must be null, got ${stats.calmarRatio}`;
  }
  // stdDev: service sets it to 0 (not null) when the ratio gate is closed —
  // documented behaviour. The ratios themselves (sharpe, sortino) ARE null,
  // which is what the user sees.
  if (stats.stdDev !== 0) {
    return `stdDev must be 0 when ratio gate is closed (documented), got ${stats.stdDev}`;
  }

  // certaintyRatio — NOT ratio-gated by N (depends only on avgWin/avgLoss).
  // 0.75 / 0.5 = 1.5. Should be computed.
  if (stats.certaintyRatio === null) {
    return `certaintyRatio must be computed (no N-gate on it), got null`;
  }
  if (!approx(stats.certaintyRatio, 1.5, 0.01)) {
    return `certaintyRatio must be ≈1.5, got ${stats.certaintyRatio}`;
  }

  // No NaN/Infinity
  for (const k of Object.keys(stats)) {
    const v = stats[k];
    if (typeof v === "number" && !isFinite(v)) {
      return `field ${k} is non-finite: ${v}`;
    }
  }
  return null;
};

test("backtest_60.json: silent strategy (3 trades over 20d) — aggregates computed, ratios all N/A (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest silent-strategy verified", ctx, (stats) => assertSilent(stats, "totalSignals"));
});

test("backtest_60.json: same silent shape in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live silent-strategy verified", ctx, (stats) => assertSilent(stats, "totalClosed"));
});

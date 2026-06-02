import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_14.json" with { type: "json" };
import { runHeat, computeHeatReference } from "../utils/_measure_helpers.mjs";

// Edge case: one symbol has no peak/fall metadata on any of its signals.
// Bug history: portfolioAvgPeakPnl/FallPnl used to divide by
// portfolioTotalTrades (including symbols without peak/fall data), silently
// shrinking the mean. Fixed by weighting only over symbols that contribute
// non-null values.

const assertHeatPeakFall = (stats) => {
  const ref = computeHeatReference(signals);

  // The HEAT-NO-PF symbol contributes null avgPeakPnl/avgFallPnl per-symbol.
  const noPF = stats.symbols.find((s) => s.symbol === "HEAT-NO-PF");
  if (!noPF) return `HEAT-NO-PF symbol missing`;
  if (noPF.avgPeakPnl !== null) {
    return `HEAT-NO-PF avgPeakPnl must be null (no peak metadata), got ${noPF.avgPeakPnl}`;
  }
  if (noPF.avgFallPnl !== null) {
    return `HEAT-NO-PF avgFallPnl must be null, got ${noPF.avgFallPnl}`;
  }

  // Portfolio peak/fall must equal the weighted mean over WITH-PF symbol only.
  const withPF = stats.symbols.find((s) => s.symbol === "HEAT-WITH-PF");
  if (!withPF) return `HEAT-WITH-PF symbol missing`;

  if (stats.portfolioAvgPeakPnl === null) return `portfolioAvgPeakPnl must not be null`;
  if (Math.abs(stats.portfolioAvgPeakPnl - withPF.avgPeakPnl) > 1e-9) {
    return `portfolioAvgPeakPnl must equal HEAT-WITH-PF.avgPeakPnl (only contributor). expected=${withPF.avgPeakPnl}, got=${stats.portfolioAvgPeakPnl}`;
  }
  if (stats.portfolioAvgFallPnl === null) return `portfolioAvgFallPnl must not be null`;
  if (Math.abs(stats.portfolioAvgFallPnl - withPF.avgFallPnl) > 1e-9) {
    return `portfolioAvgFallPnl must equal HEAT-WITH-PF.avgFallPnl (only contributor). expected=${withPF.avgFallPnl}, got=${stats.portfolioAvgFallPnl}`;
  }

  // Sanity: portfolioTotalTrades counts ALL signals across symbols, but the
  // peak/fall weighting denominator (peakTradesTotal in ref) is just WITH-PF.
  if (stats.portfolioTotalTrades !== ref.portfolioTotalTrades) {
    return `portfolioTotalTrades=${stats.portfolioTotalTrades} ref=${ref.portfolioTotalTrades}`;
  }
  return null;
};

test("backtest_14.json: Heat — peak/fall portfolio weighted only over contributing symbols", async (ctx) => {
  await runHeat(lib.heatMarkdownService, signals, "Heat peak/fall non-dilution verified", ctx, assertHeatPeakFall);
});

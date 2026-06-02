import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_12.json" with { type: "json" };
import { runHeat } from "../utils/_measure_helpers.mjs";

// Edge case: Heat mixed gating.
// One symbol with 12 trades (per-symbol Sharpe computed), three with 3-4
// trades (per-symbol Sharpe gated to null). Pool = 22 trades (≥10) so
// portfolioSharpeRatio is computed.

const assertHeatMixed = (stats) => {
  const big = stats.symbols.find((s) => s.symbol === "HEAT-BIG");
  if (!big) return `HEAT-BIG symbol missing`;
  if (big.totalTrades !== 12) return `HEAT-BIG should have 12 trades, got ${big.totalTrades}`;
  if (big.sharpeRatio === null) return `HEAT-BIG sharpeRatio must be computed (N=12 ≥ 10), got null`;

  const smalls = stats.symbols.filter((s) => s.symbol !== "HEAT-BIG");
  for (const s of smalls) {
    if (s.totalTrades >= 10) {
      return `${s.symbol} should have <10 trades, got ${s.totalTrades}`;
    }
    if (s.sharpeRatio !== null) {
      return `${s.symbol} sharpeRatio must be null (N=${s.totalTrades} < 10), got ${s.sharpeRatio}`;
    }
  }

  if (stats.portfolioSharpeRatio === null) {
    return `portfolioSharpeRatio must be computed (pool=22 ≥ 10), got null`;
  }
  return null;
};

test("backtest_12.json: Heat mixed gating — big symbol Sharpe computed, small symbols Sharpe null", async (ctx) => {
  await runHeat(lib.heatMarkdownService, signals, "Heat mixed-gating verified", ctx, assertHeatMixed);
});

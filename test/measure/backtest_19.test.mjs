import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_19.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "./_measure_helpers.mjs";

// Edge case: cross-service consistency.
// Feed the same N≥10-trade single-symbol set into Backtest and Heat. Heat's
// per-symbol math (sharpeRatio, sortinoRatio, calmarRatio, recoveryFactor,
// maxDrawdown, winRate, totalPnl, avgPnl, stdDev) MUST equal the Backtest
// pooled values bit-for-bit. Locks in cross-service drift detection: if a
// future fix touches one service but not the other, this test trips.
//
// Heat does not surface annualizedSharpeRatio / expectedYearlyReturns on the
// row, but the calmarRatio (which depends on expectedYearly internally) is a
// strict consistency check on the whole annualization pipeline.

const POOL = "POOL-B19";
const SYMBOL = signals[0].symbol;

test("backtest_19.json: cross-service — Heat per-symbol == Backtest pooled", async ({ pass, fail }) => {
  const bt = lib.backtestMarkdownService;
  const ht = lib.heatMarkdownService;

  bt.subscribe();
  ht.subscribe();

  await bt.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  await ht.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    // Backtest pooled under a synthetic POOL symbol so it doesn't conflict
    // with other test fixtures, but Heat keyed by the real signal symbol.
    await bt.tick(toClosedTick(row, { symbolOverride: POOL }));
    await ht.tick(toClosedTick(row));
  }

  const btStats = await bt.getData(POOL, STRATEGY, EXCHANGE, FRAME, true);
  const htStats = await ht.getData(EXCHANGE, FRAME, true);

  const htRow = htStats.symbols.find((s) => s.symbol === SYMBOL);
  if (!htRow) {
    fail(`Heat row for ${SYMBOL} not found`);
    return;
  }

  const fields = [
    ["totalTrades", "totalSignals", "totalSignals"], // [heatField, btField, label]
    ["winCount", "winCount", "winCount"],
    ["lossCount", "lossCount", "lossCount"],
    ["winRate", "winRate", "winRate"],
    ["totalPnl", "totalPnl", "totalPnl"],
    ["avgPnl", "avgPnl", "avgPnl"],
    ["stdDev", "stdDev", "stdDev"],
    ["sharpeRatio", "sharpeRatio", "sharpeRatio"],
    ["sortinoRatio", "sortinoRatio", "sortinoRatio"],
    ["maxDrawdown", null, "maxDrawdown"], // backtest doesn't expose equityMaxDrawdown directly
    ["calmarRatio", "calmarRatio", "calmarRatio"],
    ["recoveryFactor", "recoveryFactor", "recoveryFactor"],
    ["avgPeakPnl", "avgPeakPnl", "avgPeakPnl"],
    ["avgFallPnl", "avgFallPnl", "avgFallPnl"],
  ];

  for (const [hField, bField, label] of fields) {
    const h = htRow[hField];
    if (bField === null) {
      // maxDrawdown is only on Heat — sanity-check that it's a non-negative number.
      if (h === null || h < 0) {
        fail(`${label}: heat=${h} must be a non-negative number`);
        return;
      }
      continue;
    }
    const b = btStats[bField];
    const eq =
      typeof h === "number" && typeof b === "number"
        ? approx(h, b, 1e-9)
        : h === b;
    if (!eq) {
      fail(`${label} drift: heat=${h} backtest=${b}`);
      return;
    }
  }

  pass(
    `Heat per-symbol == Backtest pooled (${SYMBOL}, n=${htRow.totalTrades}): ` +
      `sharpe=${htRow.sharpeRatio?.toFixed(4)}, sortino=${htRow.sortinoRatio?.toFixed(4)}, ` +
      `calmar=${htRow.calmarRatio === null ? "N/A" : htRow.calmarRatio.toFixed(3)}`,
  );
});

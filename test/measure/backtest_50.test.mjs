import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_50.json" with { type: "json" };
import {
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "./_measure_helpers.mjs";

// Heat avgPeakPnl / avgFallPnl shift after buffer overflow.
// 100 signals with extreme intra-trade behavior (peak=+10%, fall=-5%) then
// 250 quiet signals (peak=+0.5%, fall=-0.2%). After trim only the quiet
// signals survive → avgPeak ≈ +0.5, avgFall ≈ -0.2.
//
// The "extreme historical risk profile" is forgotten. Users looking at the
// CURRENT avgFallPnl would conclude the strategy is mild, missing that it
// had +10/-5% swings in its past.

test("backtest_50.json: Heat avgPeakPnl/avgFallPnl reflect ONLY surviving 250 signals", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);

  const row = stats.symbols.find((s) => s.symbol === "HEAT-PEAKFALL-TRIM");
  if (!row) {
    fail(`HEAT-PEAKFALL-TRIM row missing`);
    return;
  }

  if (row.totalTrades !== 250) {
    fail(`totalTrades must be 250 after trim, got ${row.totalTrades}`);
    return;
  }
  if (row.avgPeakPnl === null) {
    fail(`avgPeakPnl must be computed, got null`);
    return;
  }
  if (row.avgFallPnl === null) {
    fail(`avgFallPnl must be computed, got null`);
    return;
  }
  // The surviving 250 all have peak=+0.5, fall=-0.2.
  if (!approx(row.avgPeakPnl, 0.5, 1e-9)) {
    fail(`avgPeakPnl must be +0.5 (from quiet survivors only), got ${row.avgPeakPnl}. ` +
      `Mixed value would indicate loud signals (peak=+10) weren't fully evicted.`);
    return;
  }
  if (!approx(row.avgFallPnl, -0.2, 1e-9)) {
    fail(`avgFallPnl must be -0.2 (from quiet survivors only), got ${row.avgFallPnl}. ` +
      `If closer to -1, the loud fall=-5 batch is partially retained.`);
    return;
  }
  pass(
    `Heat peak/fall shift verified: ` +
    `avgPeak=${row.avgPeakPnl.toFixed(3)} (loud +10 forgotten), ` +
    `avgFall=${row.avgFallPnl.toFixed(3)} (loud -5 forgotten)`,
  );
});

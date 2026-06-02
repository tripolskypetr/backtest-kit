import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_53.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "./_measure_helpers.mjs";

// Sliding window. Initial 350 signals of +0.5%, then 100 distinctive signals
// of -0.4%. Total fed = 450.
//
// After all ticks: buffer holds NEWEST 250 = (100 losses + 150 of the wins).
// The OLDEST 200 wins have been EVICTED by the sliding window.
//
// Service must reflect that mix:
//   totalSignals = 250
//   winCount = 150
//   lossCount = 100
//   avgPnl = (150 × 0.5 + 100 × (-0.4)) / 250 = (75 - 40) / 250 = 0.14
//
// Locks in that the cap is a SLIDING WINDOW, not a one-shot first-fill cap.
// The buffer keeps shifting as new ticks arrive.

const POOL = "POOL-B53";

test("backtest_53.json: buffer is sliding window — late losses push out early wins (Backtest)", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row, { symbolOverride: POOL }));
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, true);

  if (stats.totalSignals !== 250) {
    fail(`totalSignals must be 250 (cap), got ${stats.totalSignals}`);
    return;
  }
  // Sliding window: of the 350 original wins, only the last 150 survive.
  // The 100 losses (newest by arrival) all survive.
  if (stats.winCount !== 150) {
    fail(`winCount must be 150 (200 oldest wins evicted), got ${stats.winCount}. ` +
      `If 250, the cap is not a sliding window — losses didn't actually push wins out.`);
    return;
  }
  if (stats.lossCount !== 100) {
    fail(`lossCount must be 100 (all losses retained, they're the newest), got ${stats.lossCount}`);
    return;
  }
  // avgPnl
  const expectedAvg = (150 * 0.5 + 100 * -0.4) / 250; // 0.14
  if (!approx(stats.avgPnl, expectedAvg, 1e-9)) {
    fail(`avgPnl must be ${expectedAvg}, got ${stats.avgPnl}`);
    return;
  }
  pass(`Sliding window verified: 450 fed → 150 wins + 100 losses retained, 200 old wins evicted, avgPnl=${stats.avgPnl.toFixed(3)}`);
});

test("backtest_53.json: same sliding window behaviour in Live", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });

  for (const row of signals) {
    await svc.tick({ ...toClosedTick(row, { symbolOverride: POOL }), backtest: false });
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, false);

  if (stats.totalClosed !== 250) { fail(`totalClosed must be 250, got ${stats.totalClosed}`); return; }
  if (stats.winCount !== 150) { fail(`Live winCount must be 150, got ${stats.winCount}`); return; }
  if (stats.lossCount !== 100) { fail(`Live lossCount must be 100, got ${stats.lossCount}`); return; }
  pass(`Live sliding window verified: 150 wins / 100 losses`);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_47.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "../utils/_measure_helpers.mjs";

// Historical DRAWDOWN DISAPPEARS after buffer rolls past it.
// 280 signals: 5 wins, 25 losses (DD ~22%), then 250 steady wins.
// After trim, the 30 early signals (loss episode) are evicted.
// Storage holds only the 250 steady wins → equity monotonic up → maxDD = 0
// → recoveryFactor = null (DD ≤ 0).
//
// This is a DOCUMENTED CAVEAT, not a bug. The service has no running
// max-drawdown state — everything is recomputed from in-buffer signals on
// each getData() call. Test fixes the post-trim behaviour.

const POOL = "POOL-B47";

const assertEarlyDdLost = (stats, countField) => {
  if (stats[countField] !== 250) {
    return `${countField} must be 250 after trim, got ${stats[countField]}`;
  }
  if (stats.winCount !== 250) return `winCount must be 250 (only steady wins remain), got ${stats.winCount}`;
  if (stats.lossCount !== 0) {
    return `lossCount must be 0 — losses are OLDEST and must be evicted, got ${stats.lossCount}`;
  }
  if (!approx(stats.avgPnl, 0.1, 1e-9)) {
    return `avgPnl must be 0.1 (from steady wins), got ${stats.avgPnl}`;
  }
  // The crux: recoveryFactor null because post-trim equity is monotonic up.
  if (stats.recoveryFactor !== null) {
    return `recoveryFactor must be null (post-trim equity strictly up, DD ≤ 0), got ${stats.recoveryFactor}. ` +
      `Historical DD has been evicted — service can't see it.`;
  }
  if (stats.sortinoRatio !== null) {
    return `sortinoRatio must be null (no negative returns in post-trim window), got ${stats.sortinoRatio}`;
  }
  return null;
};

test("backtest_47.json: early catastrophic DD disappears after buffer rolls past it (Backtest)", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) {
    await svc.tick(toClosedTick(row, { symbolOverride: POOL }));
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, true);
  const err = assertEarlyDdLost(stats, "totalSignals");
  if (err) { fail(err); return; }
  pass(`Backtest early-DD-lost caveat verified (280→${stats.totalSignals}, recovery=null)`);
});

test("backtest_47.json: same caveat in Live", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });
  for (const row of signals) {
    await svc.tick({ ...toClosedTick(row, { symbolOverride: POOL }), backtest: false });
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, false);
  const err = assertEarlyDdLost(stats, "totalClosed");
  if (err) { fail(err); return; }
  pass(`Live early-DD-lost caveat verified (280→${stats.totalClosed}, recovery=null)`);
});

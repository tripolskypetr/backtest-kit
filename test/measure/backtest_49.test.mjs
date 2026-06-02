import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_49.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Live: per-signal duration shifts to reflect surviving signals only.
//
// 100 signals with 60-min hold time, then 250 signals with 1-min hold time.
// LiveMarkdownService.addClosedEvent stores `duration = Math.round((
// closeTimestamp - pendingAt) / 60000)` on each TickEvent.
//
// After trim, only the 1-min-hold signals survive. Their durations in the
// event list must all be 1 (not the historical 60). No running aggregate of
// evicted signals is kept.
//
// We can't read avgDuration directly from getData (Live doesn't expose it
// on the statistical model), but we CAN inspect the underlying eventList
// shape returned in getData. Each closed event carries `duration`. Verify
// the mix.

const POOL = "POOL-B49";

test("backtest_49.json: Live durations in event list reflect surviving signals only (60-min holds evicted)", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });

  for (const row of signals) {
    await svc.tick({ ...toClosedTick(row, { symbolOverride: POOL }), backtest: false });
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, false);

  if (stats.totalClosed !== 250) {
    fail(`totalClosed must be 250 after trim, got ${stats.totalClosed}`);
    return;
  }

  // Inspect eventList — every closed event must carry duration ≈ 1 min,
  // NEVER 60. If any 60-min event survives, trim is wrong.
  const closedEvents = stats.eventList.filter((e) => e.action === "closed");
  if (closedEvents.length !== 250) {
    fail(`closedEvents must be 250, got ${closedEvents.length}`);
    return;
  }
  // Each TickEvent.duration comes from Math.round((closeTimestamp - pendingAt) / 60000)
  // → 1 for 1-min, 60 for 60-min.
  for (const e of closedEvents) {
    if (e.duration !== 1) {
      fail(`every surviving closed event must have duration=1 (1-min hold), found duration=${e.duration} (id=${e.signalId}). ` +
        `If any event has duration=60, the 60-min batch wasn't fully evicted.`);
      return;
    }
  }
  pass(`Live duration shift verified: all ${closedEvents.length} surviving events have duration=1 (60-min batch fully evicted)`);
});

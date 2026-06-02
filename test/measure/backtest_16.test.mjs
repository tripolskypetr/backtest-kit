import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_16.json" with { type: "json" };
import { toClosedTick, STRATEGY, EXCHANGE, FRAME } from "../utils/_measure_helpers.mjs";

// Edge case: one closed event with corrupted closeTimestamp.
// Live's validClosed filter requires `typeof e.timestamp === "number" &&
// e.timestamp > 0`, so the event with closeTimestamp=0 is dropped at
// aggregation time. (The fixture's "bad" row carries a sentinel id="b16-bad"
// so the test can identify and corrupt it on the way in.)
// Bug history: validClosed in getData is the defensive line against corrupted
// persisted state; this test locks in that totalClosed and avgPnl come from
// the filtered set and never from the raw input.

const POOL = "POOL-B16";

test("backtest_16.json: corrupted closeTimestamp — validClosed filter drops it, totalClosed=11", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();

  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });

  // The fixture has 12 rows; one carries id="b16-bad" which we corrupt on the
  // way in by zeroing closeTimestamp. (Editing the JSON directly would leave a
  // row with `pnl: undefined` which the service does NOT defend against at
  // tick-time — that's a separate hardening question. This test verifies the
  // documented defensive line: validClosed in getData.)
  for (const row of signals) {
    const tick = toClosedTick(row, { symbolOverride: POOL, backtest: false });
    if (row.id === "b16-bad") {
      tick.closeTimestamp = 0;
    }
    await svc.tick(tick);
  }

  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, false);

  if (stats.totalClosed !== 11) {
    fail(`totalClosed must be 11 (12 inputs - 1 corrupted closeTimestamp), got ${stats.totalClosed}`);
    return;
  }
  if (stats.sharpeRatio === null) {
    fail(`sharpeRatio must be computed (n=11), got null`);
    return;
  }
  // Reference avgPnl is over the 11 non-corrupted rows.
  const validPnls = signals.filter((r) => r.id !== "b16-bad").map((r) => r.pnl.pnlPercentage);
  const expectedAvg = validPnls.reduce((a, b) => a + b, 0) / validPnls.length;
  if (Math.abs(stats.avgPnl - expectedAvg) > 1e-9) {
    fail(`avgPnl mismatch: service=${stats.avgPnl} expected (over filtered set)=${expectedAvg}`);
    return;
  }

  pass(`Live corrupted-timestamp validClosed filter verified (totalClosed=${stats.totalClosed}, avgPnl from filtered set)`);
});

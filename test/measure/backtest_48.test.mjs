import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_48.json" with { type: "json" };
import {
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "./_measure_helpers.mjs";

// Heat per-symbol buffer trim direction.
// 300 signals on one symbol: 50 losses (-5%) THEN 250 wins (+0.4%).
// Cap CC_MAX_HEATMAP_MARKDOWN_ROWS = 250 → 50 oldest (losses) evicted.
// Heat per-symbol row must show only the 250 surviving wins.
//
// Locks in trim direction for Heat (independent of Backtest/Live which were
// covered in backtest_44.test.mjs).

test("backtest_48.json: Heat per-symbol trim drops OLDEST 50 losses, keeps 250 wins", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);

  const row = stats.symbols.find((s) => s.symbol === "HEAT-TRIM-DIR");
  if (!row) {
    fail(`HEAT-TRIM-DIR row missing`);
    return;
  }

  if (row.totalTrades !== 250) {
    fail(`totalTrades must be 250 (trimmed from 300), got ${row.totalTrades}`);
    return;
  }
  if (row.winCount !== 250) {
    fail(`winCount must be 250 — all surviving signals are wins, got ${row.winCount}`);
    return;
  }
  if (row.lossCount !== 0) {
    fail(`lossCount must be 0 — the 50 losses are OLDEST and must be evicted, got ${row.lossCount}. ` +
      `If non-zero, trim direction reversed in Heat (oldest kept instead of newest).`);
    return;
  }
  if (!approx(row.avgPnl, 0.4, 1e-9)) {
    fail(`avgPnl must be +0.4 (from surviving wins), got ${row.avgPnl}. ` +
      `Negative avgPnl would mean trim direction reversed.`);
    return;
  }
  pass(`Heat trim direction verified: 50 oldest losses evicted, 250 newest wins kept (avgPnl=${row.avgPnl.toFixed(3)})`);
});

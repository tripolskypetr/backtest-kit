import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_44.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "./_measure_helpers.mjs";

// Buffer overflow, pnl consistency.
// 350 signals: 100 catastrophic losses (-5%) then 250 small wins (+0.4%).
// CC_MAX_BACKTEST_MARKDOWN_ROWS = 250 → service trims to newest 250 (the wins).
// The 100 losses are EVICTED.
//
// Service must see only wins. This locks in trim direction (oldest dropped).
// Note: we can't use runBacktestPool here because its reference math runs
// over the full 350-row input and would mismatch the post-trim state.

const POOL = "POOL-B44";

const assertTrim = (stats, countField) => {
  const n = stats[countField];
  if (n !== 250) {
    return `${countField} must be 250 after trim from 350 input, got ${n}`;
  }
  if (stats.winCount !== 250) return `winCount must be 250 (only wins remain), got ${stats.winCount}`;
  if (stats.lossCount !== 0) {
    return `lossCount must be 0 — losses are OLDEST and must be evicted, got ${stats.lossCount}. ` +
      `If non-zero, trim direction reversed (oldest kept instead of newest).`;
  }
  if (!approx(stats.avgPnl, 0.4, 1e-9)) {
    return `avgPnl must be +0.4 from kept wins, got ${stats.avgPnl}. ` +
      `Negative avgPnl would mean trim direction reversed.`;
  }
  if (!approx(stats.totalPnl, 100, 1e-6)) {
    return `totalPnl must be +100 (250 × 0.4), got ${stats.totalPnl}`;
  }
  return null;
};

test("backtest_44.json: buffer overflow — newest 250 kept, oldest 100 evicted (Backtest)", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) {
    await svc.tick(toClosedTick(row, { symbolOverride: POOL }));
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, true);
  const err = assertTrim(stats, "totalSignals");
  if (err) { fail(err); return; }
  pass(`Backtest trim verified: 350 fed → ${stats.totalSignals} retained, all wins, totalPnl=${stats.totalPnl.toFixed(2)}`);
});

test("backtest_44.json: buffer overflow — same trim direction in Live", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });
  for (const row of signals) {
    await svc.tick({ ...toClosedTick(row, { symbolOverride: POOL }), backtest: false });
  }
  const stats = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, false);
  const err = assertTrim(stats, "totalClosed");
  if (err) { fail(err); return; }
  pass(`Live trim verified: 350 fed → ${stats.totalClosed} retained, totalPnl=${stats.totalPnl.toFixed(2)}`);
});

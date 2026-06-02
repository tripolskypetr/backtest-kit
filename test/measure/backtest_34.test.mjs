import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_34.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "../utils/_measure_helpers.mjs";

// Edge case: one symbol "DUAL-STRAT" with two strategies A and B (12 trades each).
//
// Backtest service keys storage by (symbol, strategyName, exchange, frame,
// backtest). The two strategies must remain in SEPARATE storages:
//   getData(SYM, "strat-A", ...) ≠ getData(SYM, "strat-B", ...)
//
// Heat service keys storage by (exchange, frame, backtest) — strategy
// agnostic. It must MERGE the two strategies into one DUAL-STRAT row with
// 24 trades.
//
// Pool through Backtest under each strategy separately, plus through Heat
// once. Verifies that the two service contracts are honoured.

const EXCHANGE_LOCAL = EXCHANGE;
const FRAME_LOCAL = FRAME;
const SYM = "DUAL-STRAT";

const aSigs = signals.filter((s) => s.strategyName === "strat-A");
const bSigs = signals.filter((s) => s.strategyName === "strat-B");

test("backtest_34.json: same symbol + two strategies — Backtest splits, Heat merges", async ({ pass, fail }) => {
  const bt = lib.backtestMarkdownService;
  const ht = lib.heatMarkdownService;
  bt.subscribe();
  ht.subscribe();

  await bt.clear({ symbol: SYM, strategyName: "strat-A", exchangeName: EXCHANGE_LOCAL, frameName: FRAME_LOCAL, backtest: true });
  await bt.clear({ symbol: SYM, strategyName: "strat-B", exchangeName: EXCHANGE_LOCAL, frameName: FRAME_LOCAL, backtest: true });
  await ht.clear({ exchangeName: EXCHANGE_LOCAL, frameName: FRAME_LOCAL, backtest: true });

  for (const row of signals) {
    // toClosedTick reads row.strategyName but Backtest tick is routed by
    // data.strategyName — we must construct ticks that carry the row's
    // strategyName. Use a helper that overrides strategyName too.
    const tick = {
      ...toClosedTick(row),
      strategyName: row.strategyName,
    };
    await bt.tick(tick);
    await ht.tick(tick);
  }

  const statsA = await bt.getData(SYM, "strat-A", EXCHANGE_LOCAL, FRAME_LOCAL, true);
  const statsB = await bt.getData(SYM, "strat-B", EXCHANGE_LOCAL, FRAME_LOCAL, true);
  const statsH = await ht.getData(EXCHANGE_LOCAL, FRAME_LOCAL, true);

  // Backtest: separate storages
  if (statsA.totalSignals !== 12) {
    fail(`Backtest strat-A.totalSignals must be 12 (no leak from strat-B), got ${statsA.totalSignals}`);
    return;
  }
  if (statsB.totalSignals !== 12) {
    fail(`Backtest strat-B.totalSignals must be 12 (no leak from strat-A), got ${statsB.totalSignals}`);
    return;
  }
  // avgPnl per strategy must match the per-strategy reference (not the combined mean)
  const refAvgA = aSigs.reduce((s, r) => s + r.pnl.pnlPercentage, 0) / aSigs.length;
  const refAvgB = bSigs.reduce((s, r) => s + r.pnl.pnlPercentage, 0) / bSigs.length;
  if (!approx(statsA.avgPnl, refAvgA, 1e-9)) {
    fail(`statsA.avgPnl drift: service=${statsA.avgPnl} ref=${refAvgA}`);
    return;
  }
  if (!approx(statsB.avgPnl, refAvgB, 1e-9)) {
    fail(`statsB.avgPnl drift: service=${statsB.avgPnl} ref=${refAvgB}`);
    return;
  }

  // Heat: merged storage for the symbol
  const heatRow = statsH.symbols.find((s) => s.symbol === SYM);
  if (!heatRow) {
    fail(`Heat row for ${SYM} not found`);
    return;
  }
  if (heatRow.totalTrades !== 24) {
    fail(`Heat DUAL-STRAT.totalTrades must be 24 (both strategies merged), got ${heatRow.totalTrades}`);
    return;
  }
  const refAvgCombined = signals.reduce((s, r) => s + r.pnl.pnlPercentage, 0) / signals.length;
  if (!approx(heatRow.avgPnl, refAvgCombined, 1e-9)) {
    fail(`Heat merged avgPnl drift: service=${heatRow.avgPnl} ref=${refAvgCombined}`);
    return;
  }
  pass(
    `Split/Merge contract verified: Backtest A(n=${statsA.totalSignals}, avg=${statsA.avgPnl.toFixed(3)}) B(n=${statsB.totalSignals}, avg=${statsB.avgPnl.toFixed(3)}), ` +
    `Heat merged (n=${heatRow.totalTrades}, avg=${heatRow.avgPnl.toFixed(3)})`,
  );
});

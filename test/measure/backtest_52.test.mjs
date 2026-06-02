import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_52.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Buffer overflow + idempotency. 350 signals → trim to 250. Two consecutive
// getData() calls without any new ticks in between must produce identical
// results. Locks in: getData has no side effects on storage, no
// re-trimming, no random ordering.

const POOL = "POOL-B52";

const numericFields = [
  "totalSignals", "winCount", "lossCount", "winRate", "avgPnl", "totalPnl",
  "stdDev", "sharpeRatio", "annualizedSharpeRatio", "certaintyRatio",
  "expectedYearlyReturns", "avgPeakPnl", "avgFallPnl", "sortinoRatio",
  "calmarRatio", "recoveryFactor",
];

test("backtest_52.json: getData is idempotent — two calls produce identical stats", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: POOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row, { symbolOverride: POOL }));
  }
  const s1 = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, true);
  const s2 = await svc.getData(POOL, STRATEGY, EXCHANGE, FRAME, true);

  if (s1.totalSignals !== 250) {
    fail(`first getData: totalSignals must be 250 (after trim), got ${s1.totalSignals}`);
    return;
  }

  for (const f of numericFields) {
    const v1 = s1[f];
    const v2 = s2[f];
    if (v1 === null && v2 === null) continue;
    if (v1 !== v2) {
      fail(`${f} drift between getData calls: first=${v1} second=${v2}. ` +
        `getData has side effects.`);
      return;
    }
  }
  // signalList length consistency
  if (s1.signalList.length !== s2.signalList.length) {
    fail(`signalList length changed: ${s1.signalList.length} → ${s2.signalList.length}`);
    return;
  }
  pass(`getData idempotent: 16 fields + signalList length match across consecutive calls`);
});

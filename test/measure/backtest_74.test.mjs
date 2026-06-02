import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_74.json" with { type: "json" };
import {
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Float-artifact target: Heat profitFactor with epsilon-magnitude losses.
// 14 wins +0.5%, 1 loss -1e-15 (artifact).
//   sumWins = 7, sumLosses ≈ 1e-15
//   Without guard: profitFactor = 7 / 1e-15 ≈ 7e15 (spurious astronomical)
//   With STDDEV_EPSILON guard on sumLosses: profitFactor = null.
//
// Locks in: float-artifact losses are NOT counted in profitFactor denominator.

test("backtest_74.json: Heat profitFactor with artifact losses → null, not 7e15", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);

  const row = stats.symbols.find((s) => s.symbol === "ART-PROFIT-FACTOR");
  if (!row) {
    fail(`ART-PROFIT-FACTOR row missing`);
    return;
  }

  if (row.totalTrades !== 15) {
    fail(`totalTrades must be 15, got ${row.totalTrades}`);
    return;
  }
  if (row.winCount !== 14) {
    fail(`winCount must be 14, got ${row.winCount}`);
    return;
  }
  if (row.lossCount !== 1) {
    fail(`lossCount must be 1, got ${row.lossCount}`);
    return;
  }

  // The key assertion: profitFactor must be null, NOT astronomical.
  if (row.profitFactor !== null) {
    fail(`profitFactor must be null (sumLosses ≈ 1e-15 below STDDEV_EPSILON), got ${row.profitFactor}. ` +
      `If non-null, the epsilon guard on sumLosses regressed.`);
    return;
  }

  pass(`Heat profitFactor correctly null with float-artifact losses (14W/1L, sumLosses ≈ 1e-15)`);
});

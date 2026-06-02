import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_26.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "../utils/_measure_helpers.mjs";

// Sequence sensitivity: two symbols hold the SAME multiset of returns in two
// different orders.
//
//  - SEQ-FORWARD: positives clustered first, negatives clustered last
//  - SEQ-INTERLEAVED: strictly alternating +/-
//
// Order-INDEPENDENT (commutative under aggregation):
//   avgPnl, totalPnl, winCount, lossCount, winRate, stdDev, sharpeRatio,
//   sortinoRatio, equityFinal (compound is commutative under multiplication)
//
// Order-DEPENDENT:
//   equityMaxDrawdown, maxWinStreak, maxLossStreak, recoveryFactor (uses DD)
//
// The Heat per-symbol view exposes maxDrawdown directly, so we read it via
// Heat. Recovery & streaks (when service exposes them) are checked too.

const SAME_FIELDS = ["totalPnl", "avgPnl", "stdDev", "sharpeRatio", "sortinoRatio"];

test("backtest_26.json: identical multiset in two orders — order-independent metrics match, order-dependent diverge", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);

  const fwd = stats.symbols.find((s) => s.symbol === "SEQ-FORWARD");
  const ilv = stats.symbols.find((s) => s.symbol === "SEQ-INTERLEAVED");
  if (!fwd || !ilv) {
    fail(`expected both SEQ-FORWARD and SEQ-INTERLEAVED, got ${stats.symbols.map((s) => s.symbol).join(",")}`);
    return;
  }

  if (fwd.totalTrades !== ilv.totalTrades) {
    fail(`totalTrades drift: fwd=${fwd.totalTrades} ilv=${ilv.totalTrades}`);
    return;
  }
  if (fwd.winCount !== ilv.winCount || fwd.lossCount !== ilv.lossCount) {
    fail(`winCount/lossCount drift: fwd=(${fwd.winCount},${fwd.lossCount}) ilv=(${ilv.winCount},${ilv.lossCount})`);
    return;
  }

  // Order-independent fields must match exactly.
  for (const f of SAME_FIELDS) {
    if (!approx(fwd[f], ilv[f], 1e-9)) {
      fail(`${f} must be identical across orderings (commutative aggregate): fwd=${fwd[f]} ilv=${ilv[f]}`);
      return;
    }
  }

  // Order-dependent: maxDrawdown MUST differ.
  if (approx(fwd.maxDrawdown, ilv.maxDrawdown, 1e-3)) {
    fail(`maxDrawdown must differ between orderings (fwd clusters losses → deeper DD; ilv interleaves → shallow DD), got fwd=${fwd.maxDrawdown} ilv=${ilv.maxDrawdown}`);
    return;
  }
  // Specifically forward must have DEEPER drawdown.
  if (fwd.maxDrawdown <= ilv.maxDrawdown) {
    fail(`forward order must produce deeper maxDD than interleaved, got fwd=${fwd.maxDrawdown} ilv=${ilv.maxDrawdown}`);
    return;
  }

  // Streaks must differ.
  if (fwd.maxWinStreak === ilv.maxWinStreak && fwd.maxLossStreak === ilv.maxLossStreak) {
    fail(`streaks must differ: fwd W=${fwd.maxWinStreak} L=${fwd.maxLossStreak} vs ilv W=${ilv.maxWinStreak} L=${ilv.maxLossStreak}`);
    return;
  }

  pass(
    `Order sensitivity verified: same multiset, ` +
    `same totalPnl=${fwd.totalPnl.toFixed(2)}, ` +
    `different maxDD (fwd=${fwd.maxDrawdown.toFixed(2)} vs ilv=${ilv.maxDrawdown.toFixed(2)}), ` +
    `different streaks (fwd W${fwd.maxWinStreak}/L${fwd.maxLossStreak} vs ilv W${ilv.maxWinStreak}/L${ilv.maxLossStreak})`,
  );
});

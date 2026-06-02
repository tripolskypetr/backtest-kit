import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_29.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Streak boundary case. Sequence: WWWWWWW LLLL WWW (14 signals).
// Expected: maxWinStreak=7, maxLossStreak=4.
//
// Specifically tests:
//  - the FIRST big run (7) is found, not just whichever runs gets seen last
//  - a SHORTER trailing run (3 W) doesn't somehow extend the leading 7
//  - the loss streak (4) is captured correctly between the two win runs
//
// Bug patterns this guards against:
//  - cumulative counter never reset → would give maxWinStreak = 10 (7+3)
//  - off-by-one in reset → would give maxWinStreak = 6 or 8
//  - tracking only the last streak → would give 3 (the trailing W)

test("backtest_29.json: streak detection finds longest run, not last or cumulative", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);

  const row = stats.symbols.find((s) => s.symbol === "SEQ-STREAKS");
  if (!row) {
    fail(`expected SEQ-STREAKS row, got ${stats.symbols.map((s) => s.symbol).join(",")}`);
    return;
  }

  if (row.totalTrades !== 14) return fail(`totalTrades must be 14, got ${row.totalTrades}`);
  if (row.winCount !== 10) return fail(`winCount must be 10 (7+3), got ${row.winCount}`);
  if (row.lossCount !== 4) return fail(`lossCount must be 4, got ${row.lossCount}`);

  if (row.maxWinStreak !== 7) {
    // Guess at the likely bug from the wrong value.
    if (row.maxWinStreak === 10) return fail(`maxWinStreak=10 — counter not reset on losses (regression)`);
    if (row.maxWinStreak === 3) return fail(`maxWinStreak=3 — tracks only last streak, not max (regression)`);
    return fail(`maxWinStreak must be 7 (leading run), got ${row.maxWinStreak}`);
  }
  if (row.maxLossStreak !== 4) {
    return fail(`maxLossStreak must be 4, got ${row.maxLossStreak}`);
  }

  pass(`Streak boundary verified: max W=7 (leading), L=4 (middle), trailing W=3 does NOT extend the leading W7`);
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_28.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "./_measure_helpers.mjs";

// Two extreme arrangements of the SAME multiset (6 wins @ +2, 6 losses @ -1.5):
//
//  - SEQ-WWWLLL: WWWWWW LLLLLL → maxWinStreak=6, maxLossStreak=6, deep DD
//  - SEQ-ALTERNATING: WLWLWLWLWLWL → maxWinStreak=1, maxLossStreak=1, shallow DD
//
// Aggregate (order-independent) fields must match. Streak and DD diverge in
// the documented direction.

test("backtest_28.json: WWWLLL vs alternating — aggregates equal, streaks max out, DD diverges", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);

  const block = stats.symbols.find((s) => s.symbol === "SEQ-WWWLLL");
  const alt = stats.symbols.find((s) => s.symbol === "SEQ-ALTERNATING");
  if (!block || !alt) {
    fail(`expected both SEQ-WWWLLL and SEQ-ALTERNATING, got ${stats.symbols.map((s) => s.symbol).join(",")}`);
    return;
  }

  // Order-independent aggregates.
  if (block.totalTrades !== 12 || alt.totalTrades !== 12) {
    fail(`totalTrades must be 12 for both, got block=${block.totalTrades} alt=${alt.totalTrades}`);
    return;
  }
  if (block.winCount !== 6 || alt.winCount !== 6) {
    fail(`winCount must be 6 for both, got block=${block.winCount} alt=${alt.winCount}`);
    return;
  }
  if (block.lossCount !== 6 || alt.lossCount !== 6) {
    fail(`lossCount must be 6 for both, got block=${block.lossCount} alt=${alt.lossCount}`);
    return;
  }
  if (!approx(block.avgPnl, alt.avgPnl, 1e-9)) {
    fail(`avgPnl mismatch: block=${block.avgPnl} alt=${alt.avgPnl}`);
    return;
  }
  if (!approx(block.totalPnl, alt.totalPnl, 1e-9)) {
    fail(`totalPnl mismatch: block=${block.totalPnl} alt=${alt.totalPnl}`);
    return;
  }

  // Order-dependent. Streaks must hit their maxima.
  if (block.maxWinStreak !== 6) return fail(`block maxWinStreak must be 6, got ${block.maxWinStreak}`);
  if (block.maxLossStreak !== 6) return fail(`block maxLossStreak must be 6, got ${block.maxLossStreak}`);
  if (alt.maxWinStreak !== 1) return fail(`alt maxWinStreak must be 1, got ${alt.maxWinStreak}`);
  if (alt.maxLossStreak !== 1) return fail(`alt maxLossStreak must be 1, got ${alt.maxLossStreak}`);

  // DD: block must be SIGNIFICANTLY deeper than alt.
  if (block.maxDrawdown <= alt.maxDrawdown) {
    fail(`block (clustered losses) must have deeper DD than alt (interleaved), got block=${block.maxDrawdown} alt=${alt.maxDrawdown}`);
    return;
  }
  if (block.maxDrawdown / alt.maxDrawdown < 2) {
    fail(`block DD should be at least 2× alt DD (clustering effect), got ratio=${block.maxDrawdown / alt.maxDrawdown}`);
    return;
  }

  pass(
    `Sequence-driven divergence verified: ` +
    `block streaks W6/L6 DD=${block.maxDrawdown.toFixed(2)}, ` +
    `alt streaks W1/L1 DD=${alt.maxDrawdown.toFixed(2)} ` +
    `(ratio ${(block.maxDrawdown / alt.maxDrawdown).toFixed(1)}×)`,
  );
});

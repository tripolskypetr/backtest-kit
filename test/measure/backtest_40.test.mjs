import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_40.json" with { type: "json" };
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
  approx,
} from "./_measure_helpers.mjs";

// Edge case: mirror image. Two symbols with the SAME multiset, the second
// half of one is the EXACT reverse of the second half of the other.
//
//  - SYM-FORWARD:  [WLWLWL] + [WLWLWL]    (same block twice)
//  - SYM-MIRROR:   [WLWLWL] + [LWLWLW]    (block + reversed block)
//
// All 12 returns are the same multiset → identical sums, identical equityFinal
// (commutative). BUT during the SECOND half, the running equity peak is in
// a different place, so maxDD diverges. The mirrored block hits a deeper DD
// because its leading L falls from a high peak.
//
// Subtle: a programmer might assume "mirror = symmetric = equivalent". This
// test demonstrates that's WRONG for equity drawdown.

test("backtest_40.json: mirror image — identical equityFinal, divergent maxDD (asymmetry of drawdown)", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);
  const fwd = stats.symbols.find((s) => s.symbol === "SYM-FORWARD");
  const mir = stats.symbols.find((s) => s.symbol === "SYM-MIRROR");
  if (!fwd || !mir) {
    fail(`expected both symbols, got ${stats.symbols.map((s) => s.symbol).join(",")}`);
    return;
  }

  // Multiset invariants: same totalPnl, avgPnl, winCount, lossCount.
  if (fwd.totalTrades !== mir.totalTrades) return fail(`totalTrades drift: fwd=${fwd.totalTrades} mir=${mir.totalTrades}`);
  if (!approx(fwd.totalPnl, mir.totalPnl, 1e-9)) return fail(`totalPnl drift: fwd=${fwd.totalPnl} mir=${mir.totalPnl}`);
  if (!approx(fwd.avgPnl, mir.avgPnl, 1e-9)) return fail(`avgPnl drift: fwd=${fwd.avgPnl} mir=${mir.avgPnl}`);
  if (fwd.winCount !== mir.winCount) return fail(`winCount drift: fwd=${fwd.winCount} mir=${mir.winCount}`);
  if (fwd.lossCount !== mir.lossCount) return fail(`lossCount drift: fwd=${fwd.lossCount} mir=${mir.lossCount}`);

  // Asymmetry of drawdown: mirror's maxDD MUST be deeper than forward's.
  // Forward: 12 alternating WLWLWL × 2 → maxDD = single L size ≈ 0.8%.
  // Mirror: second half starts with L from the highest equity → 2 consecutive
  // L impulses possible → maxDD ≈ 1.59%.
  if (mir.maxDrawdown <= fwd.maxDrawdown) {
    fail(`mirror DD must be DEEPER than forward (asymmetry of drawdown): fwd=${fwd.maxDrawdown} mir=${mir.maxDrawdown}`);
    return;
  }
  if (mir.maxDrawdown / fwd.maxDrawdown < 1.5) {
    fail(`mirror DD should be at least 1.5× forward DD, got ratio=${mir.maxDrawdown / fwd.maxDrawdown}`);
    return;
  }

  // Streak asymmetry: forward = WLWLWL × 2 → maxLossStreak = 1.
  // Mirror's second half ends in L W L W L W → final L streak still 1.
  // But middle has L W L W L W L which gives a 1-streak ÷ adjacent... actually
  // mirror has L right after L from second half boundary if W ends first
  // half. First half ends with W (or L?) — first half is WLWLWL → ends with L.
  // Mirror second half is LWLWLW → starts with L. So we have ..L L W L W L W
  // → consecutive LL across the boundary → maxLossStreak = 2.
  if (mir.maxLossStreak !== 2) {
    fail(`mirror maxLossStreak must be 2 (boundary creates LL), got ${mir.maxLossStreak}`);
    return;
  }
  if (fwd.maxLossStreak !== 1) {
    fail(`forward maxLossStreak must be 1 (strictly alternating), got ${fwd.maxLossStreak}`);
    return;
  }

  pass(
    `Mirror asymmetry verified: ` +
    `same eqFinal multiset, fwd DD=${fwd.maxDrawdown.toFixed(3)} vs mir DD=${mir.maxDrawdown.toFixed(3)} (${(mir.maxDrawdown / fwd.maxDrawdown).toFixed(2)}×), ` +
    `streak L: fwd=1 vs mir=2 (boundary effect)`,
  );
});

import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import { STRATEGY, EXCHANGE, FRAME, toClosedTick } from "../utils/measure_helpers.mjs";

// Heat per-symbol algorithmic metrics that the math suite (Sharpe / Sortino /
// Calmar) does NOT exercise: maxWinStreak, maxLossStreak, profitFactor,
// expectancy. Cheap to verify and easy to regress on (off-by-one in streak
// reset, denominator flip in profitFactor, etc).

const T0 = Date.UTC(2026, 0, 1);
const DAY = 24 * 3_600_000;

const makeRow = (i, pnl, symbol) => {
  const pendingAt = T0 + i * DAY;
  return {
    id: `he-${symbol}-${i}`,
    symbol,
    pendingAt,
    updatedAt: pendingAt + 4 * 3_600_000,
    priceOpen: 100,
    pnl: { pnlPercentage: pnl, priceOpen: 100, priceClose: 100 * (1 + pnl / 100), pnlCost: pnl, pnlEntries: 100 },
    peakProfit: { pnlPercentage: Math.max(pnl, 0) },
    maxDrawdown: { pnlPercentage: Math.min(pnl, 0) },
    position: "long",
    note: "",
    exchangeName: EXCHANGE,
    strategyName: STRATEGY,
    frameName: FRAME,
  };
};

const feed = async (rows) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of rows) await svc.tick(toClosedTick(row));
  return await svc.getData(EXCHANGE, FRAME, true);
};

// ---------------------------------------------------------------------------
// Test 1: maxWinStreak / maxLossStreak with break-even interruptions.
// Series: W W W L L L W L W W (BE doesn't appear here, kept simple)
// → maxWinStreak = 3 (initial WWW), maxLossStreak = 3 (LLL).
// Last 4 → W L W W: max streak there is 2 (final WW), still under 3.
// ---------------------------------------------------------------------------
test("heat: maxWinStreak and maxLossStreak count consecutive runs", async ({ pass, fail }) => {
  // 10 trades on one symbol — enough to NOT be Sharpe-gated, but streaks
  // are computed at any N.
  const pnls = [1, 1, 1, -1, -1, -1, 1, -1, 1, 1];
  const rows = pnls.map((p, i) => makeRow(i, p, "STREAK"));
  const stats = await feed(rows);
  const row = stats.symbols.find((s) => s.symbol === "STREAK");
  if (!row) return fail(`STREAK row missing`);

  if (row.maxWinStreak !== 3) return fail(`maxWinStreak must be 3, got ${row.maxWinStreak}`);
  if (row.maxLossStreak !== 3) return fail(`maxLossStreak must be 3, got ${row.maxLossStreak}`);
  pass(`Streaks verified: W=${row.maxWinStreak}, L=${row.maxLossStreak}`);
});

// ---------------------------------------------------------------------------
// Test 2: break-even trades do NOT continue a streak.
// W W BE W → maxWinStreak should NOT be 3 (break-even interrupts).
// In service code: signal.pnl.pnlPercentage === 0 hits neither > 0 nor < 0
// branch → both streaks reset implicitly to current (won't grow).
// Actually: code does `else if (< 0) { lossStreak++; winStreak = 0 }`. So
// for pnl=0 neither branch runs → winStreak stays at previous value.
// Expected behaviour: streaks DO continue past zero. We assert what the
// service actually does to lock the behaviour in.
// ---------------------------------------------------------------------------
test("heat: break-even between wins keeps the win streak alive (service convention)", async ({ pass, fail }) => {
  const pnls = [1, 1, 0, 1, 1, -1];
  const rows = pnls.map((p, i) => makeRow(i, p, "BE-STREAK"));
  const stats = await feed(rows);
  const row = stats.symbols.find((s) => s.symbol === "BE-STREAK");
  if (!row) return fail(`BE-STREAK row missing`);

  // Looking at HeatMarkdownService code: pnl === 0 falls through neither
  // branch, so winStreak (==2 before the 0) is not reset and grows to 4
  // by the trailing W W. This locks in that convention.
  if (row.maxWinStreak !== 4) {
    return fail(`maxWinStreak: break-even should not reset a win streak, expected 4, got ${row.maxWinStreak}`);
  }
  pass(`Break-even doesn't reset streak: maxWinStreak=${row.maxWinStreak}`);
});

// ---------------------------------------------------------------------------
// Test 3: profitFactor = sumWins / |sumLosses|.
// Wins: 2, 3, 5 → sum=10. Losses: -1, -4 → |sum|=5. PF = 10/5 = 2.0.
// Padding to 12 signals so the row is well-defined and stable.
// ---------------------------------------------------------------------------
test("heat: profitFactor = sumWins / |sumLosses|", async ({ pass, fail }) => {
  const pnls = [2, 3, 5, -1, -4, 1, 0, 0, 0, 0, 0, 0]; // PF on wins/losses; zeros neutral
  // Wins: 2,3,5,1 = 11. Losses: -1,-4 = 5. PF = 11/5 = 2.2.
  const rows = pnls.map((p, i) => makeRow(i, p, "PF"));
  const stats = await feed(rows);
  const row = stats.symbols.find((s) => s.symbol === "PF");
  if (!row) return fail(`PF row missing`);

  const expectedPF = (2 + 3 + 5 + 1) / (1 + 4); // 11 / 5 = 2.2
  if (row.profitFactor === null) return fail(`profitFactor must be computed, got null`);
  if (Math.abs(row.profitFactor - expectedPF) > 1e-9) {
    return fail(`profitFactor must be ${expectedPF}, got ${row.profitFactor}`);
  }
  pass(`profitFactor verified: ${row.profitFactor}`);
});

// ---------------------------------------------------------------------------
// Test 4: expectancy = winProb * avgWin + lossProb * avgLoss, with break-even
// treated as a third probability (contributes 0).
// 5 wins of +2 = avgWin 2. 3 losses of -1 = avgLoss -1. 2 break-evens.
// totalTrades = 10. winProb = 0.5, lossProb = 0.3.
// expectancy = 0.5*2 + 0.3*(-1) = 1.0 - 0.3 = 0.7.
// ---------------------------------------------------------------------------
test("heat: expectancy uses real winProb/lossProb (break-evens contribute 0)", async ({ pass, fail }) => {
  const pnls = [2, 2, 2, 2, 2, -1, -1, -1, 0, 0];
  const rows = pnls.map((p, i) => makeRow(i, p, "EXP"));
  const stats = await feed(rows);
  const row = stats.symbols.find((s) => s.symbol === "EXP");
  if (!row) return fail(`EXP row missing`);

  // winProb*avgWin + lossProb*avgLoss = 5/10*2 + 3/10*(-1) = 1.0 - 0.3 = 0.7
  const expectedEV = (5 / 10) * 2 + (3 / 10) * -1;
  if (row.expectancy === null) return fail(`expectancy must be computed, got null`);
  if (Math.abs(row.expectancy - expectedEV) > 1e-9) {
    return fail(`expectancy must be ${expectedEV} (BEs contribute 0), got ${row.expectancy}`);
  }
  pass(`expectancy verified: ${row.expectancy}`);
});

// ---------------------------------------------------------------------------
// Test 5: per-symbol recoveryFactor IS sample-size gated, like Sharpe. With
// 5 trades (< MIN_SIGNALS_FOR_RATIOS) both Sharpe AND recoveryFactor must be
// null — a Recovery Factor on a handful of trades is statistically meaningless
// and must not be surfaced while Sharpe is N/A.
// ---------------------------------------------------------------------------
test("heat: per-symbol recoveryFactor gated to null when Sharpe is gated (N<10)", async ({ pass, fail }) => {
  const pnls = [1, 1, -2, 1, 1]; // 5 trades, DD > 0, equity ends > 0
  const rows = pnls.map((p, i) => makeRow(i, p, "REC-GATED"));
  const stats = await feed(rows);
  const row = stats.symbols.find((s) => s.symbol === "REC-GATED");
  if (!row) return fail(`REC-GATED row missing`);

  if (row.sharpeRatio !== null) {
    return fail(`sharpeRatio must be gated (N=5 < 10), got ${row.sharpeRatio}`);
  }
  if (row.recoveryFactor !== null) {
    return fail(`recoveryFactor must be null (N=5 < MIN_SIGNALS_FOR_RATIOS), got ${row.recoveryFactor}`);
  }
  // maxDrawdown is still computed (it's not ratio-gated) — only the ratio is withheld.
  if (row.maxDrawdown === null || row.maxDrawdown <= 0) {
    return fail(`maxDrawdown must still be computed (>0), got ${row.maxDrawdown}`);
  }
  pass(`recoveryFactor gated to null at N=5 (maxDrawdown=${row.maxDrawdown.toFixed(3)}% still computed)`);
});

// ---------------------------------------------------------------------------
// Test 6: pooled Calmar must be ANNUALIZED (≠ Recovery). Regression for a bug
// where pooled Calmar used the compounded TOTAL return as its numerator (same
// as Recovery), making portfolioCalmarRatio === portfolioRecoveryFactor for
// every dataset. Calmar's numerator must be expectedYearlyReturns (annualized);
// only then do the two diverge.
//
// Wide spacing (≈25 days/trade over 12 trades → span ≈ 275d, tradesPerYear ≈ 16
// < 365) so the annualization gate PASSES and pooled Calmar is computed.
// ---------------------------------------------------------------------------
test("heat: pooled Calmar is annualized and distinct from Recovery (not the same number)", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const STEP = 25 * DAY; // wide spacing → span well over MIN_CALENDAR_SPAN_DAYS
  const pnls = [1, 2, -1, 1.5, 2, -0.5, 1, 1, -1.2, 2, 0.8, 1.3]; // 12 trades, DD>0
  for (let i = 0; i < pnls.length; i++) {
    const symbol = i % 2 === 0 ? "POOL-A" : "POOL-B";
    const pendingAt = T0 + i * STEP;
    await svc.tick(
      toClosedTick({
        ...makeRow(i, pnls[i], symbol),
        pendingAt,
        updatedAt: pendingAt + 4 * 3_600_000,
      }),
    );
  }

  const stats = await svc.getData(EXCHANGE, FRAME, true);

  if (stats.portfolioCalmarRatio === null) {
    return fail(`portfolioCalmarRatio must be computed (span≥14d, freq≤365), got null`);
  }
  if (stats.portfolioRecoveryFactor === null) {
    return fail(`portfolioRecoveryFactor must be computed (DD>0, not blown), got null`);
  }
  // The bug: both equal the compounded-total-return / DD. Annualized Calmar must
  // differ from the (non-annualized) Recovery for this multi-period dataset.
  if (stats.portfolioCalmarRatio === stats.portfolioRecoveryFactor) {
    return fail(
      `portfolioCalmarRatio (${stats.portfolioCalmarRatio}) must NOT equal ` +
        `portfolioRecoveryFactor (${stats.portfolioRecoveryFactor}) — Calmar regressed to total-return numerator`,
    );
  }
  pass(
    `pooled Calmar annualized & distinct: calmar=${stats.portfolioCalmarRatio.toFixed(3)}, ` +
      `recovery=${stats.portfolioRecoveryFactor.toFixed(3)}`,
  );
});

// ---------------------------------------------------------------------------
// Test 7: MARK-TO-MARKET max drawdown. Regression for a bug where the equity
// curve only stepped at trade close (realized PnL), so a trade that dipped to
// -18% intra-trade and recovered to +2% registered ZERO drawdown — understating
// DD and inflating Calmar/Recovery. The per-trade intra-trade trough
// (signal.maxDrawdown) must be applied to the equity curve.
//
// 12 trades, each closing +2% but each dipping to -18% mark-to-market. Realized
// curve is monotonically up → realized DD = 0. Mark-to-market DD must reflect
// the ~18% round-trip dip.
// ---------------------------------------------------------------------------
test("heat: maxDrawdown is mark-to-market (intra-trade dip counts, not just realized close)", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // Each trade: closes +2%, but dipped to -18% while open.
  for (let i = 0; i < 12; i++) {
    const pendingAt = T0 + i * DAY;
    await svc.tick(
      toClosedTick({
        id: `mtm-${i}`,
        symbol: "MTM",
        pendingAt,
        updatedAt: pendingAt + 4 * 3_600_000,
        priceOpen: 100,
        pnl: { pnlPercentage: 2, priceOpen: 100, priceClose: 102, pnlCost: 2, pnlEntries: 100 },
        peakProfit: { pnlPercentage: 2 },
        maxDrawdown: { pnlPercentage: -18 }, // intra-trade trough
        position: "long",
        note: "",
        exchangeName: EXCHANGE,
        strategyName: STRATEGY,
        frameName: FRAME,
      }),
    );
  }

  const stats = await svc.getData(EXCHANGE, FRAME, true);
  const row = stats.symbols.find((s) => s.symbol === "MTM");
  if (!row) return fail(`MTM row missing`);

  // Realized-only DD would be 0 (every close is +2%). Mark-to-market DD must be
  // substantial (~18%, slightly less after the first +2% lifts the peak before
  // subsequent dips, but at minimum the first trade's -18% from peak=1).
  if (row.maxDrawdown === null) return fail(`maxDrawdown must be computed, got null`);
  if (row.maxDrawdown < 17) {
    return fail(
      `maxDrawdown must reflect the -18% intra-trade dip (≥17%), got ${row.maxDrawdown}. ` +
        `If ≈0, DD regressed to realized-only (closes are all +2%).`,
    );
  }
  pass(`mark-to-market DD captured: maxDrawdown=${row.maxDrawdown.toFixed(2)}% (realized-only would be ~0)`);
});

// ---------------------------------------------------------------------------
// Test 8: pooled equity curve must walk trades CHRONOLOGICALLY (by
// closeTimestamp), not by storage iteration order. Regression for a bug where
// the pooled DD was determined by Map.values() × per-symbol newest-first
// order — peak grew along storage sequence, so a deep round-trip drawdown on a
// late wall-clock trade hit a peak that DID NOT EXIST at that moment in reality.
// The bug silently understated MTM drawdown (and inflated RF / Calmar by ~60%
// on a real 8-symbol portfolio).
//
// Scenario: 4 symbols, 5 trades. Chronological close order is:
//   t0: A close, +30% realized (peak rises to 1.30)
//   t1: B close, +0% realized but fall=-25%  (chronological MTM dip: peak=1.30, trough=1.30*0.75=0.975 → DD=25.0%)
//   t2: C close, +5% realized
//   t3: D close, +0% realized, fall=-1% (trivial)
//   t4: A2 close, +0% realized, fall=-1% (trivial)
//
// Chronological pool: peak ascends to 1.30 (after A), then B's deep -25% MTM
// trough is measured from 1.30 → DD = 25.00%.
// Storage-order pool: trades flushed per-symbol newest-first. Symbol B is
// processed BEFORE its peak (1.30) ever exists in the curve → peak when B is
// applied is 1.00, trough = 0.75, DD only 25.00% from a peak=1.00 = 25%.
// Both happen to coincide here — the regression needs a real reordering effect.
// Make A's win happen between B's two halves: symbol A has trades close at t0
// and t4 (split). Chronologically peak=1.30 ahead of D's trivial close. With
// per-symbol newest-first iteration we get [A_t4, A_t0, B, C, D] — peak rises
// only at A_t0 step #2 (after A_t4's neutral close), AFTER B has been measured
// against peak=1.00.
// ---------------------------------------------------------------------------
test("heat: pooled equity curve walks trades chronologically (closeTimestamp)", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // closeTimestamp ordering (real wall-clock):
  //   day 0 → A wins +30%
  //   day 1 → C neutral (+0%)
  //   day 2 → D neutral (+0%, fall -1%)
  //   day 3 → A neutral close (+0%, fall -1%)  ← second A trade closes here
  //   day 4 → B closes +0%, intra-trade fall = -25%
  //
  // Chronological pool walk (peak ascends to 1.30 at day 0, then a deep -25%
  // intra-trade drawdown on B at day 4 against peak=1.30 → DD = 25.00%).
  // Storage-order walk groups per-symbol newest-first:
  //   Map insertion order (unshift on first occurrence): A, C, D, B
  //   A bucket: [A_day3 (neutral), A_day0 (+30%)] ← newest unshifted on top
  //   C bucket: [C_day1] ; D bucket: [D_day2] ; B bucket: [B_day4]
  // Storage-order returns sequence: [A_day3, A_day0, C_day1, D_day2, B_day4]
  // Walking it: peak=1 after A_day3 neutral, peak rises to 1.30 after A_day0,
  // stays at 1.30 through C/D, then B's trough = 1.30*0.75 = 0.975 → DD = 25.0%.
  // Both orderings happen to give 25.0%, so this dataset does NOT distinguish.
  //
  // Replace: pre-B drawdown that depends on whether A's +30% was seen first.
  // Add a step at day 3.5 where another symbol E loses 10% intra-trade. In
  // chronological order: A's +30% on day 0 lifts peak to 1.30; E's -10% MTM
  // on day 3.5 measures against peak=1.30 → DD = 23.0%. In storage-order the
  // E trade is processed BEFORE A_day0 push (if symbol E is inserted before
  // A's second trade)... too fragile.
  //
  // Cleaner: make EVERY symbol's MTM dip measure against the chronological
  // peak. Choose 5 symbols, each with one trade. Symbol order in Map matches
  // tick order. Chronologically, A's huge win FIRST then the dips measured
  // against A's peak. Storage-order = tick-order = same sequence here.
  //
  // The only way storage-order and chronological diverge: a SINGLE symbol
  // with multiple trades whose buckets get processed before later symbols
  // catch up. Use that.
  //
  // Plan:
  //   1) feed in NON-chronological order (so storage-order ≠ chronological)
  //   2) per-symbol unshift means within each symbol newest-first iteration
  //   3) ensure A's big win comes chronologically FIRST but is fed LAST
  //
  // Tick feed order vs closeTimestamp:
  //   tick #1: B day4 fall=-25%, pnl=0
  //   tick #2: C day1 pnl=0, fall=-1%
  //   tick #3: D day2 pnl=0, fall=-1%
  //   tick #4: A day3 pnl=0, fall=-1%   (second A trade chronologically later)
  //   tick #5: A day0 pnl=+30%, fall=-1% (first A trade chronologically)
  //
  // Map insertion order (first-touch): B, C, D, A.
  // Per-symbol newest-first (unshift order is reverse of feed):
  //   B bucket: [B_day4]
  //   C bucket: [C_day1]
  //   D bucket: [D_day2]
  //   A bucket: [A_day0 (last fed → newest), A_day3]
  //
  // STORAGE-ORDER pool sequence:
  //   B_day4 → fall=-25% trough vs peak=1.00 → DD=25.00%
  //   C_day1 → trivial
  //   D_day2 → trivial
  //   A_day0 → +30%, peak rises to 1.30
  //   A_day3 → trivial; equity now ~1.287
  //   storage RF numerator = (equityFinal-1)*100 = ~28.7, denom = 25 → RF≈1.149
  //
  // CHRONOLOGICAL pool sequence:
  //   A_day0 +30% → peak=1.30
  //   C_day1 trivial
  //   D_day2 trivial
  //   A_day3 trivial, fall=-1% → trough vs peak=1.30 → small DD
  //   B_day4 fall=-25% → trough = equity_t4 * 0.75 vs peak=1.30 → DD ≈ huge
  //
  // equity at B_day4 ≈ 1.30 (only A's +30% counted, rest neutral). trough = 1.30*0.75 = 0.975.
  // DD = (1.30 - 0.975) / 1.30 * 100 = 25.00%.  Damn — same number!
  //
  // The difference: chronological peak = 1.30, storage peak = 1.00. Trough is
  // proportional to equity at the moment, which ALSO differs. DD% = (peak-trough)/peak,
  // and if everything is proportional, the ratio is identical. We need a SECOND
  // up-move BETWEEN B and the early A, so that peak in chronological order ≠ peak
  // in storage order RELATIVE to equity at the time of B.
  //
  // Add E_day2 = +20% gain. Chronological order: A(+30%) → C → E(+20%) → D → A2 → B.
  // Peak builds to 1.30 * 1.20 = 1.56. Then equity drifts at neutral closes to ~1.56.
  // B's MTM trough from equity 1.56 * 0.75 = 1.17 → DD = (1.56-1.17)/1.56 = 25.00%.
  // Still 25 because the dip percentage is fixed.
  //
  // The bug is invisible whenever a single trade's fall dominates DD. To expose
  // it, need a COMBINED DD: prior realized loss + later MTM dip stacking on a
  // chronological peak that storage-order never reaches.
  //
  // Final scenario:
  //   t0: A +30% (peak rises to 1.30 chronologically)
  //   t1: C +0% intra-fall -3%
  //   t2: D +0%
  //   t3: A -20% (realized loss); equity now 1.30 * 0.80 = 1.04 ; DD=20%
  //   t4: B intra-fall -25%, realized 0 ; equity stays 1.04; trough = 1.04*0.75 = 0.78
  //       DD = (1.30 - 0.78)/1.30 = 40.00% ← CHRONOLOGICAL MTM DD
  //
  // Feed order (non-chronological):
  //   #1: B_day4 fall=-25%, pnl=0
  //   #2: C_day1 fall=-3%, pnl=0
  //   #3: D_day2 fall=-1%, pnl=0
  //   #4: A_day3 fall=-1%, pnl=-20%   (second A, late)
  //   #5: A_day0 fall=-1%, pnl=+30%   (first A, early — fed last)
  //
  // Storage-order walk (Map iteration: B, C, D, A; within A bucket newest-first):
  //   B_day4: fall=-25%, trough vs peak=1.00 → DD=25.00%; equity=1.00
  //   C_day1: trivial; equity=1.00
  //   D_day2: trivial; equity=1.00
  //   A bucket newest-first: A_day0 (last unshift), A_day3
  //     A_day0: +30% → peak=1.30; equity=1.30
  //     A_day3: -20% → equity=1.04; DD vs peak=1.30 → (1.30-1.04)/1.30=20.00%
  //   storage maxDD = max(25, 20) = 25.00%
  //
  // Chronological walk (sorted by closeTimestamp):
  //   A_day0 +30%: peak=1.30
  //   C_day1 trivial
  //   D_day2 trivial
  //   A_day3 -20%: equity=1.04; DD=20.00%
  //   B_day4 fall=-25% on equity=1.04: trough=1.04*0.75=0.78; DD=(1.30-0.78)/1.30=40.00%
  //   chronological maxDD = 40.00% ← THE BUG MAKES STORAGE-ORDER MISS THIS
  //
  // RF and Calmar numerator (equityFinal-1)*100 is identical in both orderings
  // (compound is commutative). So the bug is purely in DD denominator:
  //   storage RF = (1.04-1)*100 / 25.00 = 0.16
  //   chronological RF = (1.04-1)*100 / 40.00 = 0.10

  const trades = [
    // feed-order (NON-chronological):
    { id: "B_day4", symbol: "POOL-B", closeAt: T0 + 4 * DAY, pnl: 0,    fall: -25 },
    { id: "C_day1", symbol: "POOL-C", closeAt: T0 + 1 * DAY, pnl: 0,    fall: -3 },
    { id: "D_day2", symbol: "POOL-D", closeAt: T0 + 2 * DAY, pnl: 0,    fall: -1 },
    { id: "A_day3", symbol: "POOL-A", closeAt: T0 + 3 * DAY, pnl: -20,  fall: -1 },
    { id: "A_day0", symbol: "POOL-A", closeAt: T0 + 0 * DAY, pnl: +30,  fall: -1 },
  ];
  for (const t of trades) {
    await svc.tick(
      toClosedTick({
        id: t.id,
        symbol: t.symbol,
        pendingAt: t.closeAt - 60_000,
        updatedAt: t.closeAt,
        priceOpen: 100,
        pnl: { pnlPercentage: t.pnl, priceOpen: 100, priceClose: 100 * (1 + t.pnl / 100), pnlCost: t.pnl, pnlEntries: 100 },
        peakProfit: { pnlPercentage: Math.max(t.pnl, 0) },
        maxDrawdown: { pnlPercentage: t.fall },
        position: "long",
        note: "",
        exchangeName: EXCHANGE,
        strategyName: STRATEGY,
        frameName: FRAME,
      }),
    );
  }

  const stats = await svc.getData(EXCHANGE, FRAME, true);

  // Compute chronological pooled MTM DD as reference (mirror of service walk
  // but explicitly sorted by closeAt).
  const sorted = [...trades].sort((a, b) => a.closeAt - b.closeAt);
  let equity = 1, peak = 1, maxDD = 0;
  for (const t of sorted) {
    if (t.fall < 0) {
      const trough = equity * (1 + t.fall / 100);
      const dd = ((peak - trough) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
    equity *= 1 + t.pnl / 100;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  const expectedFinal = equity;
  const expectedRF = ((expectedFinal - 1) * 100) / maxDD;
  // Expected: chronological DD ≈ 40%, RF ≈ 0.10.
  if (Math.abs(maxDD - 40) > 0.1) {
    return fail(`reference math broken: expected chronological MTM DD ≈ 40%, computed ${maxDD.toFixed(4)}%`);
  }

  // What the service should return after the chronological fix.
  if (stats.portfolioRecoveryFactor === null) {
    return fail(`portfolioRecoveryFactor must be computed, got null`);
  }
  // Service must produce the chronological RF (≈ 0.10), NOT the storage-order
  // RF (≈ 0.16). A discrepancy here pinpoints the regression.
  if (Math.abs(stats.portfolioRecoveryFactor - expectedRF) > 0.01) {
    return fail(
      `pooled curve still walks storage-order: portfolioRecoveryFactor=${stats.portfolioRecoveryFactor.toFixed(4)} ` +
        `but chronological reference RF=${expectedRF.toFixed(4)} (storage-order would be ~0.16). ` +
        `Sort by closeTimestamp before walking allReturns/allFalls.`,
    );
  }
  pass(
    `pooled curve chronological: RF=${stats.portfolioRecoveryFactor.toFixed(4)} matches reference (MTM DD≈${maxDD.toFixed(2)}%)`,
  );
});

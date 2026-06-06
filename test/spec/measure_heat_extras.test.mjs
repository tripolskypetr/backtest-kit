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

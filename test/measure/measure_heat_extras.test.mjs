import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import { STRATEGY, EXCHANGE, FRAME, toClosedTick } from "../utils/_measure_helpers.mjs";

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

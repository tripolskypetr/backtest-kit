import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import { STRATEGY, EXCHANGE, FRAME, toClosedTick } from "../utils/measure_helpers.mjs";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 24 * 3_600_000;

const makeRow = (i, pnl, symbol) => {
  const pendingAt = T0 + i * DAY;
  return {
    id: `mig11-${symbol}-${i}`,
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
// Test 1: break-even (pnl === 0) closes BOTH streaks. This is the post-iter15
// behaviour where the consecutive-streak block was extended to also accumulate
// per-streak pnl sums (avgConsecutiveWinPnl / avgConsecutiveLossPnl). The
// explicit break-even branch resets currentWin/Loss to 0, which also affects
// maxWinStreak / maxLossStreak — break-even is now treated as a neither-win-
// nor-loss interruption, not a no-op fall-through.
//
// Series: [W, W, BE, W, W, L]
//   step 1: W → curWin=1, maxWin=1
//   step 2: W → curWin=2, maxWin=2
//   step 3: BE → flush curWin (close win streak), curWin=0
//   step 4: W → curWin=1, maxWin still 2
//   step 5: W → curWin=2, maxWin still 2
//   step 6: L → flush curWin, curLoss=1, maxLoss=1
// → maxWinStreak = 2 (break-even broke the run).
// ---------------------------------------------------------------------------
test("heat: break-even closes both streaks (post-iter15 streak semantics)", async ({ pass, fail }) => {
  const pnls = [1, 1, 0, 1, 1, -1];
  const rows = pnls.map((p, i) => makeRow(i, p, "BE-STREAK"));
  const stats = await feed(rows);
  const row = stats.symbols.find((s) => s.symbol === "BE-STREAK");
  if (!row) return fail(`BE-STREAK row missing`);

  if (row.maxWinStreak !== 2) {
    return fail(`maxWinStreak: break-even must close win streak, expected 2, got ${row.maxWinStreak}`);
  }
  if (row.maxLossStreak !== 1) {
    return fail(`maxLossStreak: expected 1 (single L at end), got ${row.maxLossStreak}`);
  }
  pass(`Break-even closes streaks: maxWinStreak=${row.maxWinStreak}, maxLossStreak=${row.maxLossStreak}`);
});

// ---------------------------------------------------------------------------
// Test 2: pooled equity curve walks trades CHRONOLOGICALLY by closeTimestamp.
//
// Regression for a bug where pooled DD was determined by Map.values() ×
// per-symbol newest-first iteration order, so peak grew along storage
// sequence rather than wall-clock time. A deep round-trip drawdown on a
// late wall-clock trade ended up measured against a peak that did not yet
// exist at that moment in reality — silently understating MTM drawdown
// and inflating RF / Calmar by ~60% on a real 8-symbol portfolio.
//
// Structure that exposes the bug:
//   day 0:  A +30%        — peak rises to 1.30 chronologically
//   days 1..2,4..8: tiny noise on filler symbols (so N≥MIN_SIGNALS_FOR_RATIOS,
//                   stdDev > 0, and pooled ratios are not gated to null)
//   day 3:  A -20%         — equity = 1.30 × 0.80 = 1.04, realised DD = 20%
//   day 9:  B fall=-25%, pnl=0
//           — MTM trough on equity = 1.041: 1.041 × 0.75 = 0.780
//           — DD = (1.30 - 0.78) / 1.30 ≈ 40%
//
// equityFinal is commutative under compounding (≈ 1.041), so it does not
// matter which order trades are processed in. maxDD is order-sensitive
// because peak depends on the running trajectory. The bug lived in the
// pooled walk visiting B BEFORE A's +30% had lifted the peak above 1.00,
// missing the 40% MTM trough entirely.
//
// We feed in a deliberately scrambled order so that storage-iteration order
// (Map.values() × per-symbol newest-first) differs from closeTimestamp order;
// the assertion compares the service's pooled RF against an independent
// chronological reference walk. ~0.10 chronological vs ~0.16 storage-order.
// ---------------------------------------------------------------------------
test("heat: pooled equity curve walks trades chronologically (closeTimestamp)", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // 10 trades: critical A_day0/A_day3 pair + B_day9 deep MTM, with 7 filler
  // trades carrying tiny noise so N reaches MIN_SIGNALS_FOR_RATIOS (=10) and
  // stdDev clears STDDEV_EPSILON. Filler pnls are small enough that the
  // chronological DD on day 9 is still ≈ 40% (peak doesn't move beyond 1.30
  // after day 0; equity at day 9 is ≈ 1.041, so trough = 1.041 × 0.75 ≈ 0.781,
  // DD = (1.30 - 0.781) / 1.30 ≈ 40%).
  const trades = [
    { id: "A_day0", symbol: "MIG11-A", closeAt: T0 + 0 * DAY, pnl: +30,  fall: -1 },
    { id: "F_day1", symbol: "MIG11-F", closeAt: T0 + 1 * DAY, pnl: +0.1, fall: -0.5 },
    { id: "G_day2", symbol: "MIG11-G", closeAt: T0 + 2 * DAY, pnl: -0.1, fall: -0.5 },
    { id: "A_day3", symbol: "MIG11-A", closeAt: T0 + 3 * DAY, pnl: -20,  fall: -1 },
    { id: "H_day4", symbol: "MIG11-H", closeAt: T0 + 4 * DAY, pnl: +0.1, fall: -0.5 },
    { id: "I_day5", symbol: "MIG11-I", closeAt: T0 + 5 * DAY, pnl: -0.1, fall: -0.5 },
    { id: "J_day6", symbol: "MIG11-J", closeAt: T0 + 6 * DAY, pnl: +0.1, fall: -0.5 },
    { id: "K_day7", symbol: "MIG11-K", closeAt: T0 + 7 * DAY, pnl: -0.1, fall: -0.5 },
    { id: "L_day8", symbol: "MIG11-L", closeAt: T0 + 8 * DAY, pnl: +0.1, fall: -0.5 },
    { id: "B_day9", symbol: "MIG11-B", closeAt: T0 + 9 * DAY, pnl: 0,    fall: -25 },
  ];

  // Scramble feed order so storage-iteration differs from closeTimestamp.
  // The two A trades are fed in reverse chronological order (newest-first
  // via the service's unshift), pushed last so that they are NOT the first
  // symbol in Map iteration order.
  const feedOrder = [
    trades[9], // B_day9
    trades[1], // F_day1
    trades[2], // G_day2
    trades[4], // H_day4
    trades[5], // I_day5
    trades[6], // J_day6
    trades[7], // K_day7
    trades[8], // L_day8
    trades[3], // A_day3
    trades[0], // A_day0
  ];

  for (const t of feedOrder) {
    await svc.tick(
      toClosedTick({
        id: t.id,
        symbol: t.symbol,
        pendingAt: t.closeAt - 60_000,
        updatedAt: t.closeAt,
        priceOpen: 100,
        pnl: {
          pnlPercentage: t.pnl,
          priceOpen: 100,
          priceClose: 100 * (1 + t.pnl / 100),
          pnlCost: t.pnl,
          pnlEntries: 100,
        },
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

  // Reference: re-walk in chronological order, mirroring the service's
  // mark-to-market formula exactly.
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

  if (Math.abs(maxDD - 40) > 0.1) {
    return fail(`reference math broken: expected chronological MTM DD ≈ 40%, computed ${maxDD.toFixed(4)}%`);
  }
  if (Math.abs(expectedRF - 0.1026) > 0.005) {
    return fail(`reference RF should be ≈ 0.1026, computed ${expectedRF.toFixed(4)}`);
  }

  if (stats.portfolioRecoveryFactor === null) {
    return fail(`portfolioRecoveryFactor must be computed (N=${trades.length} ≥ 10), got null`);
  }
  if (Math.abs(stats.portfolioRecoveryFactor - expectedRF) > 0.01) {
    return fail(
      `pooled curve still walks storage-order: portfolioRecoveryFactor=${stats.portfolioRecoveryFactor.toFixed(4)} ` +
        `but chronological reference RF=${expectedRF.toFixed(4)} (storage-order would be ~0.16). ` +
        `Sort by closeTimestamp before walking allReturns/allFalls.`,
    );
  }
  pass(
    `pooled curve chronological: RF=${stats.portfolioRecoveryFactor.toFixed(4)} matches reference ` +
      `(MTM DD≈${maxDD.toFixed(2)}%, storage-order would have given ≈0.16)`,
  );
});

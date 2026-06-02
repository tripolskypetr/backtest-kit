import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Mode-flag separation in HEAT: HeatMarkdownService keys storage by
// (exchangeName, frameName, backtest). Same (exchange, frame) but different
// `backtest` flag must yield separate storages.
//
// (Note: BacktestMarkdownService and LiveMarkdownService themselves are
// SCOPED to backtest=true and backtest=false respectively — they hard-code
// the flag in their storage key — so mode separation isn't applicable to
// them. Heat is the only service that legitimately exposes both.)

const T0 = Date.UTC(2026, 0, 1);
const DAY = 24 * 3_600_000;

const makeRow = (i, pnl, symbol) => ({
  id: `mode-${symbol}-${i}`,
  symbol,
  pendingAt: T0 + i * DAY,
  updatedAt: T0 + i * DAY + 4 * 3_600_000,
  priceOpen: 100,
  pnl: { pnlPercentage: pnl, priceOpen: 100, priceClose: 100 * (1 + pnl / 100), pnlCost: pnl, pnlEntries: 100 },
  peakProfit: { pnlPercentage: Math.max(pnl, 0) },
  maxDrawdown: { pnlPercentage: Math.min(pnl, 0) },
  position: "long",
  note: "",
  exchangeName: EXCHANGE,
  strategyName: STRATEGY,
  frameName: FRAME,
});

// ---------------------------------------------------------------------------
// Test 1: Heat (exchange, frame, backtest=true) and (..., backtest=false)
// are isolated storages.
// ---------------------------------------------------------------------------
test("mode_separation: Heat (exchange, frame, backtest) keys separate storages for true vs false", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: false });

  const symbol = "MODE-HEAT";
  // 7 ticks with backtest=true
  for (let i = 0; i < 7; i++) {
    const tick = { ...toClosedTick(makeRow(i, 0.5, symbol)), backtest: true };
    await svc.tick(tick);
  }
  // 3 ticks with backtest=false on SAME (exchange, frame)
  for (let i = 0; i < 3; i++) {
    const tick = { ...toClosedTick(makeRow(i, -0.5, symbol)), backtest: false };
    await svc.tick(tick);
  }

  const statsT = await svc.getData(EXCHANGE, FRAME, true);
  const statsF = await svc.getData(EXCHANGE, FRAME, false);

  if (statsT.portfolioTotalTrades !== 7) {
    fail(`Heat backtest=true portfolioTotalTrades must be 7, got ${statsT.portfolioTotalTrades}`);
    return;
  }
  if (statsF.portfolioTotalTrades !== 3) {
    fail(`Heat backtest=false portfolioTotalTrades must be 3, got ${statsF.portfolioTotalTrades}`);
    return;
  }
  pass(`Heat mode separation verified: backtest=true (7 trades), backtest=false (3 trades)`);
});

// ---------------------------------------------------------------------------
// Test 2: Heat clear({ backtest: true }) leaves backtest=false intact.
// ---------------------------------------------------------------------------
test("mode_separation: Heat clear({backtest:true}) does not wipe backtest=false counterpart", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear(); // start clean (no payload = wipe all)

  const symbol = "MODE-CLR-HEAT";
  for (let i = 0; i < 5; i++) {
    await svc.tick({ ...toClosedTick(makeRow(i, 0.5, symbol)), backtest: true });
  }
  for (let i = 0; i < 4; i++) {
    await svc.tick({ ...toClosedTick(makeRow(i, 0.3, symbol)), backtest: false });
  }

  // Targeted wipe of backtest=true bucket only.
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const statsT = await svc.getData(EXCHANGE, FRAME, true);
  const statsF = await svc.getData(EXCHANGE, FRAME, false);

  if (statsT.portfolioTotalTrades !== 0) {
    fail(`backtest=true bucket must be wiped, got ${statsT.portfolioTotalTrades}`);
    return;
  }
  if (statsF.portfolioTotalTrades !== 4) {
    fail(`backtest=false bucket must remain intact at 4, got ${statsF.portfolioTotalTrades}`);
    return;
  }
  pass(`Heat targeted clear-by-mode: true → wiped (0), false → intact (4)`);
});

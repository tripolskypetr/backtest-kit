import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import { STRATEGY, EXCHANGE, FRAME, toClosedTick } from "../utils/_measure_helpers.mjs";

// Infrastructure tests: memoization isolation, clear semantics, subscribe
// idempotency, unsubscribe, buffer trim. These guard the LIB-level invariants
// that math tests assume but never verify directly.

const T0 = Date.UTC(2026, 0, 1);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Tiny synthetic closed signal — only the fields the services read.
const makeRow = (i, pnl, symbol = "INFRA") => {
  const pendingAt = T0 + i * DAY;
  const updatedAt = pendingAt + 4 * HOUR;
  const priceOpen = 100;
  return {
    id: `infra-${symbol}-${String(i).padStart(4, "0")}`,
    symbol,
    pendingAt,
    updatedAt,
    priceOpen,
    pnl: {
      pnlPercentage: pnl,
      priceOpen,
      priceClose: priceOpen * (1 + pnl / 100),
      pnlCost: pnl,
      pnlEntries: 100,
    },
    peakProfit: { pnlPercentage: Math.max(pnl, 0) },
    maxDrawdown: { pnlPercentage: Math.min(pnl, 0) },
    position: "long",
    note: "",
    exchangeName: EXCHANGE,
    strategyName: STRATEGY,
    frameName: FRAME,
  };
};

// ---------------------------------------------------------------------------
// Test 1: memoization isolation across symbols.
// Two different symbols (same strategy/exchange/frame/backtest) must produce
// completely independent storages. Mixing them up would cause one symbol's
// trades to leak into another's stats.
// ---------------------------------------------------------------------------
test("infra: memoization isolation — two symbols don't share storage", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();

  await svc.clear({ symbol: "INFRA-A", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  await svc.clear({ symbol: "INFRA-B", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // 10 trades for INFRA-A, all +1%.
  for (let i = 0; i < 10; i++) {
    await svc.tick(toClosedTick(makeRow(i, 1.0, "INFRA-A"), { symbolOverride: "INFRA-A" }));
  }
  // 5 trades for INFRA-B, all -1%.
  for (let i = 0; i < 5; i++) {
    await svc.tick(toClosedTick(makeRow(i, -1.0, "INFRA-B"), { symbolOverride: "INFRA-B" }));
  }

  const statsA = await svc.getData("INFRA-A", STRATEGY, EXCHANGE, FRAME, true);
  const statsB = await svc.getData("INFRA-B", STRATEGY, EXCHANGE, FRAME, true);

  if (statsA.totalSignals !== 10) {
    fail(`INFRA-A.totalSignals must be 10 (not contaminated by B), got ${statsA.totalSignals}`);
    return;
  }
  if (statsB.totalSignals !== 5) {
    fail(`INFRA-B.totalSignals must be 5 (not contaminated by A), got ${statsB.totalSignals}`);
    return;
  }
  if (statsA.avgPnl <= 0) {
    fail(`INFRA-A.avgPnl must be +1.0 (all wins), got ${statsA.avgPnl}`);
    return;
  }
  if (statsB.avgPnl >= 0) {
    fail(`INFRA-B.avgPnl must be -1.0 (all losses), got ${statsB.avgPnl}`);
    return;
  }
  pass(`Isolation verified: A=${statsA.totalSignals}@${statsA.avgPnl.toFixed(2)} B=${statsB.totalSignals}@${statsB.avgPnl.toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// Test 2: targeted clear() with payload removes ONLY that key.
// Feed A and B; clear A; B must remain intact.
// ---------------------------------------------------------------------------
test("infra: clear({ payload }) wipes only the matching key", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();

  await svc.clear({ symbol: "INFRA-CLR-A", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  await svc.clear({ symbol: "INFRA-CLR-B", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (let i = 0; i < 12; i++) await svc.tick(toClosedTick(makeRow(i, 0.5, "INFRA-CLR-A"), { symbolOverride: "INFRA-CLR-A" }));
  for (let i = 0; i < 7; i++) await svc.tick(toClosedTick(makeRow(i, 0.3, "INFRA-CLR-B"), { symbolOverride: "INFRA-CLR-B" }));

  // Clear only A.
  await svc.clear({ symbol: "INFRA-CLR-A", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const statsA = await svc.getData("INFRA-CLR-A", STRATEGY, EXCHANGE, FRAME, true);
  const statsB = await svc.getData("INFRA-CLR-B", STRATEGY, EXCHANGE, FRAME, true);

  if (statsA.totalSignals !== 0) {
    fail(`INFRA-CLR-A must be wiped (totalSignals=0), got ${statsA.totalSignals}`);
    return;
  }
  if (statsB.totalSignals !== 7) {
    fail(`INFRA-CLR-B must be untouched (totalSignals=7), got ${statsB.totalSignals}`);
    return;
  }
  pass(`Targeted clear verified: A wiped, B intact (${statsB.totalSignals})`);
});

// ---------------------------------------------------------------------------
// Test 3: clear() without payload wipes EVERY key.
// ---------------------------------------------------------------------------
test("infra: clear() without payload wipes all keys", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();

  // Establish three independent keys.
  for (const sym of ["INFRA-WIPE-1", "INFRA-WIPE-2", "INFRA-WIPE-3"]) {
    await svc.clear({ symbol: sym, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
    for (let i = 0; i < 5; i++) {
      await svc.tick(toClosedTick(makeRow(i, 0.4, sym), { symbolOverride: sym }));
    }
  }

  await svc.clear(); // wipe-all

  for (const sym of ["INFRA-WIPE-1", "INFRA-WIPE-2", "INFRA-WIPE-3"]) {
    const stats = await svc.getData(sym, STRATEGY, EXCHANGE, FRAME, true);
    if (stats.totalSignals !== 0) {
      fail(`${sym}.totalSignals must be 0 after clear(), got ${stats.totalSignals}`);
      return;
    }
  }
  pass(`clear() wiped all 3 keys`);
});

// ---------------------------------------------------------------------------
// Test 4: subscribe() is idempotent (singleshot). Calling it many times must
// not double-count events. Regression-safety: if the singleshot wrapper is
// removed, every tick will be processed N times.
// ---------------------------------------------------------------------------
test("infra: subscribe() is idempotent — no double-counting on repeat calls", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  // Call subscribe many times — each must be a no-op after the first.
  for (let i = 0; i < 5; i++) svc.subscribe();

  await svc.clear({ symbol: "INFRA-SUB", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (let i = 0; i < 8; i++) {
    await svc.tick(toClosedTick(makeRow(i, 0.5, "INFRA-SUB"), { symbolOverride: "INFRA-SUB" }));
  }

  const stats = await svc.getData("INFRA-SUB", STRATEGY, EXCHANGE, FRAME, true);
  if (stats.totalSignals !== 8) {
    fail(`totalSignals must be 8 after 8 ticks (no double-counting), got ${stats.totalSignals}`);
    return;
  }
  pass(`subscribe() idempotent: 8 ticks → ${stats.totalSignals} signals`);
});

// ---------------------------------------------------------------------------
// Test 5: buffer trim keeps the NEWEST entries.
// Send 300 signals when CC_MAX_BACKTEST_MARKDOWN_ROWS = 250.
// After trim, the storage must hold 250 — and they must be signals #50..#299,
// NOT #0..#249. The newest-first storage uses unshift+pop so this is the
// intended behaviour; regression in trim direction (popping head instead of
// tail) would surface here.
// ---------------------------------------------------------------------------
test("infra: buffer trim keeps NEWEST 250 of 300 signals", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "INFRA-TRIM", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // Use distinctive pnls so we can tell oldest from newest by sum.
  // pnls 0..299 → pnl=i/100 (0.00 .. 2.99). If we kept oldest 250 (0..249),
  // totalPnl ≈ 311. If we kept newest 250 (50..299), totalPnl ≈ 436.
  for (let i = 0; i < 300; i++) {
    const row = makeRow(i, i / 100, "INFRA-TRIM");
    await svc.tick(toClosedTick(row, { symbolOverride: "INFRA-TRIM" }));
  }

  const stats = await svc.getData("INFRA-TRIM", STRATEGY, EXCHANGE, FRAME, true);
  if (stats.totalSignals !== 250) {
    fail(`totalSignals must be 250 (trimmed from 300), got ${stats.totalSignals}`);
    return;
  }
  // Sum of newest 250 (i=50..299): (50+299)*250/2 / 100 = 436.25
  const expectedNewestSum = ((50 + 299) * 250) / 2 / 100;
  // Sum of oldest 250 (i=0..249): (0+249)*250/2 / 100 = 311.25
  const expectedOldestSum = ((0 + 249) * 250) / 2 / 100;
  const got = stats.totalPnl;
  if (Math.abs(got - expectedNewestSum) > 1e-6) {
    if (Math.abs(got - expectedOldestSum) < 1e-6) {
      fail(`buffer trim kept the OLDEST 250 instead of NEWEST. totalPnl=${got} (expected newest=${expectedNewestSum}, oldest=${expectedOldestSum})`);
    } else {
      fail(`totalPnl=${got} matches neither newest (${expectedNewestSum}) nor oldest (${expectedOldestSum}) sum`);
    }
    return;
  }
  pass(`Trim verified: kept newest 250 (totalPnl=${got.toFixed(2)})`);
});

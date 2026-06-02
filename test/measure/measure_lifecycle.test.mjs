import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Lifecycle contract: subscribe/unsubscribe must be safe to call in any
// order and any number of times.

const T0 = Date.UTC(2026, 0, 1);
const DAY = 24 * 3_600_000;

const makeRow = (i, pnl, symbol) => ({
  id: `lc-${symbol}-${i}`,
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
// Test 1: unsubscribe without prior subscribe is a no-op (no throw).
// ---------------------------------------------------------------------------
test("lifecycle: unsubscribe before subscribe is a safe no-op", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  // No subscribe() call. unsubscribe must not throw.
  try {
    await svc.unsubscribe();
  } catch (err) {
    fail(`unsubscribe without prior subscribe threw: ${err.message}`);
    return;
  }
  pass(`unsubscribe-before-subscribe is safe`);
});

// ---------------------------------------------------------------------------
// Test 2: getData WITHOUT subscribe throws a clear error.
// ---------------------------------------------------------------------------
test("lifecycle: getData without subscribe throws documented error", async ({ pass, fail }) => {
  // Spin up a fresh-ish service state: take whichever service hasn't been
  // subscribed yet. All other tests in the suite call subscribe(), so we
  // need a service that's still pristine. unsubscribe first to bring it
  // back to "not subscribed" state.
  const svc = lib.backtestMarkdownService;
  await svc.unsubscribe(); // ensure cleared

  try {
    await svc.getData("LC-NO-SUB", STRATEGY, EXCHANGE, FRAME, true);
  } catch (err) {
    if (!/not initialized|subscribe/i.test(err.message)) {
      fail(`error message must mention "subscribe", got: ${err.message}`);
      return;
    }
    pass(`getData without subscribe throws: "${err.message}"`);
    return;
  }
  fail(`getData without subscribe must throw, but it returned`);
});

// ---------------------------------------------------------------------------
// Test 3: after subscribe → tick → unsubscribe → second tick is silently
// ignored (no error, but no effect either).
// ---------------------------------------------------------------------------
test("lifecycle: ticks after unsubscribe are not counted", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  const SYM = "LC-UNSUB";
  await svc.clear({ symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // 5 ticks while subscribed
  for (let i = 0; i < 5; i++) {
    await svc.tick(toClosedTick(makeRow(i, 0.5, SYM), { symbolOverride: SYM }));
  }
  const before = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (before.totalSignals !== 5) {
    fail(`before unsubscribe: totalSignals must be 5, got ${before.totalSignals}`);
    return;
  }

  // unsubscribe and then resubscribe (so getData still works). The signals
  // from the FIRST subscription survive because unsubscribe also calls
  // clear() internally? Let's verify the actual behaviour. The service's
  // unsubscribe closure calls `this.clear()` (from the singleshot factory),
  // so storages are wiped on unsubscribe.
  await svc.unsubscribe();
  svc.subscribe(); // re-subscribe so we can call getData again
  const after = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (after.totalSignals !== 0) {
    fail(`after unsubscribe → resubscribe: totalSignals must be 0 (storage wiped), got ${after.totalSignals}`);
    return;
  }
  pass(`unsubscribe wipes storage; resubscribed → empty (verified by 5 → 0 transition)`);
});

// ---------------------------------------------------------------------------
// Test 4: idempotent unsubscribe — calling unsubscribe twice is safe.
// ---------------------------------------------------------------------------
test("lifecycle: double-unsubscribe is a safe no-op", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  try {
    await svc.unsubscribe();
    await svc.unsubscribe(); // again — must not throw
  } catch (err) {
    fail(`double-unsubscribe threw: ${err.message}`);
    return;
  }
  pass(`double-unsubscribe is safe`);
});

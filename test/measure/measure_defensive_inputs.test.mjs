import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Defensive input handling: ticks that are malformed, partial, or arrive in
// states the service shouldn't accept. These should be silently ignored OR
// fail gracefully — never corrupt the storage.

const T0 = Date.UTC(2026, 0, 1);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const makeClosedTick = (i, pnl, symbol) => toClosedTick({
  id: `def-${symbol}-${i}`,
  symbol,
  strategyName: STRATEGY,
  pendingAt: T0 + i * DAY,
  updatedAt: T0 + i * DAY + 4 * HOUR,
  priceOpen: 100,
  pnl: { pnlPercentage: pnl, priceOpen: 100, priceClose: 100 * (1 + pnl / 100), pnlCost: pnl, pnlEntries: 100 },
  peakProfit: { pnlPercentage: Math.max(pnl, 0) },
  maxDrawdown: { pnlPercentage: Math.min(pnl, 0) },
  position: "long",
  note: "",
  exchangeName: EXCHANGE,
  frameName: FRAME,
}, { symbolOverride: symbol });

// ---------------------------------------------------------------------------
// Test E: tick with action !== "closed" is silently dropped by Backtest.
// Backtest service explicitly filters: `if (data.action !== "closed") return;`
// Locks in that contract.
// ---------------------------------------------------------------------------
test("defensive E: tick with action!='closed' is dropped by Backtest service", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  const SYM = "DEF-NOT-CLOSED";
  await svc.clear({ symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // First, a legitimate closed tick — establishes the bucket.
  await svc.tick(makeClosedTick(0, 0.5, SYM));

  // Then send action="opened" / "active" / "idle" — should all be dropped.
  for (const action of ["opened", "active", "idle", "scheduled", "waiting", "cancelled"]) {
    await svc.tick({ ...makeClosedTick(99, 0.5, SYM), action });
  }
  // Finally another closed tick to confirm bucket is still healthy.
  await svc.tick(makeClosedTick(1, 0.5, SYM));

  const stats = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (stats.totalSignals !== 2) {
    fail(`only 'closed' ticks should accumulate; got ${stats.totalSignals} (expected 2)`);
    return;
  }
  pass(`Non-closed actions silently dropped: 2 closed ticks retained, 6 other actions ignored`);
});

// ---------------------------------------------------------------------------
// Test D: double clear() with same payload is safe (idempotent).
// ---------------------------------------------------------------------------
test("defensive D: clear() twice with same payload is safe", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  const SYM = "DEF-DBL-CLEAR";
  const payload = { symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true };

  await svc.clear(payload);
  try {
    await svc.clear(payload); // second clear on already-empty key
    await svc.clear(payload); // and a third for good measure
  } catch (err) {
    fail(`repeated clear() threw: ${err.message}`);
    return;
  }
  // getData should still work
  const stats = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (stats.totalSignals !== 0) {
    fail(`getData after repeated clear should return empty, got ${stats.totalSignals}`);
    return;
  }
  pass(`Double-clear safe; subsequent getData returns empty state`);
});

// ---------------------------------------------------------------------------
// Test H: cleared storage starts fresh on next tick (no zombie state).
// 5 ticks → clear → 3 more ticks → expect 3 total, not 8.
// ---------------------------------------------------------------------------
test("defensive H: clear() invalidates memoised storage — next tick creates fresh bucket", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  const SYM = "DEF-ZOMBIE";
  const payload = { symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true };

  await svc.clear(payload);
  for (let i = 0; i < 5; i++) await svc.tick(makeClosedTick(i, 0.5, SYM));
  const before = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (before.totalSignals !== 5) { fail(`pre-clear: expected 5, got ${before.totalSignals}`); return; }

  await svc.clear(payload);
  for (let i = 5; i < 8; i++) await svc.tick(makeClosedTick(i, 0.5, SYM));
  const after = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (after.totalSignals !== 3) {
    fail(`post-clear should reflect only 3 new ticks, got ${after.totalSignals}. ` +
      `If 8, clear didn't actually wipe; if other value, memoize state is corrupted.`);
    return;
  }
  pass(`Clear properly invalidates memoise: 5 → cleared → 3 new ticks → 3 visible`);
});

// ---------------------------------------------------------------------------
// Test I: Heat per-symbol empty bucket. If a symbol was registered (via at
// least one tick) and then somehow drained, calculateSymbolStats must not
// crash. We approximate by feeding 1 tick then calling getData — no special
// trick, just verify the N=1 path doesn't divide-by-zero.
// ---------------------------------------------------------------------------
test("defensive I: Heat with single signal in a bucket — no NaN from stdDev divide-by-zero", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: "DEF-HEAT-ONE", frameName: FRAME, backtest: true });

  // Feed a single signal so the bucket exists with N=1.
  await svc.tick({
    ...makeClosedTick(0, 0.5, "ONE-SIG"),
    exchangeName: "DEF-HEAT-ONE",
  });
  const stats = await svc.getData("DEF-HEAT-ONE", FRAME, true);
  const row = stats.symbols.find((s) => s.symbol === "ONE-SIG");
  if (!row) return fail(`ONE-SIG row missing`);

  // N=1 → stdDev calc requires N>1; service must return null without NaN.
  if (row.stdDev !== null) return fail(`stdDev with N=1 must be null (need N>1 for sample), got ${row.stdDev}`);
  if (row.sharpeRatio !== null) return fail(`sharpeRatio with N=1 must be null, got ${row.sharpeRatio}`);
  // But basic aggregates exist.
  if (row.totalTrades !== 1) return fail(`totalTrades must be 1, got ${row.totalTrades}`);
  if (row.totalPnl === null) return fail(`totalPnl must be the single value, got null`);
  pass(`Heat N=1 safe: stdDev/sharpe null (gated), totalPnl=${row.totalPnl}`);
});

// ---------------------------------------------------------------------------
// Test G: Heat with falsy symbol values. addSignal blindly uses
// data.symbol as Map key. Empty string is a legitimate JS Map key. Verify
// that empty-string symbol creates one bucket; "BTC" creates a separate
// bucket; they don't collide.
// ---------------------------------------------------------------------------
test("defensive G: Heat treats empty-string symbol as its own bucket, isolated from real symbols", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: "DEF-EMPTY-SYM", frameName: FRAME, backtest: true });

  // Feed 4 empty-symbol ticks and 6 real-symbol ticks.
  for (let i = 0; i < 4; i++) {
    await svc.tick({ ...makeClosedTick(i, 0.3, ""), exchangeName: "DEF-EMPTY-SYM" });
  }
  for (let i = 0; i < 6; i++) {
    await svc.tick({ ...makeClosedTick(i, 0.5, "REAL"), exchangeName: "DEF-EMPTY-SYM" });
  }

  const stats = await svc.getData("DEF-EMPTY-SYM", FRAME, true);
  // Must see TWO symbols: "" and "REAL".
  if (stats.totalSymbols !== 2) {
    fail(`expected 2 symbols ("" and "REAL"), got ${stats.totalSymbols}`);
    return;
  }
  const realRow = stats.symbols.find((s) => s.symbol === "REAL");
  const emptyRow = stats.symbols.find((s) => s.symbol === "");
  if (!realRow) return fail(`REAL row missing`);
  if (!emptyRow) return fail(`empty-symbol row missing`);
  if (realRow.totalTrades !== 6) return fail(`REAL must have 6 trades, got ${realRow.totalTrades}`);
  if (emptyRow.totalTrades !== 4) return fail(`empty-symbol must have 4 trades, got ${emptyRow.totalTrades}`);
  pass(`Empty-symbol bucket isolated: ''=${emptyRow.totalTrades}, REAL=${realRow.totalTrades}`);
});

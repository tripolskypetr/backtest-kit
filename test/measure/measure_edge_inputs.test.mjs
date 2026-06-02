import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Edge inputs: unusual but plausible field values that should not crash.

const T0 = Date.UTC(2026, 0, 1);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const makeClosedRow = (i, pnl, symbol, opts = {}) => ({
  id: opts.id ?? `edge-${i}`,
  symbol,
  strategyName: opts.strategyName ?? STRATEGY,
  pendingAt: opts.pendingAt ?? (T0 + i * DAY),
  updatedAt: opts.updatedAt ?? (T0 + i * DAY + 4 * HOUR),
  priceOpen: 100,
  pnl: { pnlPercentage: pnl, priceOpen: 100, priceClose: 100 * (1 + pnl / 100), pnlCost: pnl, pnlEntries: 100 },
  peakProfit: { pnlPercentage: Math.max(pnl, 0) },
  maxDrawdown: { pnlPercentage: Math.min(pnl, 0) },
  position: "long",
  note: "",
  exchangeName: EXCHANGE,
  frameName: FRAME,
});

// ---------------------------------------------------------------------------
// Test K: pendingAt set far in the future (10 years ahead). 12 signals all
// at year 2036. span = small (4h per signal) → annualization gate fails
// (span < 14d). The service must NOT misinterpret far-future timestamps
// (e.g., as NaN from int overflow or negative).
// ---------------------------------------------------------------------------
test("edge K: pendingAt far in the future — gates correctly, no overflow/NaN", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  const SYM = "EDGE-FUTURE";
  await svc.clear({ symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const T_FUTURE = Date.UTC(2036, 5, 1); // June 2036
  for (let i = 0; i < 12; i++) {
    const pnl = i % 2 === 0 ? 0.6 : -0.2; // varied so stdDev > 0
    await svc.tick(toClosedTick(
      makeClosedRow(i, pnl, SYM, { pendingAt: T_FUTURE + i * DAY, updatedAt: T_FUTURE + i * DAY + 4 * HOUR }),
      { symbolOverride: SYM },
    ));
  }
  const stats = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (stats.totalSignals !== 12) return fail(`totalSignals must be 12, got ${stats.totalSignals}`);
  if (stats.sharpeRatio === null) return fail(`sharpeRatio must be computed, got null`);
  if (!isFinite(stats.sharpeRatio)) return fail(`sharpeRatio must be finite, got ${stats.sharpeRatio}`);
  // 12 signals over 11 days → annualization span gate fails → null.
  if (stats.annualizedSharpeRatio !== null) {
    return fail(`annualizedSharpeRatio must be null (span ≈ 11d < 14), got ${stats.annualizedSharpeRatio}`);
  }
  // No NaN anywhere
  for (const k of Object.keys(stats)) {
    const v = stats[k];
    if (typeof v === "number" && !isFinite(v)) return fail(`field ${k} is non-finite: ${v}`);
  }
  pass(`Far-future timestamps handled cleanly: 12 signals, finite Sharpe, no NaN`);
});

// ---------------------------------------------------------------------------
// Test L: very long strategyName / symbol values. Memoize key handles
// arbitrary string lengths.
// ---------------------------------------------------------------------------
test("edge L: 5KB strategyName/symbol — memoize key doesn't crash, bucket works", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  const longSym = "S" + "x".repeat(5000);
  const longStrat = "T" + "y".repeat(5000);
  await svc.clear({ symbol: longSym, strategyName: longStrat, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // Build the tick manually — `toClosedTick` overrides strategyName with the
  // STRATEGY constant, which would route to the wrong bucket here.
  for (let i = 0; i < 12; i++) {
    const row = makeClosedRow(i, 0.4, longSym, { strategyName: longStrat });
    await svc.tick({
      action: "closed",
      signal: row,
      currentPrice: row.pnl.priceClose,
      closeReason: "take_profit",
      closeTimestamp: row.updatedAt,
      pnl: row.pnl,
      strategyName: longStrat,
      exchangeName: EXCHANGE,
      frameName: FRAME,
      symbol: longSym,
      backtest: true,
      createdAt: row.updatedAt,
    });
  }
  const stats = await svc.getData(longSym, longStrat, EXCHANGE, FRAME, true);
  if (stats.totalSignals !== 12) return fail(`totalSignals must be 12 (long key), got ${stats.totalSignals}`);
  pass(`5KB strategyName + 5KB symbol → bucket intact, 12 signals retained`);
});

// ---------------------------------------------------------------------------
// Test M: same signalId on different symbols (legitimate cross-strategy
// coincidence). The id is just a string in TickEvent; the bucket key is
// (symbol, strategy, exchange, frame, backtest). Same id on different
// symbol → different bucket → independent counts.
// ---------------------------------------------------------------------------
test("edge M: same signalId across different symbols → independent buckets", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: "ID-COLLIDE", frameName: FRAME, backtest: true });

  // Two symbols, each with 3 signals all sharing id="shared-id-001".
  for (let i = 0; i < 3; i++) {
    await svc.tick({
      ...toClosedTick(makeClosedRow(i, 0.5, "SYM-A", { id: "shared-id-001" })),
      exchangeName: "ID-COLLIDE",
    });
  }
  for (let i = 0; i < 3; i++) {
    await svc.tick({
      ...toClosedTick(makeClosedRow(i, -0.3, "SYM-B", { id: "shared-id-001" })),
      exchangeName: "ID-COLLIDE",
    });
  }

  const stats = await svc.getData("ID-COLLIDE", FRAME, true);
  if (stats.totalSymbols !== 2) return fail(`expected 2 symbols, got ${stats.totalSymbols}`);
  const a = stats.symbols.find((s) => s.symbol === "SYM-A");
  const b = stats.symbols.find((s) => s.symbol === "SYM-B");
  if (a?.totalTrades !== 3) return fail(`SYM-A must have 3 (id collision doesn't merge across symbols), got ${a?.totalTrades}`);
  if (b?.totalTrades !== 3) return fail(`SYM-B must have 3, got ${b?.totalTrades}`);
  pass(`Cross-symbol id collision doesn't merge buckets: A=${a.totalTrades}, B=${b.totalTrades}`);
});

// ---------------------------------------------------------------------------
// Test F: malformed tick — null / missing critical fields.
// The service should NOT crash, but may silently drop the tick.
// ---------------------------------------------------------------------------
test("edge F: malformed tick doesn't crash service", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  const SYM = "EDGE-MALFORMED";
  await svc.clear({ symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // First a legitimate tick to confirm bucket works
  await svc.tick(toClosedTick(makeClosedRow(0, 0.5, SYM), { symbolOverride: SYM }));

  // Malformed: tick without action — `data.action !== "closed"` is truthy
  // (undefined !== "closed"), so the service drops it.
  try {
    await svc.tick({ symbol: SYM });
  } catch (err) {
    fail(`tick({symbol:SYM}) threw: ${err.message}`);
    return;
  }
  // Malformed: action is wrong type
  try {
    await svc.tick({ action: 123, symbol: SYM });
  } catch (err) {
    fail(`tick with numeric action threw: ${err.message}`);
    return;
  }

  // Storage should still be healthy — verify with another good tick.
  await svc.tick(toClosedTick(makeClosedRow(1, 0.5, SYM), { symbolOverride: SYM }));
  const stats = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (stats.totalSignals !== 2) {
    fail(`malformed ticks must be dropped, only 2 valid ticks expected, got ${stats.totalSignals}`);
    return;
  }
  pass(`Malformed ticks dropped cleanly, 2 valid ticks retained`);
});

// ---------------------------------------------------------------------------
// Test C: tick() called WITHOUT subscribe() first. The tick handler is a
// public arrow function on the service — but the service guards getData /
// getReport / dump with a subscribe.hasValue() check. tick itself has no
// such guard. Documented behaviour: tick without subscribe quietly
// accumulates into storage; subsequent getData would throw (no subscribe).
// ---------------------------------------------------------------------------
test("edge C: tick() without subscribe doesn't throw, but getData throws as documented", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  // Force an unsubscribed state.
  await svc.unsubscribe();

  const SYM = "EDGE-NOSUB";
  // tick() shouldn't throw — it directly writes via getStorage.
  try {
    await svc.tick(toClosedTick(makeClosedRow(0, 0.5, SYM), { symbolOverride: SYM }));
  } catch (err) {
    fail(`tick() without subscribe threw: ${err.message}`);
    return;
  }

  // But getData should throw because subscribe.hasValue() is false.
  try {
    await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
    fail(`getData without subscribe must throw`);
    return;
  } catch (err) {
    if (!/subscribe/i.test(err.message)) {
      fail(`error must mention subscribe, got: ${err.message}`);
      return;
    }
  }
  pass(`tick() without subscribe quietly accepted; getData correctly throws`);
});

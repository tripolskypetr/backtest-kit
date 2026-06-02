import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/_measure_helpers.mjs";

// Storage-key contracts. CREATE_KEY_FN joins parts with ":" — anything in
// the parts that contains a ":" can collide with a neighbouring legitimate
// key.

const T0 = Date.UTC(2026, 0, 1);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const makeRow = (i, pnl, symbol, strategyName = STRATEGY) => ({
  id: `key-${symbol}-${i}`,
  symbol,
  strategyName,
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
});

// ---------------------------------------------------------------------------
// Test A: separator-injection collision via ":" in symbol.
// Two keys (sym1, strat1) and (sym2, strat2) where the joined string is the
// SAME — e.g. ("BTC:USDT", "strat-A") vs ("BTC", "USDT:strat-A").
// CREATE_KEY_FN joins with ":", so both yield "BTC:USDT:strat-A:...".
// LOCK IN that the service collapses them into the SAME storage. Either
// fix the keying (escape ":") or document the constraint.
// ---------------------------------------------------------------------------
test("storage_keys A: ':' separator collision merges (sym=BTC:USDT, strat=X) with (sym=BTC, strat=USDT:X) into one bucket", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear();

  // Variant 1
  for (let i = 0; i < 4; i++) {
    const row = makeRow(i, 1.0, "BTC:USDT", "strat-X");
    await svc.tick({ ...toClosedTick(row), symbol: "BTC:USDT", strategyName: "strat-X" });
  }
  // Variant 2
  for (let i = 0; i < 3; i++) {
    const row = makeRow(i, -1.0, "BTC", "USDT:strat-X");
    await svc.tick({ ...toClosedTick(row), symbol: "BTC", strategyName: "USDT:strat-X" });
  }

  // If the service collapses both into one bucket, getData on EITHER key
  // returns the combined 4+3=7. If the keys are properly distinct, each
  // returns its own count.
  const v1 = await svc.getData("BTC:USDT", "strat-X", EXCHANGE, FRAME, true);
  const v2 = await svc.getData("BTC", "USDT:strat-X", EXCHANGE, FRAME, true);

  // Document what the service ACTUALLY does — and treat divergence as a
  // signal something changed.
  if (v1.totalSignals === 7 && v2.totalSignals === 7) {
    pass(`':' collision documented: both keys resolve to a SHARED bucket (7 signals). The service does NOT escape separators — symbol/strategy with ":" can leak data across buckets.`);
    return;
  }
  if (v1.totalSignals === 4 && v2.totalSignals === 3) {
    pass(`Keys are isolated despite shared joined string — service must be escaping separators (unlikely in current impl but contract-safe).`);
    return;
  }
  fail(`unexpected mix: v1=${v1.totalSignals} v2=${v2.totalSignals}`);
});

// ---------------------------------------------------------------------------
// Test B: frameName falsy ("" or undefined) branch.
// CREATE_KEY_FN does `if (frameName) parts.push(frameName)` — empty string
// is skipped. So ("BTC", "strat", "binance", "", true) and
// ("BTC", "strat", "binance", undefined, true) produce the SAME key.
// Live mode often passes frameName="". Lock in this behaviour.
// ---------------------------------------------------------------------------
test("storage_keys B: frameName='' and frameName=undefined map to the same bucket (live mode contract)", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear();

  const SYM = "FRAME-EMPTY";

  // Tick with frameName=""
  for (let i = 0; i < 5; i++) {
    const row = makeRow(i, 0.5, SYM);
    await svc.tick({ ...toClosedTick(row, { symbolOverride: SYM }), frameName: "" });
  }
  // Tick with frameName=undefined
  for (let i = 0; i < 3; i++) {
    const row = makeRow(i, 0.3, SYM);
    const tick = toClosedTick(row, { symbolOverride: SYM });
    delete tick.frameName;
    await svc.tick(tick);
  }

  // Both should land in the same storage → 8 total when queried by either key.
  const sEmpty = await svc.getData(SYM, STRATEGY, EXCHANGE, "", true);
  const sUndef = await svc.getData(SYM, STRATEGY, EXCHANGE, undefined, true);

  if (sEmpty.totalSignals !== 8) {
    fail(`frameName="" must aggregate both inputs (5+3=8), got ${sEmpty.totalSignals}`);
    return;
  }
  if (sUndef.totalSignals !== 8) {
    fail(`frameName=undefined must hit the same bucket as "" (8), got ${sUndef.totalSignals}`);
    return;
  }
  // Different frameName, however, MUST go to a different bucket.
  const sFrame = await svc.getData(SYM, STRATEGY, EXCHANGE, "1m", true);
  if (sFrame.totalSignals !== 0) {
    fail(`a real frameName like "1m" must be a DIFFERENT bucket, got ${sFrame.totalSignals}`);
    return;
  }
  pass(`frameName="" and undefined share a bucket (8 signals), "1m" is separate (0)`);
});

// ---------------------------------------------------------------------------
// Test J: memoize identity — two getData calls hit the same storage instance.
// We can't introspect getStorage directly, but we can prove identity by
// observing that ticks fed BETWEEN two getData calls are visible to the
// second call. If getStorage returned a fresh instance, the second call
// would miss them.
// ---------------------------------------------------------------------------
test("storage_keys J: getStorage is memoised — interleaved ticks are visible to subsequent getData", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  const SYM = "MEMO-SAME";
  await svc.clear({ symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (let i = 0; i < 3; i++) {
    await svc.tick(toClosedTick(makeRow(i, 1.0, SYM), { symbolOverride: SYM }));
  }
  const s1 = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (s1.totalSignals !== 3) { fail(`s1: expected 3, got ${s1.totalSignals}`); return; }

  // Interleave more ticks
  for (let i = 3; i < 8; i++) {
    await svc.tick(toClosedTick(makeRow(i, 1.0, SYM), { symbolOverride: SYM }));
  }
  const s2 = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  if (s2.totalSignals !== 8) {
    fail(`s2 must see the interleaved ticks (8), got ${s2.totalSignals}. ` +
      `If 5, the second getData created a fresh storage — memoization regression.`);
    return;
  }
  pass(`Memoize identity verified: interleaved ticks (3 → 8) visible in second getData`);
});

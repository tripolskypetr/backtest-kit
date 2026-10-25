import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  setConfig,
  lib,
  listenSync,
  listenExit,
  listenError,
  OrderRejectedError,
  MethodContextService,
} from "../../build/index.mjs";

// The broker gate attacks the OPEN of a signal: the market entry (`onOrderOpenCommit`
// type "active") and the placement of a resting entry (type "schedule"). A transient
// refusal rolls the open back and re-submits the SAME row with the SAME id on the next
// tick with `attempt + 1`, up to CC_ORDER_OPEN_RETRY_ATTEMPTS; a terminal
// OrderRejectedError drops it at once; exhaustion drops it, raises the fatal exit event
// and lets the strategy generate a FRESH id; a retried row whose levels no longer fit
// the price is dropped by the consumption re-validation. The mirror of
// refuse_activate.test.mjs. The open retries are tick-based (entryInterval), so every
// watch must produce the same attempts and the same open; live open / placement retries
// in depth: retry.test.mjs and retry_sched.test.mjs.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-05-01T00:00:00Z");
const BASE = 100;
const TP = 119;
const SL = 85;
const ENTRY = 90;
const HOLD = 100;
const WATCHES = ["1m", "15m", "1h", "4h"];

const BASELINE = { CC_ORDER_OPEN_RETRY_ATTEMPTS: 5 };
const withConfig = async (overrides, fn) => {
  setConfig({ ...BASELINE, ...overrides }, true);
  try { return await fn(); } finally { setConfig(BASELINE, true); }
};

const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;

/**
 * The gate: strategyName → { attempts, refuse }. Both open flavours are recorded as
 * "type:attempt@minute"; `refuse({ type, attempt, at, index })` returns false (confirm),
 * true (transient: the callback throws) or "terminal" (OrderRejectedError).
 */
const GATES = new Map();
{
  const realService = Object.getPrototypeOf(lib.strategyConnectionService);
  const originalGetStrategy = realService.getStrategy;
  const wrapped = (...args) => {
    const strategy = originalGetStrategy(...args);
    const gate = GATES.get(strategy.params.strategyName);
    if (gate && !strategy.__openGate) {
      strategy.__openGate = true;
      const original = strategy.params.onOrderSync;
      strategy.params.onOrderSync = async (event) => {
        if (event.action === "signal-open") {
          const record = { type: event.type, attempt: event.attempt, at: minute(event.timestamp), id: event.signalId, index: gate.attempts.length, scheduled: event.scheduled };
          gate.attempts.push(record);
          const verdict = gate.refuse(record);
          if (verdict === "terminal") throw new OrderRejectedError("open attack: terminal rejection");
          if (verdict) throw new Error("open attack: transient refusal");
        }
        return await original(event);
      };
    }
    return strategy;
  };
  wrapped.clear = originalGetStrategy.clear;
  wrapped.has = originalGetStrategy.has;
  wrapped.values = originalGetStrategy.values;
  realService.getStrategy = wrapped;
}

const marketLong = () => ({ position: "long", priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: HOLD });
const restingLong = () => ({ position: "long", priceOpen: ENTRY, priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: HOLD });

/**
 * Flat candles at BASE with per-minute overrides; the frame ticks hourly. The strategy
 * returns `signal()` on EVERY tick until its first position opened (a deterministic
 * strategy re-issuing its idea), so a dropped open is regenerated on the next tick.
 */
const buildCase = (name, { watch, candleByMinute = {}, signal, refuse, frameHours = 6 }) => {
  const exchangeName = `refuse-open-exchange-${name}`;
  const strategyName = `refuse-open-strategy-${name}`;
  const frameName = `refuse-open-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`refuse open exchange: only 1m bars, got ${candleInterval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) {
        const custom = candleByMinute[Math.round((timestamp - FRAME_START) / MIN_MS)];
        out.push({ timestamp, open: BASE, high: BASE, low: BASE, close: BASE, volume: 1_000, ...custom });
        timestamp += MIN_MS;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  const state = { done: false, calls: [] };
  addStrategySchema({
    strategyName,
    interval: "1h",
    getSignal: async (_symbol, when) => {
      if (state.done) return null;
      state.calls.push(minute(when.getTime()));
      return signal();
    },
  });
  addFrameSchema({ frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + frameHours * HOUR_MS) });
  GATES.set(strategyName, { attempts: [], refuse });
  return { exchangeName, strategyName, frameName, state };
};

const runCase = async (schema) => {
  const events = { scheduled: [], opened: [], closed: [], exits: 0, errors: [] };
  const unsubscribe = [
    listenExit(() => { events.exits += 1; }),
    listenError((error) => { events.errors.push(error?.message ?? String(error)); }),
  ];
  try {
    for await (const result of Backtest.run("BTCUSDT", schema)) {
      if (result.action === "scheduled") events.scheduled.push(minute(result.signal.scheduledAt));
      if (result.action === "opened") { events.opened.push(minute(result.signal.pendingAt)); schema.state.done = true; }
      if (result.action === "closed") events.closed.push({ reason: result.closeReason, at: minute(result.closeTimestamp), price: Math.round(result.currentPrice * 1e6) / 1e6 });
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  const gate = GATES.get(schema.strategyName);
  return {
    attempts: gate.attempts.map((a) => `${a.type}:${a.attempt}@${a.at}`),
    scheduledFlags: gate.attempts.map((a) => a.scheduled),
    ids: new Set(gate.attempts.map((a) => a.id)).size,
    getSignalAt: schema.state.calls,
    scheduled: events.scheduled,
    opened: events.opened,
    closed: events.closed,
    exits: events.exits,
    errors: events.errors,
  };
};

const runOnWatches = async (name, spec, watches = WATCHES) => {
  const results = {};
  for (const watch of watches) results[watch] = await runCase(buildCase(`${name}-${watch}`, { ...spec, watch }));
  return results;
};

const differs = (results, pick, fail, what) => {
  const oracle = JSON.stringify(pick(results["1m"]));
  for (const watch of Object.keys(results)) {
    if (JSON.stringify(pick(results[watch])) !== oracle) {
      fail(`${what}: ${watch} watch differs from 1m — ${watch}: ${JSON.stringify(pick(results[watch]))} vs 1m: ${oracle}`);
      return true;
    }
  }
  return false;
};

const lifecycle = (r) => ({ attempts: r.attempts, ids: r.ids, getSignalAt: r.getSignalAt, scheduled: r.scheduled, opened: r.opened, closed: r.closed, exits: r.exits });
const expectOracle = (results, expected, fail, what) => {
  if (JSON.stringify(lifecycle(results["1m"])) !== JSON.stringify(expected)) { fail(`${what} on 1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(lifecycle(results["1m"]))}`); return true; }
  return differs(results, lifecycle, fail, what);
};
const first = (a) => a.attempt === 0 && a.index === 0;
const expired = (openedAt) => [{ reason: "time_expired", at: openedAt + HOLD, price: BASE }];

test("REFUSED OPEN: a transient refusal of the market entry re-submits the SAME row with the same id on the next tick as attempt 1, identically on every watch", async ({ pass, fail }) => {
  // the retry slot bypasses getSignal: the strategy is asked once (minute 0), the row is
  // re-submitted on the next hourly tick (60) and the position opens there
  const results = await runOnWatches("transient", { signal: marketLong, refuse: first });
  const expected = { attempts: ["active:0@0", "active:1@60"], ids: 1, getSignalAt: [0], scheduled: [], opened: [60], closed: expired(60), exits: 0 };
  if (expectOracle(results, expected, fail, "transient")) return;
  if (results["1m"].scheduledFlags.join(",") !== "false,false") return fail(`a market entry must carry scheduled=false on every attempt, got ${results["1m"].scheduledFlags.join(",")}`);
  pass(`open refused@0, same row re-submitted@60 as attempt 1 (getSignal not asked again), opened@60, scheduled=false on ${WATCHES.join("/")}`);
});

test("REFUSED OPEN: a terminal OrderRejectedError drops the row without arming the retry — the next tick generates a FRESH id with attempt 0", async ({ pass, fail }) => {
  const results = await runOnWatches("terminal", { signal: marketLong, refuse: (a) => (a.index === 0 ? "terminal" : false) });
  const expected = { attempts: ["active:0@0", "active:0@60"], ids: 2, getSignalAt: [0, 60], scheduled: [], opened: [60], closed: expired(60), exits: 0 };
  if (expectOracle(results, expected, fail, "terminal")) return;
  pass(`terminal rejection@0 dropped, fresh id generated and opened@60 (attempt 0), no exit, on ${WATCHES.join("/")}`);
});

test("REFUSED OPEN: transient refusals exhausted (CC_ORDER_OPEN_RETRY_ATTEMPTS=2) drop the row with one fatal exit event, and generation resumes with a fresh id", async ({ pass, fail }) => {
  await withConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 2 }, async () => {
    // attempts 0,1,2 of the same id on ticks 0,60,120 are refused; the fourth started attempt
    // would exceed the budget → dropped + exit on tick 180, where the fresh row opens at once
    const results = await runOnWatches("exhausted", { signal: marketLong, refuse: (a) => a.index < 3 });
    const expected = { attempts: ["active:0@0", "active:1@60", "active:2@120", "active:0@180"], ids: 2, getSignalAt: [0, 180], scheduled: [], opened: [180], closed: expired(180), exits: 1 };
    if (expectOracle(results, expected, fail, "exhausted")) return;
    pass(`attempts 0,1,2 refused on 0/60/120 → dropped with one exit, fresh id opened@180 on ${WATCHES.join("/")}`);
  });
});

test("REFUSED OPEN: with CC_ORDER_OPEN_RETRY_ATTEMPTS=0 the slot is disabled — every refused open regenerates a fresh id with attempt 0, no exit", async ({ pass, fail }) => {
  await withConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 0 }, async () => {
    const results = await runOnWatches("legacy", { signal: marketLong, refuse: first });
    const expected = { attempts: ["active:0@0", "active:0@60"], ids: 2, getSignalAt: [0, 60], scheduled: [], opened: [60], closed: expired(60), exits: 0 };
    if (expectOracle(results, expected, fail, "legacy")) return;
    pass(`retry disabled: refused@0, fresh id opened@60 as attempt 0 on ${WATCHES.join("/")}`);
  });
});

test("REFUSED OPEN: a retried row whose levels no longer fit the price is dropped by the consumption re-validation, not opened at a stale level", async ({ pass, fail }) => {
  // refused on tick 0 (price 100, stop 85); the tick of minute 60 prices the row with the VWAP of
  // candles 55..59, which sit at 80 — below the stop → the armed row is dropped without a gate
  // call and the tick stays idle; by tick 120 the price is back at 100 and a fresh row opens as
  // attempt 0
  const dip = Object.fromEntries(Array.from({ length: 56 }, (_, k) => [55 + k, { open: 80, high: 80, low: 80, close: 80 }]));
  const results = await runOnWatches("revalidate", { signal: marketLong, candleByMinute: dip, refuse: first });
  const expected = { attempts: ["active:0@0", "active:0@120"], ids: 2, getSignalAt: [0, 120], scheduled: [], opened: [120], closed: expired(120), exits: 0 };
  if (expectOracle(results, expected, fail, "re-validation")) return;
  if (!results["1m"].errors.some((m) => m.includes("re-validation"))) return fail(`expected the re-validation drop on the error bus, got ${JSON.stringify(results["1m"].errors)}`);
  pass(`refused@0, stale row dropped@60 (price 80 under the stop), fresh id opened@120 on ${WATCHES.join("/")}`);
});

test("REFUSED OPEN: a retried market row overtaken by the price is re-submitted as a RESTING order at its original price (same id) and activates when the price returns", async ({ pass, fail }) => {
  // the market row of tick 0 carries priceOpen 100; on tick 60 the price is 125, the row is still
  // valid (100 sits between the stop and the take-profit) and, with priceOpen now below the
  // market, the engine places it as a resting entry: gate type "schedule", attempt 1, same id.
  // The entry activates on the first candle back at 100 (111) as activation attempt 0.
  const spike = Object.fromEntries(Array.from({ length: 56 }, (_, k) => [55 + k, { open: 125, high: 125, low: 125, close: 125 }]));
  const results = await runOnWatches("overtaken", { signal: marketLong, candleByMinute: spike, refuse: first });
  const expected = { attempts: ["active:0@0", "schedule:1@60", "active:0@111"], ids: 1, getSignalAt: [0], scheduled: [60], opened: [111], closed: expired(111), exits: 0 };
  if (expectOracle(results, expected, fail, "overtaken")) return;
  // the flag is what tells the adapter to check the resting order's resolution at the activation
  if (results["1m"].scheduledFlags.join(",") !== "false,true,true") return fail(`expected scheduled flags false,true,true (market attempt, placement, activation), got ${results["1m"].scheduledFlags.join(",")}`);
  pass(`refused@0 at 100, re-submitted@60 as a resting entry at 100 (attempt 1, same id), activated@111 with scheduled=true on ${WATCHES.join("/")}`);
});

test("REFUSED OPEN: a strategy-supplied id rejected terminally is consumed — the same id re-issued on later ticks never reaches the gate again", async ({ pass, fail }) => {
  // the whipsaw guard: a deterministic strategy that re-emits the SAME id after a terminal
  // rejection must not place another real order; the gate sees exactly one attempt
  const results = await runOnWatches("consumed", { signal: () => ({ ...marketLong(), id: "refuse-open-fixed-id" }), refuse: () => "terminal" });
  const oracle = results["1m"];
  if (oracle.attempts.join(",") !== "active:0@0" || oracle.opened.length !== 0 || oracle.exits !== 0) return fail(`1m: expected a single rejected attempt and no open, got ${JSON.stringify(lifecycle(oracle))}`);
  if (oracle.getSignalAt.length < 2) return fail(`1m: the strategy must keep re-issuing the id on later ticks, got getSignal calls at ${oracle.getSignalAt.join(",")}`);
  if (differs(results, lifecycle, fail, "consumed id")) return;
  pass(`fixed id rejected@0 and consumed: re-issued on ticks ${oracle.getSignalAt.slice(1).join(",")} without another gate call, on ${WATCHES.join("/")}`);
});

test("REFUSED OPEN: a transient refusal of the resting-order placement re-submits the same row on the next tick; the later activation starts its own attempt count", async ({ pass, fail }) => {
  // placement refused on tick 0 and accepted on tick 60 as attempt 1 (same id); the entry is
  // touched on 80..85 → activation (type "active") attempt 0, position opens on 80
  const touch = Object.fromEntries(Array.from({ length: 6 }, (_, k) => [80 + k, { low: ENTRY }]));
  const results = await runOnWatches("placement", { signal: restingLong, candleByMinute: touch, refuse: (a) => a.type === "schedule" && a.index === 0 });
  const expected = { attempts: ["schedule:0@0", "schedule:1@60", "active:0@80"], ids: 1, getSignalAt: [0], scheduled: [60], opened: [80], closed: expired(80), exits: 0 };
  if (expectOracle(results, expected, fail, "placement")) return;
  if (results["1m"].scheduledFlags.join(",") !== "true,true,true") return fail(`a resting entry must carry scheduled=true on placement and activation, got ${results["1m"].scheduledFlags.join(",")}`);
  pass(`placement refused@0, same row placed@60 as attempt 1, activated@80 as attempt 0, scheduled=true throughout, on ${WATCHES.join("/")}`);
});

test("REFUSED OPEN: a terminal rejection of the placement drops the row; the fresh row is placed on the next tick and activates normally", async ({ pass, fail }) => {
  const touch = Object.fromEntries(Array.from({ length: 6 }, (_, k) => [80 + k, { low: ENTRY }]));
  const results = await runOnWatches("placement-terminal", { signal: restingLong, candleByMinute: touch, refuse: (a) => (a.type === "schedule" && a.index === 0 ? "terminal" : false) });
  const expected = { attempts: ["schedule:0@0", "schedule:0@60", "active:0@80"], ids: 2, getSignalAt: [0, 60], scheduled: [60], opened: [80], closed: expired(80), exits: 0 };
  if (expectOracle(results, expected, fail, "placement terminal")) return;
  pass(`placement rejected@0 dropped, fresh id placed@60, activated@80 on ${WATCHES.join("/")}`);
});

// ---------------------------------------------------------------------------
// Live mirror through the real tick (syncSubject → listenSync); the deep live coverage
// of the open and placement retries lives in retry.test.mjs / retry_sched.test.mjs.
// ---------------------------------------------------------------------------

const LIVE_PRICE = 50000;
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const makeLive = (name, signal) => {
  const context = { strategyName: `refuse-open-live-strategy-${name}`, exchangeName: `refuse-open-live-exchange-${name}`, frameName: "" };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const aligned = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      return Array.from({ length: limit }, (_, i) => ({ timestamp: aligned + i * MIN_MS, open: LIVE_PRICE, high: LIVE_PRICE, low: LIVE_PRICE, close: LIVE_PRICE, volume: 100 }));
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  let calls = 0;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => { calls += 1; return signal(); },
  });
  const runTick = (when) => MethodContextService.runInContext(
    async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
    context,
  );
  return { context, runTick, getSignalCalls: () => calls };
};

test("REFUSED OPEN (live): a transient refusal of the market entry leaves the tick idle and the next tick re-submits the same id as attempt 1", async ({ pass, fail }) => {
  const t0 = Date.parse("2024-05-01T00:00:00Z");
  const { context, runTick, getSignalCalls } = makeLive("transient", () => ({ position: "long", priceTakeProfit: LIVE_PRICE + 4000, priceStopLoss: LIVE_PRICE - 2000, minuteEstimatedTime: 120 }));
  const opens = [];
  let exits = 0;
  const unExit = listenExit(() => { exits += 1; });
  const unSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    opens.push({ id: event.signalId, attempt: event.attempt, scheduled: event.scheduled });
    if (opens.length === 1) throw new Error("live open attack: transient refusal");
  }, true);
  try {
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") return fail(`tick #1 expected "idle" (open refused), got "${tick1.action}"`);
    const tick2 = await runTick(new Date(t0 + MIN_MS));
    if (tick2.action !== "opened") return fail(`tick #2 expected "opened" (same row re-submitted), got "${tick2.action}"`);
    if (opens.map((o) => o.attempt).join(",") !== "0,1" || opens[0].id !== opens[1].id || tick2.signal.id !== opens[0].id) return fail(`expected attempts 0,1 on one id, got ${JSON.stringify(opens)} opened=${tick2.signal.id}`);
    if (getSignalCalls() !== 1) return fail(`the retry slot must bypass getSignal, got ${getSignalCalls()} calls`);
    if (!opens.every((o) => o.scheduled === false)) return fail(`a market entry must carry scheduled=false, got ${JSON.stringify(opens)}`);
    await settle();
    if (exits !== 0) return fail(`a transient refusal within the budget must not signal exit, got ${exits}`);
    pass(`open refused (attempt 0) → idle, re-submitted (attempt 1) → opened ${tick2.signal.id}, getSignal asked once`);
  } finally {
    unSync();
    unExit();
  }
});

test("REFUSED OPEN (live): a transient refusal of the placement leaves the tick idle and the next tick places the same id as attempt 1", async ({ pass, fail }) => {
  const t0 = Date.parse("2024-05-02T00:00:00Z");
  const { context, runTick, getSignalCalls } = makeLive("placement", () => ({ position: "long", priceOpen: LIVE_PRICE - 10000, priceTakeProfit: LIVE_PRICE - 6000, priceStopLoss: LIVE_PRICE - 12000, minuteEstimatedTime: 120 }));
  const placements = [];
  let exits = 0;
  const unExit = listenExit(() => { exits += 1; });
  const unSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "schedule") return;
    placements.push({ id: event.signalId, attempt: event.attempt });
    if (placements.length === 1) throw new Error("live open attack: placement refused transiently");
  }, true);
  try {
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") return fail(`tick #1 expected "idle" (placement refused), got "${tick1.action}"`);
    const tick2 = await runTick(new Date(t0 + MIN_MS));
    if (tick2.action !== "scheduled") return fail(`tick #2 expected "scheduled" (same row re-placed), got "${tick2.action}"`);
    if (placements.map((p) => p.attempt).join(",") !== "0,1" || placements[0].id !== placements[1].id || tick2.signal.id !== placements[0].id) return fail(`expected placement attempts 0,1 on one id, got ${JSON.stringify(placements)} scheduled=${tick2.signal.id}`);
    if (getSignalCalls() !== 1) return fail(`the retry slot must bypass getSignal, got ${getSignalCalls()} calls`);
    await settle();
    if (exits !== 0) return fail(`a transient placement refusal within the budget must not signal exit, got ${exits}`);
    pass(`placement refused (attempt 0) → idle, re-placed (attempt 1) → scheduled ${tick2.signal.id}, getSignal asked once`);
  } finally {
    unSync();
    unExit();
  }
});

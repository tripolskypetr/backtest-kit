import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  setPendingSignal,
  commitClosePending,
  listenIdlePing,
  listenSync,
  listenSignalEvent,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// `setPendingSignal` registers a position that is ALREADY open on the exchange: the
// application took the fill itself, at an exclusive price, and hands the engine the result
// to monitor. The contract under attack here: no open gate (the order exists), never a
// scheduled signal (the row is pending at its own priceOpen whatever the market says), the
// system defaults applied by the connection service, a throw BEFORE anything is written when
// the current price already sits beyond the stop or the take-profit, when a field is missing
// or when something is in flight — and, in a backtest, the candle replay from pendingAt on
// every watch, with the close gate carrying the adopted id.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-08-01T00:00:00Z");
const BASE = 100;
const TP = 119;
const SL = 85;
const HOLD = 100;
const WATCHES = ["1m", "15m", "1h", "4h"];

const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;

/**
 * Records every broker gate call of the named strategies: the open gate must stay silent
 * for an adopted position, the close gate must carry its id.
 */
const GATES = new Map();
{
  const realService = Object.getPrototypeOf(lib.strategyConnectionService);
  const originalGetStrategy = realService.getStrategy;
  const wrapped = (...args) => {
    const strategy = originalGetStrategy(...args);
    const gate = GATES.get(strategy.params.strategyName);
    if (gate && !strategy.__adoptGate) {
      strategy.__adoptGate = true;
      const original = strategy.params.onOrderSync;
      strategy.params.onOrderSync = async (event) => {
        gate.push({ action: event.action, type: event.type, id: event.signalId, at: minute(event.timestamp) });
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

/**
 * Flat candles at BASE with per-minute overrides; the frame ticks hourly. `adopt(symbol, at)`
 * runs inside getSignal on the tick of minute `at` (execution and method context present, as
 * for any strategy code); whatever it throws is recorded in `thrown` and getSignal returns null.
 */
const buildCase = (name, { watch, candleByMinute = {}, adopt, at = 60, frameHours = 6 }) => {
  const exchangeName = `adopt-exchange-${name}`;
  const strategyName = `adopt-strategy-${name}`;
  const frameName = `adopt-frame-${name}`;
  const thrown = [];
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`adopt exchange: only 1m bars, got ${candleInterval}`);
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
  let done = false;
  addStrategySchema({
    strategyName,
    interval: "1h",
    getSignal: async (symbol, when) => {
      if (done || minute(when.getTime()) !== at) return null;
      done = true;
      try {
        await adopt(symbol);
      } catch (error) {
        thrown.push(error?.message ?? String(error));
      }
      return null;
    },
  });
  addFrameSchema({ frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + frameHours * HOUR_MS) });
  GATES.set(strategyName, []);
  return { exchangeName, strategyName, frameName, thrown };
};

const runCase = async (schema) => {
  const events = { opened: [], scheduled: [], closed: [], lifecycle: [] };
  const own = (event) => event.strategyName === schema.strategyName;
  // the lifecycle channel (signalEventSubject): "opened" fires at the adoption itself, "closed" at the close
  const unSignal = listenSignalEvent((event) => { if (own(event)) events.lifecycle.push(`${event.action}:${event.data?.id ?? ""}@${minute(event.timestamp)}`); });
  try {
    for await (const result of Backtest.run("BTCUSDT", schema)) {
      if (result.action === "opened") events.opened.push({ id: result.signal.id, at: minute(result.signal.pendingAt), priceOpen: result.signal.priceOpen });
      if (result.action === "scheduled") events.scheduled.push(minute(result.signal.scheduledAt));
      if (result.action === "closed") events.closed.push({ id: result.signal.id, reason: result.closeReason, at: minute(result.closeTimestamp), price: Math.round(result.currentPrice * 1e6) / 1e6, pnl: Math.round(result.pnl.pnlPercentage * 1e4) / 1e4 });
    }
  } finally {
    unSignal();
  }
  const gate = GATES.get(schema.strategyName);
  return {
    opened: events.opened,
    scheduled: events.scheduled,
    closed: events.closed,
    lifecycleOpened: events.lifecycle.filter((e) => e.startsWith("opened:")),
    opens: gate.filter((g) => g.action === "signal-open").map((g) => `${g.type}:${g.id}@${g.at}`),
    closes: gate.filter((g) => g.action === "signal-close").map((g) => `${g.id}@${g.at}`),
    thrown: schema.thrown,
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

const outcome = (r) => ({ opened: r.opened, scheduled: r.scheduled, closed: r.closed, opens: r.opens, closes: r.closes, thrown: r.thrown });
const range = (from, to, candle) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, candle]));

test("ADOPT: a position bought at 95 while the market is at 100 is registered without the open gate, replayed from its pendingAt and closed by the engine with the adopted id on the close gate, identically on every watch", async ({ pass, fail }) => {
  const results = await runOnWatches("basic", {
    adopt: (symbol) => setPendingSignal(symbol, { id: "adopted-1", position: "long", priceOpen: 95, priceTakeProfit: TP, priceStopLoss: SL, minuteEstimatedTime: HOLD }),
  });
  const oracle = results["1m"];
  const expected = {
    opened: [{ id: "adopted-1", at: 60, priceOpen: 95 }],
    scheduled: [],
    closed: [{ id: "adopted-1", reason: "time_expired", at: 60 + HOLD, price: BASE, pnl: oracle.closed[0]?.pnl }],
    opens: [],
    closes: ["adopted-1@160"],
    thrown: [],
  };
  if (JSON.stringify(outcome(oracle)) !== JSON.stringify(expected)) return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(outcome(oracle))}`);
  if (!(oracle.closed[0].pnl > 4)) return fail(`the PnL must come from the adopted fill at 95 (about +5% at 100 minus fees), got ${oracle.closed[0].pnl}%`);
  if (oracle.lifecycleOpened.join(",") !== "opened:adopted-1@60") return fail(`expected one "opened" lifecycle event at adoption, got ${oracle.lifecycleOpened.join(",")}`);
  if (differs(results, outcome, fail, "basic")) return;
  pass(`adopted@60 at 95 (no open gate), expired@160 at 100 with pnl ${oracle.closed[0].pnl}%, close gate id adopted-1, on ${WATCHES.join("/")}`);
});

test("ADOPT: the adopted position is monitored candle by candle — a stop touched after the adoption closes on its exact minute on every watch", async ({ pass, fail }) => {
  const results = await runOnWatches("stop", {
    candleByMinute: range(80, 83, { low: SL }),
    adopt: (symbol) => setPendingSignal(symbol, { id: "adopted-stop", position: "long", priceOpen: 95, priceTakeProfit: TP, priceStopLoss: SL, minuteEstimatedTime: HOLD }),
  });
  const oracle = results["1m"];
  if (JSON.stringify(oracle.closed.map((c) => `${c.reason}@${c.at}`)) !== JSON.stringify(["stop_loss@80"]) || oracle.opens.length !== 0) return fail(`1m: expected stop_loss@80 with no open gate, got ${JSON.stringify(outcome(oracle))}`);
  if (differs(results, outcome, fail, "stop")) return;
  pass(`adopted@60, stop_loss@80 at ${SL}, close gate id adopted-stop, on ${WATCHES.join("/")}`);
});

test("ADOPT: an exclusive price far below the market is still a PENDING position, never a scheduled one", async ({ pass, fail }) => {
  // bought at 80 while the market is at 100: a getSignal DTO with priceOpen 80 would be a
  // resting order; setPendingSignal records an open position at 80 at once
  const results = await runOnWatches("exclusive", {
    adopt: (symbol) => setPendingSignal(symbol, { id: "adopted-cheap", position: "long", priceOpen: 80, priceTakeProfit: TP, priceStopLoss: 70, minuteEstimatedTime: HOLD }),
  });
  const oracle = results["1m"];
  if (oracle.scheduled.length !== 0 || oracle.opened.length !== 1 || oracle.opened[0].priceOpen !== 80 || oracle.opened[0].at !== 60) return fail(`1m: expected a pending position at 80 and no scheduled signal, got ${JSON.stringify(outcome(oracle))}`);
  if (!(oracle.closed[0]?.pnl > 24)) return fail(`the PnL must come from the fill at 80 (about +25% at 100), got ${JSON.stringify(oracle.closed)}`);
  if (differs(results, outcome, fail, "exclusive")) return;
  pass(`adopted@60 at 80 with the market at 100: pending at once, no scheduled phase, pnl ${oracle.closed[0].pnl}% on ${WATCHES.join("/")}`);
});

test("ADOPT: a current price already beyond the stop or the take-profit throws BEFORE anything is written — no position, no event, no gate call", async ({ pass, fail }) => {
  const report = [];
  for (const [label, dto, needle] of [
    ["stop above the market", { id: "adopted-bad-sl", position: "long", priceOpen: 110, priceTakeProfit: 130, priceStopLoss: 105, minuteEstimatedTime: HOLD }, "priceStopLoss"],
    ["take-profit below the market", { id: "adopted-bad-tp", position: "long", priceOpen: 90, priceTakeProfit: 95, priceStopLoss: 85, minuteEstimatedTime: HOLD }, "priceTakeProfit"],
  ]) {
    const result = await runCase(buildCase(`beyond-${label.split(" ")[0]}`, { watch: "1m", adopt: (symbol) => setPendingSignal(symbol, dto) }));
    if (result.thrown.length !== 1 || !result.thrown[0].includes(needle)) return fail(`${label}: expected a throw naming ${needle}, got ${JSON.stringify(result.thrown)}`);
    if (result.opened.length || result.closed.length || result.opens.length || result.closes.length || result.lifecycleOpened.length) return fail(`${label}: nothing may be written after the throw, got ${JSON.stringify(outcome(result))}`);
    report.push(`${label}: "${result.thrown[0].slice(0, 60)}…"`);
  }
  pass(report.join(" | "));
});

test("ADOPT: a DTO without priceOpen is refused before any write; a DTO without id gets a generated one that the close gate then carries", async ({ pass, fail }) => {
  const refused = await runCase(buildCase("missing-price", { watch: "1m", adopt: (symbol) => setPendingSignal(symbol, { id: "adopted-no-price", position: "long", priceTakeProfit: TP, priceStopLoss: SL }) }));
  if (refused.thrown.length !== 1 || !refused.thrown[0].includes("priceOpen is required")) return fail(`no priceOpen: expected a throw saying "priceOpen is required", got ${JSON.stringify(refused.thrown)}`);
  if (refused.opened.length || refused.opens.length || refused.lifecycleOpened.length) return fail(`no priceOpen: nothing may be written, got ${JSON.stringify(outcome(refused))}`);
  const generated = await runCase(buildCase("missing-id", { watch: "1m", adopt: (symbol) => setPendingSignal(symbol, { position: "long", priceOpen: 95, priceTakeProfit: TP, priceStopLoss: SL, minuteEstimatedTime: HOLD }) }));
  if (generated.thrown.length || generated.opened.length !== 1 || typeof generated.opened[0].id !== "string" || generated.opened[0].id.length === 0) return fail(`no id: expected an adoption with a generated id, got thrown=${JSON.stringify(generated.thrown)} ${JSON.stringify(outcome(generated))}`);
  const id = generated.opened[0].id;
  if (generated.closed.length !== 1 || generated.closed[0].id !== id || generated.closes.join(",") !== `${id}@160`) return fail(`no id: the generated id must reach the close and the close gate, got ${JSON.stringify(outcome(generated))}`);
  pass(`no priceOpen: refused | no id: generated ${id.slice(0, 8)}…, carried by the close gate`);
});

test("ADOPT: a second adoption while a position is in flight is refused, the first one lives on", async ({ pass, fail }) => {
  const result = await runCase(buildCase("in-flight", {
    watch: "1m",
    adopt: async (symbol) => {
      await setPendingSignal(symbol, { id: "adopted-first", position: "long", priceOpen: 95, priceTakeProfit: TP, priceStopLoss: SL, minuteEstimatedTime: HOLD });
      await setPendingSignal(symbol, { id: "adopted-second", position: "long", priceOpen: 96, priceTakeProfit: TP, priceStopLoss: SL, minuteEstimatedTime: HOLD });
    },
  }));
  if (result.thrown.length !== 1 || !result.thrown[0].includes("pending signal already exists")) return fail(`expected the second adoption to be refused, got ${JSON.stringify(result.thrown)}`);
  if (JSON.stringify(result.opened) !== JSON.stringify([{ id: "adopted-first", at: 60, priceOpen: 95 }]) || result.closed.length !== 1 || result.closed[0].id !== "adopted-first") return fail(`the first adoption must stand alone, got ${JSON.stringify(outcome(result))}`);
  pass(`second adoption refused ("${result.thrown[0].slice(0, 70)}"), adopted-first expired@${result.closed[0].at}`);
});

test("ADOPT: the call works from the strategy's onIdle callback, from a listenIdlePing listener (the contexts propagate into the awaited listener chain) and, with an explicit context, through Backtest.setPendingSignal from anywhere", async ({ pass, fail }) => {
  const report = [];
  // 1. schema callback onIdle: runs inside the tick, both contexts present
  {
    const thrown = [];
    let tried = false;
    const schema = buildCase("from-onidle", { watch: "1m", at: -1, adopt: async () => {} });
    const realSchema = lib.strategySchemaService.get(schema.strategyName);
    realSchema.callbacks = { onIdle: async (symbol, _price, when) => {
      if (tried || minute(when.getTime()) !== 60) return;
      tried = true;
      try { await setPendingSignal(symbol, { id: "from-onidle", position: "long", priceOpen: 95, priceTakeProfit: TP, priceStopLoss: SL, minuteEstimatedTime: HOLD }); } catch (error) { thrown.push(error?.message ?? String(error)); }
    } };
    const result = await runCase(schema);
    if (!tried || thrown.length || JSON.stringify(result.opened) !== JSON.stringify([{ id: "from-onidle", at: 60, priceOpen: 95 }]) || result.opens.length) return fail(`onIdle: expected the adoption at 60, got tried=${tried} thrown=${JSON.stringify(thrown)} ${JSON.stringify(outcome(result))}`);
    report.push("onIdle callback: adopted@60");
  }
  // 2. listenIdlePing listener with the in-context function: the listener is awaited inside the ping emit, the contexts propagate
  {
    const thrown = [];
    let tried = false;
    const schema = buildCase("from-listener", { watch: "1m", at: -1, adopt: async () => {} });
    const un = listenIdlePing(async (event) => {
      if (event.strategyName !== schema.strategyName || tried || minute(event.timestamp) !== 60) return;
      tried = true;
      try { await setPendingSignal(event.symbol, { id: "from-listener", position: "long", priceOpen: 95, priceTakeProfit: TP, priceStopLoss: SL, minuteEstimatedTime: HOLD }); } catch (error) { thrown.push(error?.message ?? String(error)); }
    });
    let result;
    try { result = await runCase(schema); } finally { un(); }
    if (!tried || thrown.length || JSON.stringify(result.opened) !== JSON.stringify([{ id: "from-listener", at: 60, priceOpen: 95 }]) || result.opens.length) return fail(`listener: expected the adoption at 60, got tried=${tried} thrown=${JSON.stringify(thrown)} ${JSON.stringify(outcome(result))}`);
    report.push("listenIdlePing + function: adopted@60");
  }
  // 3. class-level call with an explicit context: no execution or method context needed
  {
    const thrown = [];
    let tried = false;
    const schema = buildCase("from-class", { watch: "1m", at: -1, adopt: async () => {} });
    const context = { strategyName: schema.strategyName, exchangeName: schema.exchangeName, frameName: schema.frameName };
    const un = listenIdlePing(async (event) => {
      if (event.strategyName !== schema.strategyName || tried || minute(event.timestamp) !== 60) return;
      tried = true;
      try { await Backtest.setPendingSignal(event.symbol, context, { id: "from-class", position: "long", priceOpen: 95, priceTakeProfit: TP, priceStopLoss: SL, minuteEstimatedTime: HOLD }); } catch (error) { thrown.push(error?.message ?? String(error)); }
    });
    let result;
    try { result = await runCase(schema); } finally { un(); }
    if (!tried || thrown.length || JSON.stringify(result.opened) !== JSON.stringify([{ id: "from-class", at: 60, priceOpen: 95 }]) || result.opens.length) return fail(`Backtest.setPendingSignal: expected the adoption at 60, got tried=${tried} thrown=${JSON.stringify(thrown)} ${JSON.stringify(outcome(result))}`);
    report.push("Backtest.setPendingSignal with context: adopted@60");
  }
  pass(report.join(" | "));
});

// ---------------------------------------------------------------------------
// Live: through the real tick, with the broker gate on syncSubject.
// ---------------------------------------------------------------------------

const LIVE_PRICE = 50000;

test("ADOPT (live): a position adopted from getSignal is monitored from the next tick without an open gate, and its close gate carries the adopted id", async ({ pass, fail }) => {
  const t0 = Date.parse("2024-08-01T00:00:00Z");
  const context = { strategyName: "adopt-live-strategy", exchangeName: "adopt-live-exchange", frameName: "" };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const aligned = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      return Array.from({ length: limit }, (_, i) => ({ timestamp: aligned + i * MIN_MS, open: LIVE_PRICE, high: LIVE_PRICE, low: LIVE_PRICE, close: LIVE_PRICE, volume: 100 }));
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  let adopted = false;
  let closeAsked = false;
  const thrown = [];
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async (symbol) => {
      if (adopted) return null;
      adopted = true;
      try {
        await setPendingSignal(symbol, { id: "live-adopted", position: "long", priceOpen: 49000, priceTakeProfit: 60000, priceStopLoss: 40000, minuteEstimatedTime: 120 });
      } catch (error) {
        thrown.push(error?.message ?? String(error));
      }
      return null;
    },
    callbacks: {
      onActivePing: async (symbol) => {
        if (closeAsked) return;
        closeAsked = true;
        await commitClosePending(symbol);
      },
    },
  });
  const gate = [];
  const unSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    gate.push(`${event.action}:${event.type ?? ""}:${event.signalId}`);
  }, true);
  const runTick = (when) => MethodContextService.runInContext(
    async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
    context,
  );
  try {
    const actions = [];
    for (let i = 0; i < 4; i++) actions.push((await runTick(new Date(t0 + i * MIN_MS))).action);
    if (thrown.length) return fail(`adoption threw: ${thrown.join(" | ")}`);
    // tick 1 adopts inside getSignal and still reports idle (the pending check ran before getSignal);
    // tick 2 monitors the adopted position; the ping asks to close; tick 3 closes it through the gate
    if (actions.join(",") !== "idle,active,closed,idle") return fail(`expected idle,active,closed,idle, got ${actions.join(",")}`);
    if (gate.some((g) => g.startsWith("signal-open"))) return fail(`the open gate must not fire for an adopted position, got ${gate.join(",")}`);
    if (!gate.includes("signal-close:active:live-adopted")) return fail(`the close gate must carry the adopted id, got ${gate.join(",")}`);
    pass(`adopted at 49000 without an open gate, monitored on the next tick, closed through the gate as live-adopted: ${actions.join(" → ")}`);
  } finally {
    unSync();
  }
});

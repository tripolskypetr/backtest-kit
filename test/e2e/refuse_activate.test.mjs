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
  commitActivateScheduled,
  OrderRejectedError,
  MethodContextService,
} from "../../build/index.mjs";

// The broker gate attacks the ACTIVATION of a resting entry (`onOrderOpenCommit` type
// "active", fired when the price touches priceOpen or when the adapter reports the fill
// through activateScheduled). A transient refusal must keep the scheduled signal and retry
// the activation on the next candle / tick with the SAME id and `attempt + 1`, up to
// CC_ORDER_OPEN_RETRY_ATTEMPTS — never cancel the resting order the adapter may have
// just filled. A terminal OrderRejectedError and an exhausted budget cancel it (reason
// "user"); exhaustion also raises the fatal exit event. The backtest oracle is the 1m
// watch: every coarser watch must produce the same attempts, activation and close.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-04-01T00:00:00Z");
const BASE = 100;
const ENTRY = 90;
const SL = 80;
const TP = 120;
const HOLD = 100;
const WATCHES = ["1m", "15m", "1h", "4h"];

const BASELINE = { CC_ORDER_OPEN_RETRY_ATTEMPTS: 5 };
const withConfig = async (overrides, fn) => {
  setConfig({ ...BASELINE, ...overrides }, true);
  try { return await fn(); } finally { setConfig(BASELINE, true); }
};

const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;

/**
 * The gate: strategyName → { attempts, refuse }. Only the activation (`signal-open`,
 * type "active") is attacked; the placement (`type "schedule"`) always passes.
 * `refuse({ attempt, at })` returns false (confirm), true (transient: the callback
 * throws) or "terminal" (OrderRejectedError). Backtest gates short-circuit to
 * "confirmed", so the refusal is fed through params.onOrderSync of the strategy.
 */
const GATES = new Map();
{
  const realService = Object.getPrototypeOf(lib.strategyConnectionService);
  const originalGetStrategy = realService.getStrategy;
  const wrapped = (...args) => {
    const strategy = originalGetStrategy(...args);
    const gate = GATES.get(strategy.params.strategyName);
    if (gate && !strategy.__activateGate) {
      strategy.__activateGate = true;
      const original = strategy.params.onOrderSync;
      strategy.params.onOrderSync = async (event) => {
        if (event.action === "signal-open" && event.type === "active") {
          const record = { attempt: event.attempt, at: minute(event.timestamp), id: event.signalId };
          gate.attempts.push(record);
          const verdict = gate.refuse(record);
          if (verdict === "terminal") throw new OrderRejectedError("activate attack: terminal rejection");
          if (verdict) throw new Error("activate attack: transient refusal");
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

/**
 * Flat candles at BASE with per-minute overrides; the frame ticks hourly, the strategy
 * places one resting long at ENTRY (below the market) on its first tick (minute 0).
 */
const buildCase = (name, { watch, candleByMinute = {}, refuse, callbacks = undefined, frameHours = 6 }) => {
  const exchangeName = `refuse-activate-exchange-${name}`;
  const strategyName = `refuse-activate-strategy-${name}`;
  const frameName = `refuse-activate-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`refuse activate exchange: only 1m bars, got ${candleInterval}`);
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
  let issued = false;
  addStrategySchema({
    strategyName,
    interval: "1h",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "long", priceOpen: ENTRY, priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: HOLD };
    },
    ...(callbacks && { callbacks }),
  });
  addFrameSchema({ frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + frameHours * HOUR_MS) });
  GATES.set(strategyName, { attempts: [], refuse });
  return { exchangeName, strategyName, frameName };
};

/** Runs the case; the gate attempts come back as "attempt@minute", the lifecycle as minutes */
const runCase = async (schema) => {
  const events = { scheduled: [], opened: [], cancelled: [], closed: [], exits: [], errors: [] };
  const unsubscribe = [
    listenExit((error) => { events.exits.push(error?.message ?? String(error)); }),
    listenError((error) => { events.errors.push(error?.name ?? String(error)); }),
  ];
  try {
    for await (const result of Backtest.run("BTCUSDT", schema)) {
      if (result.action === "scheduled") events.scheduled.push(minute(result.signal.scheduledAt));
      if (result.action === "opened") events.opened.push({ at: minute(result.signal.pendingAt), id: result.signal.id });
      if (result.action === "cancelled") events.cancelled.push({ reason: result.reason, at: minute(result.closeTimestamp) });
      if (result.action === "closed") events.closed.push({ reason: result.closeReason, at: minute(result.closeTimestamp), price: Math.round(result.currentPrice * 1e6) / 1e6 });
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  const gate = GATES.get(schema.strategyName);
  return {
    attempts: gate.attempts.map((a) => `${a.attempt}@${a.at}`),
    sameId: new Set(gate.attempts.map((a) => a.id)).size <= 1,
    opened: events.opened.map((o) => o.at),
    cancelled: events.cancelled,
    closed: events.closed,
    exits: events.exits.length,
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

const touch = (from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, { low: ENTRY }]));
const first = (a) => a.attempt === 0;
const lifecycle = (r) => ({ attempts: r.attempts, sameId: r.sameId, opened: r.opened, cancelled: r.cancelled, closed: r.closed, exits: r.exits });

test("REFUSED ACTIVATE: a transient refusal of the activation keeps the resting entry and retries on the next candle with attempt 1, identically on every watch", async ({ pass, fail }) => {
  // the entry is touched on minutes 20..25; the first activation attempt (20) is refused: the
  // position must open on 21 (pendingAt 21) with the same id, nothing is cancelled, and the
  // hold then expires on 121
  const results = await runOnWatches("transient", { candleByMinute: touch(20, 25), refuse: first });
  const expected = { attempts: ["0@21", "1@22"], sameId: true, opened: [22], cancelled: [], closed: [{ reason: "time_expired", at: 122, price: BASE }], exits: 0 };
  if (JSON.stringify(lifecycle(results["1m"])) !== JSON.stringify(expected)) return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  if (differs(results, lifecycle, fail, "transient")) return;
  pass(`activation refused@20, retried and opened@21 (attempt 1, same id), expired@121 on ${WATCHES.join("/")}`);
});

test("REFUSED ACTIVATE: a terminal OrderRejectedError cancels the resting entry on the refused candle, no retry", async ({ pass, fail }) => {
  const results = await runOnWatches("terminal", { candleByMinute: touch(20, 25), refuse: (a) => (a.attempt === 0 ? "terminal" : false) });
  const expected = { attempts: ["0@21"], sameId: true, opened: [], cancelled: [{ reason: "user", at: 21 }], closed: [], exits: 0 };
  if (JSON.stringify(lifecycle(results["1m"])) !== JSON.stringify(expected)) return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  if (differs(results, lifecycle, fail, "terminal")) return;
  pass(`terminal rejection@20 → cancelled (user)@20, no retry, on ${WATCHES.join("/")}`);
});

test("REFUSED ACTIVATE: transient refusals exhausted (CC_ORDER_OPEN_RETRY_ATTEMPTS=2) cancel the entry on the third attempt and raise the fatal exit event once", async ({ pass, fail }) => {
  await withConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 2 }, async () => {
    const results = await runOnWatches("exhausted", { candleByMinute: touch(20, 40), refuse: () => true });
    const expected = { attempts: ["0@21", "1@22", "2@23"], sameId: true, opened: [], cancelled: [{ reason: "user", at: 23 }], closed: [], exits: 1 };
    if (JSON.stringify(lifecycle(results["1m"])) !== JSON.stringify(expected)) return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
    if (differs(results, lifecycle, fail, "exhausted")) return;
    pass(`attempts 0@20,1@21,2@22 refused → cancelled (user)@22, one exit event, on ${WATCHES.join("/")}`);
  });
});

test("REFUSED ACTIVATE: with CC_ORDER_OPEN_RETRY_ATTEMPTS=0 the legacy rule holds — any refusal cancels the entry at once", async ({ pass, fail }) => {
  await withConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 0 }, async () => {
    const results = await runOnWatches("legacy", { candleByMinute: touch(20, 25), refuse: first });
    const expected = { attempts: ["0@21"], sameId: true, opened: [], cancelled: [{ reason: "user", at: 21 }], closed: [], exits: 0 };
    if (JSON.stringify(lifecycle(results["1m"])) !== JSON.stringify(expected)) return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
    if (differs(results, lifecycle, fail, "legacy")) return;
    pass(`retry disabled: transient refusal@20 → cancelled (user)@20 on ${WATCHES.join("/")}`);
  });
});

test("REFUSED ACTIVATE: a refusal streak across a span end gets one attempt per touching candle, none skipped", async ({ pass, fail }) => {
  // touched from 57 to 70, five refusals: attempts on 57..62 across the 15m / 1h span end 59
  const results = await runOnWatches("streak", { candleByMinute: touch(57, 70), refuse: (a) => a.attempt < 5 });
  const expected = { attempts: ["0@58", "1@59", "2@60", "3@61", "4@62", "5@63"], sameId: true, opened: [63], cancelled: [], closed: [{ reason: "time_expired", at: 163, price: BASE }], exits: 0 };
  if (JSON.stringify(lifecycle(results["1m"])) !== JSON.stringify(expected)) return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  if (differs(results, lifecycle, fail, "streak")) return;
  pass(`six attempts on 57..62 across the span end 59, opened@62 on ${WATCHES.join("/")}`);
});

test("REFUSED ACTIVATE: when the price leaves the entry after the refusal the order keeps resting, and the next touch activates as attempt 1", async ({ pass, fail }) => {
  // touched on 20 only (refused), flat again, touched on 50..52: no cancel in between,
  // the activation on 50 carries attempt 1 (the adapter must reconcile the prior POST)
  const results = await runOnWatches("walk-away", { candleByMinute: { ...touch(20, 20), ...touch(50, 52) }, refuse: first });
  const expected = { attempts: ["0@21", "1@51"], sameId: true, opened: [51], cancelled: [], closed: [{ reason: "time_expired", at: 151, price: BASE }], exits: 0 };
  if (JSON.stringify(lifecycle(results["1m"])) !== JSON.stringify(expected)) return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  if (differs(results, lifecycle, fail, "walk away")) return;
  pass(`refused@20, price away, next touch opened@50 as attempt 1 on ${WATCHES.join("/")}`);
});

test("REFUSED ACTIVATE: an activation requested by the adapter (activateScheduled) and refused transiently is re-queued and retried on the next candle", async ({ pass, fail }) => {
  // the adapter reports the fill from the look of candle 59, dated 60 (a span end of the 1m,
  // 15m and 1h watches; a 4h watch has no look before the 120-minute wait expires, so it is
  // left out); the user activation runs on candle 60 (dated 61) and is refused, the retry on
  // candle 61 (dated 62) is accepted
  const pingWatches = ["1m", "15m", "1h"];
  const results = await runOnWatches("user-activate", {
    refuse: first,
    callbacks: {
      onSchedulePing: async (symbol, data, _price, when) => {
        if (minute(when.getTime()) === 60) await commitActivateScheduled(symbol, { id: data.id });
      },
    },
  }, pingWatches);
  const expected = { attempts: ["0@61", "1@62"], sameId: true, opened: [62], cancelled: [], closed: [{ reason: "time_expired", at: 162, price: BASE }], exits: 0 };
  if (JSON.stringify(lifecycle(results["1m"])) !== JSON.stringify(expected)) return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  if (differs(results, lifecycle, fail, "user activate")) return;
  pass(`activateScheduled from the look dated 60, refused@61, retried and opened@62 on ${pingWatches.join("/")}`);
});

// ---------------------------------------------------------------------------
// Live: the same gate through the real tick (syncSubject → listenSync), where the
// refusal used to cancel the resting order at the very moment it was likely filled.
// ---------------------------------------------------------------------------

const LIVE_BASE = 50000;
const LIVE_ENTRY = 40000;
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const makeLive = (name, getPrice) => {
  const context = { strategyName: `refuse-activate-live-strategy-${name}`, exchangeName: `refuse-activate-live-exchange-${name}`, frameName: "" };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const aligned = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      const price = getPrice();
      return Array.from({ length: limit }, (_, i) => ({ timestamp: aligned + i * MIN_MS, open: price, high: price, low: price, close: price, volume: 100 }));
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "long", priceOpen: LIVE_ENTRY, priceTakeProfit: LIVE_ENTRY + 4000, priceStopLoss: LIVE_ENTRY - 2000, minuteEstimatedTime: 120 };
    },
  });
  const runTick = (when) => MethodContextService.runInContext(
    async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
    context,
  );
  return { context, runTick };
};

test("REFUSED ACTIVATE (live): a transient refusal of the activation gate keeps the tick waiting and the next tick activates with attempt 1 and the same id", async ({ pass, fail }) => {
  const t0 = Date.parse("2024-04-01T00:00:00Z");
  let price = LIVE_BASE;
  const { context, runTick } = makeLive("transient", () => price);
  const activations = [];
  let exits = 0;
  const unExit = listenExit(() => { exits += 1; });
  const unSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    activations.push({ id: event.signalId, attempt: event.attempt, scheduled: event.scheduled });
    if (activations.length === 1) throw new Error("live activate attack: transient refusal");
  }, true);
  try {
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") return fail(`tick #1 expected "scheduled" (resting entry placed), got "${tick1.action}"`);
    price = LIVE_ENTRY;
    const tick2 = await runTick(new Date(t0 + MIN_MS));
    if (tick2.action !== "waiting") return fail(`tick #2 expected "waiting" (activation refused transiently, entry kept), got "${tick2.action}"`);
    const tick3 = await runTick(new Date(t0 + 2 * MIN_MS));
    if (tick3.action !== "opened") return fail(`tick #3 expected "opened" (activation retried), got "${tick3.action}"`);
    const attempts = activations.map((a) => a.attempt).join(",");
    if (attempts !== "0,1" || activations[0].id !== activations[1].id || tick3.signal.id !== activations[0].id) {
      return fail(`expected activation attempts 0,1 on the same id, got ${JSON.stringify(activations)} opened=${tick3.signal.id}`);
    }
    if (!activations.every((a) => a.scheduled === true)) return fail(`every activation event must carry scheduled=true (a resting order exists under this id), got ${JSON.stringify(activations)}`);
    await settle();
    if (exits !== 0) return fail(`a transient activation refusal within the budget must not signal exit, got ${exits}`);
    pass(`placed, activation refused (attempt 0) → waiting, retried (attempt 1) → opened ${tick3.signal.id}, scheduled=true on both`);
  } finally {
    unSync();
    unExit();
  }
});

test("REFUSED ACTIVATE (live): exhausted activation attempts cancel the resting entry and signal the fatal exit once", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 2 }, true);
  const t0 = Date.parse("2024-04-02T00:00:00Z");
  let price = LIVE_BASE;
  const { context, runTick } = makeLive("exhausted", () => price);
  const activations = [];
  let exits = 0;
  const unExit = listenExit(() => { exits += 1; });
  const unSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    activations.push({ id: event.signalId, attempt: event.attempt });
    throw new Error("live activate attack: always refused");
  }, true);
  try {
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") return fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
    price = LIVE_ENTRY;
    const actions = [];
    for (let i = 1; i <= 3; i++) actions.push((await runTick(new Date(t0 + i * MIN_MS))).action);
    if (actions.join(",") !== "waiting,waiting,idle") return fail(`expected waiting,waiting,idle (two retries kept the entry, the third refusal cancelled it), got ${actions.join(",")}`);
    const attempts = activations.map((a) => a.attempt).join(",");
    if (attempts !== "0,1,2" || new Set(activations.map((a) => a.id)).size !== 1) return fail(`expected attempts 0,1,2 on one id, got ${JSON.stringify(activations)}`);
    await settle();
    if (exits !== 1) return fail(`exhausted activation attempts must signal the fatal exit exactly once, got ${exits}`);
    pass(`attempts 0,1,2 refused → entry cancelled on the third, fatal exit signaled once`);
  } finally {
    unSync();
    unExit();
    setConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 5 }, true);
  }
});

test("REFUSED ACTIVATE (live): a terminal OrderRejectedError on the activation cancels the entry at once without exit, and the strategy may place a fresh one", async ({ pass, fail }) => {
  const t0 = Date.parse("2024-04-03T00:00:00Z");
  let price = LIVE_BASE;
  const { context, runTick } = makeLive("terminal", () => price);
  const activations = [];
  let exits = 0;
  const unExit = listenExit(() => { exits += 1; });
  const unSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    activations.push({ id: event.signalId, attempt: event.attempt });
    throw new OrderRejectedError("live activate attack: terminal");
  }, true);
  try {
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") return fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
    price = LIVE_ENTRY;
    const tick2 = await runTick(new Date(t0 + MIN_MS));
    if (tick2.action !== "idle") return fail(`tick #2 expected "idle" (terminal rejection cancelled the entry), got "${tick2.action}"`);
    if (activations.length !== 1 || activations[0].attempt !== 0) return fail(`expected a single activation attempt 0, got ${JSON.stringify(activations)}`);
    await settle();
    if (exits !== 0) return fail(`a terminal business rejection must not signal exit, got ${exits}`);
    pass(`terminal rejection on activation → cancelled at once, attempt 0 only, no exit`);
  } finally {
    unSync();
    unExit();
  }
});

// ---------------------------------------------------------------------------
// The frame end: an activation asked at the last look of the frame and refused by the gate
// has no candle left to retry on. It is cancelled (reason user, like a terminal refusal), the
// run goes on — a thrown replay would end the process. Accepted on the retry, the position
// opens on the frame-end candle and expires with the frame right there.
// ---------------------------------------------------------------------------

test("REFUSED ACTIVATE: at the frame end a transient refusal with no candle left to retry on cancels the entry (reason user) instead of breaking the run; accepted on the retry, the position opens and expires with the frame", async ({ pass, fail }) => {
  // a 1-hour frame, the resting entry placed on 0 waits 120 minutes: still resting at the frame
  // end 60, where the 1m, 15m and 1h watches all look (a 4h watch has no look before 60).
  // The activation runs on candle 60 (dated 61) and, re-queued, on candle 61 (dated 62), the
  // last candle of the window.
  const pingWatches = ["1m", "15m", "1h"];
  const atFrameEnd = (refuse) => runOnWatches(`frame-end-${refuse.name}`, {
    frameHours: 1,
    refuse,
    callbacks: {
      onSchedulePing: async (symbol, data, _price, when) => {
        if (minute(when.getTime()) === 60) await commitActivateScheduled(symbol, { id: data.id });
      },
    },
  }, pingWatches);

  const refusedTwice = await atFrameEnd(function twice(a) { return a.attempt < 2; });
  const expectedCancel = { attempts: ["0@61", "1@62"], sameId: true, opened: [], cancelled: [{ reason: "user", at: 62 }], closed: [], exits: 0 };
  if (JSON.stringify(lifecycle(refusedTwice["1m"])) !== JSON.stringify(expectedCancel)) return fail(`refused twice, 1m: expected ${JSON.stringify(expectedCancel)}, got ${JSON.stringify(refusedTwice["1m"])}`);
  // the gate's own throws surface on the error channel as for every transient refusal; what
  // must not happen is the fatal exit (exits in the lifecycle)
  if (differs(refusedTwice, lifecycle, fail, "refused twice at the frame end")) return;

  const refusedOnce = await atFrameEnd(function once(a) { return a.attempt === 0; });
  const expectedOpen = { attempts: ["0@61", "1@62"], sameId: true, opened: [62], cancelled: [], closed: [{ reason: "time_expired", at: 62, price: BASE }], exits: 0 };
  if (JSON.stringify(lifecycle(refusedOnce["1m"])) !== JSON.stringify(expectedOpen)) return fail(`refused once, 1m: expected ${JSON.stringify(expectedOpen)}, got ${JSON.stringify(refusedOnce["1m"])}`);
  if (differs(refusedOnce, lifecycle, fail, "refused once at the frame end")) return;
  pass(`frame end 60: refused on 61 and 62 → cancelled (user)@62, no fatal; refused on 61 only → opened@62 and expired with the frame@62, on ${pingWatches.join("/")}`);
});

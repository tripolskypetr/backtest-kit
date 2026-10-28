import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Live,
  Broker,
  lib,
  listenActivePing,
  listenIdlePing,
  listenSchedulePing,
  MethodContextService,
} from "../../build/index.mjs";

// The ping listeners are gated on hasPendingSignal / hasScheduledSignal at delivery, and both
// count a signal as present while a deferred change still holds it: a user close or a confirmed
// fill waiting for its drain, a refused open waiting for its retry, a cancel or an activation in
// flight. listenActivePing runs only with a pending position, listenIdlePing only with neither a
// pending position nor a resting entry. The live monitoring tick returns idle from some of those
// windows — a user close the gate still refuses, a refused open — and the schema's onIdle sees
// every one of those ticks while the listener sees none of them. (The backtest replay returns no
// idle tick there: its first idle tick follows the close or the cancel.)

const MIN = 60_000;
const SYMBOL = "BTCUSDT";
const SLOTS = ["pendingSignalId", "closedSignal", "takeProfitSignal", "stopLossSignal", "cancelledSignal", "activatedSignal", "retryOpenSignal", "createdSignal", "adoptedSignal"];

/** What the public API says about the strategy right now: the two presence checks and the busy status slots */
const probe = async (api, context) => {
  const s = await api.getStrategyStatus(SYMBOL, context);
  return {
    hasPending: !(await api.hasNoPendingSignal(SYMBOL, context)),
    hasScheduled: !(await api.hasNoScheduledSignal(SYMBOL, context)),
    pending: s.pendingSignalId,
    busy: SLOTS.filter((slot) => s[slot] !== null),
  };
};
const clean = (p) => !p.hasPending && !p.hasScheduled && p.busy.length === 0;

const makeExchange = (exchangeName, priceAt) => addExchangeSchema({
  exchangeName,
  getCandles: async (_symbol, candleInterval, since, limit) => {
    if (candleInterval !== "1m") throw new Error(`idle gate exchange: only 1m bars, got ${candleInterval}`);
    const out = [];
    let timestamp = Math.floor(since.getTime() / MIN) * MIN;
    while (out.length < limit) {
      const candle = priceAt(timestamp);
      out.push({ timestamp, volume: 1_000, ...candle });
      timestamp += MIN;
    }
    return out;
  },
  formatPrice: async (_s, p) => p.toFixed(8),
  formatQuantity: async (_s, q) => q.toFixed(8),
});

const flat = (price) => ({ open: price, high: price, low: price, close: price });
const marketLong = () => ({ position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: 600 });
const restingLong = () => ({ position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: 600 });

test("IDLE PING GATE: a deferred user close refused once by the gate — the engine returns an idle tick, the position still counts as pending (close slot); onIdle sees it, listenIdlePing does not", async ({ pass, fail }) => {
  const t0 = Date.parse("2024-01-01T00:00:00Z");
  const minute = (timestamp) => (timestamp - t0) / MIN;
  const BASE_PRICE = 50000;
  const context = { strategyName: "idle-gate-refusal-strategy", exchangeName: "binance-idle-gate-refusal", frameName: "" };
  makeExchange(context.exchangeName, () => flat(BASE_PRICE));
  const rawIdle = [];
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "long", priceTakeProfit: BASE_PRICE + 15000, priceStopLoss: BASE_PRICE - 15000, cost: 1000, minuteEstimatedTime: 600 };
    },
    callbacks: {
      // the schema callback sees every idle tick, the refusal window included
      onIdle: (_symbol, _price, when) => { rawIdle.push(minute(when.getTime())); },
    },
  });
  const closeAttempts = [];
  Broker.useBrokerAdapter({
    onOrderOpenCommit: async () => {},
    onOrderCloseCommit: async (payload) => {
      closeAttempts.push(payload.attempt);
      // the first attempt is refused transiently (a throw): the engine retries on the next tick
      if (closeAttempts.length === 1) throw new Error("idle gate: transient refusal of the user close");
    },
  });
  Broker.enable();
  const idle = [];
  const active = [];
  const unsubscribe = [
    listenIdlePing(async (event) => {
      if (event.strategyName !== context.strategyName) return;
      idle.push({ at: minute(event.timestamp), ...(await probe(Live, context)) });
    }),
    listenActivePing(async (event) => {
      if (event.data.strategyName !== context.strategyName) return;
      active.push({ at: minute(event.timestamp), ...(await probe(Live, context)) });
    }),
  ];
  const actions = [];
  let window = null;
  let openedId = null;
  try {
    const runTick = (when) => MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick(SYMBOL, when, false, context),
      context,
    );
    for (let k = 0; k < 5; k++) {
      // asked between ticks: tick #3 drains the close, the gate refuses it, tick #4 retries
      if (k === 2) await Live.commitClosePending(SYMBOL, context);
      const result = await runTick(new Date(t0 + k * MIN));
      actions.push(result.action);
      if (result.action === "opened") openedId = result.signal.id;
      // what the public API says right after the refused drain
      if (k === 2) window = await probe(Live, context);
    }
  } finally {
    unsubscribe.forEach((un) => un());
    Broker.disable();
  }
  if (actions.join(",") !== "opened,active,idle,closed,idle") return fail(`expected opened,active,idle,closed,idle (the refused close returns an idle tick, the retry closes), got ${actions.join(",")}`);
  if (closeAttempts.join(",") !== "0,1") return fail(`expected the close attempts 0,1, got ${closeAttempts.join(",")}`);
  if (rawIdle.join(",") !== "2,4") return fail(`the schema's onIdle must see both idle ticks — the refusal window on 2 and the real idle on 4 — got ${rawIdle.join(",")}`);
  if (!window || window.busy.join(",") !== "closedSignal" || window.pending !== null || window.hasPending !== true) return fail(`after the refused drain the position must sit in closedSignal only and still count as pending, got ${JSON.stringify(window)}`);
  if (active.length === 0 || active.some((a) => a.pending !== openedId || !a.hasPending || a.at >= 2)) return fail(`every active ping must come before the close command with "${openedId}" pending, got ${JSON.stringify(active)}`);
  if (idle.length !== 1 || idle[0].at !== 4 || !clean(idle[0])) return fail(`listenIdlePing must get the clean idle tick of minute 4 only, got ${JSON.stringify(idle)}`);
  pass(`ticks ${actions.join(",")}: onIdle saw minutes ${rawIdle.join(",")}, the refusal window held closedSignal and counted as pending, listenIdlePing got minute 4 only; active pings on ${active.map((a) => a.at).join(",")}`);
});

/**
 * Backtest harness: a flat tape shaped by `candleAt(minute)`, a strategy whose getSignal returns
 * `signal` once, the schema's onIdle recording every idle tick, and the three listeners recording
 * the probe at delivery. `command(symbol, context)` runs from the ping of channel `ping` on minute `at`.
 */
const runBacktest = async (name, { signal, candleAt, ping, at, command }) => {
  const FRAME_START = Date.parse("2024-02-01T00:00:00Z");
  const minute = (timestamp) => (timestamp - FRAME_START) / MIN;
  const context = { strategyName: `idle-gate-${name}-strategy`, exchangeName: `idle-gate-${name}-exchange`, frameName: `idle-gate-${name}-frame` };
  makeExchange(context.exchangeName, (timestamp) => candleAt(minute(timestamp)));
  const rawIdle = [];
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued || !signal) return null;
      issued = true;
      return signal;
    },
    callbacks: { onIdle: (_symbol, _price, when) => { rawIdle.push(minute(when.getTime())); } },
  });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1m", watchInterval: "1m", startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + 120 * MIN) });
  const idle = [];
  const active = [];
  const schedule = [];
  let done = false;
  const onPing = (channel) => async (event) => {
    const own = channel === "idle" ? event.strategyName : event.data.strategyName;
    if (own !== context.strategyName) return;
    ({ idle, active, schedule })[channel].push({ at: minute(event.timestamp), ...(await probe(Backtest, context)) });
    if (!done && channel === ping && minute(event.timestamp) === at) {
      done = true;
      await command(SYMBOL, context);
    }
  };
  const unsubscribe = [listenIdlePing(onPing("idle")), listenActivePing(onPing("active")), listenSchedulePing(onPing("schedule"))];
  const life = { scheduledAt: null, pendingAt: null, closedAt: null, cancelledAt: null, id: null, reason: null };
  try {
    for await (const result of Backtest.run(SYMBOL, context)) {
      if (result.action === "scheduled") life.scheduledAt = minute(result.signal.scheduledAt);
      if (result.action === "opened") { life.pendingAt = minute(result.signal.pendingAt); life.id = result.signal.id; }
      if (result.action === "closed") { life.closedAt = minute(result.closeTimestamp); life.reason = result.closeReason; }
      if (result.action === "cancelled") { life.cancelledAt = minute(result.closeTimestamp); life.reason = result.reason; }
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  return { rawIdle, idle, active, schedule, life, done };
};

test("IDLE PING GATE: over a resting entry placed from the idle ping, its activation and its close, each channel is delivered only in its own state", async ({ pass, fail }) => {
  // flat 100; the lows touch the resting entry at 90 on 30..31; 120 from 60 on brings the VWAP over the take at 105
  const { idle, active, schedule, life } = await runBacktest("lifecycle", {
    signal: null,
    candleAt: (m) => (m >= 30 && m <= 31 ? { ...flat(100), low: 90 } : m >= 60 && m <= 70 ? flat(120) : flat(100)),
    ping: "idle",
    at: 10,
    command: (symbol, context) => Backtest.commitCreateSignal(symbol, context, restingLong()),
  });
  if (life.scheduledAt !== 10 || life.pendingAt === null || life.closedAt === null || life.reason !== "take_profit") return fail(`expected scheduled@10, an activation and a take_profit close, got ${JSON.stringify(life)}`);
  // the ping of minute 10 placed the entry itself: it was clean at delivery
  const stray = idle.filter((i) => i.at > life.scheduledAt && i.at <= life.closedAt);
  if (stray.length) return fail(`listenIdlePing must stay silent from the placement on ${life.scheduledAt} to the close on ${life.closedAt}, got ${JSON.stringify(stray)}`);
  if (idle.some((i) => !clean(i))) return fail(`every idle delivery must see a clean strategy, got ${JSON.stringify(idle.filter((i) => !clean(i)))}`);
  if (!idle.some((i) => i.at < life.scheduledAt) || !idle.some((i) => i.at > life.closedAt)) return fail(`idle pings must be delivered before the placement and after the close, got minutes ${idle.map((i) => i.at).join(",")}`);
  if (schedule.length === 0 || schedule.some((s) => s.at < life.scheduledAt || s.at >= life.pendingAt || !s.hasScheduled || s.hasPending)) return fail(`schedule pings must fall inside the resting window [${life.scheduledAt}, ${life.pendingAt}) with the entry scheduled and no pending position, got ${JSON.stringify(schedule)}`);
  if (active.length === 0 || active.some((a) => a.at < life.pendingAt || a.at > life.closedAt || a.pending !== life.id || !a.hasPending || a.hasScheduled)) return fail(`active pings must fall inside the position's life [${life.pendingAt}, ${life.closedAt}] with "${life.id}" pending and no resting entry, got ${JSON.stringify(active)}`);
  pass(`resting@${life.scheduledAt} → active@${life.pendingAt} → ${life.reason}@${life.closedAt}: ${idle.length} idle pings outside the window only, ${schedule.length} schedule pings while resting, ${active.length} active pings while open`);
});

/**
 * Live harness: manual ticks one minute apart, a flat tape at 100, a strategy whose getSignal
 * returns `signal` once, an optional broker adapter, the schema's onIdle recording every idle tick
 * and the three listeners recording the probe at delivery. `command(symbol, context)` runs from the
 * ping of channel `ping` on minute `at`; `after` is the probe right after the tick of minute `at`.
 */
const runLive = async (name, { signal, ticks, ping = null, at, command = null, broker = null }) => {
  const t0 = Date.parse("2024-01-01T00:00:00Z");
  const minute = (timestamp) => (timestamp - t0) / MIN;
  const context = { strategyName: `idle-gate-${name}-strategy`, exchangeName: `binance-idle-gate-${name}`, frameName: "" };
  makeExchange(context.exchangeName, () => flat(100));
  const rawIdle = [];
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return signal;
    },
    callbacks: { onIdle: (_symbol, _price, when) => { rawIdle.push(minute(when.getTime())); } },
  });
  if (broker) {
    Broker.useBrokerAdapter(broker);
    Broker.enable();
  }
  const idle = [];
  const active = [];
  const schedule = [];
  let done = false;
  const onPing = (channel) => async (event) => {
    const own = channel === "idle" ? event.strategyName : event.data.strategyName;
    if (own !== context.strategyName) return;
    ({ idle, active, schedule })[channel].push({ at: minute(event.timestamp), ...(await probe(Live, context)) });
    if (!done && command && channel === ping && minute(event.timestamp) === at) {
      done = true;
      await command(SYMBOL, context);
    }
  };
  const unsubscribe = [listenIdlePing(onPing("idle")), listenActivePing(onPing("active")), listenSchedulePing(onPing("schedule"))];
  const actions = [];
  const reasons = [];
  let after = null;
  try {
    const runTick = (when) => MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick(SYMBOL, when, false, context),
      context,
    );
    for (let k = 0; k < ticks; k++) {
      const result = await runTick(new Date(t0 + k * MIN));
      actions.push(result.action);
      if (result.action === "closed") reasons.push(result.closeReason);
      if (result.action === "cancelled") reasons.push(result.reason);
      if (k === at) after = await probe(Live, context);
    }
  } finally {
    unsubscribe.forEach((un) => un());
    if (broker) Broker.disable();
  }
  const seen = { actions, reasons, after, rawIdle, idle, active, schedule };
  return { ...seen, done, seen: JSON.stringify(seen) };
};

test("IDLE PING GATE: an open refused once by the gate — the tick returns idle with the retry slot armed and the signal counts as pending; onIdle sees it, listenIdlePing does not, the retry opens next", async ({ pass, fail }) => {
  const openAttempts = [];
  const r = await runLive("refused-open", {
    signal: marketLong(),
    ticks: 3,
    at: 0,
    broker: {
      onOrderOpenCommit: async (payload) => {
        openAttempts.push(payload.attempt);
        // the first attempt is refused transiently (a throw): the engine retries on the next tick
        if (openAttempts.length === 1) throw new Error("idle gate: transient refusal of the open");
      },
      onOrderCloseCommit: async () => {},
    },
  });
  if (r.actions.join(",") !== "idle,opened,active" || openAttempts.join(",") !== "0,1") return fail(`expected idle,opened,active with the open attempts 0,1 (the refused open arms the retry, the next tick opens), got ${r.seen} attempts ${openAttempts.join(",")}`);
  if (!r.after || r.after.busy.join(",") !== "retryOpenSignal" || r.after.hasPending !== true || r.after.hasScheduled !== false) return fail(`after the refused tick the signal must sit in retryOpenSignal only and count as pending, got ${r.seen}`);
  if (r.rawIdle.join(",") !== "0") return fail(`the schema's onIdle must see the idle tick of minute 0 (retry armed), got ${r.seen}`);
  if (r.idle.length !== 0) return fail(`listenIdlePing must not get the idle tick of the armed retry, got ${r.seen}`);
  if (r.active.length === 0 || r.active.some((a) => !a.hasPending || a.busy.join(",") !== "pendingSignalId")) return fail(`the active ping must come with the position pending, got ${r.seen}`);
  pass(`ticks ${r.actions.join(",")}: onIdle saw minute 0 with retryOpenSignal armed and counted as pending, listenIdlePing got nothing, the retry opened on 1 (attempts ${openAttempts.join(",")})`);
});

test("IDLE PING GATE: a fill asked from the active ping and a cancel asked from the schedule ping hold their slot — and still count as present — until the next tick, without an idle tick; the first idle after the drain is clean", async ({ pass, fail }) => {
  const fill = await runLive("fill", { signal: marketLong(), ticks: 4, ping: "active", at: 1, command: (symbol, context) => Live.commitCreateTakeProfit(symbol, context) });
  if (!fill.done) return fail(`fill: the active ping of minute 1 never fired`);
  if (fill.actions.join(",") !== "opened,active,closed,idle" || fill.reasons.join(",") !== "take_profit") return fail(`fill: expected opened,active,closed,idle with a take_profit close, got ${fill.seen}`);
  if (!fill.after || fill.after.busy.join(",") !== "takeProfitSignal" || fill.after.hasPending !== true) return fail(`fill: after the ping's tick the position must sit in takeProfitSignal and still count as pending, got ${fill.seen}`);
  if (fill.rawIdle.join(",") !== "3" || fill.idle.length !== 1 || fill.idle[0].at !== 3 || !clean(fill.idle[0])) return fail(`fill: the first idle tick must be the clean one of minute 3, seen by onIdle and delivered, got ${fill.seen}`);
  const cancel = await runLive("cancel", { signal: restingLong(), ticks: 4, ping: "schedule", at: 1, command: (symbol, context) => Live.commitCancelScheduled(symbol, context) });
  if (!cancel.done) return fail(`cancel: the schedule ping of minute 1 never fired`);
  if (cancel.actions.join(",") !== "scheduled,waiting,cancelled,idle" || cancel.reasons.join(",") !== "user") return fail(`cancel: expected scheduled,waiting,cancelled,idle with a user cancel, got ${cancel.seen}`);
  if (!cancel.after || cancel.after.busy.join(",") !== "cancelledSignal" || cancel.after.hasScheduled !== true || cancel.after.hasPending !== false) return fail(`cancel: after the ping's tick the entry must sit in cancelledSignal and still count as scheduled, got ${cancel.seen}`);
  if (cancel.rawIdle.join(",") !== "3" || cancel.idle.length !== 1 || cancel.idle[0].at !== 3 || !clean(cancel.idle[0])) return fail(`cancel: the first idle tick must be the clean one of minute 3, seen by onIdle and delivered, got ${cancel.seen}`);
  pass(`fill: ${fill.actions.join(",")} holding takeProfitSignal as pending, idle first on 3; cancel: ${cancel.actions.join(",")} holding cancelledSignal as scheduled, idle first on 3`);
});

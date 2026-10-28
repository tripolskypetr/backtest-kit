import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Live,
  commitCreateSignal,
  listenIdlePing,
  listenSync,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// A createSignal DTO queued DURING a tick — from the idle ping or the idle callback — is
// consumed by that same tick, not by the next one. Otherwise a backtest with an hourly entry
// opened the position a whole step after the command while live opened it a minute later: the
// two modes diverged by up to an entry interval. The oracle is the minute of the open and of
// the resting placement, identical across watches, and the live tick that returns "opened".

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-11-01T00:00:00Z");
const BASE = 100;
const WATCHES = ["1m", "1h"];
const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;

const buildCase = (name, watch) => {
  const context = { exchangeName: `create-tick-exchange-${name}`, strategyName: `create-tick-strategy-${name}`, frameName: `create-tick-frame-${name}` };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) { out.push({ timestamp, open: BASE, high: BASE, low: BASE, close: BASE, volume: 1_000 }); timestamp += MIN_MS; }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  addStrategySchema({ strategyName: context.strategyName, interval: "1h", getSignal: async () => null });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + 8 * HOUR_MS) });
  return context;
};

const runCase = async (context, dto) => {
  let done = false;
  const un = listenIdlePing(async (event) => {
    if (event.strategyName !== context.strategyName || done || minute(event.timestamp) !== 60) return;
    done = true;
    await Backtest.commitCreateSignal(event.symbol, context, dto);
  });
  const events = { opened: [], scheduled: [], closed: [] };
  try {
    for await (const result of Backtest.run("BTCUSDT", context)) {
      if (result.action === "opened") events.opened.push(minute(result.signal.pendingAt));
      if (result.action === "scheduled") events.scheduled.push(minute(result.signal.scheduledAt));
      if (result.action === "closed") events.closed.push(`${result.closeReason}@${minute(result.closeTimestamp)}`);
    }
  } finally {
    un();
  }
  return events;
};

test("CREATE SIGNAL TICK: a DTO queued from the idle ping of minute 60 opens on minute 60, not on the next hourly tick, on every watch", async ({ pass, fail }) => {
  const results = {};
  for (const watch of WATCHES) results[watch] = await runCase(buildCase(`open-${watch}`, watch), { position: "long", priceTakeProfit: 119, priceStopLoss: 85, minuteEstimatedTime: 100 });
  for (const watch of WATCHES) {
    if (JSON.stringify(results[watch]) !== JSON.stringify({ opened: [60], scheduled: [], closed: ["time_expired@160"] })) return fail(`${watch}: expected opened@60 and time_expired@160, got ${JSON.stringify(results[watch])}`);
  }
  pass(`opened@60 on the tick of the command, expired@160, on ${WATCHES.join("/")}`);
});

test("CREATE SIGNAL TICK: a resting-entry DTO queued from the idle ping of minute 60 is placed on minute 60", async ({ pass, fail }) => {
  const results = {};
  for (const watch of WATCHES) results[watch] = await runCase(buildCase(`place-${watch}`, watch), { position: "long", priceOpen: 90, priceTakeProfit: 119, priceStopLoss: 85, minuteEstimatedTime: 100 });
  for (const watch of WATCHES) {
    if (results[watch].scheduled.join(",") !== "60") return fail(`${watch}: expected the placement on 60, got ${JSON.stringify(results[watch])}`);
  }
  pass(`scheduled@60 on the tick of the command on ${WATCHES.join("/")}`);
});

test("CREATE SIGNAL TICK (live): a DTO queued from the idle ping opens on the same tick; one queued between ticks opens on the next", async ({ pass, fail }) => {
  const t0 = Date.parse("2024-11-02T00:00:00Z");
  const PRICE = 50000;
  const report = [];
  for (const variant of ["inside", "between"]) {
    const context = { strategyName: `create-tick-live-strategy-${variant}`, exchangeName: `create-tick-live-exchange-${variant}`, frameName: "" };
    addExchangeSchema({
      exchangeName: context.exchangeName,
      getCandles: async (_symbol, _interval, since, limit) => {
        const aligned = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
        return Array.from({ length: limit }, (_, i) => ({ timestamp: aligned + i * MIN_MS, open: PRICE, high: PRICE, low: PRICE, close: PRICE, volume: 100 }));
      },
      formatPrice: async (_s, p) => p.toFixed(8),
      formatQuantity: async (_s, q) => q.toFixed(8),
    });
    addStrategySchema({ strategyName: context.strategyName, interval: "1m", getSignal: async () => null });
    const dto = { position: "long", priceTakeProfit: PRICE + 4000, priceStopLoss: PRICE - 2000, minuteEstimatedTime: 120 };
    let done = false;
    const un = variant === "inside"
      ? listenIdlePing(async (event) => { if (event.strategyName !== context.strategyName || done) return; done = true; await commitCreateSignal(event.symbol, dto); })
      : () => {};
    const opens = [];
    const unSync = listenSync((event) => { if (event.strategyName === context.strategyName && event.action === "signal-open") opens.push(event.type); }, true);
    const runTick = (when) => MethodContextService.runInContext(async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context), context);
    try {
      const actions = [];
      if (variant === "between") {
        actions.push((await runTick(new Date(t0))).action);
        await Live.commitCreateSignal("BTCUSDT", context, dto);
        actions.push((await runTick(new Date(t0 + MIN_MS))).action);
        if (actions.join(",") !== "idle,opened") return fail(`between ticks: expected idle,opened, got ${actions.join(",")}`);
      } else {
        actions.push((await runTick(new Date(t0))).action);
        if (actions.join(",") !== "opened") return fail(`inside the tick: expected the first tick to return opened, got ${actions.join(",")}`);
      }
      if (opens.join(",") !== "active") return fail(`${variant}: expected one open gate call of type active, got ${opens.join(",")}`);
      report.push(`${variant}: ${actions.join(" → ")}`);
    } finally {
      un();
      unSync();
    }
  }
  pass(report.join(" | "));
});

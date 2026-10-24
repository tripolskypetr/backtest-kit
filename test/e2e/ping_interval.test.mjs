import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  listenActivePing,
  listenActivePingInterval,
  listenSchedulePing,
  listenSchedulePingInterval,
  listenIdlePing,
  listenIdlePingInterval,
  listenSignalBacktest,
} from "../../build/index.mjs";

// listenXPingInterval: the ping channels thinned to a time grid.
// - active / schedule: the grid is anchored at the position's open time
//   (pendingAt / scheduledAt), the FIRST ping is skipped, then one delivery per
//   grid point crossed;
// - idle: the first ping is delivered and anchors the grid.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-02-01T00:00:00Z");

/** Flat 1m candles at 100; `priceAt` overrides the price for a timestamp */
const buildCase = (name, { interval = "1h", frameHours = 6, getSignal, priceAt = () => 100 }) => {
  const exchangeName = `ping-interval-exchange-${name}`;
  const strategyName = `ping-interval-strategy-${name}`;
  const frameName = `ping-interval-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`ping interval exchange: only 1m bars, got ${candleInterval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) {
        const price = priceAt(timestamp);
        out.push({ timestamp, open: price, high: price + 0.5, low: price - 0.5, close: price, volume: 1_000 });
        timestamp += MIN_MS;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  addStrategySchema({ strategyName, interval, getSignal });
  addFrameSchema({ frameName, interval, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + frameHours * HOUR_MS) });
  return { exchangeName, strategyName, frameName };
};

const drain = async (symbol, schema) => {
  for await (const _ of Backtest.run(symbol, schema)) { /* drain */ }
};

const minutesFrom = (anchor, timestamps) => timestamps.map((t) => (t - anchor) / MIN_MS);

test("PING INTERVAL: active pings are skipped on the first ping and delivered once per hour from the open time", async ({ pass, fail }) => {
  let issued = false;
  const schema = buildCase("active", {
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      // a market long alive for 200 minutes: pings on every replayed candle
      return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: 200 };
    },
  });
  const all = [];
  const hourly = [];
  const everyMinute = [];
  const unsubscribe = [
    listenActivePing((event) => { if (event.strategyName === schema.strategyName) all.push(event); }),
    listenActivePingInterval((event) => { if (event.strategyName === schema.strategyName) hourly.push(event); }, { interval: "1h" }),
    listenActivePingInterval((event) => { if (event.strategyName === schema.strategyName) everyMinute.push(event); }, { interval: "1m" }),
  ];
  try {
    await drain("BTCUSDT", schema);
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (all.length < 150) return fail(`expected a ping per replayed candle, got ${all.length}`);
  const pendingAt = all[0].data.pendingAt;
  const offsets = minutesFrom(pendingAt, hourly.map((e) => e.timestamp));
  if (offsets.join(",") !== "60,120,180") return fail(`1h grid from the open time expected 60,120,180 minutes, got ${offsets.join(",")} (first ping at +${(all[0].timestamp - pendingAt) / MIN_MS})`);
  if (hourly.some((e) => e.data.id !== all[0].data.id)) return fail("every delivery must carry the position's own row");
  // 1m grid: every ping but the first
  if (everyMinute.length !== all.length - 1) return fail(`a 1m grid must deliver every ping but the first: ${everyMinute.length} vs ${all.length}`);
  if (everyMinute[0].timestamp !== all[1].timestamp) return fail("the first ping must be skipped even on a 1m grid");
  pass(`${all.length} active pings → 1h grid at +${offsets.join("/+")} minutes, 1m grid ${everyMinute.length} deliveries`);
});

test("PING INTERVAL: schedule pings are skipped on the first ping and delivered once per 30 minutes from scheduledAt", async ({ pass, fail }) => {
  let issued = false;
  const schema = buildCase("schedule", {
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      // a resting long below the flat price: never activates, waits CC_SCHEDULE_AWAIT_MINUTES (120)
      return { position: "long", priceOpen: 95, priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: 60 };
    },
  });
  const all = [];
  const halfHourly = [];
  const unsubscribe = [
    listenSchedulePing((event) => { if (event.strategyName === schema.strategyName) all.push(event); }),
    listenSchedulePingInterval((event) => { if (event.strategyName === schema.strategyName) halfHourly.push(event); }, { interval: "30m" }),
  ];
  try {
    await drain("ETHUSDT", schema);
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (all.length < 100) return fail(`expected a schedule ping per candle of the wait, got ${all.length}`);
  const scheduledAt = all[0].data.scheduledAt;
  const offsets = minutesFrom(scheduledAt, halfHourly.map((e) => e.timestamp));
  if (!offsets.length || offsets[0] !== 30) return fail(`the first delivery must be 30 minutes after scheduledAt, got ${offsets.join(",")}`);
  if (offsets.some((m, i) => m !== 30 * (i + 1))) return fail(`30m grid from scheduledAt broken: ${offsets.join(",")}`);
  const lastPing = (all[all.length - 1].timestamp - scheduledAt) / MIN_MS;
  if (offsets.length !== Math.floor(lastPing / 30)) return fail(`expected ${Math.floor(lastPing / 30)} deliveries over ${lastPing} minutes of waiting, got ${offsets.length}`);
  pass(`${all.length} schedule pings over ${lastPing} minutes → 30m grid at +${offsets.join("/+")}`);
});

test("PING INTERVAL: the first idle ping is delivered and anchors a 2h grid for the rest", async ({ pass, fail }) => {
  const schema = buildCase("idle", { interval: "1m", frameHours: 5, getSignal: async () => null });
  const all = [];
  const twoHourly = [];
  const unsubscribe = [
    listenIdlePing((event) => { if (event.strategyName === schema.strategyName) all.push(event); }),
    listenIdlePingInterval((event) => { if (event.strategyName === schema.strategyName) twoHourly.push(event); }, { interval: "2h" }),
  ];
  try {
    await drain("SOLUSDT", schema);
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (all.length < 290) return fail(`expected an idle ping per minute tick, got ${all.length}`);
  const offsets = minutesFrom(all[0].timestamp, twoHourly.map((e) => e.timestamp));
  if (offsets.join(",") !== "0,120,240") return fail(`2h grid from the first idle ping expected 0,120,240, got ${offsets.join(",")}`);
  pass(`${all.length} idle pings → 2h grid at +${offsets.join("/+")} minutes`);
});

test("PING INTERVAL: a new position on the same execution starts a new grid, pings of other executions are independent", async ({ pass, fail }) => {
  const issued = {};
  const schema = buildCase("renew", {
    getSignal: async (symbol) => {
      if ((issued[symbol] ?? 0) >= 2) return null;
      issued[symbol] = (issued[symbol] ?? 0) + 1;
      // two consecutive 90-minute positions: hour 0 and the first idle tick after the first one closes
      return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: 90 };
    },
  });
  const all = [];
  const hourly = [];
  const unsubscribe = [
    listenActivePing((event) => { if (event.strategyName === schema.strategyName) all.push(event); }),
    listenActivePingInterval((event) => { if (event.strategyName === schema.strategyName) hourly.push(event); }, { interval: "1h" }),
  ];
  const closed = [];
  unsubscribe.push(listenSignalBacktest((event) => { if (event.strategyName === schema.strategyName && event.action === "closed") closed.push(event); }));
  try {
    await Promise.all([drain("BTCUSDT", schema), drain("ETHUSDT", schema)]);
  } finally {
    unsubscribe.forEach((un) => un());
  }
  const ids = [...new Set(all.map((e) => e.data.id))];
  if (ids.length !== 4 || closed.length !== 4) return fail(`expected two positions per symbol (4 ids, 4 closes), got ${ids.length} ids / ${closed.length} closes`);
  for (const id of ids) {
    const own = all.filter((e) => e.data.id === id);
    const delivered = hourly.filter((e) => e.data.id === id);
    const offsets = minutesFrom(own[0].data.pendingAt, delivered.map((e) => e.timestamp));
    // a 90-minute position crosses the 1h grid point once
    if (offsets.join(",") !== "60") return fail(`${own[0].symbol} ${id}: expected one delivery at +60 from its own pendingAt, got ${offsets.join(",")}`);
  }
  pass(`4 positions on 2 symbols, each delivered exactly once at +60 minutes from its own open`);
});

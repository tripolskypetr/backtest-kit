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
const buildCase = (name, { interval = "1h", watchInterval = undefined, frameHours = 6, getSignal, priceAt = () => 100 }) => {
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
  addFrameSchema({ frameName, interval, ...(watchInterval && { watchInterval }), startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + frameHours * HOUR_MS) });
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

// ---------------------------------------------------------------------------
// The grid under different frame cadences. The oracle is written from the
// contract, not from the implementation: one delivery per grid point crossed,
// at the FIRST evaluation at or after that point; a ping exactly on a point
// counts (>=), a point already covered by an earlier delivery is not delivered
// again. Active / schedule skip the first evaluation of the signal, idle delivers
// its first ping and anchors the grid on it. A `>` instead of `>=` anywhere in
// the listener would shift or halve the deliveries below.
// ---------------------------------------------------------------------------

const INTERVAL_MINUTES = { "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "2h": 120, "4h": 240, "6h": 360, "8h": 480, "12h": 720, "1d": 1440 };

/** Expected deliveries for a grid anchored at 0 over the evaluation offsets `evaluations` (sorted, minutes) */
const expectedGrid = (evaluations, stepMinutes, { skipFirst }) => {
  const out = [];
  const first = evaluations[0];
  for (let point = stepMinutes; point <= evaluations[evaluations.length - 1]; point += stepMinutes) {
    const hit = evaluations.find((offset) => offset >= point);
    if (hit === undefined) break;
    if (skipFirst && hit === first) continue;
    if (!out.includes(hit)) out.push(hit);
  }
  return skipFirst ? out : [first, ...out.filter((offset) => offset !== first)];
};

test("PING INTERVAL GRID: active deliveries follow the contract for every watchInterval × listener interval combination", async ({ pass, fail }) => {
  const cases = [
    { watch: "1m", listen: "1h", hold: 600 },
    { watch: "15m", listen: "1h", hold: 600 },
    { watch: "30m", listen: "1h", hold: 600 },
    { watch: "1h", listen: "1h", hold: 600 },   // ping exactly on the grid point every time: >= must count it
    { watch: "1h", listen: "30m", hold: 600 },  // listener finer than the watch: one delivery per evaluation, none doubled
    { watch: "4h", listen: "1h", hold: 600 },
    { watch: "1d", listen: "1h", hold: 3 * 24 * 60 },
  ];
  const report = [];
  for (const { watch, listen, hold } of cases) {
    const name = `grid-active-${watch}-${listen}`;
    let issued = false;
    const schema = buildCase(name, {
      interval: "1h",
      watchInterval: watch,
      frameHours: Math.ceil(hold / 60) + 2,
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: hold };
      },
    });
    const all = [];
    const delivered = [];
    const unsubscribe = [
      listenActivePing((event) => { if (event.strategyName === schema.strategyName) all.push(event); }),
      listenActivePingInterval((event) => { if (event.strategyName === schema.strategyName) delivered.push(event); }, { interval: listen }),
    ];
    try {
      await drain("BTCUSDT", schema);
    } finally {
      unsubscribe.forEach((un) => un());
    }
    if (!all.length) return fail(`${name}: no active pings`);
    const pendingAt = all[0].data.pendingAt;
    const evaluations = all.map((e) => (e.timestamp - pendingAt) / MIN_MS);
    // the watch stride itself: evaluations are span ends, step minutes apart
    const stepMinutes = INTERVAL_MINUTES[watch];
    const gaps = evaluations.slice(1).map((offset, i) => offset - evaluations[i]);
    if (gaps.some((gap) => gap !== stepMinutes)) return fail(`${name}: evaluations are not ${stepMinutes} minutes apart: ${evaluations.slice(0, 8).join(",")}…`);
    const expected = expectedGrid(evaluations, INTERVAL_MINUTES[listen], { skipFirst: true });
    const actual = delivered.map((e) => (e.timestamp - pendingAt) / MIN_MS);
    if (actual.join(",") !== expected.join(",")) {
      return fail(`${name}: deliveries ${actual.join(",")} differ from the contract ${expected.join(",")} (evaluations ${evaluations.slice(0, 10).join(",")}…)`);
    }
    report.push(`${watch}/${listen}: ${actual.length} of ${evaluations.length} → +${actual.slice(0, 4).join("/+")}${actual.length > 4 ? "…" : ""}`);
  }
  pass(report.join(" | "));
});

test("PING INTERVAL GRID: schedule deliveries follow the contract for every watchInterval × listener interval combination", async ({ pass, fail }) => {
  // the resting long never activates: schedule pings for CC_SCHEDULE_AWAIT_MINUTES (120) at the watch stride
  const cases = [
    { watch: "1m", listen: "30m" },
    { watch: "15m", listen: "30m" },
    { watch: "30m", listen: "30m" },  // every ping on a grid point
    { watch: "1h", listen: "15m" },   // listener finer than the watch
  ];
  const report = [];
  for (const { watch, listen } of cases) {
    const name = `grid-schedule-${watch}-${listen}`;
    let issued = false;
    const schema = buildCase(name, {
      interval: "1h",
      watchInterval: watch,
      frameHours: 6,
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return { position: "long", priceOpen: 95, priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: 60 };
      },
    });
    const all = [];
    const delivered = [];
    const unsubscribe = [
      listenSchedulePing((event) => { if (event.strategyName === schema.strategyName) all.push(event); }),
      listenSchedulePingInterval((event) => { if (event.strategyName === schema.strategyName) delivered.push(event); }, { interval: listen }),
    ];
    try {
      await drain("ETHUSDT", schema);
    } finally {
      unsubscribe.forEach((un) => un());
    }
    if (!all.length) return fail(`${name}: no schedule pings`);
    const scheduledAt = all[0].data.scheduledAt;
    const evaluations = all.map((e) => (e.timestamp - scheduledAt) / MIN_MS);
    const stepMinutes = INTERVAL_MINUTES[watch];
    const gaps = evaluations.slice(1).map((offset, i) => offset - evaluations[i]);
    if (gaps.some((gap) => gap !== stepMinutes)) return fail(`${name}: evaluations are not ${stepMinutes} minutes apart: ${evaluations.join(",")}`);
    const expected = expectedGrid(evaluations, INTERVAL_MINUTES[listen], { skipFirst: true });
    const actual = delivered.map((e) => (e.timestamp - scheduledAt) / MIN_MS);
    if (actual.join(",") !== expected.join(",")) {
      return fail(`${name}: deliveries ${actual.join(",")} differ from the contract ${expected.join(",")} (evaluations ${evaluations.join(",")})`);
    }
    report.push(`${watch}/${listen}: ${actual.length} of ${evaluations.length} → +${actual.join("/+")}`);
  }
  pass(report.join(" | "));
});

test("PING INTERVAL GRID: idle deliveries follow the contract for every entryInterval × listener interval combination", async ({ pass, fail }) => {
  const cases = [
    { entry: "1m", listen: "1h", frameHours: 5 },
    { entry: "15m", listen: "1h", frameHours: 6 },
    { entry: "1h", listen: "1h", frameHours: 8 },   // every tick on a grid point: >= must count it, else half the ticks vanish
    { entry: "1h", listen: "2h", frameHours: 8 },
    { entry: "1h", listen: "15m", frameHours: 6 },  // listener finer than the tick: every tick delivered
    { entry: "4h", listen: "1h", frameHours: 24 },
  ];
  const report = [];
  for (const { entry, listen, frameHours } of cases) {
    const name = `grid-idle-${entry}-${listen}`;
    const schema = buildCase(name, { interval: entry, frameHours, getSignal: async () => null });
    const all = [];
    const delivered = [];
    const unsubscribe = [
      listenIdlePing((event) => { if (event.strategyName === schema.strategyName) all.push(event); }),
      listenIdlePingInterval((event) => { if (event.strategyName === schema.strategyName) delivered.push(event); }, { interval: listen }),
    ];
    try {
      await drain("SOLUSDT", schema);
    } finally {
      unsubscribe.forEach((un) => un());
    }
    if (!all.length) return fail(`${name}: no idle pings`);
    const anchor = all[0].timestamp;
    const ticks = all.map((e) => (e.timestamp - anchor) / MIN_MS);
    const stepMinutes = INTERVAL_MINUTES[entry];
    const gaps = ticks.slice(1).map((offset, i) => offset - ticks[i]);
    if (gaps.some((gap) => gap !== stepMinutes)) return fail(`${name}: ticks are not ${stepMinutes} minutes apart: ${ticks.slice(0, 8).join(",")}…`);
    const expected = expectedGrid(ticks, INTERVAL_MINUTES[listen], { skipFirst: false });
    const actual = delivered.map((e) => (e.timestamp - anchor) / MIN_MS);
    if (actual.join(",") !== expected.join(",")) {
      return fail(`${name}: deliveries ${actual.join(",")} differ from the contract ${expected.join(",")} (ticks ${ticks.slice(0, 10).join(",")}…)`);
    }
    report.push(`${entry}/${listen}: ${actual.length} of ${ticks.length} → +${actual.slice(0, 4).join("/+")}${actual.length > 4 ? "…" : ""}`);
  }
  pass(report.join(" | "));
});

test("PING INTERVAL GRID: a position between idle pings does not move the idle anchor, the grid stays on the first idle ping", async ({ pass, fail }) => {
  // entry 1h, listener 2h over a 10h frame: grid points at 120, 240, 360, 480, 600 from the first idle ping at 0
  const cases = [
    // the position opens on the tick at 60 and lives 90 minutes: idle pings 0, 180, 240, 300 …
    // a re-anchor on the first idle ping after the close (180) would deliver 180, 300, 420 instead
    { openAt: 60, hold: 90, expected: [0, 180, 240, 360, 480, 600] },
    // the position opens exactly on the grid point 120 and swallows it: 120 and 240 are both covered by the idle ping at 240
    { openAt: 120, hold: 90, expected: [0, 240, 360, 480, 600] },
  ];
  const report = [];
  for (const { openAt, hold, expected } of cases) {
    const name = `grid-idle-anchor-${openAt}`;
    let issued = false;
    const schema = buildCase(name, {
      interval: "1h",
      frameHours: 10,
      getSignal: async (_symbol, when) => {
        if (issued || when.getTime() !== FRAME_START + openAt * MIN_MS) return null;
        issued = true;
        return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: hold };
      },
    });
    const idle = [];
    const delivered = [];
    const closed = [];
    const unsubscribe = [
      listenIdlePing((event) => { if (event.strategyName === schema.strategyName) idle.push((event.timestamp - FRAME_START) / MIN_MS); }),
      listenIdlePingInterval((event) => { if (event.strategyName === schema.strategyName) delivered.push((event.timestamp - FRAME_START) / MIN_MS); }, { interval: "2h" }),
      listenSignalBacktest((event) => { if (event.strategyName === schema.strategyName && event.action === "closed") closed.push((event.closeTimestamp - FRAME_START) / MIN_MS); }),
    ];
    try {
      await drain("SOLUSDT", schema);
    } finally {
      unsubscribe.forEach((un) => un());
    }
    if (closed.join(",") !== `${openAt + hold}`) return fail(`${name}: expected one close at +${openAt + hold}, got ${closed.join(",")}`);
    // the opening tick and the replayed ticks produce no idle ping
    const gap = idle.filter((t) => t >= openAt && t <= openAt + hold);
    if (gap.length) return fail(`${name}: idle pings inside the position: ${gap.join(",")}`);
    const oracle = expectedGrid(idle, 120, { skipFirst: false });
    if (oracle.join(",") !== expected.join(",")) return fail(`${name}: the scenario does not produce the intended idle stream: oracle ${oracle.join(",")} vs spelled-out ${expected.join(",")} (idle ${idle.join(",")})`);
    if (delivered.join(",") !== expected.join(",")) {
      return fail(`${name}: deliveries ${delivered.join(",")}, expected ${expected.join(",")} anchored on the first idle ping (idle pings ${idle.join(",")})`);
    }
    report.push(`position +${openAt}..+${openAt + hold}: idle ${idle.join(",")} → delivered +${delivered.join("/+")}`);
  }
  pass(report.join(" | "));
});

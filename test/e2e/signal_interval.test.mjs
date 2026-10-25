import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  listenBacktestProgress,
} from "../../build/index.mjs";

// getSignal cadence: the frame's entryInterval decides how often the backtest TICKS,
// the strategy's `interval` decides on which of those ticks getSignal is ASKED.
// Contract (ClientStrategy GET_SIGNAL_FN): a tick calls getSignal when its time
// falls into a different `interval` bucket (floor(when / interval), the absolute
// grid) than the tick of the previous call. One call per bucket at most, on the
// first tick that enters it; ticks consumed by a position's replay never run, so
// the bucket of the opening tick stays the reference after the close.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_START = Date.parse("2024-02-01T00:00:00Z");

const INTERVAL_MINUTES = { "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "2h": 120, "4h": 240, "6h": 360, "8h": 480, "12h": 720, "1d": 1440 };

/**
 * Flat 1m candles; strategy `interval` and frame `interval` set independently,
 * the frame may start off the strategy's grid (`startOffsetMinutes`). Every
 * getSignal call is recorded; with `hold` > 0 each call opens a market long of
 * that many minutes.
 */
const buildCase = (name, { strategyInterval, frameInterval, startOffsetMinutes = 0, frameHours, hold = 0 }) => {
  const exchangeName = `signal-interval-exchange-${name}`;
  const strategyName = `signal-interval-strategy-${name}`;
  const frameName = `signal-interval-frame-${name}`;
  const frameStart = DAY_START + startOffsetMinutes * MIN_MS;
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`signal interval exchange: only 1m bars, got ${candleInterval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) {
        out.push({ timestamp, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1_000 });
        timestamp += MIN_MS;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  const calls = [];
  addStrategySchema({
    strategyName,
    interval: strategyInterval,
    getSignal: async (_symbol, when) => {
      calls.push(when.getTime());
      if (hold > 0) {
        return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: hold };
      }
      return null;
    },
  });
  addFrameSchema({ frameName, entryInterval: frameInterval, startDate: new Date(frameStart), endDate: new Date(frameStart + frameHours * HOUR_MS) });
  return { exchangeName, strategyName, frameName, frameStart, calls };
};

/** Runs the case and returns the ticks that ran (iteration starts) and the getSignal calls, as minutes from the frame start */
const runCase = async (schema) => {
  const ticks = [];
  const unsubscribe = listenBacktestProgress((event) => {
    if (event.strategyName !== schema.strategyName || event.progress >= 1) return;
    ticks.push((event.when.getTime() - schema.frameStart) / MIN_MS);
  });
  try {
    for await (const _ of Backtest.run("BTCUSDT", schema)) { /* drain */ }
  } finally {
    unsubscribe();
  }
  return { ticks, calls: schema.calls.map((t) => (t - schema.frameStart) / MIN_MS) };
};

/** Contract oracle: the first tick of every `interval` bucket among the ticks that ran */
const expectedCalls = (ticks, frameStart, strategyInterval) => {
  const intervalMs = INTERVAL_MINUTES[strategyInterval] * MIN_MS;
  const out = [];
  let lastBucket = null;
  for (const tick of ticks) {
    const bucket = Math.floor((frameStart + tick * MIN_MS) / intervalMs);
    if (bucket === lastBucket) continue;
    lastBucket = bucket;
    out.push(tick);
  }
  return out;
};

test("SIGNAL INTERVAL: getSignal runs once per strategy interval bucket on the first tick entering it, for every strategy × frame interval combination", async ({ pass, fail }) => {
  const cases = [
    { strategyInterval: "15m", frameInterval: "1h", frameHours: 6 },   // finer than the tick: every tick
    { strategyInterval: "1h", frameInterval: "1h", frameHours: 6 },    // equal: every tick
    { strategyInterval: "2h", frameInterval: "1h", frameHours: 8 },    // every other tick
    { strategyInterval: "4h", frameInterval: "1h", frameHours: 12 },   // every fourth tick
    { strategyInterval: "1h", frameInterval: "15m", frameHours: 4 },   // every fourth tick of a finer frame
    { strategyInterval: "1d", frameInterval: "1h", frameHours: 48 },   // first tick of each day
    { strategyInterval: "1d", frameInterval: "4h", frameHours: 48 },
  ];
  const report = [];
  for (const spec of cases) {
    const name = `idle-${spec.strategyInterval}-${spec.frameInterval}`;
    const schema = buildCase(name, spec);
    const { ticks, calls } = await runCase(schema);
    const tickStep = INTERVAL_MINUTES[spec.frameInterval];
    if (ticks.length < 2 || ticks.slice(1).some((t, i) => t - ticks[i] !== tickStep)) return fail(`${name}: ticks are not ${tickStep} minutes apart: ${ticks.slice(0, 8).join(",")}`);
    const expected = expectedCalls(ticks, schema.frameStart, spec.strategyInterval);
    if (calls.join(",") !== expected.join(",")) {
      return fail(`${name}: getSignal ran at ${calls.join(",")}, the contract expects ${expected.join(",")} (ticks ${ticks.slice(0, 10).join(",")}…)`);
    }
    report.push(`${spec.strategyInterval}/${spec.frameInterval}: ${calls.length} of ${ticks.length} ticks → +${calls.slice(0, 4).join("/+")}${calls.length > 4 ? "…" : ""}`);
  }
  pass(report.join(" | "));
});

test("SIGNAL INTERVAL: a frame starting off the strategy's grid calls getSignal on its first tick and then on the first tick of every absolute bucket", async ({ pass, fail }) => {
  // the frame starts at 00:30 with 15m ticks and a 1h strategy: 00:30 (bucket 00:00) call,
  // 00:45 same bucket skipped, 01:00 new bucket call, 01:15 / 01:30 / 01:45 skipped, 02:00 call …
  const spec = { strategyInterval: "1h", frameInterval: "15m", startOffsetMinutes: 30, frameHours: 4 };
  const schema = buildCase("offset-1h-15m", spec);
  const { ticks, calls } = await runCase(schema);
  const expected = expectedCalls(ticks, schema.frameStart, spec.strategyInterval);
  if (calls.join(",") !== expected.join(",")) {
    return fail(`getSignal ran at ${calls.join(",")}, the contract expects ${expected.join(",")} (ticks ${ticks.slice(0, 10).join(",")}…)`);
  }
  // spelled out: the first tick, then every tick that lands on a full hour (30 minutes after the frame start)
  const spelled = [0, ...ticks.filter((t) => (t + 30) % 60 === 0)];
  if (calls.join(",") !== spelled.join(",")) return fail(`expected calls at +${spelled.join("/+")} (frame start, then every full hour), got ${calls.join(",")}`);
  pass(`frame from 00:30 with 15m ticks, 1h strategy: calls at +${calls.join("/+")} minutes`);
});

test("SIGNAL INTERVAL: after a position closes the next call waits for a new bucket of the opening tick's interval", async ({ pass, fail }) => {
  // strategy 2h on an hourly frame; every call opens a position
  const cases = [
    // closed at +30 inside the opening bucket: the tick at 60 is still that bucket → silent, next call at 120
    { hold: 30, frameHours: 8 },
    // closed at +90: the tick at 120 is the next bucket → call there, then 240 …
    { hold: 90, frameHours: 8 },
    // closed at +150: ticks ≤ 150 are consumed by the replay, the next tick 180 is bucket 1 → call; bucket 1 then holds 180, 240 is bucket 2 …
    { hold: 150, frameHours: 12 },
  ];
  const report = [];
  for (const spec of cases) {
    const name = `hold-${spec.hold}`;
    const schema = buildCase(name, { strategyInterval: "2h", frameInterval: "1h", ...spec });
    const { ticks, calls } = await runCase(schema);
    const expected = expectedCalls(ticks, schema.frameStart, "2h");
    if (calls.join(",") !== expected.join(",")) {
      return fail(`${name}: getSignal ran at ${calls.join(",")}, the contract expects ${expected.join(",")} (ticks that ran: ${ticks.join(",")})`);
    }
    report.push(`hold ${spec.hold}: ticks ${ticks.join(",")} → calls +${calls.join("/+")}`);
  }
  pass(report.join(" | "));
});

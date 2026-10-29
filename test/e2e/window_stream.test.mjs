import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  getConfig,
  listenActivePing,
  listenPartialProfitAvailable,
  listenSignalBacktest,
} from "../../build/index.mjs";

// A finite hold is replayed in bounded windows of whole watch spans, exactly like an
// Infinity hold: the orchestrator never materializes the whole hold at once. These tests
// attack the window edges with the one invariant that matters — NO CANDLE IS LOST OR
// SEEN TWICE: on a 1m watch every candle of the position gets exactly one look, in
// order, across every edge; the stop touched on the first or last candle of a window,
// the take-profit whose 5-candle VWAP straddles an edge (the buffer of the next window),
// the expiry inside a later window and the partial levels crossed around an edge land on
// the same exact minute on a 1m, 15m, 1h and 4h watch (an event of candle m is dated m+1,
// the candle's close; the expiry at the end of a hold is a clock event on its own minute,
// after the look of the candle before it). The memory side is checked by the
// shape of the adapter traffic: the next window is requested only after the previous one
// has been evaluated, never all of them up front.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-06-01T00:00:00Z");
const BASE = 100;
const TP = 119;
const SL = 85;
const HOLD = 2500; // > 2 replay windows of 1000 1m candles
const FRAME_HOURS = 48;
const WATCHES = ["1m", "15m", "1h", "4h"];
const BUFFER = getConfig().CC_AVG_PRICE_CANDLES_COUNT - 1; // candles fetched before the first evaluable one
const PAGE = getConfig().CC_MAX_CANDLES_PER_REQUEST;

const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;

/**
 * Flat candles at BASE with per-minute overrides; the frame ticks hourly, the strategy
 * opens `signal` once on its first tick (minute 0). Every adapter request is recorded in
 * `trace` as { kind: "request", at, limit } interleaved with the looks of the position.
 */
const buildCase = (name, { watch, candleByMinute = {}, signal, frameHours = FRAME_HOURS }) => {
  const exchangeName = `window-stream-exchange-${name}`;
  const strategyName = `window-stream-strategy-${name}`;
  const frameName = `window-stream-frame-${name}`;
  const trace = [];
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`window stream exchange: only 1m bars, got ${candleInterval}`);
      trace.push({ kind: "request", at: minute(Math.floor(since.getTime() / MIN_MS) * MIN_MS), limit });
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
      return signal;
    },
  });
  addFrameSchema({ frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + frameHours * HOUR_MS) });
  return { exchangeName, strategyName, frameName, trace };
};

const runCase = async (schema) => {
  const events = { opened: [], closed: [], pings: [], partials: [], looks: [] };
  const own = (event) => event.strategyName === schema.strategyName;
  const unsubscribe = [
    listenActivePing((event) => { if (own(event)) { events.pings.push(minute(event.timestamp)); schema.trace.push({ kind: "ping", at: minute(event.timestamp) }); } }),
    listenPartialProfitAvailable((event) => { if (own(event)) events.partials.push(`${event.level}@${minute(event.timestamp)}`); }),
    // every candle that reached the end of a replay iteration emits an "active" tick (1m watch: one per candle)
    listenSignalBacktest((event) => { if (own(event) && event.action === "active") events.looks.push(minute(event.createdAt)); }),
  ];
  try {
    for await (const result of Backtest.run("BTCUSDT", schema)) {
      if (result.action === "opened") events.opened.push(minute(result.signal.pendingAt));
      if (result.action === "closed") events.closed.push({ reason: result.closeReason, at: minute(result.closeTimestamp), price: Math.round(result.currentPrice * 1e6) / 1e6 });
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  const requests = schema.trace.filter((e) => e.kind === "request");
  return { opened: events.opened, closed: events.closed, pings: events.pings, partials: events.partials, looks: events.looks, requests, trace: schema.trace };
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

/**
 * Minutes where the 1m replay windows start (first evaluable candle): a window holds a page of
 * candles of which BUFFER are the VWAP buffer, so the k-th window starts at k × (PAGE − BUFFER).
 * The probe test checks the formula against the adapter traffic; every test runs in its own
 * worker, so the edges are computed rather than shared.
 */
const EDGES = [1, 2].map((k) => k * (PAGE - BUFFER));
const marketLong = (hold = HOLD) => ({ position: "long", priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: hold });
const range = (from, to, candle) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, candle]));

/** true when `list` is a run of consecutive integers */
const consecutive = (list) => list.every((v, i) => i === 0 || v === list[i - 1] + 1);

test("WINDOW STREAM: a 2500-minute hold on a 1m watch gets exactly one look per candle across every window edge, and the windows are requested one after another, never up front", async ({ pass, fail }) => {
  const result = await runCase(buildCase("probe-1m", { watch: "1m", signal: marketLong() }));
  if (result.closed.length !== 1 || result.closed[0].reason !== "time_expired" || result.closed[0].at !== HOLD) {
    return fail(`expected the expiry exactly on minute ${HOLD}, got ${JSON.stringify(result.closed)}`);
  }
  // the position's replay requests: after the open, every request is one window of at most a page
  const replay = result.requests.filter((r) => r.at >= -BUFFER - 1 && r.limit > BUFFER + 1);
  if (replay.length < 3) return fail(`expected at least three replay windows for ${HOLD} minutes, got ${replay.length}: ${JSON.stringify(result.requests)}`);
  if (replay.some((r) => r.limit > PAGE)) return fail(`a replay window must never exceed CC_MAX_CANDLES_PER_REQUEST=${PAGE}, got ${JSON.stringify(replay)}`);
  // contiguity: each window starts BUFFER candles before the candle after the previous window's last one
  for (let i = 1; i < replay.length; i++) {
    const prevEnd = replay[i - 1].at + replay[i - 1].limit - 1;
    if (replay[i].at !== prevEnd + 1 - BUFFER) return fail(`window ${i} must start right after the previous one minus the VWAP buffer: prev ends ${prevEnd}, next starts ${replay[i].at}`);
  }
  // the next window is requested only after the previous one was looked at (memory bound)
  const order = result.trace.filter((e) => e.kind === "ping" || (e.kind === "request" && e.limit > BUFFER + 1));
  for (let i = 1; i < order.length; i++) {
    if (order[i].kind === "request" && order[i - 1].kind === "request" && order[i].at > 0) return fail(`two replay windows were requested back to back (${JSON.stringify(order[i - 1])}, ${JSON.stringify(order[i])}): the whole hold must not be materialized up front`);
  }
  // one "active" result per candle, in order, no gaps and no repeats, from the open candle (dated 1)
  // to the candle before the expiry one (dated HOLD-1): the expiry candle is pinged and then closed
  // by the clock within its own iteration, so it ends with the close, not with an "active"
  if (!consecutive(result.looks) || result.looks[0] !== 1 || result.looks[result.looks.length - 1] !== HOLD - 1) {
    return fail(`expected looks on every candle 0..${HOLD - 2} (dated 1..${HOLD - 1}) exactly once, got ${result.looks.length} looks ${result.looks.slice(0, 4).join(",")}…${result.looks.slice(-3).join(",")}`);
  }
  if (!consecutive(result.pings) || result.pings[0] !== 1 || result.pings.length !== result.looks.length + 1) return fail(`pings must mirror the looks plus the expiry candle's ping (dated ${HOLD}), got ${result.pings.length} pings vs ${result.looks.length} looks`);
  const edges = replay.slice(1).map((r) => r.at + BUFFER);
  if (edges.join(",") !== EDGES.join(",")) return fail(`expected the window edges ${EDGES.join(",")} (k × (page − buffer)), got ${edges.join(",")}`);
  pass(`${replay.length} windows (${replay.map((r) => `${r.at}+${r.limit}`).join(" | ")}), edges at ${EDGES.join(",")}, ${result.looks.length} looks on 1..${HOLD - 1}, expired@${HOLD}`);
});

test("WINDOW STREAM: a stop touched on the LAST candle of a window and one touched on the FIRST candle of the next closes on that exact minute on every watch", async ({ pass, fail }) => {
  const report = [];
  for (const [label, at] of [["last-of-window", EDGES[0] - 1], ["first-of-window", EDGES[0]], ["second-edge", EDGES[1]]]) {
    const results = await runOnWatches(`stop-${label}`, { signal: marketLong(), candleByMinute: range(at, at + 3, { low: SL }) });
    // the touching candle `at` closes the position, dated at its close `at + 1`
    const expected = [{ reason: "stop_loss", at: at + 1, price: SL }];
    if (JSON.stringify(results["1m"].closed) !== JSON.stringify(expected)) return fail(`${label}: 1m expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"].closed)}`);
    if (differs(results, (r) => r.closed, fail, label)) return;
    report.push(`${label}: candle ${at} dated ${at + 1}`);
  }
  pass(`stop_loss on ${report.join(", ")} on ${WATCHES.join("/")}`);
});

test("WINDOW STREAM: a take-profit whose 5-candle VWAP straddles a window edge fires on the exact minute — the next window carries the buffer of the previous one", async ({ pass, fail }) => {
  // spike from edge-3: the VWAP reaches (100 + 4×125) / 5 = 120 ≥ 119 on the 4th spike candle = edge,
  // whose 5-candle window is edge-4..edge — four of them belong to the previous replay window
  const edge = EDGES[0];
  const results = await runOnWatches("tp-edge", { signal: marketLong(), candleByMinute: range(edge - 3, edge + 4, { open: 125, high: 125, low: 125, close: 125 }) });
  // the VWAP reaches the take on candle `edge`, dated at its close
  const expected = [{ reason: "take_profit", at: edge + 1, price: TP }];
  if (JSON.stringify(results["1m"].closed) !== JSON.stringify(expected)) return fail(`1m expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"].closed)}`);
  if (differs(results, (r) => r.closed, fail, "take-profit at the edge")) return;
  pass(`take_profit at ${TP} on candle ${edge} dated ${edge + 1} (VWAP over ${edge - 4}..${edge}, straddling the edge) on ${WATCHES.join("/")}`);
});

test("WINDOW STREAM: partial-profit levels crossed on a ramp around a window edge fire on the same minutes on every watch", async ({ pass, fail }) => {
  // a ramp from edge-8 to edge+8 drives the VWAP progress to the take-profit through the first levels
  const edge = EDGES[0];
  const ramp = Object.fromEntries(Array.from({ length: 17 }, (_, k) => { const p = 100 + k * 1.1; return [edge - 8 + k, { open: p, high: p, low: p, close: p }]; }));
  const results = await runOnWatches("partial-edge", { signal: marketLong(), candleByMinute: ramp });
  const oracle = results["1m"];
  if (oracle.partials.length === 0) return fail(`expected partial levels on the ramp, got none`);
  const minutes = oracle.partials.map((p) => Number(p.split("@")[1]));
  if (!minutes.some((m) => m < edge) || !minutes.some((m) => m >= edge)) return fail(`expected levels on both sides of the edge ${edge}, got ${oracle.partials.join(",")}`);
  if (differs(results, (r) => r.partials, fail, "partial levels")) return;
  pass(`levels ${oracle.partials.join(",")} around the edge ${edge} on ${WATCHES.join("/")}`);
});

test("WINDOW STREAM: a resting entry activated late is replayed in windows from the activation and expires on the exact minute, on every watch", async ({ pass, fail }) => {
  // touched on candle 60 (inside the 120-minute wait), the activation dated 61: pendingAt 61, hold 2500 → expiry 2561, three windows after the activation
  const resting = { position: "long", priceOpen: 90, priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: HOLD };
  const results = await runOnWatches("scheduled", { signal: resting, candleByMinute: range(60, 65, { low: 90 }), frameHours: 60 });
  const oracle = results["1m"];
  const expected = { opened: [61], closed: [{ reason: "time_expired", at: 61 + HOLD, price: BASE }] };
  if (JSON.stringify({ opened: oracle.opened, closed: oracle.closed }) !== JSON.stringify(expected)) return fail(`1m expected ${JSON.stringify(expected)}, got ${JSON.stringify({ opened: oracle.opened, closed: oracle.closed })}`);
  // the replay of the position starts on candle 61 (dated 62) and its last "active" is the candle
  // before the expiry one (dated 60 + HOLD)
  if (!consecutive(oracle.looks) || oracle.looks[0] !== 62 || oracle.looks[oracle.looks.length - 1] !== 60 + HOLD) {
    return fail(`expected one look per candle 61..${60 + HOLD - 1} (dated 62..${60 + HOLD}), got ${oracle.looks.length} looks ${oracle.looks.slice(0, 3).join(",")}…${oracle.looks.slice(-2).join(",")}`);
  }
  const waitRequest = oracle.requests.find((r) => r.limit > BUFFER + 1);
  if (!waitRequest || waitRequest.limit > PAGE + getConfig().CC_SCHEDULE_AWAIT_MINUTES + BUFFER + 2) return fail(`the scheduled array must cover the wait phase plus one window, not the hold: ${JSON.stringify(waitRequest)}`);
  if (differs(results, (r) => ({ opened: r.opened, closed: r.closed }), fail, "scheduled")) return;
  pass(`activated@61, ${oracle.looks.length} looks, expired@${61 + HOLD} on ${WATCHES.join("/")}; wait array ${waitRequest.limit} candles`);
});

test("WINDOW STREAM: a hold longer than the frame is capped by the frame end — the last window stops there and the position expires with the frame, on every watch", async ({ pass, fail }) => {
  const results = await runOnWatches("frame-cap", { signal: marketLong(100_000), frameHours: 30 });
  const oracle = results["1m"];
  if (oracle.closed.length !== 1 || oracle.closed[0].reason !== "time_expired" || oracle.closed[0].at < 30 * 60) return fail(`expected the frame-end expiry at or after minute ${30 * 60}, got ${JSON.stringify(oracle.closed)}`);
  const last = oracle.requests[oracle.requests.length - 1];
  if (last.at + last.limit > 30 * 60 + BUFFER + 3) return fail(`the last window must be capped by the frame end, got ${JSON.stringify(last)}`);
  if (differs(results, (r) => r.closed, fail, "frame cap")) return;
  pass(`expired with the frame @${oracle.closed[0].at}, last window ${last.at}+${last.limit}, on ${WATCHES.join("/")}`);
});

test("WINDOW STREAM: the coarse watches request windows of whole spans and see the same looks per span across the edges", async ({ pass, fail }) => {
  // 1h watch: a window holds 16 whole spans (960 candles + buffer); every look sits on a span-end candle (59, 119, …), dated at its close (minute ≡ 0 mod 60)
  const result = await runCase(buildCase("spans-1h", { watch: "1h", signal: marketLong() }));
  const replay = result.requests.filter((r) => r.limit > BUFFER + 1);
  if (replay.some((r) => (r.limit - BUFFER) % 60 !== 0)) return fail(`every 1h window must hold whole spans, got ${JSON.stringify(replay)}`);
  if (result.pings.some((m) => m % 60 !== 0)) return fail(`every 1h look must sit on a span end (dated at its close), got ${result.pings.filter((m) => m % 60 !== 0).slice(0, 5).join(",")}`);
  const expectedPings = Array.from({ length: Math.floor((HOLD - 1) / 60) }, (_, k) => 60 + k * 60);
  if (result.pings.join(",") !== expectedPings.join(",")) return fail(`expected looks on ${expectedPings.length} span ends dated 60,120,…, got ${result.pings.length}: ${result.pings.slice(0, 5).join(",")}…`);
  pass(`${replay.length} windows of whole hours, ${result.pings.length} looks on span ends, expired@${result.closed[0]?.at}`);
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Exchange,
  getConfig,
  listenError,
} from "../../build/index.mjs";

// The hold of a position is replayed in paged windows. Every candle the adapter returns
// carries an `id` (its minute number) that the engine never looks at and never rewrites,
// so the ids are a tracer: at every active ping the strategy reads the last closed candle
// back through the exchange facade and records its id, and the adapter's own callback
// records the ids of every window the orchestrator fetched. Both sequences must be gapless
// and free of duplicates across the window edges — one id per candle, each exactly once.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-07-01T00:00:00Z");
const BASE = 100;
const HOLD = 2500; // three paged windows of 1m candles
const BUFFER = getConfig().CC_AVG_PRICE_CANDLES_COUNT - 1;
const PAGE = getConfig().CC_MAX_CANDLES_PER_REQUEST;

const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;
const consecutive = (list) => list.every((v, i) => i === 0 || v === list[i - 1] + 1);

/**
 * Flat candles carrying `id = minute`; `windows` collects what the engine fetched
 * (through the exchange schema callback), `seen` what the strategy read at its pings.
 */
const buildCase = (name, watch) => {
  const exchangeName = `candle-id-exchange-${name}`;
  const strategyName = `candle-id-strategy-${name}`;
  const frameName = `candle-id-frame-${name}`;
  const windows = [];
  const seen = [];
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`candle id exchange: only 1m bars, got ${candleInterval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) {
        out.push({ id: Math.round((timestamp - FRAME_START) / MIN_MS), timestamp, open: BASE, high: BASE, low: BASE, close: BASE, volume: 1_000 });
        timestamp += MIN_MS;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
    callbacks: {
      onCandleData: (_symbol, _interval, since, limit, data) => {
        windows.push({ at: minute(Math.floor(since.getTime() / MIN_MS) * MIN_MS), limit, ids: data.map((c) => c.id) });
      },
    },
  });
  let issued = false;
  addStrategySchema({
    strategyName,
    interval: "1h",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: HOLD };
    },
    callbacks: {
      // the last CLOSED candle before the ping's minute: the engine aligns `when` down and
      // steps back one candle, so its id must be the ping minute minus one
      onActivePing: async (symbol, _data, _price, when) => {
        // the facade takes the exchange explicitly; the execution context (the ping's `when`) is the replay's
        const [candle] = await Exchange.getCandles(symbol, "1m", 1, { exchangeName });
        seen.push({ at: minute(when.getTime()), id: candle?.id, timestamp: candle?.timestamp });
      },
    },
  });
  addFrameSchema({ frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + 48 * HOUR_MS) });
  return { exchangeName, strategyName, frameName, windows, seen };
};

const runCase = async (schema) => {
  const closed = [];
  const errors = [];
  const unError = listenError((error) => { errors.push(error?.message ?? String(error)); });
  try {
    for await (const result of Backtest.run("BTCUSDT", schema)) {
      if (result.action === "closed") closed.push({ reason: result.closeReason, at: minute(result.closeTimestamp) });
    }
  } finally {
    unError();
  }
  return { closed, windows: schema.windows, seen: schema.seen, errors };
};

test("CANDLE IDENTITY: on a 1m watch the strategy reads one candle per ping and the ids run 0..HOLD-2 without a gap or a duplicate across the window edges", async ({ pass, fail }) => {
  const { closed, seen, errors } = await runCase(buildCase("ping-1m", "1m"));
  if (closed.length !== 1 || closed[0].reason !== "time_expired" || closed[0].at !== HOLD) return fail(`expected the expiry on ${HOLD}, got ${JSON.stringify(closed)}`);
  if (seen.length !== HOLD) return fail(`expected ${HOLD} pings (one per candle 0..${HOLD - 1}), got ${seen.length}; errors: ${[...new Set(errors)].slice(0, 3).join(" | ")}`);
  if (seen.some((s) => typeof s.id !== "number")) return fail(`the adapter's id field did not pass through the exchange layer: ${JSON.stringify(seen.find((s) => typeof s.id !== "number"))}`);
  const ids = seen.map((s) => s.id);
  if (!consecutive(ids) || ids[0] !== -1 || ids[ids.length - 1] !== HOLD - 2) return fail(`ids must run -1..${HOLD - 2} consecutively, got ${ids.length} ids ${ids.slice(0, 4).join(",")}…${ids.slice(-3).join(",")}`);
  if (new Set(ids).size !== ids.length) return fail(`duplicate candle ids among the pings`);
  const misaligned = seen.find((s) => s.id !== s.at - 1 || s.timestamp !== FRAME_START + (s.at - 1) * MIN_MS);
  if (misaligned) return fail(`every ping must read the candle of the previous minute, got ${JSON.stringify(misaligned)}`);
  pass(`${seen.length} pings, candle ids -1..${HOLD - 2} consecutive and unique, each the minute before its ping, expired@${HOLD}`);
});

test("CANDLE IDENTITY: the fetched windows cover the hold exactly once — contiguous ids, adjacent windows overlap by the VWAP buffer only, no window beyond a page", async ({ pass, fail }) => {
  const { windows } = await runCase(buildCase("windows-1m", "1m"));
  // the position's replay windows: forward fetches of more than a VWAP buffer starting at or after the open's buffer
  const replay = windows.filter((w) => w.limit > BUFFER + 1 && w.at >= -BUFFER - 1);
  if (replay.length < 3) return fail(`expected at least three replay windows, got ${replay.length}: ${JSON.stringify(windows.map((w) => `${w.at}+${w.limit}`))}`);
  if (replay.some((w) => w.limit > PAGE)) return fail(`a window must not exceed CC_MAX_CANDLES_PER_REQUEST=${PAGE}: ${JSON.stringify(replay.map((w) => w.limit))}`);
  for (const w of replay) {
    if (w.ids.length !== w.limit || !consecutive(w.ids) || w.ids[0] !== w.at) return fail(`window ${w.at}+${w.limit} must hold exactly its ${w.limit} consecutive ids starting at ${w.at}, got ${w.ids.length} ids ${w.ids.slice(0, 3).join(",")}…`);
  }
  for (let i = 1; i < replay.length; i++) {
    const prev = new Set(replay[i - 1].ids);
    const overlap = replay[i].ids.filter((id) => prev.has(id));
    if (overlap.length !== BUFFER) return fail(`windows ${i - 1} and ${i} must overlap by exactly the ${BUFFER} buffer candles, got ${overlap.length}: ${overlap.slice(0, 6).join(",")}`);
    if (replay[i].ids[BUFFER] !== replay[i - 1].ids[replay[i - 1].ids.length - 1] + 1) return fail(`window ${i} must resume right after window ${i - 1}: prev last id ${replay[i - 1].ids[replay[i - 1].ids.length - 1]}, next first evaluable id ${replay[i].ids[BUFFER]}`);
  }
  const union = [...new Set(replay.flatMap((w) => w.ids))].sort((a, b) => a - b);
  if (!consecutive(union) || union[0] !== -BUFFER || union[union.length - 1] < HOLD) return fail(`the union of the windows must cover -${BUFFER}..${HOLD} without a hole, got ${union[0]}..${union[union.length - 1]} (${union.length} ids)`);
  pass(`${replay.length} windows ${replay.map((w) => `${w.at}+${w.limit}`).join(" | ")}: ids contiguous, overlap ${BUFFER} each, union -${BUFFER}..${union[union.length - 1]}`);
});

test("CANDLE IDENTITY: on a 1h and a 1d watch every look reads the candle before its span end, and the span ends are the same minutes the 1m replay saw", async ({ pass, fail }) => {
  const report = [];
  for (const [watch, step] of [["1h", 60], ["1d", 1440]]) {
    const { closed, seen } = await runCase(buildCase(`ping-${watch}`, watch));
    if (closed.length !== 1 || closed[0].at !== HOLD) return fail(`${watch}: expected the expiry on ${HOLD}, got ${JSON.stringify(closed)}`);
    const expectedAt = Array.from({ length: Math.floor((HOLD - 1) / step) }, (_, k) => step - 1 + k * step);
    if (seen.map((s) => s.at).join(",") !== expectedAt.join(",")) return fail(`${watch}: expected looks on ${expectedAt.join(",")}, got ${seen.map((s) => s.at).join(",")}`);
    const wrong = seen.find((s) => s.id !== s.at - 1);
    if (wrong) return fail(`${watch}: a look must read the candle before its span end, got ${JSON.stringify(wrong)}`);
    if (new Set(seen.map((s) => s.id)).size !== seen.length) return fail(`${watch}: duplicate ids among the looks`);
    report.push(`${watch}: ${seen.length} looks, ids ${seen[0]?.id}…${seen[seen.length - 1]?.id}`);
  }
  pass(report.join(" | "));
});

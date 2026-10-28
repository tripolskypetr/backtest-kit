import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  setConfig,
  listenActivePing,
  listenIdlePing,
  listenSchedulePing,
  listenStrategyCommit,
} from "../../build/index.mjs";

// Every external action on a strategy, issued at the same minute, must produce the same
// outcome whatever the frame cadences are: entryInterval 1m or 1h, watchInterval 1m, 15m,
// 1h or 4h — eight cadences. The action is issued from the ping of that minute (a listener
// awaited inside the ping, calling the class-level command with an explicit context) and
// the outcome is the run's own results — opens, placements, cancels, closes with their
// minute, price and PnL fields — plus the commit events with their minutes. The oracle is
// the 1m/1m cadence; every other cadence must match it byte for byte, and the oracle itself
// must land on the expected minute, so the identity is never vacuous. Minute 239 is a span
// end on every watch (4h included) and minute 60 an entry tick on both entries.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-12-01T00:00:00Z");
const BASE = 100;
const TP = 119;
const SL = 85;
const ENTRY = 90;
const HOLD = 400;
const ENTRIES = ["1m", "1h"];
const WATCHES = ["1m", "15m", "1h", "4h"];
const CADENCES = ENTRIES.flatMap((entry) => WATCHES.map((watch) => ({ entry, watch, key: `${entry}/${watch}` })));
const ORACLE = "1m/1m";

const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;
const round = (value) => Math.round(value * 1e6) / 1e6;
const range = (from, to, candle) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, candle]));
const flat = (price) => ({ open: price, high: price, low: price, close: price });

const withConfig = async (overrides, fn) => {
  setConfig(overrides, true);
  try { return await fn(); } finally { setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 120 }, true); }
};

/**
 * One cadence of one scenario. `signal` is what getSignal returns once on the first tick
 * (null for the idle scenarios); `candleByMinute` shapes the tape; the command is issued by
 * the listener of `ping` ("active" | "idle" | "schedule") on minute `at`.
 */
const runCadence = async (name, { entry, watch }, { signal, candleByMinute = {}, ping, at, command }) => {
  const context = { exchangeName: `cadence-exchange-${name}`, strategyName: `cadence-strategy-${name}`, frameName: `cadence-frame-${name}` };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`cadence exchange: only 1m bars, got ${candleInterval}`);
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
    strategyName: context.strategyName,
    interval: entry,
    getSignal: async () => {
      if (issued || !signal) return null;
      issued = true;
      return signal;
    },
  });
  addFrameSchema({ frameName: context.frameName, entryInterval: entry, watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + 16 * HOUR_MS) });

  const events = { opened: [], scheduled: [], cancelled: [], closed: [], commits: [], errors: [] };
  let done = false;
  const own = (event) => event.strategyName === context.strategyName;
  const onPing = async (event) => {
    if (!own(event) || done || minute(event.timestamp) !== at) return;
    done = true;
    try {
      await command(event.symbol, context, event.currentPrice);
    } catch (error) {
      events.errors.push(error?.message ?? String(error));
    }
  };
  const listen = { active: listenActivePing, idle: listenIdlePing, schedule: listenSchedulePing }[ping];
  const unsubscribe = [
    listen(onPing),
    listenStrategyCommit((event) => { if (own(event)) events.commits.push(`${event.action}@${minute(event.timestamp)}`); }),
  ];
  try {
    for await (const result of Backtest.run("BTCUSDT", context)) {
      if (result.action === "opened") events.opened.push({ at: minute(result.signal.pendingAt), priceOpen: round(result.signal.priceOpen) });
      if (result.action === "scheduled") events.scheduled.push(minute(result.signal.scheduledAt));
      if (result.action === "cancelled") events.cancelled.push(`${result.reason}@${minute(result.closeTimestamp)}`);
      if (result.action === "closed") events.closed.push({
        reason: result.closeReason,
        at: minute(result.closeTimestamp),
        price: round(result.currentPrice),
        pnlPercentage: round(result.pnl.pnlPercentage),
        pnlDividends: round(result.pnl.pnlDividends),
        totalEntries: result.signal.totalEntries,
        totalPartials: result.signal.totalPartials,
      });
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (!done) events.errors.push(`the ${ping} ping of minute ${at} never fired`);
  return events;
};

/** Runs the scenario on every cadence; fails unless all match the oracle and `expect(oracle)` holds */
const matrix = async (name, scenario, expect, { pass, fail }) => {
  const results = {};
  for (const cadence of CADENCES) results[cadence.key] = await runCadence(`${name}-${cadence.entry}-${cadence.watch}`, cadence, scenario);
  const oracle = results[ORACLE];
  if (oracle.errors.length) return fail(`${name} ${ORACLE}: ${oracle.errors.join(" | ")}`);
  const problem = expect(oracle);
  if (problem) return fail(`${name} ${ORACLE}: ${problem} — got ${JSON.stringify(oracle)}`);
  const expected = JSON.stringify(oracle);
  for (const cadence of CADENCES) {
    if (JSON.stringify(results[cadence.key]) !== expected) {
      return fail(`${name}: cadence ${cadence.key} differs from ${ORACLE} — ${cadence.key}: ${JSON.stringify(results[cadence.key])} vs ${ORACLE}: ${expected}`);
    }
  }
  pass(`${name}: identical on ${CADENCES.map((c) => c.key).join(", ")} — ${JSON.stringify({ opened: oracle.opened, scheduled: oracle.scheduled, cancelled: oracle.cancelled, closed: oracle.closed, commits: oracle.commits })}`);
};

const marketLong = () => ({ position: "long", priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: HOLD });
const restingLong = () => ({ position: "long", priceOpen: ENTRY, priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: HOLD });
const closedIs = (o, reason, at, price) => (o.closed.length !== 1 || o.closed[0].reason !== reason || o.closed[0].at !== at || (price !== undefined && o.closed[0].price !== price)) ? `expected ${reason}@${at}${price !== undefined ? ` at ${price}` : ""}` : null;

// --- actions on an open position (opened by getSignal on minute 0 at 100), issued from the active ping of minute 239 ---

test("COMMAND CADENCE: commitClosePending from the active ping closes on the next candle on every cadence", async (t) => {
  await matrix("closePending", { signal: marketLong(), ping: "active", at: 239, command: (symbol, context) => Backtest.commitClosePending(symbol, context) },
    (o) => closedIs(o, "closed", 240, BASE), t);
});

test("COMMAND CADENCE: commitCreateTakeProfit (broker-confirmed fill) closes by take_profit on the next candle on every cadence", async (t) => {
  await matrix("createTakeProfit", { signal: marketLong(), ping: "active", at: 239, command: (symbol, context) => Backtest.commitCreateTakeProfit(symbol, context) },
    (o) => closedIs(o, "take_profit", 240), t);
});

test("COMMAND CADENCE: commitCreateStopLoss (broker-confirmed fill) closes by stop_loss on the next candle on every cadence", async (t) => {
  await matrix("createStopLoss", { signal: marketLong(), ping: "active", at: 239, command: (symbol, context) => Backtest.commitCreateStopLoss(symbol, context) },
    (o) => closedIs(o, "stop_loss", 240), t);
});

test("COMMAND CADENCE: commitPartialProfit takes the partial at once, stamps its commit with the ping's minute and leaves one partial on the expiry close, on every cadence", async (t) => {
  // the price sits at 110 from 200 on, so the partial is a profit; expiry at 400 carries totalPartials 1
  await matrix("partialProfit", { signal: marketLong(), candleByMinute: range(200, 480, flat(110)), ping: "active", at: 239, command: (symbol, context, price) => Backtest.commitPartialProfit(symbol, 30, price, context) },
    (o) => closedIs(o, "time_expired", HOLD) ?? (o.closed[0].totalPartials !== 1 ? "expected one partial on the close" : null) ?? (!o.commits.includes("partial-profit@239") ? `expected the partial-profit commit on 239, got ${o.commits.join(",")}` : null), t);
});

test("COMMAND CADENCE: commitPartialLoss takes the partial at once, stamps its commit with the ping's minute and leaves one partial on the expiry close, on every cadence", async (t) => {
  await matrix("partialLoss", { signal: marketLong(), candleByMinute: range(200, 480, flat(92)), ping: "active", at: 239, command: (symbol, context, price) => Backtest.commitPartialLoss(symbol, 30, price, context) },
    (o) => closedIs(o, "time_expired", HOLD) ?? (o.closed[0].totalPartials !== 1 ? "expected one partial on the close" : null) ?? (!o.commits.includes("partial-loss@239") ? `expected the partial-loss commit on 239, got ${o.commits.join(",")}` : null), t);
});

test("COMMAND CADENCE: commitTrailingStop moves the stop at once; the candle that touches the new stop closes on its exact minute on every cadence", async (t) => {
  // the stop distance from the entry is tightened by 10 points (15% → 5%, the stop at 95) on 239; the lows touch 95 on 300..303
  await matrix("trailingStop", { signal: marketLong(), candleByMinute: range(300, 303, { low: 95 }), ping: "active", at: 239, command: (symbol, context, price) => Backtest.commitTrailingStop(symbol, -10, price, context) },
    (o) => closedIs(o, "stop_loss", 300, 95) ?? (!o.commits.includes("trailing-stop@239") ? `expected the trailing-stop commit on 239, got ${o.commits.join(",")}` : null), t);
});

test("COMMAND CADENCE: commitTrailingTake moves the take-profit at once; the VWAP that reaches it closes on its exact minute on every cadence", async (t) => {
  // the take-profit distance from the entry is tightened by 14 points (19% → 5%, the take at 105) on 239; candles at 105 from 300: the 5-candle VWAP reaches 105 on 304
  await matrix("trailingTake", { signal: marketLong(), candleByMinute: range(300, 320, flat(105)), ping: "active", at: 239, command: (symbol, context, price) => Backtest.commitTrailingTake(symbol, -14, price, context) },
    (o) => closedIs(o, "take_profit", 304, 105) ?? (!o.commits.includes("trailing-take@239") ? `expected the trailing-take commit on 239, got ${o.commits.join(",")}` : null), t);
});

test("COMMAND CADENCE: commitBreakeven moves the stop to the entry at once; the candle that falls back to it closes on its exact minute on every cadence", async (t) => {
  // in profit at 110 from 200 on, breakeven on 239, then the price falls back to 99 on 300..303
  await matrix("breakeven", { signal: marketLong(), candleByMinute: { ...range(200, 299, flat(110)), ...range(300, 303, flat(99)) }, ping: "active", at: 239, command: (symbol, context, price) => Backtest.commitBreakeven(symbol, price, context) },
    (o) => closedIs(o, "stop_loss", 300) ?? (!o.commits.includes("breakeven@239") ? `expected the breakeven commit on 239, got ${o.commits.join(",")}` : null), t);
});

test("COMMAND CADENCE: commitAverageBuy adds the entry at once; the expiry close carries two entries and the averaged PnL on every cadence", async (t) => {
  // a long may only average down: the price sits at 92 on the command's minute, then at 110 up to the expiry
  await matrix("averageBuy", { signal: marketLong(), candleByMinute: { ...range(200, 299, flat(92)), ...range(300, 480, flat(110)) }, ping: "active", at: 239, command: (symbol, context, price) => Backtest.commitAverageBuy(symbol, price, context, 1000) },
    (o) => closedIs(o, "time_expired", HOLD) ?? (o.closed[0].totalEntries !== 2 ? "expected two entries on the close" : null) ?? (!o.commits.includes("average-buy@239") ? `expected the average-buy commit on 239, got ${o.commits.join(",")}` : null), t);
});

test("COMMAND CADENCE: commitDividend accrues at once; the expiry close carries the same pnlDividends on every cadence", async (t) => {
  await matrix("dividend", { signal: marketLong(), ping: "active", at: 239, command: (symbol, context, price) => Backtest.commitDividend(symbol, price, context, { amount: 7, note: "cadence dividend" }) },
    (o) => closedIs(o, "time_expired", HOLD, BASE) ?? (!(o.closed[0].pnlDividends > 0) ? `expected a positive pnlDividends, got ${o.closed[0].pnlDividends}` : null), t);
});

// --- actions while idle, issued from the idle ping of minute 60 (an entry tick on both entries) ---

test("COMMAND CADENCE: commitCreateSignal (market) from the idle ping opens on that minute on every cadence", async (t) => {
  await matrix("createSignalMarket", { signal: null, ping: "idle", at: 60, command: (symbol, context) => Backtest.commitCreateSignal(symbol, context, marketLong()) },
    (o) => (o.opened.length !== 1 || o.opened[0].at !== 60 ? "expected the open on 60" : null) ?? closedIs(o, "time_expired", 60 + HOLD, BASE), t);
});

test("COMMAND CADENCE: commitCreateSignal (resting entry) from the idle ping places the order on that minute on every cadence", async (t) => {
  // placed on 60, never touched (flat at 100 above the entry at 90): cancelled by the 120-minute wait on 180
  await matrix("createSignalResting", { signal: null, ping: "idle", at: 60, command: (symbol, context) => Backtest.commitCreateSignal(symbol, context, restingLong()) },
    (o) => (o.scheduled.join(",") !== "60" ? "expected the placement on 60" : null) ?? (o.cancelled.join(",") !== "timeout@180" ? `expected timeout@180, got ${o.cancelled.join(",")}` : null), t);
});

test("COMMAND CADENCE: setPendingSignal from the idle ping opens the adopted position on that minute at its own price on every cadence", async (t) => {
  await matrix("setPendingSignal", { signal: null, ping: "idle", at: 60, command: (symbol, context) => Backtest.setPendingSignal(symbol, context, { position: "long", priceOpen: 95, priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: HOLD }) },
    (o) => (o.opened.length !== 1 || o.opened[0].at !== 60 || o.opened[0].priceOpen !== 95 ? "expected the adopted open on 60 at 95" : null) ?? closedIs(o, "time_expired", 60 + HOLD, BASE), t);
});

// --- actions on a resting entry (placed by getSignal on minute 0 at 90, never touched), issued from the schedule ping of minute 239 ---

test("COMMAND CADENCE: commitCancelScheduled from the schedule ping cancels on the next candle on every cadence", async (t) => {
  await withConfig({ CC_SCHEDULE_AWAIT_MINUTES: 480 }, async () => {
    await matrix("cancelScheduled", { signal: restingLong(), ping: "schedule", at: 239, command: (symbol, context) => Backtest.commitCancelScheduled(symbol, context) },
      (o) => (o.scheduled.join(",") !== "0" ? "expected the placement on 0" : null) ?? (o.cancelled.join(",") !== "user@240" ? `expected user@240, got ${o.cancelled.join(",")}` : null), t);
  });
});

test("COMMAND CADENCE: commitActivateScheduled from the schedule ping activates on the next candle on every cadence", async (t) => {
  await withConfig({ CC_SCHEDULE_AWAIT_MINUTES: 480 }, async () => {
    await matrix("activateScheduled", { signal: restingLong(), ping: "schedule", at: 239, command: (symbol, context) => Backtest.commitActivateScheduled(symbol, context) },
      (o) => (o.opened.length !== 1 || o.opened[0].at !== 240 ? "expected the activation on 240" : null) ?? closedIs(o, "time_expired", 240 + HOLD), t);
  });
});

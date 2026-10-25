import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  getConfig,
  listenPartialProfitAvailable,
  commitClosePending,
  lib,
} from "../../build/index.mjs";

// What a coarse watchInterval may and may not change. The strategy LOOKS once per
// watch span (pings, partial / breakeven / trailing, commit queue). What the
// exchange does on its own — stop / liquidation touch, take-profit by VWAP, time
// expiry, scheduled activation / stop reject / wait timeout — is executed on the
// exact candle inside the span: a 1h watch must produce the same forced events,
// at the same minute and price, as a 1m watch.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-02-01T00:00:00Z");
const BASE = 100;
const TP = 119;
const SL = 85;

/**
 * Flat candles at BASE with per-minute overrides (minute counted from FRAME_START);
 * the frame ticks hourly, the strategy opens whatever `getSignal` returns on the first tick.
 */
const buildCase = (name, { watch, candleByMinute = {}, getSignal, callbacks = undefined, frameHours = 6 }) => {
  const exchangeName = `watch-semantics-exchange-${name}`;
  const strategyName = `watch-semantics-strategy-${name}`;
  const frameName = `watch-semantics-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`watch semantics exchange: only 1m bars, got ${candleInterval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) {
        const minute = Math.round((timestamp - FRAME_START) / MIN_MS);
        const custom = candleByMinute[minute];
        out.push(custom
          ? { timestamp, open: BASE, high: BASE, low: BASE, close: BASE, volume: 1_000, ...custom }
          : { timestamp, open: BASE, high: BASE, low: BASE, close: BASE, volume: 1_000 });
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
      return getSignal();
    },
    ...(callbacks && { callbacks }),
  });
  addFrameSchema({ frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + frameHours * HOUR_MS) });
  return { exchangeName, strategyName, frameName };
};

/** Runs the case; returns opened / closed / cancelled results and the partial-profit levels seen */
const runCase = async (schema) => {
  const events = { opened: [], closed: [], cancelled: [], partials: [] };
  const unsubscribe = listenPartialProfitAvailable((event) => {
    if (event.strategyName === schema.strategyName) events.partials.push({ level: event.level, at: (event.timestamp - FRAME_START) / MIN_MS });
  });
  try {
    for await (const result of Backtest.run("BTCUSDT", schema)) {
      if (result.action === "opened") events.opened.push(result);
      if (result.action === "closed") events.closed.push(result);
      if (result.action === "cancelled") events.cancelled.push(result);
    }
  } finally {
    unsubscribe();
  }
  return events;
};

const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;

/** Five consecutive candles at `price` from `from`: the 5-candle VWAP reaches `price` on the last one */
const spike = (from, price) => Object.fromEntries(Array.from({ length: 5 }, (_, i) => [from + i, { open: price, high: price, low: price, close: price }]));

const marketLong = (hold) => ({ position: "long", priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: hold });

test("WATCH SEMANTICS: a take-profit reached by VWAP inside a span closes on that candle, identically on a 1m and a 1h watch", async ({ pass, fail }) => {
  // VWAP (typical price over 5 candles) crosses 119 on minute 79 — (100 + 4×125) / 5 = 120 — then the price is flat at 100 again:
  // a span-end evaluation at minute 119 would see 100 and miss the take-profit altogether
  const candleByMinute = spike(76, 125);
  const results = {};
  for (const watch of ["1m", "1h"]) {
    const schema = buildCase(`tp-${watch}`, { watch, candleByMinute, getSignal: () => marketLong(300) });
    const { closed } = await runCase(schema);
    if (closed.length !== 1) return fail(`${watch}: expected one close, got ${closed.length}`);
    results[watch] = { reason: closed[0].closeReason, at: minute(closed[0].closeTimestamp), price: closed[0].currentPrice };
  }
  if (results["1m"].reason !== "take_profit" || results["1m"].at !== 79 || results["1m"].price !== TP) return fail(`1m watch must take profit on minute 79 at ${TP}: ${JSON.stringify(results["1m"])}`);
  if (JSON.stringify(results["1h"]) !== JSON.stringify(results["1m"])) return fail(`1h watch differs from 1m: ${JSON.stringify(results)}`);
  pass(`take_profit at minute 79, price ${TP}, on both watches`);
});

test("WATCH SEMANTICS: inside one span the first forced event in time wins, not the span-end priority", async ({ pass, fail }) => {
  const cases = [
    // take-profit by VWAP on minute 79, then a stop wick on minute 100: the position is already closed by TP
    { name: "tp-then-sl", candleByMinute: { ...spike(76, 125), 100: { low: SL - 5 } }, reason: "take_profit", at: 79, price: TP },
    // stop wick on minute 70, then a take-profit spike on minute 90..94: the stop came first
    { name: "sl-then-tp", candleByMinute: { 70: { low: SL - 5 }, ...spike(90, 125) }, reason: "stop_loss", at: 70, price: SL },
  ];
  const report = [];
  for (const spec of cases) {
    for (const watch of ["1m", "1h"]) {
      const schema = buildCase(`${spec.name}-${watch}`, { watch, candleByMinute: spec.candleByMinute, getSignal: () => marketLong(300) });
      const { closed } = await runCase(schema);
      if (closed.length !== 1) return fail(`${spec.name} ${watch}: expected one close, got ${closed.length}`);
      const got = { reason: closed[0].closeReason, at: minute(closed[0].closeTimestamp), price: closed[0].currentPrice };
      if (got.reason !== spec.reason || got.at !== spec.at || got.price !== spec.price) {
        return fail(`${spec.name} on a ${watch} watch: expected ${spec.reason} at minute ${spec.at} price ${spec.price}, got ${JSON.stringify(got)}`);
      }
    }
    report.push(`${spec.name}: ${spec.reason}@${spec.at}`);
  }
  pass(`${report.join(", ")} on both watches`);
});

test("WATCH SEMANTICS: a scheduled entry activates on the touching candle with that minute as pendingAt, and its hold counts from there, on every watch", async ({ pass, fail }) => {
  // resting long at 95, a single dip to 94 on minute 105: activation on 105, hold 60 → time_expired on 165
  const candleByMinute = { 105: { low: 94 } };
  const report = [];
  for (const watch of ["1m", "15m", "1h"]) {
    const schema = buildCase(`activate-${watch}`, { watch, candleByMinute, getSignal: () => ({ ...marketLong(60), priceOpen: 95 }) });
    const { opened, closed } = await runCase(schema);
    if (opened.length !== 1 || closed.length !== 1) return fail(`${watch}: expected one open and one close, got ${opened.length}/${closed.length}`);
    const pendingAt = minute(opened[0].signal.pendingAt);
    const priceOpen = opened[0].signal.priceOpen;
    const close = { reason: closed[0].closeReason, at: minute(closed[0].closeTimestamp) };
    if (pendingAt !== 105 || priceOpen !== 95) return fail(`${watch}: expected activation on minute 105 at 95, got pendingAt ${pendingAt} priceOpen ${priceOpen}`);
    if (close.reason !== "time_expired" || close.at !== 165) return fail(`${watch}: expected time_expired on minute 165, got ${JSON.stringify(close)}`);
    report.push(`${watch}: activated@105 closed@165`);
  }
  pass(report.join(" | "));
});

test("WATCH SEMANTICS: a scheduled entry that is never touched is cancelled exactly when its wait expires, on every watch", async ({ pass, fail }) => {
  const awaitMinutes = getConfig().CC_SCHEDULE_AWAIT_MINUTES;
  const report = [];
  for (const watch of ["1m", "1h"]) {
    const schema = buildCase(`timeout-${watch}`, { watch, getSignal: () => ({ ...marketLong(60), priceOpen: 95 }) });
    const { opened, cancelled } = await runCase(schema);
    if (opened.length || cancelled.length !== 1) return fail(`${watch}: expected no open and one cancel, got ${opened.length}/${cancelled.length}`);
    const at = minute(cancelled[0].closeTimestamp);
    if (cancelled[0].reason !== "timeout" || at !== awaitMinutes) return fail(`${watch}: expected a timeout cancel on minute ${awaitMinutes}, got ${cancelled[0].reason} on ${at}`);
    report.push(`${watch}: timeout@${at}`);
  }
  pass(report.join(" | "));
});

test("WATCH SEMANTICS: a partial-profit level crossed and given back inside a span is seen on a 1m watch and not on a 1h watch (the strategy looks once per span)", async ({ pass, fail }) => {
  // +10% for five candles (VWAP 110 on minute 74, 52% of the way to the TP), flat again by the span end
  const candleByMinute = spike(70, 110);
  const seen = {};
  for (const watch of ["1m", "1h"]) {
    const schema = buildCase(`partial-${watch}`, { watch, candleByMinute, getSignal: () => marketLong(300) });
    const { closed, partials } = await runCase(schema);
    if (closed.length !== 1 || closed[0].closeReason !== "time_expired") return fail(`${watch}: the position must live to its hold, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
    seen[watch] = partials;
  }
  if (!seen["1m"].length) return fail("the 1m watch must report the partial-profit levels crossed on minutes 70..74");
  if (seen["1m"].some((p) => p.at < 70 || p.at > 74)) return fail(`1m partial events outside the spike: ${JSON.stringify(seen["1m"])}`);
  if (seen["1h"].length) return fail(`the 1h watch looks only at span ends, where the price is back at ${BASE}: expected no partial events, got ${JSON.stringify(seen["1h"])}`);
  pass(`1m watch: levels ${seen["1m"].map((p) => p.level).join(",")} on minutes ${[...new Set(seen["1m"].map((p) => p.at))].join(",")}; 1h watch: none`);
});

/**
 * Rejects the first close attempt of the named strategies at the order gate. Backtest
 * gates short-circuit to "confirmed", so the refusal is fed through params.onOrderSync of
 * the strategy instance (the same hook the retry-close tests use).
 */
const rejectFirstCloseOf = (strategyNames, attempts) => {
  const realService = Object.getPrototypeOf(lib.strategyConnectionService);
  const originalGetStrategy = realService.getStrategy;
  const wrapped = (...args) => {
    const strategy = originalGetStrategy(...args);
    if (!strategy.__watchPatched && strategyNames.includes(strategy.params.strategyName)) {
      strategy.__watchPatched = true;
      const original = strategy.params.onOrderSync;
      strategy.params.onOrderSync = async (event) => {
        if (event.action === "signal-close") {
          attempts.push({ strategyName: strategy.params.strategyName, attempt: event.attempt, at: minute(event.timestamp) });
          if (event.attempt === 0) throw new Error("watch semantics: first close attempt rejected");
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
};

test("WATCH SEMANTICS: a user close rejected by the gate is retried on the next candle, not on the next span, identically on a 1m and a 1h watch", async ({ pass, fail }) => {
  // the strategy asks to close on its first look (minute 59 on a 1h watch, minute 0 on a 1m watch);
  // the gate refuses the first attempt, the retry must come one candle later
  const names = ["1m", "1h"].map((watch) => `watch-semantics-strategy-reject-close-${watch}`);
  const attempts = [];
  rejectFirstCloseOf(names, attempts);
  const results = {};
  for (const watch of ["1m", "1h"]) {
    let requested = false;
    const schema = buildCase(`reject-close-${watch}`, {
      watch,
      getSignal: () => marketLong(300),
      callbacks: {
        onActivePing: async (symbol) => {
          if (requested) return;
          requested = true;
          await commitClosePending(symbol);
        },
      },
    });
    const { closed } = await runCase(schema);
    if (closed.length !== 1) return fail(`${watch}: expected one close, got ${closed.length}`);
    const own = attempts.filter((a) => a.strategyName === schema.strategyName);
    results[watch] = { reason: closed[0].closeReason, at: minute(closed[0].closeTimestamp), attempts: own.map((a) => `${a.attempt}@${a.at}`) };
  }
  // 1h watch: first look on minute 59, the close applies on minute 60 (first candle of the next span) and is refused,
  // the retry is on minute 61 — the rest of the span is not skipped
  if (results["1h"].reason !== "closed" || results["1h"].attempts.join(",") !== "0@60,1@61" || results["1h"].at !== 61) {
    return fail(`1h watch: expected the rejected close at 60 to be retried and accepted on 61, got ${JSON.stringify(results["1h"])}`);
  }
  // 1m watch: first look on minute 0, refused on 1, accepted on 2 — the same "next candle" rule
  if (results["1m"].reason !== "closed" || results["1m"].attempts.join(",") !== "0@1,1@2" || results["1m"].at !== 2) {
    return fail(`1m watch: expected the rejected close at 1 to be retried and accepted on 2, got ${JSON.stringify(results["1m"])}`);
  }
  pass(`1m: attempts ${results["1m"].attempts.join(" ")} closed@${results["1m"].at} | 1h: attempts ${results["1h"].attempts.join(" ")} closed@${results["1h"].at}`);
});

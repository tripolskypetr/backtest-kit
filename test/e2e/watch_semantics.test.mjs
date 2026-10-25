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
  setConfig,
  listenActivePing,
  listenBreakevenAvailable,
  listenHighestProfit,
  listenSignalBacktest,
  listenStrategyCommit,
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
  const events = { opened: [], closed: [], cancelled: [], partials: [], pings: [], breakevens: [], peaks: [] };
  const own = (event) => event.strategyName === schema.strategyName;
  const unsubscribe = [
    listenPartialProfitAvailable((event) => { if (own(event)) events.partials.push({ level: event.level, at: (event.timestamp - FRAME_START) / MIN_MS }); }),
    listenActivePing((event) => { if (own(event)) events.pings.push((event.timestamp - FRAME_START) / MIN_MS); }),
    listenBreakevenAvailable((event) => { if (own(event)) events.breakevens.push((event.timestamp - FRAME_START) / MIN_MS); }),
    listenHighestProfit((event) => { if (own(event)) events.peaks.push({ at: (event.timestamp - FRAME_START) / MIN_MS, price: event.currentPrice }); }),
  ];
  try {
    for await (const result of Backtest.run("BTCUSDT", schema)) {
      if (result.action === "opened") events.opened.push(result);
      if (result.action === "closed") events.closed.push(result);
      if (result.action === "cancelled") events.cancelled.push(result);
    }
  } finally {
    unsubscribe.forEach((un) => un());
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

test("WATCH SEMANTICS: a partial-profit level crossed inside a span fires on its candle on a 1h watch, like on a 1m watch, while the pings keep the span cadence", async ({ pass, fail }) => {
  // +10% for five candles (VWAP 110 on minute 74, 52% of the way to the TP), flat again by the span end:
  // the levels 10..50 are crossed on minutes 70..74 and must be reported there on both watches
  const candleByMinute = spike(70, 110);
  const seen = {};
  for (const watch of ["1m", "1h"]) {
    const schema = buildCase(`partial-${watch}`, { watch, candleByMinute, getSignal: () => marketLong(300) });
    const { closed, partials, pings } = await runCase(schema);
    if (closed.length !== 1 || closed[0].closeReason !== "time_expired") return fail(`${watch}: the position must live to its hold, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
    seen[watch] = { partials, pings };
  }
  if (!seen["1m"].partials.length) return fail("the 1m watch must report the partial-profit levels crossed on minutes 70..74");
  if (JSON.stringify(seen["1h"].partials) !== JSON.stringify(seen["1m"].partials)) {
    return fail(`1h watch partial events differ from 1m: ${JSON.stringify(seen["1h"].partials)} vs ${JSON.stringify(seen["1m"].partials)}`);
  }
  // the light look on the level candles is not a ping: 1h pings stay on the span ends only
  if (seen["1h"].pings.some((p) => p % 60 !== 59)) return fail(`1h watch pings must stay on span ends, got ${seen["1h"].pings.join(",")}`);
  pass(`levels ${seen["1m"].partials.map((p) => p.level).join(",")} on minutes ${[...new Set(seen["1m"].partials.map((p) => p.at))].join(",")} on both watches; 1h pings ${seen["1h"].pings.join(",")}`);
});

test("WATCH SEMANTICS: breakeven becomes available on the candle its threshold is crossed, identically on both watches, with no extra ping", async ({ pass, fail }) => {
  // +5% for five candles from minute 30: the VWAP crosses the breakeven threshold (entry + fees + slippage + CC_BREAKEVEN_THRESHOLD)
  // on minute 30 or 31 and the price is back at 100 long before the span end
  const candleByMinute = spike(30, 105);
  const seen = {};
  for (const watch of ["1m", "1h"]) {
    const schema = buildCase(`breakeven-${watch}`, { watch, candleByMinute, getSignal: () => marketLong(300) });
    const { closed, breakevens, pings } = await runCase(schema);
    if (closed.length !== 1 || closed[0].closeReason !== "time_expired") return fail(`${watch}: the position must live to its hold, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
    seen[watch] = { breakevens, pings };
  }
  if (seen["1m"].breakevens.length !== 1 || seen["1m"].breakevens[0] < 30 || seen["1m"].breakevens[0] > 34) return fail(`1m watch: expected one breakeven event inside the spike, got ${seen["1m"].breakevens.join(",")}`);
  if (seen["1h"].breakevens.join(",") !== seen["1m"].breakevens.join(",")) return fail(`1h watch breakeven minute ${seen["1h"].breakevens.join(",")} differs from 1m ${seen["1m"].breakevens.join(",")}`);
  if (seen["1h"].pings.some((p) => p % 60 !== 59)) return fail(`1h watch pings must stay on span ends, got ${seen["1h"].pings.join(",")}`);
  pass(`breakeven on minute ${seen["1m"].breakevens[0]} on both watches; 1h pings ${seen["1h"].pings.join(",")}`);
});

test("WATCH SEMANTICS: a commit issued between looks changes the position at once and its commit event is stamped on the next candle, not on the next span end", async ({ pass, fail }) => {
  // commitTrailingStop & co. mutate the position immediately; what the commit queue defers is the
  // commit EVENT (listenStrategyCommit, strategy.jsonl) and its timestamp. The queue is drained inside
  // every look, so a commit issued from a ping lands in the same look. One issued from a listener of the
  // tick result — emitted after the drain — waits for the next drain: on a 1h watch that used to be the
  // next span end (119); now it is the next candle (60), like a live tick a minute later.
  // The stop itself (15% → 1.5% under the entry) is active immediately: the dip to 98 on minute 70 stops out on both watches.
  const candleByMinute = { 70: { low: 98 } };
  const results = {};
  for (const watch of ["1m", "1h"]) {
    const schema = buildCase(`trail-${watch}`, { watch, candleByMinute, getSignal: () => marketLong(300) });
    let trailed = false;
    const commits = [];
    const unsubscribe = [
      listenSignalBacktest(async (event) => {
        if (event.strategyName !== schema.strategyName || event.action !== "active" || trailed) return;
        trailed = true;
        await Backtest.commitTrailingStop(event.symbol, -13.5, event.currentPrice, schema);
      }),
      listenStrategyCommit((event) => {
        if (event.strategyName === schema.strategyName && event.action === "trailing-stop") commits.push(minute(event.timestamp));
      }),
    ];
    let closed;
    try {
      ({ closed } = await runCase(schema));
    } finally {
      unsubscribe.forEach((un) => un());
    }
    if (closed.length !== 1) return fail(`${watch}: expected one close, got ${closed.length}`);
    results[watch] = { reason: closed[0].closeReason, at: minute(closed[0].closeTimestamp), price: closed[0].currentPrice, commits };
  }
  for (const watch of ["1m", "1h"]) {
    const r = results[watch];
    if (r.reason !== "stop_loss" || r.at !== 70 || r.price < 98 || r.price > 99) return fail(`${watch} watch must stop out on minute 70 at the trailed level (~98.5): ${JSON.stringify(r)}`);
  }
  // the first look is minute 0 on a 1m watch and 59 on a 1h watch; the commit event comes on the candle after it
  if (results["1m"].commits.join(",") !== "1") return fail(`1m watch: expected the trailing-stop commit event on minute 1, got ${results["1m"].commits.join(",")}`);
  if (results["1h"].commits.join(",") !== "60") return fail(`1h watch: expected the trailing-stop commit event on minute 60 (the candle after the look on 59), got ${results["1h"].commits.join(",")}`);
  pass(`stop ${results["1m"].price} hit on minute 70 on both watches; commit event on minute ${results["1m"].commits[0]} (1m) and ${results["1h"].commits[0]} (1h)`);
});

test("WATCH SEMANTICS: the peak of a position is recorded on the exact candle on a 1h watch and reported once at the next look", async ({ pass, fail }) => {
  // +10% on minutes 70..74 then flat: the peak is minute 74 at VWAP 110 on both watches
  const candleByMinute = spike(70, 110);
  const seen = {};
  for (const watch of ["1m", "1h"]) {
    const schema = buildCase(`peak-${watch}`, { watch, candleByMinute, getSignal: () => marketLong(300) });
    const { closed, peaks } = await runCase(schema);
    if (closed.length !== 1) return fail(`${watch}: expected one close, got ${closed.length}`);
    const peak = closed[0].signal.peakProfit;
    seen[watch] = { peakPrice: peak.priceClose, peakAt: minute(peak.timestamp ?? 0), pnl: peak.pnlPercentage, lastEvent: peaks[peaks.length - 1], events: peaks.length };
  }
  if (seen["1m"].pnl <= 0) return fail(`1m watch must record a positive peak: ${JSON.stringify(seen["1m"])}`);
  if (seen["1h"].pnl !== seen["1m"].pnl) return fail(`peak pnl differs: 1h ${seen["1h"].pnl} vs 1m ${seen["1m"].pnl}`);
  if (!seen["1h"].lastEvent || seen["1h"].lastEvent.at !== seen["1m"].lastEvent.at || seen["1h"].lastEvent.price !== seen["1m"].lastEvent.price) {
    return fail(`the highest-profit event must carry the peak candle on both watches: 1h ${JSON.stringify(seen["1h"].lastEvent)} vs 1m ${JSON.stringify(seen["1m"].lastEvent)}`);
  }
  if (seen["1h"].events !== 1) return fail(`1h watch must report the peak once, at the next look, got ${seen["1h"].events} events`);
  pass(`peak pnl ${seen["1m"].pnl.toFixed(2)}% on minute ${seen["1m"].lastEvent.at} on both watches; 1h reported it ${seen["1h"].events} time`);
});

/**
 * Rejects the close attempts of the named strategies at the order gate while
 * `rejectWhile(attempt)` holds (default: the first attempt only). Backtest gates
 * short-circuit to "confirmed", so the refusal is fed through params.onOrderSync of the
 * strategy instance (the same hook the retry-close tests use).
 */
const rejectFirstCloseOf = (strategyNames, attempts, rejectWhile = (attempt) => attempt === 0) => {
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
          if (rejectWhile(event.attempt)) throw new Error("watch semantics: close attempt rejected");
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

test("WATCH SEMANTICS: a user close rejected through the whole last span of a replay window is retried on every candle across the window boundary", async ({ pass, fail }) => {
  // Infinity hold, 1h watch, 600-candle pages → windows of two whole spans (0..119 | 120..239 …).
  // The close is asked on the first look (minute 59) and refused on every candle of the
  // window's last span (60..119); the first accepted attempt must be minute 120, with one
  // attempt per candle in between — nothing skipped at the window edge, nothing replayed.
  setConfig({ CC_MAX_CANDLES_PER_REQUEST: 600, CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity, CC_ORDER_CLOSE_RETRY_ATTEMPTS: 0 }, true);
  const strategyName = "watch-semantics-strategy-reject-close-edge";
  const attempts = [];
  rejectFirstCloseOf([strategyName], attempts, (attempt) => attempt < 60);
  try {
    let requested = false;
    const schema = buildCase("reject-close-edge", {
      watch: "1h",
      frameHours: 8,
      getSignal: () => marketLong(Infinity),
      callbacks: {
        onActivePing: async (symbol) => {
          if (requested) return;
          requested = true;
          await commitClosePending(symbol);
        },
      },
    });
    const pings = [];
    const unPing = listenActivePing((event) => { if (event.strategyName === strategyName) pings.push(minute(event.timestamp)); });
    let closed;
    try {
      ({ closed } = await runCase(schema));
    } finally {
      unPing();
    }
    if (closed.length !== 1 || closed[0].closeReason !== "closed") return fail(`expected one user close, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
    const minutes = attempts.map((a) => a.at);
    const expected = Array.from({ length: 61 }, (_, i) => 60 + i);
    if (minutes.join(",") !== expected.join(",")) {
      return fail(`expected one close attempt per candle from 60 to 120, got ${minutes.length} attempts: ${minutes.slice(0, 6).join(",")}…${minutes.slice(-3).join(",")}`);
    }
    if (minute(closed[0].closeTimestamp) !== 120) return fail(`expected the close on minute 120, got ${minute(closed[0].closeTimestamp)}`);
    // the only look before the close was the one that asked for it; no span was replayed
    if (pings.join(",") !== "59") return fail(`expected a single active ping on minute 59, got ${pings.join(",")}`);
    pass(`61 attempts on minutes 60..120 across the window edge, closed@120, pings: ${pings.join(",")}`);
  } finally {
    setConfig({ CC_MAX_CANDLES_PER_REQUEST: 1000, CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999, CC_ORDER_CLOSE_RETRY_ATTEMPTS: 5 }, true);
  }
});

test("WATCH SEMANTICS: an Infinity hold activated from a scheduled entry keeps a regular watch grid from the activation minute across replay windows", async ({ pass, fail }) => {
  // resting long activated on minute 100; 1h watch with the default 1000-candle page → windows of 16 spans.
  // Without the hand-back at activation the leftover of the scheduled array ended on a partial span.
  setConfig({ CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity }, true);
  try {
    const schema = buildCase("activate-infinity", {
      watch: "1h",
      frameHours: 40,
      candleByMinute: { 100: { low: 94 } },
      getSignal: () => ({ ...marketLong(Infinity), priceOpen: 95 }),
    });
    const pings = [];
    const unPing = listenActivePing((event) => { if (event.strategyName === schema.strategyName) pings.push(minute(event.timestamp)); });
    let opened;
    try {
      ({ opened } = await runCase(schema));
    } finally {
      unPing();
    }
    if (opened.length !== 1 || minute(opened[0].signal.pendingAt) !== 100) return fail(`expected the activation on minute 100, got ${opened.map((o) => minute(o.signal.pendingAt)).join(",")}`);
    // the span count starts on the candle after the activation one (the scheduled loop consumed it):
    // evaluations at +60, +120, +180 … from the activation, every one 60 minutes after the previous;
    // the frame end may cut the last span
    const gaps = pings.map((p, i) => (i ? p - pings[i - 1] : p - 100));
    const regular = gaps.slice(0, -1);
    if (regular.some((g) => g !== 60)) {
      return fail(`expected evaluations at +60, +120, +180 … from the activation, got offsets ${pings.map((p) => p - 100).slice(0, 24).join(",")}… (gaps ${gaps.slice(0, 24).join(",")})`);
    }
    if (pings.length < 30) return fail(`expected the grid to cross at least one window boundary (16 spans), got ${pings.length} evaluations`);
    pass(`${pings.length} evaluations, gaps ${[...new Set(regular)].join(",")} min, first at activation+${gaps[0]}`);
  } finally {
    setConfig({ CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999 }, true);
  }
});

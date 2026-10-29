import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  setConfig,
  lib,
  commitClosePending,
  listenActivePing,
  listenPartialLossAvailable,
  listenError,
  listenExit,
  OrderRejectedError,
} from "../../build/index.mjs";

// The broker gate attacks the exchange-forced closes (stop / liquidation / take-profit
// by VWAP / time expiry) of a position replayed with a coarse watchInterval. A refusal
// lands on the exact candle inside the span; the retry must land on the NEXT candle on
// every watch — never on the next span end, never lost when the price walks away, never
// skipped at a span end or at a replay window edge. The oracle is the 1m watch: every
// coarser watch must produce the same attempts, the same close (reason, minute, price)
// and the same observations of the refused candle.

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const FRAME_START = Date.parse("2024-03-01T00:00:00Z");
const BASE = 100;
const TP = 119;
const SL = 85;
const WATCHES = ["1m", "15m", "1h", "4h"];

/** Values the suite runs with (test/config/setup.mjs and the engine defaults) */
const BASELINE = { CC_MAX_CANDLES_PER_REQUEST: 1000, CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999, CC_ORDER_CLOSE_RETRY_ATTEMPTS: 5 };
const withConfig = async (overrides, fn) => {
  setConfig({ ...BASELINE, ...overrides }, true);
  try { return await fn(); } finally { setConfig(BASELINE, true); }
};

const minute = (timestamp) => (timestamp - FRAME_START) / MIN_MS;

/**
 * The gate: strategyName → { attempts, refuse }. `refuse({ attempt, at, reason })`
 * returns false (confirm), true (transient refusal: the callback throws), "false"
 * (transient refusal through the legacy boolean contract) or "terminal" (an
 * OrderRejectedError: retrying is pointless). Backtest gates short-circuit to
 * "confirmed", so the refusal is fed through params.onOrderSync of the strategy
 * instance — the hook the engine's own retry tests use.
 */
const GATES = new Map();
{
  const realService = Object.getPrototypeOf(lib.strategyConnectionService);
  const originalGetStrategy = realService.getStrategy;
  const wrapped = (...args) => {
    const strategy = originalGetStrategy(...args);
    const gate = GATES.get(strategy.params.strategyName);
    if (gate && !strategy.__attackGate) {
      strategy.__attackGate = true;
      const original = strategy.params.onOrderSync;
      strategy.params.onOrderSync = async (event) => {
        if (event.action === "signal-close") {
          const record = { attempt: event.attempt, at: minute(event.timestamp), reason: event.closeReason };
          gate.attempts.push(record);
          const verdict = gate.refuse(record);
          if (verdict === "terminal") throw new OrderRejectedError("attack: terminal rejection");
          if (verdict === "false") return false;
          if (verdict) throw new Error("attack: transient refusal");
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
}

/**
 * Flat candles at BASE with per-minute overrides (minute counted from FRAME_START);
 * the frame ticks hourly, the strategy opens `signal` on its first tick (minute 0).
 */
const buildCase = (name, { watch, candleByMinute = {}, signal, refuse, callbacks = undefined, frameHours = 6 }) => {
  const exchangeName = `refuse-close-exchange-${name}`;
  const strategyName = `refuse-close-strategy-${name}`;
  const frameName = `refuse-close-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`refuse close exchange: only 1m bars, got ${candleInterval}`);
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
    ...(callbacks && { callbacks }),
  });
  addFrameSchema({ frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + frameHours * HOUR_MS) });
  GATES.set(strategyName, { attempts: [], refuse });
  return { exchangeName, strategyName, frameName };
};

/**
 * Runs the case. A fatal engine error (process.exit) is turned into `fatal`; the
 * gate attempts come back as "attempt@minute", the close as reason / minute / price.
 */
const runCase = async (schema) => {
  const events = { closed: [], pings: [], partialLoss: [], errors: [], exits: [] };
  const own = (event) => event.strategyName === schema.strategyName;
  const unsubscribe = [
    listenActivePing((event) => { if (own(event)) events.pings.push(minute(event.timestamp)); }),
    listenPartialLossAvailable((event) => { if (own(event)) events.partialLoss.push(`${event.level}@${minute(event.timestamp)}`); }),
    listenError((error) => { events.errors.push(error?.name ?? String(error)); }),
    listenExit((error) => { events.exits.push(error?.message ?? String(error)); }),
  ];
  const realExit = process.exit;
  let exitCode = null;
  let fatal = null;
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };
  try {
    for await (const result of Backtest.run("BTCUSDT", schema)) {
      if (result.action === "closed") events.closed.push(result);
    }
  } catch (error) {
    fatal = error;
  } finally {
    process.exit = realExit;
    unsubscribe.forEach((un) => un());
  }
  const gate = GATES.get(schema.strategyName);
  return {
    attempts: gate.attempts.map((a) => `${a.attempt}@${a.at}`),
    reasons: [...new Set(gate.attempts.map((a) => a.reason))],
    close: events.closed.map((c) => ({ reason: c.closeReason, at: minute(c.closeTimestamp), price: Math.round(c.currentPrice * 1e6) / 1e6 })),
    pings: events.pings,
    partialLoss: events.partialLoss,
    errors: events.errors,
    exits: events.exits,
    fatal: fatal ? fatal.message : null,
    exitCode,
  };
};

/** Runs `spec` on every watch; returns results by watch */
const runOnWatches = async (name, spec, watches = WATCHES) => {
  const results = {};
  for (const watch of watches) results[watch] = await runCase(buildCase(`${name}-${watch}`, { ...spec, watch }));
  return results;
};

/** Fails unless `pick(result)` is identical on every watch to the 1m oracle; returns false when it is */
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

const long = (hold, extra = {}) => ({ position: "long", priceTakeProfit: TP, priceStopLoss: SL, cost: 1000, minuteEstimatedTime: hold, ...extra });
const short = (hold) => ({ position: "short", priceTakeProfit: 2 * BASE - TP, priceStopLoss: 2 * BASE - SL, cost: 1000, minuteEstimatedTime: hold });

/** Candle overrides on minutes from..to (inclusive) */
const range = (from, to, candle) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, candle]));

const first = (a) => a.attempt === 0;

test("REFUSED CLOSE: a transient refusal of the stop is retried on the next candle on every watch, for a long (touched by the low) and a short (touched by the high)", async ({ pass, fail }) => {
  // the stop is touched on minutes 20..25 and the first attempt (minute 20) is refused:
  // the retry lands on minute 21 — a watch that re-entered the loop at its span end would
  // miss the touches and carry the position on
  const cases = [
    { name: "long", signal: long(300), candleByMinute: range(20, 25, { low: SL }) },
    { name: "short", signal: short(300), candleByMinute: range(20, 25, { high: 2 * BASE - SL }) },
  ];
  const report = [];
  for (const spec of cases) {
    const results = await runOnWatches(`stop-${spec.name}`, { ...spec, refuse: first });
    const expected = { attempts: ["0@21", "1@22"], close: [{ reason: "stop_loss", at: 22, price: spec.name === "long" ? SL : 2 * BASE - SL }], fatal: null };
    if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
      return fail(`${spec.name} on 1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
    }
    if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, spec.name)) return;
    report.push(`${spec.name}: refused@21 closed@22`);
  }
  pass(`${report.join(" | ")} on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: a take-profit by VWAP refused on its candle is retried on the next candle while the VWAP still holds", async ({ pass, fail }) => {
  // the 5-candle VWAP reaches 119 on minute 79 — (100 + 4×125) / 5 = 120 — and stays there while the
  // spike lasts (76..83); the refusal on 79 is retried and accepted on 80 at the take-profit price
  const results = await runOnWatches("tp", { signal: long(300), candleByMinute: range(76, 83, { open: 125, high: 125, low: 125, close: 125 }), refuse: first });
  const expected = { attempts: ["0@80", "1@81"], close: [{ reason: "take_profit", at: 81, price: TP }], fatal: null };
  if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
    return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  }
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, "take-profit")) return;
  pass(`take_profit refused@79, accepted@80 at ${TP} on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: a refused time expiry is retried on the following candles — across the end of the hold window — and closes at the VWAP of the accepting candle", async ({ pass, fail }) => {
  // hold 100: the expiry candle 100 is the LAST candle of the replay window the orchestrator
  // fetched for the hold, so the retries need candles the window does not have. Three refusals
  // (100, 101, 102) must give one attempt per candle and the close on 103 — not a second attempt
  // on 100 itself and not a dead backtest. The price is 90 from minute 98 on: VWAP 94 on 100,
  // 90 on 103 — the accepted retry carries the VWAP of its own candle
  const results = await runOnWatches("expiry", { signal: long(100), candleByMinute: range(98, 110, { open: 90, high: 90, low: 90, close: 90 }), refuse: (a) => a.attempt < 3 });
  const expected = { attempts: ["0@100", "1@101", "2@102", "3@103"], close: [{ reason: "time_expired", at: 103, price: 90 }], fatal: null };
  if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
    return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  }
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, "time expiry")) return;
  pass(`time_expired refused@100,101,102 (window end at 100), accepted@103 at VWAP 90 on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: a refusal exactly on a span end is retried on the first candle of the next span", async ({ pass, fail }) => {
  // minute 59 is the span end of the 1m, 15m and 1h watches and a mid-span candle of the 4h watch:
  // the re-entry rule (evalIndex < i) must not drop the retry when the refused candle IS the span end
  const results = await runOnWatches("span-end", { signal: long(300), candleByMinute: range(59, 65, { low: SL }), refuse: first });
  const expected = { attempts: ["0@60", "1@61"], close: [{ reason: "stop_loss", at: 61, price: SL }], fatal: null };
  if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
    return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  }
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, "span end")) return;
  pass(`stop refused on the span end 59, accepted@60 on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: a refusal streak over several span ends gets exactly one attempt per candle, none skipped, none doubled", async ({ pass, fail }) => {
  // the stop is touched from minute 50 to 200 and refused 70 times: attempts must sit on every
  // candle 50..120 — across the 15m span ends (59, 74, 89, 104, 119) and the 1h span ends (59, 119)
  await withConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 0 }, async () => {
    const results = await runOnWatches("streak", { signal: long(300), candleByMinute: range(50, 200, { low: SL }), refuse: (a) => a.attempt < 70 });
    const expectedAttempts = Array.from({ length: 71 }, (_, k) => `${k}@${51 + k}`);
    const expected = { attempts: expectedAttempts, close: [{ reason: "stop_loss", at: 121, price: SL }], fatal: null };
    if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
      return fail(`1m: expected 71 attempts on 51..121 and the close on 121, got ${results["1m"].attempts.length} attempts ${results["1m"].attempts.slice(0, 3).join(",")}…${results["1m"].attempts.slice(-2).join(",")}, close ${JSON.stringify(results["1m"].close)}`);
    }
    if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, "streak")) return;
    pass(`71 attempts on minutes 50..120 across the span ends, closed@120 on ${WATCHES.join("/")}`);
  });
});

test("REFUSED CLOSE: a refusal streak across the replay window edges gets one attempt per candle, nothing replayed", async ({ pass, fail }) => {
  // 600-candle pages → the 1h watch replays windows of two whole spans (0..119 | 120..239 | 240..359 …),
  // the 4h watch windows of two 4h spans. The stop is touched from minute 100 to 300 and refused 150
  // times: attempts on every candle 100..250 — across the 1h window edges 120 and 240
  await withConfig({ CC_MAX_CANDLES_PER_REQUEST: 600, CC_ORDER_CLOSE_RETRY_ATTEMPTS: 0, CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity }, async () => {
    const results = await runOnWatches("window-edge", { signal: long(Infinity), frameHours: 8, candleByMinute: range(100, 300, { low: SL }), refuse: (a) => a.attempt < 150 });
    const expectedAttempts = Array.from({ length: 151 }, (_, k) => `${k}@${101 + k}`);
    const expected = { attempts: expectedAttempts, close: [{ reason: "stop_loss", at: 251, price: SL }], fatal: null };
    if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
      return fail(`1m: expected 151 attempts on 101..251 and the close on 251, got ${results["1m"].attempts.length} attempts ${results["1m"].attempts.slice(0, 3).join(",")}…${results["1m"].attempts.slice(-2).join(",")}, close ${JSON.stringify(results["1m"].close)}`);
    }
    if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, "window edge")) return;
    pass(`151 attempts on minutes 100..250 across the window edges 120 and 240, closed@250 on ${WATCHES.join("/")}`);
  });
});

test("REFUSED CLOSE: when the price walks away after the refusal the position stays open, and the next real stop closes with the attempt counter continued", async ({ pass, fail }) => {
  // the stop is touched on minute 20 only (refused) and the price is back at 100 on 21: no close may
  // be recorded at a stale price. The stop is touched again on 70..72: accepted at once as attempt 1
  const results = await runOnWatches("walk-away", { signal: long(300), candleByMinute: { ...range(20, 20, { low: SL }), ...range(70, 72, { low: SL }) }, refuse: first });
  const expected = { attempts: ["0@21", "1@71"], close: [{ reason: "stop_loss", at: 71, price: SL }], fatal: null };
  if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
    return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  }
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, "walk away")) return;
  pass(`refused@21, price away on 22, the next touch closes@71 as attempt 1 on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: a refusal by the legacy boolean contract (onOrderSync returns false) is the same transient refusal as a throw", async ({ pass, fail }) => {
  const results = await runOnWatches("legacy-false", { signal: long(300), candleByMinute: range(20, 25, { low: SL }), refuse: (a) => (a.attempt === 0 ? "false" : false) });
  const expected = { attempts: ["0@21", "1@22"], close: [{ reason: "stop_loss", at: 22, price: SL }], fatal: null };
  if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
    return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  }
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, "legacy false")) return;
  pass(`false@20 retried and accepted@21 on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: a terminal OrderRejectedError forces the close on the refused candle itself, with no retry, on every watch", async ({ pass, fail }) => {
  // "no counterparty, retrying is pointless": the engine records the stop on minute 20 without
  // broker confirmation and reports the rejection through the error bus
  const results = await runOnWatches("terminal", { signal: long(300), candleByMinute: range(20, 25, { low: SL }), refuse: (a) => (a.attempt === 0 ? "terminal" : false) });
  const expected = { attempts: ["0@21"], close: [{ reason: "stop_loss", at: 21, price: SL }], fatal: null };
  if (JSON.stringify({ attempts: results["1m"].attempts, close: results["1m"].close, fatal: results["1m"].fatal }) !== JSON.stringify(expected)) {
    return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(results["1m"])}`);
  }
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal, rejected: r.errors.includes("OrderRejectedError") }), fail, "terminal")) return;
  if (!results["1m"].errors.includes("OrderRejectedError")) return fail(`expected the OrderRejectedError on the error bus, got ${JSON.stringify(results["1m"].errors)}`);
  pass(`terminal rejection@20 → forced stop_loss@20, no retry, OrderRejectedError reported, on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: transient refusals exhausted (CC_ORDER_CLOSE_RETRY_ATTEMPTS=3) force the close on the exhausting attempt and raise the fatal exit event, identically on every watch", async ({ pass, fail }) => {
  // every attempt is refused: attempts 0..3 on minutes 20..23 (one per candle), the fourth
  // started attempt exceeds the cap → the engine force-closes on 23 without broker confirmation
  // and reports the exhaustion on the exit bus (listenExit) once the teardown is durable
  await withConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 3 }, async () => {
    const results = await runOnWatches("exhausted", { signal: long(300), candleByMinute: range(20, 40, { low: SL }), refuse: () => true });
    const oracle = results["1m"];
    if (oracle.attempts.join(",") !== "0@21,1@22,2@23,3@24") return fail(`1m: expected attempts 0@21..3@24, got ${oracle.attempts.join(",")}`);
    if (JSON.stringify(oracle.close) !== JSON.stringify([{ reason: "stop_loss", at: 24, price: SL }])) return fail(`1m: expected the forced stop_loss on 24 (the exhausting attempt), got ${JSON.stringify(oracle.close)}`);
    if (oracle.exits.length !== 1 || !oracle.exits[0].includes("close attempts exhausted")) return fail(`1m: expected one exit event about the exhausted close attempts, got ${JSON.stringify(oracle.exits)}`);
    if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, exits: r.exits, fatal: r.fatal }), fail, "exhausted")) return;
    pass(`4 refused attempts on 20..23, forced stop_loss@23, one exit event, on ${WATCHES.join("/")}`);
  });
});

test("REFUSED CLOSE: a refusal of the frame-end close is fatal on every watch — there is no next candle to retry on", async ({ pass, fail }) => {
  // hold 600 outruns the 6h frame: the position is closed by time_expired on the frame end;
  // the gate refuses that single attempt and the backtest dies instead of leaving the position open
  const results = await runOnWatches("frame-end", { signal: long(600), refuse: first });
  const oracle = results["1m"];
  if (oracle.close.length !== 0 || !oracle.fatal || oracle.exitCode !== -1) return fail(`1m: expected no close and a fatal exit, got close=${JSON.stringify(oracle.close)} exitCode=${oracle.exitCode} fatal=${oracle.fatal}`);
  if (oracle.attempts.length !== 1 || oracle.reasons.join() !== "time_expired") return fail(`1m: expected a single refused time_expired attempt on the frame end, got ${oracle.attempts.join(",")} (${oracle.reasons.join()})`);
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, exitCode: r.exitCode, reasons: r.reasons }), fail, "frame end")) return;
  pass(`frame-end time_expired refused@${oracle.attempts[0].split("@")[1]} → fatal exit, no close, on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: the refused candle is still observed on every watch — the active ping and the partial-loss levels fire on it", async ({ pass, fail }) => {
  // live-tick equivalence: a refused close falls through to the monitoring of that candle,
  // so the refused minute gets a ping and its loss levels even on a coarse watch
  const results = await runOnWatches("observed", { signal: long(300), candleByMinute: range(20, 25, { low: SL, close: SL }), refuse: first });
  const oracle = results["1m"];
  const expected = { attempts: ["0@21", "1@22"], close: [{ reason: "stop_loss", at: 22, price: SL }], fatal: null };
  if (JSON.stringify({ attempts: oracle.attempts, close: oracle.close, fatal: oracle.fatal }) !== JSON.stringify(expected)) {
    return fail(`1m: expected ${JSON.stringify(expected)}, got ${JSON.stringify(oracle)}`);
  }
  if (oracle.partialLoss.length === 0 || !oracle.partialLoss.every((l) => l.endsWith("@21"))) return fail(`1m: expected the partial-loss levels on the refused candle 20 (dated 21), got ${oracle.partialLoss.join(",")}`);
  for (const watch of WATCHES) {
    // the look of the refused candle 20 is dated 21, its close
    if (!results[watch].pings.includes(21)) return fail(`${watch}: expected an active ping on the refused candle 20 (dated 21), got pings ${results[watch].pings.join(",")}`);
  }
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal, partialLoss: r.partialLoss }), fail, "observed")) return;
  pass(`ping@21 and loss levels ${oracle.partialLoss.join(",")} on the refused candle 20 on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: a user close asked from the refused candle's ping wins over the stop retry on the next candle, on every watch", async ({ pass, fail }) => {
  // the strategy reacts to the ping of the refused minute 20 with commitClosePending: on 21 the
  // user close takes precedence over the stop retry and is accepted as attempt 1, reason "closed"
  const results = await runOnWatches("user-wins", {
    signal: long(300),
    candleByMinute: range(20, 25, { low: SL, close: SL }),
    refuse: first,
    callbacks: {
      onActivePing: async (symbol, _data, _price, when) => {
        // the look of the refused candle 20 is dated 21
        if (minute(when.getTime()) === 21) await commitClosePending(symbol);
      },
    },
  });
  const oracle = results["1m"];
  if (oracle.attempts.join(",") !== "0@21,1@22" || oracle.close.length !== 1 || oracle.close[0].reason !== "closed" || oracle.close[0].at !== 22) {
    return fail(`1m: expected the user close to win on 22 as attempt 1, got ${JSON.stringify(oracle)}`);
  }
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal, reasons: r.reasons }), fail, "user wins")) return;
  pass(`stop refused@21, user close from that ping accepted@22 (${oracle.reasons.join("→")}) on ${WATCHES.join("/")}`);
});

test("REFUSED CLOSE: a liquidation on isolated margin refused once is retried on the next candle at the liquidation price", async ({ pass, fail }) => {
  // ×5 isolated: the liquidation price (about 80) sits above the stop (70) and is the effective
  // stop level; the lows on 20..25 touch it, the refusal on candle 20 (dated 21) is retried and accepted on candle 21 (dated 22)
  const results = await runOnWatches("liquidation", { signal: long(300, { priceStopLoss: 70, multiplier: 5, isolated: true }), candleByMinute: range(20, 25, { low: 75 }), refuse: first });
  const oracle = results["1m"];
  if (oracle.attempts.join(",") !== "0@21,1@22" || oracle.close.length !== 1 || oracle.close[0].reason !== "liquidation" || oracle.close[0].at !== 22) {
    return fail(`1m: expected the liquidation refused@21 and accepted@22, got ${JSON.stringify(oracle)}`);
  }
  if (oracle.close[0].price < 75 || oracle.close[0].price > 85) return fail(`1m: the liquidation price must be the ×5 level near 80, got ${oracle.close[0].price}`);
  if (differs(results, (r) => ({ attempts: r.attempts, close: r.close, fatal: r.fatal }), fail, "liquidation")) return;
  pass(`liquidation refused@21, accepted@22 at ${oracle.close[0].price} on ${WATCHES.join("/")}`);
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Budget,
  setConfig,
  listenSignalBacktest,
  listenOrderSchedule,
  listenPartialProfitAvailable,
  listenBreakevenAvailable,
  listenActivePingInterval,
  listenDoneBacktest,
  lib,
} from "../../build/index.mjs";
import { Subject, sleep } from "functools-kit";

// ─────────────────────────────────────────────────────────────────────────────
// "A quarter of a portfolio": six symbols on one shared budget under lockstep,
// a realistic synthetic tape and every mechanism of the replay in one run.
//
// The oracle: the same quarter is run on a 1m watch and twice on a 1d watch.
// Everything the engine declares exact must be identical across the three runs —
// the budget journal, the closes (reason / minute / price), the activations
// (pendingAt / priceOpen), the partial levels and the breakeven events with their
// minutes, the recorded peak and drawdown of every position. Only the pings may
// differ. A difference between the 1m and the 1d run means the coarse watch
// stopped being a pure optimisation; a difference between the two 1d runs means
// the engine is not deterministic.
//
// The launch order is NOT varied on purpose: under lockstep the ticks of one
// timeframe run in launch order, so when the shared budget has room for four of
// the five symbols ticking at the same hour, the launch order decides who gets
// the money (the `Launcher` symbol list is that priority). Reversing it changes
// the journal legitimately — it is a different configuration, not a different
// interleaving.
//
// PORTFOLIO_DAYS (default 90) and PORTFOLIO_THINK_MS (default 1, the LLM
// imitation inside getSignal) shorten a local run.
// ─────────────────────────────────────────────────────────────────────────────

const DAYS = Number(process.env.PORTFOLIO_DAYS ?? 90);
const THINK_MS = Number(process.env.PORTFOLIO_THINK_MS ?? 1);
const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 1440 * MIN_MS;
const START = Date.parse("2024-01-01T00:00:00Z");
const END = START + DAYS * DAY_MS;
const TAPE_FROM = START - DAY_MS;            // one day of history for the VWAP buffer
const TAPE_TO = END + DAY_MS;                // and one day past the frame end for the last fetch

const CAPITAL = 10_000;
const COST = 2_500;                          // four positions fit, the fifth symbol waits
const HOLD_MINUTES = 30 * 1440;
const PARTIAL_LEVEL = 30;                    // 30 % of the way to the take-profit → close a third
const PARTIAL_PERCENT = 33;

/** Symbol → tape regime. Drift and volatility are per minute in log space. */
const SYMBOLS = {
  ALPUSDT: { seed: 11, start: 100, drift: 2e-6, vol: 6e-4, note: "gentle uptrend; runs through Backtest.run next to the backgrounds" },
  BRVUSDT: { seed: 23, start: 50, drift: 0, vol: 8e-4, gap: { from: START + 20 * DAY_MS + 10 * HOUR_MS, to: START + 20 * DAY_MS + 16 * HOUR_MS }, note: "flat, six hours of missing candles on day 20" },
  CHRUSDT: { seed: 37, start: 20, drift: 9e-6, vol: 7e-4, note: "strong uptrend: take-profits and partials" },
  DLTUSDT: { seed: 41, start: 300, drift: -4e-6, vol: 9e-4, note: "downtrend: stops" },
  ECHUSDT: { seed: 53, start: 80, drift: 1e-6, vol: 7e-4, dies: START + 5 * DAY_MS, note: "its candle feed fails from day 5: the backtest dies and leaves its money deployed" },
  FOXUSDT: { seed: 67, start: 10, drift: 0, vol: 1.5e-4, greedy: true, note: "sideways and quiet: resting entries time out; places orders without checking the budget" },
};
const CRASH_DAY = 40;                        // -15 % intraday on every symbol, half recovered by the close

/** Deterministic LCG in (0, 1) */
const makeRandom = (seed) => {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
};

/** The whole tape of a symbol: one close per minute from TAPE_FROM to TAPE_TO */
const buildTape = (spec) => {
  const random = makeRandom(spec.seed);
  const minutes = Math.round((TAPE_TO - TAPE_FROM) / MIN_MS);
  const closes = new Float64Array(minutes);
  let price = spec.start;
  for (let m = 0; m < minutes; m++) {
    const timestamp = TAPE_FROM + m * MIN_MS;
    const z = (random() + random() + random() - 1.5) * 2; // roughly normal, unit variance
    price *= Math.exp(spec.drift + spec.vol * z);
    // the crash day: a dip to -15 % between 10:00 and 14:00, half of it recovered by midnight
    const dayIndex = Math.floor((timestamp - START) / DAY_MS);
    if (dayIndex === CRASH_DAY) {
      const minuteOfDay = (timestamp - START - dayIndex * DAY_MS) / MIN_MS;
      let factor = 1;
      if (minuteOfDay >= 600 && minuteOfDay < 840) factor = 1 - 0.15 * ((minuteOfDay - 600) / 240);
      else if (minuteOfDay >= 840) factor = 0.85 + 0.075 * ((minuteOfDay - 840) / 600);
      closes[m] = price * factor;
      continue;
    }
    closes[m] = price;
  }
  return closes;
};

const TAPES = Object.fromEntries(Object.entries(SYMBOLS).map(([symbol, spec]) => [symbol, buildTape(spec)]));

const candleAt = (symbol, index) => {
  const tape = TAPES[symbol];
  const close = tape[index];
  const open = index > 0 ? tape[index - 1] : close;
  return {
    timestamp: TAPE_FROM + index * MIN_MS,
    open,
    high: Math.max(open, close) * 1.0004,
    low: Math.min(open, close) * 0.9996,
    close,
    volume: 1_000,
  };
};

const inGap = (symbol, timestamp) => {
  const gap = SYMBOLS[symbol].gap;
  return Boolean(gap && timestamp >= gap.from && timestamp < gap.to);
};

/** Stable key of a position across runs: the symbol and the tick its entry was placed on */
const keyOf = (symbol, scheduledAt) => `${symbol}@${(scheduledAt - START) / MIN_MS}`;

/**
 * Deterministic across runs: the first close attempt of every third position is refused by
 * the gate. Never at the frame end: a refused frame-end close has no next candle to retry
 * on and is fatal by contract.
 */
const GATE_REFUSES = (symbol, scheduledAt, closeTimestamp) => {
  if (closeTimestamp >= END) return false;
  const minute = (scheduledAt - START) / MIN_MS;
  let hash = 0;
  for (const ch of `${symbol}:${minute}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 3 === 0;
};

/**
 * Backtest gates short-circuit to "confirmed": the broker refusal is fed through
 * params.onOrderSync of the strategy instance (the hook the retry tests use).
 */
const installGate = (strategyNames) => {
  const realService = Object.getPrototypeOf(lib.strategyConnectionService);
  const originalGetStrategy = realService.getStrategy;
  const wrapped = (...args) => {
    const strategy = originalGetStrategy(...args);
    if (!strategy.__portfolioGate && strategyNames.has(strategy.params.strategyName)) {
      strategy.__portfolioGate = true;
      const original = strategy.params.onOrderSync;
      strategy.params.onOrderSync = async (event) => {
        if (event.action === "signal-close" && event.attempt === 0 && GATE_REFUSES(event.symbol, event.signal.scheduledAt, event.timestamp)) {
          throw new Error("portfolio: exchange refused the first close attempt");
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

const minute = (timestamp) => (timestamp - START) / MIN_MS;
const round = (value) => Math.round(value * 1e6) / 1e6;

/**
 * One run of the quarter: registers the schemas under `name`, launches five
 * symbols in the background in `order` and the sixth through Backtest.run, and
 * collects everything the oracle compares.
 */
const runQuarter = async ({ name, watch, order }) => {
  const exchangeName = `portfolio-exchange-${name}`;
  const strategyName = `portfolio-strategy-${name}`;
  const frameName = `portfolio-frame-${name}`;
  const context = { strategyName, exchangeName, frameName };
  const budget = new Budget({ name: `fund-${name}`, initialCapital: CAPITAL });
  const budgetKey = { ...context, backtest: true, name: `fund-${name}`, initialCapital: CAPITAL };

  addExchangeSchema({
    exchangeName,
    getCandles: async (symbol, interval, since, limit) => {
      if (interval !== "1m") throw new Error(`portfolio exchange: only 1m bars, got ${interval}`);
      const spec = SYMBOLS[symbol];
      if (spec.dies && since.getTime() >= spec.dies) {
        throw new Error(`portfolio exchange: the ${symbol} feed is down from ${new Date(spec.dies).toISOString()}`);
      }
      const out = [];
      let index = Math.max(0, Math.round((since.getTime() - TAPE_FROM) / MIN_MS));
      while (out.length < limit && index < TAPES[symbol].length) {
        const timestamp = TAPE_FROM + index * MIN_MS;
        if (!inGap(symbol, timestamp)) out.push(candleAt(symbol, index));
        index += 1;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  const ticks = {};
  addStrategySchema({
    strategyName,
    interval: "1h",
    getSignal: async (symbol, when, currentPrice) => {
      ticks[symbol] = (ticks[symbol] ?? 0) + 1;
      if (THINK_MS > 0) await sleep(THINK_MS); // the LLM
      const spec = SYMBOLS[symbol];
      // the disciplined symbols check the shared budget before placing an order; the greedy one does not
      if (!spec.greedy && (await budget.getFree()) < COST) return null;
      return {
        position: "long",
        priceOpen: currentPrice * 0.99,
        priceStopLoss: currentPrice * 0.91,
        priceTakeProfit: currentPrice * 1.4,
        cost: COST,
        minuteEstimatedTime: HOLD_MINUTES,
      };
    },
  });
  addFrameSchema({ frameName, entryInterval: "1h", watchInterval: watch, startDate: new Date(START), endDate: new Date(END) });

  const collected = { journalKeys: new Set(), activations: [], closes: [], partials: [], breakevens: [], scheduled: [], cancelled: [], budgetRefusals: [], dailyLooks: 0, pings: 0 };
  const own = (event) => event.strategyName === strategyName;
  const unsubscribe = [
    // the resting entry locks its cost while it waits; a refusal pulls the order
    listenOrderSchedule(async (event) => {
      if (!own(event)) return;
      const ctx = { ...budgetKey, symbol: event.symbol, when: new Date(event.timestamp) };
      if (event.action === "scheduled") {
        collected.scheduled.push(`${keyOf(event.symbol, event.data.scheduledAt)}`);
        const taken = await Budget._reserve({ id: event.data.id, amount: COST, note: event.symbol }, ctx);
        if (!taken) {
          collected.budgetRefusals.push(keyOf(event.symbol, event.data.scheduledAt));
          await Backtest.commitCancelScheduled(event.symbol, context);
        }
        return;
      }
      collected.cancelled.push(`${keyOf(event.symbol, event.data.scheduledAt)}:${event.reason}@${minute(event.timestamp)}`);
      await Budget._release({ id: event.data.id, pnl: 0, note: `cancel ${event.reason}` }, ctx);
    }),
    listenSignalBacktest(async (event) => {
      if (!own(event)) return;
      if (event.action === "opened") {
        collected.activations.push(`${keyOf(event.symbol, event.signal.scheduledAt)}:pending@${minute(event.signal.pendingAt)} open=${round(event.signal.priceOpen)}`);
      }
      if (event.action === "closed") {
        collected.closes.push(`${keyOf(event.symbol, event.signal.scheduledAt)}:${event.closeReason}@${minute(event.closeTimestamp)} price=${round(event.currentPrice)} pnl=${round(event.pnl.pnlPercentage)} peak=${round(event.signal.peakProfit.pnlPercentage)}@${minute(event.signal.peakProfit.timestamp ?? event.signal.pendingAt)} dd=${round(event.signal.maxDrawdown.pnlPercentage)}`);
        await Budget._release({ id: event.signal.id, pnl: event.pnl.pnlCost, note: event.closeReason }, { ...budgetKey, symbol: event.symbol, when: new Date(event.closeTimestamp) });
      }
    }),
    listenPartialProfitAvailable(async (event) => {
      if (!own(event)) return;
      collected.partials.push(`${keyOf(event.symbol, event.data.scheduledAt)}:L${event.level}@${minute(event.timestamp)}`);
      if (event.level === PARTIAL_LEVEL) {
        await Backtest.commitPartialProfit(event.symbol, PARTIAL_PERCENT, event.currentPrice, context);
      }
    }),
    listenBreakevenAvailable(async (event) => {
      if (!own(event)) return;
      collected.breakevens.push(`${keyOf(event.symbol, event.data.scheduledAt)}@${minute(event.timestamp)}`);
      await Backtest.commitBreakeven(event.symbol, event.currentPrice, context);
    }),
    listenActivePingInterval((event) => { if (own(event)) collected.dailyLooks += 1; }, { interval: "1d" }),
    listenSignalBacktest((event) => { if (own(event) && event.action === "active") collected.pings += 1; }),
  ];

  const symbols = Object.keys(SYMBOLS);
  const survivors = symbols.filter((symbol) => !SYMBOLS[symbol].dies);
  const [runner, ...backgrounds] = order;
  const done = new Set();
  const allDone = new Subject();
  const unDone = listenDoneBacktest((event) => {
    if (event.frameName !== frameName) return;
    done.add(event.symbol);
    if (survivors.filter((s) => s !== runner).every((s) => done.has(s))) allDone.next();
  });
  const warnings = [];
  const exits = [];
  const realExit = process.exit;
  const realWarn = console.warn;
  const realError = console.error;
  // a fatal backtest ends in process.exit(-1): record it and let the dying symbol's task unwind
  process.exit = (code) => { exits.push(code); };
  console.warn = (message) => { warnings.push(String(message)); };
  console.error = () => void 0;
  const startedAt = Date.now();
  try {
    for (const symbol of backgrounds) Backtest.background(symbol, context);
    const runnerDone = (async () => { for await (const _ of Backtest.run(runner, context)) { /* drain */ } })();
    await Promise.all([allDone.toPromise(), runnerDone]);
  } finally {
    process.exit = realExit;
    console.warn = realWarn;
    console.error = realError;
    unDone();
    unsubscribe.forEach((un) => un());
  }
  const elapsedMs = Date.now() - startedAt;

  const journal = await Budget._getHistory({ ...budgetKey, symbol: null, when: new Date(END + DAY_MS) });
  const rows = journal.map((r) => `${r.type}:${r.symbol}@${minute(r.timestamp)} ${r.type === "reject" ? `${r.requested}/${r.available}` : r.type === "release" ? `${r.amount} pnl=${round(r.pnl)}` : r.amount} free=${round(r.balance.free)}${r.overdraft !== undefined ? " OVERDRAFT" : ""}`);
  const balance = await Budget._getBalance({ ...budgetKey, symbol: null, when: new Date(END + DAY_MS) });
  const gaveUp = warnings.filter((m) => m.includes("lockstep gave up waiting")).length;
  const sortAll = (list) => [...list].sort();
  return {
    name, watch, elapsedMs, ticks, done: [...done].sort(), gaveUp, exits,
    exact: {
      journal: rows,
      activations: sortAll(collected.activations),
      closes: sortAll(collected.closes),
      partials: sortAll(collected.partials),
      breakevens: sortAll(collected.breakevens),
      scheduled: sortAll(collected.scheduled),
      cancelled: sortAll(collected.cancelled),
      budgetRefusals: sortAll(collected.budgetRefusals),
    },
    balance,
    pings: collected.pings,
    dailyLooks: collected.dailyLooks,
    journal,
  };
};

const firstDifference = (a, b) => {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) if (a[i] !== b[i]) return `#${i}: ${a[i] ?? "<none>"}  vs  ${b[i] ?? "<none>"}`;
  return null;
};

test(`PORTFOLIO QUARTER: ${DAYS} days, six symbols, one budget under lockstep — the 1m watch and two 1d watches produce the same journal, closes, activations, partials, breakevens and extremes`, async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  Budget.enable();
  const symbols = Object.keys(SYMBOLS);
  const runs = [
    { name: "watch-1m", watch: "1m", order: symbols },
    { name: "watch-1d", watch: "1d", order: symbols },
    { name: "watch-1d-again", watch: "1d", order: symbols },
  ];
  installGate(new Set(runs.map((r) => `portfolio-strategy-${r.name}`)));
  const results = [];
  for (const run of runs) results.push(await runQuarter(run));

  // invariants of every run
  for (const r of results) {
    const survivors = symbols.filter((s) => !SYMBOLS[s].dies && s !== r.name && s !== symbols[0]);
    if (survivors.some((s) => !r.done.includes(s))) return fail(`${r.name}: not every survivor finished: done=${r.done.join(",")}`);
    // getSignal runs on the idle ticks only (a replay consumes the timeframes of its position), so the
    // Backtest.run symbol ticks fewer than DAYS × 24 times; it must have ticked and have run to the end
    if (!(r.ticks[symbols[0]] > 0)) return fail(`${r.name}: the Backtest.run symbol never ticked`);
    if (r.journal.some((row) => row.type === "reserve" && row.overdraft !== undefined)) return fail(`${r.name}: overdraft in the journal:\n${r.exact.journal.filter((l) => l.includes("OVERDRAFT")).join("\n")}`);
    if (r.exits.length !== 1) return fail(`${r.name}: expected exactly one fatal exit (the dying symbol), got ${r.exits.length}`);
    // every reserve is released by the end of the quarter, except what the dying symbol left deployed
    const released = new Set(r.journal.filter((row) => row.type === "release").map((row) => row.id));
    const stillOpen = r.journal.filter((row) => row.type === "reserve" && !released.has(row.id));
    const dying = Object.keys(SYMBOLS).filter((s) => SYMBOLS[s].dies);
    if (stillOpen.some((row) => !dying.includes(row.symbol))) return fail(`${r.name}: reserves left open by a surviving symbol: ${stillOpen.map((row) => `${row.symbol}@${minute(row.timestamp)}`).join(",")}`);
    const pnlSum = r.journal.filter((row) => row.type === "release").reduce((sum, row) => sum + row.pnl, 0);
    if (Math.abs(r.balance.capital - (CAPITAL + pnlSum)) > 1e-6) return fail(`${r.name}: capital ${r.balance.capital} must equal ${CAPITAL} + Σpnl ${pnlSum}`);
    if (Math.abs(r.balance.deployed - stillOpen.length * COST) > 1e-9) return fail(`${r.name}: deployed ${r.balance.deployed} must be what the dying symbol left behind (${stillOpen.length} × ${COST})`);
    if (!r.exact.closes.length || !r.exact.activations.length) return fail(`${r.name}: the tape produced no trades (${r.exact.closes.length} closes)`);
    if (r.exact.budgetRefusals.length === 0) return fail(`${r.name}: the greedy symbol never ran into the budget — the scenario lost its refusals`);
    if (r.gaveUp > 1) return fail(`${r.name}: lockstep gave up on peers ${r.gaveUp} times (at most once, for the dying symbol)`);
    if (r.dailyLooks === 0) return fail(`${r.name}: the daily interval listener never fired`);
  }

  // the oracle: everything exact is identical across the three runs
  const [reference, ...others] = results;
  for (const other of others) {
    for (const key of Object.keys(reference.exact)) {
      const diff = firstDifference(reference.exact[key], other.exact[key]);
      if (diff) return fail(`${other.name} differs from ${reference.name} in ${key} (${reference.exact[key].length} vs ${other.exact[key].length} entries): ${diff}`);
    }
  }
  const summary = results.map((r) => `${r.name}: ${(r.elapsedMs / 1000).toFixed(1)}s, ${r.pings} pings, ${r.dailyLooks} daily looks`).join(" | ");
  const ref = reference.exact;
  pass(`${DAYS} days: ${ref.scheduled.length} entries placed, ${ref.activations.length} activated, ${ref.cancelled.length} cancelled, ${ref.closes.length} closed (${ref.closes.filter((c) => c.includes(":take_profit")).length} TP / ${ref.closes.filter((c) => c.includes(":stop_loss")).length} SL / ${ref.closes.filter((c) => c.includes(":time_expired")).length} expired), ${ref.partials.length} partial levels, ${ref.breakevens.length} breakevens, ${ref.budgetRefusals.length} budget refusals, journal ${ref.journal.length} rows, final capital ${round(reference.balance.capital)} | ${summary}`);
});

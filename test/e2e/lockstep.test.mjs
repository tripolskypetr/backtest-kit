import { test } from "worker-testbed";
import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenBacktestProgress,
  listenDoneBacktest,
  listenError,
  listenIdlePing,
  listenSignalBacktest,
  listenActivePing,
  listenSchedulePing,
  setConfig,
  Budget,
  BudgetRejectedError,
} from "../../build/index.mjs";
import { Subject, sleep } from "functools-kit";

/**
 * CC_BACKTEST_LOCKSTEP: several backtests run in parallel through Backtest.background,
 * some strategies block inside getSignal on every tick (sleep), the others return at
 * once. Each timeframe iteration emits a backtest progress event with its `when`;
 * the spread between the latest `when` of the symbols is the clock divergence.
 *
 *   on       - two symbols: the fast one cannot run ahead, the spread never exceeds one timeframe
 *   off      - two symbols: the fast one finishes while the slow one sits on its first ticks
 *   on x10   - ten symbols with different tick delays: the spread still never exceeds one timeframe
 *   ping     - no getSignal at all: the position is opened from listenIdlePing via
 *              Backtest.commitCreateSignal; the replay of a 60-minute position moves that
 *              symbol's clock ahead by its lifetime, so the spread is bounded by lifetime + 1 timeframe
 *   budget   - the Budget is driven from the pings: _getFree on every schedule ping, _reserve on the
 *              first active ping of a signal, _release on close. Capital fits one position; the slow
 *              symbol's scheduled signal activates between two positions of the fast one. With lockstep
 *              the fast symbol's next reserve sees it and is REFUSED; without lockstep the fast symbol
 *              has already reserved on a free balance and the slow row lands before it: an OVERDRAFT.
 */
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

const FRAME_START = Date.parse("2024-01-01T00:00:00Z");
const FRAME_HOURS = 12;
const FRAME_END = FRAME_START + FRAME_HOURS * HOUR_MS;

const SLOW_SYMBOL = "SLOWUSDT";
const FAST_SYMBOL = "FASTUSDT";
const SLOW_TICK_MS = 25;

/** Ten symbols: every other one blocks in getSignal, each with its own delay */
const MANY_SYMBOLS = Array.from({ length: 10 }, (_, i) => `LS${i}USDT`);
const MANY_TICK_MS = Object.fromEntries(MANY_SYMBOLS.map((symbol, i) => [symbol, i % 2 ? 5 * i : 0]));

/** Lifetime of the position opened from the idle ping; flat candles close it by time_expired */
const PING_SIGNAL_MINUTES = 60;

const buildCase = (name, tickDelayMs, { withGetSignal = true } = {}) => {
  const exchangeName = `lockstep-exchange-${name}`;
  const strategyName = `lockstep-strategy-${name}`;
  const frameName = `lockstep-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") throw new Error(`lockstep exchange: only 1m bars, got ${interval}`);
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
  addStrategySchema({
    strategyName,
    interval: "1h",
    // no signals: every timeframe is a plain tick; the delayed symbols block on each of them
    ...(withGetSignal && {
      getSignal: async (symbol) => {
        const delay = tickDelayMs[symbol] ?? 0;
        if (delay > 0) {
          await sleep(delay);
        }
        return null;
      },
    }),
  });
  addFrameSchema({ frameName, interval: "1h", startDate: new Date(FRAME_START), endDate: new Date(FRAME_END) });
  return { exchangeName, strategyName, frameName };
};

/**
 * Runs every symbol in the background, waits for all of them to finish and returns
 * the largest clock spread (ms) observed between the symbols' latest `when`, over
 * every progress event emitted once all symbols had started and before any finished.
 */
const runCase = async (schema, symbols) => {
  const events = [];
  const unProgress = listenBacktestProgress((event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (event.progress >= 1) return;
    events.push({ symbol: event.symbol, when: event.when.getTime() });
  });

  const doneSubject = new Subject();
  let doneCount = 0;
  const unDone = listenDoneBacktest((event) => {
    if (event.frameName !== schema.frameName) return;
    doneCount += 1;
    if (doneCount === symbols.length) doneSubject.next();
  });
  let errorCaught = null;
  const unError = listenError((error) => {
    errorCaught = error;
    doneSubject.next();
  });

  for (const symbol of symbols) {
    Backtest.background(symbol, schema);
  }

  await doneSubject.toPromise();
  unProgress();
  unDone();
  unError();

  if (errorCaught) {
    throw new Error(`backtest failed: ${errorCaught.message || errorCaught}`);
  }

  const latest = new Map();
  let maxSpread = 0;
  for (const { symbol, when } of events) {
    latest.set(symbol, when);
    if (latest.size === symbols.length) {
      const whens = Array.from(latest.values());
      maxSpread = Math.max(maxSpread, Math.max(...whens) - Math.min(...whens));
    }
  }
  const ticks = Object.fromEntries(symbols.map((symbol) => [symbol, events.filter((e) => e.symbol === symbol).length]));
  return { events, maxSpread, ticks };
};

/** Fails when a symbol ticked fewer times than the frame has timeframes; returns true on failure */
const failedTickCount = (ticks, fail) => {
  const short = Object.entries(ticks).filter(([, count]) => count < FRAME_HOURS);
  if (short.length) {
    fail(`expected at least ${FRAME_HOURS} ticks per symbol, got ${short.map(([s, c]) => `${s}=${c}`).join(", ")}`);
    return true;
  }
  return false;
};

test("LOCKSTEP: with CC_BACKTEST_LOCKSTEP the fast backtest never runs more than one timeframe ahead of the one blocked in getSignal", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const symbols = [SLOW_SYMBOL, FAST_SYMBOL];
  const schema = buildCase("on", { [SLOW_SYMBOL]: SLOW_TICK_MS });
  const { events, maxSpread, ticks } = await runCase(schema, symbols);
  if (failedTickCount(ticks, fail)) return;
  if (maxSpread > HOUR_MS) {
    return fail(`clocks diverged by ${maxSpread / HOUR_MS} timeframes with lockstep on (expected at most 1)`);
  }
  pass(`lockstep on: max spread ${maxSpread / HOUR_MS} timeframe(s) over ${events.length} ticks`);
});

test("LOCKSTEP: without CC_BACKTEST_LOCKSTEP the fast backtest runs ahead of the blocked one (the harness detects divergence)", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: false }, true);
  const symbols = [SLOW_SYMBOL, FAST_SYMBOL];
  const schema = buildCase("off", { [SLOW_SYMBOL]: SLOW_TICK_MS });
  const { events, maxSpread } = await runCase(schema, symbols);
  if (maxSpread <= HOUR_MS) {
    return fail(`expected the clocks to diverge by more than one timeframe with lockstep off, got ${maxSpread / HOUR_MS}`);
  }
  pass(`lockstep off: max spread ${maxSpread / HOUR_MS} timeframes over ${events.length} ticks`);
});

test("LOCKSTEP: ten background backtests with different tick delays stay within one timeframe of each other", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const schema = buildCase("many", MANY_TICK_MS);
  const { events, maxSpread, ticks } = await runCase(schema, MANY_SYMBOLS);
  if (failedTickCount(ticks, fail)) return;
  if (maxSpread > HOUR_MS) {
    return fail(`clocks diverged by ${maxSpread / HOUR_MS} timeframes across ${MANY_SYMBOLS.length} backtests (expected at most 1)`);
  }
  pass(`lockstep on x${MANY_SYMBOLS.length}: max spread ${maxSpread / HOUR_MS} timeframe(s) over ${events.length} ticks`);
});

test("LOCKSTEP: a strategy without getSignal that opens from listenIdlePing + commitCreateSignal stays in lockstep", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const symbols = [SLOW_SYMBOL, FAST_SYMBOL];
  const tickDelayMs = { [SLOW_SYMBOL]: SLOW_TICK_MS };
  const schema = buildCase("ping", tickDelayMs, { withGetSignal: false });

  // One position per symbol, queued from the first idle ping; the slow symbol blocks inside the ping handler
  const committed = new Set();
  const unPing = listenIdlePing(async (event) => {
    if (event.strategyName !== schema.strategyName) return;
    const delay = tickDelayMs[event.symbol] ?? 0;
    if (delay > 0) {
      await sleep(delay);
    }
    if (committed.has(event.symbol)) return;
    committed.add(event.symbol);
    await Backtest.commitCreateSignal(event.symbol, schema, {
      position: "long",
      priceStopLoss: event.currentPrice * 0.85,
      priceTakeProfit: event.currentPrice * 1.19,
      cost: 1000,
      minuteEstimatedTime: PING_SIGNAL_MINUTES,
    });
  });
  const signals = [];
  const unSignal = listenSignalBacktest((event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (event.action === "opened" || event.action === "closed") {
      signals.push({ symbol: event.symbol, action: event.action, closeReason: event.action === "closed" ? event.closeReason : null });
    }
  });

  let result;
  try {
    result = await runCase(schema, symbols);
  } finally {
    unPing();
    unSignal();
  }
  const { events, maxSpread } = result;

  for (const symbol of symbols) {
    const opened = signals.filter((e) => e.symbol === symbol && e.action === "opened").length;
    const closed = signals.filter((e) => e.symbol === symbol && e.action === "closed");
    if (opened < 1 || closed.length < 1) {
      return fail(`${symbol}: expected a position opened from the idle ping and closed, got opened=${opened} closed=${closed.length}`);
    }
    if (closed[0].closeReason !== "time_expired") {
      return fail(`${symbol}: flat candles must close the position by time_expired, got ${closed[0].closeReason}`);
    }
  }
  const bound = PING_SIGNAL_MINUTES * MIN_MS + HOUR_MS;
  if (maxSpread > bound) {
    return fail(`clocks diverged by ${maxSpread / HOUR_MS} timeframes (expected at most lifetime + 1 = ${bound / HOUR_MS})`);
  }
  pass(`lockstep on, idle ping: max spread ${maxSpread / HOUR_MS} timeframe(s) over ${events.length} ticks, ${signals.length} signal events`);
});

// ── Budget driven from the pings ─────────────────────────────────────────────

const BUDGET_NAME = "fund";
const BUDGET_CAPITAL = 1_500;
const BUDGET_COST = 1_000;
const FAST_MINUTES = 30;
const SLOW_MINUTES = 90;
/** The slow symbol places its only (scheduled) signal on this timeframe */
const SLOW_SIGNAL_AT = FRAME_START + 1 * HOUR_MS;
/** The slow symbol's price dips below the scheduled priceOpen from this minute of the signal's hour until the hour ends */
const SLOW_DIP_MINUTE = 45;

const buildBudgetCase = (name) => {
  const exchangeName = `lockstep-budget-exchange-${name}`;
  const strategyName = `lockstep-budget-strategy-${name}`;
  const frameName = `lockstep-budget-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    // FAST: flat 100. SLOW: 100, dipping to 98 from minute 45 of the signal's hour so a long with priceOpen 99
    // is scheduled at the hour and activates mid-hour, between two positions of the fast symbol
    getCandles: async (symbol, interval, since, limit) => {
      if (interval !== "1m") throw new Error(`lockstep exchange: only 1m bars, got ${interval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) {
        const inDip = timestamp >= SLOW_SIGNAL_AT + SLOW_DIP_MINUTE * MIN_MS && timestamp < SLOW_SIGNAL_AT + HOUR_MS;
        const price = symbol === SLOW_SYMBOL && inDip ? 98 : 100;
        out.push({ timestamp, open: price, high: price + 0.5, low: price - 0.5, close: price, volume: 1_000 });
        timestamp += MIN_MS;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  addStrategySchema({
    strategyName,
    interval: "1h",
    getSignal: async (symbol, when) => {
      if (symbol === FAST_SYMBOL) {
        return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: BUDGET_COST, minuteEstimatedTime: FAST_MINUTES };
      }
      if (when.getTime() === SLOW_SIGNAL_AT) {
        return { position: "long", priceOpen: 99, priceStopLoss: 85, priceTakeProfit: 119, cost: BUDGET_COST, minuteEstimatedTime: SLOW_MINUTES };
      }
      return null;
    },
  });
  addFrameSchema({ frameName, interval: "1h", startDate: new Date(FRAME_START), endDate: new Date(FRAME_END) });
  return { exchangeName, strategyName, frameName };
};

/**
 * Wires the budget to the ping listeners for one run and returns the journal as of the frame end
 * together with the free-balance reads taken on schedule pings and the refused reserves.
 */
const runBudgetCase = async (schema, symbols) => {
  Budget.enable();
  const key = { ...schema, backtest: true, name: BUDGET_NAME, initialCapital: BUDGET_CAPITAL };
  const contextOf = (symbol, when) => ({ ...key, symbol, when });

  const scheduleReads = [];
  const rejects = [];
  const reserved = new Set();

  const unSchedule = listenSchedulePing(async (event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (event.symbol === SLOW_SYMBOL) {
      await sleep(2);
    }
    const free = await Budget._getFree(contextOf(event.symbol, event.when));
    scheduleReads.push({ symbol: event.symbol, when: event.when.getTime(), free });
  });
  const unActive = listenActivePing(async (event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (event.symbol === SLOW_SYMBOL) {
      await sleep(2);
    }
    if (reserved.has(event.data.id)) return;
    reserved.add(event.data.id);
    try {
      await Budget._reserve({ id: event.data.id, amount: BUDGET_COST, note: event.symbol }, contextOf(event.symbol, event.when));
    } catch (error) {
      if (!BudgetRejectedError.isBudgetRejectedError(error)) throw error;
      rejects.push({ symbol: event.symbol, when: event.when.getTime() });
    }
  });
  const unClosed = listenSignalBacktest(async (event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (event.action !== "closed") return;
    await Budget._release({ id: event.signal.id, pnl: event.pnl.pnlCost }, contextOf(event.symbol, new Date(event.closeTimestamp)));
  });

  let result;
  try {
    result = await runCase(schema, symbols);
  } finally {
    unSchedule();
    unActive();
    unClosed();
  }
  const history = await Budget._getHistory({ ...key, when: new Date(FRAME_END) });
  return { ...result, scheduleReads, rejects, history };
};

const describeRows = (rows) => rows.map((r) => `${r.type}:${r.symbol}@${new Date(r.timestamp).toISOString().slice(11, 16)}${r.overdraft !== undefined ? `(overdraft ${r.overdraft})` : ""}`).join(", ");

test("LOCKSTEP + BUDGET: with lockstep the budget driven from schedule/active pings refuses the colliding reserve instead of overdrafting", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const symbols = [SLOW_SYMBOL, FAST_SYMBOL];
  const schema = buildBudgetCase("on");
  const { maxSpread, scheduleReads, rejects, history } = await runBudgetCase(schema, symbols);

  if (!scheduleReads.length) return fail("expected the slow symbol's scheduled signal to ping the budget before activating");
  const negativeRead = scheduleReads.find((r) => r.free < 0);
  if (negativeRead) return fail(`a schedule ping read a negative free balance: ${JSON.stringify(negativeRead)}`);

  const slowReserve = history.find((r) => r.type === "reserve" && r.symbol === SLOW_SYMBOL);
  if (!slowReserve) return fail(`the slow symbol never reserved from its active ping: ${describeRows(history)}`);
  if (slowReserve.timestamp <= SLOW_SIGNAL_AT || slowReserve.timestamp >= SLOW_SIGNAL_AT + HOUR_MS) {
    return fail(`the slow reserve must sit mid-hour after activation, got ${new Date(slowReserve.timestamp).toISOString()}`);
  }

  const overdrafts = history.filter((r) => r.type === "reserve" && r.overdraft !== undefined);
  if (overdrafts.length) return fail(`lockstep on: expected no overdraft, got ${describeRows(overdrafts)}`);
  const negativeRow = history.find((r) => r.balance.free < 0);
  if (negativeRow) return fail(`lockstep on: free balance went negative at ${describeRows([negativeRow])}`);
  if (!rejects.length || rejects.some((r) => r.symbol !== FAST_SYMBOL)) {
    return fail(`lockstep on: expected the fast symbol's colliding reserve to be refused, got ${JSON.stringify(rejects)}`);
  }
  const rejectRows = history.filter((r) => r.type === "reject");
  if (rejectRows.length !== rejects.length) return fail(`every refused reserve must leave a reject row: rows=${rejectRows.length} thrown=${rejects.length}`);

  pass(`lockstep on + budget: ${rejects.length} refused, 0 overdraft, spread ${maxSpread / HOUR_MS} tf, journal: ${describeRows(history)}`);
});

test("LOCKSTEP + BUDGET: without lockstep the slow symbol's reserve lands before the fast symbol's and leaves an overdraft row", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: false }, true);
  const symbols = [SLOW_SYMBOL, FAST_SYMBOL];
  const schema = buildBudgetCase("off");
  const { maxSpread, history } = await runBudgetCase(schema, symbols);

  const overdrafts = history.filter((r) => r.type === "reserve" && r.overdraft !== undefined);
  if (!overdrafts.length) return fail(`lockstep off: expected an overdraft on a fast reserve, journal: ${describeRows(history)}`);
  if (overdrafts.some((r) => r.symbol !== FAST_SYMBOL)) return fail(`the overdraft must be on the fast symbol's rows, got ${describeRows(overdrafts)}`);

  pass(`lockstep off + budget: ${overdrafts.length} overdraft row(s), spread ${maxSpread / HOUR_MS} tf, journal: ${describeRows(history)}`);
});

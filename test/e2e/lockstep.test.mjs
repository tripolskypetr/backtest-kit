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
  listenSignal,
  listenSignalEvent,
  listenOrderSchedule,
  listenStrategyCommit,
  listenHighestProfit,
  listenMaxDrawdown,
  listenPause,
  listenSync,
  listenCheck,
  listenOrderFill,
  listenOrderReject,
  listenOrderContinue,
  listenOrderStop,
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
 *   order    - the budget journal is the same whatever order the symbols were launched in
 *   break    - a consumer breaking out of Backtest.run while its iteration holds the lock
 *              releases it (finally): the peer backtest still finishes
 *   fatal    - a backtest dying on a fatal tick error releases the lock the same way
 *   order    - every progress / idle / schedule / active ping of both symbols is appended to one array
 *              in arrival order while every handler holds on a long sleep (a real timer, so the event loop
 *              is free to run the other symbol); under lockstep the symbols only ever switch at a lock
 *              boundary: a new iteration (progress) or the timeframe boundary inside a replay where the
 *              orchestrator hands the lock off (last candle before the boundary / first candle on it)
 *   jump     - BACKTEST_FN replays a whole ARRAY of candles inside one locked iteration, so without the
 *              ping hand-off the symbol's clock would jump by the position lifetime and a budget write from
 *              the middle of the replay (a DCA top-up on hour 3) would be checked against a journal the
 *              lagging peer has not written to yet. With the hand-off the peer's reserve on hour 2 is in
 *              the journal first and the top-up is REFUSED instead of ending in overdraft
 *   errors   - the hand-off must never hang: ping listeners that throw, a peer dying in getSignal while
 *              the replaying symbol is parked in spinLock, a candle fetch failing in the middle of a
 *              chunked replay, eight symbols with throwing listeners and a dying peer. Every survivor
 *              reports done within a timeout and a probe backtest launched afterwards finishes too,
 *              which it cannot do if the lock was left held
 *   listeners- every listen* that StrategyConnectionService feeds through a subject gets a listener
 *              that throws on every other event. The backtest scenario fires the pings, the signal /
 *              schedule / commit events, highest profit and max drawdown; pause, sync / check and the
 *              order fill / reject / continue / stop channels are live-only (CREATE_SYNC_FN returns
 *              "confirmed" without emitting when event.backtest is true) and stay subscribed but silent
 *   budget   - the same backtest channels drive the Budget with NO try/catch in the handlers: a reserve
 *   callbacks  on the first active ping, the same id reserved AGAIN on the second one (an Error thrown
 *              out of the queued dispatch), a withdraw above the held amount from listenMaxDrawdown
 *              (a BudgetRejectedError thrown out of the handler), deposits from listenHighestProfit and
 *              listenOrderSchedule, reads from the rest. Nothing hangs, the journal stays consistent and
 *              the budget's write queue is still alive afterwards
 */
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

const FRAME_START = Date.parse("2024-01-01T00:00:00Z");
const FRAME_HOURS = 12;
const FRAME_END = FRAME_START + FRAME_HOURS * HOUR_MS;
/** A position opened on the last timeframe closes one candle past the frame end: the journal is read after that */
const JOURNAL_END = FRAME_END + HOUR_MS;

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
  const history = await Budget._getHistory({ ...key, when: new Date(JOURNAL_END) });
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

// ── Lock hygiene ─────────────────────────────────────────────────────────────

/** Resolves true when the symbol's backtest reports done within the timeout, false otherwise */
const waitForDone = async (schema, symbol, timeoutMs) => {
  const doneSubject = new Subject();
  const unDone = listenDoneBacktest((event) => {
    if (event.frameName !== schema.frameName) return;
    if (event.symbol !== symbol) return;
    doneSubject.next();
  });
  try {
    return await Promise.race([
      doneSubject.toPromise().then(() => true),
      sleep(timeoutMs).then(() => false),
    ]);
  } finally {
    unDone();
  }
};

const PEER_SYMBOL = "PEERUSDT";
const PEER_TIMEOUT_MS = 10_000;

/** Rows of a journal without the run-specific signal ids: what two runs of the same scenario must share */
const journalShape = (rows) => rows.map((r) => [
  r.type,
  r.symbol,
  r.timestamp,
  "amount" in r ? r.amount : null,
  "requested" in r ? r.requested : null,
  r.balance.capital,
  r.balance.deployed,
  r.balance.free,
  r.overdraft ?? null,
].join("|"));

test("LOCKSTEP + BUDGET: the journal is the same whatever order the symbols were launched in", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const first = await runBudgetCase(buildBudgetCase("order-a"), [SLOW_SYMBOL, FAST_SYMBOL]);
  const second = await runBudgetCase(buildBudgetCase("order-b"), [FAST_SYMBOL, SLOW_SYMBOL]);
  const a = journalShape(first.history);
  const b = journalShape(second.history);
  if (a.length !== b.length) {
    return fail(`journals differ in length: ${a.length} vs ${b.length}\n${describeRows(first.history)}\n${describeRows(second.history)}`);
  }
  const mismatch = a.findIndex((row, i) => row !== b[i]);
  if (mismatch !== -1) {
    return fail(`journals differ at row ${mismatch}: ${a[mismatch]} vs ${b[mismatch]}`);
  }
  pass(`same journal of ${a.length} rows from both launch orders`);
});

test("LOCKSTEP: a consumer breaking out of Backtest.run releases the lock, the peer backtest still finishes", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const schema = buildBudgetCase("break");
  const peerDone = waitForDone(schema, PEER_SYMBOL, PEER_TIMEOUT_MS);

  // PEER ticks without signals; FAST opens on every tick and its consumer leaves on the first opened event,
  // i.e. in the middle of the locked iteration (the yield happens with the lock held)
  Backtest.background(PEER_SYMBOL, schema);
  let left = null;
  for await (const result of Backtest.run(FAST_SYMBOL, schema)) {
    if (result.action === "opened") {
      left = result;
      break;
    }
  }
  if (!left) return fail("expected the fast backtest to yield an opened signal to break on");

  if (!(await peerDone)) {
    return fail(`the peer backtest did not finish within ${PEER_TIMEOUT_MS} ms after the consumer broke out: the lock was not released`);
  }
  pass("peer finished after the consumer broke out of Backtest.run mid-iteration");
});

test("LOCKSTEP: a backtest dying on a fatal tick error releases the lock, the peer backtest still finishes", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const DEAD_SYMBOL = "DEADUSDT";
  const exchangeName = "lockstep-fatal-exchange";
  const strategyName = "lockstep-fatal-strategy";
  const frameName = "lockstep-fatal-frame";
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
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
  let deadTicks = 0;
  addStrategySchema({
    strategyName,
    interval: "1h",
    // the dead symbol throws inside its third tick, while it holds the lockstep lock
    getSignal: async (symbol) => {
      if (symbol === DEAD_SYMBOL && ++deadTicks === 3) {
        throw new Error("lockstep fatal: strategy exploded");
      }
      return null;
    },
  });
  addFrameSchema({ frameName, interval: "1h", startDate: new Date(FRAME_START), endDate: new Date(FRAME_END) });
  const schema = { exchangeName, strategyName, frameName };

  // a fatal tick error ends in process.exit(-1); the stub turns it into a throw so the worker survives
  const realExit = process.exit;
  const realError = console.error;
  process.exit = (code) => { throw new Error(`process.exit(${code})`); };
  console.error = () => void 0;
  try {
    const peerDone = waitForDone(schema, PEER_SYMBOL, PEER_TIMEOUT_MS);
    Backtest.background(DEAD_SYMBOL, schema);
    Backtest.background(PEER_SYMBOL, schema);
    if (!(await peerDone)) {
      return fail(`the peer backtest did not finish within ${PEER_TIMEOUT_MS} ms after its peer died: the lock was not released`);
    }
  } finally {
    process.exit = realExit;
    console.error = realError;
  }
  if (deadTicks < 3) return fail(`the dead symbol never reached its fatal tick, ticks=${deadTicks}`);
  pass("peer finished after its peer died on a fatal tick error");
});

// ── Ping order without timers ────────────────────────────────────────────────

const PING_A = "PINGAUSDT";
const PING_B = "PINGBUSDT";
/** Both symbols place a scheduled long on this timeframe; the dip activates it mid-hour, then it lives 60 minutes */
const PING_SIGNAL_AT = FRAME_START + 1 * HOUR_MS;

const buildPingOrderCase = (name) => {
  const exchangeName = `lockstep-order-exchange-${name}`;
  const strategyName = `lockstep-order-strategy-${name}`;
  const frameName = `lockstep-order-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") throw new Error(`lockstep exchange: only 1m bars, got ${interval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) {
        const inDip = timestamp >= PING_SIGNAL_AT + SLOW_DIP_MINUTE * MIN_MS && timestamp < PING_SIGNAL_AT + HOUR_MS;
        const price = inDip ? 98 : 100;
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
    // idle ticks everywhere except the signal hour: scheduled pings until the dip, then active pings for an hour
    getSignal: async (_symbol, when) => {
      if (when.getTime() === PING_SIGNAL_AT) {
        return { position: "long", priceOpen: 99, priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: 60 };
      }
      return null;
    },
  });
  addFrameSchema({ frameName, interval: "1h", startDate: new Date(FRAME_START), endDate: new Date(FRAME_END) });
  return { exchangeName, strategyName, frameName };
};

/**
 * Every ping handler parks on a real timer this long before it records the ping: a microtask
 * could be flushed implicitly by the emitter's own queue, a timer cannot, so the other symbol
 * gets a full turn of the event loop to sneak its pings in if nothing holds it back.
 */
const PING_HANDLER_SLEEP_MS = 20;

/**
 * Runs both symbols and returns every progress marker and ping in arrival order,
 * plus the blocks between consecutive progress markers that mix symbols.
 */
const runPingOrderCase = async (schema) => {
  const symbols = [PING_A, PING_B];
  const order = [];
  const push = (kind) => async (event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (kind === "progress" && event.progress >= 1) return;
    await sleep(PING_HANDLER_SLEEP_MS);
    order.push({ symbol: event.symbol, kind, when: event.when.getTime() });
  };
  const unsubscribe = [
    listenBacktestProgress(push("progress")),
    listenIdlePing(push("idle")),
    listenSchedulePing(push("schedule")),
    listenActivePing(push("active")),
  ];
  try {
    await runCase(schema, symbols);
  } finally {
    unsubscribe.forEach((un) => un());
  }

  // A switch from one symbol's entry to another's is legal only at a lock boundary: the next entry
  // starts an iteration (progress), or the previous entry is the last candle before a timeframe
  // boundary (the replay handed the lock off there), or the next entry is the first candle on a
  // boundary (the replay resumed there). Anything else is an await that let the peer in.
  const describe = (e) => `${e.kind}:${e.symbol}@${new Date(e.when).toISOString().slice(11, 16)}`;
  const illegalSwitches = [];
  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1];
    const next = order[i];
    if (prev.symbol === next.symbol) continue;
    const legal =
      next.kind === "progress" ||
      (prev.when + MIN_MS) % HOUR_MS === 0 ||
      next.when % HOUR_MS === 0;
    if (!legal) illegalSwitches.push(`${describe(prev)} -> ${describe(next)}`);
  }

  const kinds = Object.fromEntries(symbols.map((symbol) => [symbol, Object.fromEntries(["idle", "schedule", "active"].map((kind) => [kind, order.filter((e) => e.symbol === symbol && e.kind === kind).length]))]));
  return { order, illegalSwitches, kinds };
};

/** Fails unless every symbol produced idle, schedule and active pings; returns true on failure */
const failedPingKinds = (kinds, fail) => {
  for (const [symbol, counts] of Object.entries(kinds)) {
    const missing = Object.entries(counts).filter(([, count]) => count === 0).map(([kind]) => kind);
    if (missing.length) {
      fail(`${symbol} produced no ${missing.join(" / ")} pings: ${JSON.stringify(counts)}`);
      return true;
    }
  }
  return false;
};

test("LOCKSTEP: a ping handler parked on a long sleep never lets another symbol's pings in except at a lock boundary (iteration start or timeframe hand-off)", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const { order, illegalSwitches, kinds } = await runPingOrderCase(buildPingOrderCase("on"));
  if (failedPingKinds(kinds, fail)) return;
  if (illegalSwitches.length) {
    return fail(`${illegalSwitches.length} switch(es) between symbols away from a lock boundary; first: ${illegalSwitches.slice(0, 4).join("; ")}`);
  }
  pass(`${order.length} entries, symbols switch only at lock boundaries: ${JSON.stringify(kinds)}`);
});

test("LOCKSTEP: without lockstep the pings of the two symbols interleave inside an iteration (the harness detects it)", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: false }, true);
  const { order, illegalSwitches, kinds } = await runPingOrderCase(buildPingOrderCase("off"));
  if (failedPingKinds(kinds, fail)) return;
  if (!illegalSwitches.length) {
    return fail(`expected interleaved pings with lockstep off, every one of the ${order.length} entries switched at a lock boundary`);
  }
  pass(`lockstep off: ${illegalSwitches.length} switch(es) away from a lock boundary over ${order.length} entries`);
});

// ── Array replay inside one locked iteration ─────────────────────────────────

const JUMP_SYMBOL = "JUMPUSDT";
const LAG_SYMBOL = "LAGUSDT";
const JUMP_CAPITAL = 2_500;
const JUMP_COST = 1_000;
/** The jumping symbol opens on hour 0 and holds for 5 hours: one BACKTEST_FN call replays 300 candles under the lock */
const JUMP_MINUTES = 300;
/** Mid-replay the jumping symbol tops the position up (a DCA entry) once its clock passes this hour */
const JUMP_DCA_AT = FRAME_START + 3 * HOUR_MS;
/** The lagging symbol opens on hour 2 for 90 minutes: still open on hour 3, inserted before the top-up */
const LAG_SIGNAL_AT = FRAME_START + 2 * HOUR_MS;
const LAG_MINUTES = 90;

const buildJumpCase = (name) => {
  const exchangeName = `lockstep-jump-exchange-${name}`;
  const strategyName = `lockstep-jump-strategy-${name}`;
  const frameName = `lockstep-jump-frame-${name}`;
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
    getSignal: async (symbol, when) => {
      if (symbol === JUMP_SYMBOL && when.getTime() === FRAME_START) {
        return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: JUMP_COST, minuteEstimatedTime: JUMP_MINUTES };
      }
      if (symbol === LAG_SYMBOL && when.getTime() === LAG_SIGNAL_AT) {
        return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: JUMP_COST, minuteEstimatedTime: LAG_MINUTES };
      }
      return null;
    },
  });
  addFrameSchema({ frameName, interval: "1h", startDate: new Date(FRAME_START), endDate: new Date(FRAME_END) });
  return { exchangeName, strategyName, frameName };
};

/** Reserves on the first active ping of every signal, tops the jumping position up mid-replay, releases on close */
const runJumpCase = async (schema) => {
  Budget.enable();
  const key = { ...schema, backtest: true, name: BUDGET_NAME, initialCapital: JUMP_CAPITAL };
  const contextOf = (symbol, when) => ({ ...key, symbol, when });

  const reserved = new Set();
  const toppedUp = new Set();
  const rejects = [];
  const reserve = async (id, note, event) => {
    try {
      await Budget._reserve({ id, amount: JUMP_COST, note }, contextOf(event.symbol, event.when));
    } catch (error) {
      if (!BudgetRejectedError.isBudgetRejectedError(error)) throw error;
      rejects.push({ symbol: event.symbol, id, when: event.when.getTime() });
    }
  };
  const unActive = listenActivePing(async (event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (!reserved.has(event.data.id)) {
      reserved.add(event.data.id);
      await reserve(event.data.id, "entry", event);
      return;
    }
    if (event.symbol === JUMP_SYMBOL && event.when.getTime() >= JUMP_DCA_AT && !toppedUp.has(event.data.id)) {
      toppedUp.add(event.data.id);
      await reserve(`${event.data.id}-dca`, "dca", event);
    }
  });
  const unClosed = listenSignalBacktest(async (event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (event.action !== "closed") return;
    const context = contextOf(event.symbol, new Date(event.closeTimestamp));
    await Budget._release({ id: event.signal.id, pnl: event.pnl.pnlCost }, context);
    if (toppedUp.has(event.signal.id)) {
      await Budget._release({ id: `${event.signal.id}-dca`, pnl: 0 }, context);
    }
  });

  let result;
  try {
    result = await runCase(schema, [JUMP_SYMBOL, LAG_SYMBOL]);
  } finally {
    unActive();
    unClosed();
  }
  const history = await Budget._getHistory({ ...key, when: new Date(JOURNAL_END) });
  return { ...result, rejects, history };
};

test("LOCKSTEP + BUDGET: a mid-replay budget write sees what the lagging peer wrote before it (the top-up is refused, no overdraft)", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const { history, rejects } = await runJumpCase(buildJumpCase("on"));

  const lag = history.find((r) => r.type === "reserve" && r.symbol === LAG_SYMBOL);
  if (!lag) return fail(`expected the lagging reserve in the journal: ${describeRows(history)}`);
  const topUpReject = rejects.find((r) => r.symbol === JUMP_SYMBOL && r.id.endsWith("-dca"));
  if (!topUpReject) return fail(`the DCA top-up on hour 3 must be refused once the lagging reserve of hour 2 is in the journal; rejects=${JSON.stringify(rejects)}; journal: ${describeRows(history)}`);
  if (!(lag.timestamp < topUpReject.when)) return fail(`the lagging reserve must precede the top-up in logical time: ${new Date(lag.timestamp).toISOString()} vs ${new Date(topUpReject.when).toISOString()}`);
  const rejectRow = history.find((r) => r.type === "reject" && r.symbol === JUMP_SYMBOL && r.timestamp === topUpReject.when);
  if (!rejectRow) return fail(`the refused top-up must leave a reject row at ${new Date(topUpReject.when).toISOString()}: ${describeRows(history)}`);

  const overdrafts = history.filter((r) => r.type === "reserve" && r.overdraft !== undefined);
  const negativeRow = history.find((r) => r.balance.free < 0);
  if (overdrafts.length || negativeRow) {
    return fail(`the replayed symbol wrote from the future: ${describeRows(overdrafts)}; journal: ${describeRows(history)}`);
  }
  pass(`lockstep on: the top-up on hour 3 was refused against the lagging reserve of hour 2, journal: ${describeRows(history)}`);
});

// ── Hand-off under errors ────────────────────────────────────────────────────

const ERROR_TIMEOUT_MS = 15_000;
const PROBE_SYMBOL = "PROBEUSDT";

/**
 * Exchange + strategy for the error cases: every symbol in `positions` opens a market
 * long at `at` for `minutes` (Infinity = chunked replay), `fatalTick` makes getSignal
 * throw on that tick number, `failFetch(symbol, since)` makes getCandles throw.
 */
const buildErrorCase = (name, { positions = {}, fatalTick = {}, failFetch = () => false } = {}) => {
  const exchangeName = `lockstep-error-exchange-${name}`;
  const strategyName = `lockstep-error-strategy-${name}`;
  const frameName = `lockstep-error-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (symbol, interval, since, limit) => {
      if (interval !== "1m") throw new Error(`lockstep exchange: only 1m bars, got ${interval}`);
      if (failFetch(symbol, since.getTime())) {
        throw new Error(`lockstep exchange: fetch failed on purpose for ${symbol} at ${since.toISOString()}`);
      }
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
  const ticks = {};
  addStrategySchema({
    strategyName,
    interval: "1h",
    getSignal: async (symbol, when) => {
      ticks[symbol] = (ticks[symbol] ?? 0) + 1;
      if (fatalTick[symbol] !== undefined && ticks[symbol] === fatalTick[symbol]) {
        throw new Error(`lockstep fatal: ${symbol} exploded on tick ${ticks[symbol]}`);
      }
      const position = positions[symbol];
      if (position && when.getTime() === position.at) {
        return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: position.minutes };
      }
      return null;
    },
  });
  addFrameSchema({ frameName, interval: "1h", startDate: new Date(FRAME_START), endDate: new Date(FRAME_END) });
  return { exchangeName, strategyName, frameName, ticks };
};

/**
 * Launches every symbol in the background and resolves with the symbols that reported done
 * before the timeout; `waitFor` names the ones expected to finish (a dying peer is launched but not awaited)
 */
const runUntilDone = async (schema, symbols, timeoutMs, waitFor = symbols) => {
  const done = new Set();
  const allDone = new Subject();
  const unDone = listenDoneBacktest((event) => {
    if (event.frameName !== schema.frameName) return;
    done.add(event.symbol);
    if (waitFor.every((symbol) => done.has(symbol))) allDone.next();
  });
  try {
    for (const symbol of symbols) {
      Backtest.background(symbol, schema);
    }
    await Promise.race([allDone.toPromise(), sleep(timeoutMs)]);
  } finally {
    unDone();
  }
  return done;
};

/** A fatal tick error ends in process.exit(-1): the stub turns it into a throw so the worker survives; console noise is muted */
const withFatalStub = async (fn) => {
  const realExit = process.exit;
  const realError = console.error;
  const realWarn = console.warn;
  process.exit = (code) => { throw new Error(`process.exit(${code})`); };
  console.error = () => void 0;
  console.warn = () => void 0;
  try {
    return await fn();
  } finally {
    process.exit = realExit;
    console.error = realError;
    console.warn = realWarn;
  }
};

/** Fails unless the survivors are done and a probe backtest launched afterwards finishes (the lock is free); returns true on failure */
const failedSurvivorsOrLock = async (schema, done, survivors, fail) => {
  const missing = survivors.filter((symbol) => !done.has(symbol));
  if (missing.length) {
    fail(`${missing.join(", ")} did not finish within ${ERROR_TIMEOUT_MS} ms: the hand-off hung`);
    return true;
  }
  const probe = await runUntilDone(schema, [PROBE_SYMBOL], ERROR_TIMEOUT_MS);
  if (!probe.has(PROBE_SYMBOL)) {
    fail(`the probe backtest did not finish within ${ERROR_TIMEOUT_MS} ms after the scenario: the lock was left held`);
    return true;
  }
  return false;
};

test("LOCKSTEP ERRORS: active ping listeners that throw on the hand-off candle do not hang the replay or its peer", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const schema = buildErrorCase("active-throw", { positions: { [JUMP_SYMBOL]: { at: FRAME_START, minutes: 300 } } });
  let thrown = 0;
  const unActive = listenActivePing((event) => {
    if (event.strategyName !== schema.strategyName) return;
    // the last candle before every hour: exactly where the orchestrator hands the lock off
    if ((event.timestamp + MIN_MS) % HOUR_MS === 0) {
      thrown += 1;
      throw new Error("lockstep error: active ping listener exploded");
    }
  });
  let done;
  try {
    done = await withFatalStub(() => runUntilDone(schema, [JUMP_SYMBOL, LAG_SYMBOL], ERROR_TIMEOUT_MS));
  } finally {
    unActive();
  }
  if (!thrown) return fail("the listener never threw: the scenario did not exercise the hand-off candle");
  if (await failedSurvivorsOrLock(schema, done, [JUMP_SYMBOL, LAG_SYMBOL], fail)) return;
  pass(`active ping listener threw ${thrown} time(s) on hand-off candles, both backtests and the probe finished`);
});

test("LOCKSTEP ERRORS: schedule ping listeners that throw do not hang the scheduled replay or its peer", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const schema = buildPingOrderCase("schedule-throw");
  let thrown = 0;
  const unSchedule = listenSchedulePing((event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (thrown < 50 && Math.floor(event.timestamp / MIN_MS) % 3 === 0) {
      thrown += 1;
      throw new Error("lockstep error: schedule ping listener exploded");
    }
  });
  let done;
  try {
    done = await withFatalStub(() => runUntilDone(schema, [PING_A, PING_B], ERROR_TIMEOUT_MS));
  } finally {
    unSchedule();
  }
  if (!thrown) return fail("the listener never threw");
  if (await failedSurvivorsOrLock(schema, done, [PING_A, PING_B], fail)) return;
  pass(`schedule ping listener threw ${thrown} time(s), both backtests and the probe finished`);
});

test("LOCKSTEP ERRORS: a peer dying in getSignal while the replaying symbol is parked in spinLock does not hang it", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const schema = buildErrorCase("peer-fatal", {
    positions: { [JUMP_SYMBOL]: { at: FRAME_START, minutes: 300 } },
    fatalTick: { [LAG_SYMBOL]: 2 },
  });
  const done = await withFatalStub(() => runUntilDone(schema, [JUMP_SYMBOL, LAG_SYMBOL], ERROR_TIMEOUT_MS, [JUMP_SYMBOL]));
  if ((schema.ticks[LAG_SYMBOL] ?? 0) < 2) return fail(`the peer never reached its fatal tick, ticks=${schema.ticks[LAG_SYMBOL]}`);
  if (await failedSurvivorsOrLock(schema, done, [JUMP_SYMBOL], fail)) return;
  pass("the replaying symbol took the lock back from a dead peer and finished, the probe finished");
});

test("LOCKSTEP ERRORS: a candle fetch failing in the middle of a chunked replay releases the lock for the peer", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true, CC_MAX_CANDLES_PER_REQUEST: 60 }, true);
  try {
    let failedFetches = 0;
    const schema = buildErrorCase("fetch-fatal", {
      positions: { [JUMP_SYMBOL]: { at: FRAME_START, minutes: Infinity } },
      // the third 60-candle chunk of the replay: fetched after two hand-offs already happened
      failFetch: (symbol, since) => {
        if (symbol !== JUMP_SYMBOL || since < FRAME_START + 2 * HOUR_MS) return false;
        failedFetches += 1;
        return true;
      },
    });
    const done = await withFatalStub(() => runUntilDone(schema, [JUMP_SYMBOL, LAG_SYMBOL], ERROR_TIMEOUT_MS, [LAG_SYMBOL]));
    if (!failedFetches) return fail("the replaying symbol never hit the failing chunk fetch");
    if (await failedSurvivorsOrLock(schema, done, [LAG_SYMBOL], fail)) return;
    pass("the peer finished after the replaying symbol died on a chunk fetch, the probe finished");
  } finally {
    setConfig({ CC_MAX_CANDLES_PER_REQUEST: 1000 }, true);
  }
});

test("LOCKSTEP ERRORS: eight backtests with throwing listeners and a dying peer all finish and leave the lock free", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const symbols = Array.from({ length: 8 }, (_, i) => `ERR${i}USDT`);
  const positions = Object.fromEntries(symbols.filter((_, i) => i % 2 === 0).map((symbol, i) => [symbol, { at: FRAME_START + (i % 2) * HOUR_MS, minutes: 180 }]));
  const dead = symbols[3];
  const schema = buildErrorCase("stress", { positions, fatalTick: { [dead]: 3 } });
  let thrown = 0;
  const unActive = listenActivePing((event) => {
    if (event.strategyName !== schema.strategyName) return;
    if (Math.floor(event.timestamp / MIN_MS) % 7 === 0) {
      thrown += 1;
      throw new Error("lockstep error: stress listener exploded");
    }
  });
  const survivors = symbols.filter((symbol) => symbol !== dead);
  let done;
  try {
    done = await withFatalStub(() => runUntilDone(schema, symbols, ERROR_TIMEOUT_MS, survivors));
  } finally {
    unActive();
  }
  if (!thrown) return fail("the listener never threw");
  if ((schema.ticks[dead] ?? 0) < 3) return fail(`the dying peer never reached its fatal tick, ticks=${schema.ticks[dead]}`);
  if (await failedSurvivorsOrLock(schema, done, survivors, fail)) return;
  pass(`${survivors.length} survivors finished with ${thrown} listener throws and one dead peer, the probe finished`);
});

// ── Every listener fed by StrategyConnectionService throws ───────────────────

/** Every subject StrategyConnectionService emits on (errorEmitter aside: a listenError that throws would feed itself) */
const CONNECTION_LISTENERS = {
  listenIdlePing,
  listenSchedulePing,
  listenActivePing,
  listenSignal,
  listenSignalBacktest,
  listenSignalEvent,
  listenOrderSchedule,
  listenStrategyCommit,
  listenHighestProfit,
  listenMaxDrawdown,
  listenPause,
  listenSync,
  listenCheck,
  listenOrderFill,
  listenOrderReject,
  listenOrderContinue,
  listenOrderStop,
};

/** Channels a backtest feeds; pause, sync / check and the order channels are live-only and must stay silent */
const MUST_FIRE = [
  "listenIdlePing", "listenSchedulePing", "listenActivePing", "listenSignal", "listenSignalBacktest",
  "listenSignalEvent", "listenOrderSchedule", "listenStrategyCommit", "listenHighestProfit", "listenMaxDrawdown",
];
const LIVE_ONLY = Object.keys(CONNECTION_LISTENERS).filter((name) => !MUST_FIRE.includes(name));

const LISTENER_SIGNAL_AT = FRAME_START + 1 * HOUR_MS;

/**
 * FAST: a market long on every tick (30 minutes). SLOW: one scheduled long on hour 1 that
 * activates on the dip, then rides a bump (highest profit) and a slump (max drawdown).
 */
const buildListenerCase = (name) => {
  const exchangeName = `lockstep-listener-exchange-${name}`;
  const strategyName = `lockstep-listener-strategy-${name}`;
  const frameName = `lockstep-listener-frame-${name}`;
  const slowPriceAt = (timestamp) => {
    const minute = (timestamp - LISTENER_SIGNAL_AT) / MIN_MS;
    if (minute >= 45 && minute < 60) return 98;   // dip: the scheduled long at 99 activates
    if (minute >= 60 && minute < 75) return 103;  // bump: highest profit
    if (minute >= 75 && minute < 90) return 97;   // slump: max drawdown
    return 100;
  };
  addExchangeSchema({
    exchangeName,
    getCandles: async (symbol, interval, since, limit) => {
      if (interval !== "1m") throw new Error(`lockstep exchange: only 1m bars, got ${interval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN_MS) * MIN_MS;
      while (out.length < limit) {
        const price = symbol === SLOW_SYMBOL ? slowPriceAt(timestamp) : 100;
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
        return { position: "long", priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: 30 };
      }
      if (when.getTime() === LISTENER_SIGNAL_AT) {
        return { position: "long", priceOpen: 99, priceStopLoss: 85, priceTakeProfit: 119, cost: 1000, minuteEstimatedTime: 90 };
      }
      return null;
    },
  });
  addFrameSchema({ frameName, interval: "1h", startDate: new Date(FRAME_START), endDate: new Date(FRAME_END) });
  return { exchangeName, strategyName, frameName };
};

test("LOCKSTEP ERRORS: every listener fed by StrategyConnectionService throws on every other event and nothing hangs", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const schema = buildListenerCase("all");
  const symbols = [SLOW_SYMBOL, FAST_SYMBOL];

  const own = (event) => event.strategyName === schema.strategyName || symbols.includes(event.symbol);
  const hits = Object.fromEntries(Object.keys(CONNECTION_LISTENERS).map((name) => [name, 0]));
  const throws = Object.fromEntries(Object.keys(CONNECTION_LISTENERS).map((name) => [name, 0]));
  const dividends = new Set();
  const unsubscribe = Object.entries(CONNECTION_LISTENERS).map(([name, listen]) => listen(async (event) => {
    if (!own(event)) return;
    hits[name] += 1;
    // the commit channel carries user commits only: a dividend on the first active ping of every position
    if (name === "listenActivePing" && !dividends.has(event.data.id)) {
      dividends.add(event.data.id);
      await Backtest.commitDividend(event.symbol, event.currentPrice, schema, { amount: 1, note: "lockstep listeners" });
    }
    if (hits[name] % 2 === 1) {
      throws[name] += 1;
      throw new Error(`lockstep listeners: ${name} exploded`);
    }
  }));

  let done;
  try {
    done = await withFatalStub(() => runUntilDone(schema, symbols, ERROR_TIMEOUT_MS));
  } finally {
    unsubscribe.forEach((un) => un());
  }

  const silent = MUST_FIRE.filter((name) => hits[name] === 0);
  if (silent.length) {
    return fail(`channels the scenario was built to fire stayed silent: ${silent.join(", ")}; hits=${JSON.stringify(hits)}`);
  }
  const leaked = LIVE_ONLY.filter((name) => hits[name] > 0);
  if (leaked.length) {
    return fail(`live-only channels fired in a backtest: ${leaked.join(", ")}`);
  }
  const neverThrew = Object.keys(CONNECTION_LISTENERS).filter((name) => hits[name] > 0 && throws[name] === 0);
  if (neverThrew.length) {
    return fail(`listeners fired but never threw: ${neverThrew.join(", ")}`);
  }
  if (await failedSurvivorsOrLock(schema, done, symbols, fail)) return;
  const summary = Object.entries(hits).map(([name, count]) => `${name.replace("listen", "")}=${count}/${throws[name]}`).join(" ");
  pass(`both backtests and the probe finished; hits/throws: ${summary}`);
});

// ── Budget driven from every callback, errors thrown out of the handlers ─────

const CALLBACK_BUDGET_CAPITAL = 2_500;
const CALLBACK_BUDGET_COST = 1_000;

test("LOCKSTEP ERRORS: budget writes and their errors thrown out of every backtest callback neither hang nor corrupt the journal", async ({ pass, fail }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  Budget.enable();
  const schema = buildListenerCase("budget");
  const symbols = [SLOW_SYMBOL, FAST_SYMBOL];
  const key = { ...schema, backtest: true, name: BUDGET_NAME, initialCapital: CALLBACK_BUDGET_CAPITAL };
  const contextOf = (symbol, when) => ({ ...key, symbol, when });
  const whenOf = (event) => event.when ?? new Date(event.timestamp ?? event.closeTimestamp ?? event.createdAt);
  const own = (event) => event.strategyName === schema.strategyName || symbols.includes(event.symbol);

  const hits = {};
  const count = (name) => { hits[name] = (hits[name] ?? 0) + 1; };
  const activePings = new Map();
  let reReserveAttempts = 0;
  let overWithdrawAttempts = 0;
  const unsubscribe = [
    listenIdlePing(async (event) => {
      if (!own(event)) return;
      count("idle");
      await Budget._getFree(contextOf(event.symbol, event.when));
    }),
    listenSchedulePing(async (event) => {
      if (!own(event)) return;
      count("schedule");
      await Budget._getBalance(contextOf(event.symbol, event.when));
    }),
    listenActivePing(async (event) => {
      if (!own(event)) return;
      count("active");
      const ping = (activePings.get(event.data.id) ?? 0) + 1;
      activePings.set(event.data.id, ping);
      if (ping === 1) {
        // may throw BudgetRejectedError straight out of the handler
        await Budget._reserve({ id: event.data.id, amount: CALLBACK_BUDGET_COST, note: "entry" }, contextOf(event.symbol, event.when));
      }
      if (ping === 2) {
        // the same id again: an Error thrown from inside the queued setState dispatch
        reReserveAttempts += 1;
        await Budget._reserve({ id: event.data.id, amount: CALLBACK_BUDGET_COST, note: "duplicate" }, contextOf(event.symbol, event.when));
      }
    }),
    listenSignalBacktest(async (event) => {
      if (!own(event)) return;
      count("signalBacktest");
      if (event.action === "closed") {
        await Budget._release({ id: event.signal.id, pnl: event.pnl.pnlCost }, contextOf(event.symbol, new Date(event.closeTimestamp)));
      }
    }),
    listenSignal(async (event) => {
      if (!own(event)) return;
      count("signal");
      await Budget._getHistory(contextOf(event.symbol, whenOf(event)));
    }),
    listenSignalEvent(async (event) => {
      if (!own(event)) return;
      count("signalEvent");
      await Budget._getHistory(contextOf(event.symbol, event.when));
    }),
    listenOrderSchedule(async (event) => {
      if (!own(event)) return;
      count("orderSchedule");
      await Budget._deposit({ asset: "SCHED", amount: 1, note: event.action }, contextOf(event.symbol, event.when));
    }),
    listenStrategyCommit(async (event) => {
      if (!own(event)) return;
      count("strategyCommit");
      await Budget._getBalance(contextOf(event.symbol, event.when));
    }),
    listenHighestProfit(async (event) => {
      if (!own(event)) return;
      count("highestProfit");
      await Budget._deposit({ asset: "PEAK", amount: 1, note: "peak" }, contextOf(event.symbol, event.when));
    }),
    listenMaxDrawdown(async (event) => {
      if (!own(event)) return;
      count("maxDrawdown");
      // more than ever deposited: BudgetRejectedError thrown out of the handler
      overWithdrawAttempts += 1;
      await Budget._withdraw({ asset: "PEAK", amount: 1_000, note: "slump" }, contextOf(event.symbol, event.when));
    }),
  ];
  // the commit channel needs a user commit: a dividend on the first active ping of every position
  const dividends = new Set();
  unsubscribe.push(listenActivePing(async (event) => {
    if (!own(event) || dividends.has(event.data.id)) return;
    dividends.add(event.data.id);
    await Backtest.commitDividend(event.symbol, event.currentPrice, schema, { amount: 1, note: "lockstep budget" });
  }));
  const surfaced = { rejected: 0, duplicate: 0, other: [] };
  unsubscribe.push(listenError((error) => {
    if (BudgetRejectedError.isBudgetRejectedError(error)) surfaced.rejected += 1;
    else if (String(error?.message).includes("is already open in budget")) surfaced.duplicate += 1;
    else surfaced.other.push(String(error?.message).slice(0, 120));
  }));

  let done;
  try {
    done = await withFatalStub(() => runUntilDone(schema, symbols, ERROR_TIMEOUT_MS));
  } finally {
    unsubscribe.forEach((un) => un());
  }

  const silent = ["idle", "schedule", "active", "signalBacktest", "signal", "signalEvent", "orderSchedule", "strategyCommit", "highestProfit", "maxDrawdown"].filter((name) => !hits[name]);
  if (silent.length) return fail(`channels stayed silent: ${silent.join(", ")}; hits=${JSON.stringify(hits)}`);
  if (await failedSurvivorsOrLock(schema, done, symbols, fail)) return;

  // the errors left the handlers and reached the error channel, nothing else did
  if (!reReserveAttempts || surfaced.duplicate !== reReserveAttempts) {
    return fail(`expected every duplicate reserve to surface as an error: attempts=${reReserveAttempts} surfaced=${surfaced.duplicate}`);
  }
  if (!overWithdrawAttempts || surfaced.rejected < overWithdrawAttempts) {
    return fail(`expected every over-withdraw to surface as BudgetRejectedError: attempts=${overWithdrawAttempts} surfaced=${surfaced.rejected}`);
  }
  if (surfaced.other.length) return fail(`unexpected errors on the error channel: ${surfaced.other.slice(0, 3).join(" | ")}`);

  // the journal: consistent under lockstep, one release per reserve, every refusal recorded
  const history = await Budget._getHistory({ ...key, when: new Date(JOURNAL_END) });
  const overdrafts = history.filter((r) => r.type === "reserve" && r.overdraft !== undefined);
  if (overdrafts.length) return fail(`overdraft under lockstep: ${describeRows(overdrafts)}`);
  const negativeRow = history.find((r) => r.balance.free < 0);
  if (negativeRow) return fail(`free went negative at ${describeRows([negativeRow])}`);
  const reserves = history.filter((r) => r.type === "reserve").length;
  const releases = history.filter((r) => r.type === "release").length;
  if (reserves !== releases) return fail(`every reserve must be released: reserves=${reserves} releases=${releases}`);
  const rejectRows = history.filter((r) => r.type === "reject").length;
  if (rejectRows !== surfaced.rejected) return fail(`every BudgetRejectedError must leave a reject row: rows=${rejectRows} errors=${surfaced.rejected}`);
  const assets = history[history.length - 1].balance.assets;
  if (!(assets.PEAK > 0) || !(assets.SCHED > 0)) return fail(`deposits from highestProfit / orderSchedule missing: ${JSON.stringify(assets)}`);

  // the write queue survived the thrown dispatches: a fresh reserve / release still goes through
  const after = contextOf(FAST_SYMBOL, new Date(JOURNAL_END));
  await Budget._reserve({ id: "after-run", amount: 1 }, after);
  const released = await Budget._release({ id: "after-run", pnl: 0 }, after);
  if (released.deployed !== 0) return fail(`the budget queue is wedged after the thrown dispatches: ${JSON.stringify(released)}`);

  pass(`budget from every callback: ${history.length} rows, ${reserves} reserves/releases, ${rejectRows} refusals, ${surfaced.duplicate} duplicate reserves thrown, hits=${JSON.stringify(hits)}`);
});

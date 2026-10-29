import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  setConfig,
  listenIdlePing,
  listenActivePing,
  listenSchedulePing,
  listenPartialProfitAvailable,
  listenStrategyCommit,
  listenSignalBacktest,
  listenError,
} from "../../build/index.mjs";

// Commands issued from the listen* callbacks on a DAILY entry interval with a 4-HOUR watch. The
// fear: the engine looks at the position only every four hours, so a command issued from a
// listener could be dropped, or applied at the price of a look four hours later, where live
// would have acted within the minute. Every scenario runs on the 4h watch and on a 1m watch
// (the oracle that looks at every candle) and the two outcomes must be identical: the minute
// and price of every open, close and cancel, the minute of every commit event, the price the
// ping handed to the command, the partials on the close — and no queued commit may be dropped
// (the engine warns "dropping queued commits" when a commit has no position to attribute to).
// Entry steps are daily (0, 1440, 2880, …); the position's looks on the 4h watch are the span
// ends (dated at the span-end candle's close); a touch inside a span still closes on its own
// candle, a level crossed inside a span fires on its own candle.

const MIN = 60_000;
const DAY = 1440;
const FRAME_START = Date.parse("2024-05-01T00:00:00Z");
const FRAME_DAYS = 8;
const SYMBOL = "BTCUSDT";
const WATCHES = ["1m", "4h"];
const HOLD = 3 * DAY;
const minute = (timestamp) => (timestamp - FRAME_START) / MIN;
const round = (value) => Math.round(value * 1e6) / 1e6;

const marketLong = () => ({ position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: HOLD });
const restingLong = () => ({ position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: HOLD });

/**
 * One scenario on one watch: 1m candles from `priceAt(minute)` (a flat 100 unless overridden),
 * a daily entry grid, a strategy that never signals by itself. `commands` maps `channel@minute`
 * (idle / active / schedule / level / opened) to the command to issue from that listener; a
 * `level` command fires on the first partial-profit level event, an `opened` command right on
 * the lifecycle "opened" event. The outcome holds everything the comparison needs.
 */
const runScenario = async (name, watch, { priceAt = () => 100, commands = {} }) => {
  const context = { strategyName: `ldw-${name}-${watch}-strategy`, exchangeName: `ldw-${name}-${watch}-exchange`, frameName: `ldw-${name}-${watch}-frame` };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`ldw exchange: only 1m bars, got ${candleInterval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN) * MIN;
      while (out.length < limit) {
        const candle = priceAt(minute(timestamp));
        out.push({ timestamp, volume: 1_000, ...(typeof candle === "number" ? { open: candle, high: candle, low: candle, close: candle } : candle) });
        timestamp += MIN;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  addStrategySchema({ strategyName: context.strategyName, interval: "1d", getSignal: async () => null });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1d", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + FRAME_DAYS * DAY * MIN) });

  const outcome = { idle: [], lifecycle: [], commits: [], levels: [], pingPrices: {}, dropped: [], errors: [] };
  const fired = new Set();
  const issue = async (key, event) => {
    const command = commands[key];
    if (!command || fired.has(key)) return;
    fired.add(key);
    await command(SYMBOL, context, event);
  };
  const own = (event) => (event.data?.strategyName ?? event.strategyName) === context.strategyName;
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (String(args[0]).includes("dropping queued commits")) outcome.dropped.push(String(args[0]));
    originalWarn(...args);
  };
  const unsubscribe = [
    listenIdlePing(async (event) => { if (!own(event)) return; outcome.idle.push(minute(event.timestamp)); await issue(`idle@${minute(event.timestamp)}`, event); }),
    listenActivePing(async (event) => {
      if (!own(event)) return;
      const at = minute(event.timestamp);
      if (commands[`active@${at}`]) outcome.pingPrices[at] = round(event.currentPrice);
      await issue(`active@${at}`, event);
    }),
    listenSchedulePing(async (event) => { if (!own(event)) return; await issue(`schedule@${minute(event.timestamp)}`, event); }),
    listenPartialProfitAvailable(async (event) => {
      if (!own(event)) return;
      outcome.levels.push(`${event.level}@${minute(event.timestamp)}`);
      await issue("level", event);
    }),
    listenStrategyCommit((event) => { if (own(event)) outcome.commits.push(`${event.action}@${minute(event.timestamp)}`); }),
    listenSignalBacktest(async (event) => { if (own(event) && event.action === "opened") await issue("opened", event); }),
    listenError((error) => { outcome.errors.push(error?.message ?? String(error)); }),
  ];
  try {
    for await (const result of Backtest.run(SYMBOL, context)) {
      if (result.action === "opened") outcome.lifecycle.push(`opened@${minute(result.signal.pendingAt)}:${round(result.signal.priceOpen)}`);
      if (result.action === "scheduled") outcome.lifecycle.push(`scheduled@${minute(result.signal.scheduledAt)}:${round(result.signal.priceOpen)}`);
      if (result.action === "cancelled") outcome.lifecycle.push(`cancelled:${result.reason}@${minute(result.closeTimestamp)}`);
      if (result.action === "closed") outcome.lifecycle.push(`closed:${result.closeReason}@${minute(result.closeTimestamp)}:${round(result.currentPrice)}:partials=${result.signal.totalPartials}:pnl=${round(result.pnl.pnlPercentage)}`);
    }
  } finally {
    console.warn = originalWarn;
    unsubscribe.forEach((un) => un());
  }
  return outcome;
};

/** Runs the scenario on both watches; fails unless the 1m oracle satisfies `expect` and the 4h outcome equals it. Returns true when it passed. */
const compare = async (name, spec, expect, { pass, fail }) => {
  const results = {};
  for (const watch of WATCHES) results[watch] = await runScenario(name, watch, spec);
  const oracle = results["1m"];
  if (oracle.errors.length) { fail(`${name} 1m: errors ${oracle.errors.join(" | ")}`); return false; }
  if (oracle.dropped.length) { fail(`${name} 1m: queued commits were dropped: ${oracle.dropped.join(" | ")}`); return false; }
  const problem = expect(oracle);
  if (problem) { fail(`${name} 1m: ${problem} — got ${JSON.stringify(oracle)}`); return false; }
  if (results["4h"].dropped.length) { fail(`${name} 4h: queued commits were dropped: ${results["4h"].dropped.join(" | ")}`); return false; }
  if (results["4h"].errors.length) { fail(`${name} 4h: errors ${results["4h"].errors.join(" | ")}`); return false; }
  const pick = (o) => ({ idle: o.idle, lifecycle: o.lifecycle, commits: o.commits, firstLevel: o.levels[0] ?? null, pingPrices: o.pingPrices });
  if (JSON.stringify(pick(results["4h"])) !== JSON.stringify(pick(oracle))) {
    { fail(`${name}: the 4h watch differs from the 1m oracle — 4h: ${JSON.stringify(pick(results["4h"]))} vs 1m: ${JSON.stringify(pick(oracle))}`); return false; }
  }
  pass(`${name}: identical on 1d/1m and 1d/4h — ${JSON.stringify(pick(oracle))}`);
  return true;
};

const DAILY_IDLE_AFTER = (closeMinute) => Array.from({ length: FRAME_DAYS + 1 }, (_, k) => k * DAY).filter((m) => m <= DAY || m > closeMinute);

test("LISTEN DAILY/4H: a trailing stop set from the opened event guards the position at once — the commit lands on the next candle and an inner-span touch closes on its own minute, not at the span end", async (t) => {
  // open at the day-2 step (1440); the stop trailed from 85 to 90 right at the open; a wick to 89 on
  // candle 1640 (inside the first 4h span 1440..1679) stops out on that candle, dated 1641
  await compare("trailing-from-opened", {
    priceAt: (m) => (m === 1640 ? { open: 100, high: 100, low: 89, close: 100 } : 100),
    commands: {
      "idle@1440": (symbol, context) => Backtest.commitCreateSignal(symbol, context, marketLong()),
      opened: (symbol, context, event) => Backtest.commitTrailingStop(symbol, -5, event.currentPrice, context),
    },
  }, (o) => {
    if (o.commits.join(",") !== "trailing-stop@1441") return `expected the trailing-stop commit on 1441 (the first candle after the open, dated at its close), got ${o.commits.join(",")}`;
    if (o.lifecycle[0] !== "opened@1440:100" || !o.lifecycle[1]?.startsWith("closed:stop_loss@1641:90:partials=0:") || o.lifecycle.length !== 2) return `expected opened@1440 and stop_loss@1641 at the trailed 90`;
    if (o.idle.join(",") !== DAILY_IDLE_AFTER(1641).join(",")) return `idle pings must sit on the daily grid and resume at the first step after the close, expected ${DAILY_IDLE_AFTER(1641).join(",")}`;
    return null;
  }, t);
});

test("LISTEN DAILY/4H: a partial from the 4h ping is taken at that ping's own price, and a close asked from the next ping lands on the next candle, not the next span", async (t) => {
  // 100 up to 1539, 110 from 1540: the first span-end look (candle 1679, dated 1680) sees 110 and
  // takes 30% there; the second (candle 1919, dated 1920) asks the close, drained on candle 1920
  await compare("partial-and-close-from-pings", {
    priceAt: (m) => (m >= 1540 ? 110 : 100),
    commands: {
      "idle@1440": (symbol, context) => Backtest.commitCreateSignal(symbol, context, marketLong()),
      "active@1680": (symbol, context, event) => Backtest.commitPartialProfit(symbol, 30, event.currentPrice, context),
      "active@1920": (symbol, context) => Backtest.commitClosePending(symbol, context),
    },
  }, (o) => {
    if (o.pingPrices[1680] !== 110 || o.pingPrices[1920] !== 110) return `the pings must hand the current price 110, got ${JSON.stringify(o.pingPrices)}`;
    if (o.commits.join(",") !== "partial-profit@1680,close-pending@1921") return `expected partial-profit@1680 (the ping's own minute) and close-pending@1921 (the next candle), got ${o.commits.join(",")}`;
    if (!o.lifecycle[1]?.startsWith("closed:closed@1921:110:partials=1:")) return `expected the user close on 1921 at 110 carrying one partial, got ${o.lifecycle.join(",")}`;
    return null;
  }, t);
});

test("LISTEN DAILY/4H: a partial from the partial-profit level listener is taken on the level's own candle inside the span, not at the span end", async (t) => {
  // 104 from 1450: the 5-candle VWAP crosses the 10% level (101.9 of the way to 119) on candle 1452,
  // dated 1453 — a light look inside the first 4h span; the level fires there and the partial
  // asked from it is committed there
  await compare("partial-from-level", {
    priceAt: (m) => (m >= 1450 ? 104 : 100),
    commands: {
      "idle@1440": (symbol, context) => Backtest.commitCreateSignal(symbol, context, marketLong()),
      level: (symbol, context, event) => Backtest.commitPartialProfit(symbol, 10, event.currentPrice, context),
    },
  }, (o) => {
    if (o.levels[0] !== "10@1453") return `expected the first level 10@1453, got ${o.levels.slice(0, 3).join(",")}`;
    if (o.commits[0] !== "partial-profit@1453") return `expected the partial committed on the level's candle 1453, got ${o.commits.join(",")}`;
    if (!o.lifecycle[1]?.startsWith(`closed:time_expired@${1440 + HOLD}:104:partials=1:`)) return `expected the expiry on ${1440 + HOLD} at 104 carrying the partial, got ${o.lifecycle.join(",")}`;
    return null;
  }, t);
});

test("LISTEN DAILY/4H: a resting entry placed from the daily idle ping is cancelled from its 4h schedule ping on the next candle", async (t) => {
  // the wait must outlive the first 4h span: 600 minutes instead of the default 120
  setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 600 }, true);
  try {
    await compare("resting-cancel", {
      commands: {
        "idle@1440": (symbol, context) => Backtest.commitCreateSignal(symbol, context, restingLong()),
        "schedule@1680": (symbol, context) => Backtest.commitCancelScheduled(symbol, context),
      },
    }, (o) => {
      if (o.lifecycle.join(",") !== "scheduled@1440:90,cancelled:user@1681") return `expected the placement on 1440 and the cancel on 1681 (the candle after the 1680 ping)`;
      if (o.commits.join(",") !== "cancel-scheduled@1681") return `expected cancel-scheduled@1681, got ${o.commits.join(",")}`;
      return null;
    }, t);
  } finally {
    setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 120 }, true);
  }
});

test("LISTEN DAILY/4H: a resting entry placed from the daily idle ping is activated by an inner-span touch on its own minute, and its hold counts from there", async (t) => {
  setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 600 }, true);
  try {
    await compare("resting-activate", {
      priceAt: (m) => (m === 1540 ? { open: 100, high: 100, low: 90, close: 100 } : 100),
      commands: {
        "idle@1440": (symbol, context) => Backtest.commitCreateSignal(symbol, context, restingLong()),
      },
    }, (o) => {
      if (o.lifecycle[0] !== "scheduled@1440:90" || o.lifecycle[1] !== "opened@1541:90") return `expected the placement on 1440 and the activation on 1541 (the touch on candle 1540), got ${o.lifecycle.join(",")}`;
      if (!o.lifecycle[2]?.startsWith(`closed:time_expired@${1541 + HOLD}:100:`)) return `expected the expiry ${HOLD} minutes after the activation, got ${o.lifecycle.join(",")}`;
      return null;
    }, t);
  } finally {
    setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 120 }, true);
  }
});

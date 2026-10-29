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
  listenPartialLossAvailable,
  listenBreakevenAvailable,
  listenHighestProfit,
  listenMaxDrawdown,
  listenStrategyCommit,
  listenSignalBacktest,
  listenOrderSchedule,
  listenError,
} from "../../build/index.mjs";

// Every command from every listener on a DAILY entry interval with a 4-HOUR watch. The fear:
// the engine looks at the position only every four hours, so a command issued from a listener
// could be dropped, applied hours later, or applied at the price of a look hours later, where
// live acts within the minute. Every (source, command) pair runs on the 4h watch and on the 1m
// watch — the oracle that looks at every candle — and the two outcomes must be identical: the
// minute and price of every open, close and cancel, the minute of every commit event, the
// price the source handed to the command, the command's own verdict (accepted / refused), the
// partials, entries and dividends on the close — and no queued commit may be dropped (the
// engine warns "dropping queued commits" when a commit has no position to attribute to).
//
// Sources and when they fire (the same minute on both watches by construction):
//   idle           the daily entry step 1440 (day 2); the minute of a close or a cancel gets
//                  an idle step too (the engine re-ticks it like the live loop, off the grid)
//   opened         the lifecycle "opened" event of the market open on 1440 — a commit queued
//                  there is emitted by the light look of the next candle, dated 1441
//   active         the active ping of the first 4h span end after the open (candle 1679, dated 1680)
//   level          the first partial-profit level (a step to 104 on 1450: the 10% level on candle 1452, dated 1453)
//   lossLevel      the first partial-loss level (a step to 96 on 1450: candle 1451, dated 1452)
//   breakeven      the first breakeven-available event (the step to 104: candle 1450, dated 1451)
//   highest        the highest-profit event dated 1680 (a ramp makes a new high every candle; the
//                  coarse watch reports the recorded extreme at its look, same price, same minute)
//   drawdown       the max-drawdown event dated 1680 (a mirrored fall)
//   schedule       the schedule ping of the first span end after a resting placement (dated 1680)
//   scheduledEvent the lifecycle "scheduled" event of the placement on 1440 — a deferred cancel
//                  or activation queued there drains on the first candle, dated 1441
//   closed         the lifecycle "closed" event of a user close on 1681 — the engine re-ticks the
//                  close minute like the live loop, so a signal asked there opens on 1681
//
// The same matrix runs short (`mirror`): the tapes and the probes mirrored around 100, the
// entries, stops, takes and levels mirrored, so every touch and level is exercised on the other
// side of the market.

const MIN = 60_000;
const DAY = 1440;
const FRAME_START = Date.parse("2024-05-01T00:00:00Z");
const FRAME_DAYS = 8;
const SYMBOL = "BTCUSDT";
const WATCHES = ["1m", "4h"];
const HOLD = 3 * DAY;
const minute = (timestamp) => (timestamp - FRAME_START) / MIN;
const round = (value) => Math.round(value * 1e6) / 1e6;

const MARKET = { position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: HOLD };
const RESTING = { position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: HOLD };
const ADOPTED = { position: "long", priceOpen: 95, priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: HOLD };

/** The tapes, by minute; a number is a flat candle */
const TAPES = {
  flat: () => 100,
  up110: (m) => (m >= 1540 ? 110 : 100),
  level104: (m) => (m >= 1450 ? 104 : 100),
  loss96: (m) => (m >= 1450 ? 96 : 100),
  // a new high / low every candle up to the span end of 1680, then flat (the take at 119 and the
  // stop at 85 stay out of reach; a tape running away would trip the candle sanitizer)
  ramp: (m) => (m > 1440 ? Math.min(100 + 0.05 * (m - 1440), 112) : 100),
  fall: (m) => (m > 1440 ? Math.max(100 - 0.05 * (m - 1440), 88) : 100),
};
const wick = (low) => ({ open: 100, high: 100, low, close: 100 });
const rise = (from, price, count = 10) => Object.fromEntries(Array.from({ length: count }, (_, k) => [from + k, price]));

/**
 * One scenario on one watch. `commands` maps a source key to the command issued from that
 * source, once: idle@1440 (the entry step), opened, active@1680, level, lossLevel, breakeven,
 * highest@1680, drawdown@1680, schedule@1680, scheduledEvent, closed. `probes` override the
 * candles of given minutes (a touch after the command proves its effect).
 */
const runScenario = async (name, watch, { tape = "flat", probes = {}, commands = {}, mirror = false }) => {
  const context = { strategyName: `ldw-${name}-${watch}-strategy`, exchangeName: `ldw-${name}-${watch}-exchange`, frameName: `ldw-${name}-${watch}-frame` };
  const base = TAPES[tape];
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`ldw exchange: only 1m bars, got ${candleInterval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN) * MIN;
      while (out.length < limit) {
        const m = minute(timestamp);
        const raw = probes[m] ?? base(m);
        const candle = typeof raw === "number" ? { open: raw, high: raw, low: raw, close: raw } : raw;
        out.push({ timestamp, volume: 1_000, ...(mirror ? { open: 200 - candle.open, high: 200 - candle.low, low: 200 - candle.high, close: 200 - candle.close } : candle) });
        timestamp += MIN;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  addStrategySchema({ strategyName: context.strategyName, interval: "1d", getSignal: async () => null });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1d", watchInterval: watch, startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + FRAME_DAYS * DAY * MIN) });

  const outcome = { idle: [], lifecycle: [], commits: [], first: {}, triggerPrice: {}, returns: {}, dropped: [], errors: [] };
  const fired = new Set();
  const issue = async (key, event, price) => {
    const command = commands[key];
    if (!command || fired.has(key)) return;
    fired.add(key);
    if (price !== undefined) outcome.triggerPrice[key] = round(price);
    outcome.returns[key] = await command(SYMBOL, context, event);
  };
  const own = (event) => (event.data?.strategyName ?? event.strategyName) === context.strategyName;
  const first = (channel, at) => { if (outcome.first[channel] === undefined) outcome.first[channel] = at; };
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (String(args[0]).includes("dropping queued commits")) outcome.dropped.push(String(args[0]));
    originalWarn(...args);
  };
  const unsubscribe = [
    listenIdlePing(async (event) => { if (!own(event)) return; outcome.idle.push(minute(event.timestamp)); await issue(`idle@${minute(event.timestamp)}`, event, event.currentPrice); }),
    listenActivePing(async (event) => { if (!own(event)) return; await issue(`active@${minute(event.timestamp)}`, event, event.currentPrice); }),
    listenSchedulePing(async (event) => { if (!own(event)) return; await issue(`schedule@${minute(event.timestamp)}`, event, event.currentPrice); }),
    listenPartialProfitAvailable(async (event) => { if (!own(event)) return; first("level", `${event.level}@${minute(event.timestamp)}`); await issue("level", event, event.currentPrice); }),
    listenPartialLossAvailable(async (event) => { if (!own(event)) return; first("lossLevel", `${event.level}@${minute(event.timestamp)}`); await issue("lossLevel", event, event.currentPrice); }),
    listenBreakevenAvailable(async (event) => { if (!own(event)) return; first("breakeven", minute(event.timestamp)); await issue("breakeven", event, event.currentPrice); }),
    listenHighestProfit(async (event) => { if (!own(event)) return; await issue(`highest@${minute(event.timestamp)}`, event, event.currentPrice); }),
    listenMaxDrawdown(async (event) => { if (!own(event)) return; await issue(`drawdown@${minute(event.timestamp)}`, event, event.currentPrice); }),
    listenStrategyCommit((event) => { if (own(event)) outcome.commits.push(`${event.action}@${minute(event.timestamp)}`); }),
    listenSignalBacktest(async (event) => {
      if (!own(event)) return;
      if (event.action === "opened") await issue("opened", event, event.currentPrice);
      if (event.action === "closed") await issue("closed", event, event.currentPrice);
    }),
    listenOrderSchedule(async (event) => { if (own(event) && event.action === "scheduled") await issue("scheduledEvent", event, event.currentPrice); }),
    listenError((error) => { outcome.errors.push(error?.message ?? String(error)); }),
  ];
  try {
    for await (const result of Backtest.run(SYMBOL, context)) {
      if (result.action === "opened") outcome.lifecycle.push(`opened@${minute(result.signal.pendingAt)}:${round(result.signal.priceOpen)}`);
      if (result.action === "scheduled") outcome.lifecycle.push(`scheduled@${minute(result.signal.scheduledAt)}:${round(result.signal.priceOpen)}`);
      if (result.action === "cancelled") outcome.lifecycle.push(`cancelled:${result.reason}@${minute(result.closeTimestamp)}`);
      if (result.action === "closed") outcome.lifecycle.push(`closed:${result.closeReason}@${minute(result.closeTimestamp)}:${round(result.currentPrice)}:partials=${result.signal.totalPartials}:entries=${result.signal.totalEntries}:div=${result.pnl.pnlDividends > 0 ? 1 : 0}`);
    }
  } finally {
    console.warn = originalWarn;
    unsubscribe.forEach((un) => un());
  }
  return outcome;
};

/**
 * Runs the scenario on both watches. Returns null when the 1m oracle satisfies `expect`, no
 * commit was dropped and the 4h outcome equals the oracle; otherwise the problem as a string.
 */
const check = async (name, spec, expect) => {
  const results = {};
  for (const watch of WATCHES) results[watch] = await runScenario(name, watch, spec);
  const oracle = results["1m"];
  for (const watch of WATCHES) {
    if (results[watch].errors.length) return `${name} ${watch}: errors ${results[watch].errors.join(" | ")}`;
    if (results[watch].dropped.length) return `${name} ${watch}: queued commits were dropped: ${results[watch].dropped.join(" | ")}`;
  }
  const problem = expect(oracle);
  if (problem) return `${name} 1m: ${problem} — got ${JSON.stringify(oracle)}`;
  const pick = (o) => ({ idle: o.idle, lifecycle: o.lifecycle, commits: o.commits, first: o.first, triggerPrice: o.triggerPrice, returns: o.returns });
  if (JSON.stringify(pick(results["4h"])) !== JSON.stringify(pick(oracle))) {
    return `${name}: the 4h watch differs from the 1m oracle — 4h: ${JSON.stringify(pick(results["4h"]))} vs 1m: ${JSON.stringify(pick(oracle))}`;
  }
  return null;
};

/** Runs the scenarios of one source in sequence: one fail on the first problem, one pass with the summary */
const suite = async (scenarios, { pass, fail }) => {
  const report = [];
  for (const [name, spec, expect] of scenarios) {
    const problem = await check(name, spec, expect);
    if (problem) return fail(problem);
    report.push(name);
  }
  pass(`identical on 1d/1m and 1d/4h: ${report.join(", ")}`);
};

// ----- expectation helpers (the oracle outcome `o`, the source minute `at`, the commit minute `cAt`) -----
const has = (o, entry) => o.lifecycle.includes(entry);
const hasPrefix = (o, prefix) => o.lifecycle.some((e) => e.startsWith(prefix));
const commit = (o, entry) => o.commits.includes(entry);
const closedWith = (o, part) => o.lifecycle.some((e) => e.startsWith("closed:") && e.includes(part));
const accepted = (o, key) => o.returns[key] === true;
const refused = (o, key) => o.returns[key] === false;
const closePrice = (o) => Number((o.lifecycle.find((e) => e.startsWith("closed:")) ?? "").split(":")[2]);
const both = (a, b) => (o) => a(o) ?? b(o);

const expectClose = (at) => (o) => (!hasPrefix(o, `closed:closed@${at + 1}:`) ? `expected the user close on ${at + 1}` : !commit(o, `close-pending@${at + 1}`) ? `expected close-pending@${at + 1}` : null);
const expectFill = (reason, at, price) => (o) => (!hasPrefix(o, `closed:${reason}@${at + 1}:${price}:`) ? `expected the confirmed ${reason} on ${at + 1} at ${price}` : null);
const expectPartial = (action, key, cAt) => (o) => (!accepted(o, key) ? `${action} must be accepted (returned ${o.returns[key]})` : !commit(o, `${action}@${cAt}`) ? `expected ${action}@${cAt}, got ${o.commits.join(",")}` : !closedWith(o, "partials=1") ? "expected one partial on the close" : null);
const expectRefusal = (action, key) => (o) => (!refused(o, key) ? `${action} must be refused here (returned ${o.returns[key]})` : o.commits.some((c) => c.startsWith(`${action}@`)) ? `a refused ${action} must emit no commit` : null);
const expectTrailingStop = (key, cAt, touchAt, stop = 90) => (o) => (!accepted(o, key) ? `trailing stop must be accepted (returned ${o.returns[key]})` : !commit(o, `trailing-stop@${cAt}`) ? `expected trailing-stop@${cAt}, got ${o.commits.join(",")}` : touchAt !== null && !hasPrefix(o, `closed:stop_loss@${touchAt + 1}:${stop}:`) ? `expected the trailed stop ${stop} to close on ${touchAt + 1}` : null);
const expectTrailingTake = (key, cAt, takeAt, take = 105) => (o) => (!accepted(o, key) ? `trailing take must be accepted (returned ${o.returns[key]})` : !commit(o, `trailing-take@${cAt}`) ? `expected trailing-take@${cAt}, got ${o.commits.join(",")}` : !hasPrefix(o, `closed:take_profit@${takeAt}:${take}:`) ? `expected the trailed take ${take} to close on ${takeAt}` : null);
const expectBreakeven = (key, cAt, dipAt, [lo, hi] = [100, 101]) => (o) => (!accepted(o, key) ? `breakeven must be accepted (returned ${o.returns[key]})` : !commit(o, `breakeven@${cAt}`) ? `expected breakeven@${cAt}, got ${o.commits.join(",")}` : !hasPrefix(o, `closed:stop_loss@${dipAt + 1}:`) || closePrice(o) < lo || closePrice(o) > hi ? `expected the breakeven stop (${lo}..${hi}) to close on ${dipAt + 1}` : null);
const expectAverageBuy = (key, cAt) => (o) => (!accepted(o, key) ? `average buy must be accepted (returned ${o.returns[key]})` : !commit(o, `average-buy@${cAt}`) ? `expected average-buy@${cAt}, got ${o.commits.join(",")}` : !closedWith(o, "entries=2") ? "expected two entries on the close" : null);
const expectDividend = (key, cAt) => (o) => (!accepted(o, key) ? `dividend must be accepted (returned ${o.returns[key]})` : !commit(o, `dividend@${cAt}`) ? `expected dividend@${cAt}, got ${o.commits.join(",")}` : !closedWith(o, "div=1") ? "expected the dividend on the close" : null);
const expectCancel = (at) => (o) => (!has(o, `cancelled:user@${at + 1}`) ? `expected cancelled:user@${at + 1}` : !commit(o, `cancel-scheduled@${at + 1}`) ? `expected cancel-scheduled@${at + 1}` : null);
const expectActivate = (at, price = 90) => (o) => (!has(o, `opened@${at + 1}:${price}`) ? `expected the activation on ${at + 1} at ${price}, got ${o.lifecycle.join(",")}` : null);

// ----- the commands -----
const C = {
  openMarket: (s, c) => Backtest.commitCreateSignal(s, c, MARKET),
  openResting: (s, c) => Backtest.commitCreateSignal(s, c, RESTING),
  adopt: (s, c) => Backtest.setPendingSignal(s, c, ADOPTED),
  close: (s, c) => Backtest.commitClosePending(s, c),
  takeFill: (s, c) => Backtest.commitCreateTakeProfit(s, c),
  stopFill: (s, c) => Backtest.commitCreateStopLoss(s, c),
  partialProfit: (s, c, e) => Backtest.commitPartialProfit(s, 30, e.currentPrice, c),
  partialLoss: (s, c, e) => Backtest.commitPartialLoss(s, 30, e.currentPrice, c),
  trailingStop: (s, c, e) => Backtest.commitTrailingStop(s, -5, e.currentPrice, c),
  trailingTake: (s, c, e) => Backtest.commitTrailingTake(s, -14, e.currentPrice, c),
  breakeven: (s, c, e) => Backtest.commitBreakeven(s, e.currentPrice, c),
  averageBuy: (s, c, e) => Backtest.commitAverageBuy(s, e.currentPrice, c, 1000),
  dividend: (s, c, e) => Backtest.commitDividend(s, e.currentPrice, c, { amount: 1, note: "ldw" }),
  cancel: (s, c) => Backtest.commitCancelScheduled(s, c),
  activate: (s, c) => Backtest.commitActivateScheduled(s, c),
};
const withOpen = (key, command, extra = {}) => ({ "idle@1440": C.openMarket, [key]: command, ...extra });
const withResting = (key, command) => (key ? { "idle@1440": C.openResting, [key]: command } : { "idle@1440": C.openResting });

test("LISTEN DAILY/4H — idle ping: a market open, a resting placement and an adopted position (setPendingSignal) land on the entry step, and the adopted position is monitored candle by candle", async (t) => {
  await suite([
    ["idle.openMarket", { commands: { "idle@1440": C.openMarket } }, (o) => (!has(o, "opened@1440:100") ? "expected opened@1440 at 100" : !hasPrefix(o, `closed:time_expired@${1440 + HOLD}:100:`) ? "expected the expiry" : o.idle.join(",") !== "0,1440,5760,7200,8640,10080,11520" ? `idle pings must sit on the daily grid and resume on the expiry step, got ${o.idle.join(",")}` : null)],
    ["idle.openResting", { commands: { "idle@1440": C.openResting } }, (o) => (!has(o, "scheduled@1440:90") ? "expected scheduled@1440 at 90" : !has(o, "cancelled:timeout@1560") ? `expected the 120-minute timeout on 1560, got ${o.lifecycle.join(",")}` : null)],
    ["idle.adopt", { commands: { "idle@1440": C.adopt } }, (o) => (!has(o, "opened@1440:95") ? "expected the adopted open on 1440 at 95" : !hasPrefix(o, `closed:time_expired@${1440 + HOLD}:100:`) ? "expected the expiry" : null)],
    ["idle.adopt.stop", { probes: { 2000: wick(84) }, commands: { "idle@1440": C.adopt } }, (o) => (!has(o, "opened@1440:95") ? "expected the adopted open" : !hasPrefix(o, "closed:stop_loss@2001:85:") ? "expected the adopted position's stop on 2001 at 85 (the wick on candle 2000)" : null)],
    ["idle.adopt.commands", { tape: "up110", commands: { "idle@1440": C.adopt, "active@1680": C.partialProfit, "active@1920": C.close } }, (o) => (o.triggerPrice["active@1680"] !== 110 ? "the 4h ping of the adopted position must hand 110" : !commit(o, "partial-profit@1680") ? "expected partial-profit@1680" : !hasPrefix(o, "closed:closed@1921:110:partials=1:") ? "expected the close on 1921 carrying the partial" : null)],
  ], t);
});

test("LISTEN DAILY/4H — opened event: a command issued right at the open is applied at once, its commit lands on the next candle, and the refusals at the entry price are the same on both watches", async (t) => {
  await suite([
    ["opened.close", { commands: withOpen("opened", C.close) }, expectClose(1440)],
    ["opened.takeFill", { commands: withOpen("opened", C.takeFill) }, expectFill("take_profit", 1440, 119)],
    ["opened.stopFill", { commands: withOpen("opened", C.stopFill) }, expectFill("stop_loss", 1440, 85)],
    ["opened.trailingStop", { probes: { 2000: wick(89) }, commands: withOpen("opened", C.trailingStop) }, expectTrailingStop("opened", 1441, 2000)],
    ["opened.trailingTake", { probes: rise(2100, 106), commands: withOpen("opened", C.trailingTake) }, expectTrailingTake("opened", 1441, 2105)],
    ["opened.dividend", { commands: withOpen("opened", C.dividend) }, expectDividend("opened", 1441)],
    ["opened.partialProfit.refused", { commands: withOpen("opened", C.partialProfit) }, expectRefusal("partial-profit", "opened")],
    ["opened.partialLoss.refused", { commands: withOpen("opened", C.partialLoss) }, expectRefusal("partial-loss", "opened")],
    ["opened.breakeven.refused", { commands: withOpen("opened", C.breakeven) }, expectRefusal("breakeven", "opened")],
    ["opened.averageBuy.refused", { commands: withOpen("opened", C.averageBuy) }, expectRefusal("average-buy", "opened")],
  ], t);
});

test("LISTEN DAILY/4H — active ping of the 4h span end: every position command is applied at that ping's own minute and price, the deferred ones on the next candle", async (t) => {
  const inProfit = (key, command, probes = {}) => ({ tape: "up110", probes, commands: withOpen(key, command) });
  const price = (o) => (o.triggerPrice["active@1680"] !== 110 ? `the ping must hand the current price 110, got ${o.triggerPrice["active@1680"]}` : null);
  await suite([
    ["active.close", inProfit("active@1680", C.close), both(price, expectClose(1680))],
    ["active.takeFill", inProfit("active@1680", C.takeFill), both(price, expectFill("take_profit", 1680, 119))],
    ["active.stopFill", inProfit("active@1680", C.stopFill), both(price, expectFill("stop_loss", 1680, 85))],
    ["active.partialProfit", inProfit("active@1680", C.partialProfit), both(price, expectPartial("partial-profit", "active@1680", 1680))],
    ["active.trailingStop", inProfit("active@1680", C.trailingStop, { 2000: wick(89) }), both(price, expectTrailingStop("active@1680", 1680, 2000))],
    ["active.breakeven", inProfit("active@1680", C.breakeven, { 2000: wick(99) }), both(price, expectBreakeven("active@1680", 1680, 2000))],
    ["active.dividend", inProfit("active@1680", C.dividend), both(price, expectDividend("active@1680", 1680))],
    ["active.partialLoss.refused", inProfit("active@1680", C.partialLoss), both(price, expectRefusal("partial-loss", "active@1680"))],
    ["active.averageBuy.refused", inProfit("active@1680", C.averageBuy), both(price, expectRefusal("average-buy", "active@1680"))],
    ["active.trailingTake.refused", inProfit("active@1680", C.trailingTake), both(price, expectRefusal("trailing-take", "active@1680"))],
  ], t);
});

test("LISTEN DAILY/4H — level listeners inside the span: the partial-profit, partial-loss and breakeven events fire on their own candle and the commands issued from them are applied there", async (t) => {
  const level = (command, probes = {}) => ({ tape: "level104", probes, commands: withOpen("level", command) });
  const loss = (command, probes = {}) => ({ tape: "loss96", probes, commands: withOpen("lossLevel", command) });
  const be = (command, probes = {}) => ({ tape: "level104", probes, commands: withOpen("breakeven", command) });
  const firstLevel = (o) => (o.first.level !== "10@1453" ? `expected the first profit level 10@1453, got ${o.first.level}` : null);
  const firstLoss = (o) => (o.first.lossLevel !== "10@1452" ? `expected the first loss level 10@1452, got ${o.first.lossLevel}` : null);
  const firstBe = (o) => (o.first.breakeven !== 1451 ? `expected the breakeven available on 1451, got ${o.first.breakeven}` : null);
  await suite([
    ["level.partialProfit", level(C.partialProfit), both(firstLevel, expectPartial("partial-profit", "level", 1453))],
    ["level.close", level(C.close), both(firstLevel, expectClose(1453))],
    ["level.trailingStop", level(C.trailingStop, { 2000: wick(89) }), both(firstLevel, expectTrailingStop("level", 1453, 2000))],
    ["level.trailingTake", level(C.trailingTake, rise(2100, 106)), both(firstLevel, expectTrailingTake("level", 1453, 2103))],
    ["level.breakeven", level(C.breakeven, { 2000: wick(99) }), both(firstLevel, expectBreakeven("level", 1453, 2000))],
    ["lossLevel.partialLoss", loss(C.partialLoss), both(firstLoss, expectPartial("partial-loss", "lossLevel", 1452))],
    ["lossLevel.averageBuy", loss(C.averageBuy), both(firstLoss, expectAverageBuy("lossLevel", 1452))],
    ["lossLevel.close", loss(C.close), both(firstLoss, expectClose(1452))],
    ["lossLevel.trailingStop", loss(C.trailingStop, { 2000: wick(89) }), both(firstLoss, expectTrailingStop("lossLevel", 1452, 2000))],
    ["breakeven.breakeven", be(C.breakeven, { 2000: wick(99) }), both(firstBe, expectBreakeven("breakeven", 1451, 2000))],
    ["breakeven.close", be(C.close), both(firstBe, expectClose(1451))],
  ], t);
});

test("LISTEN DAILY/4H — highest-profit and max-drawdown listeners: the coarse watch reports the recorded extreme at its look with the extreme's own price and minute, and the commands issued from it apply there", async (t) => {
  const high = (command, probes = {}) => ({ tape: "ramp", probes, commands: withOpen("highest@1680", command) });
  const low = (command, probes = {}) => ({ tape: "fall", probes, commands: withOpen("drawdown@1680", command) });
  const highPrice = (o) => (Math.abs(o.triggerPrice["highest@1680"] - 111.85) > 0.2 ? `the highest-profit event dated 1680 must carry the VWAP of the ramp there (~111.85), got ${o.triggerPrice["highest@1680"]}` : null);
  const lowPrice = (o) => (Math.abs(o.triggerPrice["drawdown@1680"] - 88.15) > 0.2 ? `the max-drawdown event dated 1680 must carry the VWAP of the fall there (~88.15), got ${o.triggerPrice["drawdown@1680"]}` : null);
  await suite([
    ["highest.partialProfit", high(C.partialProfit), both(highPrice, expectPartial("partial-profit", "highest@1680", 1680))],
    ["highest.trailingStop", high(C.trailingStop), both(highPrice, expectTrailingStop("highest@1680", 1680, null))],
    ["highest.close", high(C.close), both(highPrice, expectClose(1680))],
    ["drawdown.partialLoss", low(C.partialLoss), both(lowPrice, expectPartial("partial-loss", "drawdown@1680", 1680))],
    ["drawdown.averageBuy", low(C.averageBuy), both(lowPrice, expectAverageBuy("drawdown@1680", 1680))],
    ["drawdown.close", low(C.close), both(lowPrice, expectClose(1680))],
  ], t);
});

const FRAME_END = FRAME_DAYS * DAY;
// an activation asked at the last look of the frame (the schedule ping dated FRAME_END, on both
// watches): live opens it on the next tick; the frame has no next minute, so the position opens
// on the frame-end candle, with its clock, and expires with the frame right there
const expectFrameEndActivate = (price) => (o) => (!has(o, `opened@${FRAME_END + 1}:${price}`) ? `expected the activation on the frame-end candle, dated ${FRAME_END + 1} at ${price}, got ${o.lifecycle.join(",")}` : !hasPrefix(o, `closed:time_expired@${FRAME_END + 1}:100:`) ? `expected the expiry with the frame on ${FRAME_END + 1}, got ${o.lifecycle.join(",")}` : null);

test("LISTEN DAILY/4H — schedule ping and scheduled event: a cancel or an activation asked from the 4h schedule ping or right at the placement drains on the next candle; an activation asked at the frame end opens and expires with the frame", async (t) => {
  // the wait must outlive the first 4h span (and the last day of the frame): 2000 minutes instead of the default 120
  setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 2000 }, true);
  try {
    await suite([
      ["schedule.cancel", { commands: withResting("schedule@1680", C.cancel) }, expectCancel(1680)],
      ["schedule.activate", { commands: withResting("schedule@1680", C.activate) }, expectActivate(1680)],
      ["scheduledEvent.cancel", { commands: withResting("scheduledEvent", C.cancel) }, expectCancel(1440)],
      ["scheduledEvent.activate", { commands: withResting("scheduledEvent", C.activate) }, expectActivate(1440)],
      ["schedule.activate.frameEnd", { commands: { [`idle@${FRAME_END - DAY}`]: C.openResting, [`schedule@${FRAME_END}`]: C.activate } }, expectFrameEndActivate(90)],
      ["schedule.touch", { probes: { 1540: wick(90) }, commands: withResting() }, (o) => (!has(o, "opened@1541:90") ? `expected the activation on 1541 (the touch on candle 1540), got ${o.lifecycle.join(",")}` : !hasPrefix(o, `closed:time_expired@${1541 + HOLD}:100:`) ? "expected the expiry counted from the activation" : null)],
    ], t);
  } finally {
    setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 120 }, true);
  }
});

test("LISTEN DAILY/4H — closed event: a new signal or an adoption asked right at a close is opened on the close minute itself, off the daily grid, as the live loop re-ticks that minute — on both watches", async (t) => {
  const afterClose = (command) => ({ tape: "up110", commands: withOpen("active@1680", C.close, { closed: command }) });
  await suite([
    ["closed.openMarket", afterClose(C.openMarket), (o) => (!hasPrefix(o, "closed:closed@1681:110:") ? "expected the user close on 1681" : !has(o, "opened@1681:110") ? `expected the next open on the close minute 1681 at 110, got ${o.lifecycle.join(",")}` : !o.idle.includes(1681 + HOLD) ? `expected the idle ping of the re-ticked close minute ${1681 + HOLD} after the expiry, got ${o.idle.join(",")}` : null)],
    ["closed.adopt", afterClose(C.adopt), (o) => (!hasPrefix(o, "closed:closed@1681:110:") ? "expected the user close on 1681" : !has(o, "opened@1681:95") ? `expected the adoption on the close minute 1681 at 95, got ${o.lifecycle.join(",")}` : !o.idle.includes(1681 + HOLD) ? `expected the idle ping of the re-ticked close minute ${1681 + HOLD} after the expiry, got ${o.idle.join(",")}` : null)],
  ], t);
});

// ----- the matrix mirrored: a short on the tapes mirrored around 100 -----
const MARKET_SHORT = { position: "short", priceTakeProfit: 81, priceStopLoss: 115, cost: 1000, minuteEstimatedTime: HOLD };
const RESTING_SHORT = { position: "short", priceOpen: 110, priceTakeProfit: 95, priceStopLoss: 120, cost: 1000, minuteEstimatedTime: HOLD };
const ADOPTED_SHORT = { position: "short", priceOpen: 105, priceTakeProfit: 81, priceStopLoss: 115, cost: 1000, minuteEstimatedTime: HOLD };
const CS = {
  openMarket: (s, c) => Backtest.commitCreateSignal(s, c, MARKET_SHORT),
  openResting: (s, c) => Backtest.commitCreateSignal(s, c, RESTING_SHORT),
  adopt: (s, c) => Backtest.setPendingSignal(s, c, ADOPTED_SHORT),
};
const shortOpen = (key, command, extra = {}) => ({ "idle@1440": CS.openMarket, [key]: command, ...extra });
const shortResting = (key, command) => (key ? { "idle@1440": CS.openResting, [key]: command } : { "idle@1440": CS.openResting });
const mirrored = (spec) => ({ ...spec, mirror: true });

test("LISTEN DAILY/4H — short: the matrix mirrored around 100 (entries, stops, takes, levels, extremes, resting entries, the close minute, the frame end) gives the mirrored outcomes on both watches", async (t) => {
  // up110 mirrored is a fall to 90 (profit for the short), level104 a step to 96, loss96 a step to 104,
  // ramp a fall (new highs of profit), fall a ramp (drawdown); wick(x) mirrored is a spike to 200 - x
  const inProfit = (key, command, probes = {}) => mirrored({ tape: "up110", probes, commands: shortOpen(key, command) });
  const price = (o) => (o.triggerPrice["active@1680"] !== 90 ? `the ping must hand the current price 90, got ${o.triggerPrice["active@1680"]}` : null);
  const level = (command, probes = {}) => mirrored({ tape: "level104", probes, commands: shortOpen("level", command) });
  const loss = (command, probes = {}) => mirrored({ tape: "loss96", probes, commands: shortOpen("lossLevel", command) });
  const be = (command, probes = {}) => mirrored({ tape: "level104", probes, commands: shortOpen("breakeven", command) });
  const firstLevel = (o) => (o.first.level !== "10@1453" ? `expected the first profit level 10@1453, got ${o.first.level}` : null);
  const firstLoss = (o) => (o.first.lossLevel !== "10@1452" ? `expected the first loss level 10@1452, got ${o.first.lossLevel}` : null);
  const firstBe = (o) => (o.first.breakeven !== 1451 ? `expected the breakeven available on 1451, got ${o.first.breakeven}` : null);
  const high = (command) => mirrored({ tape: "ramp", commands: shortOpen("highest@1680", command) });
  const low = (command) => mirrored({ tape: "fall", commands: shortOpen("drawdown@1680", command) });
  const highPrice = (o) => (Math.abs(o.triggerPrice["highest@1680"] - 88.15) > 0.2 ? `the highest-profit event dated 1680 must carry the VWAP of the mirrored ramp there (~88.15), got ${o.triggerPrice["highest@1680"]}` : null);
  const lowPrice = (o) => (Math.abs(o.triggerPrice["drawdown@1680"] - 111.85) > 0.2 ? `the max-drawdown event dated 1680 must carry the VWAP of the mirrored fall there (~111.85), got ${o.triggerPrice["drawdown@1680"]}` : null);
  const afterClose = (command) => mirrored({ tape: "up110", commands: shortOpen("active@1680", C.close, { closed: command }) });
  setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 2000 }, true);
  try {
    await suite([
      ["short.idle.openMarket", mirrored({ commands: { "idle@1440": CS.openMarket } }), (o) => (!has(o, "opened@1440:100") ? "expected opened@1440 at 100" : !hasPrefix(o, `closed:time_expired@${1440 + HOLD}:100:`) ? "expected the expiry" : null)],
      ["short.idle.adopt", mirrored({ commands: { "idle@1440": CS.adopt } }), (o) => (!has(o, "opened@1440:105") ? "expected the adopted short on 1440 at 105" : !hasPrefix(o, `closed:time_expired@${1440 + HOLD}:100:`) ? "expected the expiry" : null)],
      ["short.idle.adopt.stop", mirrored({ probes: { 2000: wick(84) }, commands: { "idle@1440": CS.adopt } }), (o) => (!hasPrefix(o, "closed:stop_loss@2001:115:") ? `expected the adopted short's stop on 2001 at 115 (the spike to 116 on candle 2000), got ${o.lifecycle.join(",")}` : null)],
      ["short.opened.close", mirrored({ commands: shortOpen("opened", C.close) }), expectClose(1440)],
      ["short.opened.takeFill", mirrored({ commands: shortOpen("opened", C.takeFill) }), expectFill("take_profit", 1440, 81)],
      ["short.opened.stopFill", mirrored({ commands: shortOpen("opened", C.stopFill) }), expectFill("stop_loss", 1440, 115)],
      ["short.opened.trailingStop", mirrored({ probes: { 2000: wick(89) }, commands: shortOpen("opened", C.trailingStop) }), expectTrailingStop("opened", 1441, 2000, 110)],
      ["short.opened.trailingTake", mirrored({ probes: rise(2100, 106), commands: shortOpen("opened", C.trailingTake) }), expectTrailingTake("opened", 1441, 2105, 95)],
      ["short.opened.partialProfit.refused", mirrored({ commands: shortOpen("opened", C.partialProfit) }), expectRefusal("partial-profit", "opened")],
      ["short.active.close", inProfit("active@1680", C.close), both(price, expectClose(1680))],
      ["short.active.takeFill", inProfit("active@1680", C.takeFill), both(price, expectFill("take_profit", 1680, 81))],
      ["short.active.stopFill", inProfit("active@1680", C.stopFill), both(price, expectFill("stop_loss", 1680, 115))],
      ["short.active.partialProfit", inProfit("active@1680", C.partialProfit), both(price, expectPartial("partial-profit", "active@1680", 1680))],
      ["short.active.trailingStop", inProfit("active@1680", C.trailingStop, { 2000: wick(89) }), both(price, expectTrailingStop("active@1680", 1680, 2000, 110))],
      ["short.active.breakeven", inProfit("active@1680", C.breakeven, { 2000: wick(99) }), both(price, expectBreakeven("active@1680", 1680, 2000, [99, 100]))],
      ["short.active.dividend", inProfit("active@1680", C.dividend), both(price, expectDividend("active@1680", 1680))],
      ["short.active.partialLoss.refused", inProfit("active@1680", C.partialLoss), both(price, expectRefusal("partial-loss", "active@1680"))],
      ["short.level.partialProfit", level(C.partialProfit), both(firstLevel, expectPartial("partial-profit", "level", 1453))],
      ["short.level.trailingTake", level(C.trailingTake, rise(2100, 106)), both(firstLevel, expectTrailingTake("level", 1453, 2103, 95))],
      ["short.level.breakeven", level(C.breakeven, { 2000: wick(99) }), both(firstLevel, expectBreakeven("level", 1453, 2000, [99, 100]))],
      ["short.lossLevel.partialLoss", loss(C.partialLoss), both(firstLoss, expectPartial("partial-loss", "lossLevel", 1452))],
      ["short.lossLevel.averageBuy", loss(C.averageBuy), both(firstLoss, expectAverageBuy("lossLevel", 1452))],
      ["short.lossLevel.trailingStop", loss(C.trailingStop, { 2000: wick(89) }), both(firstLoss, expectTrailingStop("lossLevel", 1452, 2000, 110))],
      ["short.breakeven.breakeven", be(C.breakeven, { 2000: wick(99) }), both(firstBe, expectBreakeven("breakeven", 1451, 2000, [99, 100]))],
      ["short.highest.partialProfit", high(C.partialProfit), both(highPrice, expectPartial("partial-profit", "highest@1680", 1680))],
      ["short.drawdown.partialLoss", low(C.partialLoss), both(lowPrice, expectPartial("partial-loss", "drawdown@1680", 1680))],
      ["short.schedule.cancel", mirrored({ commands: shortResting("schedule@1680", C.cancel) }), expectCancel(1680)],
      ["short.schedule.activate", mirrored({ commands: shortResting("schedule@1680", C.activate) }), expectActivate(1680, 110)],
      ["short.scheduledEvent.activate", mirrored({ commands: shortResting("scheduledEvent", C.activate) }), expectActivate(1440, 110)],
      ["short.schedule.touch", mirrored({ probes: { 1540: wick(90) }, commands: shortResting() }), (o) => (!has(o, "opened@1541:110") ? `expected the activation on 1541 (the spike to 110 on candle 1540), got ${o.lifecycle.join(",")}` : null)],
      ["short.schedule.activate.frameEnd", mirrored({ commands: { [`idle@${FRAME_END - DAY}`]: CS.openResting, [`schedule@${FRAME_END}`]: C.activate } }), expectFrameEndActivate(110)],
      ["short.closed.openMarket", afterClose(CS.openMarket), (o) => (!hasPrefix(o, "closed:closed@1681:90:") ? `expected the user close on 1681 at 90, got ${o.lifecycle.join(",")}` : !has(o, "opened@1681:90") ? `expected the next short on the close minute 1681 at 90, got ${o.lifecycle.join(",")}` : null)],
    ], t);
  } finally {
    setConfig({ CC_SCHEDULE_AWAIT_MINUTES: 120 }, true);
  }
});

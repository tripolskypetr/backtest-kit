import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Live,
  lib,
  listenOrderSchedule,
  listenStrategyCommit,
  listenSchedulePing,
  listenDoneBacktest,
  MethodContextService,
} from "../../build/index.mjs";

// A stop with a resting entry on the book. In live the first tick after the stop drops the
// entry through the user-cancel pipeline — a "cancelled" result (reason user, note stopped),
// the schedule event and the cancel-scheduled commit, the entry gone for the presence checks —
// so the broker adapter cancels the real order and the loop can end on it. The stop callback
// reports done only when neither a position nor a resting entry (each counting its deferred
// changes) is left: in a backtest the run ends on the stop and done follows the end of the run,
// never while the entry is still placed.

const MIN = 60_000;
const SYMBOL = "BTCUSDT";

const makeExchange = (exchangeName, price = 100) => addExchangeSchema({
  exchangeName,
  getCandles: async (_symbol, candleInterval, since, limit) => {
    if (candleInterval !== "1m") throw new Error(`stop scheduled exchange: only 1m bars, got ${candleInterval}`);
    const out = [];
    let timestamp = Math.floor(since.getTime() / MIN) * MIN;
    while (out.length < limit) {
      out.push({ timestamp, open: price, high: price, low: price, close: price, volume: 1_000 });
      timestamp += MIN;
    }
    return out;
  },
  formatPrice: async (_s, p) => p.toFixed(8),
  formatQuantity: async (_s, q) => q.toFixed(8),
});

// flat at 100, the entry at 90 is never touched
const restingLong = () => ({ position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: 600 });

test("STOP SCHEDULED: in live the first tick after the stop cancels the resting entry (reason user, note stopped) and the entry is gone for the presence checks", async ({ pass, fail }) => {
  const t0 = Date.parse("2024-01-01T00:00:00Z");
  const minute = (timestamp) => (timestamp - t0) / MIN;
  const context = { strategyName: "stop-scheduled-live-strategy", exchangeName: "binance-stop-scheduled-live", frameName: "" };
  makeExchange(context.exchangeName);
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return restingLong();
    },
  });
  const events = [];
  const unsubscribe = [
    listenOrderSchedule((event) => { if (event.strategyName === context.strategyName) events.push(`${event.action}:${event.reason ?? ""}@${minute(event.timestamp)}`); }),
    listenStrategyCommit((event) => { if (event.strategyName === context.strategyName) events.push(`${event.action}@${minute(event.timestamp)}`); }),
  ];
  const presence = async () => ({
    scheduled: !(await Live.hasNoScheduledSignal(SYMBOL, context)),
    pending: !(await Live.hasNoPendingSignal(SYMBOL, context)),
  });
  const ticks = [];
  let before = null;
  let after = null;
  try {
    const runTick = (when) => MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick(SYMBOL, when, false, context),
      context,
    );
    for (let k = 0; k < 4; k++) {
      if (k === 2) {
        // the operator stops the strategy between the ticks of minutes 1 and 2
        before = await presence();
        await lib.strategyCoreService.stopStrategy(false, SYMBOL, context);
      }
      const result = await runTick(new Date(t0 + k * MIN));
      ticks.push(result.action === "cancelled" ? `cancelled:${result.reason}:${result.signal?.note ?? result.signal?.cancelNote ?? ""}` : result.action);
      if (k === 2) after = await presence();
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (ticks[0] !== "scheduled" || ticks[1] !== "waiting" || !ticks[2].startsWith("cancelled:user") || ticks[3] !== "idle") return fail(`expected scheduled, waiting, cancelled:user (the stop's cancel), idle — got ${ticks.join(", ")}`);
  if (!before?.scheduled || before.pending) return fail(`before the stop the entry must be scheduled and nothing pending, got ${JSON.stringify(before)}`);
  if (after?.scheduled || after?.pending) return fail(`after the cancelling tick neither a resting entry nor a position may be present, got ${JSON.stringify(after)}`);
  if (!events.includes("cancelled:user@2") || !events.includes("cancel-scheduled@2")) return fail(`the schedule event and the commit of the cancel must be emitted on minute 2 with reason user, got ${events.join(", ")}`);
  pass(`ticks ${ticks.join(", ")}: the stop between 1 and 2 cancelled the entry on 2 (${events.filter((e) => e.endsWith("@2")).join(", ")}); presence before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
});

test("STOP SCHEDULED: a backtest stopped from the schedule ping while the entry rests reports done once, after the run has ended — not at the stop", async ({ pass, fail }) => {
  const FRAME_START = Date.parse("2024-02-01T00:00:00Z");
  const minute = (timestamp) => (timestamp - FRAME_START) / MIN;
  const context = { strategyName: "stop-scheduled-backtest-strategy", exchangeName: "stop-scheduled-backtest-exchange", frameName: "stop-scheduled-backtest-frame" };
  makeExchange(context.exchangeName);
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return restingLong();
    },
  });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1m", watchInterval: "1m", startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + 60 * MIN) });
  const timeline = [];
  let stopRun = null;
  let stoppedAt = null;
  let doneCount = 0;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const unsubscribe = [
    listenSchedulePing(async (event) => {
      if (event.data.strategyName !== context.strategyName) return;
      timeline.push(`ping@${minute(event.timestamp)}`);
      if (stoppedAt === null && minute(event.timestamp) === 5 && stopRun) {
        stoppedAt = 5;
        timeline.push("stop@5");
        stopRun();
      }
    }),
    listenDoneBacktest((event) => {
      if (event.strategyName !== context.strategyName) return;
      doneCount += 1;
      timeline.push("done");
      resolveDone();
    }),
  ];
  try {
    stopRun = Backtest.background(SYMBOL, context);
    const outcome = await Promise.race([done.then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("timeout"), 30_000))]);
    if (outcome !== "done") return fail(`done never came within 30s after the stop, timeline ${timeline.join(", ")}`);
    // let a stray second emission show up, if any
    await new Promise((resolve) => setTimeout(resolve, 300));
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (stoppedAt !== 5) return fail(`the run must have been stopped from the schedule ping of minute 5, timeline ${timeline.join(", ")}`);
  if (doneCount !== 1) return fail(`done must be reported exactly once, got ${doneCount}: ${timeline.join(", ")}`);
  const doneIndex = timeline.indexOf("done");
  const afterDone = timeline.slice(doneIndex + 1).filter((e) => e.startsWith("ping@"));
  if (afterDone.length) return fail(`no schedule ping may follow done — done must come after the run has ended, not at the stop — got ${timeline.join(", ")}`);
  if (doneIndex < timeline.indexOf("stop@5")) return fail(`done must follow the stop, got ${timeline.join(", ")}`);
  pass(`timeline ${timeline.join(", ")}: one done, after the stop and after the last ping`);
});

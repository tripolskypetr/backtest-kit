import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  lib,
  listenStrategyCommit,
  listenSignalEvent,
  MethodContextService,
} from "../../build/index.mjs";

// The frame-end replay of the orchestrator: ClientStrategy.backtest with NO candles, dated
// frameEndTime, for whatever is still open after the timeframe loop. A user activation still
// queued there (activateScheduled asked at a look the frame left no candle after) is not
// cancelled: live would open it on the next tick, the frame has no next minute, so the position
// opens at frameEndTime at the current average price — the activate-scheduled commit, the opened
// event — and expires with the frame right there by time_expired, as every position open at the
// frame end does. The replay is called directly, the way the orchestrator calls it.

const MIN = 60_000;
const DAY = 1440;
const SYMBOL = "BTCUSDT";
const T0 = Date.parse("2024-06-01T00:00:00Z");
const FRAME_END = T0 + 2 * DAY * MIN;
const minute = (timestamp) => (timestamp - T0) / MIN;

test("FRAME END ACTIVATION: a user activation still queued at the frame-end replay opens at frameEndTime and expires with the frame — commit, opened event, closed by time_expired, nothing cancelled", async ({ pass, fail }) => {
  const context = { strategyName: "frame-end-activation-strategy", exchangeName: "frame-end-activation-exchange", frameName: "frame-end-activation-frame" };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, candleInterval, since, limit) => {
      if (candleInterval !== "1m") throw new Error(`frame end exchange: only 1m bars, got ${candleInterval}`);
      const out = [];
      let timestamp = Math.floor(since.getTime() / MIN) * MIN;
      while (out.length < limit) {
        out.push({ timestamp, open: 100, high: 100, low: 100, close: 100, volume: 1_000 });
        timestamp += MIN;
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      // a resting long at 90 under a flat market at 100: never touched
      return { position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: 600 };
    },
  });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1d", watchInterval: "1m", startDate: new Date(T0), endDate: new Date(FRAME_END) });

  const commits = [];
  const events = [];
  const unsubscribe = [
    listenStrategyCommit((event) => { if (event.strategyName === context.strategyName) commits.push(`${event.action}@${minute(event.timestamp)}`); }),
    listenSignalEvent((event) => { if (event.strategyName === context.strategyName) events.push(`${event.action}@${minute(event.timestamp)}`); }),
  ];
  const inContext = (fn) => MethodContextService.runInContext(fn, context);
  let placed;
  let expired;
  try {
    placed = await inContext(() => lib.strategyCoreService.tick(SYMBOL, new Date(T0), true, context));
    if (placed.action !== "scheduled") return fail(`the entry tick must place the resting entry, got ${placed.action}`);
    // the activation is asked after the placement and stays queued (nothing ticks before the frame end)
    await Backtest.commitActivateScheduled(SYMBOL, context);
    if (await Backtest.hasNoScheduledSignal(SYMBOL, context)) return fail("the queued activation must still count as a resting entry for the presence check");
    expired = await inContext(() => lib.strategyCoreService.backtest(SYMBOL, [], FRAME_END, new Date(FRAME_END), true, context));
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (expired.action !== "closed") return fail(`the frame-end replay must close the activated position, got ${expired.action}${expired.action === "cancelled" ? ` (${expired.reason})` : ""}`);
  if (expired.closeReason !== "time_expired") return fail(`the close must expire with the frame, got ${expired.closeReason}`);
  if (minute(expired.closeTimestamp) !== 2 * DAY) return fail(`the close must be dated the frame end ${2 * DAY}, got ${minute(expired.closeTimestamp)}`);
  if (minute(expired.signal.pendingAt) !== 2 * DAY) return fail(`the position must open at the frame end ${2 * DAY}, got ${minute(expired.signal.pendingAt)}`);
  if (expired.signal.priceOpen !== 90) return fail(`the position must open at the resting price 90, got ${expired.signal.priceOpen}`);
  if (expired.currentPrice !== 100) return fail(`the close must be priced at the market 100, got ${expired.currentPrice}`);
  if (!commits.includes(`activate-scheduled@${2 * DAY}`)) return fail(`expected the activate-scheduled commit dated ${2 * DAY}, got ${commits.join(",")}`);
  if (!events.includes(`opened@${2 * DAY}`) || !events.includes(`closed@${2 * DAY}`)) return fail(`expected the opened and closed events dated ${2 * DAY}, got ${events.join(",")}`);
  if (commits.some((c) => c.startsWith("cancel-scheduled@")) || events.some((e) => e.startsWith("cancelled@"))) return fail(`nothing may be cancelled: commits ${commits.join(",")}, events ${events.join(",")}`);
  if (!(await Backtest.hasNoPendingSignal(SYMBOL, context)) || !(await Backtest.hasNoScheduledSignal(SYMBOL, context))) return fail("nothing may be left after the frame end");
  pass(`placed@${minute(placed.signal.scheduledAt)}, activation queued, frame end: opened@${minute(expired.signal.pendingAt)} at ${expired.signal.priceOpen}, closed ${expired.closeReason}@${minute(expired.closeTimestamp)} at ${expired.currentPrice}; commits ${commits.join(",")}; events ${events.join(",")}`);
});

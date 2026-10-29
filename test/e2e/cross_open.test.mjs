import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  setConfig,
  listenActivePing,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
  getAveragePrice,
} from "../../build/index.mjs";
import { Subject, sleep } from "functools-kit";

// An open command for an IDLE strategy issued off its entry grid: strategy A (hourly entry,
// 1m watch) holds a position and, from its active ping of 12:00, asks strategy B (daily entry,
// idle) to open. Live would take that command on B's next tick, 12:01. The backtest used to
// wait for B's next entry step — the next day. Now the command carries the issuer's minute
// (the execution clock inside A's replay follows the evaluated candle) and B's orchestrator
// ticks B on 12:01, off its grid: under the lockstep the barrier B waits on wakes it up there.

const MIN = 60_000;
const HOUR = 60;
const DAY = 1440;
const T0 = Date.parse("2024-07-01T00:00:00Z");
const minute = (timestamp) => (timestamp - T0) / MIN;
const ERROR_TIMEOUT_MS = 60_000;

const makeExchange = (exchangeName) => addExchangeSchema({
  exchangeName,
  getCandles: async (_symbol, candleInterval, since, limit) => {
    if (candleInterval !== "1m") throw new Error(`cross open exchange: only 1m bars, got ${candleInterval}`);
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

const LONG = (hold) => ({ position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: hold });

/**
 * Runs A and B in parallel under the lockstep. A opens a 300-minute long on its 10:00 step; its
 * active ping of `issueAt` issues the command for B. Returns B's lifecycle and the issue clock.
 */
const runCase = async (name, { issueAt, command }) => {
  setConfig({ CC_BACKTEST_LOCKSTEP: true }, true);
  const exchangeName = `cross-open-exchange-${name}`;
  makeExchange(exchangeName);
  const a = { strategyName: `cross-open-a-${name}`, exchangeName, frameName: `cross-open-frame-a-${name}` };
  const b = { strategyName: `cross-open-b-${name}`, exchangeName, frameName: `cross-open-frame-b-${name}` };
  addStrategySchema({ strategyName: a.strategyName, interval: "1h", getSignal: async (_s, when) => (minute(when.getTime()) === 10 * HOUR ? LONG(300) : null) });
  addStrategySchema({ strategyName: b.strategyName, interval: "1d", getSignal: async () => null });
  addFrameSchema({ frameName: a.frameName, entryInterval: "1h", watchInterval: "1m", startDate: new Date(T0), endDate: new Date(T0 + 2 * DAY * MIN) });
  addFrameSchema({ frameName: b.frameName, entryInterval: "1d", watchInterval: "1m", startDate: new Date(T0), endDate: new Date(T0 + 2 * DAY * MIN) });

  const lifecycle = [];
  const errors = [];
  let issued = null;
  const done = new Set();
  const doneSubject = new Subject();
  const unsubscribe = [
    listenActivePing(async (event) => {
      if (event.data.strategyName !== a.strategyName || issued !== null || minute(event.timestamp) !== issueAt) return;
      // the price the issuer sees "now" must be the one of this candle, not of the window start
      issued = { at: minute(event.timestamp), price: await getAveragePrice("BTCUSDT") };
      await command(b);
    }),
    listenSignalBacktest((event) => {
      if (event.strategyName !== b.strategyName) return;
      if (event.action === "opened") lifecycle.push(`opened@${minute(event.signal.pendingAt)}:${event.signal.priceOpen}`);
      if (event.action === "closed") lifecycle.push(`closed:${event.closeReason}@${minute(event.closeTimestamp)}`);
    }),
    listenError((error) => { errors.push(error?.message ?? String(error)); }),
    listenDoneBacktest((event) => {
      if (event.strategyName !== a.strategyName && event.strategyName !== b.strategyName) return;
      done.add(event.strategyName);
      if (done.size === 2) doneSubject.next();
    }),
  ];
  try {
    Backtest.background("BTCUSDT", a);
    Backtest.background("BTCUSDT", b);
    await Promise.race([doneSubject.toPromise(), sleep(ERROR_TIMEOUT_MS)]);
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (done.size !== 2) throw new Error(`both backtests must finish within ${ERROR_TIMEOUT_MS} ms, done=${[...done].join(",")}`);
  return { lifecycle, issued, errors };
};

test("CROSS OPEN: a createSignal issued for an idle daily strategy from another strategy's 12:00 ping opens on 12:01, off the daily grid, not on the next day", async ({ pass, fail }) => {
  const { lifecycle, issued, errors } = await runCase("create", {
    issueAt: 12 * HOUR,
    command: (b) => Backtest.commitCreateSignal("BTCUSDT", b, LONG(100)),
  });
  if (!issued) return fail("the command was never issued: A's ping of 12:00 did not fire");
  if (issued.price !== 100) return fail(`the issuer must see the candle's price, got ${issued.price}`);
  if (!lifecycle.includes(`opened@${12 * HOUR + 1}:100`)) return fail(`B must open on 12:01 (minute ${12 * HOUR + 1}), got ${lifecycle.join(",") || "nothing"}; errors ${errors.join(" | ")}`);
  if (!lifecycle.includes(`closed:time_expired@${12 * HOUR + 101}`)) return fail(`B's position must expire after its 100-minute hold on ${12 * HOUR + 101}, got ${lifecycle.join(",")}`);
  pass(`issued from A's ping@${issued.at} → B ${lifecycle.join(", ")}`);
});

test("CROSS OPEN: a setPendingSignal (adoption) issued for an idle daily strategy from another strategy's 12:00 ping is monitored from 12:01", async ({ pass, fail }) => {
  const { lifecycle, issued, errors } = await runCase("adopt", {
    issueAt: 12 * HOUR,
    command: (b) => Backtest.setPendingSignal("BTCUSDT", b, { position: "long", priceOpen: 95, priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: 100 }),
  });
  if (!issued) return fail("the command was never issued: A's ping of 12:00 did not fire");
  if (!lifecycle.includes(`opened@${12 * HOUR + 1}:95`)) return fail(`B must adopt on 12:01 (minute ${12 * HOUR + 1}) at 95, got ${lifecycle.join(",") || "nothing"}; errors ${errors.join(" | ")}`);
  if (!lifecycle.includes(`closed:time_expired@${12 * HOUR + 101}`)) return fail(`the adopted position must expire after its 100-minute hold on ${12 * HOUR + 101}, got ${lifecycle.join(",")}`);
  pass(`issued from A's ping@${issued.at} → B ${lifecycle.join(", ")}`);
});

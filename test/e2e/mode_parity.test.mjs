import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Live,
  lib,
  listenIdlePing,
  listenActivePing,
  listenSchedulePing,
  listenHighestProfit,
  listenMaxDrawdown,
  listenBreakevenAvailable,
  listenPartialProfitAvailable,
  listenPartialLossAvailable,
  listenStrategyCommit,
  MethodContextService,
} from "../../build/index.mjs";

// One tape, one command script, two engines: the backtest replay (Backtest.run on a 1m/1m
// frame) and the live tick (strategyCoreService.tick once per minute, as LiveLogicPrivateService
// drives it, with the idle step re-run on the minute of a close or a cancel as the live loop
// does). Every observable event is logged in emission order with its minute — the tick results
// (opened / scheduled / cancelled / closed with reason and price), the idle, active and schedule
// pings, the breakeven and partial levels, the highest-profit and max-drawdown extremes and the
// strategy commits — and the two logs must be identical, entry for entry.
//
// The clock rule both engines follow: the iteration of minute k dates everything k and
// monitors the candle k-1 that has just closed — its touches first, then the look (ping,
// levels, extremes, commits), then the clock events of k (hold expiry, wait timeout). The idle
// step of minute k uses the same closed candles. No shift, no mapping, no known gaps.
//
// The script runs once long and once short: the short on the tape mirrored around 100, with
// the entries, stops and takes mirrored, so every touch, level and extreme is exercised on the
// other side of the market.

const MIN = 60_000;
const SYMBOL = "BTCUSDT";
const T0 = Date.parse("2024-04-01T00:00:00Z");
const MINUTES = 220;
const minute = (timestamp) => (timestamp - T0) / MIN;

// the long tape, by minute: 100 → 110 (20..40) → 95 (41..69), a low of 84 on 70, 100 again from
// 71, a low of 90 on 100 (touches the resting entry at 90), 106 on 110..130, 100 to the end
const longCandleAt = (m) => {
  if (m >= 20 && m <= 40) return { open: 110, high: 110, low: 110, close: 110 };
  if (m >= 41 && m <= 69) return { open: 95, high: 95, low: 95, close: 95 };
  if (m === 70) return { open: 95, high: 95, low: 84, close: 95 };
  if (m === 100) return { open: 100, high: 100, low: 90, close: 100 };
  if (m >= 110 && m <= 130) return { open: 106, high: 106, low: 106, close: 106 };
  return { open: 100, high: 100, low: 100, close: 100 };
};
const mirror = (c) => ({ open: 200 - c.open, high: 200 - c.low, low: 200 - c.high, close: 200 - c.close });

const SIDES = {
  long: {
    candleAt: longCandleAt,
    market: { position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: 600 },
    resting: { position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: 600 },
    marks: [
      "2:opened:100", "30:commit:partial-profit", "30:commit:dividend", "35:commit:trailing-stop", "71:closed:stop_loss:90",
      "80:scheduled:90", "101:opened:90", "115:closed:take_profit:105",
      "140:scheduled:90", "151:cancelled:user",
      "160:opened:100", "180:closed:time_expired:100",
    ],
  },
  // the short: 100 → 90 (20..40) → 105 (41..69), a high of 116 on 70, a high of 110 on 100
  // (touches the resting entry at 110), 94 on 110..130 (the take at 95 by VWAP)
  short: {
    candleAt: (m) => mirror(longCandleAt(m)),
    market: { position: "short", priceTakeProfit: 81, priceStopLoss: 115, cost: 1000, minuteEstimatedTime: 600 },
    resting: { position: "short", priceOpen: 110, priceTakeProfit: 95, priceStopLoss: 120, cost: 1000, minuteEstimatedTime: 600 },
    marks: [
      "2:opened:100", "30:commit:partial-profit", "30:commit:dividend", "35:commit:trailing-stop", "71:closed:stop_loss:110",
      "80:scheduled:110", "101:opened:110", "115:closed:take_profit:95",
      "140:scheduled:110", "151:cancelled:user",
      "160:opened:100", "180:closed:time_expired:100",
    ],
  },
};

/** The command script: channel + minute → command issued through the mode's class-level API */
const makeScript = ({ market, resting }) => [
  { channel: "idle", at: 2, run: (api, ctx) => api.commitCreateSignal(SYMBOL, ctx, market) },
  { channel: "active", at: 30, run: async (api, ctx, event) => {
    await api.commitPartialProfit(SYMBOL, 10, event.currentPrice, ctx);
    await api.commitDividend(SYMBOL, event.currentPrice, ctx, { amount: 1, note: "parity" });
  } },
  { channel: "active", at: 35, run: (api, ctx, event) => api.commitTrailingStop(SYMBOL, -5, event.currentPrice, ctx) },
  { channel: "idle", at: 80, run: (api, ctx) => api.commitCreateSignal(SYMBOL, ctx, resting) },
  { channel: "idle", at: 140, run: (api, ctx) => api.commitCreateSignal(SYMBOL, ctx, resting) },
  { channel: "schedule", at: 150, run: (api, ctx) => api.commitCancelScheduled(SYMBOL, ctx) },
  { channel: "idle", at: 160, run: (api, ctx) => api.commitCreateSignal(SYMBOL, ctx, { ...market, minuteEstimatedTime: 20 }) },
];

const round = (value) => Math.round(value * 100) / 100;

/**
 * Subscribes every observable channel for `context`, logging `minute:tag` in emission order,
 * and runs the command script from the pings. Returns the log and the unsubscribe list.
 */
const observe = (api, context, script) => {
  const log = [];
  const done = new Set();
  const push = (timestamp, tag) => log.push(`${minute(timestamp)}:${tag}`);
  const run = (channel) => async (event) => {
    const at = minute(event.timestamp);
    for (const step of script) {
      const key = `${step.channel}@${step.at}`;
      if (step.channel !== channel || step.at !== at || done.has(key)) continue;
      done.add(key);
      await step.run(api, context, event);
    }
  };
  const ownData = (event) => event.data.strategyName === context.strategyName;
  const own = (event) => event.strategyName === context.strategyName;
  const unsubscribe = [
    listenIdlePing(async (event) => { if (!own(event)) return; push(event.timestamp, "idle"); await run("idle")(event); }),
    listenActivePing(async (event) => { if (!ownData(event)) return; push(event.timestamp, "ping"); await run("active")(event); }),
    listenSchedulePing(async (event) => { if (!ownData(event)) return; push(event.timestamp, "sched"); await run("schedule")(event); }),
    listenHighestProfit((event) => { if (own(event)) push(event.timestamp, `hp:${round(event.currentPrice)}`); }),
    listenMaxDrawdown((event) => { if (own(event)) push(event.timestamp, `mdd:${round(event.currentPrice)}`); }),
    listenBreakevenAvailable((event) => { if (own(event)) push(event.timestamp, "be"); }),
    listenPartialProfitAvailable((event) => { if (own(event)) push(event.timestamp, `pp:${event.level}`); }),
    listenPartialLossAvailable((event) => { if (own(event)) push(event.timestamp, `pl:${event.level}`); }),
    listenStrategyCommit((event) => { if (own(event)) push(event.timestamp, `commit:${event.action}`); }),
  ];
  const result = (r) => {
    if (r.action === "opened") push(r.signal.pendingAt, `opened:${round(r.signal.priceOpen)}`);
    if (r.action === "scheduled") push(r.signal.scheduledAt, `scheduled:${round(r.signal.priceOpen)}`);
    if (r.action === "cancelled") push(r.closeTimestamp, `cancelled:${r.reason}`);
    if (r.action === "closed") push(r.closeTimestamp, `closed:${r.closeReason}:${round(r.currentPrice)}`);
  };
  return { log, unsubscribe, result };
};

const makeExchange = (exchangeName, candleAt) => addExchangeSchema({
  exchangeName,
  getCandles: async (_symbol, candleInterval, since, limit) => {
    if (candleInterval !== "1m") throw new Error(`parity exchange: only 1m bars, got ${candleInterval}`);
    const out = [];
    let timestamp = Math.floor(since.getTime() / MIN) * MIN;
    while (out.length < limit) {
      out.push({ timestamp, volume: 1_000, ...candleAt(minute(timestamp)) });
      timestamp += MIN;
    }
    return out;
  },
  formatPrice: async (_s, p) => p.toFixed(8),
  formatQuantity: async (_s, q) => q.toFixed(8),
});

const runBacktestMode = async (side) => {
  const { candleAt } = SIDES[side];
  const context = { strategyName: `parity-${side}-backtest-strategy`, exchangeName: `parity-${side}-backtest-exchange`, frameName: `parity-${side}-backtest-frame` };
  makeExchange(context.exchangeName, candleAt);
  addStrategySchema({ strategyName: context.strategyName, interval: "1m", getSignal: async () => null });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1m", watchInterval: "1m", startDate: new Date(T0), endDate: new Date(T0 + MINUTES * MIN) });
  const { log, unsubscribe, result } = observe(Backtest, context, makeScript(SIDES[side]));
  try {
    for await (const r of Backtest.run(SYMBOL, context)) result(r);
  } finally {
    unsubscribe.forEach((un) => un());
  }
  return log;
};

const runLiveMode = async (side) => {
  const { candleAt } = SIDES[side];
  const context = { strategyName: `parity-${side}-live-strategy`, exchangeName: `binance-parity-${side}-live`, frameName: "" };
  makeExchange(context.exchangeName, candleAt);
  addStrategySchema({ strategyName: context.strategyName, interval: "1m", getSignal: async () => null });
  const { log, unsubscribe, result } = observe(Live, context, makeScript(SIDES[side]));
  try {
    const runTick = (when) => MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick(SYMBOL, when, false, context),
      context,
    );
    // the backtest frame end is inclusive: one entry step on MINUTES itself. A tick that closed
    // or cancelled is followed by the idle step of the same minute, as the live loop does.
    for (let m = 0; m <= MINUTES; m++) {
      const r = await runTick(new Date(T0 + m * MIN));
      result(r);
      if (r.action === "closed" || r.action === "cancelled") result(await runTick(new Date(T0 + m * MIN)));
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  return log;
};

for (const side of ["long", "short"]) {
  test(`MODE PARITY (${side}): one tape and one command script give the same event log, minute by minute and in order, through the backtest replay and through live ticks`, async ({ pass, fail }) => {
    const { marks } = SIDES[side];
    const backtestRaw = await runBacktestMode(side);
    const liveRaw = await runLiveMode(side);
    const missing = marks.filter((mark) => !backtestRaw.includes(mark));
    if (missing.length) return fail(`the backtest log lacks the expected marks ${missing.join(", ")} — got ${backtestRaw.filter((e) => !/:(idle|ping|sched)$/.test(e)).join(", ")}`);
    // stable by minute: the backtest generator yields an activation's "opened" result only after
    // the replay of the window that follows it, so that entry lands late in the raw log
    const byMinute = (log) => log.map((entry, i) => [Number(entry.split(":")[0]), i, entry]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , entry]) => entry);
    const backtestLog = byMinute(backtestRaw);
    const liveLog = byMinute(liveRaw);
    const first = backtestLog.findIndex((entry, i) => entry !== liveLog[i]);
    if (first !== -1 || backtestLog.length !== liveLog.length) {
      const at = first === -1 ? Math.min(backtestLog.length, liveLog.length) : first;
      const around = (log) => log.slice(Math.max(0, at - 6), at + 6).join(" | ");
      const m0 = Number((backtestLog[at] ?? liveLog[at] ?? "0:").split(":")[0]);
      const window = (log) => log.filter((e) => Math.abs(Number(e.split(":")[0]) - m0) <= 12).join(" | ");
      return fail(`the logs diverge at entry ${at}: backtest "${backtestLog[at]}" vs live "${liveLog[at]}" (${backtestLog.length} vs ${liveLog.length} entries)\n  backtest … ${around(backtestLog)}\n  live     … ${around(liveLog)}\n  raw backtest ±12 … ${window(backtestRaw)}\n  raw live ±12     … ${window(liveRaw)}`);
    }
    const counts = {};
    for (const entry of backtestLog) { const tag = entry.split(":")[1]; counts[tag] = (counts[tag] ?? 0) + 1; }
    pass(`${backtestLog.length} identical entries: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}; marks ${marks.join(" ")}`);
  });
}

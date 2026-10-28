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
// drives it). Every observable event is logged in emission order with its minute — the tick
// results (opened / scheduled / cancelled / closed with reason and price), the idle, active and
// schedule pings, the breakeven and partial levels, the highest-profit and max-drawdown
// extremes and the strategy commits — and the two logs must be identical.
//
// The one difference by construction: the backtest evaluates candle m with its own OHLC on
// minute m, while a live tick on minute m can only monitor candles that have closed, the last
// of them being m-1 — so every monitoring event of candle m (ping, levels, extremes, commits,
// a touch, a VWAP take, an activation, a user cancel) is stamped m in the backtest and m+1 in
// live. The idle tick and what it opens or places use the same closed candles in both modes
// and carry the same minute. The live log is mapped back by that rule before the comparison,
// and a command keyed on candle m is issued from the live ping of minute m+1. Everything else
// — the order inside a minute, the attribution of the commits, the prices — must agree.
//
// Known gaps, by the same construction, derived from the backtest log (knownGaps):
// - after a monitoring-driven close or cancel on candle k the backtest's next entry step is an
//   idle tick on k+1, while live spends its tick k+1 on that close and is idle from k+2;
// - a time-driven close (expiry, schedule timeout) is stamped on the same minute k in both
//   modes, but the backtest still looks at candle k-1 (a ping on k-1) while the live tick of
//   minute k expires before it monitors candle k-1.

const MIN = 60_000;
const SYMBOL = "BTCUSDT";
const T0 = Date.parse("2024-04-01T00:00:00Z");
const MINUTES = 220;
const minute = (timestamp) => (timestamp - T0) / MIN;

// the tape, by minute: 100 → 110 (20..40) → 95 (41..69), a low of 84 on 70, 100 again from 71,
// a low of 90 on 100 (touches the resting entry at 90), 106 on 110..130, 100 to the end
const candleAt = (m) => {
  if (m >= 20 && m <= 40) return { open: 110, high: 110, low: 110, close: 110 };
  if (m >= 41 && m <= 69) return { open: 95, high: 95, low: 95, close: 95 };
  if (m === 70) return { open: 95, high: 95, low: 84, close: 95 };
  if (m === 100) return { open: 100, high: 100, low: 90, close: 100 };
  if (m >= 110 && m <= 130) return { open: 106, high: 106, low: 106, close: 106 };
  return { open: 100, high: 100, low: 100, close: 100 };
};

const MARKET = { position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: 600 };
const RESTING = { position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: 600 };
const SHORT_HOLD = { ...MARKET, minuteEstimatedTime: 20 };

/** The command script: channel + candle minute → command issued through the mode's class-level API */
const SCRIPT = [
  { channel: "idle", at: 2, run: (api, ctx) => api.commitCreateSignal(SYMBOL, ctx, MARKET) },
  { channel: "active", at: 30, run: async (api, ctx, event) => {
    await api.commitPartialProfit(SYMBOL, 10, event.currentPrice, ctx);
    await api.commitDividend(SYMBOL, event.currentPrice, ctx, { amount: 1, note: "parity" });
  } },
  { channel: "active", at: 35, run: (api, ctx, event) => api.commitTrailingStop(SYMBOL, -5, event.currentPrice, ctx) },
  { channel: "idle", at: 80, run: (api, ctx) => api.commitCreateSignal(SYMBOL, ctx, RESTING) },
  { channel: "idle", at: 140, run: (api, ctx) => api.commitCreateSignal(SYMBOL, ctx, RESTING) },
  { channel: "schedule", at: 150, run: (api, ctx) => api.commitCancelScheduled(SYMBOL, ctx) },
  { channel: "idle", at: 160, run: (api, ctx) => api.commitCreateSignal(SYMBOL, ctx, SHORT_HOLD) },
];

const round = (value) => Math.round(value * 100) / 100;

/**
 * Subscribes every observable channel for `context`, logging `minute:tag` in emission order,
 * and runs the command script from the pings: a step keyed on candle m fires from the backtest
 * ping of minute m and from the live ping of minute m+1 (`lag`). Returns the log and the
 * unsubscribe list.
 */
const observe = (api, context, lag) => {
  const log = [];
  const done = new Set();
  const push = (timestamp, tag) => log.push(`${minute(timestamp)}:${tag}`);
  const script = (channel) => async (event) => {
    const at = minute(event.timestamp) - (channel === "idle" ? 0 : lag);
    for (const step of SCRIPT) {
      const key = `${step.channel}@${step.at}`;
      if (step.channel !== channel || step.at !== at || done.has(key)) continue;
      done.add(key);
      await step.run(api, context, event);
    }
  };
  const ownData = (event) => event.data.strategyName === context.strategyName;
  const own = (event) => event.strategyName === context.strategyName;
  const unsubscribe = [
    listenIdlePing(async (event) => { if (!own(event)) return; push(event.timestamp, "idle"); await script("idle")(event); }),
    listenActivePing(async (event) => { if (!ownData(event)) return; push(event.timestamp, "ping"); await script("active")(event); }),
    listenSchedulePing(async (event) => { if (!ownData(event)) return; push(event.timestamp, "sched"); await script("schedule")(event); }),
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

const makeExchange = (exchangeName, shift) => addExchangeSchema({
  exchangeName,
  getCandles: async (_symbol, candleInterval, since, limit) => {
    if (candleInterval !== "1m") throw new Error(`parity exchange: only 1m bars, got ${candleInterval}`);
    const out = [];
    let timestamp = Math.floor(since.getTime() / MIN) * MIN;
    while (out.length < limit) {
      out.push({ timestamp, volume: 1_000, ...candleAt(minute(timestamp) + shift) });
      timestamp += MIN;
    }
    return out;
  },
  formatPrice: async (_s, p) => p.toFixed(8),
  formatQuantity: async (_s, q) => q.toFixed(8),
});

const runBacktestMode = async () => {
  const context = { strategyName: "parity-backtest-strategy", exchangeName: "parity-backtest-exchange", frameName: "parity-backtest-frame" };
  makeExchange(context.exchangeName, 0);
  addStrategySchema({ strategyName: context.strategyName, interval: "1m", getSignal: async () => null });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1m", watchInterval: "1m", startDate: new Date(T0), endDate: new Date(T0 + MINUTES * MIN) });
  const { log, unsubscribe, result } = observe(Backtest, context, 0);
  try {
    for await (const r of Backtest.run(SYMBOL, context)) result(r);
  } finally {
    unsubscribe.forEach((un) => un());
  }
  return log;
};

const runLiveMode = async () => {
  const context = { strategyName: "parity-live-strategy", exchangeName: "binance-parity-live", frameName: "" };
  makeExchange(context.exchangeName, 0);
  addStrategySchema({ strategyName: context.strategyName, interval: "1m", getSignal: async () => null });
  const { log, unsubscribe, result } = observe(Live, context, 1);
  try {
    const runTick = (when) => MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick(SYMBOL, when, false, context),
      context,
    );
    // the backtest frame end is inclusive: one entry step on MINUTES itself
    for (let m = 0; m <= MINUTES; m++) result(await runTick(new Date(T0 + m * MIN)));
  } finally {
    unsubscribe.forEach((un) => un());
  }
  return log;
};

// idle-driven entries keep their minute; time-driven closes keep theirs (see the known gap);
// every monitoring entry of live is one minute later than the backtest's and is mapped back
const SAME_MINUTE = (tag) => tag === "idle" || tag.startsWith("scheduled:") || tag === "opened:100" || tag === "closed:time_expired:100" || tag.startsWith("cancelled:timeout");
const mapLive = (entry) => {
  const [m, ...rest] = entry.split(":");
  const tag = rest.join(":");
  return `${SAME_MINUTE(tag) ? Number(m) : Number(m) - 1}:${tag}`;
};
const TIME_DRIVEN = (tag) => tag.startsWith("closed:time_expired") || tag.startsWith("cancelled:timeout");
/** Backtest entries that have no live counterpart by construction (see the header) */
const knownGaps = (backtestLog) => {
  const gaps = [];
  for (const entry of backtestLog) {
    const [m, ...rest] = entry.split(":");
    const tag = rest.join(":");
    const k = Number(m);
    if (tag.startsWith("closed:") || tag.startsWith("cancelled:")) {
      if (TIME_DRIVEN(tag)) gaps.push(`${k - 1}:ping`, `${k - 1}:sched`);
      else gaps.push(`${k + 1}:idle`);
    }
  }
  return gaps;
};

const EXPECTED_MARKS = [
  "2:opened:100", "30:commit:partial-profit", "30:commit:dividend", "35:commit:trailing-stop", "70:closed:stop_loss:90",
  "80:scheduled:90", "100:opened:90", "114:closed:take_profit:105",
  "140:scheduled:90", "151:cancelled:user",
  "160:opened:100", "180:closed:time_expired:100",
];

test("MODE PARITY: one tape and one command script give the same event log, minute by minute and in order, through the backtest replay and through live ticks", async ({ pass, fail }) => {
  const backtestRaw = await runBacktestMode();
  const liveRaw = await runLiveMode();
  const missing = EXPECTED_MARKS.filter((mark) => !backtestRaw.includes(mark));
  if (missing.length) return fail(`the backtest log lacks the expected marks ${missing.join(", ")} — got ${backtestRaw.filter((e) => !/:(idle|ping|sched)$/.test(e)).join(", ")}`);
  const gaps = knownGaps(backtestRaw);
  // stable by minute: the backtest generator yields an activation's "opened" result only after
  // the replay of the window that follows it, so the entry stamped 100 lands late in the raw log
  const byMinute = (log) => log.map((entry, i) => [Number(entry.split(":")[0]), i, entry]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , entry]) => entry);
  const backtestLog = byMinute(backtestRaw.filter((entry) => !gaps.includes(entry)));
  const liveLog = byMinute(liveRaw.map(mapLive));
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
  pass(`${backtestLog.length} identical entries (${gaps.filter((g) => backtestRaw.includes(g)).length} known gaps: ${gaps.filter((g) => backtestRaw.includes(g)).join(", ")}): ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}; marks ${EXPECTED_MARKS.join(" ")}`);
});

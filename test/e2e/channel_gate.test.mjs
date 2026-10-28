import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Live,
  lib,
  listenActivePing,
  listenSchedulePing,
  listenPartialProfitAvailable,
  listenPartialLossAvailable,
  listenBreakevenAvailable,
  listenHighestProfit,
  listenMaxDrawdown,
  listenStrategyCommit,
  MethodContextService,
} from "../../build/index.mjs";

// The position channels (active ping, partial profit / loss, breakeven, highest profit, max
// drawdown, strategy commit) are gated on hasPendingSignal at delivery, the schedule ping on
// hasScheduledSignal, and both count a signal as present while a deferred change still holds it.
// Listeners are served one after another, so a command issued by an earlier listener of the
// same ping changes what a later one sees: a close or a cancel from listener A moves the signal
// into its deferred slot before listener B's turn — B still gets the ping, because the signal
// counts as present until the next tick drains the slot; the channel stops after that tick.

const MIN = 60_000;
const SYMBOL = "BTCUSDT";

/** What the public API says about the strategy right now */
const probe = async (api, context) => {
  const s = await api.getStrategyStatus(SYMBOL, context);
  return {
    hasPending: !(await api.hasNoPendingSignal(SYMBOL, context)),
    hasScheduled: !(await api.hasNoScheduledSignal(SYMBOL, context)),
    pending: s.pendingSignalId,
    closed: s.closedSignal?.id ?? null,
    cancelled: s.cancelledSignal?.id ?? null,
  };
};

const makeExchange = (exchangeName, priceAt) => addExchangeSchema({
  exchangeName,
  getCandles: async (_symbol, candleInterval, since, limit) => {
    if (candleInterval !== "1m") throw new Error(`channel gate exchange: only 1m bars, got ${candleInterval}`);
    const out = [];
    let timestamp = Math.floor(since.getTime() / MIN) * MIN;
    while (out.length < limit) {
      const price = priceAt(timestamp);
      out.push({ timestamp, open: price, high: price, low: price, close: price, volume: 1_000 });
      timestamp += MIN;
    }
    return out;
  },
  formatPrice: async (_s, p) => p.toFixed(8),
  formatQuantity: async (_s, q) => q.toFixed(8),
});

const marketLong = () => ({ position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: 600 });
const restingLong = () => ({ position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: 600 });

/**
 * Live harness: manual ticks one minute apart, a strategy whose getSignal returns `signal`
 * once, `priceAt(minute)` shaping the tape. `listeners(context, minute)` subscribes and returns
 * the unsubscribe functions.
 */
const runLive = async (name, { signal, ticks, priceAt = () => 100, listeners }) => {
  const t0 = Date.parse("2024-01-01T00:00:00Z");
  const minute = (timestamp) => (timestamp - t0) / MIN;
  const context = { strategyName: `channel-gate-${name}-strategy`, exchangeName: `binance-channel-gate-${name}`, frameName: "" };
  makeExchange(context.exchangeName, (timestamp) => priceAt(minute(timestamp)));
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return signal;
    },
  });
  const unsubscribe = listeners(context, minute);
  const actions = [];
  let openedId = null;
  try {
    const runTick = (when) => MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick(SYMBOL, when, false, context),
      context,
    );
    for (let k = 0; k < ticks; k++) {
      const result = await runTick(new Date(t0 + k * MIN));
      actions.push(result.action);
      if (result.action === "opened") openedId = result.signal.id;
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  return { actions, openedId };
};

/** A listener of channel `listen` that records `{ at, id, ...probe }` and may issue a command on minute `at` */
const recorder = (listen, context, minute, { at = null, command = null } = {}) => {
  const seen = [];
  const un = listen(async (event) => {
    if (event.data.strategyName !== context.strategyName) return;
    seen.push({ at: minute(event.timestamp), id: event.data.id, ...(await probe(Live, context)) });
    if (command && minute(event.timestamp) === at) await command(event);
  });
  return { seen, un };
};

test("CHANNEL GATE: a close issued by listener A from the active ping still reaches listener B on that ping — the position counts as pending while its close waits for the drain — and the channel stops after the next tick", async ({ pass, fail }) => {
  let A, B;
  const r = await runLive("active-close", {
    signal: marketLong(),
    ticks: 5,
    listeners: (context, minute) => {
      A = recorder(listenActivePing, context, minute, { at: 2, command: () => Live.commitClosePending(SYMBOL, context) });
      B = recorder(listenActivePing, context, minute);
      return [A.un, B.un];
    },
  });
  if (r.actions.join(",") !== "opened,active,active,closed,idle") return fail(`expected opened,active,active,closed,idle, got ${r.actions.join(",")}`);
  if (A.seen.map((s) => s.at).join(",") !== "1,2" || B.seen.map((s) => s.at).join(",") !== "1,2") return fail(`both listeners must get the pings of minutes 1 and 2 and nothing after the close, got A ${JSON.stringify(A.seen)} B ${JSON.stringify(B.seen)}`);
  if ([...A.seen, ...B.seen].some((s) => s.id !== r.openedId || !s.hasPending)) return fail(`every delivery must carry "${r.openedId}" as a pending position, got ${JSON.stringify({ A: A.seen, B: B.seen })}`);
  const late = B.seen[1];
  if (late.pending !== null || late.closed !== r.openedId) return fail(`B's delivery of minute 2 must see the position already in the close slot (no pending slot, closedSignal "${r.openedId}"), got ${JSON.stringify(late)}`);
  pass(`ticks ${r.actions.join(",")}: A and B got minutes 1,2; B's minute 2 saw "${r.openedId}" in the close slot and still pending; nothing after the close`);
});

test("CHANNEL GATE: a cancel issued by listener A from the schedule ping still reaches listener B on that ping — the entry counts as scheduled while its cancel waits for the drain — and the channel stops after the next tick", async ({ pass, fail }) => {
  let A, B;
  const r = await runLive("schedule-cancel", {
    signal: restingLong(),
    ticks: 5,
    listeners: (context, minute) => {
      A = recorder(listenSchedulePing, context, minute, { at: 2, command: () => Live.commitCancelScheduled(SYMBOL, context) });
      B = recorder(listenSchedulePing, context, minute);
      return [A.un, B.un];
    },
  });
  if (r.actions.join(",") !== "scheduled,waiting,waiting,cancelled,idle") return fail(`expected scheduled,waiting,waiting,cancelled,idle, got ${r.actions.join(",")}`);
  if (A.seen.map((s) => s.at).join(",") !== "1,2" || B.seen.map((s) => s.at).join(",") !== "1,2") return fail(`both listeners must get the pings of minutes 1 and 2 and nothing after the cancel, got A ${JSON.stringify(A.seen)} B ${JSON.stringify(B.seen)}`);
  const entryId = A.seen[0]?.id;
  if (!entryId || [...A.seen, ...B.seen].some((s) => s.id !== entryId || !s.hasScheduled || s.hasPending)) return fail(`every delivery must carry "${entryId}" as a scheduled entry, got ${JSON.stringify({ A: A.seen, B: B.seen })}`);
  const late = B.seen[1];
  if (late.cancelled !== entryId) return fail(`B's delivery of minute 2 must see the entry already in the cancel slot (cancelledSignal "${entryId}"), got ${JSON.stringify(late)}`);
  pass(`ticks ${r.actions.join(",")}: A and B got minutes 1,2; B's minute 2 saw "${entryId}" in the cancel slot and still scheduled; nothing after the cancel`);
});

test("CHANNEL GATE: a partial profit queued from the active ping right before a user close from the same ping is still delivered — the position counts as pending while it sits in the close slot", async ({ pass, fail }) => {
  const commits = [];
  const r = await runLive("commit-close", {
    signal: marketLong(),
    ticks: 5,
    // 100 up to the open, 110 from minute 0 on: the ping of minute 1 is in profit
    priceAt: (m) => (m >= 0 ? 110 : 100),
    listeners: (context, minute) => [
      listenActivePing(async (event) => {
        if (event.data.strategyName !== context.strategyName || minute(event.timestamp) !== 1) return;
        await Live.commitPartialProfit(SYMBOL, 30, event.currentPrice, context);
        await Live.commitClosePending(SYMBOL, context);
      }),
      listenStrategyCommit(async (event) => {
        if (event.strategyName !== context.strategyName) return;
        commits.push({ action: event.action, at: minute(event.timestamp), id: event.signalId, ...(await probe(Live, context)) });
      }),
    ],
  });
  if (!r.actions.includes("closed")) return fail(`expected the deferred close to land, got ${r.actions.join(",")}`);
  const partial = commits.find((c) => c.action === "partial-profit");
  const close = commits.find((c) => c.action === "close-pending");
  if (!partial || partial.id !== r.openedId) return fail(`the partial-profit commit must be delivered for "${r.openedId}", got ${JSON.stringify(commits)}`);
  if (partial.pending !== null || partial.closed !== r.openedId || !partial.hasPending) return fail(`at its delivery the position must sit in the close slot and still count as pending, got ${JSON.stringify(partial)}`);
  if (!close || close.id !== r.openedId) return fail(`the close-pending commit must be delivered for "${r.openedId}", got ${JSON.stringify(commits)}`);
  pass(`ticks ${r.actions.join(",")}: commits ${commits.map((c) => `${c.action}@${c.at}`).join(", ")} — the partial reached the subscriber while "${r.openedId}" sat in the close slot`);
});

test("CHANNEL GATE: over a backtest lifecycle every level channel is delivered with its own signal as the pending position", async ({ pass, fail }) => {
  const FRAME_START = Date.parse("2024-02-01T00:00:00Z");
  const minute = (timestamp) => (timestamp - FRAME_START) / MIN;
  const context = { strategyName: "channel-gate-levels-strategy", exchangeName: "channel-gate-levels-exchange", frameName: "channel-gate-levels-frame" };
  // 100, a dip to 92 on 20..29 (loss levels, drawdown), 112 from 40 on (profit levels, breakeven, highest profit), the take at 119 never reached: expiry at 90
  makeExchange(context.exchangeName, (timestamp) => {
    const m = minute(timestamp);
    if (m >= 20 && m <= 29) return 92;
    if (m >= 40) return 112;
    return 100;
  });
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { ...marketLong(), minuteEstimatedTime: 90 };
    },
  });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1m", watchInterval: "1m", startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + 120 * MIN) });
  const channels = {
    active: { listen: listenActivePing, id: (e) => e.data.id, seen: [] },
    partialProfit: { listen: listenPartialProfitAvailable, id: (e) => e.data.id, seen: [] },
    partialLoss: { listen: listenPartialLossAvailable, id: (e) => e.data.id, seen: [] },
    breakeven: { listen: listenBreakevenAvailable, id: (e) => e.data.id, seen: [] },
    highestProfit: { listen: listenHighestProfit, id: (e) => e.signal.id, seen: [] },
    maxDrawdown: { listen: listenMaxDrawdown, id: (e) => e.signal.id, seen: [] },
  };
  const unsubscribe = Object.values(channels).map((ch) => ch.listen(async (event) => {
    if ((event.data?.strategyName ?? event.strategyName) !== context.strategyName) return;
    ch.seen.push({ at: minute(event.timestamp), id: ch.id(event), ...(await probe(Backtest, context)) });
  }));
  const life = { id: null, closedAt: null, reason: null };
  try {
    for await (const result of Backtest.run(SYMBOL, context)) {
      if (result.action === "opened") life.id = result.signal.id;
      if (result.action === "closed") { life.closedAt = minute(result.closeTimestamp); life.reason = result.closeReason; }
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  if (!life.id || life.reason !== "time_expired") return fail(`expected the position to expire, got ${JSON.stringify(life)}`);
  const report = [];
  for (const [name, ch] of Object.entries(channels)) {
    if (ch.seen.length === 0) return fail(`the ${name} channel never fired on this tape (dip to 92, rise to 112) — nothing to check`);
    const wrong = ch.seen.find((s) => s.id !== life.id || s.pending !== life.id || !s.hasPending || s.at > life.closedAt);
    if (wrong) return fail(`${name}: every delivery must carry "${life.id}" as the pending position inside its life, got ${JSON.stringify(wrong)}`);
    report.push(`${name} ${ch.seen.length}`);
  }
  pass(`"${life.id}" expired@${life.closedAt}: ${report.join(", ")} deliveries, each with its own signal pending`);
});

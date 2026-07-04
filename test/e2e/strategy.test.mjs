import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Broker,
  listenStrategyCommit,
  listenSync,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

const makeExchange = (exchangeName, getPrice) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const price = getPrice(alignedSince + i * 60000);
        candles.push({
          timestamp: alignedSince + i * 60000,
          open: price,
          high: price + 50,
          low: price - 50,
          close: price,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });
};

const makeRunTick = (context) => (when) =>
  MethodContextService.runInContext(
    async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
    context,
  );

/**
 * STRATEGY LIVE #1: createSignal (deferred DTO) потребляется следующим tick
 * вместо getSignal, проходит стандартный пайплайн (broker openCommit type
 * "active" + pendingOpen), а busy-guard отвергает второй createSignal при
 * живой позиции.
 */
test("STRATEGY LIVE: createSignal drains through the full open pipeline, busy-guard rejects a second one", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "strategy-create-signal-strategy",
    exchangeName: "binance-strategy-create-signal",
    frameName: "",
  };

  const brokerCalls = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    // getSignal молчит — сигнал приходит ТОЛЬКО через createSignal
    getSignal: async () => null,
  });

  Broker.useBrokerAdapter({
    onSignalOpenCommit: async (p) => brokerCalls.push({ m: "openCommit", type: p.type }),
    onSignalPendingOpen: async (p) => brokerCalls.push({ m: "pendingOpen", signalId: p.signalId }),
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    // tick #1: getSignal → null → idle
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (getSignal returns null), got "${tick1.action}"`);
      return;
    }

    // Пользователь ставит DTO в очередь (out-of-context)
    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.createSignal(false, "BTCUSDT", {
        position: "long",
        note: "user created signal",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 120,
      }, context),
      context,
    );

    // tick #2: _userSignal потреблён вместо getSignal → opened
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (queued DTO consumed), got "${tick2.action}"`);
      return;
    }
    if (tick2.signal.note !== "user created signal") {
      fail(`opened note expected "user created signal", got "${tick2.signal.note}"`);
      return;
    }

    // Busy-guard: второй createSignal при живой позиции обязан бросить
    let threw = false;
    try {
      await MethodContextService.runInContext(
        async () => await lib.strategyCoreService.createSignal(false, "BTCUSDT", {
          position: "long",
          note: "second signal",
          priceTakeProfit: basePrice + 5000,
          priceStopLoss: basePrice - 5000,
          minuteEstimatedTime: 120,
        }, context),
        context,
      );
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      fail("REGRESSION: createSignal with a live pending signal must throw (busy-guard)");
      return;
    }

    const milestones = ["openCommit", "pendingOpen"];
    for (const m of milestones) {
      if (!brokerCalls.some((c) => c.m === m)) {
        fail(`broker adapter missed "${m}": ${JSON.stringify(brokerCalls)}`);
        return;
      }
    }
    if (!brokerCalls.some((c) => c.m === "openCommit" && c.type === "active")) {
      fail(`openCommit must carry type "active": ${JSON.stringify(brokerCalls)}`);
      return;
    }

    pass(`createSignal opened via full pipeline (broker notified), busy-guard threw`);
  } finally {
    Broker.disable();
  }
});

/**
 * STRATEGY LIVE #2: closePending — sync-close гейт отвергает первую попытку,
 * _closedSignal НЕ теряется и закрытие ретраится на следующем tick.
 */
test("STRATEGY LIVE: rejected user close is retried on the next tick until the broker confirms", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "strategy-close-retry-strategy",
    exchangeName: "binance-strategy-close-retry",
    frameName: "",
  };

  let signalGenerated = false;
  let syncCloseCalls = 0;

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "strategy close retry",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribeSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close" || event.type !== "active") return;
    syncCloseCalls += 1;
    if (syncCloseCalls === 1) {
      throw new Error("strategy: broker rejected the close order");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Пользователь закрывает позицию (out-of-context)
    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.closePending(false, "BTCUSDT", context, { id: "close-op-1" }),
      context,
    );

    // tick #2: sync-close отвергнут → idle, _closedSignal сохранён
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "idle") {
      fail(`tick #2 expected "idle" (close rejected, kept for retry), got "${tick2.action}"`);
      return;
    }

    // tick #3: ретрай → закрыто
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "closed") {
      fail(`tick #3 expected closed/"closed" (retry succeeded), got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }
    if (tick3.closeId !== "close-op-1") {
      fail(`closed result must carry closeId "close-op-1", got "${tick3.closeId}"`);
      return;
    }

    if (syncCloseCalls !== 2) {
      fail(`expected exactly 2 sync-close attempts (reject + accept), got ${syncCloseCalls}`);
      return;
    }

    pass(`user close retried after broker rejection: idle → closed/"closed" (syncCloseCalls=${syncCloseCalls})`);
  } finally {
    unsubscribeSync();
  }
});

/**
 * STRATEGY LIVE #3: activateScheduled — пользовательская активация без касания
 * priceOpen: коммит "activate-scheduled" с activateId, вход по priceOpen
 * (цена филла лимитника), broker получает openCommit "active" + pendingOpen.
 */
test("STRATEGY LIVE: activateScheduled opens at priceOpen with activate-scheduled commit", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "strategy-activate-strategy",
    exchangeName: "binance-strategy-activate",
    frameName: "",
  };

  let signalGenerated = false;
  const commits = [];
  const brokerCalls = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "strategy activate",
        priceOpen,
        priceTakeProfit: priceOpen + 15000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push({ action: event.action, activateId: event.activateId });
  });

  Broker.useBrokerAdapter({
    onSignalOpenCommit: async (p) => brokerCalls.push({ m: "openCommit", type: p.type }),
    onSignalPendingOpen: async (p) => brokerCalls.push({ m: "pendingOpen" }),
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    // Пользователь форсирует активацию (цена рынка 50000, priceOpen не касалась)
    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.activateScheduled(false, "BTCUSDT", context, { id: "activate-op-1" }),
      context,
    );

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (user activation drained), got "${tick2.action}"`);
      return;
    }
    // Семантика: активация = биржа исполнила НАШ resting-ордер → базис входа = priceOpen
    if (tick2.signal.priceOpen !== priceOpen) {
      fail(`entry basis expected ${priceOpen} (limit fill price), got ${tick2.signal.priceOpen}`);
      return;
    }

    const activateCommit = commits.find((c) => c.action === "activate-scheduled");
    if (!activateCommit || activateCommit.activateId !== "activate-op-1") {
      fail(`expected "activate-scheduled" commit with activateId "activate-op-1", got ${JSON.stringify(commits)}`);
      return;
    }

    if (!brokerCalls.some((c) => c.m === "openCommit" && c.type === "active") || !brokerCalls.some((c) => c.m === "pendingOpen")) {
      fail(`broker adapter must receive openCommit("active") + pendingOpen: ${JSON.stringify(brokerCalls)}`);
      return;
    }

    pass(`activateScheduled opened at priceOpen=${priceOpen}, commit + broker notified`);
  } finally {
    Broker.disable();
    unsubscribeCommit();
  }
});

/**
 * STRATEGY LIVE #4: cancelScheduled — отложенная отмена дренится следующим tick:
 * результат cancelled/user с cancelId, commit "cancel-scheduled" с note,
 * broker получает onSignalScheduleCancelled.
 */
test("STRATEGY LIVE: cancelScheduled drains with cancelId/note and notifies the broker", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "strategy-cancel-strategy",
    exchangeName: "binance-strategy-cancel",
    frameName: "",
  };

  let signalGenerated = false;
  const commits = [];
  const brokerCancels = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "strategy cancel",
        priceOpen,
        priceTakeProfit: priceOpen + 15000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "cancel-scheduled") return;
    commits.push({ cancelId: event.cancelId, note: event.note });
  });

  Broker.useBrokerAdapter({
    onSignalScheduleCancelled: async (p) => brokerCancels.push({ reason: p.reason, signalId: p.signalId }),
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }
    const scheduledId = tick1.signal.id;

    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.cancelScheduled(false, "BTCUSDT", context, {
        id: "cancel-op-1",
        note: "user cancel note",
      }),
      context,
    );

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "cancelled" || tick2.reason !== "user") {
      fail(`tick #2 expected cancelled/user, got "${tick2.action}"/"${tick2.reason}"`);
      return;
    }
    if (tick2.cancelId !== "cancel-op-1") {
      fail(`cancelled result must carry cancelId "cancel-op-1", got "${tick2.cancelId}"`);
      return;
    }

    if (commits.length !== 1 || commits[0].cancelId !== "cancel-op-1" || commits[0].note !== "user cancel note") {
      fail(`expected 1 cancel-scheduled commit with id+note, got ${JSON.stringify(commits)}`);
      return;
    }
    if (brokerCancels.length !== 1 || brokerCancels[0].reason !== "user" || brokerCancels[0].signalId !== scheduledId) {
      fail(`broker must receive 1 scheduleCancelled(user, ${scheduledId}), got ${JSON.stringify(brokerCancels)}`);
      return;
    }

    pass(`cancelScheduled drained: cancelled/user + commit(note) + broker scheduleCancelled`);
  } finally {
    Broker.disable();
    unsubscribeCommit();
  }
});

/**
 * STRATEGY LIVE #5: createTakeProfit / createStopLoss — broker-confirmed филлы
 * закрывают позицию ПО ЭФФЕКТИВНОМУ уровню TP/SL, минуя VWAP-проверку
 * (рынок не двигался — обычный мониторинг закрытия бы не дал).
 */
test("STRATEGY LIVE: broker-confirmed TP/SL fills close at effective levels bypassing VWAP", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "strategy-fill-strategy",
    exchangeName: "binance-strategy-fill",
    frameName: "",
  };

  const TP = basePrice + 5000;
  const SL = basePrice - 5000;
  let signalsIssued = 0;
  const brokerCloses = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalsIssued >= 2) return null;
      signalsIssued += 1;
      return {
        position: "long",
        note: `strategy fill #${signalsIssued}`,
        priceTakeProfit: TP,
        priceStopLoss: SL,
        minuteEstimatedTime: 120,
      };
    },
  });

  Broker.useBrokerAdapter({
    onSignalPendingClose: async (p) => brokerCloses.push({ closeReason: p.closeReason }),
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    // Фаза TP: открытие → createTakeProfit → закрытие по 55000 при рынке 50000
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.createTakeProfit(false, "BTCUSDT", context, { id: "tp-fill-1" }),
      context,
    );

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "take_profit") {
      fail(`tick #2 expected closed/take_profit, got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (tick2.currentPrice !== TP) {
      fail(`REGRESSION: TP fill must close at effective TP ${TP} (market stayed at ${basePrice}), got ${tick2.currentPrice}`);
      return;
    }

    // Фаза SL: новая позиция → createStopLoss → закрытие по 45000 при рынке 50000
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "opened") {
      fail(`tick #3 expected "opened" (second signal), got "${tick3.action}"`);
      return;
    }

    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.createStopLoss(false, "BTCUSDT", context, { id: "sl-fill-1" }),
      context,
    );

    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "stop_loss") {
      fail(`tick #4 expected closed/stop_loss, got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }
    if (tick4.currentPrice !== SL) {
      fail(`REGRESSION: SL fill must close at effective SL ${SL} (market stayed at ${basePrice}), got ${tick4.currentPrice}`);
      return;
    }

    if (JSON.stringify(brokerCloses.map((c) => c.closeReason)) !== JSON.stringify(["take_profit", "stop_loss"])) {
      fail(`broker pendingClose reasons expected [take_profit, stop_loss], got ${JSON.stringify(brokerCloses)}`);
      return;
    }

    pass(`broker-confirmed fills closed at TP=${TP} and SL=${SL} while market never moved from ${basePrice}`);
  } finally {
    Broker.disable();
  }
});

/**
 * STRATEGY BACKTEST #1: cancelScheduled ИЗ onSchedulePing-коллбека — отложенная
 * отмена детектится свечным циклом и завершает сигнал cancelled/user с cancelId.
 */
test("STRATEGY BACKTEST: cancelScheduled from onSchedulePing cancels mid-frame with cancelId", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;

  const context = {
    strategyName: "strategy-bt-cancel-strategy",
    exchangeName: "binance-strategy-bt-cancel",
    frameName: "30m-strategy-bt-cancel",
  };

  let signalGenerated = false;
  let pings = 0;

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "strategy bt cancel",
        priceOpen,
        priceTakeProfit: priceOpen + 15000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedulePing: async () => {
        pings += 1;
        if (pings === 3) {
          await MethodContextService.runInContext(
            async () => await lib.strategyCoreService.cancelScheduled(true, "BTCUSDT", context, { id: "bt-cancel-1" }),
            context,
          );
        }
      },
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const results = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    results.push(result);
  }

  const cancelled = results.find((r) => r.action === "cancelled");
  if (!cancelled) {
    fail(`expected a cancelled result, got ${JSON.stringify(results.map((r) => r.action))}`);
    return;
  }
  if (cancelled.reason !== "user" || cancelled.cancelId !== "bt-cancel-1") {
    fail(`cancelled expected reason=user cancelId=bt-cancel-1, got reason=${cancelled.reason} cancelId=${cancelled.cancelId}`);
    return;
  }
  if (pings < 3) {
    fail(`expected at least 3 schedule pings before cancel, got ${pings}`);
    return;
  }

  pass(`onSchedulePing cancel drained by candle loop: cancelled/user with cancelId (pings=${pings})`);
});

/**
 * STRATEGY BACKTEST #2: activateScheduled ИЗ onSchedulePing — цена НИКОГДА не
 * касается priceOpen, но пользовательская активация открывает позицию inline
 * (базис = priceOpen) и она доживает до time_expired.
 */
test("STRATEGY BACKTEST: activateScheduled from onSchedulePing opens inline without price touch", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;

  const context = {
    strategyName: "strategy-bt-activate-strategy",
    exchangeName: "binance-strategy-bt-activate",
    frameName: "30m-strategy-bt-activate",
  };

  let signalGenerated = false;
  let pings = 0;
  const commits = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "strategy bt activate",
        priceOpen,
        // TP выше рынка: вход по 40000 не должен закрыться мгновенным take_profit
        priceTakeProfit: priceOpen + 15000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 5,
      };
    },
    callbacks: {
      onSchedulePing: async () => {
        pings += 1;
        if (pings === 2) {
          await MethodContextService.runInContext(
            async () => await lib.strategyCoreService.activateScheduled(true, "BTCUSDT", context, { id: "bt-activate-1" }),
            context,
          );
        }
      },
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push({ action: event.action, activateId: event.activateId });
  });

  try {
    const results = [];
    for await (const result of Backtest.run("BTCUSDT", context)) {
      results.push(result);
    }

    const closed = results.find((r) => r.action === "closed");
    if (!closed || closed.closeReason !== "time_expired") {
      fail(`expected closed/time_expired, got ${JSON.stringify(results.map((r) => `${r.action}/${r.closeReason ?? r.reason ?? ""}`))}`);
      return;
    }
    // Базис входа = priceOpen лимитника, которого рынок не касался
    if (closed.signal.priceOpen !== priceOpen) {
      fail(`entry basis expected ${priceOpen}, got ${closed.signal.priceOpen}`);
      return;
    }

    const activateCommit = commits.find((c) => c.action === "activate-scheduled");
    if (!activateCommit || activateCommit.activateId !== "bt-activate-1") {
      fail(`expected activate-scheduled commit with activateId bt-activate-1, got ${JSON.stringify(commits)}`);
      return;
    }

    pass(`user activation opened inline at ${priceOpen} (market ${basePrice}) and closed time_expired`);
  } finally {
    unsubscribeCommit();
  }
});

/**
 * STRATEGY BACKTEST #3: createTakeProfit ИЗ onActivePing — broker-confirmed
 * TP-филл закрывает по ЭФФЕКТИВНОМУ TP, хотя VWAP до TP так и не дошёл.
 */
test("STRATEGY BACKTEST: createTakeProfit from onActivePing closes at effective TP bypassing VWAP", async ({ pass, fail }) => {
  const basePrice = 50000;
  const TP = basePrice + 10000;

  const context = {
    strategyName: "strategy-bt-tpfill-strategy",
    exchangeName: "binance-strategy-bt-tpfill",
    frameName: "30m-strategy-bt-tpfill",
  };

  let signalGenerated = false;
  let pings = 0;

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "strategy bt tp fill",
        priceTakeProfit: TP,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async () => {
        pings += 1;
        if (pings === 2) {
          await MethodContextService.runInContext(
            async () => await lib.strategyCoreService.createTakeProfit(true, "BTCUSDT", context, { id: "bt-tp-fill-1" }),
            context,
          );
        }
      },
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const results = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    results.push(result);
  }

  const closed = results.find((r) => r.action === "closed");
  if (!closed || closed.closeReason !== "take_profit") {
    fail(`expected closed/take_profit, got ${JSON.stringify(results.map((r) => `${r.action}/${r.closeReason ?? ""}`))}`);
    return;
  }
  if (closed.currentPrice !== TP) {
    fail(`REGRESSION: broker-confirmed fill must close at effective TP ${TP} (VWAP stayed at ~${basePrice}), got ${closed.currentPrice}`);
    return;
  }
  if (closed.closeId !== "bt-tp-fill-1") {
    fail(`closed result must carry closeId bt-tp-fill-1, got ${closed.closeId}`);
    return;
  }

  pass(`onActivePing TP fill closed at ${TP} while VWAP never left ${basePrice}`);
});

/**
 * STRATEGY BACKTEST #4: closePending ИЗ onActivePing — пользовательское закрытие
 * дренится свечным циклом с reason "closed" и closeId.
 */
test("STRATEGY BACKTEST: closePending from onActivePing closes mid-frame with closeId", async ({ pass, fail }) => {
  const basePrice = 50000;

  const context = {
    strategyName: "strategy-bt-close-strategy",
    exchangeName: "binance-strategy-bt-close",
    frameName: "30m-strategy-bt-close",
  };

  let signalGenerated = false;
  let pings = 0;

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "strategy bt close",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async () => {
        pings += 1;
        if (pings === 3) {
          await MethodContextService.runInContext(
            async () => await lib.strategyCoreService.closePending(true, "BTCUSDT", context, { id: "bt-close-1", note: "manual exit" }),
            context,
          );
        }
      },
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const results = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    results.push(result);
  }

  const closed = results.find((r) => r.action === "closed");
  if (!closed || closed.closeReason !== "closed") {
    fail(`expected closed/"closed", got ${JSON.stringify(results.map((r) => `${r.action}/${r.closeReason ?? ""}`))}`);
    return;
  }
  if (closed.closeId !== "bt-close-1") {
    fail(`closed result must carry closeId bt-close-1, got ${closed.closeId}`);
    return;
  }
  if (pings < 3) {
    fail(`expected at least 3 active pings before close, got ${pings}`);
    return;
  }

  pass(`onActivePing user close drained by candle loop: closed/"closed" with closeId (pings=${pings})`);
});

/**
 * STRATEGY BACKTEST #5: манкипатч onOrderSync — order-гейты становятся
 * наблюдаемыми И гейтящими в backtest.
 *
 * Штатно order-события в backtest НЕ эмитятся (short-circuit `event.backtest`
 * в CREATE_SYNC_FN до syncSubject). Рецепт обхода для тестов:
 * 1. di-kit: `lib.strategyConnectionService` — InstanceAccessor, реальный сервис
 *    лежит в его прототипе (внутренние вызовы this.getStrategy идут по нему);
 * 2. Backtest.run() fire-and-forget чистит мемоизацию стратегий — патчить
 *    конкретный инстанс бесполезно, оборачиваем САМ getStrategy (с сохранением
 *    memoize-API clear/has/values);
 * 3. обёртка подменяет params.onOrderSync на каждом выдаваемом инстансе.
 */
test("STRATEGY BACKTEST: monkey-patched onOrderSync observes and gates orders in backtest", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "strategy-bt-patch-strategy",
    exchangeName: "binance-strategy-bt-patch",
    frameName: "30m-strategy-bt-patch",
  };

  let issues = 0;

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MIN;
        const dip = timestamp >= t0 + 10 * MIN;
        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 100,
          low: dip ? priceOpen - 50 : basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      // Два выпуска: первое размещение отвергнет патченный гейт, второе — ретрай
      if (issues >= 2) return null;
      issues += 1;
      return {
        position: "long",
        note: "strategy bt patch",
        priceOpen,
        priceTakeProfit: priceOpen + 15000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 5,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  // === МАНКИПАТЧ (см. докстринг теста) ===
  const orderEvents = [];
  let placementRejected = false;
  {
    const realService = Object.getPrototypeOf(lib.strategyConnectionService);
    const originalGetStrategy = realService.getStrategy;
    const wrapped = (...args) => {
      const strategy = originalGetStrategy(...args);
      if (!strategy.__orderPatched) {
        strategy.__orderPatched = true;
        const original = strategy.params.onOrderSync;
        strategy.params.onOrderSync = async (event) => {
          orderEvents.push(`${event.action}/${event.type}`);
          if (event.action === "signal-open" && event.type === "schedule" && !placementRejected) {
            placementRejected = true;
            return false; // гейт: первое размещение отвергнуто
          }
          return await original(event);
        };
      }
      return strategy;
    };
    wrapped.clear = originalGetStrategy.clear;
    wrapped.has = originalGetStrategy.has;
    wrapped.values = originalGetStrategy.values;
    realService.getStrategy = wrapped;
  }

  const results = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    results.push(`${result.action}${result.closeReason ? `/${result.closeReason}` : ""}`);
  }

  if (!results.includes("closed/time_expired")) {
    fail(`expected closed/time_expired in results, got ${JSON.stringify(results)}`);
    return;
  }

  const expected = [
    "signal-open/schedule", // размещение #1 — отвергнуто патчем
    "signal-open/schedule", // размещение #2 — ретрай, принято
    "signal-open/active",   // филл wick-активации
    "signal-close/active",  // закрытие time_expired
  ];
  if (JSON.stringify(orderEvents) !== JSON.stringify(expected)) {
    fail(`order events mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(orderEvents)}`);
    return;
  }
  if (issues !== 2) {
    fail(`expected 2 signal issues (reject + retry), got ${issues}`);
    return;
  }

  pass(`patched onOrderSync observed full order lifecycle in backtest and gated the first placement: ${orderEvents.join(" → ")}`);
});

/**
 * STRATEGY LIVE #6: check закрывает позицию на ПЯТОЙ проверке после активации.
 *
 * Scheduled → активация по цене → 4 тика мониторинга с успешным order-check
 * (type "active") → на 5-й проверке listenCheck бросает («ордер исчез с биржи»)
 * → закрытие closed/"closed" тем же tick'ом. Проверяет, что успешные check'и
 * НЕ мешают мониторингу (позиция живёт), а счёт проверок точный.
 */
test("STRATEGY LIVE: active order-check closes the position on the fifth check after activation", async ({ pass, fail }) => {
  const { listenCheck } = await import("../../build/index.mjs");
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "strategy-check-fifth-strategy",
    exchangeName: "binance-strategy-check-fifth",
    frameName: "",
  };

  let marketPrice = basePrice;
  let signalGenerated = false;
  let scheduleChecks = 0;
  let activeChecks = 0;

  makeExchange(context.exchangeName, () => marketPrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "strategy check fifth",
        priceOpen,
        // TP выше рынка, SL ниже активации — мониторинг сам не закроет
        priceTakeProfit: priceOpen + 15000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribeCheck = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.type === "schedule") {
      scheduleChecks += 1;
      return; // resting-ордер на месте
    }
    activeChecks += 1;
    if (activeChecks === 5) {
      throw new Error("strategy: order vanished on the fifth check");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    // tick #1: создание scheduled (рынок выше priceOpen)
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }
    const signalId = tick1.signal.id;

    // tick #2: цена коснулась priceOpen → schedule-check прошёл → активация
    marketPrice = priceOpen;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (activation), got "${tick2.action}"`);
      return;
    }

    // tick #3..#6: мониторинг, check'и #1..#4 успешны — позиция живёт
    for (let i = 1; i <= 4; i++) {
      const tick = await runTick(new Date(t0 + (1 + i) * MIN));
      if (tick.action !== "active") {
        fail(`tick #${2 + i} expected "active" (check #${i} passed), got "${tick.action}"`);
        return;
      }
      if (activeChecks !== i) {
        fail(`after tick #${2 + i} expected ${i} active checks, got ${activeChecks}`);
        return;
      }
    }

    // tick #7: check #5 бросает → закрытие closed/"closed" этим же tick'ом
    const tick7 = await runTick(new Date(t0 + 6 * MIN));
    if (tick7.action !== "closed" || tick7.closeReason !== "closed") {
      fail(`tick #7 expected closed/"closed" (fifth check failed), got "${tick7.action}"/"${tick7.closeReason}"`);
      return;
    }
    if (tick7.signal.id !== signalId) {
      fail(`closed signal id mismatch: expected ${signalId}, got ${tick7.signal.id}`);
      return;
    }

    if (activeChecks !== 5 || scheduleChecks !== 1) {
      fail(`check counts mismatch: active=${activeChecks} (expected 5), schedule=${scheduleChecks} (expected 1)`);
      return;
    }

    pass(`position survived 4 checks and was closed by the 5th: scheduled → opened → active×4 → closed/"closed"`);
  } finally {
    unsubscribeCheck();
  }
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addActionSchema,
  setConfig,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  listenSyncOnce,
  listenCheckOnce,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Дозакрытие пробелов: onOrderSync через Action-колбэк, таймаут getSignal,
// одноразовость Once-слушателей, Infinity через JSON-restore.

const MIN = 60_000;

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
        const price = getPrice();
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: price,
          high: price,
          low: price,
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
 * HARDENING: onOrderSync через Action-колбэк — второй санкционированный
 * гейт-канал (наравне с Broker-адаптером): throw на первом активном открытии →
 * откат троттла → ретрай следующим tick внутри того же "1h"-интервала.
 */
test("HARDENING: action callbacks.onOrderSync gates the open with next-tick retry", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "hardening-ordersync-strategy",
    exchangeName: "binance-hardening-ordersync",
    frameName: "",
  };

  let syncCalls = 0;

  makeExchange(context.exchangeName, () => basePrice);

  class EmptyAction {}
  addActionSchema({
    actionName: "hardening-ordersync-action",
    handler: EmptyAction,
    callbacks: {
      onOrderSync: (event) => {
        if (event.action !== "signal-open" || event.type !== "active") return;
        syncCalls += 1;
        if (syncCalls === 1) {
          throw new Error("hardening: broker rejected via action callback");
        }
      },
    },
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1h",
    actions: ["hardening-ordersync-action"],
    getSignal: async () => ({
      id: "hardening-ordersync-id",
      position: "long",
      note: "hardening ordersync",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 120,
    }),
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "idle") {
    fail(`tick #1 expected "idle" (action callback rejected the open), got "${tick1.action}"`);
    return;
  }

  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "opened") {
    fail(`REGRESSION: tick #2 expected "opened" (next-tick retry within 1h), got "${tick2.action}"`);
    return;
  }
  if (syncCalls !== 2) {
    fail(`expected 2 onOrderSync calls (reject + accept), got ${syncCalls}`);
    return;
  }

  pass(`action onOrderSync gated the open: idle → opened within one hour (calls=${syncCalls})`);
});

/**
 * HARDENING: таймаут getSignal (CC_MAX_SIGNAL_GENERATION_SECONDS) — зависший
 * getSignal обрывается Promise.race, tick возвращает idle за ~1 секунду
 * вместо ожидания 3-секундного промиса.
 */
test("HARDENING: hung getSignal is cut by the generation timeout and tick returns idle", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "hardening-timeout-strategy",
    exchangeName: "binance-hardening-timeout",
    frameName: "",
  };

  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 1 }, true);

  let calls = 0;
  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return {
        position: "long",
        note: "hardening timeout — must never open",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const runTick = makeRunTick(context);

  const started = Date.now();
  const tick1 = await runTick(new Date(t0));
  const elapsed = Date.now() - started;

  if (tick1.action !== "idle") {
    fail(`tick #1 expected "idle" (getSignal timed out), got "${tick1.action}"`);
    return;
  }
  if (calls !== 1) {
    fail(`getSignal expected exactly 1 call, got ${calls}`);
    return;
  }
  if (elapsed >= 2500) {
    fail(`REGRESSION: tick must return at the 1s timeout, not await the hung 3s getSignal (elapsed=${elapsed}ms)`);
    return;
  }

  pass(`hung getSignal cut at the timeout: idle in ${elapsed}ms`);
});

/**
 * HARDENING: одноразовость listenSyncOnce/listenCheckOnce — после первого
 * сматченного события подписка снимается; второе событие того же типа
 * колбэк не получает.
 */
test("HARDENING: listenSyncOnce and listenCheckOnce fire exactly once", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "hardening-once-strategy",
    exchangeName: "binance-hardening-once",
    frameName: "",
  };

  let issues = 0;
  let syncOnceFired = 0;
  let checkOnceFired = 0;

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      // Два scheduled подряд: первый отменим, второй живёт — каждый даёт
      // placement-событие (sync) и check-пинг
      if (issues >= 2) return null;
      issues += 1;
      return {
        position: "long",
        note: `hardening once #${issues}`,
        priceOpen,
        priceTakeProfit: priceOpen + 25000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 300,
      };
    },
  });

  listenSyncOnce(
    (event) => event.strategyName === context.strategyName && event.action === "signal-open" && event.type === "schedule",
    () => { syncOnceFired += 1; },
    true,
  );
  listenCheckOnce(
    (event) => event.strategyName === context.strategyName && event.type === "schedule",
    () => { checkOnceFired += 1; },
    true,
  );

  const runTick = makeRunTick(context);
  const inCtx = (fn) => MethodContextService.runInContext(fn, context);

  // Цикл #1: placement (sync-событие #1) + мониторинг (check-пинг #1)
  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "scheduled") {
    fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
    return;
  }
  await runTick(new Date(t0 + 1 * MIN)); // waiting → check-пинг #1
  // Отмена и второй цикл: placement #2 + пинг #2
  await inCtx(() => lib.strategyCoreService.cancelScheduled(false, "BTCUSDT", context, { id: "once-cancel" }));
  const tick3 = await runTick(new Date(t0 + 2 * MIN)); // дренаж отмены
  if (tick3.action !== "cancelled") {
    fail(`tick #3 expected "cancelled", got "${tick3.action}"`);
    return;
  }
  const tick4 = await runTick(new Date(t0 + 3 * MIN)); // scheduled #2 → placement-событие #2
  if (tick4.action !== "scheduled") {
    fail(`tick #4 expected "scheduled" (second signal), got "${tick4.action}"`);
    return;
  }
  await runTick(new Date(t0 + 4 * MIN)); // waiting → check-пинг #2

  if (syncOnceFired !== 1) {
    fail(`REGRESSION: listenSyncOnce must fire exactly once across 2 placements, got ${syncOnceFired}`);
    return;
  }
  if (checkOnceFired !== 1) {
    fail(`REGRESSION: listenCheckOnce must fire exactly once across 2 pings, got ${checkOnceFired}`);
    return;
  }

  pass(`Once-listeners disposed after the first match: sync=1, check=1 across two cycles`);
});

/**
 * HARDENING: Infinity-холд переживает крэш — JSON сериализует Infinity как
 * null, restore обязан вернуть Infinity (иначе позиция мгновенно закрылась бы
 * time_expired при рестарте сутки спустя).
 */
test("HARDENING: Infinity hold survives a crash restore without instant time_expired", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "hardening-infinity-strategy",
    exchangeName: "binance-hardening-infinity",
    frameName: "",
  };

  setConfig({ CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity }, true);

  let signalGenerated = false;
  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "hardening infinity",
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: Infinity,
      };
    },
  });

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    // Сброс остатков прошлых прогонов
    await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(
      { pendingSignalId: null, createdSignal: null, commitQueue: [], closedSignal: null, cancelledSignal: null, activatedSignal: null, takeProfitSignal: null, stopLossSignal: null },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // «Крэш» + рестарт СУТКИ спустя: null из JSON обязан восстановиться в Infinity
    await lib.strategyConnectionService.clear({
      symbol: "BTCUSDT",
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: false,
    });

    const tick2 = await runTick(new Date(t0 + 24 * 60 * MIN));
    if (tick2.action !== "active") {
      fail(`REGRESSION: Infinity hold restored as finite — expected "active" a day later, got "${tick2.action}"/${tick2.closeReason ?? ""}`);
      return;
    }

    const estimate = await MethodContextService.runInContext(
      () => lib.strategyCoreService.getPositionEstimateMinutes(false, "BTCUSDT", context), context);
    if (estimate !== Infinity) {
      fail(`restored minuteEstimatedTime expected Infinity, got ${estimate}`);
      return;
    }

    pass(`Infinity hold survived crash: still active 24h later, estimate restored to Infinity`);
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

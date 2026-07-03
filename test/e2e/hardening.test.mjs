import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addActionSchema,
  addRiskSchema,
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

/**
 * HARDENING: whipsaw-защита переживает рестарт — _lastPendingId восстанавливается
 * из PersistRecentAdapter, и детерминированный id, уже торговавшийся до «крэша»,
 * не переоткрывается (Recent записан напрямую адаптером: канал Recent-класса
 * в тест-конфигурации не активен).
 */
test("HARDENING: whipsaw guard survives a restart via PersistRecentAdapter restore", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "hardening-whipsaw-strategy",
    exchangeName: "binance-hardening-whipsaw",
    frameName: "",
  };

  let getSignalCalls = 0;
  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      getSignalCalls += 1;
      // Детерминированный id — КАЖДЫЙ вызов возвращает один и тот же сигнал
      return {
        id: "hardening-whipsaw-id",
        position: "long",
        note: "hardening whipsaw",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 300,
      };
    },
  });

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    // Чистый стейт + Recent с тем же id: «до рестарта этот сигнал уже жил»
    await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(
      { pendingSignalId: null, createdSignal: null, commitQueue: [], closedSignal: null, cancelledSignal: null, activatedSignal: null, takeProfitSignal: null, stopLossSignal: null },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );
    await PersistRecentAdapter.writeRecentData(
      { id: "hardening-whipsaw-id" },
      "BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false, new Date(t0),
    );

    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`REGRESSION: restored whipsaw guard must block the same id — expected "idle", got "${tick1.action}"`);
      return;
    }
    if (getSignalCalls !== 1) {
      fail(`getSignal expected exactly 1 call (id rejected AFTER generation), got ${getSignalCalls}`);
      return;
    }

    pass(`whipsaw guard restored from Recent: deterministic id blocked after restart`);
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

/**
 * HARDENING: конкуренция за общую риск-мапу (shared riskName, лимит 1 через
 * activePositionCount): стратегия A занимает слот — B отвергается; закрытие A
 * освобождает слот — B открывается. Функциональное доказательство, что все
 * release-точки реально возвращают слот в общую мапу.
 */
test("HARDENING: shared risk map blocks the second strategy until the first releases the slot", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const exchangeName = "binance-hardening-sharedrisk";

  makeExchange(exchangeName, () => basePrice);

  addRiskSchema({
    riskName: "hardening-shared-risk",
    validations: [
      ({ activePositionCount }) => {
        if (activePositionCount >= 1) {
          throw new Error("hardening: risk limit is 1 concurrent position");
        }
      },
    ],
  });

  const makeStrategy = (strategyName) => addStrategySchema({
    strategyName,
    interval: "1m",
    riskName: "hardening-shared-risk",
    getSignal: async () => ({
      id: `${strategyName}-id`,
      position: "long",
      note: strategyName,
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 300,
    }),
  });

  const contextA = { strategyName: "hardening-risk-a-strategy", exchangeName, frameName: "" };
  const contextB = { strategyName: "hardening-risk-b-strategy", exchangeName, frameName: "" };
  makeStrategy(contextA.strategyName);
  makeStrategy(contextB.strategyName);

  const tickA = makeRunTick(contextA);
  const tickB = makeRunTick(contextB);
  const inCtxA = (fn) => MethodContextService.runInContext(fn, contextA);

  const a1 = await tickA(new Date(t0));
  if (a1.action !== "opened") {
    fail(`strategy A tick #1 expected "opened", got "${a1.action}"`);
    return;
  }

  const b1 = await tickB(new Date(t0));
  if (b1.action !== "idle") {
    fail(`REGRESSION: strategy B must be rejected while A holds the slot — expected "idle", got "${b1.action}"`);
    return;
  }

  // A закрывается → слот освобождён
  await inCtxA(() => lib.strategyCoreService.closePending(false, "BTCUSDT", contextA, { id: "hardening-close-a" }));
  const a2 = await tickA(new Date(t0 + 1 * MIN));
  if (a2.action !== "closed") {
    fail(`strategy A tick #2 expected "closed", got "${a2.action}"`);
    return;
  }

  const b2 = await tickB(new Date(t0 + 1 * MIN));
  if (b2.action !== "opened") {
    fail(`REGRESSION: strategy B must open after A released the slot — expected "opened", got "${b2.action}"`);
    return;
  }

  pass(`shared risk slot: A opened → B blocked → A closed → B opened`);
});

/**
 * HARDENING: stopStrategy во время PLACEMENT-гейта (гонка на размещении).
 *
 * stopStrategy прилетает из sync-слушателя размещения (scheduled ещё НЕ
 * зарегистрирован), затем гейт отвергает. Чистота исхода: ни scheduled, ни
 * cancel-событий (нечего отменять — ордер не размещён), риск-слот снят ровно
 * один раз, следующий tick не зовёт getSignal (стратегия стопнута).
 */
test("HARDENING: stopStrategy racing the placement gate leaves no phantom state", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "hardening-stop-placement-strategy",
    exchangeName: "binance-hardening-stop-placement",
    frameName: "",
  };

  let getSignalCalls = 0;
  const scheduleEvents = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      getSignalCalls += 1;
      return {
        position: "long",
        note: "hardening stop placement",
        priceOpen,
        priceTakeProfit: priceOpen + 25000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const { listenScheduleEvent, listenSync } = await import("../../build/index.mjs");

  const unsubscribeSchedule = listenScheduleEvent((event) => {
    if (event.strategyName !== context.strategyName) return;
    scheduleEvents.push(event.action);
  });

  // Патч риска на инстансе — считаем резервации/релизы
  const realService = Object.getPrototypeOf(lib.strategyConnectionService);
  const strategy = await MethodContextService.runInContext(
    async () => realService.getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false),
    context,
  );
  let reserves = 0;
  let removes = 0;
  const origCheck = strategy.params.risk.checkSignalAndReserve;
  const origRemove = strategy.params.risk.removeSignal;
  strategy.params.risk.checkSignalAndReserve = async (...args) => { reserves += 1; return await origCheck.call(strategy.params.risk, ...args); };
  strategy.params.risk.removeSignal = async (...args) => { removes += 1; return await origRemove.call(strategy.params.risk, ...args); };

  const unsubscribeSync = listenSync(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "schedule") return;
    // Гонка: стоп прилетает ВНУТРИ гейта размещения, затем гейт отвергает
    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.stopStrategy(false, "BTCUSDT", context),
      context,
    );
    throw new Error("hardening: placement rejected while stopping");
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (placement rejected mid-stop), got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "idle") {
      fail(`tick #2 expected "idle" (stopped), got "${tick2.action}"`);
      return;
    }

    if (getSignalCalls !== 1) {
      fail(`REGRESSION: stopped strategy must not call getSignal again, got ${getSignalCalls} calls`);
      return;
    }
    if (scheduleEvents.length !== 0) {
      fail(`REGRESSION: no schedule events expected (order was never placed), got ${JSON.stringify(scheduleEvents)}`);
      return;
    }
    if (reserves !== 1 || removes !== 1) {
      fail(`risk slot must be reserved and released exactly once, got reserve=${reserves} remove=${removes}`);
      return;
    }

    pass(`stop during placement left no phantom state: no events, slot released, getSignal silenced`);
  } finally {
    unsubscribeSchedule();
    unsubscribeSync();
  }
});

/**
 * HARDENING: cancellationRate учитывает НОВЫЙ путь отмены — risk-reject на
 * wick-активации в backtest. ScheduleMarkdownService слушает signalEmitter
 * (tick-результаты); наш cancelled-outcome фикс делает отказ активации видимым
 * статистике (до фикса backtest падал фаталом, а результата не было вовсе).
 * ВАЖНО: активация должна случиться ПОЗЖЕ свечи создания scheduled — иначе
 * pendingAt === scheduledAt и сервис справедливо не матчит открытие как
 * scheduled-активацию.
 */
test("HARDENING: activation risk-reject cancellations are counted in the schedule stats", async ({ pass, fail }) => {
  const { addFrameSchema, Backtest } = await import("../../build/index.mjs");
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "hardening-stats-strategy",
    exchangeName: "binance-hardening-stats",
    frameName: "30m-hardening-stats",
  };

  let issues = 0;
  let riskCalls = 0;

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MIN;
        // Дип-окна разнесены: s1 активируется на 00:10 (risk reject), s2 —
        // на 00:15 (создан на 00:11 → pendingAt != scheduledAt)
        const dip = (timestamp >= t0 + 10 * MIN && timestamp < t0 + 11 * MIN) || timestamp >= t0 + 15 * MIN;
        candles.push({
          timestamp,
          open: 50000,
          high: 50100,
          low: dip ? priceOpen - 50 : 49900,
          close: 50000,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "hardening-stats-risk",
    validations: [
      () => {
        riskCalls += 1;
        // #1 резерв s1; #2 активация s1 — ОТКАЗ; #3 резерв s2; #4 активация s2 — ок
        if (riskCalls === 2) throw new Error("hardening: reject first activation");
      },
    ],
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    riskName: "hardening-stats-risk",
    getSignal: async () => {
      if (issues >= 2) return null;
      issues += 1;
      return {
        position: "long",
        note: `hardening stats #${issues}`,
        priceOpen,
        priceTakeProfit: priceOpen + 25000,
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

  const svc = lib.scheduleMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "BTCUSDT", strategyName: context.strategyName, exchangeName: context.exchangeName, frameName: context.frameName, backtest: true });

  const results = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    results.push(`${result.action}/${result.closeReason ?? result.reason ?? ""}`);
  }

  if (!results.includes("cancelled/user") || !results.includes("closed/time_expired")) {
    fail(`expected cancelled/user + closed/time_expired in ${JSON.stringify(results)}`);
    return;
  }

  const stats = await svc.getData("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, true);
  if (stats.totalScheduled !== 2) {
    fail(`totalScheduled expected 2, got ${stats.totalScheduled}`);
    return;
  }
  if (Math.abs(stats.activationRate - 50) > 1e-9 || Math.abs(stats.cancellationRate - 50) > 1e-9) {
    fail(`REGRESSION: rates expected 50/50 (one risk-rejected activation, one completed), got act=${stats.activationRate} cancel=${stats.cancellationRate}`);
    return;
  }

  pass(`schedule stats count the new cancellation path: 2 scheduled → act 50% / cancel 50%`);
});

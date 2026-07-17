import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addActionSchema,
  setConfig,
  listenSync,
  listenExit,
  commitTrailingStopCost,
  runInMockContext,
  Broker,
  OrderRejectedError,
  OrderTransientError,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Broker-канал во взаимодействии с остальной системой:
// - консистентность attempt между тремя каналами одного события (Broker-адаптер,
//   callbacks.onOrderSync, listenSync) и право вето любого из них;
// - изоляция стратегий на одном адаптере (счётчики и routing не текут);
// - reconcile-рецепты, не закрытые reconcile.test: scheduled-размещение и
//   close-через-крэш с fake-биржей;
// - окно close-отказов не замораживает управление позицией (trailing);
// - хаос-профиль «мигающая сеть»: одиночные транзиенты на длинной сессии
//   никогда не эскалируют (нет exit, все позиции доходят до закрытия).

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

const inMock = (fn, whenMs, context) =>
  runInMockContext(fn, {
    when: new Date(whenMs),
    strategyName: context.strategyName,
    exchangeName: context.exchangeName,
    frameName: context.frameName,
    symbol: "BTCUSDT",
    backtest: false,
  });

/** listenExit-хендлер queued-асинхронный — даём ему такт перед ассертом */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const BASE_PRICE = 50000;

/**
 * MULTI: три канала одного события видят ОДИН signalId и ОДИН attempt —
 * транзиентный отказ из action-канала взводит ретрай, и следующая попытка
 * приходит во все каналы с тем же id и attempt 1.
 */
test("MULTI: broker, action and listenSync see identical signalId and attempt across a retry", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "multi-consist-strategy",
    exchangeName: "binance-multi-consist",
    frameName: "",
  };

  const seenBroker = [];
  const seenAction = [];
  const seenListen = [];

  makeExchange(context.exchangeName, () => BASE_PRICE);

  class EmptyAction {}
  addActionSchema({
    actionName: "multi-consist-action",
    handler: EmptyAction,
    callbacks: {
      onOrderSync: (event) => {
        if (event.action !== "signal-open" || event.type !== "active") return;
        seenAction.push({ id: event.signalId, attempt: event.attempt });
        // Action-канал бежит ПОСЛЕ syncSubject — broker и listenSync уже записали
        if (seenAction.length === 1) {
          throw new Error("multi-consist: action channel lost the response");
        }
      },
    },
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    actions: ["multi-consist-action"],
    getSignal: async () => ({
      position: "long",
      note: "multi consist",
      priceTakeProfit: BASE_PRICE + 15000,
      priceStopLoss: BASE_PRICE - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      seenBroker.push({ id: payload.signalId, attempt: payload.attempt });
    },
  });
  Broker.enable();

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    seenListen.push({ id: event.signalId, attempt: event.attempt });
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick1.action !== "idle" || tick2.action !== "opened") {
      fail(`expected idle, opened — got ${tick1.action}, ${tick2.action}`);
      return;
    }

    const flatten = (events) => events.map(({ id, attempt }) => `${id}:${attempt}`).join("|");
    if (flatten(seenBroker) !== flatten(seenAction) || flatten(seenAction) !== flatten(seenListen)) {
      fail(`channels diverged: broker="${flatten(seenBroker)}" action="${flatten(seenAction)}" listen="${flatten(seenListen)}"`);
      return;
    }
    if (seenBroker.length !== 2 || seenBroker[0].id !== seenBroker[1].id) {
      fail(`expected 2 identical-id deliveries per channel, got ${JSON.stringify(seenBroker)}`);
      return;
    }
    if (seenBroker.map(({ attempt }) => attempt).join(",") !== "0,1") {
      fail(`expected attempts "0,1" in every channel, got "${seenBroker.map(({ attempt }) => attempt).join(",")}"`);
      return;
    }

    pass(`all three channels saw the identical sequence "${flatten(seenBroker)}"`);
  } finally {
    unsubscribe();
    Broker.disable();
  }
});

/**
 * MULTI: право вето — типизированный OrderRejectedError из ОДНОГО канала
 * (action) терминален для всего события, даже когда broker и listenSync
 * молча подтверждают: свежий id, оба вызова с attempt 0.
 */
test("MULTI: a typed rejection from one channel vetoes the event for all channels", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "multi-veto-strategy",
    exchangeName: "binance-multi-veto",
    frameName: "",
  };

  const seenBroker = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);

  class EmptyAction {}
  addActionSchema({
    actionName: "multi-veto-action",
    handler: EmptyAction,
    callbacks: {
      onOrderSync: (event) => {
        if (event.action !== "signal-open" || event.type !== "active") return;
        if (seenBroker.length === 1) {
          throw new OrderRejectedError("multi-veto: action channel says never");
        }
      },
    },
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    actions: ["multi-veto-action"],
    getSignal: async () => ({
      position: "long",
      note: "multi veto",
      priceTakeProfit: BASE_PRICE + 15000,
      priceStopLoss: BASE_PRICE - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      seenBroker.push({ id: payload.signalId, attempt: payload.attempt });
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (vetoed by the action channel), got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (fresh signal), got "${tick2.action}"`);
      return;
    }
    if (seenBroker.length !== 2 || seenBroker[0].id === seenBroker[1].id) {
      fail(`terminal veto must produce a FRESH id (no armed retry), got ${JSON.stringify(seenBroker)}`);
      return;
    }
    if (seenBroker[0].attempt !== 0 || seenBroker[1].attempt !== 0) {
      fail(`both broker deliveries must carry attempt 0 across a terminal drop, got ${JSON.stringify(seenBroker)}`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`business veto must NOT signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`OrderRejectedError from the action channel vetoed the event: fresh id, attempt 0 both times`);
  } finally {
    Broker.disable();
    unsubscribeExit();
  }
});

/**
 * MULTI: изоляция стратегий на одном адаптере — исчерпание open-ретраев
 * стратегии A (по context.strategyName) не задевает стратегию B: B открывается
 * с attempt 0, счётчики и routing не текут между инстансами.
 */
test("MULTI: per-strategy retry counters stay isolated on a shared adapter", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const exchangeName = "binance-multi-isolation";
  const contextA = { strategyName: "multi-iso-a-strategy", exchangeName, frameName: "" };
  const contextB = { strategyName: "multi-iso-b-strategy", exchangeName, frameName: "" };

  const opensA = [];
  const opensB = [];
  let exitCount = 0;

  makeExchange(exchangeName, () => BASE_PRICE);
  for (const context of [contextA, contextB]) {
    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => ({
        position: "long",
        note: `multi iso ${context.strategyName}`,
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 120,
      }),
    });
  }

  const unsubscribeExit = listenExit(() => { exitCount += 1; });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      if (payload.context.strategyName === contextA.strategyName) {
        opensA.push({ id: payload.signalId, attempt: payload.attempt });
        throw new OrderTransientError("multi-iso: exchange unreachable for strategy A");
      }
      opensB.push({ id: payload.signalId, attempt: payload.attempt, strategyName: payload.context.strategyName });
    },
  });
  Broker.enable();

  try {
    const runTickA = makeRunTick(contextA);
    const runTickB = makeRunTick(contextB);

    // Чередуем тики: A всегда отвергается (исчерпание на 4-м), B живёт штатно
    for (let i = 0; i < 4; i++) {
      await runTickA(new Date(t0 + i * MIN));
      await runTickB(new Date(t0 + i * MIN));
    }

    if (opensA.length !== 4) {
      fail(`strategy A expected 4 gate calls (3×same id + 1 fresh), got ${opensA.length}`);
      return;
    }
    const idsA = opensA.map(({ id }) => id);
    if (idsA[0] !== idsA[1] || idsA[1] !== idsA[2] || idsA[3] === idsA[0]) {
      fail(`strategy A expected ids A,A,A,fresh — got [${idsA.join(", ")}]`);
      return;
    }
    if (opensA.map(({ attempt }) => attempt).join(",") !== "0,1,2,0") {
      fail(`strategy A expected attempts "0,1,2,0", got "${opensA.map(({ attempt }) => attempt).join(",")}"`);
      return;
    }

    // B: один confirm с attempt 0, никакого влияния счётчиков A
    if (opensB.length !== 1 || opensB[0].attempt !== 0) {
      fail(`strategy B expected a single confirmed open with attempt 0, got ${JSON.stringify(opensB)}`);
      return;
    }
    if (opensB[0].strategyName !== contextB.strategyName || idsA.includes(opensB[0].id)) {
      fail(`payload routing leaked between strategies: ${JSON.stringify(opensB)}`);
      return;
    }

    await settle();
    if (exitCount !== 1) {
      fail(`only strategy A's exhaustion must signal fatal exit (exactly once), got ${exitCount}`);
      return;
    }

    pass(`A exhausted in isolation (attempts 0,1,2,0 + exit), B opened untouched with attempt 0`);
  } finally {
    Broker.disable();
    unsubscribeExit();
  }
});

/**
 * MULTI RECONCILE: потерянный ответ на РАЗМЕЩЕНИИ resting-ордера — reconcile
 * по clientOrderId при attempt > 0 находит ордер и подтверждает: на бирже
 * ровно один resting-ордер, scheduled с тем же id.
 */
test("MULTI RECONCILE: lost schedule placement response is reconciled — one resting order", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const priceOpen = 40000;
  const context = {
    strategyName: "multi-rec-sched-strategy",
    exchangeName: "binance-multi-rec-sched",
    frameName: "",
  };

  const fakeResting = new Map();
  let placeCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "multi rec sched",
      priceOpen,
      priceTakeProfit: priceOpen + 4000,
      priceStopLoss: priceOpen - 2000,
      minuteEstimatedTime: 120,
    }),
  });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "schedule") return;
      if (payload.attempt > 0) {
        // RECONCILE-BEFORE-SEND: resting-ордер мог встать с прошлой попытки
        if (fakeResting.has(payload.signalId)) return;
      }
      placeCalls += 1;
      fakeResting.set(payload.signalId, { price: payload.priceOpen });
      throw new OrderTransientError("multi-rec-sched: placement response lost");
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (placement response lost), got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "scheduled") {
      fail(`tick #2 expected "scheduled" (reconciled resting order), got "${tick2.action}"`);
      return;
    }
    if (placeCalls !== 1 || fakeResting.size !== 1) {
      fail(`the exchange must hold exactly 1 resting order, got placeCalls=${placeCalls} resting=${fakeResting.size}`);
      return;
    }
    if (!fakeResting.has(tick2.signal.id)) {
      fail(`scheduled id "${tick2.signal.id}" must match the resting order [${[...fakeResting.keys()].join(", ")}]`);
      return;
    }

    pass(`lost placement response reconciled: 1 resting order, scheduled with the same id`);
  } finally {
    Broker.disable();
  }
});

/**
 * MULTI RECONCILE: потерянный ответ на exit + крэш процесса — persisted
 * retryCloseCount переживает рестарт (клэмп до 1), адаптер сверяет flat-позицию
 * на attempt 1 и подтверждает: ровно один exit-ордер за оба «запуска».
 */
test("MULTI RECONCILE: lost close response survives a crash — the restart reconciles the exit", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "multi-rec-close-strategy",
    exchangeName: "binance-multi-rec-close",
    frameName: "",
  };

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    // Сброс остатков прошлых прогонов сьюта (json-файлы живут на диске)
    await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(
      {
        pendingSignalId: null,
        createdSignal: null,
        commitQueue: [],
        closedSignal: null,
        cancelledSignal: null,
        activatedSignal: null,
        takeProfitSignal: null,
        stopLossSignal: null,
        retryOpenSignal: null,
        retryOpenCount: 0,
        retryCloseCount: 0,
      },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const closeAttempts = [];
    let exitOrders = 0;
    let positionFlat = false; // состояние БИРЖИ — переживает «крэш» движка
    let issued = false;

    makeExchange(context.exchangeName, () => BASE_PRICE);
    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return {
          position: "long",
          note: "multi rec close",
          priceTakeProfit: BASE_PRICE + 15000,
          priceStopLoss: BASE_PRICE - 15000,
          minuteEstimatedTime: 1,
        };
      },
    });

    Broker.useBrokerAdapter({
      onOrderCloseCommit: async (payload) => {
        closeAttempts.push(payload.attempt);
        if (payload.attempt > 0 && positionFlat) {
          return; // RECONCILE: прошлый exit дошёл — позиция flat, подтверждаем
        }
        exitOrders += 1;
        positionFlat = true; // биржа исполнила exit...
        throw new OrderTransientError("multi-rec-close: exit response lost (№10)");
      },
    });
    Broker.enable();

    try {
      const runTick = makeRunTick(context);

      const tick1 = await runTick(new Date(t0));
      if (tick1.action !== "opened") {
        fail(`tick #1 expected "opened", got "${tick1.action}"`);
        return;
      }
      const openedId = tick1.signal.id;

      const tick2 = await runTick(new Date(t0 + 2 * MIN));
      if (tick2.action !== "active") {
        fail(`tick #2 expected "active" (exit response lost), got "${tick2.action}"`);
        return;
      }

      const armed = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
      if (armed?.retryCloseCount !== 1 || armed?.pendingSignalId !== openedId) {
        fail(`pre-armed snapshot must carry retryCloseCount=1 for the pending id, got count=${armed?.retryCloseCount} id=${armed?.pendingSignalId}`);
        return;
      }

      // «Крэш» в окне потерянного ответа
      await lib.strategyConnectionService.clear({
        symbol: "BTCUSDT",
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: false,
      });

      const tick3 = await runTick(new Date(t0 + 3 * MIN));
      if (tick3.action !== "closed" || tick3.closeReason !== "time_expired") {
        fail(`tick #3 after crash expected closed/time_expired (reconciled exit), got "${tick3.action}"/"${tick3.closeReason}"`);
        return;
      }
      if (closeAttempts.join(",") !== "0,1") {
        fail(`close attempts across the crash must be "0,1" (pre-arm + clamp), got "${closeAttempts.join(",")}"`);
        return;
      }
      if (exitOrders !== 1) {
        fail(`№10 REGRESSION: exactly 1 exit order expected across the crash, got ${exitOrders}`);
        return;
      }

      pass(`crash inside the lost-exit window: restart reconciled the flat position (attempts 0,1), 1 exit order`);
    } finally {
      Broker.disable();
    }
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

/**
 * MULTI: окно close-отказов не замораживает управление позицией — между
 * отвергнутыми попытками закрытия commitTrailingStopCost проходит штатно
 * (onTrailingStopCommit срабатывает, SL сдвигается), а закрытие в итоге
 * подтверждается с ИСХОДНЫМ closeReason.
 */
test("MULTI: position management stays alive inside the close-retry window (trailing works)", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "multi-window-strategy",
    exchangeName: "binance-multi-window",
    frameName: "",
  };

  const closeAttempts = [];
  const trailingCalls = [];
  let issued = false;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "multi window",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 1,
      };
    },
  });

  Broker.useBrokerAdapter({
    onOrderCloseCommit: async (payload) => {
      closeAttempts.push(payload.attempt);
      if (closeAttempts.length <= 2) {
        throw new OrderTransientError("multi-window: exit not filled yet");
      }
    },
    onTrailingStopCommit: async (payload) => {
      trailingCalls.push(payload.newStopLossPrice);
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Отказ #1 — позиция в окне ретраев закрытия
    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 expected "active" (close rejected), got "${tick2.action}"`);
      return;
    }

    // Управление живо: трейлим SL ПРЯМО в окне отказов (49500 всё ещё ниже цены)
    const ok = await inMock(() => commitTrailingStopCost("BTCUSDT", BASE_PRICE - 500), t0 + 2 * MIN + 5000, context);
    if (!ok) {
      fail(`commitTrailingStopCost must succeed inside the close-retry window`);
      return;
    }
    if (trailingCalls.length !== 1 || Math.abs(trailingCalls[0] - (BASE_PRICE - 500)) > 1e-6) {
      fail(`onTrailingStopCommit must fire with the new SL 49500, got ${JSON.stringify(trailingCalls)}`);
      return;
    }

    // Отказ #2, затем подтверждение — закрытие с ИСХОДНЫМ time_expired
    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick3.action !== "active") {
      fail(`tick #3 expected "active" (close rejected again), got "${tick3.action}"`);
      return;
    }
    const tick4 = await runTick(new Date(t0 + 4 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "time_expired") {
      fail(`tick #4 expected closed/time_expired (trailing must not corrupt the reason), got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }
    if (closeAttempts.join(",") !== "0,1,2") {
      fail(`expected close attempts "0,1,2", got "${closeAttempts.join(",")}"`);
      return;
    }

    pass(`trailing committed mid-window (SL→49500), close confirmed later with the original reason`);
  } finally {
    Broker.disable();
  }
});

/**
 * MULTI CHAOS: «мигающая сеть» — каждый 3-й вызов любого хука падает
 * транзиентно на длинной сессии из трёх позиций. Инварианты: одиночные сбои
 * никогда не эскалируют — ни одного фатального exit, все три позиции доходят
 * до штатного time_expired, в конце движок чист (idle).
 */
test("MULTI CHAOS: a flaky network (every 3rd call fails) never escalates across three positions", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "multi-chaos-strategy",
    exchangeName: "binance-multi-chaos",
    frameName: "",
  };

  let hookCallN = 0;
  let exitCount = 0;
  let issuedCount = 0;

  const flaky = (label) => async () => {
    hookCallN += 1;
    if (hookCallN % 3 === 0) {
      throw new OrderTransientError(`multi-chaos: blip on ${label} (call #${hookCallN})`);
    }
  };

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issuedCount >= 3) return null;
      issuedCount += 1;
      return {
        position: "long",
        note: `multi chaos #${issuedCount}`,
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 1,
      };
    },
  });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: flaky("open"),
    onOrderCloseCommit: flaky("close"),
    onOrderActiveCheck: flaky("check"),
    onOrderScheduleCheck: flaky("schedule-check"),
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const closed = [];
    for (let i = 0; i < 24; i++) {
      const tick = await runTick(new Date(t0 + i * MIN));
      if (tick.action === "closed") {
        closed.push(tick.closeReason);
      }
    }

    if (closed.length !== 3) {
      fail(`all 3 positions must reach a normal close despite the blips, got ${closed.length} (${closed.join(",")})`);
      return;
    }
    if (!closed.every((reason) => reason === "time_expired")) {
      fail(`every close must be a normal time_expired (no forced/terminal escalation), got [${closed.join(", ")}]`);
      return;
    }

    const finalTick = await runTick(new Date(t0 + 24 * MIN));
    if (finalTick.action !== "idle") {
      fail(`the engine must end clean (idle), got "${finalTick.action}"`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`isolated transient blips must NEVER signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`flaky network survived: 3/3 positions closed time_expired over ${hookCallN} hook calls, 0 fatal exits`);
  } finally {
    Broker.disable();
    unsubscribeExit();
  }
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  setConfig,
  listenExit,
  getStrategyStatus,
  runInMockContext,
  Broker,
  OrderTransientError,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// End-to-end реконструкции инцидента REPORT №10 (ордер исполнен, ответ потерян)
// через канонический reconcile-before-send адаптер: при attempt > 0 адаптер
// СНАЧАЛА сверяет прошлый ордер по clientOrderId = signalId и подтверждает филл
// вместо повторной отправки — ровно один ордер на бирже, никакого даблбая.
// Плюс: сирота после исчерпания (зона ответственности orphan sweep) и
// наблюдаемость счётчиков через getStrategyStatus.

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

const makeStrategy = (context, { minuteEstimatedTime, once }) => {
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (once && issued) return null;
      issued = true;
      return {
        position: "long",
        note: "reconcile",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime,
      };
    },
  });
};

/**
 * RECONCILE №10: ордер исполнен, ответ потерян — reconcile-before-send адаптер
 * на attempt=0 размещает (биржа филлит, ответ теряется → Transient), на
 * attempt>0 СВЕРЯЕТ по clientOrderId и подтверждает. Итог: позиция открыта тем
 * же id, на «бирже» ровно ОДИН ордер (даблбай инцидента №10 невозможен).
 */
test("RECONCILE: lost open response is reconciled by clientOrderId — exactly one exchange order", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "rec-open-strategy",
    exchangeName: "binance-rec-open",
    frameName: "",
  };

  // Fake-биржа: clientOrderId → ордер; place считает РЕАЛЬНЫЕ отправки
  const fakeOrders = new Map();
  let placeCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 120, once: false });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      if (payload.attempt > 0) {
        // RECONCILE-BEFORE-SEND: прошлая попытка могла дойти — сверяем ДО отправки
        const prior = fakeOrders.get(payload.signalId);
        if (prior?.filled) return; // филл найден — подтверждаем, НЕ переотправляем
      }
      placeCalls += 1;
      fakeOrders.set(payload.signalId, { filled: true }); // биржа исполнила...
      throw new OrderTransientError("rec-open: response lost after the fill (№10)");
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (response lost), got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (reconciled fill), got "${tick2.action}"`);
      return;
    }
    if (placeCalls !== 1) {
      fail(`№10 REGRESSION: the exchange must receive exactly 1 order (no double buy), got ${placeCalls}`);
      return;
    }
    if (fakeOrders.size !== 1 || !fakeOrders.has(tick2.signal.id)) {
      fail(`exchange must hold exactly the opened order id "${tick2.signal.id}", got [${[...fakeOrders.keys()].join(", ")}]`);
      return;
    }

    pass(`lost response reconciled: 1 exchange order, position opened with the same id ${tick2.signal.id}`);
  } finally {
    Broker.disable();
  }
});

/**
 * RECONCILE №10 + крэш: потерянный ответ, процесс умирает ДО ретрая — pre-arm
 * персистит attempt, рестарт приходит с attempt=1 (клэмп) и reconcile находит
 * филл. Ровно один ордер, та же позиция.
 */
test("RECONCILE: lost open response survives a crash — the restart reconciles instead of re-buying", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "rec-crash-strategy",
    exchangeName: "binance-rec-crash",
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

    const fakeOrders = new Map();
    const attempts = [];
    let placeCalls = 0;

    makeExchange(context.exchangeName, () => BASE_PRICE);
    makeStrategy(context, { minuteEstimatedTime: 120, once: false });

    Broker.useBrokerAdapter({
      onOrderOpenCommit: async (payload) => {
        if (payload.type !== "active") return;
        attempts.push(payload.attempt);
        if (payload.attempt > 0) {
          const prior = fakeOrders.get(payload.signalId);
          if (prior?.filled) return;
        }
        placeCalls += 1;
        fakeOrders.set(payload.signalId, { filled: true });
        throw new OrderTransientError("rec-crash: response lost after the fill (№10)");
      },
    });
    Broker.enable();

    try {
      const runTick = makeRunTick(context);

      const tick1 = await runTick(new Date(t0));
      if (tick1.action !== "idle") {
        fail(`tick #1 expected "idle" (response lost), got "${tick1.action}"`);
        return;
      }

      const armed = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
      if (!armed?.retryOpenSignal || armed?.retryOpenCount !== 1) {
        fail(`pre-armed snapshot must carry the slot with count=1, got retryOpenSignal=${!!armed?.retryOpenSignal} count=${armed?.retryOpenCount}`);
        return;
      }

      // «Крэш» между потерянным ответом и ретраем — окно РКН-дефьюза 200мс
      await lib.strategyConnectionService.clear({
        symbol: "BTCUSDT",
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: false,
      });

      const tick2 = await runTick(new Date(t0 + 1 * MIN));
      if (tick2.action !== "opened") {
        fail(`tick #2 after crash expected "opened" (restored slot reconciled), got "${tick2.action}"`);
        return;
      }
      if (attempts.join(",") !== "0,1") {
        fail(`attempts across the crash must be "0,1" (pre-arm + clamp), got "${attempts.join(",")}"`);
        return;
      }
      if (placeCalls !== 1 || fakeOrders.size !== 1) {
        fail(`№10 REGRESSION: exactly 1 exchange order expected across the crash, got placeCalls=${placeCalls} orders=${fakeOrders.size}`);
        return;
      }
      if (!fakeOrders.has(tick2.signal.id)) {
        fail(`opened id "${tick2.signal.id}" must match the exchange order [${[...fakeOrders.keys()].join(", ")}]`);
        return;
      }

      pass(`crash inside the lost-response window: restart reconciled (attempts 0,1), 1 order, same id`);
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
 * RECONCILE close: потерянный ответ на exit-ордер — биржа уже flat; на attempt>0
 * адаптер сверяет позицию и подтверждает закрытие. Ровно один exit-ордер.
 */
test("RECONCILE: lost close response is reconciled by the flat position — exactly one exit order", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "rec-close-strategy",
    exchangeName: "binance-rec-close",
    frameName: "",
  };

  let exitOrders = 0;
  let positionFlat = false;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 1, once: true });

  Broker.useBrokerAdapter({
    onOrderCloseCommit: async (payload) => {
      if (payload.attempt > 0 && positionFlat) {
        // RECONCILE: прошлый exit дошёл — позиция уже flat, подтверждаем
        return;
      }
      exitOrders += 1;
      positionFlat = true; // биржа исполнила exit...
      throw new OrderTransientError("rec-close: response lost after the exit fill (№10)");
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

    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 expected "active" (exit response lost, retry armed), got "${tick2.action}"`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "time_expired") {
      fail(`tick #3 expected closed/time_expired (reconciled exit), got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }
    if (exitOrders !== 1) {
      fail(`№10 REGRESSION: the exchange must receive exactly 1 exit order, got ${exitOrders}`);
      return;
    }

    pass(`lost exit response reconciled by the flat position: 1 exit order, closed time_expired`);
  } finally {
    Broker.disable();
  }
});

/**
 * ORPHAN: сеть умерла сразу после первой отправки — исчерпание open-ретраев
 * дропает сигнал (движок забывает id A и работает дальше свежим B), но на бирже
 * остаётся СИРОТА A: ровно та зона ответственности orphan sweep из waitForInit.
 */
test("ORPHAN: open exhaustion leaves the filled order orphaned while the engine moves on", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "rec-orphan-strategy",
    exchangeName: "binance-rec-orphan",
    frameName: "",
  };

  const fakeOrders = new Map();
  const opens = [];
  let networkAlive = true;
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 120, once: false });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      opens.push({ id: payload.signalId, attempt: payload.attempt });
      if (networkAlive) {
        // Первая отправка дошла и исполнилась, ответ потерян — дальше сеть мертва
        fakeOrders.set(payload.signalId, { filled: true });
        networkAlive = false;
      }
      throw new OrderTransientError("rec-orphan: network is down");
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    // tick1-3: id A (attempts 0,1,2), tick4: исчерпание → дроп A, свежий B
    for (let i = 0; i < 4; i++) {
      const tick = await runTick(new Date(t0 + i * MIN));
      if (tick.action !== "idle") {
        fail(`tick #${i + 1} expected "idle" (network down), got "${tick.action}"`);
        return;
      }
    }

    if (opens.length !== 4) {
      fail(`expected 4 gate calls (3×A + 1×B), got ${opens.length}`);
      return;
    }
    const idA = opens[0].id;
    const idB = opens[3].id;
    if (opens[1].id !== idA || opens[2].id !== idA || idB === idA) {
      fail(`expected ids A,A,A,B — got [${opens.map(({ id }) => id).join(", ")}]`);
      return;
    }
    // Движок забыл A и работает дальше свежим B...
    if (opens[3].attempt !== 0) {
      fail(`fresh signal B must start at attempt 0, got ${opens[3].attempt}`);
      return;
    }
    // ...но на бирже осталась сирота A — её обязан подобрать orphan sweep
    if (fakeOrders.size !== 1 || !fakeOrders.has(idA) || fakeOrders.has(idB)) {
      fail(`the exchange must hold exactly the orphaned order A="${idA}", got [${[...fakeOrders.keys()].join(", ")}]`);
      return;
    }

    await settle();
    if (exitCount !== 1) {
      fail(`open exhaustion must signal fatal exit exactly once, got ${exitCount}`);
      return;
    }

    pass(`exhaustion dropped A="${idA}" (orphan left on the exchange for the sweep), engine moved on with B, fatal exit signaled`);
  } finally {
    Broker.disable();
    unsubscribeExit();
  }
});

/**
 * STATUS: счётчики ретраев наблюдаемы через getStrategyStatus — вооружённый
 * open-слот (retryOpenSignal + retryOpenCount), зачистка после успеха и
 * retryCloseCount по ходу close-серии.
 */
test("STATUS: getStrategyStatus exposes the armed retry slot and both counters live", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "rec-status-strategy",
    exchangeName: "binance-rec-status",
    frameName: "",
  };

  const openIds = [];
  let openRejected = false;
  let closeRejected = false;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 1, once: true });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      openIds.push(payload.signalId);
      if (!openRejected) {
        openRejected = true;
        throw new OrderTransientError("rec-status: open response lost");
      }
    },
    onOrderCloseCommit: async () => {
      if (!closeRejected) {
        closeRejected = true;
        throw new OrderTransientError("rec-status: close response lost");
      }
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (open rejected), got "${tick1.action}"`);
      return;
    }

    // Вооружённый open-слот виден снаружи: id + счётчик стартов
    const statusArmed = await inMock(() => getStrategyStatus("BTCUSDT"), t0 + 5000, context);
    if (statusArmed.retryOpenSignal?.id !== openIds[0] || statusArmed.retryOpenCount !== 1) {
      fail(`armed status must expose retryOpenSignal.id=${openIds[0]} retryOpenCount=1, got id=${statusArmed.retryOpenSignal?.id} count=${statusArmed.retryOpenCount}`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened", got "${tick2.action}"`);
      return;
    }

    // Успех зачищает слот
    const statusOpened = await inMock(() => getStrategyStatus("BTCUSDT"), t0 + 1 * MIN + 5000, context);
    if (statusOpened.retryOpenSignal !== null || statusOpened.retryOpenCount !== 0 || statusOpened.retryCloseCount !== 0) {
      fail(`post-open status must be clean, got retryOpenSignal=${JSON.stringify(statusOpened.retryOpenSignal)} openCount=${statusOpened.retryOpenCount} closeCount=${statusOpened.retryCloseCount}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick3.action !== "active") {
      fail(`tick #3 expected "active" (close rejected), got "${tick3.action}"`);
      return;
    }

    // Идущая close-серия видна как retryCloseCount (старты)
    const statusClosing = await inMock(() => getStrategyStatus("BTCUSDT"), t0 + 3 * MIN + 5000, context);
    if (statusClosing.retryCloseCount !== 1 || statusClosing.pendingSignalId !== tick2.signal.id) {
      fail(`closing status must expose retryCloseCount=1 for the pending id, got count=${statusClosing.retryCloseCount} pendingSignalId=${statusClosing.pendingSignalId}`);
      return;
    }

    const tick4 = await runTick(new Date(t0 + 4 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "time_expired") {
      fail(`tick #4 expected closed/time_expired, got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }

    const statusClosed = await inMock(() => getStrategyStatus("BTCUSDT"), t0 + 4 * MIN + 5000, context);
    if (statusClosed.retryCloseCount !== 0) {
      fail(`post-close status must reset retryCloseCount to 0, got ${statusClosed.retryCloseCount}`);
      return;
    }

    pass(`getStrategyStatus exposed the armed slot (count=1), the close series (count=1) and both resets`);
  } finally {
    Broker.disable();
  }
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  Broker,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  listenStrategyCommit,
  listenSync,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Матрица crash-recovery: каждый deferred-флаг ClientStrategy персистится
// (PERSIST_STRATEGY_FN) и обязан пережить «крэш» (голый dispose через
// strategyConnectionService.clear) — новый инстанс восстанавливает его в
// WAIT_FOR_INIT_FN и дренит первым же tick. useJson-адаптеры локально в
// скоупе теста; состояние прошлых прогонов сбрасывается явными null-записями.

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

const inCtx = (context, fn) => MethodContextService.runInContext(fn, context);

const usePersist = () => {
  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();
};

const useDummy = () => {
  PersistSignalAdapter.useDummy();
  PersistStrategyAdapter.useDummy();
  PersistScheduleAdapter.useDummy();
  PersistRecentAdapter.useDummy();
};

// Сброс остатков ПРОШЛЫХ прогонов сьюта (json-файлы живут на диске)
const resetPersist = async (context) => {
  await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
  await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
  await PersistStrategyAdapter.writeStrategyData(
    { pendingSignalId: null, createdSignal: null, commitQueue: [], closedSignal: null, cancelledSignal: null, activatedSignal: null, takeProfitSignal: null, stopLossSignal: null },
    "BTCUSDT", context.strategyName, context.exchangeName,
  );
};

// «Крэш»: голый dispose инстанса (context-free)
const crash = async (context) =>
  await lib.strategyConnectionService.clear({
    symbol: "BTCUSDT",
    strategyName: context.strategyName,
    exchangeName: context.exchangeName,
    frameName: context.frameName,
    backtest: false,
  });

/**
 * RECOVERY: stopStrategy → крэш → отложенная отмена восстановлена и дренится:
 * cancelled/user + брокер получает onSignalScheduleCancelled ПОСЛЕ рестарта.
 * Это заявленное свойство stopStrategy-фикса («крэш до следующего tick —
 * restore и дренаж после рестарта»).
 */
test("RECOVERY: deferred cancel from stopStrategy survives a crash and reaches the broker", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-stop-strategy",
    exchangeName: "binance-recovery-stop",
    frameName: "",
  };

  let signalGenerated = false;
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
        note: "recovery stop",
        priceOpen: 40000,
        priceTakeProfit: 55000,
        priceStopLoss: 38000,
        minuteEstimatedTime: 300,
      };
    },
  });

  Broker.useBrokerAdapter({
    onSignalScheduleCancelled: async (p) => brokerCancels.push({ reason: p.reason, signalId: p.signalId }),
  });
  Broker.enable();
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }
    const scheduledId = tick1.signal.id;

    await inCtx(context, () => lib.strategyCoreService.stopStrategy(false, "BTCUSDT", context));
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "cancelled" || tick2.reason !== "user") {
      fail(`REGRESSION: post-restart tick expected cancelled/user (deferred cancel restored), got "${tick2.action}"/"${tick2.reason}"`);
      return;
    }
    if (brokerCancels.length !== 1 || brokerCancels[0].signalId !== scheduledId) {
      fail(`broker must receive scheduleCancelled for ${scheduledId} after restart, got ${JSON.stringify(brokerCancels)}`);
      return;
    }

    pass(`stopStrategy cancel survived crash: cancelled/user + broker notified after restart`);
  } finally {
    Broker.disable();
    useDummy();
  }
});

/**
 * RECOVERY: activateScheduled → крэш → отложенная активация восстановлена:
 * позиция открывается по priceOpen с commit "activate-scheduled" (activateId).
 */
test("RECOVERY: deferred user activation survives a crash and opens at priceOpen", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-activate-strategy",
    exchangeName: "binance-recovery-activate",
    frameName: "",
  };

  let signalGenerated = false;
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
        note: "recovery activate",
        priceOpen,
        priceTakeProfit: priceOpen + 25000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push({ action: event.action, activateId: event.activateId });
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.activateScheduled(false, "BTCUSDT", context, { id: "recovery-act-1" }));
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened" || tick2.signal.priceOpen !== priceOpen) {
      fail(`REGRESSION: post-restart tick expected opened@${priceOpen}, got "${tick2.action}"@${tick2.signal?.priceOpen}`);
      return;
    }
    const activateCommit = commits.find((c) => c.action === "activate-scheduled");
    if (!activateCommit || activateCommit.activateId !== "recovery-act-1") {
      fail(`activate-scheduled commit with activateId expected after restart, got ${JSON.stringify(commits)}`);
      return;
    }

    pass(`user activation survived crash: opened at ${priceOpen} with activateId after restart`);
  } finally {
    unsubscribeCommit();
    useDummy();
  }
});

/**
 * RECOVERY: createTakeProfit → крэш → broker-confirmed филл восстановлен:
 * закрытие take_profit ПО ЭФФЕКТИВНОМУ TP с closeId после рестарта.
 */
test("RECOVERY: deferred take-profit fill survives a crash and closes at the TP level", async ({ pass, fail }) => {
  const basePrice = 50000;
  const TP = basePrice + 5000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-tpfill-strategy",
    exchangeName: "binance-recovery-tpfill",
    frameName: "",
  };

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
        note: "recovery tp fill",
        priceTakeProfit: TP,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.createTakeProfit(false, "BTCUSDT", context, { id: "recovery-tp-1" }));
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "take_profit") {
      fail(`REGRESSION: post-restart tick expected closed/take_profit, got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (tick2.currentPrice !== TP || tick2.closeId !== "recovery-tp-1") {
      fail(`restored fill must close at TP ${TP} with closeId, got price=${tick2.currentPrice} closeId=${tick2.closeId}`);
      return;
    }

    pass(`take-profit fill survived crash: closed at ${TP} with closeId after restart`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY: createSignal (очередь _userSignal) → крэш → DTO восстановлен и
 * потреблён первым tick после рестарта — позиция открывается с note DTO.
 */
test("RECOVERY: queued createSignal DTO survives a crash and opens after restart", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-created-strategy",
    exchangeName: "binance-recovery-created",
    frameName: "",
  };

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => null, // сигнал только из очереди
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    // Первый tick сеет цену (createSignal ждёт currentPrice из PriceMetaService)
    const tick0 = await runTick(new Date(t0));
    if (tick0.action !== "idle") {
      fail(`tick #0 expected "idle" (getSignal returns null), got "${tick0.action}"`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.createSignal(false, "BTCUSDT", {
      position: "long",
      note: "recovery created signal",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 300,
    }, context));

    await crash(context);

    const tick1 = await runTick(new Date(t0 + 1 * MIN));
    if (tick1.action !== "opened" || tick1.signal.note !== "recovery created signal") {
      fail(`REGRESSION: post-restart tick expected opened with queued note, got "${tick1.action}"/"${tick1.signal?.note}"`);
      return;
    }

    pass(`queued createSignal survived crash and opened after restart`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY: commit-очередь восстанавливается по совпадению pendingSignalId —
 * partial-profit commit, застрявший в очереди на момент крэша, эмитится
 * после рестарта (доезжает до брокерского канала).
 */
test("RECOVERY: queued partial commit survives a crash when pendingSignalId matches", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-queue-strategy",
    exchangeName: "binance-recovery-queue",
    frameName: "",
  };

  let signalGenerated = false;
  let afterRestart = false;
  const commitsAfterRestart = [];

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "recovery queue",
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (afterRestart) commitsAfterRestart.push(event.action);
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Партиал ставит commit в очередь; дренаж должен был случиться на СЛЕДУЮЩЕМ
    // tick — но случается крэш
    const partial = await inCtx(context, () => lib.strategyCoreService.partialProfit(false, "BTCUSDT", 30, basePrice + 1000, context));
    if (!partial) {
      fail(`partialProfit(30%) must execute`);
      return;
    }

    await crash(context);
    afterRestart = true;

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active") {
      fail(`post-restart tick expected "active", got "${tick2.action}"`);
      return;
    }
    if (!commitsAfterRestart.includes("partial-profit")) {
      fail(`REGRESSION: partial-profit commit lost in crash — queue must be restored by pendingSignalId match, got ${JSON.stringify(commitsAfterRestart)}`);
      return;
    }

    // И состояние партиала восстановлено вместе с сигналом
    const remaining = await inCtx(context, () => lib.strategyCoreService.getTotalCostClosed(false, "BTCUSDT", context));
    if (remaining !== 70) {
      fail(`restored remaining cost basis expected 70, got ${remaining}`);
      return;
    }

    pass(`queued partial-profit commit survived crash and drained after restart (remaining=$${remaining})`);
  } finally {
    unsubscribeCommit();
    useDummy();
  }
});

/**
 * RECOVERY: очередь НЕ восстанавливается, когда pending исчез (at-most-once
 * через рестарт): partial-commit в очереди + createTakeProfit занулил pending →
 * крэш → после рестарта TP-филл закрывает позицию, а осиротевший partial-commit
 * НЕ эмитится.
 */
test("RECOVERY: orphaned queued commit is NOT replayed after a crash without its pending signal", async ({ pass, fail }) => {
  const basePrice = 50000;
  const TP = basePrice + 5000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-orphan-strategy",
    exchangeName: "binance-recovery-orphan",
    frameName: "",
  };

  let signalGenerated = false;
  let afterRestart = false;
  const commitsAfterRestart = [];

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "recovery orphan",
        priceTakeProfit: TP,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (afterRestart) commitsAfterRestart.push(event.action);
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.partialProfit(false, "BTCUSDT", 30, basePrice + 1000, context));
    // TP-филл зануляет pending — очередь осиротела ДО крэша
    await inCtx(context, () => lib.strategyCoreService.createTakeProfit(false, "BTCUSDT", context, { id: "recovery-orphan-tp" }));

    await crash(context);
    afterRestart = true;

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "take_profit") {
      fail(`post-restart tick expected closed/take_profit (restored fill), got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (commitsAfterRestart.includes("partial-profit")) {
      fail(`REGRESSION: orphaned partial-profit commit replayed against a vanished pending: ${JSON.stringify(commitsAfterRestart)}`);
      return;
    }
    if (!commitsAfterRestart.includes("close-pending")) {
      fail(`close-pending commit expected after restart, got ${JSON.stringify(commitsAfterRestart)}`);
      return;
    }

    pass(`orphaned queue dropped after crash (at-most-once), TP fill closed with close-pending`);
  } finally {
    unsubscribeCommit();
    useDummy();
  }
});

/**
 * RECOVERY: крэш МЕЖДУ двумя записями closePending (write-ahead порядок:
 * strategyData с _closedSignal записан, стирание pending НЕ успело). На диске
 * остаются ОБА снапшота — waitForInit обязан по совпадению id пропустить
 * restore устаревшего pending, ДОСТЕРЕТЬ его с диска и дренить отложенное
 * закрытие. Без сверки pending воскрес бы и позиция закрылась бы дважды
 * (или, после дренажа и второго рестарта, ожила бы зомби-позицией).
 */
test("RECOVERY: stale pending snapshot left by a crash mid-closePending is superseded, not resurrected", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-walclose-strategy",
    exchangeName: "binance-recovery-walclose",
    frameName: "",
  };

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
        note: "recovery wal close",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Снапшот pending С ДИСКА (как его оставил бы недописанный closePending)
    const stalePending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!stalePending || stalePending.id !== tick1.signal.id) {
      fail(`pending snapshot expected on disk after open, got ${JSON.stringify(stalePending)}`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.closePending(false, "BTCUSDT", context, { id: "recovery-wal-close-1" }));

    // Симулируем крэш МЕЖДУ записями: возвращаем устаревший pending на диск —
    // ровно то состояние, что оставляет остановка процесса после
    // PERSIST_STRATEGY_FN (deferred записан), но до writeSignalData(null)
    await PersistSignalAdapter.writeSignalData(stalePending, "BTCUSDT", context.strategyName, context.exchangeName);
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "closed" || tick2.closeId !== "recovery-wal-close-1") {
      fail(`REGRESSION: post-restart tick expected closed/"closed" (deferred close drained), got "${tick2.action}"/"${tick2.closeReason}"/closeId=${tick2.closeId}`);
      return;
    }

    // Сверка обязана ДОСТЕРЕТЬ устаревший pending с диска (иначе следующий
    // рестарт — уже без deferred — воскресит зомби-позицию)
    const diskPending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (diskPending !== null) {
      fail(`REGRESSION: stale pending must be wiped from disk by waitForInit reconciliation, got ${JSON.stringify(diskPending)}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "idle") {
      fail(`tick #3 expected "idle" (no zombie position), got "${tick3.action}"`);
      return;
    }

    pass(`mid-closePending crash reconciled: deferred close drained (closeId), stale pending wiped, no zombie`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY: то же крэш-окно для scheduled: cancelScheduled записал deferred
 * _cancelledSignal, стирание scheduled с диска НЕ успело. waitForInit обязан
 * пропустить restore устаревшего scheduled по совпадению id, достереть его и
 * дренить отмену (cancelled/user с cancelId) — без воскрешения resting-ордера.
 */
test("RECOVERY: stale scheduled snapshot left by a crash mid-cancelScheduled is superseded, not resurrected", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-walcancel-strategy",
    exchangeName: "binance-recovery-walcancel",
    frameName: "",
  };

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
        note: "recovery wal cancel",
        priceOpen: basePrice - 10000,
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 12000,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    const staleScheduled = await PersistScheduleAdapter.readScheduleData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!staleScheduled || staleScheduled.id !== tick1.signal.id) {
      fail(`scheduled snapshot expected on disk, got ${JSON.stringify(staleScheduled)}`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.cancelScheduled(false, "BTCUSDT", context, { id: "recovery-wal-cancel-1" }));

    // Крэш между записями: deferred _cancelledSignal на диске, scheduled не стёрт
    await PersistScheduleAdapter.writeScheduleData(staleScheduled, "BTCUSDT", context.strategyName, context.exchangeName);
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "cancelled" || tick2.reason !== "user" || tick2.cancelId !== "recovery-wal-cancel-1") {
      fail(`REGRESSION: post-restart tick expected cancelled/user (deferred cancel drained), got "${tick2.action}"/"${tick2.reason}"/cancelId=${tick2.cancelId}`);
      return;
    }

    const diskScheduled = await PersistScheduleAdapter.readScheduleData("BTCUSDT", context.strategyName, context.exchangeName);
    if (diskScheduled !== null) {
      fail(`REGRESSION: stale scheduled must be wiped from disk by waitForInit reconciliation, got ${JSON.stringify(diskScheduled)}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "idle") {
      fail(`tick #3 expected "idle" (no resurrected resting order), got "${tick3.action}"`);
      return;
    }

    pass(`mid-cancelScheduled crash reconciled: deferred cancel drained (cancelId), stale scheduled wiped, no resurrection`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY: крэш-окно activateScheduled — вторая ветка scheduled-сверки
 * (_activatedSignal). Исход дренажа противоположен отмене: устаревший scheduled
 * на диске + deferred активация → сверка стирает scheduled, tick дренит
 * активацию (риск-чек + sync-гейт) → opened по priceOpen с activateId. Без
 * сверки восстановленный scheduled затёр бы _activatedSignal через
 * setScheduledSignal и активация молча потерялась бы.
 */
test("RECOVERY: stale scheduled snapshot left by a crash mid-activateScheduled is superseded, activation opens", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-walact-strategy",
    exchangeName: "binance-recovery-walact",
    frameName: "",
  };

  let signalGenerated = false;
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
        note: "recovery wal activate",
        priceOpen,
        priceTakeProfit: priceOpen + 25000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push({ action: event.action, activateId: event.activateId });
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    const staleScheduled = await PersistScheduleAdapter.readScheduleData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!staleScheduled || staleScheduled.id !== tick1.signal.id) {
      fail(`scheduled snapshot expected on disk, got ${JSON.stringify(staleScheduled)}`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.activateScheduled(false, "BTCUSDT", context, { id: "recovery-wal-act-1" }));

    // Крэш между записями: deferred _activatedSignal записан, scheduled не стёрт
    await PersistScheduleAdapter.writeScheduleData(staleScheduled, "BTCUSDT", context.strategyName, context.exchangeName);
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened" || tick2.signal.priceOpen !== priceOpen) {
      fail(`REGRESSION: post-restart tick expected opened@${priceOpen} (deferred activation drained), got "${tick2.action}"@${tick2.signal?.priceOpen}`);
      return;
    }
    const activateCommit = commits.find((c) => c.action === "activate-scheduled");
    if (!activateCommit || activateCommit.activateId !== "recovery-wal-act-1") {
      fail(`activate-scheduled commit with activateId expected, got ${JSON.stringify(commits)}`);
      return;
    }

    const diskScheduled = await PersistScheduleAdapter.readScheduleData("BTCUSDT", context.strategyName, context.exchangeName);
    if (diskScheduled !== null) {
      fail(`REGRESSION: stale scheduled must be wiped by reconciliation, got ${JSON.stringify(diskScheduled)}`);
      return;
    }

    pass(`mid-activateScheduled crash reconciled: activation drained → opened@${priceOpen} (activateId), stale scheduled wiped`);
  } finally {
    unsubscribeCommit();
    useDummy();
  }
});

/**
 * RECOVERY: крэш-окно createTakeProfit — ветка _takeProfitSignal pending-сверки.
 * Дренаж идёт через CLOSE_PENDING_SIGNAL_AS_FILL_FN: закрытие по ЭФФЕКТИВНОМУ
 * уровню TP минуя VWAP, без пере-подтверждения sync (филл уже подтверждён
 * брокером). Устаревший pending стёрт, зомби нет.
 */
test("RECOVERY: stale pending snapshot left by a crash mid-createTakeProfit is superseded, fill closes at TP", async ({ pass, fail }) => {
  const basePrice = 50000;
  const TP = basePrice + 5000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-waltp-strategy",
    exchangeName: "binance-recovery-waltp",
    frameName: "",
  };

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
        note: "recovery wal tp",
        priceTakeProfit: TP,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const stalePending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!stalePending || stalePending.id !== tick1.signal.id) {
      fail(`pending snapshot expected on disk, got ${JSON.stringify(stalePending)}`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.createTakeProfit(false, "BTCUSDT", context, { id: "recovery-wal-tp-1" }));

    await PersistSignalAdapter.writeSignalData(stalePending, "BTCUSDT", context.strategyName, context.exchangeName);
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "take_profit" || tick2.closeId !== "recovery-wal-tp-1") {
      fail(`REGRESSION: expected closed/take_profit (deferred fill drained), got "${tick2.action}"/"${tick2.closeReason}"/closeId=${tick2.closeId}`);
      return;
    }
    if (tick2.currentPrice !== TP) {
      fail(`fill must close at the effective TP level ${TP}, got ${tick2.currentPrice}`);
      return;
    }

    const diskPending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (diskPending !== null) {
      fail(`REGRESSION: stale pending must be wiped by reconciliation, got ${JSON.stringify(diskPending)}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "idle") {
      fail(`tick #3 expected "idle" (no zombie position), got "${tick3.action}"`);
      return;
    }

    pass(`mid-createTakeProfit crash reconciled: fill closed at TP=${TP} (closeId), stale pending wiped, no zombie`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY: крэш-окно createStopLoss — зеркало TP-филла: ветка _stopLossSignal
 * pending-сверки, закрытие stop_loss по эффективному уровню SL.
 */
test("RECOVERY: stale pending snapshot left by a crash mid-createStopLoss is superseded, fill closes at SL", async ({ pass, fail }) => {
  const basePrice = 50000;
  const SL = basePrice - 5000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-walsl-strategy",
    exchangeName: "binance-recovery-walsl",
    frameName: "",
  };

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
        note: "recovery wal sl",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: SL,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const stalePending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!stalePending || stalePending.id !== tick1.signal.id) {
      fail(`pending snapshot expected on disk, got ${JSON.stringify(stalePending)}`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.createStopLoss(false, "BTCUSDT", context, { id: "recovery-wal-sl-1" }));

    await PersistSignalAdapter.writeSignalData(stalePending, "BTCUSDT", context.strategyName, context.exchangeName);
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "stop_loss" || tick2.closeId !== "recovery-wal-sl-1") {
      fail(`REGRESSION: expected closed/stop_loss (deferred fill drained), got "${tick2.action}"/"${tick2.closeReason}"/closeId=${tick2.closeId}`);
      return;
    }
    if (tick2.currentPrice !== SL) {
      fail(`fill must close at the effective SL level ${SL}, got ${tick2.currentPrice}`);
      return;
    }

    const diskPending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (diskPending !== null) {
      fail(`REGRESSION: stale pending must be wiped by reconciliation, got ${JSON.stringify(diskPending)}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "idle") {
      fail(`tick #3 expected "idle" (no zombie position), got "${tick3.action}"`);
      return;
    }

    pass(`mid-createStopLoss crash reconciled: fill closed at SL=${SL} (closeId), stale pending wiped, no zombie`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY (негатив): сверка строго id-гейтится — pending с ДРУГИМ id, чем у
 * deferred close, восстанавливается нормально и НЕ стирается. Защита от
 * обратной регрессии: слишком агрессивная сверка стирала бы легитимные позиции
 * (самый дорогой из возможных багов в этом коде).
 */
test("RECOVERY: reconciliation is id-gated — a pending with a different id is restored, not wiped", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-walmm-strategy",
    exchangeName: "binance-recovery-walmm",
    frameName: "",
  };

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
        note: "recovery wal mismatch",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const stalePending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    await inCtx(context, () => lib.strategyCoreService.closePending(false, "BTCUSDT", context, { id: "recovery-wal-mm-1" }));

    // На диск кладём pending с ЧУЖИМ id — сверка сработать НЕ должна
    const mismatchedId = `${stalePending.id}-mismatch`;
    await PersistSignalAdapter.writeSignalData(
      { ...stalePending, id: mismatchedId },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );
    await crash(context);

    // Deferred close дренится (свой id), НЕ трогая чужой pending
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeId !== "recovery-wal-mm-1") {
      fail(`deferred close expected to drain regardless, got "${tick2.action}"/closeId=${tick2.closeId}`);
      return;
    }

    // Чужой pending восстановлен и продолжает мониториться
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "active" || tick3.signal.id !== mismatchedId) {
      fail(`REGRESSION: mismatched pending must be restored and monitored, got "${tick3.action}"/id=${tick3.signal?.id}`);
      return;
    }

    const diskPending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!diskPending || diskPending.id !== mismatchedId) {
      fail(`REGRESSION: mismatched pending must NOT be wiped from disk, got ${JSON.stringify(diskPending)}`);
      return;
    }

    pass(`reconciliation id-gated: foreign pending restored + monitored (active), deferred close drained independently`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY: крэш-окно stopStrategy — deferred отмена с cancelNote
 * "stop_strategy" и БЕЗ cancelId суперсидит устаревший scheduled. После
 * рестарта _isStopped НЕ восстановлен (in-memory флаг) — getSignal снова жив:
 * это осознанная семантика stopStrategy, фиксируем её тестом.
 */
test("RECOVERY: stale scheduled snapshot left by a crash mid-stopStrategy is superseded, cancel drains", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-walstop-strategy",
    exchangeName: "binance-recovery-walstop",
    frameName: "",
  };

  let getSignalCalls = 0;
  const commits = [];

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      getSignalCalls++;
      if (getSignalCalls > 1) return null;
      return {
        position: "long",
        note: "recovery wal stop",
        priceOpen: basePrice - 10000,
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 12000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push({ action: event.action, cancelId: event.cancelId, note: event.note });
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    const staleScheduled = await PersistScheduleAdapter.readScheduleData("BTCUSDT", context.strategyName, context.exchangeName);
    await inCtx(context, () => lib.strategyCoreService.stopStrategy(false, "BTCUSDT", context));

    // Крэш между записями stopStrategy
    await PersistScheduleAdapter.writeScheduleData(staleScheduled, "BTCUSDT", context.strategyName, context.exchangeName);
    await crash(context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "cancelled" || tick2.reason !== "user" || tick2.cancelId !== undefined) {
      fail(`REGRESSION: expected cancelled/user without cancelId (stop_strategy drain), got "${tick2.action}"/"${tick2.reason}"/cancelId=${tick2.cancelId}`);
      return;
    }
    const cancelCommit = commits.find((c) => c.action === "cancel-scheduled");
    if (!cancelCommit || cancelCommit.note !== "stop_strategy") {
      fail(`cancel-scheduled commit with note "stop_strategy" expected, got ${JSON.stringify(commits)}`);
      return;
    }

    const diskScheduled = await PersistScheduleAdapter.readScheduleData("BTCUSDT", context.strategyName, context.exchangeName);
    if (diskScheduled !== null) {
      fail(`REGRESSION: stale scheduled must be wiped by reconciliation, got ${JSON.stringify(diskScheduled)}`);
      return;
    }

    // _isStopped in-memory: после рестарта генерация снова жива (осознанная семантика)
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "idle" || getSignalCalls !== 2) {
      fail(`tick #3 expected "idle" with getSignal alive after restart (2 calls), got "${tick3.action}"/calls=${getSignalCalls}`);
      return;
    }

    pass(`mid-stopStrategy crash reconciled: cancel drained (note=stop_strategy, no cancelId), scheduled wiped, getSignal alive post-restart`);
  } finally {
    unsubscribeCommit();
    useDummy();
  }
});

/**
 * RECOVERY: двойной крэш — идемпотентность сверки. Крэш в окне → рестарт #1
 * (waitForInit сверяет и ДОСТИРАЕТ pending, дренирующий tick НЕ успевает) →
 * крэш снова → рестарт #2: deferred всё ещё в strategyData (очищается только
 * при дренаже), pending уже стёрт — дренаж обязан отработать штатно. Заодно
 * фиксирует, что стирание происходит именно в waitForInit, а не в tick.
 */
test("RECOVERY: double crash — reconciliation wipe happens in waitForInit and the deferred close survives both restarts", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-waldouble-strategy",
    exchangeName: "binance-recovery-waldouble",
    frameName: "",
  };

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
        note: "recovery wal double",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const stalePending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    await inCtx(context, () => lib.strategyCoreService.closePending(false, "BTCUSDT", context, { id: "recovery-wal-double-1" }));

    await PersistSignalAdapter.writeSignalData(stalePending, "BTCUSDT", context.strategyName, context.exchangeName);
    await crash(context);

    // Рестарт #1: ТОЛЬКО waitForInit (голый инстанс, superseded-ветка
    // контекст-фри) — дренирующий tick «не успевает»
    const conn = Object.getPrototypeOf(lib.strategyConnectionService);
    const s1 = conn.getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false);
    await s1.waitForInit();

    // Стирание обязано случиться уже в waitForInit (не в tick)
    const diskAfterInit = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (diskAfterInit !== null) {
      fail(`REGRESSION: reconciliation must wipe stale pending during waitForInit, got ${JSON.stringify(diskAfterInit)}`);
      return;
    }

    // Крэш #2 до дренажа
    await crash(context);

    // Рестарт #2: deferred close всё ещё в strategyData → дренаж штатный
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "closed" || tick2.closeId !== "recovery-wal-double-1") {
      fail(`REGRESSION: deferred close must survive BOTH restarts, got "${tick2.action}"/"${tick2.closeReason}"/closeId=${tick2.closeId}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "idle") {
      fail(`tick #3 expected "idle" (no zombie after double crash), got "${tick3.action}"`);
      return;
    }

    pass(`double crash survived: wipe in waitForInit, deferred close drained on restart #2 (closeId), no zombie`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY (фикс сироты): крэш МЕЖДУ записями УСПЕШНОЙ активации scheduled.
 * Write-ahead порядок активации: pending записан ПЕРВЫМ, стирание scheduled —
 * вторым. Крэш между ними оставляет на диске ОБА снапшота с одним id; сверка
 * waitForInit обязана предпочесть pending (позиция реально открыта на бирже,
 * sync-open подтверждён) и достереть scheduled. Обратный порядок терял
 * подтверждённое открытие целиком — позиция-сирота на бирже.
 */
test("RECOVERY: crash between activation writes keeps the opened position, stale scheduled superseded", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-walorphan-strategy",
    exchangeName: "binance-recovery-walorphan",
    frameName: "",
  };

  let px = basePrice;
  let signalGenerated = false;

  makeExchange(context.exchangeName, () => px);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "recovery wal orphan",
        priceOpen,
        priceTakeProfit: priceOpen + 15000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }
    const staleScheduled = await PersistScheduleAdapter.readScheduleData("BTCUSDT", context.strategyName, context.exchangeName);

    // Цена падает до priceOpen — price-активация в live tick (sync-open подтверждён)
    px = priceOpen;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened" || tick2.signal.priceOpen !== priceOpen) {
      fail(`tick #2 expected opened@${priceOpen} via price activation, got "${tick2.action}"@${tick2.signal?.priceOpen}`);
      return;
    }

    // Крэш МЕЖДУ записями активации: pending уже на диске, стирание scheduled
    // не успело — возвращаем устаревший scheduled-снапшот
    await PersistScheduleAdapter.writeScheduleData(staleScheduled, "BTCUSDT", context.strategyName, context.exchangeName);
    await crash(context);

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "active" || tick3.signal.id !== staleScheduled.id) {
      fail(`REGRESSION: post-restart tick expected "active" for the opened position (id=${staleScheduled.id}), got "${tick3.action}"/id=${tick3.signal?.id} — broker-confirmed open must NOT be lost`);
      return;
    }

    const diskScheduled = await PersistScheduleAdapter.readScheduleData("BTCUSDT", context.strategyName, context.exchangeName);
    if (diskScheduled !== null) {
      fail(`REGRESSION: stale scheduled must be wiped (superseded by same-id pending), got ${JSON.stringify(diskScheduled)}`);
      return;
    }
    const diskPending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!diskPending || diskPending.id !== staleScheduled.id) {
      fail(`pending snapshot must remain intact on disk, got ${JSON.stringify(diskPending)}`);
      return;
    }

    pass(`activation crash window reconciled: position kept (active), stale scheduled wiped, pending intact`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY: trailing SL переживает крэш — после рестарта позиция закрывается
 * по ПОДТЯНУТОМУ уровню (эффективный SL из _trailingPriceStopLoss), а не по
 * оригинальному. Прямого теста restore-полноты trailing-состояния не было.
 */
test("RECOVERY: trailing stop survives a crash and the position closes at the tightened level", async ({ pass, fail }) => {
  const basePrice = 50000;
  const originalSL = 45000; // 10% дистанция
  const trailedSL = 47500;  // shift −5пп → 5% дистанция
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-trailing-strategy",
    exchangeName: "binance-recovery-trailing",
    frameName: "",
  };

  let px = basePrice;
  let signalGenerated = false;

  makeExchange(context.exchangeName, () => px);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "recovery trailing",
        priceTakeProfit: basePrice + 10000,
        priceStopLoss: originalSL,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const trailed = await inCtx(context, () =>
      lib.strategyCoreService.trailingStop(false, "BTCUSDT", -5, basePrice, context));
    if (!trailed) {
      fail(`trailingStop(-5) expected to apply`);
      return;
    }

    await crash(context);

    // Цена падает ровно до подтянутого SL (оригинальный 45000 НЕ достигнут)
    px = trailedSL;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "stop_loss" || tick2.currentPrice !== trailedSL) {
      fail(`REGRESSION: expected closed/stop_loss@${trailedSL} by RESTORED trailing SL, got "${tick2.action}"/"${tick2.closeReason}"@${tick2.currentPrice}`);
      return;
    }
    if (tick2.signal.originalPriceStopLoss !== originalSL || tick2.signal.priceStopLoss !== trailedSL) {
      fail(`original/effective SL expected ${originalSL}/${trailedSL}, got ${tick2.signal.originalPriceStopLoss}/${tick2.signal.priceStopLoss}`);
      return;
    }

    pass(`trailing SL survived crash: closed at tightened ${trailedSL}, original ${originalSL} preserved`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY: DCA-входы и _peak/_fall переживают крэш — после рестарта effective
 * price (cost-weighted harmonic), invested cost, уровни входов и метрики
 * peak/drawdown отдают доперезапусковые значения (голые геттеры инстанса).
 */
test("RECOVERY: DCA entries and peak/fall metrics survive a crash", async ({ pass, fail }) => {
  const basePrice = 50000;
  const dcaPrice = 48000;
  const peakPrice = 52000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-dcapeak-strategy",
    exchangeName: "binance-recovery-dcapeak",
    frameName: "",
  };

  let px = basePrice;
  let signalGenerated = false;

  makeExchange(context.exchangeName, () => px);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "recovery dca peak",
        priceTakeProfit: basePrice + 10000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 300,
      };
    },
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Пик вверх, затем просадка вниз — оба персистятся при обновлении
    px = peakPrice;
    await runTick(new Date(t0 + 1 * MIN));
    px = dcaPrice;
    await runTick(new Date(t0 + 2 * MIN));

    // DCA на просадке (строго ниже min entry 50000)
    const bought = await inCtx(context, () =>
      lib.strategyCoreService.averageBuy(false, "BTCUSDT", dcaPrice, context, 100));
    if (!bought) {
      fail(`averageBuy@${dcaPrice} expected to apply`);
      return;
    }

    await crash(context);

    px = 49000;
    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "active") {
      fail(`tick #4 expected "active" after restart, got "${tick4.action}"`);
      return;
    }

    // Голые геттеры инстанса (context-free) — состояние после рестарта
    const conn = Object.getPrototypeOf(lib.strategyConnectionService);
    const s = conn.getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false);

    const expectedEffective = 200 / (100 / basePrice + 100 / dcaPrice);
    const effective = await s.getPositionEffectivePrice("BTCUSDT");
    if (Math.abs(effective - expectedEffective) > 1e-6) {
      fail(`REGRESSION: effective price expected ~${expectedEffective}, got ${effective}`);
      return;
    }
    const invested = await s.getPositionInvestedCost("BTCUSDT");
    if (invested !== 200) {
      fail(`REGRESSION: invested cost expected 200, got ${invested}`);
      return;
    }
    const levels = await s.getPositionLevels("BTCUSDT");
    if (!levels || levels.length !== 2 || levels[0] !== basePrice || levels[1] !== dcaPrice) {
      fail(`REGRESSION: entry levels expected [${basePrice}, ${dcaPrice}], got ${JSON.stringify(levels)}`);
      return;
    }
    const peak = await s.getPositionHighestProfitPrice("BTCUSDT");
    if (peak !== peakPrice) {
      fail(`REGRESSION: peak price expected ${peakPrice}, got ${peak}`);
      return;
    }
    const fall = await s.getPositionMaxDrawdownPrice("BTCUSDT");
    if (fall !== dcaPrice) {
      fail(`REGRESSION: max drawdown price expected ${dcaPrice}, got ${fall}`);
      return;
    }

    pass(`DCA + peak/fall survived crash: effective~${expectedEffective.toFixed(2)}, invested 200, levels [${levels}], peak ${peak}, fall ${fall}`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY (документация семантики): createSignal — at-most-once. DTO
 * потребляется и слот персистится пустым ДО подтверждения открытия
 * (GET_SIGNAL_FN). Sync-reject открытия оставляет на диске ровно то же
 * состояние, что и крэш сразу после потребления: createdSignal=null. После
 * рестарта DTO НЕ повторяется — команда испаряется. Осознанная семантика
 * (at-least-once дал бы риск дубля позиции), тест фиксирует её.
 */
test("RECOVERY: consumed createSignal DTO is at-most-once — not replayed after sync reject + crash", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-atmost-strategy",
    exchangeName: "binance-recovery-atmost",
    frameName: "",
  };

  let syncRejects = 0;
  const openedActions = [];

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => null, // сигнал только из очереди createSignal
  });

  // Брокер отвергает открытие ровно один раз — моделирует крэш сразу после
  // потребления DTO (персист-состояние побайтово идентично)
  const unsubscribeSync = listenSync((event) => {
    if (event.strategyName === context.strategyName && event.action === "signal-open" && event.type === "active") {
      syncRejects += 1;
      throw new Error("recovery: broker rejected the queued open");
    }
  }, true);
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    // Сеем цену
    const tick0 = await runTick(new Date(t0));
    if (tick0.action !== "idle") {
      fail(`tick #0 expected "idle", got "${tick0.action}"`);
      return;
    }

    await inCtx(context, () => lib.strategyCoreService.createSignal(false, "BTCUSDT", {
      position: "long",
      note: "recovery at-most-once",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 300,
    }, context));

    const queuedBefore = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!queuedBefore?.createdSignal) {
      fail(`createdSignal expected persisted after createSignal, got ${JSON.stringify(queuedBefore)}`);
      return;
    }

    // Потребление DTO + sync-reject: слот очищен и персистнут ДО открытия
    const tick1 = await runTick(new Date(t0 + 1 * MIN));
    if (tick1.action !== "idle" || syncRejects !== 1) {
      fail(`tick #1 expected idle with 1 sync reject, got "${tick1.action}"/rejects=${syncRejects}`);
      return;
    }

    await crash(context);

    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    openedActions.push(tick2.action);
    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    openedActions.push(tick3.action);

    if (openedActions.some((a) => a !== "idle")) {
      fail(`at-most-once semantics: consumed DTO must NOT replay after restart, got ${JSON.stringify(openedActions)}`);
      return;
    }
    const dataAfter = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
    if (dataAfter?.createdSignal !== null) {
      fail(`createdSignal slot expected null after consumption, got ${JSON.stringify(dataAfter?.createdSignal)}`);
      return;
    }

    pass(`createSignal is at-most-once: consumed DTO not replayed after reject+crash (documented semantics)`);
  } finally {
    unsubscribeSync();
    useDummy();
  }
});

/**
 * RECOVERY: контекст-мисматч снапшота (крэш-артефакт чужого/битого файла) —
 * pending с ЧУЖИМ strategyName в снапшоте НЕ восстанавливается (skip + warn),
 * но и НЕ стирается (skip-only ветка, в отличие от superseded). Стратегия
 * стартует чистой (idle), мусор не становится позицией.
 */
test("RECOVERY: foreign-context pending snapshot is skipped on restore, not resurrected and not wiped", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-foreign-strategy",
    exchangeName: "binance-recovery-foreign",
    frameName: "",
  };

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => null,
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    // Кладём на диск снапшот с чужим strategyName (артефакт чужого прогона/битой миграции)
    const foreignSignal = {
      id: "foreign-signal-1",
      position: "long",
      note: "foreign snapshot",
      cost: 100,
      priceOpen: basePrice,
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 300,
      symbol: "BTCUSDT",
      exchangeName: context.exchangeName,
      strategyName: "some-other-strategy",
      frameName: "",
      scheduledAt: t0,
      pendingAt: t0,
      timestamp: t0,
      _isScheduled: false,
    };
    await PersistSignalAdapter.writeSignalData(foreignSignal, "BTCUSDT", context.strategyName, context.exchangeName);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`REGRESSION: foreign-context snapshot must be skipped on restore (idle), got "${tick1.action}"`);
      return;
    }

    // Skip-only: снапшот не восстановлен, но и не стёрт (осознанно — чужие данные не трогаем)
    const diskPending = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!diskPending || diskPending.id !== "foreign-signal-1") {
      fail(`foreign snapshot expected untouched on disk, got ${JSON.stringify(diskPending)}`);
      return;
    }

    pass(`foreign-context snapshot skipped: strategy starts clean (idle), snapshot left untouched`);
  } finally {
    useDummy();
  }
});

/**
 * RECOVERY (граница принятого at-most-once): крэш МЕЖДУ записями partialProfit
 * (сигнал с _partial уже на диске, commit-очередь персистнуть не успели).
 * Событие потеряно — но ДЕНЬГИ консистентны: партиал учтён в remaining cost
 * basis после рестарта. Теряется только уведомление, не состояние позиции.
 */
test("RECOVERY: crash between partialProfit writes loses only the commit event, money state stays consistent", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-partialwal-strategy",
    exchangeName: "binance-recovery-partialwal",
    frameName: "",
  };

  let signalGenerated = false;
  let afterRestart = false;
  const commitsAfterRestart = [];

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "recovery partial wal",
        priceTakeProfit: basePrice + 10000,
        priceStopLoss: basePrice - 10000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (afterRestart) commitsAfterRestart.push(event.action);
  });
  usePersist();

  try {
    await resetPersist(context);
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }
    const signalId = tick1.signal.id;

    const executed = await inCtx(context, () =>
      lib.strategyCoreService.partialProfit(false, "BTCUSDT", 40, basePrice + 1000, context));
    if (!executed) {
      fail(`partialProfit(40%) expected to execute`);
      return;
    }

    // Крэш МЕЖДУ записями: сигнал с _partial уже на диске, а персист очереди
    // «не успел» — затираем strategyData пустой очередью
    await PersistStrategyAdapter.writeStrategyData(
      { pendingSignalId: signalId, createdSignal: null, commitQueue: [], closedSignal: null, cancelledSignal: null, activatedSignal: null, takeProfitSignal: null, stopLossSignal: null },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );
    await crash(context);
    afterRestart = true;

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 expected "active" after restart, got "${tick2.action}"`);
      return;
    }

    // Событие потеряно (принятый at-most-once)...
    if (commitsAfterRestart.includes("partial-profit")) {
      fail(`commit event was expected LOST in this crash window, got ${JSON.stringify(commitsAfterRestart)}`);
      return;
    }

    // ...но деньги консистентны: партиал учтён в remaining basis
    const conn = Object.getPrototypeOf(lib.strategyConnectionService);
    const s = conn.getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false);
    const remainingPercent = await s.getTotalPercentClosed("BTCUSDT");
    if (remainingPercent !== 60) {
      fail(`REGRESSION: remaining position expected 60% after restored 40% partial, got ${remainingPercent}`);
      return;
    }
    const partials = await s.getPositionPartials("BTCUSDT");
    if (!partials || partials.length !== 1 || partials[0].type !== "profit" || partials[0].percent !== 40) {
      fail(`REGRESSION: restored _partial expected [profit 40%], got ${JSON.stringify(partials)}`);
      return;
    }

    pass(`partial crash window: commit event lost (accepted at-most-once), money consistent (remaining 60%, partial restored)`);
  } finally {
    unsubscribeCommit();
    useDummy();
  }
});

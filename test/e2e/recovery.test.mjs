import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addRiskSchema,
  Broker,
  PersistRiskAdapter,
  listenError,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  listenStrategyCommit,
  listenSync,
  lib,
  MethodContextService,
  ExecutionContextService,
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

/**
 * RECOVERY: кросс-хранилищное окно риск-стор ↔ сигнал-стор. Риск-мапа и
 * pending-снапшот живут в РАЗНЫХ адаптерах: крэш между их записями может
 * оставить позицию живой без риск-слота (undercount → превышение лимита).
 * waitForInit при restore pending обязан ре-ассертить слот (addSignal
 * идемпотентен по ключу strategy:exchange:symbol).
 */
test("RECOVERY: restored pending re-asserts its risk slot lost in a cross-store crash window", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const riskName = "recovery-reassert-risk";
  const exchangeName = "binance-recovery-reassert";
  const contextA = { strategyName: "recovery-reassert-a-strategy", exchangeName, frameName: "" };
  const contextB = { strategyName: "recovery-reassert-b-strategy", exchangeName, frameName: "" };

  makeExchange(exchangeName, () => basePrice);
  addRiskSchema({
    riskName,
    validations: [
      ({ activePositionCount }) => {
        if (activePositionCount >= 1) {
          throw new Error("recovery: risk limit is 1 concurrent position");
        }
      },
    ],
  });
  const makeStrategy = (strategyName) => addStrategySchema({
    strategyName,
    interval: "1m",
    riskName,
    getSignal: async () => ({
      id: `${strategyName}-id`,
      position: "long",
      note: strategyName,
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 300,
    }),
  });
  makeStrategy(contextA.strategyName);
  makeStrategy(contextB.strategyName);

  usePersist();
  PersistRiskAdapter.useJson();

  try {
    await resetPersist(contextA);
    await resetPersist(contextB);
    await PersistRiskAdapter.writePositionData([], riskName, exchangeName, new Date(t0));

    const runTickA = makeRunTick(contextA);
    const runTickB = makeRunTick(contextB);

    const tick1 = await runTickA(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick A#1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Кросс-хранилищное окно: риск-слот «не пережил крэш» (стор пуст), а
    // pending-снапшот пережил. Крэшим и стратегию, и риск-инстанс (иначе
    // in-memory мапа маскирует потерю).
    await PersistRiskAdapter.writePositionData([], riskName, exchangeName, new Date(t0 + 1 * MIN));
    await crash(contextA);
    await lib.riskConnectionService.clear();

    const tick2 = await runTickA(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active") {
      fail(`tick A#2 expected "active" (restored position), got "${tick2.action}"`);
      return;
    }

    // Ре-ассерт: слот снова в риск-сторе
    const riskData = await PersistRiskAdapter.readPositionData(riskName, exchangeName, new Date(t0 + 1 * MIN));
    if (riskData.length !== 1) {
      fail(`REGRESSION: restored position must re-assert its risk slot, store has ${riskData.length} entries`);
      return;
    }

    // Функциональное следствие: лимит 1 снова держит — стратегия B не открывается
    const tickB = await runTickB(new Date(t0 + 2 * MIN));
    if (tickB.action !== "idle") {
      fail(`REGRESSION: concurrency limit must hold after restore, strategy B got "${tickB.action}"`);
      return;
    }

    pass(`cross-store window healed: restored pending re-asserted its risk slot, limit-1 holds for strategy B`);
  } finally {
    PersistRiskAdapter.useDummy();
    useDummy();
  }
});

/**
 * RECOVERY: протухшие риск-слоты (крэш-артефакты) чистятся при restore.
 * removeSignal — единственный delete в риск-мапе: слот, чей lifetime истёк,
 * принадлежит позиции, чья removeSignal-запись не пережила крэш — без чистки
 * он навсегда блокировал бы общий лимит.
 */
test("RECOVERY: expired risk slots (crash artifacts) are pruned on restore and do not block the limit", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-06-01T00:00:00Z").getTime();
  const riskName = "recovery-prune-risk";
  const exchangeName = "binance-recovery-prune";
  const context = { strategyName: "recovery-prune-strategy", exchangeName, frameName: "" };

  makeExchange(exchangeName, () => basePrice);
  addRiskSchema({
    riskName,
    validations: [
      ({ activePositionCount }) => {
        if (activePositionCount >= 2) {
          throw new Error("recovery: risk limit is 2 concurrent positions");
        }
      },
    ],
  });
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    riskName,
    getSignal: async () => ({
      position: "long",
      note: "recovery prune",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 300,
    }),
  });

  usePersist();
  PersistRiskAdapter.useJson();

  try {
    await resetPersist(context);

    // Сеем риск-стор ДО первого обращения: один протухший слот (lifetime истёк
    // 100 минут назад — крэш-артефакт) и один живой (чужая живая позиция)
    const expiredSlot = ["ghost-strategy:other-exchange:ETHUSDT", {
      position: "long", priceOpen: 40000, priceStopLoss: 38000, priceTakeProfit: 45000,
      minuteEstimatedTime: 300, openTimestamp: t0 - 400 * MIN,
    }];
    const aliveSlot = ["live-strategy:other-exchange:SOLUSDT", {
      position: "long", priceOpen: 100, priceStopLoss: 90, priceTakeProfit: 120,
      minuteEstimatedTime: 300, openTimestamp: t0 - 10 * MIN,
    }];
    await PersistRiskAdapter.writePositionData([expiredSlot, aliveSlot], riskName, exchangeName, new Date(t0));
    await lib.riskConnectionService.clear();

    const runTick = makeRunTick(context);
    // Без чистки протухший слот давал бы count=2 → лимит-2 отверг бы сигнал (idle).
    // С чисткой: count=1 (живой) → открытие проходит.
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`REGRESSION: expired slot must be pruned on restore (limit-2 with 1 alive + 1 expired), got "${tick1.action}"`);
      return;
    }

    const riskData = await PersistRiskAdapter.readPositionData(riskName, exchangeName, new Date(t0));
    const keys = riskData.map(([key]) => key);
    if (keys.includes("ghost-strategy:other-exchange:ETHUSDT")) {
      fail(`REGRESSION: expired slot must not survive the restore persist, got keys=${JSON.stringify(keys)}`);
      return;
    }
    if (!keys.includes("live-strategy:other-exchange:SOLUSDT")) {
      fail(`alive foreign slot must survive pruning, got keys=${JSON.stringify(keys)}`);
      return;
    }

    pass(`expired risk slot pruned on restore: limit-2 admitted the open (1 alive + 1 pruned), alive slot preserved`);
  } finally {
    PersistRiskAdapter.useDummy();
    useDummy();
  }
});

/**
 * RECOVERY (громкая смерть createSignal): DTO, ставший невалидным к моменту
 * потребления (цена ушла), гибнет at-most-once — но теперь ГРОМКО: выделенный
 * warn + errorEmitter (ловится listenError), троттл откатывается, слот
 * createdSignal очищен. Раньше DTO умирал в общем GET_SIGNAL_FN-fallback.
 */
test("RECOVERY: createSignal DTO invalidated by price move dies loudly (listenError) at consumption", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-louddeath-strategy",
    exchangeName: "binance-recovery-louddeath",
    frameName: "",
  };

  let px = basePrice;
  let getSignalCalls = 0;
  const errors = [];

  makeExchange(context.exchangeName, () => px);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      getSignalCalls++;
      return null; // сигнал только из очереди createSignal
    },
  });

  const unsubscribeError = listenError((error) => {
    errors.push(String(error?.message ?? error));
  });
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

    // DTO валиден при 50000 (SL 49000 ниже цены)
    await inCtx(context, () => lib.strategyCoreService.createSignal(false, "BTCUSDT", {
      position: "long",
      note: "recovery loud death",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 1000,
      minuteEstimatedTime: 300,
    }, context));

    // Цена падает НИЖЕ SL из DTO — при потреблении перевалидация провалится
    px = basePrice - 1500;
    const tick1 = await runTick(new Date(t0 + 1 * MIN));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (DTO dropped), got "${tick1.action}"`);
      return;
    }

    const loudDeath = errors.find((m) => m.includes("consumption re-validation"));
    if (!loudDeath) {
      fail(`REGRESSION: dedicated re-validation error expected via listenError, got ${JSON.stringify(errors)}`);
      return;
    }

    const dataAfter = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
    if (dataAfter?.createdSignal !== null) {
      fail(`createdSignal slot expected cleared after the drop, got ${JSON.stringify(dataAfter?.createdSignal)}`);
      return;
    }

    // Откат троттла: собственная генерация возобновляется следующим tick
    const callsBefore = getSignalCalls;
    const tick2 = await runTick(new Date(t0 + 1 * MIN + 5000)); // тот же интервал
    if (tick2.action !== "idle" || getSignalCalls !== callsBefore + 1) {
      fail(`throttle rollback expected (getSignal re-runs within the interval), got "${tick2.action}"/calls=${getSignalCalls} (was ${callsBefore})`);
      return;
    }

    pass(`invalidated createSignal DTO died loudly: listenError fired, slot cleared, throttle rolled back`);
  } finally {
    unsubscribeError();
    useDummy();
  }
});

/**
 * RECOVERY: очередь коммитов ВОССТАНАВЛИВАЕТСЯ, когда её цель атрибуции —
 * deferred USER close (_closedSignal). closePending персистит снапшот с
 * pendingSignalId=null, поэтому восстановление по совпадению pending-id
 * невозможно — но PROCESS_COMMIT_QUEUE_FN атрибуцирует дренаж именно снапшоту
 * _closedSignal, и не-крэшовый поток эти коммиты доставляет. Крэш между
 * closePending и следующим tick не должен их терять (в отличие от
 * осиротевшей очереди TP/SL-филла — та void по дизайну).
 */
test("RECOVERY: queued commits survive a crash after closePending (deferred close is the attribution target)", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-closequeue-strategy",
    exchangeName: "binance-recovery-closequeue",
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
        note: "recovery close queue",
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

    // Партиал ставит commit в очередь, closePending зануляет pending —
    // очередь теперь атрибуцируется deferred-снапшоту _closedSignal
    const partial = await inCtx(context, () => lib.strategyCoreService.partialProfit(false, "BTCUSDT", 30, basePrice + 1000, context));
    if (!partial) {
      fail(`partialProfit(30%) must execute`);
      return;
    }
    await inCtx(context, () => lib.strategyCoreService.closePending(false, "BTCUSDT", context, { id: "recovery-closequeue-1" }));

    await crash(context);
    afterRestart = true;

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "closed") {
      fail(`post-restart tick expected closed/"closed" (deferred close drained), got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (!commitsAfterRestart.includes("partial-profit")) {
      fail(`REGRESSION: partial-profit commit lost in crash — queue must be restored when _closedSignal is the attribution target, got ${JSON.stringify(commitsAfterRestart)}`);
      return;
    }
    if (!commitsAfterRestart.includes("close-pending")) {
      fail(`close-pending commit expected after restart, got ${JSON.stringify(commitsAfterRestart)}`);
      return;
    }

    pass(`queued partial-profit commit survived crash after closePending and drained attributed to the deferred close`);
  } finally {
    unsubscribeCommit();
    useDummy();
  }
});

/**
 * RECOVERY: полное закрытие партиалами (full_partial_close) маршрутизируется
 * через deferred close — комментарий в partialProfit обещает, что «сам
 * финальный партиал-коммит не теряется». Крэш между partialProfit(100%) и
 * следующим tick не должен нарушать это обещание: очередь восстанавливается
 * вместе со снапшотом _closedSignal и дренится после рестарта.
 */
test("RECOVERY: final partial-profit commit of a full partial close survives a crash", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "recovery-fullpartial-strategy",
    exchangeName: "binance-recovery-fullpartial",
    frameName: "",
  };

  let signalGenerated = false;
  let afterRestart = false;
  const commitsAfterRestart = [];
  let closeNote = null;

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "recovery full partial",
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (!afterRestart) return;
    commitsAfterRestart.push(event.action);
    if (event.action === "close-pending") closeNote = event.note;
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

    // 100% партиал экономически закрывает позицию: pending → _closedSignal,
    // финальный partial-profit commit остаётся в очереди до следующего tick
    const partial = await inCtx(context, () => lib.strategyCoreService.partialProfit(false, "BTCUSDT", 100, basePrice + 1000, context));
    if (!partial) {
      fail(`partialProfit(100%) must execute`);
      return;
    }

    await crash(context);
    afterRestart = true;

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "closed") {
      fail(`post-restart tick expected closed/"closed" (full partial close drained), got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (!commitsAfterRestart.includes("partial-profit")) {
      fail(`REGRESSION: final partial-profit commit of the full partial close lost in crash, got ${JSON.stringify(commitsAfterRestart)}`);
      return;
    }
    if (!commitsAfterRestart.includes("close-pending")) {
      fail(`close-pending commit expected after restart, got ${JSON.stringify(commitsAfterRestart)}`);
      return;
    }
    if (closeNote !== "full_partial_close") {
      fail(`close-pending note expected "full_partial_close", got ${JSON.stringify(closeNote)}`);
      return;
    }

    pass(`full partial close survived crash: final partial-profit commit drained, close-pending carries full_partial_close`);
  } finally {
    unsubscribeCommit();
    useDummy();
  }
});

/**
 * RECOVERY: транзитная риск-резервация (checkSignalAndReserve) НЕ должна
 * попадать на диск. Резервация живёт в общей риск-мапе между reserve и
 * addSignal/removeSignal ОДНОГО тика; но конкурентная стратегия, разделяющая
 * riskName, вызывает addSignal → _updatePositions персистит ВСЮ мапу. Если
 * плейсхолдер утёк на диск, крэш до финализации оставляет фантомный слот,
 * который блокирует общий лимит на весь lifetime сигнала (для
 * minuteEstimatedTime=Infinity — навсегда: чистка протухших слотов его
 * не удаляет, а removeSignal некому вызвать).
 */
test("RECOVERY: transient risk reservation is not persisted by a concurrent strategy's addSignal", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const riskName = "recovery-reserve-risk";
  const exchangeName = "binance-recovery-reserve";
  const strategyNameA = "recovery-reserve-a-strategy";
  const contextB = { strategyName: "recovery-reserve-b-strategy", exchangeName, frameName: "" };

  const keyA = `${strategyNameA}_${exchangeName}_BTCUSDT`;
  const keyB = `${contextB.strategyName}_${exchangeName}_BTCUSDT`;

  makeExchange(exchangeName, () => basePrice);
  addRiskSchema({ riskName, validations: [] });
  addStrategySchema({
    strategyName: contextB.strategyName,
    interval: "1m",
    riskName,
    getSignal: async () => ({
      position: "long",
      note: "recovery reserve b",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 300,
    }),
  });

  usePersist();
  PersistRiskAdapter.useJson();

  try {
    await resetPersist(contextB);
    await PersistRiskAdapter.writePositionData([], riskName, exchangeName, new Date(t0));
    await lib.riskConnectionService.clear();

    // Общий ClientRisk инстанс (тот же ключ riskName+exchange+frame+backtest,
    // что использует стратегия B)
    const riskConn = Object.getPrototypeOf(lib.riskConnectionService);
    const risk = riskConn.getRisk(riskName, exchangeName, "", false);

    // Стратегия A: резервация сделана (GET_SIGNAL_FN прошёл риск-чек), а
    // addSignal ещё НЕ вызван — A «висит» на sync-open подтверждении брокера
    const inExec = (fn) => ExecutionContextService.runInContext(fn, {
      when: new Date(t0), symbol: "BTCUSDT", backtest: false,
    });
    const reserved = await inExec(() => risk.checkSignalAndReserve({
      currentSignal: {
        id: "recovery-reserve-a-id",
        position: "long",
        priceOpen: basePrice - 10000,
        priceStopLoss: basePrice - 12000,
        priceTakeProfit: basePrice + 5000,
        minuteEstimatedTime: Infinity,
        _isScheduled: true,
      },
      symbol: "BTCUSDT",
      strategyName: strategyNameA,
      exchangeName,
      frameName: "",
      riskName,
      currentPrice: basePrice,
      timestamp: t0,
    }));
    if (!reserved) {
      fail(`checkSignalAndReserve expected to allow and reserve for strategy A`);
      return;
    }

    // Конкурентная стратегия B открывается штатно → addSignal персистит мапу
    const tickB = await makeRunTick(contextB)(new Date(t0));
    if (tickB.action !== "opened") {
      fail(`strategy B tick expected "opened", got "${tickB.action}"`);
      return;
    }

    // Диск: слот B есть, транзитный плейсхолдер A — НЕТ. Если он утёк, крэш
    // до финализации оставит вечный фантом (Infinity не чистится по expiry)
    const persistedMid = await PersistRiskAdapter.readPositionData(riskName, exchangeName, new Date(t0));
    const keysMid = persistedMid.map(([key]) => key);
    if (!keysMid.includes(keyB)) {
      fail(`strategy B slot expected in persisted risk map, got ${JSON.stringify(keysMid)}`);
      return;
    }
    if (keysMid.includes(keyA)) {
      fail(`REGRESSION: transient reservation of strategy A leaked to disk via concurrent addSignal — a crash now leaves an eternal phantom slot, got ${JSON.stringify(keysMid)}`);
      return;
    }

    // Резервация видима конкурентным чекам в памяти (это её назначение)
    if (risk._activePositions.size !== 2) {
      fail(`in-memory map expected 2 entries (reservation + B), got ${risk._activePositions.size}`);
      return;
    }

    // Финализация A (addSignal) переводит плейсхолдер в реальный слот — теперь персистится
    await inExec(() => risk.addSignal("BTCUSDT",
      { strategyName: strategyNameA, riskName, exchangeName, frameName: "" },
      { position: "long", priceOpen: basePrice - 10000, priceStopLoss: basePrice - 12000, priceTakeProfit: basePrice + 5000, minuteEstimatedTime: 300, openTimestamp: t0 },
    ));
    const persistedFinal = await PersistRiskAdapter.readPositionData(riskName, exchangeName, new Date(t0));
    const keysFinal = persistedFinal.map(([key]) => key);
    if (!keysFinal.includes(keyA) || !keysFinal.includes(keyB)) {
      fail(`finalized slots A and B both expected on disk, got ${JSON.stringify(keysFinal)}`);
      return;
    }

    pass(`transient reservation stayed in-memory only (concurrent persist excluded it), finalized addSignal persisted normally`);
  } finally {
    PersistRiskAdapter.useDummy();
    useDummy();
  }
});

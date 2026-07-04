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

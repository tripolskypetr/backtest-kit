import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addRiskSchema,
  Backtest,
  listenDoneBacktest,
  listenSignalBacktest,
  listenScheduleEvent,
  listenStrategyCommit,
  listenSync,
  listenCheck,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * GAUNTLET #1: полный жизненный цикл scheduled с отказом на КАЖДОМ гейте (live, "1h").
 *
 * 1. tick #1: размещение resting-ордера отвергнуто (onOrderSync type "schedule") →
 *    scheduled НЕ зарегистрирован, троттл откачен → idle.
 * 2. tick #2 (+1 мин, тот же час): размещение принято → "scheduled".
 * 3. tick #3: мониторинг → "waiting".
 * 4. Цена касается priceOpen; tick #4: активация отвергнута sync (type "active") →
 *    ТЕРМИНАЛЬНАЯ отмена (cancelled + commit до брокера), НЕ retry → idle.
 * 5. tick #5 (тот же час): троттл потреблён, активация не ретраится, getSignal
 *    не вызывается → idle, размещений не прибавилось.
 * 6. tick #6 (следующий час): новый сигнал → размещение принято → "scheduled".
 * 7. tick #7: активация принята → "opened" по priceOpen.
 */
test("GAUNTLET: scheduled lifecycle survives placement reject and terminal activation reject", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const HOUR = 3600_000;
  const MIN = 60_000;

  const context = {
    strategyName: "gauntlet-lifecycle-strategy",
    exchangeName: "binance-gauntlet-lifecycle",
    frameName: "",
  };

  let marketPrice = basePrice;
  let scheduleOpenCalls = 0;
  let activeOpenCalls = 0;
  const scheduleEvents = [];

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: marketPrice,
          high: marketPrice,
          low: marketPrice,
          close: marketPrice,
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
    interval: "1h",
    getSignal: async () => ({
      id: "gauntlet-lifecycle-id",
      position: "long",
      note: "gauntlet lifecycle",
      priceOpen,
      priceTakeProfit: priceOpen + 4000,
      priceStopLoss: priceOpen - 2000,
      minuteEstimatedTime: 600,
    }),
  });

  const unsubscribeSchedule = listenScheduleEvent((event) => {
    if (event.strategyName !== context.strategyName) return;
    scheduleEvents.push({ action: event.action, reason: event.reason });
  });

  const unsubscribeSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open") return;
    if (event.type === "schedule") {
      scheduleOpenCalls += 1;
      if (scheduleOpenCalls === 1) {
        throw new Error("gauntlet: exchange rejected resting order placement");
      }
    }
    if (event.type === "active") {
      activeOpenCalls += 1;
      if (activeOpenCalls === 1) {
        throw new Error("gauntlet: exchange rejected activation fill");
      }
    }
  }, true);

  try {
    const runTick = (when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    const actions = [];

    // #1: размещение отвергнуто
    actions.push((await runTick(new Date(t0))).action);
    // #2: размещение принято (тот же час — работает откат троттла)
    actions.push((await runTick(new Date(t0 + 1 * MIN))).action);
    // #3: мониторинг
    actions.push((await runTick(new Date(t0 + 2 * MIN))).action);
    // #4: цена у priceOpen — активация отвергнута sync → терминальная отмена
    marketPrice = priceOpen;
    actions.push((await runTick(new Date(t0 + 3 * MIN))).action);
    // #5: терминальность — тот же час, getSignal заглушен троттлом
    actions.push((await runTick(new Date(t0 + 4 * MIN))).action);
    const placementsAfterCancel = scheduleOpenCalls;
    // #6: новый час — новый сигнал, размещение принято
    marketPrice = basePrice;
    actions.push((await runTick(new Date(t0 + HOUR))).action);
    // #7: активация принята → открытие
    marketPrice = priceOpen;
    const tick7 = await runTick(new Date(t0 + HOUR + 1 * MIN));
    actions.push(tick7.action);

    const expected = ["idle", "scheduled", "waiting", "idle", "idle", "scheduled", "opened"];
    if (JSON.stringify(actions) !== JSON.stringify(expected)) {
      fail(`tick actions mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actions)}`);
      return;
    }

    if (placementsAfterCancel !== 2) {
      fail(`REGRESSION: activation reject must be terminal — expected 2 placement syncs before hour boundary, got ${placementsAfterCancel}`);
      return;
    }
    if (scheduleOpenCalls !== 3 || activeOpenCalls !== 2) {
      fail(`sync call counts mismatch: schedule=${scheduleOpenCalls} (expected 3), active=${activeOpenCalls} (expected 2)`);
      return;
    }

    const eventActions = scheduleEvents.map((e) => e.action);
    if (JSON.stringify(eventActions) !== JSON.stringify(["scheduled", "cancelled", "scheduled"])) {
      fail(`schedule events mismatch: expected [scheduled, cancelled, scheduled], got ${JSON.stringify(eventActions)}`);
      return;
    }
    if (scheduleEvents[1].reason !== "user") {
      fail(`cancelled event reason expected "user", got "${scheduleEvents[1].reason}"`);
      return;
    }

    if (tick7.signal.priceOpen !== priceOpen) {
      fail(`opened priceOpen expected ${priceOpen} (limit fill price), got ${tick7.signal.priceOpen}`);
      return;
    }

    pass(`lifecycle survived both gates: ${actions.join(" → ")}, events ${eventActions.join("/")}`);
  } finally {
    unsubscribeSchedule();
    unsubscribeSync();
  }
});

/**
 * GAUNTLET #2: гонка stopStrategy ВНУТРИ активации — дедуп cancel-эмиссий.
 *
 * stopStrategy вызывается из sync-гейта активации (await-точка внутри
 * ACTIVATE_SCHEDULED_SIGNAL_FN): конвертирует scheduled → _cancelledSignal.
 * Затем гейт отвергает открытие → терминальная ветка вызывает
 * setScheduledSignal(null), которое ЗАТИРАЕТ отложенную отмену (дедуп), и сама
 * синхронно эмитит cancel-пару. Итог: ровно ОДНО «cancelled» на каждом канале
 * (scheduleEvent + commit), дренаж на следующем tick дубля не даёт.
 */
test("GAUNTLET: stopStrategy racing activation gate emits exactly one cancellation", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "gauntlet-stop-race-strategy",
    exchangeName: "binance-gauntlet-stop-race",
    frameName: "",
  };

  let marketPrice = basePrice;
  let signalGenerated = false;
  const cancelledEvents = [];
  const cancelCommits = [];

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: marketPrice,
          high: marketPrice,
          low: marketPrice,
          close: marketPrice,
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
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "gauntlet stop race",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribeSchedule = listenScheduleEvent((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action === "cancelled") cancelledEvents.push(event);
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action === "cancel-scheduled") cancelCommits.push(event);
  });

  // Гонка: на sync-гейте активации (внутри await-цепочки tick #2) прилетает
  // stopStrategy, затем гейт отвергает открытие
  const unsubscribeSync = listenSync(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.stopStrategy(false, "BTCUSDT", context),
      context,
    );
    throw new Error("gauntlet: broker rejected fill while strategy was being stopped");
  }, true);

  try {
    const runTick = (when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    marketPrice = priceOpen;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "idle") {
      fail(`tick #2 expected "idle" (activation rejected mid-stop), got "${tick2.action}"`);
      return;
    }

    // Дренаж следующего tick НЕ должен дать второй эмиссии
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "idle") {
      fail(`tick #3 expected "idle" (stopped, deferred cancel deduped), got "${tick3.action}"`);
      return;
    }

    if (cancelledEvents.length !== 1) {
      fail(`REGRESSION: expected exactly 1 "cancelled" schedule event (dedup), got ${cancelledEvents.length}`);
      return;
    }
    if (cancelCommits.length !== 1) {
      fail(`REGRESSION: expected exactly 1 "cancel-scheduled" commit (dedup), got ${cancelCommits.length}`);
      return;
    }

    pass(`stopStrategy race deduped: 1 schedule event + 1 commit, tick #3 idle`);
  } finally {
    unsubscribeSchedule();
    unsubscribeCommit();
    unsubscribeSync();
  }
});

/**
 * GAUNTLET #3: backtest переживает risk-reject на wick-активации и ПРОДОЛЖАЕТ прогон.
 *
 * Сигнал #1: scheduled → wick-активация → риск отвергает (2-й вызов валидации) →
 * корректный «cancelled» (reason user), БЕЗ фатала «no pending signal after
 * scheduled activation». Сигнал #2: scheduled → активация проходит → позиция
 * живёт и закрывается по time_expired. Порядок результатов и счётчик риска строгие.
 */
test("GAUNTLET: backtest continues after activation risk-reject and completes next signal", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "gauntlet-bt-continue-strategy",
    exchangeName: "binance-gauntlet-bt-continue",
    frameName: "40m-gauntlet-bt-continue",
  };

  let riskAttempts = 0;
  let signalsIssued = 0;
  const results = [];
  const scheduleEvents = [];

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MIN;
        // С 10-й минуты каждая свеча пробивает priceOpen виком (не задевая SL)
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

  addRiskSchema({
    riskName: "gauntlet-bt-continue-risk",
    validations: [
      () => {
        riskAttempts += 1;
        // 1: резервация сигнала #1; 2: активация #1 (ОТКАЗ);
        // 3: резервация сигнала #2; 4: активация #2 (проходит)
        if (riskAttempts === 2) {
          throw new Error("gauntlet: risk rejects first activation");
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    riskName: "gauntlet-bt-continue-risk",
    getSignal: async () => {
      if (signalsIssued >= 2) return null;
      signalsIssued += 1;
      return {
        position: "long",
        note: `gauntlet bt continue #${signalsIssued}`,
        priceOpen,
        // TP выше рынка (VWAP ~50000): вход по вику на 40000 не должен
        // мгновенно закрыться take_profit'ом — ждём time_expired
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
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const unsubscribeSignal = listenSignalBacktest((result) => {
    if (result.strategyName !== context.strategyName) return;
    results.push({ action: result.action, reason: result.reason, closeReason: result.closeReason });
  });

  const unsubscribeSchedule = listenScheduleEvent((event) => {
    if (event.strategyName !== context.strategyName) return;
    scheduleEvents.push(event.action);
  });

  try {
    const awaitSubject = new Subject();
    listenDoneBacktest(() => awaitSubject.next());

    Backtest.background("BTCUSDT", context);

    await awaitSubject.toPromise();

    const terminal = results.filter((r) => r.action === "cancelled" || r.action === "closed");
    if (terminal.length !== 2) {
      fail(`expected exactly 2 terminal results (cancelled + closed), got ${JSON.stringify(results)}`);
      return;
    }
    if (terminal[0].action !== "cancelled" || terminal[0].reason !== "user") {
      fail(`first terminal result expected cancelled/user (risk-rejected activation), got ${JSON.stringify(terminal[0])}`);
      return;
    }
    if (terminal[1].action !== "closed" || terminal[1].closeReason !== "time_expired") {
      fail(`second terminal result expected closed/time_expired, got ${JSON.stringify(terminal[1])}`);
      return;
    }

    if (riskAttempts !== 4) {
      fail(`expected exactly 4 risk validation calls (reserve+reject+reserve+pass), got ${riskAttempts}`);
      return;
    }

    const cancelledEvents = scheduleEvents.filter((a) => a === "cancelled").length;
    if (cancelledEvents !== 1) {
      fail(`expected exactly 1 cancelled schedule event, got ${cancelledEvents} (${JSON.stringify(scheduleEvents)})`);
      return;
    }

    pass(`backtest survived activation risk-reject: cancelled/user → closed/time_expired, riskAttempts=${riskAttempts}`);
  } finally {
    unsubscribeSignal();
    unsubscribeSchedule();
  }
});

/**
 * GAUNTLET #4: отказ order-check (type "active") закрывает позицию с reason
 * "closed" и ПОЛНОСТЬЮ освобождает состояние — следующий сигнал открывается.
 *
 * Проверяет teardown CLOSE_PENDING_SIGNAL_AS_CLOSED_FN: риск-слот снят,
 * whipsaw не блокирует (новый id), состояние partial/breakeven очищено.
 */
test("GAUNTLET: failed active order-check closes position and releases state for the next open", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "gauntlet-check-close-strategy",
    exchangeName: "binance-gauntlet-check-close",
    frameName: "",
  };

  let checkCalls = 0;

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: basePrice,
          high: basePrice,
          low: basePrice,
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
    // Без id — каждый сигнал получает случайный id (whipsaw не должен мешать)
    getSignal: async () => ({
      position: "long",
      note: "gauntlet check close",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 120,
    }),
  });

  const unsubscribeCheck = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.type !== "active") return;
    checkCalls += 1;
    if (checkCalls === 1) {
      throw new Error("gauntlet: order vanished from exchange");
    }
  }, true);

  try {
    const runTick = (when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }
    const firstId = tick1.signal.id;

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "closed") {
      fail(`tick #2 expected closed/"closed" (order-check failed), got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (tick2.signal.id !== firstId) {
      fail(`closed signal id mismatch: expected ${firstId}, got ${tick2.signal.id}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "opened") {
      fail(`REGRESSION: tick #3 expected "opened" (state fully released after check-close), got "${tick3.action}"`);
      return;
    }
    if (tick3.signal.id === firstId) {
      fail(`tick #3 opened the SAME id ${firstId} — expected a fresh signal`);
      return;
    }

    if (checkCalls !== 1) {
      fail(`expected exactly 1 active order-check before close, got ${checkCalls}`);
      return;
    }

    pass(`active check failure closed ${firstId} with "closed" and a fresh position opened next tick`);
  } finally {
    unsubscribeCheck();
  }
});

/**
 * GAUNTLET #5: каскад отказов открытия — risk-reject, затем sync-reject, затем
 * успех — на ТРЁХ последовательных tick внутри одного "1h"-интервала.
 *
 * Проверяет, что оба отката троттла (_lastSignalTimestamp) работают вместе:
 * ветка риска в GET_SIGNAL_FN и ветка sync в OPEN_NEW_PENDING_SIGNAL_FN, и что
 * детерминированный id не блокируется whipsaw до успешного открытия.
 */
test("GAUNTLET: risk-reject then sync-reject then success on three consecutive ticks", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "gauntlet-cascade-strategy",
    exchangeName: "binance-gauntlet-cascade",
    frameName: "",
  };

  let riskAttempts = 0;
  let activeSyncCalls = 0;

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: basePrice,
          high: basePrice,
          low: basePrice,
          close: basePrice,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "gauntlet-cascade-risk",
    validations: [
      () => {
        riskAttempts += 1;
        if (riskAttempts === 1) {
          throw new Error("gauntlet: risk rejects attempt #1");
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1h",
    riskName: "gauntlet-cascade-risk",
    getSignal: async () => ({
      id: "gauntlet-cascade-id",
      position: "long",
      note: "gauntlet cascade",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 120,
    }),
  });

  const unsubscribeSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    activeSyncCalls += 1;
    if (activeSyncCalls === 1) {
      throw new Error("gauntlet: broker rejects attempt #2");
    }
  }, true);

  try {
    const runTick = (when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (risk-rejected), got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "idle") {
      fail(`tick #2 expected "idle" (sync-rejected), got "${tick2.action}"`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "opened") {
      fail(`REGRESSION: tick #3 expected "opened" within the same 1h interval, got "${tick3.action}"`);
      return;
    }
    if (tick3.signal.id !== "gauntlet-cascade-id") {
      fail(`opened id expected "gauntlet-cascade-id", got "${tick3.signal.id}"`);
      return;
    }

    // Риск: #1 отказ, #2 проход (tick #2), #3 проход (tick #3)
    if (riskAttempts !== 3) {
      fail(`expected exactly 3 risk validation calls (reject+pass+pass), got ${riskAttempts}`);
      return;
    }
    // Sync: #1 отказ (tick #2), #2 проход (tick #3)
    if (activeSyncCalls !== 2) {
      fail(`expected exactly 2 active sync calls (reject+pass), got ${activeSyncCalls}`);
      return;
    }

    pass(`cascade recovered within one hour: idle → idle → opened (risk=${riskAttempts}, sync=${activeSyncCalls})`);
  } finally {
    unsubscribeSync();
  }
});

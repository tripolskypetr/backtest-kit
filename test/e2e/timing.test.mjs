import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
  PersistSignalAdapter,
  Live,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { Subject, createAwaiter, sleep } from "functools-kit";

/**
 * КРИТИЧЕСКАЯ ПРОБЛЕМА: Scheduled signal преждевременно закрывается по time_expired
 *
 * Проблема:
 * 1. Scheduled signal создается в момент времени T1 (scheduledAt = T1)
 * 2. Signal активируется (становится pending) в момент времени T2 (pendingAt = T2)
 * 3. БЫЛ БАГ: minuteEstimatedTime отсчитывался от scheduledAt вместо pendingAt
 * 4. РЕЗУЛЬТАТ: Сигнал закрывался преждевременно, неся финансовые потери на комиссии
 *
 * Этот тест воспроизводит проблему:
 * - Scheduled signal создается и ждет активации
 * - Активация происходит через некоторое время (имитация задержки)
 * - minuteEstimatedTime = 60 минут ПОСЛЕ активации
 * - Если БАГ: сигнал закроется почти сразу (т.к. время считается от scheduledAt)
 * - Если ФИКС: сигнал работает полные 60 минут от момента активации (от pendingAt)
 */
test("Scheduled signal minuteEstimatedTime counts from pendingAt (activation time), NOT from scheduledAt", async ({ pass, fail }) => {

  let scheduledTimestamp = null;
  let activationTimestamp = null;
  let closeTimestamp = null;
  let closeReason = null;

  addExchange({
    exchangeName: "binance-scheduled-timing-bug",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-scheduled-timing-bug",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "scheduled timing bug test",
        priceOpen: price - 150, // Между VWAP и low, станет scheduled и активируется
        priceTakeProfit: price * 1000, // Нереально высокая цена, никогда не достигнется
        priceStopLoss: price / 1000, // Нереально низкая цена, никогда не достигнется
        minuteEstimatedTime: 1440,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice, backtest) => {
        scheduledTimestamp = data.scheduledAt;
        // console.log(`[SCHEDULED] scheduledAt=${data.scheduledAt}, pendingAt=${data.pendingAt}`);
      },
      onOpen: (symbol, data, currentPrice, backtest) => {
        activationTimestamp = data.pendingAt;
        // console.log(`[OPENED] scheduledAt=${data.scheduledAt}, pendingAt=${data.pendingAt}`);
        // console.log(`[OPENED] Delay between schedule and activation: ${activationTimestamp - scheduledTimestamp}ms`);
      },
      onClose: (symbol, data, priceClose, backtest) => {
        closeTimestamp = Date.now();
        closeReason = "time_expired"; // В этом тесте ждем именно time_expired
        // console.log(`[CLOSED] closeReason=${closeReason}`);
        // console.log(`[CLOSED] scheduledAt=${data.scheduledAt}, pendingAt=${data.pendingAt}`);
        // console.log(`[CLOSED] Signal duration from scheduledAt: ${closeTimestamp - data.scheduledAt}ms`);
        // console.log(`[CLOSED] Signal duration from pendingAt: ${closeTimestamp - data.pendingAt}ms`);
      },
    },
  });

  // Используем минутный фрейм для теста
  // КРИТИЧНО: Frame должен быть достаточно большим чтобы последний сигнал успел закрыться
  // Сигнал живёт 1440 минут + ждёт активации до 120 минут = 1560 минут максимум
  // Добавляем запас: 4 дня = 5760 минут
  addFrame({
    frameName: "4d-scheduled-timing",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-05T00:00:00Z"), // 4 дня = 5760 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let closedResult = null;

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      closedResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-timing-bug",
    exchangeName: "binance-scheduled-timing-bug",
    frameName: "4d-scheduled-timing",
  });

  await awaitSubject.toPromise();

  if (!closedResult) {
    fail("Signal was not closed (expected time_expired)");
    return;
  }

  if (!scheduledTimestamp || !activationTimestamp) {
    fail("Missing scheduled or activation timestamps");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА:
  // Рассчитываем реальную длительность сигнала от момента активации
  const actualDurationFromActivation = closedResult.closeTimestamp - closedResult.signal.pendingAt;
  const expectedDuration = 1440 * 60 * 1000; // 1440 минут (24 часа) в миллисекундах
  const tolerance = 60 * 60 * 1000; // Допуск ±60 минут

  // console.log(`\n=== TIMING ANALYSIS ===`);
  // console.log(`Expected duration (from pendingAt): ${expectedDuration}ms (1440 minutes / 24 hours)`);
  // console.log(`Actual duration (from pendingAt): ${actualDurationFromActivation}ms`);
  // console.log(`Difference: ${Math.abs(actualDurationFromActivation - expectedDuration)}ms`);
  // console.log(`Tolerance: ±${tolerance}ms (60 minutes)`);

  // Проверяем что сигнал работал примерно 1440 минут (24 часа) от момента активации
  const durationCorrect = Math.abs(actualDurationFromActivation - expectedDuration) <= tolerance;

  if (durationCorrect && closedResult.closeReason === "time_expired") {
    pass(`FIX VERIFIED: Signal ran for ~24 hours from activation (pendingAt). Actual: ${(actualDurationFromActivation / 3600000).toFixed(1)} hours`);
    return;
  }

  // Если длительность намного меньше ожидаемой - это БАГ
  if (actualDurationFromActivation < expectedDuration - tolerance) {
    fail(`BUG REPRODUCED: Signal closed prematurely! Ran only ${(actualDurationFromActivation / 3600000).toFixed(1)} hours instead of 24 hours from activation. This causes financial losses on fees!`);
    return;
  }

  fail(`Unexpected result: duration=${(actualDurationFromActivation / 60000).toFixed(1)}min, closeReason=${closedResult.closeReason}`);

});

/**
 * Тест: Immediate signal (без priceOpen) должен работать как раньше
 * scheduledAt = pendingAt = текущее время
 */
test("Immediate signal (no priceOpen) has scheduledAt = pendingAt", async ({ pass, fail }) => {

  let signalData = null;

  addExchange({
    exchangeName: "binance-immediate-timing",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-immediate-timing",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      // Immediate signal - priceOpen НЕ указан
      return {
        position: "long",
        note: "immediate timing test",
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 30,
      };
    },
    callbacks: {
      onOpen: (symbol, data, currentPrice, backtest) => {
        signalData = data;
        // console.log(`[IMMEDIATE] scheduledAt=${data.scheduledAt}, pendingAt=${data.pendingAt}`);
        // console.log(`[IMMEDIATE] Are they equal? ${data.scheduledAt === data.pendingAt}`);
      },
    },
  });

  addFrame({
    frameName: "1h-immediate-timing",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-immediate-timing",
    exchangeName: "binance-immediate-timing",
    frameName: "1h-immediate-timing",
  });

  await awaitSubject.toPromise();

  if (!signalData) {
    fail("Signal was not opened");
    return;
  }

  // Для immediate signal scheduledAt должен равняться pendingAt
  if (signalData.scheduledAt === signalData.pendingAt) {
    pass(`Immediate signal correct: scheduledAt = pendingAt = ${signalData.pendingAt}`);
    return;
  }

  fail(`Immediate signal broken: scheduledAt=${signalData.scheduledAt} !== pendingAt=${signalData.pendingAt}`);

});

/**
 * Тест: Проверка что scheduledAt и pendingAt присутствуют в сигнале
 */
test("Signal has both scheduledAt and pendingAt fields", async ({ pass, fail }) => {

  let scheduledSignalData = null;
  let openedSignalData = null;

  addExchange({
    exchangeName: "binance-fields-check",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-fields-check",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "fields check test",
        priceOpen: price - 200,
        priceTakeProfit: price + 10000,
        priceStopLoss: price - 10000,
        minuteEstimatedTime: 1440,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice, backtest) => {
        scheduledSignalData = data;
      },
      onOpen: (symbol, data, currentPrice, backtest) => {
        openedSignalData = data;
      },
    },
  });

  addFrame({
    frameName: "2d-fields-check",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-03T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-fields-check",
    exchangeName: "binance-fields-check",
    frameName: "2d-fields-check",
  });

  await awaitSubject.toPromise();

  if (!scheduledSignalData || !openedSignalData) {
    fail("Signal was not scheduled or opened");
    return;
  }

  const hasFieldsScheduled =
    typeof scheduledSignalData.scheduledAt === "number" &&
    typeof scheduledSignalData.pendingAt === "number";

  const hasFieldsOpened =
    typeof openedSignalData.scheduledAt === "number" &&
    typeof openedSignalData.pendingAt === "number";

  if (hasFieldsScheduled && hasFieldsOpened) {
    pass(`Both scheduledAt and pendingAt fields present in scheduled and opened signals`);
    return;
  }

  fail(`Missing fields: scheduled=${hasFieldsScheduled}, opened=${hasFieldsOpened}`);

});

/**
 * Тест восстановления PENDING сигнала из персистентного хранилища
 * с сохранением корректного pendingAt для расчёта minuteEstimatedTime
 */
test("Restored pending signal preserves 24h timing from pendingAt", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  // Создаём сигнал который был активирован 12 часов назад
  // Должен закрыться через 12 часов (total 24h from pendingAt)
  const now = Date.now();
  const twelveHoursAgo = now - 12 * 60 * 60 * 1000;
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {
    }
    async readValue() {
      const price = await getAveragePrice("BTCUSDT");
      return {
        id: "restored-pending-signal-id",
        position: "long",
        note: "restored pending signal - 24h timing test",
        priceOpen: price,
        priceTakeProfit: price * 1000, // Никогда не достигнется
        priceStopLoss: price / 1000, // Никогда не достигнется
        minuteEstimatedTime: 1440, // 24 часа
        exchangeName: "binance-restore-pending",
        strategyName: "test-strategy-restore-pending",
        scheduledAt: twentyFourHoursAgo, // Был создан 24 часа назад
        pendingAt: twelveHoursAgo, // Активирован 12 часов назад
        symbol: "BTCUSDT",
        _isScheduled: false,
      };
    }
    async hasValue() {
      return true;
    }
    async writeValue() {
    }
  });

  addExchange({
    exchangeName: "binance-restore-pending",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-restore-pending",
    interval: "1m",
    getSignal: async () => null, // Не генерируем новые сигналы
    callbacks: {
      onActive: (symbol, data, currentPrice, backtest) => {
        // console.log(`[RESTORED PENDING] pendingAt=${data.pendingAt}, scheduledAt=${data.scheduledAt}`);

        const elapsedTime = Date.now() - data.pendingAt;
        const expectedTime = 1440 * 60 * 1000; // 24 часа
        const remainingTime = expectedTime - elapsedTime;

        // console.log(`[RESTORED PENDING] Elapsed: ${(elapsedTime / 3600000).toFixed(1)}h, Remaining: ${(remainingTime / 3600000).toFixed(1)}h`);

        // Проверяем что осталось примерно 12 часов
        const isCorrect = Math.abs(remainingTime - 12 * 60 * 60 * 1000) < 60 * 60 * 1000; // ±1 час

        if (isCorrect) {
          resolve({ success: true, remainingTime });
        } else {
          resolve({ success: false, remainingTime });
        }
      },
    },
  });

  const cancel = await Live.background("BTCUSDT", {
    strategyName: "test-strategy-restore-pending",
    exchangeName: "binance-restore-pending",
  });

  const result = await awaiter;

  await cancel();

  if (result.success) {
    pass(`Restored pending signal has correct timing: ~12h remaining (${(result.remainingTime / 3600000).toFixed(1)}h)`);
    return;
  }

  fail(`Restored pending signal timing incorrect: ${(result.remainingTime / 3600000).toFixed(1)}h remaining instead of ~12h`);

});

/**
 * КРИТИЧЕСКИЙ ТЕСТ: Scheduled signal должен закрываться по timeout
 *
 * Проблема:
 * - Scheduled signal создается и ждет активации (достижения priceOpen)
 * - Если цена НИКОГДА не достигает priceOpen, сигнал должен закрыться по timeout
 * - Timeout = GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES (по умолчанию 120 минут)
 * - Timeout считается от scheduledAt (времени создания scheduled сигнала)
 *
 * Этот тест проверяет:
 * - Scheduled signal создается с priceOpen который НИКОГДА не будет достигнут
 * - Через 120 минут (CC_SCHEDULE_AWAIT_MINUTES) сигнал должен закрыться с action="cancelled"
 * - Если сигнал НЕ закрылся - это БАГ, деньги зависнут в несуществующем сигнале
 */
test("Scheduled signal closes by timeout when price never reaches priceOpen", async ({ pass, fail }) => {

  let scheduledTimestamp = null;
  let cancelledTimestamp = null;
  let cancelledResult = null;
  let signalGenerated = false; // Флаг чтобы сгенерировать сигнал только один раз

  addExchange({
    exchangeName: "binance-scheduled-timeout",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-scheduled-timeout",
    interval: "1m",
    getSignal: async () => {
      // Генерируем сигнал ТОЛЬКО ОДИН РАЗ в начале
      if (signalGenerated) {
        return null;
      }
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "scheduled timeout test - price will NEVER reach priceOpen",
        priceOpen: price - 5000, // Ниже текущей, но цена НИКОГДА не упадет так низко
        priceTakeProfit: price - 4000,
        priceStopLoss: price - 6000, // SL еще ниже
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice, backtest) => {
        scheduledTimestamp = data.scheduledAt;
        // console.log(`[SCHEDULED] scheduledAt=${data.scheduledAt}, priceOpen=${data.priceOpen}, currentPrice=${currentPrice}`);
      },
      onCancel: (symbol, data, currentPrice, backtest) => {
        cancelledTimestamp = Date.now();
        // console.log(`[CANCELLED] Scheduled signal cancelled by timeout`);
        // console.log(`[CANCELLED] scheduledAt=${data.scheduledAt}, cancelledAt=${cancelledTimestamp}`);
        // console.log(`[CANCELLED] Wait time: ${(cancelledTimestamp - data.scheduledAt) / 60000} minutes`);
      },
    },
  });

  // Frame: 3 часа (180 минут) - больше чем CC_SCHEDULE_AWAIT_MINUTES (120 минут)
  addFrame({
    frameName: "3h-scheduled-timeout",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T03:00:00Z"), // 3 часа
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "cancelled") {
      cancelledResult = result;
      // console.log(`[TEST] Received cancelled result: closeTimestamp=${result.closeTimestamp}, scheduledAt=${result.signal.scheduledAt}`);
      // console.log(`[TEST] Calculated wait time: ${result.closeTimestamp - result.signal.scheduledAt}ms (${((result.closeTimestamp - result.signal.scheduledAt) / 60000).toFixed(1)} minutes)`);
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-timeout",
    exchangeName: "binance-scheduled-timeout",
    frameName: "3h-scheduled-timeout",
  });

  await awaitSubject.toPromise();

  if (!cancelledResult) {
    fail("Scheduled signal was NOT cancelled by timeout - BUG! Signal will hang forever, blocking risk limits!");
    return;
  }

  if (!scheduledTimestamp) {
    fail("Missing scheduledAt timestamp");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА:
  // Время от scheduledAt до closeTimestamp должно быть примерно 120 минут (CC_SCHEDULE_AWAIT_MINUTES)
  const actualWaitTime = cancelledResult.closeTimestamp - cancelledResult.signal.scheduledAt;
  const expectedWaitTime = 120 * 60 * 1000; // 120 минут в миллисекундах
  const tolerance = 10 * 60 * 1000; // Допуск ±10 минут

  // console.log(`\n=== SCHEDULED TIMEOUT ANALYSIS ===`);
  // console.log(`Expected timeout (from scheduledAt): ${expectedWaitTime}ms (120 minutes)`);
  // console.log(`Actual wait time (from scheduledAt): ${actualWaitTime}ms (${(actualWaitTime / 60000).toFixed(1)} minutes)`);
  // console.log(`Difference: ${Math.abs(actualWaitTime - expectedWaitTime)}ms`);
  // console.log(`Tolerance: ±${tolerance}ms (10 minutes)`);

  // Проверяем что сигнал ждал примерно 120 минут
  const timeoutCorrect = Math.abs(actualWaitTime - expectedWaitTime) <= tolerance;

  // await sleep(3_000)

  if (timeoutCorrect && cancelledResult.action === "cancelled") {
    pass(`FIX VERIFIED: Scheduled signal cancelled by timeout after ~120 minutes. Actual: ${(actualWaitTime / 60000).toFixed(1)} minutes`);
    return;
  }

  // Если закрылся слишком рано
  if (actualWaitTime < expectedWaitTime - tolerance) {
    fail(`BUG: Scheduled signal cancelled TOO EARLY! Waited only ${(actualWaitTime / 60000).toFixed(1)} minutes instead of ~120 minutes`);
    return;
  }

  // Если закрылся слишком поздно
  if (actualWaitTime > expectedWaitTime + tolerance) {
    fail(`BUG: Scheduled signal cancelled TOO LATE! Waited ${(actualWaitTime / 60000).toFixed(1)} minutes instead of ~120 minutes`);
    return;
  }

  fail(`Unexpected result: waitTime=${(actualWaitTime / 60000).toFixed(1)}min, action=${cancelledResult.action}`);

});
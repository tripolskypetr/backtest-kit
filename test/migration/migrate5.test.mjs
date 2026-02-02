import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addActionSchema,
  addRiskSchema,
  addWalkerSchema,
  Backtest,
  Walker,
  listenDoneBacktest,
  listenSchedulePing,
  listenError,
  listenWalkerComplete,
  listenSignalBacktest,
  listenBreakevenAvailable,
  ActionBase,
  Schedule,
  Heat,
  Performance,
  Partial,
  getDate,
  listenPartialProfitAvailable,
  listenPartialProfitAvailableOnce,
  listenPartialLossAvailable,
  listenPartialLossAvailableOnce,
  commitPartialProfit,
  setConfig,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * SEQUENCE TEST #13: LONG → TIME_EXPIRED → LONG → TP
 *
 * Сценарий:
 * - Сигнал #1: LONG → TIME_EXPIRED (закрытие по таймауту)
 * - Сигнал #2: LONG → TP (прибыль)
 *
 * Проверка: Различные closeReason работают корректно
 */
test("SEQUENCE: LONG→TIME_EXPIRED, LONG→TP - mixed closeReasons", async ({ pass, fail }) => {
  const results = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  let allCandles = [];

  // КРИТИЧНО: добавляем буферные свечи ПЕРЕД startTime для getAveragePrice
  // getAveragePrice запрашивает 5 свечей, которые могут быть ДО первого фрейма
  for (let i = -10; i < 0; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
  }

  // Предзаполняем начальные свечи для getAveragePrice (минимум 5)
  // ВАЖНО: low/high НЕ должны активировать LONG сигналы (low > priceOpen)
  for (let i = 0; i < 5; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }

  // Сигнал #1: LONG → TP (5-9 минут)
  // Ожидание активации (i=5-6): low > priceOpen, НЕ активируем
  for (let i = 5; i < 7; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }
  // Активация (i=7): low <= priceOpen, активируем LONG
  allCandles.push({ timestamp: startTime + 7 * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });

  // HIT TakeProfit (i=8-69): high >= priceTakeProfit=43000, Signal #1 закрывается
  // ВАЖНО: генерируем ДОСТАТОЧНО свечей для minuteEstimatedTime=60
  for (let i = 8; i < 70; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
  }

  // Промежуточные свечи i=70-79 (между Signal #1 закрытием и Signal #2 созданием)
  for (let i = 70; i < 80; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
  }

  // Сигнал #2: LONG → TIME_EXPIRED (80-145 минут, 60 минут жизни, не достигает TP/SL)
  // Ожидание активации (i=80-84)
  for (let i = 80; i < 85; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }
  // Активация (i=85)
  allCandles.push({ timestamp: startTime + 85 * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });

  // Мониторинг до TIME_EXPIRED (i=86-145) - НЕ пробиваем TP/SL
  for (let i = 86; i < 146; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
  }

  // Дополнительные свечи i=146-300 для завершения
  for (let i = 146; i < 300; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
  }

  addExchangeSchema({
    exchangeName: "binance-sequence-mixed-close",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategySchema({
    strategyName: "sequence-mixed-close-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalCount >= 2) return null;

      signalCount++;

      return {
        position: "long",
        note: `SEQUENCE signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "270m-sequence-mixed-close",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T05:00:00Z"),  // 300 минут с запасом для всех сигналов
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #13] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      results.push(result);
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "sequence-mixed-close-strategy",
    exchangeName: "binance-sequence-mixed-close",
    frameName: "270m-sequence-mixed-close",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #13] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (results.length !== 2) {
    fail(`Expected 2 closed signals, got ${results.length}`);
    return;
  }

  // Проверка #1: LONG → TP (Signal #1 закрылся первым)
  if (results[0].closeReason !== "take_profit") {
    fail(`Signal #1: Expected "take_profit", got "${results[0].closeReason}"`);
    return;
  }
  if (results[0].signal.position !== "long") {
    fail(`Signal #1: Expected LONG, got ${results[0].signal.position}`);
    return;
  }

  // Проверка #2: LONG → TIME_EXPIRED (Signal #2 закрылся вторым)
  if (results[1].closeReason !== "time_expired") {
    fail(`Signal #2: Expected "time_expired", got "${results[1].closeReason}"`);
    return;
  }
  if (results[1].signal.position !== "long") {
    fail(`Signal #2: Expected LONG, got ${results[1].signal.position}`);
    return;
  }

  pass(`SEQUENCE: 2 signals closed correctly. #1: LONG→TP, #2: LONG→TIME_EXPIRED. All closeReasons verified!`);
});


// PARTIAL FUNCTION: Multiple partialProfit calls (30% + 40%)
test("PARTIAL FUNCTION: Multiple partialProfit calls (30% + 40%)", async ({ pass, fail }) => {
  const { commitPartialProfit } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let firstPartialCalled = false;
  let secondPartialCalled = false;

  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-function-partial-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-function-partial-multiple",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Ожидание активации - цена НА или ВЫШЕ priceOpen
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i < 10) {
          // Активация - цена начинает расти
          const price = basePrice + 1000; // +1% от priceOpen для первого уровня
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        } else {
          // Рост до TP - +15% profit
          const price = basePrice + 15000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Первый вызов при 10%
        if (!firstPartialCalled && revenuePercent >= 10) {
          firstPartialCalled = true;
          try {
            await commitPartialProfit("BTCUSDT", 30);
          } catch (err) {
            // Ignore errors
          }
        }
        // Второй вызов при 20%
        else if (!secondPartialCalled && revenuePercent >= 20) {
          secondPartialCalled = true;
          try {
            await commitPartialProfit("BTCUSDT", 40);
          } catch (err) {
            // Ignore errors
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "130m-function-partial-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-partial-multiple",
    exchangeName: "binance-function-partial-multiple",
    frameName: "130m-function-partial-multiple",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!firstPartialCalled) {
    fail("First partialProfit was NOT called");
    return;
  }

  if (!secondPartialCalled) {
    fail("Second partialProfit was NOT called");
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-partial-multiple",
    exchangeName: "binance-function-partial-multiple",
    frameName: "130m-function-partial-multiple",
  });

  // console.log("[TEST #13] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #13] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  // console.log("[TEST #13] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 2) {
    fail(`Expected 2 partial closes, got ${signal._partial.length}`);
    return;
  }

  const partial1 = signal._partial[0];
  // console.log("[TEST #13] partial[0]:", JSON.stringify(partial1, null, 2));

  if (partial1.type !== "profit") {
    fail(`Expected first type 'profit', got '${partial1.type}'`);
    return;
  }

  if (partial1.percent !== 30) {
    fail(`Expected first percent 30, got ${partial1.percent}`);
    return;
  }

  if (typeof partial1.price !== "number") {
    fail(`Expected first price to be a number, got ${typeof partial1.price}`);
    return;
  }

  const partial2 = signal._partial[1];
  // console.log("[TEST #13] partial[1]:", JSON.stringify(partial2, null, 2));

  if (partial2.type !== "profit") {
    fail(`Expected second type 'profit', got '${partial2.type}'`);
    return;
  }

  if (partial2.percent !== 40) {
    fail(`Expected second percent 40, got ${partial2.percent}`);
    return;
  }

  if (typeof partial2.price !== "number") {
    fail(`Expected second price to be a number, got ${typeof partial2.price}`);
    return;
  }

  pass("MultiplecommitPartialProfit() WORKS: 30% + 40% = 70% closed, _partial field validated");
});


// Test #31
test("early termination with break stops backtest", async ({ pass, fail }) => {
  const basePrice = 95000;
  const intervalMs = 60000; // 1 minute

  addExchangeSchema({
    exchangeName: "binance-mock-early",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        result.push({
          timestamp,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-early",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "early termination test",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1_000,
        priceStopLoss: basePrice - 1_000,
        minuteEstimatedTime: 1,
      };
    },
  });

  addFrameSchema({
    frameName: "7d-backtest-early",
    interval: "1m", // Match strategy interval
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"), // 10 minutes for early termination test
  });

  // Listen to errors
  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
  });

  let signalCount = 0;

  try {
    for await (const result of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-early",
      exchangeName: "binance-mock-early",
      frameName: "7d-backtest-early",
    })) {
      signalCount++;

      if (signalCount >= 2) {
        // Stop after 2 signals
        break;
      }
    }
  } catch (error) {
    unsubscribeError();
    fail(`Error during backtest: ${error.message || error}`);
    return;
  }

  await sleep(500);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (signalCount === 2) {
    pass("Early termination stopped backtest after 2 signals");
    return;
  }

  fail(`Early termination failed: got ${signalCount} signals`);

});


// PERSIST: onWrite called EXACTLY ONCE per signal open
test("PERSIST: onWrite called EXACTLY ONCE per signal open", async ({ pass, fail }) => {
  let onWriteCallsWithSignal = 0;
  let onOpenCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;
  const bufferMinutes = 10;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Буферные свечи (6 минут ДО startTime)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  // Свечи от startTime (i=0-66) - 67 minutes
  for (let i = 0; i < 67; i++) {
    const timestamp = startTime + i * intervalMs;
    if (i < 10) {
      // Ожидание активации (цена выше priceOpen)
      allCandles.push({
        timestamp,
        open: basePrice + 500,
        high: basePrice + 600,
        low: basePrice + 400,
        close: basePrice + 500,
        volume: 100,
      });
    } else {
      // Активация и работа сигнала
      allCandles.push({
        timestamp,
        open: basePrice,
        high: basePrice + 100,
        low: basePrice - 100,
        close: basePrice,
        volume: 100,
      });
    }
  }

  addExchangeSchema({
    exchangeName: "binance-persist-write-once",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "persist-write-once-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "PERSIST: write once test",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: () => {
        onOpenCalled = true;
      },
      onWrite: (_symbol, signal) => {
        if (signal !== null) {
          onWriteCallsWithSignal++;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "70m-persist-write-once",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:07:00Z"), // 67 minutes (+2 for exclusive boundaries)
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #10] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-write-once-strategy",
    exchangeName: "binance-persist-write-once",
    frameName: "70m-persist-write-once",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #10] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!onOpenCalled) {
    fail("Signal was NOT opened");
    return;
  }

  if (onWriteCallsWithSignal !== 1) {
    fail(`CONCURRENCY BUG: onWrite(signal) called ${onWriteCallsWithSignal} times, expected EXACTLY 1. Possible race condition or duplicate persist writes!`);
    return;
  }

  pass(`PERSIST INTEGRITY: onWrite(signal) called exactly once per signal open. No duplicates, no race conditions.`);
});


// PERSIST: onWrite(null) called EXACTLY ONCE per signal close
test("PERSIST: onWrite(null) called EXACTLY ONCE per signal close", async ({ pass, fail }) => {
  let onWriteCallsWithNull = 0;
  let onCloseCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Буферные свечи (5 минуты ДО startTime)
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  // Свечи от startTime (i=0-69)
  for (let i = 0; i < 70; i++) {
    const timestamp = startTime + i * intervalMs;
    if (i < 10) {
      // Ожидание активации
      allCandles.push({
        timestamp,
        open: basePrice + 500,
        high: basePrice + 600,
        low: basePrice + 400,
        close: basePrice + 500,
        volume: 100,
      });
    } else if (i >= 10 && i < 15) {
      // Активация
      allCandles.push({
        timestamp,
        open: basePrice,
        high: basePrice + 100,
        low: basePrice - 100,
        close: basePrice,
        volume: 100,
      });
    } else {
      // TP достигнут - сигнал закрывается
      allCandles.push({
        timestamp,
        open: basePrice + 1000,
        high: basePrice + 1100,
        low: basePrice + 900,
        close: basePrice + 1000,
        volume: 100,
      });
    }
  }

  addExchangeSchema({
    exchangeName: "binance-persist-delete-once",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "persist-delete-once-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "PERSIST: delete once test",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onClose: () => {
        onCloseCalled = true;
      },
      onWrite: (_symbol, signal) => {
        if (signal === null) {
          onWriteCallsWithNull++;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "70m-persist-delete-once",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #11] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-delete-once-strategy",
    exchangeName: "binance-persist-delete-once",
    frameName: "70m-persist-delete-once",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #11] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!onCloseCalled) {
    fail("Signal was NOT closed");
    return;
  }

  if (onWriteCallsWithNull !== 1) {
    fail(`CONCURRENCY BUG: onWrite(null) called ${onWriteCallsWithNull} times, expected EXACTLY 1. Possible race condition or duplicate persist deletes!`);
    return;
  }

  pass(`PERSIST INTEGRITY: onWrite(null) called exactly once per signal close. No duplicate deletions, no race conditions.`);
});


// FACADES PARALLEL: All public facades isolate data by (symbol, strategyName)
// PARALLEL: Single strategy trading two symbols (BTCUSDT + ETHUSDT)
// PARALLEL: Three symbols with different close reasons (TP, SL, time_expired)
// PARTIAL PROGRESS: Percentage calculation during TP achievement
// PARTIAL LISTENERS: listenPartialProfit and listenPartialLoss capture events
test("PARTIAL LISTENERS: listenPartialProfit and listenPartialLoss capture events", async ({ pass, fail }) => {
  const partialProfitEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const priceOpen = basePrice - 500; // 99500 (LONG: buy lower)
  const priceTakeProfit = priceOpen + 1000; // 100500
  const priceStopLoss = priceOpen - 1000; // 98500
  const tpDistance = priceTakeProfit - priceOpen; // 1000
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Pre-fill initial candles for getAveragePrice (min 6 candles)
  // Candles must be ABOVE priceOpen to ensure scheduled state (not immediate activation)
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50, // 99950 > priceOpen (99500) ✓
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-partial-listeners",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-listeners",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Regenerate ALL candles in first getSignal call
      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      let candleIndex = 0;

      // Phase 1: Activation (candles 0-4) - price falls to priceOpen
      for (let i = 0; i < 5; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        allCandles.push({
          timestamp,
          open: priceOpen,
          high: priceOpen + 10,
          low: priceOpen - 10,
          close: priceOpen,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 2: Gradual rise to TP (candles 5-24)
      // Move from priceOpen (99500) to priceTakeProfit (100500) in 20 steps
      const steps = 62;
      for (let i = 0; i < steps; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = (i + 1) / steps; // 0.05, 0.10, 0.15, ..., 1.0
        const price = priceOpen + tpDistance * progress;

        allCandles.push({
          timestamp,
          open: price,
          high: price + 10,
          low: price - 10,
          close: price,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 3: Hold at TP for closure (candles 25-27)
      for (let i = 0; i < 3; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        allCandles.push({
          timestamp,
          open: priceTakeProfit,
          high: priceTakeProfit + 10,
          low: priceTakeProfit - 10,
          close: priceTakeProfit,
          volume: 100,
        });
        candleIndex++;
      }

      return {
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "70m-partial-listeners",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),
  });

  const awaitSubject = new Subject();

  // Subscribe to partial profit/loss events BEFORE starting backtest
  const unsubscribeProfit = listenPartialProfitAvailable((event) => {
    partialProfitEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialProfit] Symbol: ${event.symbol}, Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  const unsubscribeLoss = listenPartialLossAvailable((event) => {
    partialLossEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialLoss] Symbol: ${event.symbol}, Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  listenDoneBacktest(async () => {
    // console.log(`\n=== BACKTEST COMPLETED ===`);
    // console.log(`Total profit events: ${partialProfitEvents.length}`);
    // console.log(`Total loss events: ${partialLossEvents.length}`);
    await sleep(50); // Let all logs flush
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // Ignore "no candles data" errors - they can occur during initialization
    if (error && error.message && error.message.includes("no candles data")) {
      // console.log(`[IGNORED] ${error.message}`);
      return;
    }
    console.error(`\n[ERROR]`, error);
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-listeners",
    exchangeName: "binance-partial-listeners",
    frameName: "70m-partial-listeners",
  });

  await awaitSubject.toPromise();
  await sleep(100); // Final flush

  // Cleanup
  unsubscribeProfit();
  unsubscribeLoss();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // No loss events expected (price moves towards TP, not SL)
  if (partialLossEvents.length > 0) {
    fail(`Expected 0 loss events, got ${partialLossEvents.length}`);
    return;
  }

  // Should have at least 3 profit events
  if (partialProfitEvents.length < 3) {
    fail(`Expected at least 3 profit events, got ${partialProfitEvents.length}`);
    return;
  }

  // Verify all events have backtest=true
  if (!partialProfitEvents.every(e => e.backtest === true)) {
    fail("All events should have backtest=true");
    return;
  }

  // Verify all events have correct symbol
  if (!partialProfitEvents.every(e => e.symbol === "BTCUSDT")) {
    fail("All events should have symbol=BTCUSDT");
    return;
  }

  // Verify levels are milestone values (10, 20, 30, etc.)
  for (let i = 0; i < partialProfitEvents.length; i++) {
    const level = partialProfitEvents[i].level;
    if (level % 1 !== 0) {
      fail(`Level should be integer milestone (10, 20, 30), got ${level}`);
      return;
    }
  }

  // Verify levels increase monotonically
  for (let i = 1; i < partialProfitEvents.length; i++) {
    if (partialProfitEvents[i].level <= partialProfitEvents[i - 1].level) {
      fail(`Levels should increase: ${partialProfitEvents[i - 1].level}% -> ${partialProfitEvents[i].level}%`);
      return;
    }
  }

  const maxLevel = Math.max(...partialProfitEvents.map(e => e.level));
  const uniqueLevels = [...new Set(partialProfitEvents.map(e => e.level))].sort((a, b) => a - b);

  // console.log(`\n=== VERIFICATION PASSED ===`);
  // console.log(`Total events: ${partialProfitEvents.length}`);
  // console.log(`Unique levels: ${uniqueLevels.join('%, ')}%`);
  // console.log(`Max level: ${maxLevel}%`);
  // console.log(`===========================\n`);

  pass(`listenPartialProfit WORKS: ${partialProfitEvents.length} events, levels: ${uniqueLevels.join('%, ')}%, max ${maxLevel}%`);
});


// ACTION: ActionBase.signal() receives all signal events in backtest
test("ACTION: ActionBase.signal() receives all signal events in backtest", async ({ pass, fail }) => {
  const signalEvents = [];

  class TestActionSignal extends ActionBase {
    signal(event) {
      super.signal(event);
      signalEvents.push({
        action: event.action,
        state: event.state,
        strategyName: this.strategyName,
        frameName: this.frameName,
        actionName: this.actionName,
      });
    }
  }

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Буферные свечи (5 минуты ДО startTime)
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-action-signal",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addActionSchema({
    actionName: "test-action-signal",
    handler: TestActionSignal,
  });

  addStrategySchema({
    strategyName: "test-strategy-action-signal",
    interval: "1m",
    actions: ["test-action-signal"],
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }

      // Генерируем свечи для immediate activation (как в sequence.test.mjs Тест #3)
      // Требуется минимум 65 свечей для minuteEstimatedTime=60 (60 + 4 buffer + 1)
      for (let i = 0; i < 72; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1: Ожидание (0-9) - цена ВЫШЕ basePrice
        if (i < 10) {
          allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
        }
        // Фаза 2: Активация (10-14) - цена НА basePrice
        else if (i >= 10 && i < 15) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        }
        // Фаза 3: TP (15-71) - цена достигает TP
        else {
          allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,  // НА текущей цене → immediate activation
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "70m-action-signal",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),  // 70 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-action-signal",
    exchangeName: "binance-action-signal",
    frameName: "70m-action-signal",
  });

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (signalEvents.length === 0) {
    fail("Action.signal() was NOT called");
    return;
  }

  // Verify context fields
  if (!signalEvents.every(e => e.strategyName === "test-strategy-action-signal")) {
    fail("Action strategyName incorrect");
    return;
  }

  if (!signalEvents.every(e => e.frameName === "70m-action-signal")) {
    fail("Action frameName incorrect");
    return;
  }

  if (!signalEvents.every(e => e.actionName === "test-action-signal")) {
    fail("Action actionName incorrect");
    return;
  }

  // Check that we received opened and closed events
  const hasOpened = signalEvents.some(e => e.action === "opened");
  const hasClosed = signalEvents.some(e => e.action === "closed");

  if (!hasOpened) {
    fail("Action did not receive 'opened' event");
    return;
  }

  if (!hasClosed) {
    fail("Action did not receive 'closed' event");
    return;
  }

  pass(`Action.signal() WORKS: ${signalEvents.length} events (opened + closed)`);
});


// SHUTDOWN: Backtest.stop() during active signal - signal completes first
// SHUTDOWN: Walker.stop() - all strategies stop
test("SHUTDOWN: Walker.stop() - all strategies stop", async ({ pass, fail }) => {
  const strategiesStarted = new Set();
  const strategiesCompleted = [];
  const signalCounts = {}; // Track signals per strategy

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Буферные свечи (5 минуты ДО startTime)
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-shutdown-6",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  // Add 3 strategies
  for (let s = 1; s <= 3; s++) {
    const strategyName = `test-shutdown-walker-${s}`;
    signalCounts[strategyName] = 0;

    addStrategySchema({
      strategyName,
      interval: "1m",
      getSignal: async () => {
        // console.log(`[TEST #6] getSignal called for ${strategyName}`);
        strategiesStarted.add(strategyName);

        // Only return one signal per strategy
        signalCounts[strategyName]++;
        if (signalCounts[strategyName] > 1) {
          // console.log(`[TEST #6] ${strategyName} already returned signal, returning null`);
          return null;
        }

        if (allCandles.length === bufferMinutes) {
          allCandles = [];

          // Буферные свечи (4 минуты ДО startTime)
          for (let i = 0; i < bufferMinutes; i++) {
            allCandles.push({
              timestamp: bufferStartTime + i * intervalMs,
              open: basePrice,
              high: basePrice + 100,
              low: basePrice - 100,
              close: basePrice,
              volume: 100,
            });
          }

          for (let i = 0; i < 72; i++) {
            const timestamp = startTime + i * intervalMs;

            if (i < 5) {
              allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
            } else if (i >= 5 && i < 10) {
              allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
            } else {
              allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
            }
          }
        }

        return {
          position: "long",
          note: `Walker shutdown strategy ${s}`,
          priceOpen: basePrice,
          priceTakeProfit: basePrice + 1000,
          priceStopLoss: basePrice - 1000,
          minuteEstimatedTime: 60,
        };
      },
      callbacks: {
        onClose: () => {
          // console.log(`[TEST #6] onClose called for ${strategyName}`);
          strategiesCompleted.push(strategyName);
        },
      },
    });
  }

  addFrameSchema({
    frameName: "70m-shutdown-6",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),
  });

  const awaitSubject = new Subject();
  let stopCalled = false;

  addWalkerSchema({
    walkerName: "test-walker-shutdown",
    exchangeName: "binance-shutdown-6",
    frameName: "70m-shutdown-6",
    strategies: ["test-shutdown-walker-1", "test-shutdown-walker-2", "test-shutdown-walker-3"],
    callbacks: {
      onStrategyComplete: async (strategyName) => {
        // console.log(`[TEST #6] onStrategyComplete fired for ${strategyName}`);
        if (!stopCalled) {
          stopCalled = true;
          // console.log("[TEST #6] First strategy completed, calling Walker.stop()");
          await Walker.stop("BTCUSDT", { walkerName: "test-walker-shutdown"});
          // console.log("[TEST #6] Walker.stop() completed");
        }
      }
    }
  });

  listenWalkerComplete(() => {
    // console.log("[TEST #6] listenWalkerComplete fired");
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #6] listenError fired:", error.message || error);
    errorCaught = error;
    awaitSubject.next();
  });

  // console.log("[TEST #6] Starting Walker.background");
  const cancelFn = Walker.background("BTCUSDT", {
    walkerName: "test-walker-shutdown",
  });

  // Wait for walker to complete or error
  await awaitSubject.toPromise();

  // console.log("[TEST #6] Calling cancelFn()");
  cancelFn();
  unsubscribeError();

  // console.log("[TEST #6] strategiesStarted:", strategiesStarted);
  // console.log("[TEST #6] strategiesCompleted:", strategiesCompleted);

  if (errorCaught) {
    fail(`Error during walker: ${errorCaught.message || errorCaught}`);
    return;
  }

  const strategiesStartedArray = Array.from(strategiesStarted);

  // Walker should stop after first strategy, so max 2 strategies should start (first completes, second starts then stops)
  if (strategiesStartedArray.length >= 3) {
    fail(`Expected less than 3 strategies started (stopped after first), got ${strategiesStartedArray.length}: ${strategiesStartedArray.join(", ")}`);
    return;
  }

  pass(`SHUTDOWN WALKER: Walker stopped after first strategy. Strategies started: ${strategiesStartedArray.length}/3 (${strategiesStartedArray.join(", ")}). Completed: ${strategiesCompleted.length}`);
});


// SHUTDOWN: Two walkers on same symbol - stop one doesn't affect other
test("SHUTDOWN: Two walkers on same symbol - stop one doesn't affect other", async ({ pass, fail }) => {
  const walkerAStrategiesStarted = new Set();
  const walkerBStrategiesStarted = new Set();
  const signalCountsA = {}; // Track signals for Walker A
  const signalCountsB = {}; // Track signals for Walker B

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 10;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-shutdown-7",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  // Walker A strategies
  for (let s = 1; s <= 2; s++) {
    const strategyName = `test-shutdown-walkerA-${s}`;
    signalCountsA[strategyName] = 0;

    addStrategySchema({
      strategyName,
      interval: "1m",
      getSignal: async () => {
        // console.log(`[TEST #7] Walker A: getSignal called for ${strategyName}`);
        walkerAStrategiesStarted.add(strategyName);

        // Only return one signal per strategy
        signalCountsA[strategyName]++;
        if (signalCountsA[strategyName] > 1) {
          // console.log(`[TEST #7] Walker A: ${strategyName} already returned signal, returning null`);
          return null;
        }

        if (allCandles.length === bufferMinutes) {
          allCandles = [];

          // Буферные свечи (4 минуты ДО startTime)
          for (let i = 0; i < bufferMinutes; i++) {
            allCandles.push({
              timestamp: bufferStartTime + i * intervalMs,
              open: basePrice,
              high: basePrice + 100,
              low: basePrice - 100,
              close: basePrice,
              volume: 100,
            });
          }

          for (let i = 0; i < 67; i++) {
            const timestamp = startTime + i * intervalMs;
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }

        return {
          position: "long",
          note: `Walker A strategy ${s}`,
          priceOpen: basePrice,
          priceTakeProfit: basePrice + 1000,
          priceStopLoss: basePrice - 1000,
          minuteEstimatedTime: 60,
        };
      },
    });
  }

  // Walker B strategies
  for (let s = 1; s <= 2; s++) {
    const strategyName = `test-shutdown-walkerB-${s}`;
    signalCountsB[strategyName] = 0;

    addStrategySchema({
      strategyName,
      interval: "1m",
      getSignal: async () => {
        // console.log(`[TEST #7] Walker B: getSignal called for ${strategyName}`);
        walkerBStrategiesStarted.add(strategyName);

        // Only return one signal per strategy
        signalCountsB[strategyName]++;
        if (signalCountsB[strategyName] > 1) {
          // console.log(`[TEST #7] Walker B: ${strategyName} already returned signal, returning null`);
          return null;
        }

        if (allCandles.length === bufferMinutes) {
          allCandles = [];

          // Буферные свечи (4 минуты ДО startTime)
          for (let i = 0; i < bufferMinutes; i++) {
            allCandles.push({
              timestamp: bufferStartTime + i * intervalMs,
              open: basePrice,
              high: basePrice + 100,
              low: basePrice - 100,
              close: basePrice,
              volume: 100,
            });
          }

          for (let i = 0; i < 67; i++) {
            const timestamp = startTime + i * intervalMs;
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }

        return {
          position: "long",
          note: `Walker B strategy ${s}`,
          priceOpen: basePrice,
          priceTakeProfit: basePrice + 1000,
          priceStopLoss: basePrice - 1000,
          minuteEstimatedTime: 60,
        };
      },
    });
  }

  addFrameSchema({
    frameName: "70m-shutdown-7",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:07:00Z"), // 67 minutes (+2 for exclusive boundaries)
  });

  let walkerAStopCalled = false;

  addWalkerSchema({
    walkerName: "test-walkerA",
    exchangeName: "binance-shutdown-7",
    frameName: "70m-shutdown-7",
    strategies: ["test-shutdown-walkerA-1", "test-shutdown-walkerA-2"],
    callbacks: {
      onStrategyComplete: async (strategyName) => {
        // console.log(`[TEST #7] Walker A: onStrategyComplete for ${strategyName}`);
        if (!walkerAStopCalled) {
          walkerAStopCalled = true;
          // console.log("[TEST #7] Calling Walker.stop() for Walker A after first strategy");
          await Walker.stop("BTCUSDT", { walkerName: "test-walkerA" });
          // console.log("[TEST #7] Walker.stop() for Walker A completed");
        }
      }
    }
  });

  addWalkerSchema({
    walkerName: "test-walkerB",
    exchangeName: "binance-shutdown-7",
    frameName: "70m-shutdown-7",
    strategies: ["test-shutdown-walkerB-1", "test-shutdown-walkerB-2"],
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #7] listenError fired:", error.message || error);
    errorCaught = error;
  });

  // console.log("[TEST #7] Starting Walker A and Walker B");
  const cancelA = Walker.background("BTCUSDT", {
    walkerName: "test-walkerA",
  });

  const cancelB = Walker.background("BTCUSDT", {
    walkerName: "test-walkerB",
  });

  // Wait for walkers to run
  // console.log("[TEST #7] Waiting 100ms");
  await sleep(100);

  // Wait for walker B to continue
  // console.log("[TEST #7] Waiting 200ms for Walker B to continue");
  await sleep(200);

  // console.log("[TEST #7] Calling cancelA() and cancelB()");
  cancelA();
  cancelB();
  unsubscribeError();

  // console.log("[TEST #7] Walker A strategies started:", walkerAStrategiesStarted);
  // console.log("[TEST #7] Walker B strategies started:", walkerBStrategiesStarted);

  if (errorCaught) {
    fail(`Error during walkers: ${errorCaught.message || errorCaught}`);
    return;
  }

  const walkerAArray = Array.from(walkerAStrategiesStarted);
  const walkerBArray = Array.from(walkerBStrategiesStarted);

  // Walker A should stop early (only first strategy completes)
  if (walkerAArray.length >= 2) {
    fail(`Walker A should stop early, got ${walkerAArray.length} strategies: ${walkerAArray.join(", ")}`);
    return;
  }

  // Walker B should continue (but may or may not complete all strategies due to timing)
  if (walkerBArray.length === 0) {
    fail(`Walker B should start strategies, got ${walkerBArray.length}`);
    return;
  }

  pass(`SHUTDOWN TWO WALKERS: Walker A stopped (${walkerAArray.length}/2 strategies). Walker B continued (${walkerBArray.length}/2 strategies).`);
});
import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
  getAveragePrice,
  getDate,
  Cache,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

test("CACHE: Cached function with 1m interval - same value within minute, different after", async ({ pass, fail }) => {

  const capturedValues = [];
  let callCount = 0;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей
  for (let i = 0; i < 5; i++) {
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
    exchangeName: "binance-cache-fn-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-cache-fn",
    interval: "1m",
    getSignal: async () => {
      callCount++;

      // Генерируем ВСЕ свечи только в первый раз
      if (callCount === 1) {
        allCandles = [];

        // Буферные свечи
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

        // Генерируем 5 минут свечей (5 вызовов getSignal)
        for (let minuteIndex = 0; minuteIndex < 5; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

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

      const price = await getAveragePrice("BTCUSDT");

      // Захватываем дату при каждом вызове
      const currentDate = await getDate();
      capturedValues.push({
        callNumber: callCount,
        timestamp: currentDate.getTime(),
        formattedDate: currentDate.toISOString(),
      });

      // Не создаем сигналы - просто тестируем getDate()
      return null;
    },
  });

  addFrameSchema({
    frameName: "5m-cache-fn-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:05:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cache-fn",
    exchangeName: "binance-cache-fn-test",
    frameName: "5m-cache-fn-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что getSignal был вызван несколько раз
  if (capturedValues.length < 3) {
    fail(`Expected at least 3 calls, got ${capturedValues.length}`);
    return;
  }

  // Проверяем что каждый вызов получил дату своего интервала
  const timestamps = capturedValues.map(v => v.timestamp);
  const uniqueTimestamps = [...new Set(timestamps)];

  // Все даты должны быть разными (каждая минута - новая дата)
  if (uniqueTimestamps.length === capturedValues.length) {
    const dates = capturedValues.map(v => `${v.callNumber}: ${v.formattedDate}`).join(', ');
    pass(`getDate() returns different timestamps for each interval: ${dates}`);
    return;
  }

  fail(`Expected ${capturedValues.length} unique timestamps, got ${uniqueTimestamps.length}`);

});

test("CACHE: Cache.fn wrapper with 5m interval - caches value within 5 minutes", async ({ pass, fail }) => {

  const capturedCalls = [];
  let actualComputationCount = 0;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  // Функция которую будем кэшировать
  const expensiveFunction = async (symbol) => {
    actualComputationCount++;
    const date = await getDate();
    return {
      symbol,
      computedAt: date.getTime(),
      computationNumber: actualComputationCount,
    };
  };

  // КЭШИРУЕМ функцию с интервалом 5m
  const cachedFunction = Cache.fn(expensiveFunction, { interval: "5m" });

  addExchangeSchema({
    exchangeName: "binance-cache-wrapper-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-cache-wrapper",
    interval: "1m",
    getSignal: async () => {

      // Генерируем ВСЕ свечи только в первый раз
      if (allCandles.length === 5) {
        allCandles = [];

        // Буферные свечи
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

        // Генерируем 12 минут свечей:
        // - Минуты 0-4: первый 5-минутный интервал (должен быть 1 вычисление)
        // - Минуты 5-9: второй 5-минутный интервал (должно быть новое вычисление)
        // - Минуты 10-11: третий 5-минутный интервал (еще одно новое вычисление)
        for (let minuteIndex = 0; minuteIndex < 12; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

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

      const price = await getAveragePrice("BTCUSDT");

      // Вызываем КЭШИРОВАННУЮ функцию
      const result = await cachedFunction("BTCUSDT");
      capturedCalls.push({
        timestamp: result.computedAt,
        computationNumber: result.computationNumber,
      });

      // Не создаем сигналы - просто тестируем функцию
      return null;
    },
  });

  addFrameSchema({
    frameName: "12m-cache-wrapper-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:12:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cache-wrapper",
    exchangeName: "binance-cache-wrapper-test",
    frameName: "12m-cache-wrapper-test",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что функция была вызвана 12 раз (каждую минуту)
  if (capturedCalls.length < 10) {
    fail(`Expected at least 10 calls, got ${capturedCalls.length}`);
    return;
  }

  // С КЭШИРОВАНИЕМ на 5m интервале:
  // - Минуты 0-4 (первый 5-минутный интервал): 1 вычисление, остальные из кэша
  // - Минуты 5-9 (второй интервал): 1 новое вычисление, остальные из кэша
  // - Минуты 10-11 (третий интервал): 1 новое вычисление, остальные из кэша
  // Итого: должно быть 3 вычисления для 12 вызовов

  if (actualComputationCount >= 2 && actualComputationCount <= 4) {
    const efficiency = ((capturedCalls.length - actualComputationCount) / capturedCalls.length * 100).toFixed(1);
    pass(`Cache WORKS: ${actualComputationCount} computations for ${capturedCalls.length} calls (${efficiency}% cached, 5m interval)`);
    return;
  }

  fail(`Expected 2-4 computations with 5m cache, got ${actualComputationCount} for ${capturedCalls.length} calls`);

});

test("CACHE: Cache.fn with 15m interval - fewer computations for longer interval", async ({ pass, fail }) => {

  const capturedCalls = [];
  let actualComputationCount = 0;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  // Функция которую будем кэшировать
  const expensiveFunction = async (symbol) => {
    actualComputationCount++;
    const date = await getDate();
    return {
      symbol,
      computedAt: date.getTime(),
      computationNumber: actualComputationCount,
    };
  };

  // КЭШИРУЕМ функцию с интервалом 15m
  const cachedFunction = Cache.fn(expensiveFunction, { interval: "15m" });

  addExchangeSchema({
    exchangeName: "binance-cache-15m-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-cache-15m",
    interval: "1m",
    getSignal: async () => {

      // Генерируем ВСЕ свечи только в первый раз
      if (allCandles.length === 5) {
        allCandles = [];

        // Буферные свечи
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

        // Генерируем 35 минут свечей:
        // - Минуты 0-14: первый 15-минутный интервал (должно быть 1 вычисление)
        // - Минуты 15-29: второй 15-минутный интервал (должно быть новое вычисление)
        // - Минуты 30-34: третий 15-минутный интервал (еще одно новое вычисление)
        for (let minuteIndex = 0; minuteIndex < 35; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

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

      const price = await getAveragePrice("BTCUSDT");

      // Вызываем КЭШИРОВАННУЮ функцию
      const result = await cachedFunction("BTCUSDT");
      capturedCalls.push({
        timestamp: result.computedAt,
        computationNumber: result.computationNumber,
      });

      // Не создаем сигналы - просто тестируем функцию
      return null;
    },
  });

  addFrameSchema({
    frameName: "35m-cache-15m-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:35:00.000Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cache-15m",
    exchangeName: "binance-cache-15m-test",
    frameName: "35m-cache-15m-test",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что функция была вызвана много раз (35+ минут)
  if (capturedCalls.length < 30) {
    fail(`Expected at least 30 calls, got ${capturedCalls.length}`);
    return;
  }

  // С КЭШИРОВАНИЕМ на 15m интервале:
  // - Минуты 0-14 (первый интервал): 1 вычисление, остальные 14 из кэша
  // - Минуты 15-29 (второй интервал): 1 новое вычисление, остальные 14 из кэша
  // - Минуты 30-34 (третий интервал): 1 новое вычисление, остальные 4 из кэша
  // Итого: должно быть 3 вычисления для 35 вызовов

  if (actualComputationCount >= 2 && actualComputationCount <= 4) {
    const efficiency = ((capturedCalls.length - actualComputationCount) / capturedCalls.length * 100).toFixed(1);

    // Дополнительная проверка: первые 15 вызовов должны иметь один timestamp
    const firstBatch = capturedCalls.slice(0, 15);
    const uniqueFirstBatch = [...new Set(firstBatch.map(c => c.computationNumber))];

    if (uniqueFirstBatch.length === 1) {
      pass(`Cache 15m WORKS: ${actualComputationCount} computations for ${capturedCalls.length} calls (${efficiency}% cached), first 15 calls used same cached value`);
      return;
    } else {
      fail(`First 15 calls should use same cached value, but got ${uniqueFirstBatch.length} different computations`);
      return;
    }
  }

  fail(`Expected 2-4 computations with 15m cache, got ${actualComputationCount} for ${capturedCalls.length} calls`);

});

test("CACHE: getDate captures different timestamps across 3 minute intervals", async ({ pass, fail }) => {

  const datesByMinute = [];
  let callCount = 0;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей
  for (let i = 0; i < 5; i++) {
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
    exchangeName: "binance-timestamps-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-timestamps",
    interval: "1m",
    getSignal: async () => {
      callCount++;

      // Генерируем ВСЕ свечи только в первый раз
      if (callCount === 1) {
        allCandles = [];

        // Буферные свечи
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

        // Генерируем 3 минуты свечей
        // Минута 0: 00:00:00
        // Минута 1: 00:01:00
        // Минута 2: 00:02:00
        for (let minuteIndex = 0; minuteIndex < 3; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

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

      const price = await getAveragePrice("BTCUSDT");

      // Захватываем дату
      const currentDate = await getDate();
      datesByMinute.push({
        minute: callCount - 1,
        timestamp: currentDate.getTime(),
        expectedTimestamp: startTime + (callCount - 1) * intervalMs,
        formattedDate: currentDate.toISOString(),
      });

      // Не создаем сигналы
      return null;
    },
  });

  addFrameSchema({
    frameName: "3m-timestamps-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:03:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-timestamps",
    exchangeName: "binance-timestamps-test",
    frameName: "3m-timestamps-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что было минимум 3 вызова (может быть 4 из-за границ frame)
  if (datesByMinute.length < 3) {
    fail(`Expected at least 3 calls, got ${datesByMinute.length}`);
    return;
  }

  // Проверяем что каждая дата соответствует ожидаемому времени
  let allCorrect = true;
  const details = [];

  for (const entry of datesByMinute) {
    const isCorrect = entry.timestamp === entry.expectedTimestamp;
    allCorrect = allCorrect && isCorrect;
    details.push(`Minute ${entry.minute}: ${entry.formattedDate} ${isCorrect ? '✓' : '✗ expected ' + new Date(entry.expectedTimestamp).toISOString()}`);
  }

  if (allCorrect) {
    pass(`getDate() captures correct timestamps: ${details.join(', ')}`);
    return;
  }

  fail(`Some timestamps incorrect: ${details.join(', ')}`);

});

import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenDoneBacktest,
  listenError,
  listenPartialProfit,
  listenPartialProfitOnce,
  listenPartialLoss,
  listenPartialLossOnce,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

/**
 * PARTIAL LEVELS ТЕСТ #1: listenPartialProfit срабатывает только на уровнях 10%, 20%, 30%
 *
 * Проверяем что:
 * - Вызовы происходят только при достижении уровней (10, 20, 30...)
 * - Промежуточные значения (15%, 25%) НЕ вызывают коллбек
 * - Каждый уровень вызывается ТОЛЬКО ОДИН РАЗ (нет дубликатов)
 */
test("PARTIAL LEVELS: listenPartialProfit fires only on 10%, 20%, 30% levels", async ({ pass, fail }) => {
  const profitEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000; // Используем 100k для удобства расчёта процентов
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Создаем начальные свечи с учетом буфера
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-partial-levels-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-partial-levels-profit",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Генерируем свечи с точными уровнями прибыли
      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
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

      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4): цена = basePrice
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
        // Рост до 5% (5-9): не должен вызвать коллбек
        else if (i >= 5 && i < 10) {
          const price = basePrice + 5000; // +5%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Рост до 12% (10-14): должен вызвать 10%
        else if (i >= 10 && i < 15) {
          const price = basePrice + 12000; // +12%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Рост до 25% (15-19): должен вызвать 20%
        else if (i >= 15 && i < 20) {
          const price = basePrice + 25000; // +25%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Рост до 35% (20-24): должен вызвать 30%
        else if (i >= 20 && i < 25) {
          const price = basePrice + 35000; // +35%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Рост до 50% (25-29): должен вызвать 40%
        else if (i >= 25 && i < 30) {
          const price = basePrice + 50000; // +50%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Достигаем TP (30-49)
        else {
          const price = basePrice + 55000; // Выше 50%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000, // +60%
        priceStopLoss: basePrice - 50000, // -50%
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrame({
    frameName: "50m-partial-levels-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  // Подписываемся на события
  const unsubscribeProfit = listenPartialProfit(({ symbol, signal, price, level, backtest }) => {
    console.log(`[listenPartialProfit] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);
    profitEvents.push(level);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-levels-profit",
    exchangeName: "binance-partial-levels-profit",
    frameName: "50m-partial-levels-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeProfit();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  console.log(`[TEST] Profit events:`, profitEvents);
  console.log(`[TEST] Profit events (JSON):`, JSON.stringify(profitEvents));

  // ПРОВЕРКА #1: Должны быть вызовы для уровней 10, 20, 30, 40, 50, 60, 70, 80, 90
  const expectedLevels = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  if (profitEvents.length < 4) {
    fail(`Expected at least 4 profit events, got ${profitEvents.length}`);
    return;
  }

  // ПРОВЕРКА #2: Каждый уровень вызывается ТОЛЬКО ОДИН РАЗ
  const uniqueLevels = [...new Set(profitEvents)];
  if (uniqueLevels.length !== profitEvents.length) {
    fail(`Duplicate levels detected! Events: [${profitEvents.join(', ')}], Unique: [${uniqueLevels.join(', ')}]`);
    return;
  }

  // ПРОВЕРКА #3: Все уровни должны быть из ожидаемого списка
  for (const level of profitEvents) {
    if (!expectedLevels.includes(level)) {
      fail(`Unexpected level ${level}%, expected one of [${expectedLevels.join(', ')}]`);
      return;
    }
  }

  // ПРОВЕРКА #4: Уровни должны идти по возрастанию
  for (let i = 1; i < profitEvents.length; i++) {
    if (profitEvents[i] <= profitEvents[i - 1]) {
      fail(`Levels should be ascending: ${profitEvents[i - 1]}% -> ${profitEvents[i]}%`);
      return;
    }
  }

  pass(`listenPartialProfit WORKS: [${profitEvents.join('%, ')}%] - no duplicates, correct levels`);
});


/**
 * PARTIAL LEVELS ТЕСТ #2: listenPartialLoss срабатывает только на уровнях 10%, 20%, 30%
 */
test("PARTIAL LEVELS: listenPartialLoss fires only on 10%, 20%, 30% levels", async ({ pass, fail }) => {
  const lossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-partial-levels-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-partial-levels-loss",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
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

      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
        // Падение до -5% (не должен вызвать)
        else if (i >= 5 && i < 10) {
          const price = basePrice - 5000; // -5%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Падение до -12% (должен вызвать 10%)
        else if (i >= 10 && i < 15) {
          const price = basePrice - 12000; // -12%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Падение до -25% (должен вызвать 20%)
        else if (i >= 15 && i < 20) {
          const price = basePrice - 25000; // -25%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Падение до -35% (должен вызвать 30%)
        else if (i >= 20 && i < 25) {
          const price = basePrice - 35000; // -35%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Достигаем SL
        else {
          const price = basePrice - 50000; // SL
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
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
  });

  addFrame({
    frameName: "50m-partial-levels-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const unsubscribeLoss = listenPartialLoss(({ symbol, signal, price, level, backtest }) => {
    console.log(`[listenPartialLoss] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);
    lossEvents.push(level);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-levels-loss",
    exchangeName: "binance-partial-levels-loss",
    frameName: "50m-partial-levels-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeLoss();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  console.log(`[TEST] Loss events:`, lossEvents);

  // Проверки аналогичны profit тесту
  const expectedLevels = [10, 20, 30, 40, 50, 60, 70];
  if (lossEvents.length < expectedLevels.length) {
    fail(`Expected at least ${expectedLevels.length} loss events, got ${lossEvents.length}`);
    return;
  }

  const uniqueLevels = [...new Set(lossEvents)];
  if (uniqueLevels.length !== lossEvents.length) {
    fail(`Duplicate levels detected! Events: [${lossEvents.join(', ')}]`);
    return;
  }

  for (const level of lossEvents) {
    if (!expectedLevels.includes(level)) {
      fail(`Unexpected level ${level}%, expected one of [${expectedLevels.join(', ')}]`);
      return;
    }
  }

  for (let i = 1; i < lossEvents.length; i++) {
    if (lossEvents[i] <= lossEvents[i - 1]) {
      fail(`Levels should be ascending: ${lossEvents[i - 1]}% -> ${lossEvents[i]}%`);
      return;
    }
  }

  pass(`listenPartialLoss WORKS: [${lossEvents.join('%, ')}%] - no duplicates, correct levels`);
});


/**
 * PARTIAL LEVELS ТЕСТ #3: listenPartialProfitOnce вызывается ТОЛЬКО ОДИН РАЗ
 */
test("PARTIAL LEVELS: listenPartialProfitOnce fires only once", async ({ pass, fail }) => {
  console.log(`[TEST START] listenPartialProfitOnce test beginning`);
  let callCount = 0;
  let firstLevel = null;
  console.log(`[TEST] Initial callCount=${callCount}`);

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-partial-once-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-partial-once-profit",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
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

      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else if (i >= 5 && i < 15) {
          const price = basePrice + 15000; // +15% (вызовет 10%)
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else if (i >= 15 && i < 25) {
          const price = basePrice + 30000; // +30% (НЕ должен вызвать, т.к. once)
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else {
          const price = basePrice + 60000; // TP
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
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
  });

  addFrame({
    frameName: "40m-partial-once-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const unsubscribeOnce = listenPartialProfitOnce(
    () => true, // Accept any partial profit event
    ({ symbol, signal, price, level, backtest }) => {
      callCount++;
      firstLevel = level;
      console.log(`[listenPartialProfitOnce] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}, callCount=${callCount}`);
    }
  );

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-once-profit",
    exchangeName: "binance-partial-once-profit",
    frameName: "40m-partial-once-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeOnce();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  console.log(`[TEST] listenPartialProfitOnce call count: ${callCount}, first level: ${firstLevel}%`);
  console.log(`[TEST] Expected: callCount=1, got: ${callCount}`);

  // ПРОВЕРКА: Должен вызваться ТОЛЬКО ОДИН РАЗ
  if (callCount !== 1) {
    fail(`listenPartialProfitOnce should be called ONCE, got ${callCount} calls`);
    return;
  }

  if (firstLevel !== 10) {
    fail(`Expected first level to be 10%, got ${firstLevel}%`);
    return;
  }

  pass(`listenPartialProfitOnce WORKS: called once with level ${firstLevel}%`);
});


/**
 * PARTIAL LEVELS ТЕСТ #4: listenPartialLossOnce вызывается ТОЛЬКО ОДИН РАЗ
 */
test("PARTIAL LEVELS: listenPartialLossOnce fires only once", async ({ pass, fail }) => {
  let callCount = 0;
  let firstLevel = null;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-partial-once-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-partial-once-loss",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
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

      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else if (i >= 5 && i < 15) {
          const price = basePrice - 15000; // -15% (вызовет 10%)
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else if (i >= 15 && i < 25) {
          const price = basePrice - 30000; // -30% (НЕ должен вызвать)
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else {
          const price = basePrice - 50000; // SL
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
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
  });

  addFrame({
    frameName: "40m-partial-once-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const unsubscribeOnce = listenPartialLossOnce(
    () => true, // Accept any partial loss event
    ({ symbol, signal, price, level, backtest }) => {
      callCount++;
      firstLevel = level;
      console.log(`[listenPartialLossOnce] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}, callCount=${callCount}`);
    }
  );

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-once-loss",
    exchangeName: "binance-partial-once-loss",
    frameName: "40m-partial-once-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeOnce();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  console.log(`[TEST] Once call count: ${callCount}, first level: ${firstLevel}%`);

  if (callCount !== 1) {
    fail(`listenPartialLossOnce should be called ONCE, got ${callCount} calls`);
    return;
  }

  if (firstLevel !== 10) {
    fail(`Expected first level to be 10%, got ${firstLevel}%`);
    return;
  }

  pass(`listenPartialLossOnce WORKS: called once with level ${firstLevel}%`);
});

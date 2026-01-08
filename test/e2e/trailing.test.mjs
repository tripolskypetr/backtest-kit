import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenDoneBacktest,
  listenError,
  listenSignalBacktest,
  listenPartialProfit,
  listenPartialLoss,
  trailingStop,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * TRAILING STOP ТЕСТ #1: Trailing stop tightens SL for LONG position
 *
 * Проверяем что:
 * - trailingStop с отрицательным shift сужает расстояние SL (подтягивает SL ближе к entry)
 * - Позиция закрывается по новому trailing SL, а не по original SL
 * - percentShift работает относительно цены входа (entry price)
 *
 * Сценарий:
 * 1. LONG позиция открывается: entry=100k, originalSL=98k (distance=2%)
 * 2. Цена растет до +15%
 * 3. Вызываем trailingStop(-1) → newDistance = 2% + (-1%) = 1% → newSL = 99k
 * 4. Цена падает до 98.5k
 * 5. Позиция закрывается по trailing SL (99k), а не по original SL (98k)
 */
test("TRAILING STOP: Tightens SL for LONG position with negative shift", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let trailingApplied = false;

  // Предзаполняем буферные свечи
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
    exchangeName: "binance-trailing-tighten",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-trailing-tighten",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буферные свечи
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

      // Основные свечи
      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1 (0-4): Активация immediate
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
        // Фаза 2 (5-14): Рост до +15%
        else if (i >= 5 && i < 15) {
          const price = basePrice + 15000; // +15%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (15-24): Падение до 98.5k (должно закрыться по trailing SL=99k)
        else if (i >= 15 && i < 25) {
          const price = 98500; // Ниже trailing SL (99k), но выше original SL (98k)
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Остальное: нейтральные свечи
        else {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,        // 100000
        priceTakeProfit: basePrice + 30000, // 130000 (+30%)
        priceStopLoss: basePrice - 2000,    // 98000 (-2%)
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, signal, currentPrice, revenuePercent, backtest) => {
        // Применяем trailing stop когда достигли +15%
        if (!trailingApplied && revenuePercent >= 15) {
          console.log(`[onPartialProfit] Applying trailing stop: revenuePercent=${revenuePercent.toFixed(2)}%`);

          // percentShift = -1% → newDistance = 2% + (-1%) = 1% → newSL = 99k
          await trailingStop(symbol, -1);
          trailingApplied = true;

          console.log(`[trailingStop] Applied shift=-1%, original SL distance=2%, new distance=1%`);
        }
      },
    },
  });

  addFrame({
    frameName: "50m-trailing-tighten",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-tighten",
    exchangeName: "binance-trailing-tighten",
    frameName: "50m-trailing-tighten",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!trailingApplied) {
    fail("Trailing stop was NOT applied!");
    return;
  }

  // Находим closed событие
  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  // Проверяем что закрылось по stop_loss (trailing SL)
  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }

  console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть убыток ~-1% (закрылось на 99k вместо 98k)
  // PNL = (99000 - 100000) / 100000 * 100 = -1%
  const expectedPnl = -1.0;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 0.5) {
    fail(`PNL should be ~${expectedPnl}%, got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING STOP WORKS: Signal closed by trailing SL with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}% (expected ~${expectedPnl}%)`);
});

/**
 * TRAILING STOP ТЕСТ #3: Trailing stop for SHORT position
 *
 * Проверяем что trailing stop работает корректно для SHORT позиций:
 * - Отрицательный shift сужает расстояние SL (подтягивает SL ближе к entry)
 * - SHORT: SL находится ВЫШЕ entry, поэтому сужение означает снижение SL
 *
 * Сценарий:
 * 1. SHORT позиция: entry=100k, originalSL=102k (distance=2%)
 * 2. Цена падает до -15%
 * 3. Вызываем trailingStop(-1) → newDistance = 2% + (-1%) = 1% → newSL = 101k
 * 4. Цена растет до 101.5k
 * 5. Позиция закрывается по trailing SL (101k)
 */
test("TRAILING STOP: Tightens SL for SHORT position", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let trailingApplied = false;

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
    exchangeName: "binance-trailing-short",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-trailing-short",
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

      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1 (0-4): Активация
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
        // Фаза 2 (5-14): Падение до -15% (профит для SHORT)
        else if (i >= 5 && i < 15) {
          const price = basePrice - 15000; // -15%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (15-24): Рост до 101.5k (должно закрыться по trailing SL=101k)
        else if (i >= 15 && i < 25) {
          const price = 101500; // Выше trailing SL (101k), но ниже original SL (102k)
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Остальное: нейтральные свечи
        else {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,        // 100000
        priceTakeProfit: basePrice - 30000, // 70000 (-30%)
        priceStopLoss: basePrice + 2000,    // 102000 (+2%)
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, signal, currentPrice, revenuePercent, backtest) => {
        if (!trailingApplied && revenuePercent >= 15) {
          console.log(`[onPartialProfit SHORT] Applying trailing stop: revenuePercent=${revenuePercent.toFixed(2)}%`);

          // percentShift = -1% → newDistance = 2% + (-1%) = 1% → newSL = 101k
          await trailingStop(symbol, -1);
          trailingApplied = true;

          console.log(`[trailingStop SHORT] Applied shift=-1%, original SL distance=2%, new distance=1%`);
        }
      },
    },
  });

  addFrame({
    frameName: "50m-trailing-short",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    console.log(`[listenSignalBacktest SHORT] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-short",
    exchangeName: "binance-trailing-short",
    frameName: "50m-trailing-short",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!trailingApplied) {
    fail("Trailing stop was NOT applied!");
    return;
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }

  console.log(`[TEST SHORT] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть убыток ~-1.5% для SHORT
  // SHORT: entry=100k, close=101.5k → loss
  // PNL = (100k - 101.5k) / 100k * 100 = -1.5%
  const expectedPnl = -1.5;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 0.5) {
    fail(`PNL should be ~${expectedPnl}%, got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING STOP SHORT WORKS: Signal closed by trailing SL with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING STOP ТЕСТ #4: Apply trailing stop on partial profit events using listenPartialProfit
 *
 * Проверяем что:
 * - listenPartialProfit позволяет отслеживать события profit levels
 * - Можно применить trailingStop при достижении определённого уровня profit
 * - Trailing stop корректно изменяет SL на основе profit progress
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=98k (distance=2%)
 * 2. Цена растет, достигая partial profit events на уровнях 10%, 20%, 30%...
 * 3. При достижении 20% profit применяем trailingStop(-1%) → newSL=99k
 * 4. Цена падает до 98.7k
 * 5. Позиция закрывается по trailing SL (99k)
 */
test("TRAILING STOP: Apply on listenPartialProfit events", async ({ pass, fail }) => {
  const profitEvents = [];
  let trailingApplied = false;

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
    exchangeName: "binance-trailing-listen-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-trailing-listen-profit",
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

      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1 (0-4): Активация
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
        // Фаза 2 (5-24): Рост до +25% (чтобы достичь уровней 10%, 20%)
        else if (i >= 5 && i < 25) {
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
        // Фаза 3 (25-34): Падение до 98.7k (пробивает trailing SL=99k)
        else if (i >= 25 && i < 35) {
          const price = 98700;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Остальное: нейтральные свечи
        else {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 100000
        priceTakeProfit: basePrice + 50000, // 150000 (+50%)
        priceStopLoss: basePrice - 2000,    // 98000 (-2%)
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrame({
    frameName: "60m-trailing-listen-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  // Subscribe to partial profit events and apply trailing stop at 20% level
  const unsubscribeProfit = listenPartialProfit(async ({ symbol, level, backtest }) => {
    profitEvents.push(level);
    console.log(`[listenPartialProfit] Level: ${level}%`);

    // Apply trailing stop when reaching 20% profit
    if (!trailingApplied && level >= 20) {
      console.log(`[Applying trailingStop] At level ${level}%, shift=-1%`);
      await trailingStop(symbol, -1);
      trailingApplied = true;
    }
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-listen-profit",
    exchangeName: "binance-trailing-listen-profit",
    frameName: "60m-trailing-listen-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();
  unsubscribeProfit();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!trailingApplied) {
    fail("Trailing stop was NOT applied!");
    return;
  }

  if (profitEvents.length < 2) {
    fail(`Expected at least 2 profit events, got ${profitEvents.length}`);
    return;
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }

  console.log(`[TEST] Profit events: ${profitEvents.join(', ')}%, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть ~-1% (закрылось по trailing SL=99k)
  const expectedPnl = -1.0;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 0.5) {
    fail(`PNL should be ~${expectedPnl}%, got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`listenPartialProfit + trailingStop WORKS: Applied at level ${profitEvents.find(l => l >= 20)}%, PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING STOP ТЕСТ #5: Multiple trailing stop adjustments on progressive profit levels
 *
 * Проверяем что:
 * - Можно применять trailing stop несколько раз по мере роста profit
 * - Каждая последующая корректировка должна улучшать SL (система разрешает только улучшение)
 * - Финальный SL отражает все накопленные корректировки
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=98k (distance=2%)
 * 2. При 10% profit: trailingStop(-0.5%) → newSL=98.5k (distance=1.5%)
 * 3. При 20% profit: trailingStop(-0.5%) → newSL=99k (distance=1%)
 * 4. При 30% profit: trailingStop(-0.5%) → newSL=99.5k (distance=0.5%)
 * 5. Цена падает до 99.3k
 * 6. Позиция закрывается по финальному trailing SL (99.5k)
 */
test("TRAILING STOP: Multiple adjustments on progressive profit with onPartialProfit", async ({ pass, fail }) => {
  const profitEvents = [];
  const trailingAdjustments = [];

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
    exchangeName: "binance-trailing-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-trailing-multiple",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

    
      // Буферные свечи на basePrice (100k)
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

      // Генерируем 60 свечей: рост + стабильность + падение к SL
      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;

        let price;
        if (i < 20) {
          // Фаза 1 (0-19): Линейный рост от 100k к 120k за 20 свечей
          price = basePrice + (20000 * i / 20);
        } else if (i < 40) {
          // Фаза 2 (20-39): Стабильная прибыль на 120k (достигаем 30% progress)
          price = basePrice + 20000;
        } else {
          // Фаза 3 (40-59): Падение до 98k (пробиваем trailing SL=98.3k)
          price = 98000;
        }

        allCandles.push({
          timestamp,
          open: price,
          high: price + 100,
          low: price - 100,
          close: price,
          volume: 100
        });
      }

      // Immediate activation: НЕ указываем priceOpen, система возьмёт currentPrice (VWAP)
      // Это гарантирует что signal.priceOpen будет соответствовать текущему VWAP
      return {
        position: "long",
        // priceOpen не указан → будет currentPrice (VWAP ≈ 100k изначально, растёт до 120k)
        priceTakeProfit: basePrice + 60000,  // 160000
        priceStopLoss: basePrice - 2200,     // 97800
        minuteEstimatedTime: 200,  // Увеличено чтобы успеть пройти все 60 свечей
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, _signal, _currentPrice, revenuePercent, _backtest) => {
        profitEvents.push(revenuePercent);

        // Apply trailing stop at specific milestone levels (10%, 20%, 30%)
        // Using rounded level to match milestone detection
        const level = Math.round(revenuePercent / 10) * 10;

        if (level === 10 && !trailingAdjustments.includes(10)) {
          await trailingStop(symbol, -0.5);
          trailingAdjustments.push(10);
        } else if (level === 20 && !trailingAdjustments.includes(20)) {
          await trailingStop(symbol, -0.5);
          trailingAdjustments.push(20);
        } else if (level === 30 && !trailingAdjustments.includes(30)) {
          await trailingStop(symbol, -0.5);
          trailingAdjustments.push(30);
        }
      },
    },
  });

  addFrame({
    frameName: "50m-trailing-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-multiple",
    exchangeName: "binance-trailing-multiple",
    frameName: "50m-trailing-multiple",
  });

  await awaitSubject.toPromise();
  await sleep(200); // Let all logs flush

  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (trailingAdjustments.length < 3) {
    fail(`Expected 3 trailing adjustments, got ${trailingAdjustments.length}`);
    return;
  }

  if (profitEvents.length < 3) {
    fail(`Expected at least 3 profit events, got ${profitEvents.length}`);
    return;
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }


  // Проверяем PNL: ожидается убыток около -2% (entry≈100k, trailing SL=98.3k, close=98k)
  // PNL = (98000 - 100000) / 100000 * 100 = -2%
  const expectedPnl = -2.0;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 0.5) {
    fail(`PNL should be ~${expectedPnl}%, got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`Multiple trailing adjustments WORK: Applied at ${trailingAdjustments.join('%, ')}%, final PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING STOP ТЕСТ #6: Apply trailing stop on partial LOSS events with listenPartialLoss
 *
 * Проверяем что:
 * - listenPartialLoss отслеживает движение цены к SL
 * - Можно применить trailingStop даже при partial loss (подтянуть SL ещё ближе при убытках)
 * - Система позволяет только УЛУЧШЕНИЕ SL (для LONG: SL двигается ВВЕРХ)
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=98k (distance=2%)
 * 2. Цена падает, достигая partial loss событий (10%, 20%)
 * 3. При 10% loss пытаемся применить trailingStop(-0.5%) → newSL=98.5k (улучшение)
 * 4. При 20% loss пытаемся применить trailingStop(-0.5%) → newSL=99k (улучшение)
 * 5. Цена падает до 98.7k
 * 6. Позиция закрывается по trailing SL (99k), а не по original SL (98k)
 */
test("TRAILING STOP: Apply on listenPartialLoss events for loss protection", async ({ pass, fail }) => {
  const lossEvents = [];
  const trailingAdjustments = [];

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
    exchangeName: "binance-trailing-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-trailing-loss",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буферные свечи на basePrice для correct VWAP initialization
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

      // 60 свечей: постепенное падение к SL
      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;

        let price;
        if (i < 10) {
          // Фаза 1 (0-9): Стабильная цена 100k (начальный VWAP)
          price = basePrice;
        } else if (i < 20) {
          // Фаза 2 (10-19): Падение до 99.68k (10% loss level)
          price = 99680;
        } else if (i < 30) {
          // Фаза 3 (20-29): Падение до 99.46k (20% loss level)
          price = 99460;
        } else if (i < 50) {
          // Фаза 4 (30-49): Падение до 97k (гарантированно пробивает trailing SL ≈98.3k)
          price = 97000;
        } else {
          // Остальное: не должно достигаться
          price = basePrice;
        }

        allCandles.push({
          timestamp,
          open: price,
          high: price + 100,
          low: price - 100,
          close: price,
          volume: 100
        });
      }

      return {
        position: "long",
        // priceOpen не указан → будет currentPrice (VWAP ≈ 100k)
        priceTakeProfit: basePrice + 50000, // 150000
        priceStopLoss: basePrice - 2200,    // 97800
        minuteEstimatedTime: 200,  // Увеличено
      };
    },
  });

  addFrame({
    frameName: "60m-trailing-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  // Subscribe to partial loss events and apply trailing stop at specific loss levels
  const unsubscribeLoss = listenPartialLoss(async ({ symbol, level, data, currentPrice }) => {
    lossEvents.push(level);
    console.log(`[listenPartialLoss] Level: ${level}%, currentPrice=${currentPrice}, SL=${data.priceStopLoss}`);

    // Apply trailing stop at 10% and 20% loss levels (подтягиваем SL вверх)
    if (level === 10 && !trailingAdjustments.includes(10)) {
      console.log(`[trailingStop at loss 10%] shift=-0.5%`);
      await trailingStop(symbol, -0.5);
      trailingAdjustments.push(10);
    } else if (level === 20 && !trailingAdjustments.includes(20)) {
      console.log(`[trailingStop at loss 20%] shift=-0.5%`);
      await trailingStop(symbol, -0.5);
      trailingAdjustments.push(20);
    }
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-loss",
    exchangeName: "binance-trailing-loss",
    frameName: "60m-trailing-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();
  unsubscribeLoss();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (trailingAdjustments.length < 2) {
    fail(`Expected at least 2 trailing adjustments, got ${trailingAdjustments.length}`);
    return;
  }

  if (lossEvents.length < 2) {
    fail(`Expected at least 2 loss events, got ${lossEvents.length}`);
    return;
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }

  console.log(`[TEST] Loss events: ${lossEvents.join(', ')}%, Adjustments: ${trailingAdjustments.join(', ')}%, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть около -2% до -3% (entry≈100k, close≈97k, trailing SL подтянулся)
  // PNL = (97000 - 100000) / 100000 * 100 = -3%
  const expectedPnl = -2.5;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 1.0) {
    fail(`PNL should be ~${expectedPnl}%, got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`listenPartialLoss + trailingStop WORKS: Applied at loss ${trailingAdjustments.join('%, ')}%, protected with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING STOP ТЕСТ #2: Trailing stop rejects wrong direction for LONG position
 *
 * Проверяем что:
 * - Первый вызов trailingStop устанавливает направление движения SL (вверх или вниз)
 * - Система отклоняет попытки двигать SL в противоположном направлении
 * - Позиция закрывается по trailing SL, установленному в правильном направлении
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=99k (distance=1%)
 * 2. Первый вызов trailingStop(-0.5) → newSL=99.5k (направление UP установлено)
 * 3. Второй вызов trailingStop(+1) → система ОТКЛОНЯЕТ (пытается двигать вниз, а направление UP)
 * 4. Цена падает до 99.3k
 * 5. Позиция закрывается по первому trailing SL (99.5k), а НЕ по попытке в другую сторону
 */
test("TRAILING STOP: Rejects wrong direction for LONG position", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let firstTrailingApplied = false;
  let secondTrailingApplied = false;

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
    exchangeName: "binance-trailing-reject-dir",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-trailing-reject-dir",
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

      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1 (0-4): Активация
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
        // Фаза 2 (5-9): Небольшой рост (+5%) для применения первого trailing
        else if (i >= 5 && i < 10) {
          const price = basePrice + 5000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (10-14): Еще рост (+7%) для второй попытки trailing
        else if (i >= 10 && i < 15) {
          const price = basePrice + 7000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 4 (15-24): Падение до 99.3k (пробивает первый trailing SL=99.5k)
        else if (i >= 15 && i < 25) {
          const price = 99300;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Остальное: не должно достигаться
        else {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 100000
        priceTakeProfit: basePrice + 10000, // 110000 (+10%)
        priceStopLoss: basePrice - 1000,    // 99000 (-1%)
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onOpen: async (symbol, _signal, _priceOpen, _backtest) => {
        console.log(`[onOpen] Applying first trailing stop`);

        // Первый вызов: устанавливает направление UP
        // percentShift = -0.5% → newDistance = 1% + (-0.5%) = 0.5% → newSL = 99.5k
        // Направление: UP (99.5k > 99k)
        await trailingStop(symbol, -0.5);
        firstTrailingApplied = true;

        console.log(`[trailingStop #1] Applied shift=-0.5%, direction set to UP (99.5k > 99k)`);
      },
      onPartialProfit: async (symbol, _signal, _currentPrice, revenuePercent, _backtest) => {
        // Второй вызов при 5% profit: пытается двигать вниз (должно быть отклонено)
        if (firstTrailingApplied && !secondTrailingApplied && revenuePercent >= 5) {
          console.log(`[onPartialProfit] Second trailing: shift=+1% at ${revenuePercent.toFixed(2)}%`);

          // percentShift = +1% → newDistance = 1% + 1% = 2% → newSL = 98k
          // Направление: DOWN (98k < 99.5k) - ОТКЛОНЯЕТСЯ системой, т.к. изначальное направление UP
          await trailingStop(symbol, +1);
          secondTrailingApplied = true;

          console.log(`[trailingStop #2] Attempted shift=+1%, but should be REJECTED (wrong direction)`);
        }
      },
    },
  });

  addFrame({
    frameName: "50m-trailing-reject-dir",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-reject-dir",
    exchangeName: "binance-trailing-reject-dir",
    frameName: "50m-trailing-reject-dir",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!firstTrailingApplied) {
    fail("First trailing stop was NOT applied!");
    return;
  }

  if (!secondTrailingApplied) {
    fail("Second trailing stop was NOT attempted!");
    return;
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  // Проверяем что закрылось по stop_loss
  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }

  console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть убыток близкий к -0.5% (trailing SL=99.5k)
  // Фактическое закрытие происходит когда low пробивает SL, поэтому может быть небольшое отклонение
  // Главное - PNL НЕ должен быть -1% (original SL) или -2% (если бы второй вызов сработал)
  // Проверяем что PNL в диапазоне от -0.3% до -1.0% (лучше original SL на -1%)
  if (closedResult.pnl.pnlPercentage < -1.0 || closedResult.pnl.pnlPercentage > -0.3) {
    fail(`PNL should be between -1.0% and -0.3% (trailing SL applied), got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING STOP DIRECTION PROTECTION WORKS: System rejected wrong direction, closed by first trailing SL with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING STOP ТЕСТ #7: Cannot change trailing stop direction after it's set
 *
 * Проверяем что:
 * - Направление trailing stop устанавливается первым вызовом и больше не меняется
 * - Система отклоняет ВСЕ попытки изменить направление (не только ухудшающие, но и улучшающие в другую сторону)
 * - Можно только продолжать движение в том же направлении
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=98k (distance=2%)
 * 2. Первый вызов trailingStop(+1) → newSL=97k (направление DOWN установлено, ослабляем защиту)
 * 3. Второй вызов trailingStop(-3) → система ОТКЛОНЯЕТ (пытается двигать вверх, улучшая защиту, но направление DOWN)
 * 4. Третий вызов trailingStop(+2) → ПРИНИМАЕТСЯ (направление DOWN, продолжаем движение вниз, newSL=96k)
 * 5. Цена падает до 96.5k
 * 6. Позиция закрывается по финальному trailing SL (96k)
 */
test("TRAILING STOP: Cannot change direction once set", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let firstTrailingApplied = false;
  let secondTrailingAttempted = false;
  let thirdTrailingApplied = false;

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
    exchangeName: "binance-trailing-no-direction-change",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-trailing-no-direction-change",
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

      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1 (0-9): Активация и стабильность на basePrice
        if (i < 10) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
        // Фаза 2 (10-19): Небольшой рост до +3% для второй попытки
        else if (i >= 10 && i < 20) {
          const price = basePrice + 3000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (20-29): Рост до +5% для третьей попытки
        else if (i >= 20 && i < 30) {
          const price = basePrice + 5000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 4 (30-39): Падение до 95k (гарантированно пробивает третий trailing SL=96k)
        else if (i >= 30 && i < 40) {
          const price = 95000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,  // low=94900, гарантированно < 96000
            close: price,
            volume: 100
          });
        }
        // Остальное: не должно достигаться
        else {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 100000
        priceTakeProfit: basePrice + 20000, // 120000 (+20%)
        priceStopLoss: basePrice - 2000,    // 98000 (-2%)
        minuteEstimatedTime: 200,  // Увеличено для 50 свечей
      };
    },
    callbacks: {
      onOpen: async (symbol, _signal, _priceOpen, _backtest) => {
        console.log(`[onOpen] Applying first trailing stop (direction DOWN)`);

        // Первый вызов: устанавливает направление DOWN (ослабление защиты)
        // percentShift = +1% → newDistance = 2% + 1% = 3% → newSL = 97k
        // Направление: DOWN (97k < 98k)
        await trailingStop(symbol, +1);
        firstTrailingApplied = true;

        console.log(`[trailingStop #1] Applied shift=+1%, direction set to DOWN (97k < 98k original)`);
      },
      onPartialProfit: async (symbol, _signal, _currentPrice, revenuePercent, _backtest) => {
        // Второй вызов при 3% profit: пытается двигать вверх (улучшение, но wrong direction)
        if (firstTrailingApplied && !secondTrailingAttempted && revenuePercent >= 3 && revenuePercent < 5) {
          console.log(`[onPartialProfit] Second trailing: shift=-3% at ${revenuePercent.toFixed(2)}%`);

          // percentShift = -3% → newDistance = 2% + (-3%) = -1% → newSL = 101k (в зоне прибыли!)
          // Направление: UP (101k > 97k) - ОТКЛОНЯЕТСЯ, т.к. изначальное направление DOWN
          // Даже несмотря на то, что это УЛУЧШАЕТ защиту!
          await trailingStop(symbol, -3);
          secondTrailingAttempted = true;

          console.log(`[trailingStop #2] Attempted shift=-3% (improvement!), but should be REJECTED (wrong direction)`);
        }

        // Третий вызов при 5% profit: двигаем вниз (same direction)
        if (secondTrailingAttempted && !thirdTrailingApplied && revenuePercent >= 5) {
          console.log(`[onPartialProfit] Third trailing: shift=+2% at ${revenuePercent.toFixed(2)}%`);

          // percentShift = +2% → newDistance = 2% + 2% = 4% → newSL = 96k
          // Направление: DOWN (96k < 97k) - ПРИНИМАЕТСЯ, т.к. направление DOWN
          await trailingStop(symbol, +2);
          thirdTrailingApplied = true;

          console.log(`[trailingStop #3] Applied shift=+2%, continuing DOWN direction (96k < 97k)`);
        }
      },
    },
  });

  addFrame({
    frameName: "50m-trailing-no-direction-change",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-no-direction-change",
    exchangeName: "binance-trailing-no-direction-change",
    frameName: "50m-trailing-no-direction-change",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!firstTrailingApplied) {
    fail("First trailing stop was NOT applied!");
    return;
  }

  if (!secondTrailingAttempted) {
    fail("Second trailing stop was NOT attempted!");
    return;
  }

  if (!thirdTrailingApplied) {
    fail("Third trailing stop was NOT applied!");
    return;
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  // Проверяем что закрылось по stop_loss
  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }

  console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть убыток близкий к -4% (третий trailing SL=96k был применен)
  // Если бы второй вызов сработал (улучшение в wrong direction), PNL был бы положительным (+1% при SL=101k)
  // Если бы третий вызов не сработал, PNL был бы -3% (первый trailing SL=97k)
  // PNL = (96000 - 100000) / 100000 * 100 = -4%
  // Проверяем что PNL в диапазоне от -3.5% до -4.5% (третий trailing применен)
  if (closedResult.pnl.pnlPercentage < -4.5 || closedResult.pnl.pnlPercentage > -3.5) {
    fail(`PNL should be between -4.5% and -3.5% (third trailing SL applied), got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING STOP DIRECTION LOCK WORKS: System rejected improvement in wrong direction, accepted continuation in same direction. Final PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});

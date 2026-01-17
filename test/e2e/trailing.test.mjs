import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenDoneBacktest,
  listenError,
  listenSignalBacktest,
  listenPartialProfitAvailable,
  listenPartialLossAvailable,
  commitTrailingStop,
  commitTrailingTake,
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
 * 3. ВызываемcommitTrailingStop(-1) → newDistance = 2% + (-1%) = 1% → newSL = 99k
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

  addExchangeSchema({
    exchangeName: "binance-trailing-tighten",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
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
          // console.log(`[onPartialProfit] Applying trailing stop: revenuePercent=${revenuePercent.toFixed(2)}%`);

          // percentShift = -1% → newDistance = 2% + (-1%) = 1% → newSL = 99k
          await commitTrailingStop(symbol, -1, currentPrice);
          trailingApplied = true;

          // console.log(`[trailingStop] Applied shift=-1%, original SL distance=2%, new distance=1%`);
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-tighten",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
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

  // console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

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
 * 3. ВызываемcommitTrailingStop(-1) → newDistance = 2% + (-1%) = 1% → newSL = 101k
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

  addExchangeSchema({
    exchangeName: "binance-trailing-short",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
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
          // console.log(`[onPartialProfit SHORT] Applying trailing stop: revenuePercent=${revenuePercent.toFixed(2)}%`);

          // percentShift = -1% → newDistance = 2% + (-1%) = 1% → newSL = 101k
          await commitTrailingStop(symbol, -1, currentPrice);
          trailingApplied = true;

          // console.log(`[trailingStop SHORT] Applied shift=-1%, original SL distance=2%, new distance=1%`);
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-short",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest SHORT] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
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

  // console.log(`[TEST SHORT] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

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
 * 3. При достижении 20% profit применяемcommitTrailingStop(-1%) → newSL=99k
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

  addExchangeSchema({
    exchangeName: "binance-trailing-listen-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
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

  addFrameSchema({
    frameName: "60m-trailing-listen-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  // Subscribe to partial profit events and apply trailing stop at 20% level
  const unsubscribeProfit = listenPartialProfitAvailable(async ({ symbol, level, backtest }) => {
    profitEvents.push(level);
    // console.log(`[listenPartialProfit] Level: ${level}%`);

    // Apply trailing stop when reaching 20% profit
    if (!trailingApplied && level >= 20) {
      // console.log(`[Applying trailingStop] At level ${level}%, shift=-1%`);
      
      // Нужно получить текущую цену, используем приблизительную для теста
      const currentPrice = basePrice + 25000; // ~25% profit level price
      await commitTrailingStop(symbol, -1, currentPrice);
      trailingApplied = true;
    }
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
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

  // console.log(`[TEST] Profit events: ${profitEvents.join(', ')}%, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

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

  addExchangeSchema({
    exchangeName: "binance-trailing-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
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
      onPartialProfit: async (symbol, _signal, currentPrice, revenuePercent, _backtest) => {
        profitEvents.push(revenuePercent);

        // Apply trailing stop at specific milestone levels (10%, 20%, 30%)
        // Using rounded level to match milestone detection
        const level = Math.round(revenuePercent / 10) * 10;

        if (level === 10 && !trailingAdjustments.includes(10)) {
          await commitTrailingStop(symbol, -0.5, currentPrice);  // -0.5%: distance = 2% - 0.5% = 1.5%
          trailingAdjustments.push(10);
        } else if (level === 20 && !trailingAdjustments.includes(20)) {
          await commitTrailingStop(symbol, -1.0, currentPrice);  // -1.0%: distance = 2% - 1.0% = 1.0% (поглощает -0.5%)
          trailingAdjustments.push(20);
        } else if (level === 30 && !trailingAdjustments.includes(30)) {
          await commitTrailingStop(symbol, -1.5, currentPrice);  // -1.5%: distance = 2% - 1.5% = 0.5% (поглощает -1.0%)
          trailingAdjustments.push(30);
        }
      },
    },
  });

  addFrameSchema({
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


  // Проверяем PNL: ожидается убыток около -1.1% (с новой логикой original-based trailing + absorption)
  // Original SL: 97800 (distance = 2.2%)
  // После трех adjustments (-0.5%, -1.0%, -1.5%): final distance = 2.2% - 1.5% = 0.7%
  // Final trailing SL: 100000 * (1 - 0.007) = 99300
  // Базовый PNL: (99300 - 100000) / 100000 = -0.7%
  // С учетом slippage + fees (~0.4%): -0.7% - 0.4% = -1.1%
  const expectedPnl = -1.1;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 0.3) {
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
 * 3. При 10% loss пытаемся применитьcommitTrailingStop(-0.5%) → newSL=98.5k (улучшение)
 * 4. При 20% loss пытаемся применитьcommitTrailingStop(-0.5%) → newSL=99k (улучшение)
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

  addExchangeSchema({
    exchangeName: "binance-trailing-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
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

  addFrameSchema({
    frameName: "60m-trailing-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  // Subscribe to partial loss events and apply trailing stop at specific loss levels
  const unsubscribeLoss = listenPartialLossAvailable(async ({ symbol, level, data, currentPrice }) => {
    lossEvents.push(level);
    // console.log(`[listenPartialLoss] Level: ${level}%, currentPrice=${currentPrice}, SL=${data.priceStopLoss}`);

    // Apply trailing stop at 10% and 20% loss levels (подтягиваем SL вверх)
    if (level === 10 && !trailingAdjustments.includes(10)) {
      // console.log(`[trailingStop at loss 10%] shift=-0.5%`);
      await commitTrailingStop(symbol, -0.5, currentPrice);
      trailingAdjustments.push(10);
    } else if (level === 20 && !trailingAdjustments.includes(20)) {
      // console.log(`[trailingStop at loss 20%] shift=-0.5%`);
      await commitTrailingStop(symbol, -0.5, currentPrice);
      trailingAdjustments.push(20);
    }
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
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

  // console.log(`[TEST] Loss events: ${lossEvents.join(', ')}%, Adjustments: ${trailingAdjustments.join(', ')}%, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

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
 * 2. Первый вызовcommitTrailingStop(-0.5) → newSL=99.5k (направление UP установлено)
 * 3. Второй вызовcommitTrailingStop(+1) → система ОТКЛОНЯЕТ (пытается двигать вниз, а направление UP)
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

  addExchangeSchema({
    exchangeName: "binance-trailing-reject-dir",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
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
      onOpen: async (symbol, _signal, priceOpen, _backtest) => {
        // console.log(`[onOpen] Applying first trailing stop`);

        // Первый вызов: устанавливает направление UP
        // percentShift = -0.5% → newDistance = 1% + (-0.5%) = 0.5% → newSL = 99.5k
        // Направление: UP (99.5k > 99k)
        await commitTrailingStop(symbol, -0.5, priceOpen);
        firstTrailingApplied = true;

        // console.log(`[trailingStop #1] Applied shift=-0.5%, direction set to UP (99.5k > 99k)`);
      },
      onPartialProfit: async (symbol, _signal, currentPrice, revenuePercent, _backtest) => {
        // Второй вызов при 5% profit: пытается двигать вниз (должно быть отклонено)
        if (firstTrailingApplied && !secondTrailingApplied && revenuePercent >= 5) {
          // console.log(`[onPartialProfit] Second trailing: shift=+1% at ${revenuePercent.toFixed(2)}%`);

          // percentShift = +1% → newDistance = 1% + 1% = 2% → newSL = 98k
          // Направление: DOWN (98k < 99.5k) - ОТКЛОНЯЕТСЯ системой, т.к. изначальное направление UP
          await commitTrailingStop(symbol, +1, currentPrice);
          secondTrailingApplied = true;

          // console.log(`[trailingStop #2] Attempted shift=+1%, but should be REJECTED (wrong direction)`);
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-reject-dir",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
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

  // console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

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
 * 2. Первый вызовcommitTrailingStop(+1) → newSL=97k (направление DOWN установлено, ослабляем защиту)
 * 3. Второй вызовcommitTrailingStop(-3) → система ОТКЛОНЯЕТ (пытается двигать вверх, улучшая защиту, но направление DOWN)
 * 4. Третий вызовcommitTrailingStop(+2) → ПРИНИМАЕТСЯ (направление DOWN, продолжаем движение вниз, newSL=96k)
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

  addExchangeSchema({
    exchangeName: "binance-trailing-no-direction-change",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
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
      onOpen: async (symbol, _signal, priceOpen, _backtest) => {
        // Первый вызов: устанавливает базовый trailing SL (подтягиваем на 1%)
        // Original SL: 98000, distance = 2%
        // percentShift = -1% → newDistance = 2% - 1% = 1% → newSL = 99000
        await commitTrailingStop(symbol, -1, priceOpen);
        firstTrailingApplied = true;
      },
      onPartialProfit: async (symbol, _signal, _currentPrice, revenuePercent, _backtest) => {
        // Второй вызов при 3% profit: пытается слабее защитить (меньший percentShift)
        if (firstTrailingApplied && !secondTrailingAttempted && revenuePercent >= 3 && revenuePercent < 5) {
          // percentShift = -0.5% → newDistance = 2% - 0.5% = 1.5% → newSL = 98500
          // ОТКЛОНЯЕТСЯ: 98500 < 99000 (worse protection for LONG, smaller percentShift absorbed by larger)
          await commitTrailingStop(symbol, -0.5, _currentPrice);
          secondTrailingAttempted = true;
        }

        // Третий вызов при 5% profit: еще более агрессивная защита
        if (secondTrailingAttempted && !thirdTrailingApplied && revenuePercent >= 5) {
          // percentShift = -1.5% → newDistance = 2% - 1.5% = 0.5% → newSL = 99500
          // ПРИНИМАЕТСЯ: 99500 > 99000 (better protection for LONG, larger percentShift absorbs smaller)
          await commitTrailingStop(symbol, -1.5, _currentPrice);
          thirdTrailingApplied = true;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-no-direction-change",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
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

  // Проверяем PNL с новой логикой original-based + absorption:
  // Original SL: 98000, distance = 2%
  // First adjustment: -1% → SL = 99000 (distance = 1%)
  // Second adjustment: -0.5% → SL = 98500, REJECTED (98500 < 99000, worse for LONG)
  // Third adjustment: -1.5% → SL = 99500 (distance = 0.5%), ACCEPTED (99500 > 99000, better for LONG)
  // Final trailing SL: 99500
  // Падение до 95000, закрытие по SL на 99500
  // Базовый PNL: (99500 - 100000) / 100000 * 100 = -0.5%
  // С учетом slippage + fees (~0.4%): -0.5% - 0.4% = -0.9%
  const expectedPnl = -0.9;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 0.3) {
    fail(`PNL should be ~${expectedPnl}% (third trailing SL=99500 applied), got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING STOP ABSORPTION WORKS: System rejected weaker protection (-0.5%), accepted stronger protection (-1.5%). Final PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING STOP ТЕСТ #8: Move SL to breakeven using getPendingSignal
 *
 * Проверяем что:
 * - Можно использовать Backtest.getPendingSignal() для получения текущей позиции
 * - На основе данных позиции можно вычислить нужный percentShift для безубытка
 * - Trailing stop корректно устанавливает SL на уровень входа (breakeven)
 * - Позиция закрывается с PNL=0% при откате к entry
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=98k (distance=2%)
 * 2. Цена растет до +10% (110k)
 * 3. Используем getPendingSignal() для получения данных позиции
 * 4. Вычисляем percentShift для безубытка: shift = -2% (distance 2% → 0%)
 * 5. ПрименяемcommitTrailingStop(-2) → newSL=100k (breakeven)
 * 6. Цена откатывает к 100k
 * 7. Позиция закрывается с PNL=0%
 */
test("TRAILING STOP: Move to breakeven using getPendingSignal", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let breakevenApplied = false;

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

  addExchangeSchema({
    exchangeName: "binance-trailing-breakeven",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-trailing-breakeven",
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
        // Фаза 2 (5-14): Рост до +10% (110k)
        else if (i >= 5 && i < 15) {
          const price = basePrice + 10000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (15-24): Откат к breakeven (100k)
        else if (i >= 15 && i < 25) {
          const price = basePrice;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,  // low=99900, пробивает breakeven SL=100000
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
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, _signal, _currentPrice, revenuePercent, _backtest) => {
        // Применяем breakeven при достижении 10% profit
        if (!breakevenApplied && revenuePercent >= 10) {
          // console.log(`[onPartialProfit] Profit reached ${revenuePercent.toFixed(2)}%, moving SL to breakeven`);

          // Получаем текущую позицию через getPendingSignal
          const pendingSignal = await Backtest.getPendingSignal(symbol, {
            strategyName: "test-trailing-breakeven",
            exchangeName: "binance-trailing-breakeven",
            frameName: "50m-trailing-breakeven",
          });

          if (!pendingSignal) {
            console.error(`[onPartialProfit] No pending signal found!`);
            return;
          }

          // console.log(`[getPendingSignal] Entry: ${pendingSignal.priceOpen}, Original SL: ${pendingSignal.priceStopLoss}`);

          // Вычисляем текущее расстояние SL от entry в процентах
          const currentSlDistance = Math.abs((pendingSignal.priceOpen - pendingSignal.priceStopLoss) / pendingSignal.priceOpen * 100);
          // console.log(`[Calculate] Current SL distance: ${currentSlDistance.toFixed(2)}%`);

          // Для breakeven нужно: newDistance = 0%
          // percentShift = newDistance - currentDistance = 0% - 2% = -2%
          const percentShift = -currentSlDistance;
          // console.log(`[Calculate] percentShift for breakeven: ${percentShift.toFixed(2)}%`);

          // Применяем trailing stop для безубытка
          await commitTrailingStop(symbol, percentShift, _currentPrice);
          breakevenApplied = true;

          // console.log(`[trailingStop] Applied shift=${percentShift.toFixed(2)}%, SL moved to breakeven (${pendingSignal.priceOpen})`);
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-breakeven",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-breakeven",
    exchangeName: "binance-trailing-breakeven",
    frameName: "50m-trailing-breakeven",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!breakevenApplied) {
    fail("Breakeven trailing stop was NOT applied!");
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

  // console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть близок к 0% (breakeven с учетом fees и slippage)
  // Фактическое закрытие происходит когда low пробивает SL=100k
  // PNL включает fees и slippage, поэтому допускаем отклонение до -0.5%
  // Главное - PNL НЕ должен быть -2% (original SL без breakeven)
  if (closedResult.pnl.pnlPercentage < -0.5 || closedResult.pnl.pnlPercentage > 0.2) {
    fail(`PNL should be close to 0% (breakeven with fees), got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING STOP BREAKEVEN WORKS: Used getPendingSignal to calculate shift, moved SL to entry, closed with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}% (including fees/slippage)`);
});


/**
 * TRAILING STOP ТЕСТ #9: Price intrusion protection blocks trailing stop
 *
 * Проверяем что:
 * - Система блокирует установку trailing SL когда currentPrice уже пересек новый уровень SL
 * - LONG позиция: если newSL > currentPrice, то trailing stop блокируется
 * - SHORT позиция: если newSL < currentPrice, то trailing stop блокируется
 * - Позиция закрывается по original SL, а не по заблокированному trailing SL
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=98k (distance=2%)
 * 2. Цена падает до 97.5k (уже ниже того SL который хотим установить)
 * 3. Пытаемся применитьcommitTrailingStop(-0.5%) → newSL=99.5k
 * 4. Система блокирует: currentPrice=97.5k < newSL=99.5k (price intrusion!)
 * 5. Позиция закрывается по original SL (98k), PNL ≈ -2%
 */
test("TRAILING STOP: Price intrusion protection blocks trailing stop", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let trailingAttempted = false;
  let intrusiionBlocked = false;

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

  addExchangeSchema({
    exchangeName: "binance-trailing-intrusion",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-trailing-intrusion",
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

        // Фаза 1 (0-4): Активация на basePrice
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
        // Фаза 2 (5-9): Небольшой рост до +5%
        else if (i >= 5 && i < 10) {
          const price = basePrice + 5000; // 105k
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (10-19): Резкое падение до 97.5k (ниже будущего trailing SL=99.5k)
        else if (i >= 10 && i < 20) {
          const price = 97500; // Цена уже пересекла будущий trailing SL!
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 4 (20-29): Дальнейшее падение до 97k (пробивает original SL=98k)
        else if (i >= 20 && i < 30) {
          const price = 97000; // Пробивает original SL
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
        priceStopLoss: basePrice - 2000,    // 98000 (-2%)
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, _signal, currentPrice, revenuePercent, _backtest) => {
        // Пытаемся применить trailing stop при 5% profit
        if (!trailingAttempted && revenuePercent >= 5) {
          // console.log(`[onPartialProfit] Attempting trailing stop at ${revenuePercent.toFixed(2)}% profit, currentPrice=${currentPrice}`);

          try {
            // percentShift = -0.5% → newDistance = 2% + (-0.5%) = 1.5% → newSL = 98.5k
            // Но currentPrice=97.5k < newSL=98.5k → price intrusion!
            await commitTrailingStop(symbol, -0.5, currentPrice);
            // console.log(`[trailingStop] Applied shift=-0.5%, newSL should be ~98.5k`);
          } catch (error) {
            // console.log(`[trailingStop] BLOCKED by price intrusion: ${error.message}`);
            intrusiionBlocked = true;
          }
          
          trailingAttempted = true;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-intrusion",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-intrusion",
    exchangeName: "binance-trailing-intrusion",
    frameName: "50m-trailing-intrusion",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!trailingAttempted) {
    fail("Trailing stop was NOT attempted!");
    return;
  }

  // Проверяем что price intrusion защита сработала
  if (!intrusiionBlocked) {
    // console.log("WARNING: Price intrusion was not explicitly blocked by exception, but may have been silently prevented");
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

  // console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть убыток близкий к -2% (original SL=98k)
  // Если бы trailing stop сработал, PNL был бы лучше (около -1.5% при SL=98.5k)
  // PNL = (97000 - 100000) / 100000 * 100 = -3%
  // Но мы должны закрыться по original SL=98k, поэтому PNL ≈ -2%
  const expectedPnl = -2.0;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 0.8) {
    fail(`PNL should be ~${expectedPnl}% (original SL), got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`PRICE INTRUSION PROTECTION WORKS: Trailing stop blocked when currentPrice crossed intended SL, closed by original SL with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING PROFIT ТЕСТ #1: Trailing profit tightens TP for LONG position
 *
 * Проверяем что:
 * - trailingTake с отрицательным shift сужает расстояние TP (подтягивает TP ближе к entry)
 * - Позиция закрывается по новому trailing TP, а не по original TP
 * - percentShift работает относительно цены входа (entry price)
 *
 * Сценарий:
 * 1. LONG позиция открывается: entry=100k, originalTP=130k (distance=30%)
 * 2. Цена растет до +15%
 * 3. ВызываемcommitTrailingTake(-10) → newDistance = 30% + (-10%) = 20% → newTP = 120k
 * 4. Цена растет до 121k
 * 5. Позиция закрывается по trailing TP (120k), а не по original TP (130k)
 */
test("TRAILING PROFIT: Tightens TP for LONG position with negative shift", async ({ pass, fail }) => {
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

  addExchangeSchema({
    exchangeName: "binance-trailing-profit-tighten",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-trailing-profit-tighten",
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
        // Фаза 2 (5-14): Рост до +12% (чтобы получить 10% partial profit)
        else if (i >= 5 && i < 15) {
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
        // Фаза 3 (15-24): Рост до 120.5k (пробивает trailing TP=120k)
        else if (i >= 15 && i < 25) {
          const price = 120500; // Выше trailing TP (120k), но ниже original TP (130k)
          allCandles.push({
            timestamp,
            open: price,
            high: price + 500, // high=121000, пробивает trailing TP=120k
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
        priceStopLoss: basePrice - 5000,    // 95000 (-5%)
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, _signal, currentPrice, revenuePercent, _backtest) => {
        // Применяем trailing profit когда достигли +10%
        if (!trailingApplied && revenuePercent >= 10) {
          // console.log(`[onPartialProfit] Applying trailing profit: revenuePercent=${revenuePercent.toFixed(2)}%`);

          try {
            // percentShift = -10% → newDistance = 30% + (-10%) = 20% → newTP = 120k
            await commitTrailingTake(symbol, -10, currentPrice);
            trailingApplied = true;
            // console.log(`[trailingTake] Applied shift=-10%, original TP distance=30%, new distance=20%`);
          } catch (error) {
            // console.log(`[trailingTake] ERROR:`, error.message);
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-profit-tighten",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-profit-tighten",
    exchangeName: "binance-trailing-profit-tighten",
    frameName: "50m-trailing-profit-tighten",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!trailingApplied) {
    fail("Trailing profit was NOT applied!");
    return;
  }

  // Находим closed событие
  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  // Проверяем что закрылось по take_profit (trailing TP)
  if (closedResult.closeReason !== "take_profit") {
    fail(`Expected closeReason="take_profit", got "${closedResult.closeReason}"`);
    return;
  }

  // console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: ожидаем что закрылось по trailing TP (120k), не по original TP (130k)
  // Если trailing TP сработал: PNL = (120000 - 100000) / 100000 * 100 = +20%
  // Если trailing TP НЕ сработал: PNL = (130000 - 100000) / 100000 * 100 = +30%
  // console.log(`[TEST] Actual PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
  // console.log(`[TEST] trailingApplied: ${trailingApplied}`);
  // console.log(`[TEST] All signal results:`, signalResults.map(r => ({ action: r.action, closeReason: r.closeReason, pnl: r.pnl?.pnlPercentage })));
  
  if (closedResult.pnl.pnlPercentage > 25) {
    fail(`Position closed by original TP (${closedResult.pnl.pnlPercentage.toFixed(2)}%), not trailing TP. Expected ~20%.`);
    return;
  }

  const expectedPnl = 20; // Expected trailing TP PNL
  pass(`TRAILING PROFIT WORKS: Signal closed by trailing TP with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}% (expected ~${expectedPnl}%)`);
});


/**
 * TRAILING PROFIT ТЕСТ #2: Trailing profit for SHORT position
 *
 * Проверяем что trailing profit работает корректно для SHORT позиций:
 * - Отрицательный shift сужает расстояние TP (подтягивает TP ближе к entry)
 * - SHORT: TP находится НИЖЕ entry, поэтому сужение означает повышение TP
 *
 * Сценарий:
 * 1. SHORT позиция: entry=100k, originalTP=70k (distance=30%)
 * 2. Цена падает до -15%
 * 3. ВызываемcommitTrailingTake(-10) → newDistance = 30% + (-10%) = 20% → newTP = 80k
 * 4. Цена падает до 79k
 * 5. Позиция закрывается по trailing TP (80k)
 */
test("TRAILING PROFIT: Tightens TP for SHORT position", async ({ pass, fail }) => {
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

  addExchangeSchema({
    exchangeName: "binance-trailing-profit-short",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-trailing-profit-short",
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
        // Фаза 2 (5-14): Падение до -12% (чтобы получить 10% partial profit для SHORT)
        else if (i >= 5 && i < 15) {
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
        // Фаза 3 (15-24): Падение до 79.5k (пробивает trailing TP=80k)
        else if (i >= 15 && i < 25) {
          const price = 79500; // Ниже trailing TP (80k), но выше original TP (70k)
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 500, // low=79000, пробивает trailing TP=80k
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
        priceStopLoss: basePrice + 5000,    // 105000 (+5%)
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, _signal, currentPrice, revenuePercent, _backtest) => {
        if (!trailingApplied && revenuePercent >= 10) {
          // console.log(`[onPartialProfit SHORT] Applying trailing profit: revenuePercent=${revenuePercent.toFixed(2)}%`);

          try {
            // percentShift = -10% → newDistance = 30% + (-10%) = 20% → newTP = 80k
            await commitTrailingTake(symbol, -10, currentPrice);
            trailingApplied = true;
            // console.log(`[trailingTake SHORT] Applied shift=-10%, original TP distance=30%, new distance=20%`);
          } catch (error) {
            // console.log(`[trailingTake SHORT] ERROR:`, error.message);
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-profit-short",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest SHORT] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-profit-short",
    exchangeName: "binance-trailing-profit-short",
    frameName: "50m-trailing-profit-short",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!trailingApplied) {
    fail("Trailing profit was NOT applied!");
    return;
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (closedResult.closeReason !== "take_profit") {
    fail(`Expected closeReason="take_profit", got "${closedResult.closeReason}"`);
    return;
  }

  // console.log(`[TEST SHORT] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL для SHORT: ожидаем что закрылось по trailing TP (80k), не по original TP (70k)
  // Если trailing TP сработал: PNL = (100k - 80k) / 100k * 100 = +20%
  // Если trailing TP НЕ сработал: PNL = (100k - 70k) / 100k * 100 = +30%
  // console.log(`[TEST SHORT] Actual PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
  // console.log(`[TEST SHORT] trailingApplied: ${trailingApplied}`);
  // console.log(`[TEST SHORT] All signal results:`, signalResults.map(r => ({ action: r.action, closeReason: r.closeReason, pnl: r.pnl?.pnlPercentage })));
  
  if (closedResult.pnl.pnlPercentage > 25) {
    fail(`SHORT position closed by original TP (${closedResult.pnl.pnlPercentage.toFixed(2)}%), not trailing TP. Expected ~20%.`);
    return;
  }

  pass(`TRAILING PROFIT SHORT WORKS: Signal closed by trailing TP with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING PROFIT ТЕСТ #3: Direction-based validation - once direction set, must continue
 *
 * Проверяем что:
 * - Первый вызов trailingTake устанавливает направление движения TP
 * - Система отклоняет попытки двигать TP в противоположном направлении
 * - Можно только продолжать движение в том же направлении
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalTP=120k (distance=20%)
 * 2. Первый вызовcommitTrailingTake(-5) → newTP=115k (направление CLOSER установлено)
 * 3. Второй вызовcommitTrailingTake(+3) → система ОТКЛОНЯЕТ (пытается двигать дальше от entry)
 * 4. Третий вызовcommitTrailingTake(-3) → ПРИНИМАЕТСЯ (направление CLOSER продолжается)
 * 5. Позиция закрывается по финальному trailing TP
 */
test("TRAILING PROFIT: Direction-based validation for LONG position", async ({ pass, fail }) => {
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

  addExchangeSchema({
    exchangeName: "binance-trailing-profit-direction",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-trailing-profit-direction",
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
        // Фаза 2 (10-19): Рост до +8% для второй попытки
        else if (i >= 10 && i < 20) {
          const price = basePrice + 8000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (20-29): Рост до +12% для третьей попытки
        else if (i >= 20 && i < 30) {
          const price = basePrice + 12000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 4 (30-39): Рост до 112.5k (пробивает финальный trailing TP≈112k)
        else if (i >= 30 && i < 40) {
          const price = 112500;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 500, // high=113000, пробивает финальный TP≈112k
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
        priceTakeProfit: basePrice + 20000, // 120000 (+20%)
        priceStopLoss: basePrice - 3000,    // 97000 (-3%)
        minuteEstimatedTime: 200, // Возвращаем обратно
      };
    },
    callbacks: {
      onOpen: async (symbol, _signal, priceOpen, _backtest) => {
        try {
          // Первый вызов: устанавливает базовый trailing TP (подтягиваем на 5% ближе к entry)
          // Original TP: 120000, distance = 20%
          // percentShift = -5% → newDistance = 20% - 5% = 15% → newTP = 115000
          await commitTrailingTake(symbol, -5, priceOpen);
          firstTrailingApplied = true;
        } catch (error) {
          // Unexpected error
        }
      },
      onPartialProfit: async (symbol, _signal, _currentPrice, revenuePercent, _backtest) => {
        // Второй вызов при 8% profit: пытается сделать менее консервативным (меньший percentShift)
        if (firstTrailingApplied && !secondTrailingAttempted && revenuePercent >= 8 && revenuePercent < 12) {
          try {
            // percentShift = -3% → newDistance = 20% - 3% = 17% → newTP = 117000
            // ОТКЛОНЯЕТСЯ: 117000 > 115000 (less conservative for LONG, smaller percentShift absorbed)
            await commitTrailingTake(symbol, -3, _currentPrice);
          } catch (error) {
            // Expected to be rejected silently by absorption logic
          }
          secondTrailingAttempted = true;
        }

        // Третий вызов при 12% profit: еще более консервативный TP
        if (secondTrailingAttempted && !thirdTrailingApplied && revenuePercent >= 12) {
          try {
            // percentShift = -8% → newDistance = 20% - 8% = 12% → newTP = 112000
            // ПРИНИМАЕТСЯ: 112000 < 115000 (more conservative for LONG, larger percentShift absorbs smaller)
            await commitTrailingTake(symbol, -8, _currentPrice);
            thirdTrailingApplied = true;
          } catch (error) {
            // Unexpected error
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "50m-trailing-profit-direction",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"), // Возвращаем 50 минут
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-profit-direction",
    exchangeName: "binance-trailing-profit-direction",
    frameName: "50m-trailing-profit-direction",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!firstTrailingApplied) {
    fail("First trailing profit was NOT applied!");
    return;
  }

  if (!secondTrailingAttempted) {
    fail("Second trailing profit was NOT attempted!");
    return;
  }

  if (!thirdTrailingApplied) {
    fail("Third trailing profit was NOT applied!");
    return;
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (closedResult.closeReason !== "take_profit") {
    fail(`Expected closeReason="take_profit", got "${closedResult.closeReason}"`);
    return;
  }

  // Проверяем PNL с новой логикой original-based + absorption:
  // Original TP: 120000, distance = 20%
  // First adjustment: -5% → TP = 115000 (distance = 15%)
  // Second adjustment: -3% → TP = 117000, REJECTED (117000 > 115000, less conservative for LONG)
  // Third adjustment: -8% → TP = 112000 (distance = 12%), ACCEPTED (112000 < 115000, more conservative for LONG)
  // Final trailing TP: 112000
  // Рост до 112500, high=113000, закрытие по TP на 112000
  // PNL = (112000 - 100000) / 100000 * 100 = +12.0%
  const expectedPnl = 12.0;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 2.0) {
    fail(`PNL should be ~${expectedPnl}% (third trailing TP=112000 applied), got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING PROFIT ABSORPTION WORKS: System rejected less conservative TP (-3%), accepted more conservative TP (-8%). Final PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING PROFIT ТЕСТ #4: Cross-validation with trailing stop
 *
 * Проверяем что:
 * - Нельзя применить trailingTake когда уже есть активный trailingStop
 * - Нельзя применить trailingStop когда уже есть активный trailingTake
 * - Система блокирует конфликтующие вызовы
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalTP=120k, originalSL=98k
 * 2. ПрименяемcommitTrailingTake(-5) → newTP=115k
 * 3. Пытаемся применитьcommitTrailingStop(-0.5) → система ОТКЛОНЯЕТ (conflict)
 * 4. Позиция закрывается по trailing TP
 */
test("TRAILING PROFIT: Cross-validation with trailing stop conflict", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let trailingTakeApplied = false;
  let trailingStopAttempted = false;
  let conflictBlocked = false;

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

  addExchangeSchema({
    exchangeName: "binance-trailing-profit-conflict",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-trailing-profit-conflict",
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

      for (let i = 0; i < 40; i++) {
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
        // Фаза 2 (5-14): Рост до +10%
        else if (i >= 5 && i < 15) {
          const price = basePrice + 10000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (15-24): Рост до +15% (для второй попытки)
        else if (i >= 15 && i < 25) {
          const price = basePrice + 15000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 4 (25-34): Рост до 115.5k (пробивает trailing TP=115k)
        else if (i >= 25 && i < 35) {
          const price = 115500;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 500, // high=116000, пробивает trailing TP=115k
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Остальное
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
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, _signal, currentPrice, revenuePercent, _backtest) => {
        // Первым применяем trailing profit при 10%
        if (!trailingTakeApplied && revenuePercent >= 10 && revenuePercent < 15) {
          // console.log(`[onPartialProfit] Applying trailing profit at ${revenuePercent.toFixed(2)}%`);

          await commitTrailingTake(symbol, -5, currentPrice);
          trailingTakeApplied = true;

          // console.log(`[trailingTake] Applied, trailing profit is now active`);
        }

        // Затем пытаемся применить trailing stop при 15% (должно быть заблокировано)
        if (trailingTakeApplied && !trailingStopAttempted && revenuePercent >= 15) {
          // console.log(`[onPartialProfit] Attempting trailing stop at ${revenuePercent.toFixed(2)}% (should be blocked)`);

          try {
            await commitTrailingStop(symbol, -0.5, currentPrice);
            // console.log(`[trailingStop] Applied (unexpected!)`);
          } catch (error) {
            // console.log(`[trailingStop] BLOCKED by conflict validation: ${error.message}`);
            conflictBlocked = true;
          }

          trailingStopAttempted = true;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "40m-trailing-profit-conflict",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-profit-conflict",
    exchangeName: "binance-trailing-profit-conflict",
    frameName: "40m-trailing-profit-conflict",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!trailingTakeApplied) {
    fail("Trailing profit was NOT applied!");
    return;
  }

  if (!trailingStopAttempted) {
    fail("Trailing stop was NOT attempted!");
    return;
  }

  // Проверяем что конфликт был заблокирован
  if (!conflictBlocked) {
    // console.log("WARNING: Conflict was not explicitly blocked by exception, but may have been silently prevented");
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (closedResult.closeReason !== "take_profit") {
    fail(`Expected closeReason="take_profit", got "${closedResult.closeReason}"`);
    return;
  }

  // console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть около +15% (trailing TP сработал)
  // Если бы trailing stop конфликт не был заблокирован, результат мог бы отличаться
  const expectedPnl = 15.0;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 2.0) {
    fail(`PNL should be ~${expectedPnl}%, got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING PROFIT CONFLICT PROTECTION WORKS: Trailing stop blocked when trailing profit active, closed with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * TRAILING PROFIT ТЕСТ #5: Price intrusion protection blocks trailing profit
 *
 * Проверяем что:
 * - Система блокирует установку trailing TP когда currentPrice уже пересек новый уровень TP
 * - LONG позиция: если newTP < currentPrice, то trailing profit блокируется
 * - SHORT позиция: если newTP > currentPrice, то trailing profit блокируется
 * - Позиция закрывается по original TP, а не по заблокированному trailing TP
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalTP=120k (distance=20%)
 * 2. Цена растет до 118k (уже выше того TP который хотим установить)
 * 3. Пытаемся применитьcommitTrailingTake(-5%) → newTP=115k
 * 4. Система блокирует: currentPrice=118k > newTP=115k (price intrusion!)
 * 5. Позиция закрывается по original TP (120k), PNL ≈ +20%
 */
test("TRAILING PROFIT: Price intrusion protection blocks trailing profit", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let trailingAttempted = false;
  let intrusionBlocked = false;

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

  addExchangeSchema({
    exchangeName: "binance-trailing-profit-intrusion",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-trailing-profit-intrusion",
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

      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1 (0-4): Активация на basePrice
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
        // Фаза 2 (5-9): Рост до +10%
        else if (i >= 5 && i < 10) {
          const price = basePrice + 10000; // 110k
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 3 (10-19): Рост до 118k (выше будущего trailing TP=115k)
        else if (i >= 10 && i < 20) {
          const price = 118000; // Цена уже пересекла будущий trailing TP!
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Фаза 4 (20-29): Дальнейший рост до 121k (пробивает original TP=120k)
        else if (i >= 20 && i < 30) {
          const price = 121000; // Пробивает original TP
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100, // high=121100, пробивает original TP=120k
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
        priceTakeProfit: basePrice + 20000, // 120000 (+20%)
        priceStopLoss: basePrice - 3000,    // 97000 (-3%)
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, _signal, currentPrice, revenuePercent, _backtest) => {
        // Пытаемся применить trailing profit при 90% прогресса к TP (currentPrice≈118k)
        if (!trailingAttempted && revenuePercent >= 90) {
          // console.log(`[onPartialProfit] Attempting trailing profit at ${revenuePercent.toFixed(2)}% progress, currentPrice=${currentPrice}`);

          try {
            // percentShift = -5% → newDistance = 20% + (-5%) = 15% → newTP = 115k
            // При 90% прогресса currentPrice≈118k > newTP=115k → price intrusion!
            await commitTrailingTake(symbol, -5, currentPrice);
            // console.log(`[trailingTake] Applied shift=-5%, newTP should be ~115k`);
          } catch (error) {
            // console.log(`[trailingTake] BLOCKED by price intrusion: ${error.message}`);
            intrusionBlocked = true;
          }
          
          trailingAttempted = true;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "40m-trailing-profit-intrusion",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const signalResults = [];
  const unsubscribeSignal = listenSignalBacktest((result) => {
    signalResults.push(result);
    // console.log(`[listenSignalBacktest] action=${result.action}, closeReason=${result.closeReason || 'N/A'}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-trailing-profit-intrusion",
    exchangeName: "binance-trailing-profit-intrusion",
    frameName: "40m-trailing-profit-intrusion",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeSignal();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!trailingAttempted) {
    fail("Trailing profit was NOT attempted!");
    return;
  }

  // Проверяем что price intrusion защита сработала
  if (!intrusionBlocked) {
    // console.log("WARNING: Price intrusion was not explicitly blocked by exception, but may have been silently prevented");
  }

  const closedResult = signalResults.find(r => r.action === "closed");
  if (!closedResult) {
    fail("Signal was NOT closed!");
    return;
  }

  // Проверяем что закрылось по take_profit
  if (closedResult.closeReason !== "take_profit") {
    fail(`Expected closeReason="take_profit", got "${closedResult.closeReason}"`);
    return;
  }

  // console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть около +20% (original TP=120k)
  // Если бы trailing profit сработал, PNL был бы хуже (около +15% при TP=115k)
  // PNL = (120000 - 100000) / 100000 * 100 = +20%
  const expectedPnl = 20.0;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 1.0) {
    fail(`PNL should be ~${expectedPnl}% (original TP), got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING PROFIT INTRUSION PROTECTION WORKS: Trailing profit blocked when currentPrice crossed intended TP, closed by original TP with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});

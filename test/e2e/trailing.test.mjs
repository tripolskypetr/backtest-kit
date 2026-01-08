import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenDoneBacktest,
  listenError,
  listenSignalBacktest,
  trailingStop,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

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
 * TRAILING STOP ТЕСТ #2: Trailing stop rejects worsening SL for LONG position
 *
 * Проверяем что:
 * - trailingStop с положительным shift (ухудшение SL) игнорируется системой
 * - Система разрешает ТОЛЬКО улучшение SL (защита от ошибок)
 * - Позиция закрывается по original SL, а не по попытке ухудшения
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=99k (distance=1%)
 * 2. Пытаемся вызвать trailingStop(+1) → система ОТКЛОНЯЕТ (newSL=98k хуже чем 99k)
 * 3. Цена падает до 98.5k
 * 4. Позиция закрывается по original SL (99k), а НЕ по попытке ухудшения (98k)
 */
test("TRAILING STOP: Rejects worsening SL for LONG position", async ({ pass, fail }) => {
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
    exchangeName: "binance-trailing-loosen",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-trailing-loosen",
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
        // Фаза 2 (5-9): Небольшой рост (+5%) для применения trailing
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
        // Фаза 3 (10-19): Падение до 98.7k (пробивает original SL=99k)
        else if (i >= 10 && i < 20) {
          const price = 98700; // Пробивает original SL (99k)
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,  // low=98600, пробивает SL=99000
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
      onOpen: async (symbol, signal, currentPrice, backtest) => {
        console.log(`[onOpen] Trying to worsen SL (should be rejected by system)`);

        // percentShift = +1% → newDistance = 1% + 1% = 2% → newSL = 98k
        // Система ОТКЛОНИТ это изменение, т.к. 98k < 99k (хуже для LONG)
        await trailingStop(symbol, +1);
        trailingApplied = true;

        console.log(`[trailingStop] Attempted shift=+1%, but system should reject worsening`);
      },
    },
  });

  addFrame({
    frameName: "50m-trailing-loosen",
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
    strategyName: "test-trailing-loosen",
    exchangeName: "binance-trailing-loosen",
    frameName: "50m-trailing-loosen",
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

  // Проверяем что закрылось по stop_loss (original SL, НЕ worsened SL)
  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }

  console.log(`[TEST] Signal closed by ${closedResult.closeReason}, PNL: ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);

  // Проверяем PNL: должен быть убыток ~-1% (закрылось по original SL=99k, а не по worsened SL=98k)
  // Если бы система приняла worsening, PNL был бы ~-2%
  const expectedPnl = -1.0;
  const pnlDiff = Math.abs(closedResult.pnl.pnlPercentage - expectedPnl);

  if (pnlDiff > 0.5) {
    fail(`PNL should be ~${expectedPnl}%, got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING STOP WORKS: System rejected worsening SL, closed by original SL with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
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

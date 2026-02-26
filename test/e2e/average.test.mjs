import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenDoneBacktest,
  listenError,
  commitAverageBuy,
  getAveragePrice,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * AVERAGE ТЕСТ #1: commitAverageBuy усредняет цену входа для LONG позиции
 *
 * Сценарий:
 * - Открываем LONG на 100000
 * - Цена падает до 98000 (просадка 2%)
 * - Вызываем commitAverageBuy → effectivePriceOpen = (100000 + 98000) / 2 = 99000
 * - Цена достигает TP (104000) → закрытие по TP
 */
test("AVERAGE BACKTEST: commitAverageBuy updates effectivePriceOpen for LONG", async ({ pass, fail }) => {
  const writeEvents = [];
  const openEvents = [];
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let averageExecuted = false;

  // Буферные свечи ВЫШЕ priceOpen чтобы scheduled не активировался раньше времени
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 500,
      high: basePrice + 600,
      low: basePrice + 400,
      close: basePrice + 500,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-average-1",
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
            open: basePrice + 500,
            high: basePrice + 600,
            low: basePrice + 400,
            close: basePrice + 500,
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
    strategyName: "test-average-1",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // НЕ очищаем allCandles — добавляем основные свечи поверх буферных

      // Свечи от startTime:
      // i=0..4:   Нейтральные — scheduled ждёт активации
      // i=5..9:   Активация: low <= priceOpen=100000
      // i=10..14: Просадка до 98000
      // i=15..19: TP = 104000
      for (let i = 0; i < 20; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Выше priceOpen — scheduled ещё не активируется
          allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
        } else if (i < 10) {
          // Активация LONG: low <= priceOpen
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          // Просадка до 98000
          const price = 98000;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else {
          // TP
          const tpPrice = 104000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 100000
        priceTakeProfit: basePrice + 4000, // 104000
        priceStopLoss: basePrice - 5000,   // 95000
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice, _backtest) => {
        console.log("[onSchedule]", { symbol, currentPrice, priceOpen: data.priceOpen });
      },
      onOpen: (symbol, data, currentPrice, _backtest) => {
        console.log("[onOpen]", { symbol, currentPrice, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen });
        openEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
      },
      onActivePing: async (symbol, data, when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[onActivePing]", { symbol, currentPrice, effectivePriceOpen: data.priceOpen, totalEntries: data.totalEntries, averageExecuted });
        // Усредняем один раз когда цена на просадке ~98000
        if (!averageExecuted && currentPrice <= 98500) {
          averageExecuted = true;
          const result = await commitAverageBuy(symbol);
          writeEvents.push({ result, totalEntries: data.totalEntries });
          console.log("[commitAverageBuy result]", result);
        }
      },
      onClose: (symbol, data, currentPrice, _backtest) => {
        console.log("[onClose]", { symbol, currentPrice, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
      },
      onCancel: (symbol, data, currentPrice, _backtest) => {
        console.log("[onCancel]", { symbol, currentPrice, priceOpen: data.priceOpen });
      },
    },
  });

  addFrameSchema({
    frameName: "20m-average-1",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-average-1",
    exchangeName: "binance-average-1",
    frameName: "20m-average-1",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (openEvents.length === 0) {
    fail("Expected onOpen to be called at least once");
    return;
  }

  const openEvent = openEvents[0];
  if (openEvent.originalPriceOpen !== basePrice) {
    fail(`Expected originalPriceOpen=${basePrice}, got ${openEvent.originalPriceOpen}`);
    return;
  }

  if (!averageExecuted) {
    fail("commitAverageBuy was never executed");
    return;
  }

  if (closeEvents.length > 0) {
    const closeEvent = closeEvents[0];
    if (closeEvent.totalEntries < 2) {
      fail(`Expected totalEntries >= 2 after averaging, got ${closeEvent.totalEntries}`);
      return;
    }
    if (closeEvent.priceOpen >= closeEvent.originalPriceOpen) {
      fail(`Expected effectivePriceOpen (${closeEvent.priceOpen}) < originalPriceOpen (${closeEvent.originalPriceOpen}) after averaging down`);
      return;
    }
  }

  pass(`AVERAGE LONG: averageExecuted=${averageExecuted}, writeEvents=${writeEvents.length}, closeEvents=${closeEvents.length}, totalEntries=${closeEvents[0]?.totalEntries ?? "N/A"}, effectivePriceOpen=${closeEvents[0]?.priceOpen ?? "N/A"}`);
});


/**
 * AVERAGE ТЕСТ #2: commitAverageBuy отклоняется если цена >= последней точки входа (LONG)
 *
 * Сценарий:
 * - Открываем LONG на 100000
 * - Цена РАСТЁТ до 102000 (выше точки входа)
 * - Вызываем commitAverageBuy → должен вернуть false
 */
test("AVERAGE BACKTEST: commitAverageBuy rejected when price above last entry (LONG)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let averageAttempted = false;
  let averageResult = null;

  // Буферные свечи выше priceOpen
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 500,
      high: basePrice + 600,
      low: basePrice + 400,
      close: basePrice + 500,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-average-2",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-average-2",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Нейтральные выше priceOpen
      // i=5..9:   Активация LONG
      // i=10..14: Рост выше priceOpen — усреднение должно быть отклонено
      // i=15..19: TP
      for (let i = 0; i < 20; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const rise = (i - 9) * 200;
          const price = basePrice + rise;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else {
          const tpPrice = basePrice + 4000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 4000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        // Пытаемся усредниться когда цена уже выросла выше entry
        if (!averageAttempted && currentPrice > basePrice + 1000) {
          averageAttempted = true;
          averageResult = await commitAverageBuy(symbol);
          console.log("[commitAverageBuy rejection test] result=", averageResult, "currentPrice=", currentPrice);
        }
      },
    },
  });

  addFrameSchema({
    frameName: "20m-average-2",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-average-2",
    exchangeName: "binance-average-2",
    frameName: "20m-average-2",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!averageAttempted) {
    fail("commitAverageBuy was never attempted");
    return;
  }

  if (averageResult !== false) {
    fail(`Expected commitAverageBuy to return false when price is above last entry (LONG), got ${averageResult}`);
    return;
  }

  pass(`AVERAGE LONG rejection WORKS: commitAverageBuy correctly returned false when price above last entry`);
});


/**
 * AVERAGE ТЕСТ #3: двойное усреднение для LONG (DCA x2)
 *
 * Сценарий:
 * - Открываем LONG на 100000
 * - Цена падает до 98000 → первое усреднение: effectivePriceOpen = 99000
 * - Цена падает до 96000 → второе усреднение: effectivePriceOpen = (100000+98000+96000)/3 = 98000
 * - totalEntries = 3, закрытие по TP (104000)
 */
test("AVERAGE BACKTEST: double DCA (2x commitAverageBuy) for LONG", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let averageCount = 0;

  // Буферные свечи выше priceOpen
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 500,
      high: basePrice + 600,
      low: basePrice + 400,
      close: basePrice + 500,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-average-3",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-average-3",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Нейтральные выше priceOpen
      // i=5..9:   Активация LONG
      // i=10..14: Просадка до 98000 — первое усреднение
      // i=15..19: Просадка до 96000 — второе усреднение
      // i=20..24: TP = 104000
      for (let i = 0; i < 25; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const price = 98000;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else if (i < 20) {
          const price = 96000;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else {
          const tpPrice = 104000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 4000,
        priceStopLoss: basePrice - 6000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[onActivePing-3]", { currentPrice, averageCount });
        // Первое усреднение при ~98000
        if (averageCount === 0 && currentPrice <= 98500 && currentPrice > 97000) {
          averageCount++;
          const r = await commitAverageBuy(symbol);
          console.log("[DCA#1]", r, "currentPrice=", currentPrice);
        }
        // Второе усреднение при ~96000
        if (averageCount === 1 && currentPrice <= 96500) {
          averageCount++;
          const r = await commitAverageBuy(symbol);
          console.log("[DCA#2]", r, "currentPrice=", currentPrice);
        }
      },
      onClose: (symbol, data, currentPrice, _backtest) => {
        console.log("[onClose-3]", { currentPrice, priceOpen: data.priceOpen, totalEntries: data.totalEntries });
        closeEvents.push({
          priceOpen: data.priceOpen,
          originalPriceOpen: data.originalPriceOpen,
          totalEntries: data.totalEntries,
        });
      },
    },
  });

  addFrameSchema({
    frameName: "25m-average-3",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:25:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-average-3",
    exchangeName: "binance-average-3",
    frameName: "25m-average-3",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (averageCount < 2) {
    fail(`Expected 2 averaging executions, got ${averageCount}`);
    return;
  }

  if (closeEvents.length === 0) {
    fail("Expected onClose to be called");
    return;
  }

  const closeEvent = closeEvents[0];

  if (closeEvent.totalEntries !== 3) {
    fail(`Expected totalEntries=3 after 2x DCA, got ${closeEvent.totalEntries}`);
    return;
  }

  if (closeEvent.originalPriceOpen !== basePrice) {
    fail(`Expected originalPriceOpen=${basePrice}, got ${closeEvent.originalPriceOpen}`);
    return;
  }

  // effectivePriceOpen = mean(_entry prices). getAveragePrice возвращает VWAP по свечам,
  // поэтому точное значение зависит от того, по какой цене сработало усреднение.
  // Проверяем что effectivePriceOpen ниже basePrice (100000) и выше последней просадки (96000)
  if (closeEvent.priceOpen >= basePrice) {
    fail(`Expected effectivePriceOpen < basePrice (${basePrice}), got ${closeEvent.priceOpen}`);
    return;
  }
  if (closeEvent.priceOpen <= 96000) {
    fail(`Expected effectivePriceOpen > 96000, got ${closeEvent.priceOpen}`);
    return;
  }

  pass(`DOUBLE DCA WORKS: totalEntries=${closeEvent.totalEntries}, effectivePriceOpen=${closeEvent.priceOpen.toFixed(2)}, originalPriceOpen=${closeEvent.originalPriceOpen}`);
});


/**
 * AVERAGE ТЕСТ #4: commitAverageBuy для SHORT позиции (усреднение вверх)
 *
 * Сценарий:
 * - Открываем SHORT на 100000
 * - Цена РАСТЁТ до 102000 (просадка для SHORT)
 * - commitAverageBuy → effectivePriceOpen = (100000 + 102000) / 2 = 101000
 * - Цена падает до 96000 (TP для SHORT) → закрытие
 */
test("AVERAGE BACKTEST: commitAverageBuy for SHORT position (averaging up)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let averageExecuted = false;

  // Буферные свечи НИЖЕ priceOpen (SHORT активируется когда high >= priceOpen)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice - 500,
      high: basePrice - 400,
      low: basePrice - 600,
      close: basePrice - 500,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-average-4",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-average-4",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Нейтральные ниже priceOpen (SHORT не активируется)
      // i=5..9:   Активация SHORT: high >= priceOpen=100000
      // i=10..14: Рост до 102000 (просадка для SHORT)
      // i=15..19: TP = 96000
      for (let i = 0; i < 20; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
        } else if (i < 10) {
          // Активация SHORT: high >= priceOpen
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const price = 102000;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else {
          const tpPrice = 96000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,              // 100000
        priceTakeProfit: basePrice - 4000, // 96000
        priceStopLoss: basePrice + 5000,   // 105000
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice, _backtest) => {
        console.log("[onSchedule-4]", { symbol, currentPrice, priceOpen: data.priceOpen });
      },
      onOpen: (symbol, data, currentPrice, _backtest) => {
        console.log("[onOpen-4]", { symbol, currentPrice, priceOpen: data.priceOpen });
      },
      onActivePing: async (symbol, data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[onActivePing-4]", { currentPrice, effectivePriceOpen: data.priceOpen, averageExecuted });
        // Усредняем SHORT на росте (currentPrice > last entry price)
        if (!averageExecuted && currentPrice >= 102000) {
          averageExecuted = true;
          const r = await commitAverageBuy(symbol);
          console.log("[SHORT DCA]", r, "currentPrice=", currentPrice);
        }
      },
      onClose: (symbol, data, currentPrice, _backtest) => {
        console.log("[onClose-4]", { currentPrice, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
        closeEvents.push({
          priceOpen: data.priceOpen,
          originalPriceOpen: data.originalPriceOpen,
          totalEntries: data.totalEntries,
        });
      },
      onCancel: (symbol, data, currentPrice, _backtest) => {
        console.log("[onCancel-4]", { symbol, currentPrice, priceOpen: data.priceOpen });
      },
    },
  });

  addFrameSchema({
    frameName: "20m-average-4",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-average-4",
    exchangeName: "binance-average-4",
    frameName: "20m-average-4",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!averageExecuted) {
    fail("commitAverageBuy was never executed for SHORT");
    return;
  }

  if (closeEvents.length === 0) {
    fail("Expected onClose to be called");
    return;
  }

  const closeEvent = closeEvents[0];

  if (closeEvent.totalEntries < 2) {
    fail(`Expected totalEntries >= 2 after averaging, got ${closeEvent.totalEntries}`);
    return;
  }

  if (closeEvent.originalPriceOpen !== basePrice) {
    fail(`Expected originalPriceOpen=${basePrice}, got ${closeEvent.originalPriceOpen}`);
    return;
  }

  if (closeEvent.priceOpen <= closeEvent.originalPriceOpen) {
    fail(`Expected effectivePriceOpen (${closeEvent.priceOpen}) > originalPriceOpen (${closeEvent.originalPriceOpen}) for SHORT averaging up`);
    return;
  }

  pass(`AVERAGE SHORT WORKS: totalEntries=${closeEvent.totalEntries}, effectivePriceOpen=${closeEvent.priceOpen.toFixed(2)}, originalPriceOpen=${closeEvent.originalPriceOpen}`);
});

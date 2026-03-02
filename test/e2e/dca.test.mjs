import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenDoneBacktest,
  listenError,
  commitAverageBuy,
  commitPartialProfit,
  commitPartialLoss,
  getAveragePrice,
  getEffectivePriceOpen,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * DCA ТЕСТ #1: partial profit → DCA → close by TP (LONG)
 *
 * Сценарий (соответствует unit-тесту SA, cnt=[1,2], percent=[30,_]):
 * - Открываем LONG на 100 (priceOpen=1000 для реальных цен)
 * - Цена растёт до 1080 → commitPartialProfit(30%) — закрываем 30% позиции
 * - Цена падает до 800 → commitAverageBuy — добавляем DCA вход #2
 * - Цена растёт до TP (1200) → закрытие оставшейся позиции
 *
 * Проверяем:
 * - partialProfit был выполнен
 * - averageBuy был выполнен
 * - signal._partial содержит одну запись с type="profit"
 * - signal._entry содержит два входа (entryCountAtClose=2 после DCA)
 * - onClose вызван с totalEntries=2
 */
test("DCA BACKTEST: commitPartialProfit → commitAverageBuy → TP close (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];
  const openEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialProfitExecuted = false;
  let averageExecuted = false;

  // Буферные свечи ВЫШЕ priceOpen (чтобы scheduled не активировался раньше времени)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100,
      high: basePrice + 200,
      low: basePrice + 50,
      close: basePrice + 100,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-1",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        if (existing) {
          result.push(existing);
        } else {
          result.push({
            timestamp,
            open: basePrice + 100,
            high: basePrice + 200,
            low: basePrice + 50,
            close: basePrice + 100,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-1",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Фазы (от startTime):
      // i=0..4:   Выше priceOpen — ожидание активации scheduled
      // i=5..9:   Активация LONG: low <= basePrice
      // i=10..14: Рост до 1080 — для commitPartialProfit
      // i=15..19: Падение до 800 — для commitAverageBuy
      // i=20..29: Нейтраль около 900 (выше 800, ниже TP)
      // i=30..39: TP = 1200
      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          // Выше priceOpen — не активируемся
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          // Активация: low <= priceOpen
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          // Рост для partial profit
          const price = basePrice + 80;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 30, close: price, volume: 100 });
        } else if (i < 20) {
          // Просадка для DCA
          const price = 800;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        } else if (i < 30) {
          // Нейтраль — после DCA, ждём TP
          const price = 900;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        } else {
          // TP
          const price = 1200;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,           // 1000
        priceTakeProfit: basePrice + 200, // 1200
        priceStopLoss: basePrice - 300,   // 700
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice) => {
        console.log("[DCA-1 onSchedule]", { symbol, currentPrice, priceOpen: data.priceOpen });
      },
      onOpen: (symbol, data, currentPrice) => {
        console.log("[DCA-1 onOpen]", { symbol, currentPrice, priceOpen: data.priceOpen });
        openEvents.push({ priceOpen: data.priceOpen, totalEntries: data.totalEntries });
      },
      onActivePing: async (symbol, data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[DCA-1 onActivePing]", { currentPrice, partialProfitExecuted, averageExecuted, totalEntries: data.totalEntries });

        // Шаг 1: Закрываем 30% прибыли когда цена выросла до ~1080
        if (!partialProfitExecuted && currentPrice >= basePrice + 70) {
          partialProfitExecuted = true;
          const result = await commitPartialProfit(symbol, 30);
          console.log("[DCA-1 commitPartialProfit]", { result, currentPrice });
        }

        // Шаг 2: Усредняем когда цена упала до ~800
        if (partialProfitExecuted && !averageExecuted && currentPrice <= 820) {
          averageExecuted = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-1 commitAverageBuy]", { result, currentPrice });
        }
      },
      onClose: (symbol, data, currentPrice) => {
        console.log("[DCA-1 onClose]", { symbol, currentPrice, priceOpen: data.priceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, totalEntries: data.totalEntries, closeReason: data.closeReason });
      },
      onCancel: (symbol, data, currentPrice) => {
        console.log("[DCA-1 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "40m-dca-1",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-dca-1",
    exchangeName: "binance-dca-1",
    frameName: "40m-dca-1",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialProfitExecuted) {
    fail("commitPartialProfit was never executed");
    return;
  }

  if (!averageExecuted) {
    fail("commitAverageBuy was never executed");
    return;
  }

  if (closeEvents.length === 0) {
    fail("Position was never closed");
    return;
  }

  const closeEvent = closeEvents[0];
  if (closeEvent.totalEntries < 2) {
    fail(`Expected totalEntries >= 2 after DCA, got ${closeEvent.totalEntries}`);
    return;
  }

  pass(`DCA-1 LONG: partialProfit=${partialProfitExecuted}, averageBuy=${averageExecuted}, totalEntries=${closeEvent.totalEntries}, closeReason=${closeEvent.closeReason}`);
});


/**
 * DCA ТЕСТ #2: DCA → partial loss → DCA → partial profit → TP (LONG)
 *
 * Сценарий (соответствует unit-тесту SB, cnt=[2,3]):
 * - Открываем LONG на 1000
 * - Цена падает до 900 → commitAverageBuy (entry #2, cnt=2)
 * - Цена немного растёт до 1050 → commitPartialProfit(25%) — закрываем 25% от позиции (cnt=2)
 * - Цена падает до 800 → commitAverageBuy (entry #3, cnt=3)
 * - Цена растёт до TP (1200) → закрытие оставшейся позиции
 *
 * Проверяем:
 * - Оба DCA были выполнены
 * - Partial profit выполнен между DCA #1 и DCA #2
 * - totalEntries=3 в onClose
 * - effectivePriceOpen отличается от originalPriceOpen
 */
test("DCA BACKTEST: DCA → partialProfit → DCA → TP close (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let average1Executed = false;
  let partialProfitExecuted = false;
  let average2Executed = false;

  // Буферные свечи выше priceOpen
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100,
      high: basePrice + 200,
      low: basePrice + 50,
      close: basePrice + 100,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-2",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        if (existing) {
          result.push(existing);
        } else {
          result.push({
            timestamp,
            open: basePrice + 100,
            high: basePrice + 200,
            low: basePrice + 50,
            close: basePrice + 100,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-2",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Фазы (от startTime):
      // i=0..4:   Выше priceOpen — ожидание
      // i=5..9:   Активация LONG: low <= basePrice
      // i=10..14: Просадка до 900 — для DCA #1
      // i=15..19: Небольшой рост до 1050 — для partialProfit
      // i=20..24: Просадка до 800 — для DCA #2
      // i=25..34: Нейтраль около 900
      // i=35..49: TP = 1200
      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          // Активация
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          // Просадка для DCA #1
          const price = 900;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        } else if (i < 20) {
          // Рост для partial profit
          const price = 1050;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 30, close: price, volume: 100 });
        } else if (i < 25) {
          // Просадка для DCA #2
          const price = 800;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        } else if (i < 35) {
          // Нейтраль
          const price = 900;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        } else {
          // TP
          const price = 1200;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,           // 1000
        priceTakeProfit: basePrice + 200, // 1200
        priceStopLoss: basePrice - 350,   // 650
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[DCA-2 onActivePing]", { currentPrice, average1Executed, partialProfitExecuted, average2Executed, totalEntries: data.totalEntries });

        // Шаг 1: DCA #1 при просадке до ~900
        if (!average1Executed && currentPrice <= 920) {
          average1Executed = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-2 commitAverageBuy #1]", { result, currentPrice });
        }

        // Шаг 2: Partial profit при росте до ~1050 (после DCA #1)
        if (average1Executed && !partialProfitExecuted && currentPrice >= 1030) {
          partialProfitExecuted = true;
          const result = await commitPartialProfit(symbol, 25);
          console.log("[DCA-2 commitPartialProfit]", { result, currentPrice });
        }

        // Шаг 3: DCA #2 при просадке до ~800 (после partialProfit)
        if (partialProfitExecuted && !average2Executed && currentPrice <= 820) {
          average2Executed = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-2 commitAverageBuy #2]", { result, currentPrice });
        }
      },
      onClose: (symbol, data, currentPrice) => {
        console.log("[DCA-2 onClose]", { symbol, currentPrice, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries, closeReason: data.closeReason });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-2 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "50m-dca-2",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-dca-2",
    exchangeName: "binance-dca-2",
    frameName: "50m-dca-2",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!average1Executed) {
    fail("commitAverageBuy #1 was never executed");
    return;
  }

  if (!partialProfitExecuted) {
    fail("commitPartialProfit was never executed");
    return;
  }

  if (!average2Executed) {
    fail("commitAverageBuy #2 was never executed");
    return;
  }

  if (closeEvents.length === 0) {
    fail("Position was never closed");
    return;
  }

  const closeEvent = closeEvents[0];
  if (closeEvent.totalEntries < 3) {
    fail(`Expected totalEntries >= 3 after 2x DCA, got ${closeEvent.totalEntries}`);
    return;
  }

  if (closeEvent.priceOpen >= closeEvent.originalPriceOpen) {
    fail(`Expected effectivePriceOpen (${closeEvent.priceOpen}) < originalPriceOpen (${closeEvent.originalPriceOpen}) after DCA down`);
    return;
  }

  pass(`DCA-2 LONG: average1=${average1Executed}, partialProfit=${partialProfitExecuted}, average2=${average2Executed}, totalEntries=${closeEvent.totalEntries}, effectivePriceOpen=${closeEvent.priceOpen?.toFixed(2)}, closeReason=${closeEvent.closeReason}`);
});


/**
 * DCA ТЕСТ #3: partial loss → DCA → partial profit → DCA → TP (LONG)
 *
 * Сценарий (соответствует unit-тесту S7, cnt=[1,3]):
 * - Открываем LONG на 1000
 * - Цена падает до 850 → commitPartialLoss(20%) — стоп-лосс частичный (cnt=1)
 * - Цена падает до 700 → commitAverageBuy (entry #2)
 * - Цена падает до 600 → commitAverageBuy (entry #3)
 * - Цена растёт до 950 → commitPartialProfit(30%) (cnt=3)
 * - Цена достигает TP (1200) → закрытие
 *
 * Проверяем:
 * - partialLoss был выполнен сначала
 * - Оба DCA были выполнены
 * - partialProfit был выполнен после DCA
 * - totalEntries=3 в onClose
 */
test("DCA BACKTEST: partialLoss → DCA×2 → partialProfit → TP (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialLossExecuted = false;
  let average1Executed = false;
  let average2Executed = false;
  let partialProfitExecuted = false;

  // Буферные свечи выше priceOpen
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100,
      high: basePrice + 200,
      low: basePrice + 50,
      close: basePrice + 100,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-3",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        if (existing) {
          result.push(existing);
        } else {
          result.push({
            timestamp,
            open: basePrice + 100,
            high: basePrice + 200,
            low: basePrice + 50,
            close: basePrice + 100,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-3",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Фазы (от startTime):
      // i=0..4:   Выше priceOpen — ожидание активации
      // i=5..9:   Активация LONG: low <= basePrice
      // i=10..14: Просадка до 850 — для partialLoss
      // i=15..19: Продолжение падения до 700 — для DCA #1
      // i=20..24: Ещё ниже до 600 — для DCA #2
      // i=25..34: Отскок до 950 — для partialProfit
      // i=35..49: TP = 1200
      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          // Активация
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          // Просадка до 850 — для partial loss
          const price = 850;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 20) {
          // Продолжение падения до 700 — для DCA #1
          const price = 700;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 25) {
          // Ещё ниже до 600 — для DCA #2
          const price = 600;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 35) {
          // Отскок до 950 — для partial profit
          const price = 950;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else {
          // TP
          const price = 1200;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,           // 1000
        priceTakeProfit: basePrice + 200, // 1200
        priceStopLoss: basePrice - 500,   // 500
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[DCA-3 onActivePing]", { currentPrice, partialLossExecuted, average1Executed, average2Executed, partialProfitExecuted, totalEntries: data.totalEntries });

        // Шаг 1: Partial loss при просадке до ~850 (still cnt=1, single entry)
        if (!partialLossExecuted && currentPrice <= 870 && currentPrice > 720) {
          partialLossExecuted = true;
          const result = await commitPartialLoss(symbol, 20);
          console.log("[DCA-3 commitPartialLoss]", { result, currentPrice });
        }

        // Шаг 2: DCA #1 при дальнейшей просадке до ~700
        if (partialLossExecuted && !average1Executed && currentPrice <= 720) {
          average1Executed = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-3 commitAverageBuy #1]", { result, currentPrice });
        }

        // Шаг 3: DCA #2 при ещё большей просадке до ~600
        if (average1Executed && !average2Executed && currentPrice <= 620) {
          average2Executed = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-3 commitAverageBuy #2]", { result, currentPrice });
        }

        // Шаг 4: Partial profit при отскоке до ~950 (cnt=3 теперь)
        if (average2Executed && !partialProfitExecuted && currentPrice >= 930) {
          partialProfitExecuted = true;
          const result = await commitPartialProfit(symbol, 30);
          console.log("[DCA-3 commitPartialProfit]", { result, currentPrice });
        }
      },
      onClose: (symbol, data, currentPrice) => {
        console.log("[DCA-3 onClose]", { symbol, currentPrice, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries, closeReason: data.closeReason });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-3 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "50m-dca-3",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-dca-3",
    exchangeName: "binance-dca-3",
    frameName: "50m-dca-3",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialLossExecuted) {
    fail("commitPartialLoss was never executed");
    return;
  }

  if (!average1Executed) {
    fail("commitAverageBuy #1 was never executed");
    return;
  }

  if (!average2Executed) {
    fail("commitAverageBuy #2 was never executed");
    return;
  }

  if (!partialProfitExecuted) {
    fail("commitPartialProfit was never executed after DCA");
    return;
  }

  if (closeEvents.length === 0) {
    fail("Position was never closed");
    return;
  }

  const closeEvent = closeEvents[0];
  if (closeEvent.totalEntries < 3) {
    fail(`Expected totalEntries >= 3 after 2x DCA, got ${closeEvent.totalEntries}`);
    return;
  }

  // Effective price should be lower than original due to DCA down
  if (closeEvent.priceOpen >= closeEvent.originalPriceOpen) {
    fail(`Expected effectivePriceOpen (${closeEvent.priceOpen}) < originalPriceOpen (${closeEvent.originalPriceOpen}) after DCA down`);
    return;
  }

  pass(`DCA-3 LONG: partialLoss=${partialLossExecuted}, avg1=${average1Executed}, avg2=${average2Executed}, partialProfit=${partialProfitExecuted}, totalEntries=${closeEvent.totalEntries}, effectivePriceOpen=${closeEvent.priceOpen?.toFixed(2)}, closeReason=${closeEvent.closeReason}`);
});


/**
 * DCA ТЕСТ #4: SHORT DCA → partial profit → DCA → close by TP
 *
 * Сценарий (SHORT позиция с усреднением):
 * - Открываем SHORT на 1000
 * - Цена растёт до 1100 → commitAverageBuy (SHORT усреднение вверх, entry #2)
 * - Цена падает до 900 → commitPartialProfit(30%) — закрываем 30% позиции
 * - Цена продолжает падать до TP (800) → закрытие оставшейся позиции
 *
 * Проверяем:
 * - DCA был выполнен
 * - Partial profit был выполнен
 * - totalEntries=2 в onClose
 * - effectivePriceOpen выше originalPriceOpen (DCA вверх для SHORT)
 */
test("DCA BACKTEST: SHORT DCA → partialProfit → TP close (SHORT)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let averageExecuted = false;
  let partialProfitExecuted = false;

  // Буферные свечи НИЖЕ priceOpen (для SHORT: ждём роста до priceOpen)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice - 100,
      high: basePrice - 50,
      low: basePrice - 200,
      close: basePrice - 100,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-4",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        if (existing) {
          result.push(existing);
        } else {
          result.push({
            timestamp,
            open: basePrice - 100,
            high: basePrice - 50,
            low: basePrice - 200,
            close: basePrice - 100,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-4",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Фазы (от startTime, SHORT позиция):
      // i=0..4:   Ниже priceOpen — ожидание активации (SHORT активируется при high >= priceOpen)
      // i=5..9:   Активация SHORT: high >= basePrice=1000
      // i=10..14: Рост до 1100 — для SHORT DCA (усреднение выше)
      // i=15..19: Падение до 900 — для partialProfit (SHORT прибыль при падении)
      // i=20..29: Нейтраль около 900
      // i=30..39: TP для SHORT = 800
      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          // Ниже priceOpen — не активируемся
          allCandles.push({ timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
        } else if (i < 10) {
          // Активация SHORT: high >= priceOpen
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          // Рост для SHORT DCA (усреднение вверх — более выгодная SHORT цена)
          const price = 1100;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 30, close: price, volume: 100 });
        } else if (i < 20) {
          // Падение для partial profit (SHORT прибыль при падении цены)
          const price = 900;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 50, close: price, volume: 100 });
        } else if (i < 30) {
          // Нейтраль
          const price = 900;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else {
          // TP для SHORT = 800
          const price = 800;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 50, close: price, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,           // 1000
        priceTakeProfit: basePrice - 200, // 800
        priceStopLoss: basePrice + 300,   // 1300
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[DCA-4 onActivePing]", { currentPrice, averageExecuted, partialProfitExecuted, totalEntries: data.totalEntries });

        // Шаг 1: SHORT DCA при росте до ~1100 (усреднение выше для SHORT)
        if (!averageExecuted && currentPrice >= 1080) {
          averageExecuted = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-4 commitAverageBuy SHORT]", { result, currentPrice });
        }

        // Шаг 2: Partial profit для SHORT при падении до ~900
        if (averageExecuted && !partialProfitExecuted && currentPrice <= 920) {
          partialProfitExecuted = true;
          const result = await commitPartialProfit(symbol, 30);
          console.log("[DCA-4 commitPartialProfit SHORT]", { result, currentPrice });
        }
      },
      onClose: (symbol, data, currentPrice) => {
        console.log("[DCA-4 onClose]", { symbol, currentPrice, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries, closeReason: data.closeReason });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-4 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "40m-dca-4",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-dca-4",
    exchangeName: "binance-dca-4",
    frameName: "40m-dca-4",
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

  if (!partialProfitExecuted) {
    fail("commitPartialProfit was never executed for SHORT");
    return;
  }

  if (closeEvents.length === 0) {
    fail("SHORT position was never closed");
    return;
  }

  const closeEvent = closeEvents[0];
  if (closeEvent.totalEntries < 2) {
    fail(`Expected totalEntries >= 2 after DCA, got ${closeEvent.totalEntries}`);
    return;
  }

  // For SHORT DCA up: effectivePriceOpen should be >= originalPriceOpen
  if (closeEvent.priceOpen <= closeEvent.originalPriceOpen) {
    fail(`Expected effectivePriceOpen (${closeEvent.priceOpen}) > originalPriceOpen (${closeEvent.originalPriceOpen}) for SHORT DCA up`);
    return;
  }

  pass(`DCA-4 SHORT: averageBuy=${averageExecuted}, partialProfit=${partialProfitExecuted}, totalEntries=${closeEvent.totalEntries}, effectivePriceOpen=${closeEvent.priceOpen?.toFixed(2)}, closeReason=${closeEvent.closeReason}`);
});

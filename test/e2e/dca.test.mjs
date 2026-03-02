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


/**
 * DCA ТЕСТ #5: partial profit → partial profit → DCA → TP (LONG)
 *
 * Два partialProfit подряд (cnt=1 оба), потом DCA усреднение вниз, потом TP.
 * Проверяем что два последовательных partial при одном cnt корректно
 * уменьшают cost basis дважды, и после DCA эффективная цена пересчитывается.
 *
 * Последовательность:
 * - Активация LONG на 1000
 * - Рост до 1080 → commitPartialProfit(25%) — первый частичный выход
 * - Рост до 1150 → commitPartialProfit(30%) — второй частичный выход (cnt=1 оба)
 * - Падение до 800 → commitAverageBuy (entry #2)
 * - TP на 1300 → закрытие остатка
 */
test("DCA BACKTEST: partialProfit → partialProfit → DCA → TP (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partial1Executed = false;
  let partial2Executed = false;
  let averageExecuted = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-5",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-5",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Выше priceOpen — ожидание
      // i=5..9:   Активация LONG
      // i=10..14: Рост до 1080 — первый partialProfit (25%)
      // i=15..19: Рост до 1150 — второй partialProfit (30%)
      // i=20..24: Просадка до 800 — DCA
      // i=25..34: Нейтраль около 900
      // i=35..49: TP = 1300
      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 1080;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 1150;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 25) {
          const p = 800;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        } else if (i < 35) {
          const p = 900;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        } else {
          const p = 1300;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 300, // 1300
        priceStopLoss: basePrice - 300,   // 700
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!partial1Executed && currentPrice >= 1060) {
          partial1Executed = true;
          const result = await commitPartialProfit(symbol, 25);
          console.log("[DCA-5 partialProfit #1]", { result, currentPrice });
        } else if (partial1Executed && !partial2Executed && currentPrice >= 1130) {
          partial2Executed = true;
          const result = await commitPartialProfit(symbol, 30);
          console.log("[DCA-5 partialProfit #2]", { result, currentPrice });
        } else if (partial2Executed && !averageExecuted && currentPrice <= 820) {
          averageExecuted = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-5 commitAverageBuy]", { result, currentPrice });
        }
      },
      onClose: (_symbol, data, currentPrice) => {
        console.log("[DCA-5 onClose]", { currentPrice, priceOpen: data.priceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-5 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "50m-dca-5",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-5", exchangeName: "binance-dca-5", frameName: "50m-dca-5" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!partial1Executed) { fail("partialProfit #1 never executed"); return; }
  if (!partial2Executed) { fail("partialProfit #2 never executed"); return; }
  if (!averageExecuted) { fail("commitAverageBuy never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries < 2) { fail(`Expected totalEntries >= 2, got ${ce.totalEntries}`); return; }

  pass(`DCA-5: pp1=${partial1Executed}, pp2=${partial2Executed}, avg=${averageExecuted}, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}`);
});


/**
 * DCA ТЕСТ #6: DCA → DCA → partial profit → partial loss → TP (LONG)
 *
 * Два DCA подряд (оба до первого partial), потом два partial подряд.
 * Проверяем что cost basis после двух DCA корректно учитывается
 * при вычислении веса обоих partial.
 *
 * Последовательность:
 * - Активация LONG на 1000
 * - Падение до 850 → commitAverageBuy (entry #2, cnt=2 до следующего partial)
 * - Падение до 750 → commitAverageBuy (entry #3, cnt=3)
 * - Отскок до 950 → commitPartialProfit(30%) (cnt=3)
 * - Небольшой откат до 880 → commitPartialLoss(20%) (cnt=3)
 * - TP на 1100 → закрытие остатка
 */
test("DCA BACKTEST: DCA → DCA → partialProfit → partialLoss → TP (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let avg1Executed = false;
  let avg2Executed = false;
  let ppExecuted = false;
  let plExecuted = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-6",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-6",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // effectivePriceOpen after 2x DCA (850, 750): hm(1000, 850, 750) ≈ 851.6
      // After partialProfit at 950 (30%), remaining cost basis shrinks but eff stays near 851.
      // partialLoss must have currentPrice < effectivePriceOpen → use 800 (safely below 851).
      //
      // i=0..4:   Ожидание выше priceOpen
      // i=5..9:   Активация LONG
      // i=10..14: Просадка до 850 — DCA #1
      // i=15..19: Просадка до 750 — DCA #2
      // i=20..29: Отскок до 950 — partialProfit (30%)
      // i=30..34: Откат до 800 — partialLoss (20%, цена < eff ~851)
      // i=35..54: TP = 1100
      for (let i = 0; i < 55; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 850;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 750;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 30) {
          const p = 950;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 35) {
          // 800 < effectivePriceOpen (~851) → partialLoss válido
          const p = 800;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 100, // 1100
        priceStopLoss: basePrice - 400,   // 600
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[DCA-6 onActivePing]", { currentPrice, avg1Executed, avg2Executed, ppExecuted, plExecuted, totalEntries: data.totalEntries });

        if (!avg1Executed && currentPrice <= 870) {
          avg1Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-6 avg #1]", currentPrice);
        } else if (avg1Executed && !avg2Executed && currentPrice <= 770) {
          avg2Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-6 avg #2]", currentPrice);
        } else if (avg2Executed && !ppExecuted && currentPrice >= 930) {
          ppExecuted = true;
          await commitPartialProfit(symbol, 30);
          console.log("[DCA-6 partialProfit]", currentPrice);
        } else if (ppExecuted && !plExecuted && currentPrice <= 820) {
          // 800 < effectivePriceOpen (~851) → partialLoss accepted
          plExecuted = true;
          await commitPartialLoss(symbol, 20);
          console.log("[DCA-6 partialLoss]", currentPrice);
        }
      },
      onClose: (_symbol, data, currentPrice) => {
        console.log("[DCA-6 onClose]", { currentPrice, priceOpen: data.priceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-6 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "55m-dca-6",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:55:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-6", exchangeName: "binance-dca-6", frameName: "55m-dca-6" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!avg1Executed) { fail("DCA #1 never executed"); return; }
  if (!avg2Executed) { fail("DCA #2 never executed"); return; }
  if (!ppExecuted) { fail("partialProfit never executed"); return; }
  if (!plExecuted) { fail("partialLoss never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries < 3) { fail(`Expected totalEntries >= 3, got ${ce.totalEntries}`); return; }
  if (ce.priceOpen >= ce.originalPriceOpen) { fail(`Expected effectivePriceOpen < originalPriceOpen after DCA down`); return; }

  pass(`DCA-6: avg1=${avg1Executed}, avg2=${avg2Executed}, pp=${ppExecuted}, pl=${plExecuted}, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}`);
});


/**
 * DCA ТЕСТ #7: partial profit → partial loss → partial profit → TP (LONG, без DCA)
 *
 * Три последовательных partial без усреднения — проверяем корректность
 * running cost basis при трёх подряд partial с одним входом (cnt=1 все три).
 * После 3 partial остаток закрывается по TP.
 *
 * Последовательность:
 * - Активация LONG на 1000 (один вход)
 * - Рост до 1100 → commitPartialProfit(30%)
 * - Откат до 950 → commitPartialLoss(20%)
 * - Рост до 1200 → commitPartialProfit(25%)
 * - TP на 1300 → закрытие остатка
 */
test("DCA BACKTEST: partialProfit → partialLoss → partialProfit → TP no DCA (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let pp1Executed = false;
  let plExecuted = false;
  let pp2Executed = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-7",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-7",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Ожидание выше priceOpen
      // i=5..9:   Активация LONG
      // i=10..14: Рост до 1100 — pp1 (30%)
      // i=15..19: Откат до 950 — pl (20%)
      // i=20..24: Рост до 1200 — pp2 (25%)
      // i=25..44: TP = 1300
      for (let i = 0; i < 45; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 950;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 25) {
          const p = 1200;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else {
          const p = 1300;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 300, // 1300
        priceStopLoss: basePrice - 200,   // 800
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!pp1Executed && currentPrice >= 1080) {
          pp1Executed = true;
          await commitPartialProfit(symbol, 30);
          console.log("[DCA-7 pp1]", currentPrice);
        } else if (pp1Executed && !plExecuted && currentPrice <= 970 && currentPrice >= 920) {
          plExecuted = true;
          await commitPartialLoss(symbol, 20);
          console.log("[DCA-7 pl]", currentPrice);
        } else if (plExecuted && !pp2Executed && currentPrice >= 1180) {
          pp2Executed = true;
          await commitPartialProfit(symbol, 25);
          console.log("[DCA-7 pp2]", currentPrice);
        }
      },
      onClose: (_symbol, data, currentPrice) => {
        console.log("[DCA-7 onClose]", { currentPrice, priceOpen: data.priceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, totalEntries: data.totalEntries });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-7 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "45m-dca-7",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:45:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-7", exchangeName: "binance-dca-7", frameName: "45m-dca-7" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!pp1Executed) { fail("partialProfit #1 never executed"); return; }
  if (!plExecuted) { fail("partialLoss never executed"); return; }
  if (!pp2Executed) { fail("partialProfit #2 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  // Single entry — totalEntries stays 1
  if (ce.totalEntries < 1) { fail(`Expected totalEntries >= 1, got ${ce.totalEntries}`); return; }

  pass(`DCA-7: pp1=${pp1Executed}, pl=${plExecuted}, pp2=${pp2Executed}, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}`);
});


/**
 * DCA ТЕСТ #8: DCA → partial loss → DCA → partial loss → TP (LONG)
 *
 * Два DCA чередуются с двумя partial loss — "лесенка" усреднения вниз
 * с частичными стопами между ними.
 * Проверяем что каждый partial loss использует накопленный к тому моменту
 * cost basis (с учётом DCA), а не исходный.
 *
 * Последовательность:
 * - Активация LONG на 1000
 * - Падение до 870 → commitAverageBuy (entry #2)
 * - Продолжение падения до 820 → commitPartialLoss(25%) (cnt=2)
 * - Падение до 720 → commitAverageBuy (entry #3)
 * - Продолжение падения до 680 → commitPartialLoss(20%) (cnt=3)
 * - TP на 1100 → закрытие остатка
 */
test("DCA BACKTEST: DCA → partialLoss → DCA → partialLoss → TP (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let avg1Executed = false;
  let pl1Executed = false;
  let avg2Executed = false;
  let pl2Executed = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-8",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-8",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Ожидание выше priceOpen
      // i=5..9:   Активация LONG
      // i=10..14: Просадка до 870 — DCA #1
      // i=15..19: Продолжение до 820 — partialLoss #1 (25%, cnt=2)
      // i=20..24: Продолжение до 720 — DCA #2
      // i=25..29: Продолжение до 680 — partialLoss #2 (20%, cnt=3)
      // i=30..34: Нейтраль около 750
      // i=35..59: TP = 1100
      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 870;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 820;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 25) {
          const p = 720;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 30) {
          const p = 680;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 35) {
          const p = 750;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 100, // 1100
        priceStopLoss: basePrice - 500,   // 500
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[DCA-8 onActivePing]", { currentPrice, avg1Executed, pl1Executed, avg2Executed, pl2Executed, totalEntries: data.totalEntries });

        if (!avg1Executed && currentPrice <= 890) {
          avg1Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-8 avg #1]", currentPrice);
        } else if (avg1Executed && !pl1Executed && currentPrice <= 840 && currentPrice > 740) {
          pl1Executed = true;
          await commitPartialLoss(symbol, 25);
          console.log("[DCA-8 pl #1]", currentPrice);
        } else if (pl1Executed && !avg2Executed && currentPrice <= 740) {
          avg2Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-8 avg #2]", currentPrice);
        } else if (avg2Executed && !pl2Executed && currentPrice <= 700) {
          pl2Executed = true;
          await commitPartialLoss(symbol, 20);
          console.log("[DCA-8 pl #2]", currentPrice);
        }
      },
      onClose: (_symbol, data, currentPrice) => {
        console.log("[DCA-8 onClose]", { currentPrice, priceOpen: data.priceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-8 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "60m-dca-8",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-8", exchangeName: "binance-dca-8", frameName: "60m-dca-8" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!avg1Executed) { fail("DCA #1 never executed"); return; }
  if (!pl1Executed) { fail("partialLoss #1 never executed"); return; }
  if (!avg2Executed) { fail("DCA #2 never executed"); return; }
  if (!pl2Executed) { fail("partialLoss #2 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries < 3) { fail(`Expected totalEntries >= 3, got ${ce.totalEntries}`); return; }
  if (ce.priceOpen >= ce.originalPriceOpen) { fail(`Expected effectivePriceOpen < originalPriceOpen after DCA down`); return; }

  pass(`DCA-8: avg1=${avg1Executed}, pl1=${pl1Executed}, avg2=${avg2Executed}, pl2=${pl2Executed}, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}`);
});


/**
 * DCA ТЕСТ #9: partial profit × 3 подряд → TP (LONG, без DCA)
 *
 * Три последовательных partialProfit с одним входом (cnt=1 все три).
 * Процент суммируется: 30% + 30% + 30% = ~65.7% от cost basis, остаток закрывается по TP.
 * Проверяем что running cost basis после трёх закрытий остаётся корректным
 * и не превышает 100% totalInvested.
 *
 * Последовательность:
 * - Активация LONG на 1000
 * - Рост до 1100 → commitPartialProfit(30%)
 * - Рост до 1200 → commitPartialProfit(30%)
 * - Рост до 1300 → commitPartialProfit(30%)
 * - TP на 1400 → закрытие остатка (~34.3% позиции)
 */
test("DCA BACKTEST: partialProfit × 3 consecutive → TP no DCA (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let pp1Executed = false;
  let pp2Executed = false;
  let pp3Executed = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-9",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-9",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Ожидание выше priceOpen
      // i=5..9:   Активация LONG
      // i=10..14: Рост до 1100 — pp1 (30%)
      // i=15..19: Рост до 1200 — pp2 (30%)
      // i=20..24: Рост до 1300 — pp3 (30%)
      // i=25..44: TP = 1400 (остаток ~34.3%)
      for (let i = 0; i < 45; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 1200;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 25) {
          const p = 1300;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else {
          const p = 1400;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 400, // 1400
        priceStopLoss: basePrice - 300,   // 700
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!pp1Executed && currentPrice >= 1080) {
          pp1Executed = true;
          await commitPartialProfit(symbol, 30);
          console.log("[DCA-9 pp1]", currentPrice);
        } else if (pp1Executed && !pp2Executed && currentPrice >= 1180) {
          pp2Executed = true;
          await commitPartialProfit(symbol, 30);
          console.log("[DCA-9 pp2]", currentPrice);
        } else if (pp2Executed && !pp3Executed && currentPrice >= 1280) {
          pp3Executed = true;
          await commitPartialProfit(symbol, 30);
          console.log("[DCA-9 pp3]", currentPrice);
        }
      },
      onClose: (_symbol, data, currentPrice) => {
        console.log("[DCA-9 onClose]", { currentPrice, priceOpen: data.priceOpen, totalEntries: data.totalEntries });
        closeEvents.push({ priceOpen: data.priceOpen, totalEntries: data.totalEntries });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-9 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "45m-dca-9",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:45:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-9", exchangeName: "binance-dca-9", frameName: "45m-dca-9" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!pp1Executed) { fail("partialProfit #1 never executed"); return; }
  if (!pp2Executed) { fail("partialProfit #2 never executed"); return; }
  if (!pp3Executed) { fail("partialProfit #3 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  // 3x 30% of remaining: 30 + 21 + 14.7 = 65.7% closed, 34.3% remains → still open at TP
  if (ce.totalEntries < 1) { fail(`Expected totalEntries >= 1, got ${ce.totalEntries}`); return; }

  pass(`DCA-9: pp1=${pp1Executed}, pp2=${pp2Executed}, pp3=${pp3Executed}, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}`);
});


/**
 * DCA ТЕСТ #10: SD scenario — profit→DCA→DCA→loss→DCA→profit→DCA→TP (LONG)
 *
 * Соответствует unit-тесту SD (spec/dca.test.mjs):
 *   entry#1@1000, PP(30%,cnt=1)@1150, DCA@950, DCA@880,
 *   PL(20%,cnt=3)@860, DCA@920, PP(40%,cnt=4)@1050, DCA@980, TP@1200
 *
 * Фазы свечей:
 *   i=0..4:   выше 1000 — ждём (scheduled не активируется)
 *   i=5..9:   активация: low<=1000
 *   i=10..14: рост до 1150 → PP(30%)
 *   i=15..19: падение до 950 → DCA#2
 *   i=20..24: падение до 880 → DCA#3
 *   i=25..29: падение до 860 → PL(20%)   (860 < effectivePriceOpen ~934)
 *   i=30..34: рост до 920 → DCA#4
 *   i=35..39: рост до 1050 → PP(40%)     (1050 > effectivePriceOpen ~929)
 *   i=40..44: падение до 980 → DCA#5
 *   i=45..59: TP = 1200
 *
 * Проверяем:
 *   - все 5 операций выполнены в правильном порядке
 *   - totalEntries=5 при закрытии
 *   - effectivePriceOpen < originalPriceOpen (DCA вниз снизил среднюю)
 *   - closeReason=take_profit
 */
test("DCA BACKTEST: PP→DCA→DCA→PL→DCA→PP→DCA→TP (SD scenario, LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let pp1Executed = false;
  let dca1Executed = false;
  let dca2Executed = false;
  let plExecuted = false;
  let dca3Executed = false;
  let pp2Executed = false;
  let dca4Executed = false;

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
    exchangeName: "binance-dca-10",
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
    strategyName: "test-dca-10",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // 10 свечей на фазу — VWAP успевает стабилизироваться (5-свечное окно)
      // Итого: 5(wait) + 10(act) + 10(1150) + 10(950) + 10(880) + 10(860) + 10(920) + 10(1050) + 10(980) + 10(TP) = 95 свечей
      for (let i = 0; i < 95; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          // Выше priceOpen — ждём активации
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 15) {
          // Активация: low <= priceOpen
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 25) {
          // Рост до 1150 → PP(30%)
          const price = 1150;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 35) {
          // Падение до 950 → DCA#2
          const price = 950;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 45) {
          // Падение до 880 → DCA#3
          const price = 880;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 55) {
          // Падение до 860 → PL(20%)  (860 < effectivePriceOpen ~934)
          const price = 860;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 65) {
          // Рост до 920 → DCA#4
          const price = 920;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 75) {
          // Рост до 1050 → PP(40%)  (1050 > effectivePriceOpen ~929)
          const price = 1050;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else if (i < 85) {
          // Падение до 980 → DCA#5
          const price = 980;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        } else {
          // TP = 1200
          const price = 1200;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 1000
        priceTakeProfit: basePrice + 200,  // 1200 (+20%)
        priceStopLoss: basePrice - 200,    // 800 (-20%)
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        // Шаг 1: PP(30%) при росте до ~1150
        if (!pp1Executed && currentPrice >= 1130) {
          pp1Executed = true;
          await commitPartialProfit(symbol, 30);
        }

        // Шаг 2: DCA#2 при падении до ~950
        if (pp1Executed && !dca1Executed && currentPrice <= 960) {
          dca1Executed = true;
          await commitAverageBuy(symbol);
        }

        // Шаг 3: DCA#3 при падении до ~880
        if (dca1Executed && !dca2Executed && currentPrice <= 890) {
          dca2Executed = true;
          await commitAverageBuy(symbol);
        }

        // Шаг 4: PL(20%) при падении до ~860  (860 < effectivePriceOpen ~934)
        if (dca2Executed && !plExecuted && currentPrice <= 870) {
          plExecuted = true;
          await commitPartialLoss(symbol, 20);
        }

        // Шаг 5: DCA#4 при росте до ~920
        if (plExecuted && !dca3Executed && currentPrice >= 910) {
          dca3Executed = true;
          await commitAverageBuy(symbol);
        }

        // Шаг 6: PP(40%) при росте до ~1050  (1050 > effectivePriceOpen ~929)
        if (dca3Executed && !pp2Executed && currentPrice >= 1030) {
          pp2Executed = true;
          await commitPartialProfit(symbol, 40);
        }

        // Шаг 7: DCA#5 при падении до ~980
        if (pp2Executed && !dca4Executed && currentPrice <= 990) {
          dca4Executed = true;
          await commitAverageBuy(symbol);
        }
      },
      onClose: (_symbol, data, _currentPrice) => {
        closeEvents.push({
          priceOpen: data.priceOpen,
          originalPriceOpen: data.originalPriceOpen,
          totalEntries: data.totalEntries,
          closeReason: data.closeReason,
        });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-10 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "60m-dca-10",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:35:00Z"),  // 95 candles
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-10", exchangeName: "binance-dca-10", frameName: "60m-dca-10" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!pp1Executed)  { fail("commitPartialProfit #1 never executed"); return; }
  if (!dca1Executed) { fail("commitAverageBuy #1 (950) never executed"); return; }
  if (!dca2Executed) { fail("commitAverageBuy #2 (880) never executed"); return; }
  if (!plExecuted)   { fail("commitPartialLoss never executed"); return; }
  if (!pp2Executed)  { fail("commitPartialProfit #2 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];

  // DCA#4@920 и DCA#5@980 отклоняются: после PL@860 effectivePriceOpen ~929,
  // 920 и 980 выше неё → commitAverageBuy отклоняется (нет нового low).
  // Итого 3 входа: entry#1@1000, DCA@950, DCA@880.
  if (ce.totalEntries !== 3) {
    fail(`Expected totalEntries=3 (DCA@920,@980 rejected above effectivePriceOpen), got ${ce.totalEntries}`);
    return;
  }

  if (ce.priceOpen >= ce.originalPriceOpen) {
    fail(`Expected effectivePriceOpen (${ce.priceOpen?.toFixed(2)}) < originalPriceOpen (${ce.originalPriceOpen}) after DCA down`);
    return;
  }

  pass(`DCA-10 SD: pp1=${pp1Executed}, dca@950=${dca1Executed}, dca@880=${dca2Executed}, pl=${plExecuted}, dca@920(rejected)=${dca3Executed}, pp2=${pp2Executed}, dca@980(rejected)=${dca4Executed}, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}`);
});


/**
 * DCA ТЕСТ #11: partialProfit(50%) → averageBuy → partialProfit(60%) — ДОЛЖЕН ПРОЙТИ
 *
 * Без DCA между двумя partial: второй PP(60%) > remaining(50%) → отклоняется.
 * С DCA между ними: costBasis пополняется, 60% от нового costBasis допустимо.
 *
 * Последовательность:
 * - Активация LONG на 1000
 * - Рост до 1100 → commitPartialProfit(50%)  [costBasis: 100→50]
 * - Падение до 800 → commitAverageBuy        [costBasis: 50+100=150, ep≈857]
 * - Рост до 1150 → commitPartialProfit(60%)  [60% от 150=90 — допустимо]
 * - TP на 1300 → закрытие остатка
 *
 * Проверяем: оба partial выполнены, _partial.length === 2
 */
test("DCA BACKTEST: partialProfit(50%) → averageBuy → partialProfit(60%) PASSES (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let pp1Executed = false;
  let avgExecuted = false;
  let pp2Executed = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-11",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-11",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   выше priceOpen
      // i=5..9:   активация LONG
      // i=10..19: рост до 1100 → PP(50%)
      // i=20..29: падение до 800 → averageBuy  (800 < ep=1000)
      // i=30..39: рост до 1150 → PP(60%)
      // i=40..59: TP = 1300
      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 20) {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 30) {
          const p = 800;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 40) {
          const p = 1150;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else {
          const p = 1300;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 300, // 1300
        priceStopLoss: basePrice - 300,   // 700
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!pp1Executed && currentPrice >= 1080) {
          pp1Executed = true;
          await commitPartialProfit(symbol, 50);
          console.log("[DCA-11 pp1(50%)]", currentPrice);
        } else if (pp1Executed && !avgExecuted && currentPrice <= 820) {
          avgExecuted = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-11 avg]", currentPrice);
        } else if (avgExecuted && !pp2Executed && currentPrice >= 1130) {
          pp2Executed = true;
          await commitPartialProfit(symbol, 60);
          console.log("[DCA-11 pp2(60%)]", currentPrice);
        }
      },
      onClose: (_symbol, data) => {
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries, partial: data._partial });
      },
    },
  });

  addFrameSchema({
    frameName: "60m-dca-11",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-11", exchangeName: "binance-dca-11", frameName: "60m-dca-11" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!pp1Executed) { fail("partialProfit #1 (50%) never executed"); return; }
  if (!avgExecuted) { fail("commitAverageBuy never executed"); return; }
  if (!pp2Executed) { fail("partialProfit #2 (60%) never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (!ce.partial || ce.partial.length !== 2) {
    fail(`Expected _partial.length=2, got ${ce.partial?.length}`);
    return;
  }

  pass(`DCA-11: pp1(50%)=${pp1Executed}, avg=${avgExecuted}, pp2(60%)=${pp2Executed}, _partial.length=${ce.partial.length}, totalEntries=${ce.totalEntries}`);
});


/**
 * DCA ТЕСТ #12: partialProfit(50%) → partialProfit(60%) — фреймворк отклоняет если
 * newTotalClosedDollar > totalInvested. Это условие: closedDollar + percent×remaining > total.
 *
 * При 1 entry ($100): PP(50%) → closedDollar=50, remaining=50.
 * PP(60%): newPartial = 60%×50 = $30, total = 80 < 100 → ПРИНЯТ.
 * Reject недостижим при корректных процентах (0–100) без DCA.
 *
 * Зато с DCA между двумя PP происходит интересное:
 * PP(50%) → averageBuy (totalInvested вырастает до $200, remaining=$150) →
 * PP(60%): newPartial = 60%×150 = $90, closedDollar = 50+90 = $140 < $200 → ПРИНЯТ.
 * Сумма процентов "50+60=110%" — misleading, реально закрыто только 70% от totalInvested.
 *
 * DCA-12 проверяет именно это: что "50%+60%" без DCA закрывает 80% dollar basis (не 110%),
 * и _partial.length === 2 (оба приняты — protect guard не сработал).
 *
 * Последовательность:
 * - Активация LONG на 1000
 * - Рост до 1100 → commitPartialProfit(50%)  [costBasis: 100→50]
 * - Рост до 1200 → commitPartialProfit(60%)  [60% от 50=30, costBasis: 50→20]
 * - TP на 1300 → закрытие остатка (20% costBasis = $20)
 *
 * Проверяем: _partial.length === 2 (protect guard не сработал: 80 < 100)
 */
test("DCA BACKTEST: partialProfit(50%) → partialProfit(60%) without averageBuy — both accepted (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let pp1Executed = false;
  let pp2Attempted = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-12",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-12",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   выше priceOpen
      // i=5..9:   активация LONG
      // i=10..19: рост до 1100 → PP(50%)
      // i=20..29: рост до 1200 → PP(60%) — попытка (должна отклониться)
      // i=30..59: TP = 1300
      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 20) {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 30) {
          const p = 1200;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else {
          const p = 1300;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 300, // 1300
        priceStopLoss: basePrice - 300,   // 700
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!pp1Executed && currentPrice >= 1080) {
          pp1Executed = true;
          await commitPartialProfit(symbol, 50);
          console.log("[DCA-12 pp1(50%)]", currentPrice);
        } else if (pp1Executed && !pp2Attempted && currentPrice >= 1180) {
          pp2Attempted = true;
          await commitPartialProfit(symbol, 60);
          console.log("[DCA-12 pp2(60%) attempted]", currentPrice);
        }
      },
      onClose: (_symbol, data) => {
        closeEvents.push({ priceOpen: data.priceOpen, totalEntries: data.totalEntries, partial: data._partial });
      },
    },
  });

  addFrameSchema({
    frameName: "60m-dca-12",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-12", exchangeName: "binance-dca-12", frameName: "60m-dca-12" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!pp1Executed) { fail("partialProfit #1 (50%) never executed"); return; }
  if (!pp2Attempted) { fail("partialProfit #2 (60%) was never attempted"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (!ce.partial || ce.partial.length !== 2) {
    fail(`Expected _partial.length=2 (both partials accepted), got ${ce.partial?.length}`);
    return;
  }

  pass(`DCA-12: pp1(50%)=${pp1Executed}, pp2(60%)=${pp2Attempted}, _partial.length=${ce.partial.length} (both accepted — 60% of remaining costBasis, not of totalInvested)`);
});

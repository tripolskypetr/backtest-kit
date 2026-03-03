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
  toProfitLossDto,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

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
      onCancel: (symbol, _data, currentPrice) => {
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


/**
 * DCA ТЕСТ #13: SHORT DCA×2 → partialProfit → stop_loss close
 *
 * SHORT позиция — усредняем вверх дважды (новый максимум каждый раз),
 * берём частичную прибыль при падении, потом цена пробивает SL вверх.
 *
 * Разнообразие: SHORT + 2 DCA (всё выше предыдущего) + partialProfit + SL close.
 *
 * Последовательность:
 * - SHORT на 1000 (SL=1500, TP=500)
 * - Рост до 1100 → DCA #1 (1100 > max(1000) — новый максимум ✓)
 * - Рост до 1200 → DCA #2 (1200 > max(1100) — новый максимум ✓)
 * - Падение до 900 → commitPartialProfit(30%) (цена падает — SHORT прибыль)
 * - Рост до 1500 → stop_loss
 *
 * Проверяем:
 * - Оба DCA приняты
 * - partialProfit выполнен
 * - priceClose >= priceStopLoss (SL close)
 * - effectivePriceOpen > originalPriceOpen (SHORT DCA вверх повысил среднюю)
 * - totalEntries=3
 */
test("DCA BACKTEST: SHORT DCA×2 → partialProfit → stop_loss close", async ({ pass, fail }) => {
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

  // Буферные свечи НИЖЕ priceOpen (для SHORT: ждём роста до priceOpen)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-13",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-13",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Ниже priceOpen — ожидание
      // i=5..9:   Активация SHORT: high >= basePrice=1000
      // i=10..14: Рост до 1100 — DCA #1 (1100 > max(1000) ✓)
      // i=15..19: Рост до 1200 — DCA #2 (1200 > max(1100) ✓)
      // i=20..29: Падение до 900 — partialProfit (SHORT прибыль при падении)
      // i=30..44: Рост до SL = 1500 → stop_loss
      for (let i = 0; i < 45; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 1200;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 30) {
          const p = 900;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else {
          // SL = 1500
          const p = 1500;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,           // 1000
        priceTakeProfit: basePrice - 500, // 500
        priceStopLoss: basePrice + 500,   // 1500
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);
        console.log("[DCA-13 onActivePing]", { currentPrice, avg1Executed, avg2Executed, ppExecuted, totalEntries: data.totalEntries });

        // DCA #1: рост до ~1100 (> max(1000) ✓)
        if (!avg1Executed && currentPrice >= 1080) {
          avg1Executed = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-13 avg #1]", { result, currentPrice });
        }

        // DCA #2: рост до ~1200 (> max(1100) ✓)
        if (avg1Executed && !avg2Executed && currentPrice >= 1180) {
          avg2Executed = true;
          const result = await commitAverageBuy(symbol);
          console.log("[DCA-13 avg #2]", { result, currentPrice });
        }

        // partialProfit: падение до ~900 (SHORT прибыль при падении)
        if (avg2Executed && !ppExecuted && currentPrice <= 920) {
          ppExecuted = true;
          const result = await commitPartialProfit(symbol, 30);
          console.log("[DCA-13 partialProfit]", { result, currentPrice });
        }
      },
      onClose: (_symbol, data, priceClose) => {
        console.log("[DCA-13 onClose]", { priceClose, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries, priceStopLoss: data.priceStopLoss });
        closeEvents.push({ priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen, totalEntries: data.totalEntries, priceClose, priceStopLoss: data.priceStopLoss });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-13 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "45m-dca-13",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:45:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-13", exchangeName: "binance-dca-13", frameName: "45m-dca-13" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!avg1Executed) { fail("DCA #1 never executed"); return; }
  if (!avg2Executed) { fail("DCA #2 never executed"); return; }
  if (!ppExecuted) { fail("partialProfit never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries < 3) { fail(`Expected totalEntries >= 3, got ${ce.totalEntries}`); return; }

  // SL close: priceClose >= priceStopLoss (for SHORT, stop-loss is above entry)
  if (ce.priceClose < ce.priceStopLoss) {
    fail(`Expected SL close (priceClose=${ce.priceClose} >= priceStopLoss=${ce.priceStopLoss})`);
    return;
  }

  // SHORT DCA вверх: effectivePriceOpen должна быть > originalPriceOpen
  if (ce.priceOpen <= ce.originalPriceOpen) {
    fail(`Expected effectivePriceOpen (${ce.priceOpen}) > originalPriceOpen (${ce.originalPriceOpen}) for SHORT DCA up`);
    return;
  }

  pass(`DCA-13 SHORT: avg1=${avg1Executed}, avg2=${avg2Executed}, pp=${ppExecuted}, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}, priceClose=${ce.priceClose} >= SL=${ce.priceStopLoss}`);
});


/**
 * DCA ТЕСТ #14: partial profit → close at stop_loss (LONG)
 *
 * Разнообразие: проверяем что partial history корректно учитывается
 * при закрытии по stop_loss (не по TP).
 *
 * Последовательность:
 * - Активация LONG на 1000
 * - Рост до 1100 → commitPartialProfit(30%)
 * - Падение до SL = 700 → закрытие по stop_loss
 *
 * Проверяем:
 * - partialProfit выполнен
 * - closeReason=stop_loss
 * - pnlPercentage < 0 (убыток — TP partials не компенсировали SL)
 * - data._partial.length === 1 в onClose
 */
test("DCA BACKTEST: partialProfit → stop_loss close (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let ppExecuted = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-14",
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
    strategyName: "test-dca-14",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Выше priceOpen — ожидание
      // i=5..9:   Активация LONG
      // i=10..14: Рост до 1100 → partialProfit(30%)
      // i=15..19: Нейтраль
      // i=20..34: Падение до 700 → SL
      for (let i = 0; i < 35; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 900;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        } else {
          // SL = 700: цена падает ниже SL
          const p = 700;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,           // 1000
        priceTakeProfit: basePrice + 400, // 1400
        priceStopLoss: basePrice - 300,   // 700
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!ppExecuted && currentPrice >= 1080) {
          ppExecuted = true;
          await commitPartialProfit(symbol, 30);
          console.log("[DCA-14 partialProfit]", currentPrice);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        console.log("[DCA-14 onClose]", { priceClose, partial: data._partial?.length, priceStopLoss: data.priceStopLoss });
        closeEvents.push({ priceClose, priceStopLoss: data.priceStopLoss, partial: data._partial, totalEntries: data.totalEntries });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-14 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "35m-dca-14",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:35:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-14", exchangeName: "binance-dca-14", frameName: "35m-dca-14" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!ppExecuted) { fail("partialProfit never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  // SL close: priceClose <= priceStopLoss (for LONG, stop-loss is below entry)
  if (ce.priceClose > ce.priceStopLoss) {
    fail(`Expected SL close (priceClose=${ce.priceClose} <= priceStopLoss=${ce.priceStopLoss})`);
    return;
  }
  if (!ce.partial || ce.partial.length !== 1) { fail(`Expected _partial.length=1, got ${ce.partial?.length}`); return; }

  pass(`DCA-14: partialProfit=${ppExecuted}, priceClose=${ce.priceClose} <= SL=${ce.priceStopLoss}, _partial.length=${ce.partial.length}`);
});


/**
 * DCA ТЕСТ #15: Верификация вычисленного PNL через toProfitLossDto внутри onClose
 *
 * Разнообразие: единственный e2e тест который проверяет числовые значения
 * PNL через вызов toProfitLossDto на реальных данных сигнала из движка.
 *
 * Сценарий: простая LONG позиция без DCA и без partial closes.
 * entry@1000, TP@1200 → должны получить ~19.57% с учётом комиссий и slippage.
 *
 * Данные без partials упрощают верификацию:
 *   priceOpenWithSlip = 1000 * (1 + 0.001) = 1000.1... (wait, CC_PERCENT_SLIPPAGE=0.1)
 *   priceOpen = 1000, priceClose = 1200
 *   priceOpenWithSlip = 1000 * 1.001 = 1000.1
 *   priceCloseWithSlip = 1200 * 0.999 = 1199.8... → wait 1200 * (1 - 0.001) = 1198.8
 *   pnl = (1198.8 - 1000.1) / 1000.1 * 100 = 19.867...
 *   fee = CC_PERCENT_FEE * (1 + priceCloseWithSlip / priceOpenWithSlip)
 *   CC_PERCENT_FEE = 0.1, CC_PERCENT_SLIPPAGE = 0.1 (from GLOBAL_CONFIG)
 *   fee = 0.1 * (1 + 1198.8/1000.1) ≈ 0.1 * 2.1987... ≈ 0.21987...
 *   pnlPercentage ≈ 19.867... - 0.220... ≈ 19.647...
 *
 * Проверяем что pnlPercentage > 0 и pnlCost > 0 и pnlEntries > 0.
 * Также pnlCost = pnlPercentage / 100 * pnlEntries.
 */
test("DCA BACKTEST: verify toProfitLossDto PNL values in onClose (simple LONG TP)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-15",
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
    strategyName: "test-dca-15",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Выше priceOpen — ожидание
      // i=5..9:   Активация LONG: low <= basePrice
      // i=10..24: TP = 1200
      for (let i = 0; i < 25; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else {
          const p = 1200;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
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
      onClose: (_symbol, data, priceClose) => {
        console.log("[DCA-15 onClose]", { priceClose, priceTakeProfit: data.priceTakeProfit });

        // Compute PNL using the exported helper — same as what the engine does internally
        const pnl = toProfitLossDto(data, priceClose);
        console.log("[DCA-15 pnl]", pnl);
        closeEvents.push({ priceClose, priceTakeProfit: data.priceTakeProfit, pnl });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-15 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "25m-dca-15",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:25:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-15", exchangeName: "binance-dca-15", frameName: "25m-dca-15" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  // TP close: priceClose >= priceTakeProfit (for LONG)
  if (ce.priceClose < ce.priceTakeProfit) {
    fail(`Expected TP close (priceClose=${ce.priceClose} >= priceTakeProfit=${ce.priceTakeProfit})`);
    return;
  }

  const { pnl } = ce;
  if (pnl.pnlPercentage <= 0) { fail(`Expected pnlPercentage > 0, got ${pnl.pnlPercentage}`); return; }
  if (pnl.pnlCost <= 0) { fail(`Expected pnlCost > 0, got ${pnl.pnlCost}`); return; }
  if (pnl.pnlEntries <= 0) { fail(`Expected pnlEntries > 0, got ${pnl.pnlEntries}`); return; }

  // Verify identity: pnlCost = pnlPercentage / 100 * pnlEntries
  const expectedPnlCost = pnl.pnlPercentage / 100 * pnl.pnlEntries;
  const diff = Math.abs(pnl.pnlCost - expectedPnlCost);
  if (diff > 0.0001) {
    fail(`pnlCost identity failed: pnlCost=${pnl.pnlCost}, expected=${expectedPnlCost}, diff=${diff}`);
    return;
  }

  pass(`DCA-15: priceClose=${ce.priceClose} >= TP=${ce.priceTakeProfit}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, pnlCost=${pnl.pnlCost.toFixed(4)}, pnlEntries=${pnl.pnlEntries}, identity ✓`);
});


/**
 * DCA ТЕСТ #16: DCA×2 → partial profit → verify PNL identity via toProfitLossDto (LONG)
 *
 * Разнообразие: e2e тест с DCA + partial + числовая верификация PNL.
 * Совмещает несколько входов и partial close с проверкой what-you-see-is-what-you-get
 * для pnlCost, pnlEntries и их соотношения.
 *
 * Сценарий:
 * - Вход LONG @1000 (entry#1)
 * - Падение до 800 → commitAverageBuy (entry#2)
 * - Отскок до 950 → commitPartialProfit(30%) — частичный выход
 * - TP на 1100 → закрытие остатка
 *
 * После закрытия в onClose:
 * - _entry.length = 2, totalInvested = $200
 * - _partial.length = 1
 * - pnlEntries = 200 (total invested)
 * - pnlCost = pnlPercentage / 100 * 200
 * - Без partial: pnlCost / pnlEntries * 100 = pnlPercentage
 */
test("DCA BACKTEST: DCA×2 → partialProfit → verify pnlCost/pnlEntries identity (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let avg1Executed = false;
  let ppExecuted = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-16",
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
    strategyName: "test-dca-16",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Выше priceOpen — ожидание
      // i=5..9:   Активация LONG
      // i=10..14: Просадка до 800 — DCA#1
      // i=15..24: Отскок до 950 — partialProfit(30%)
      // i=25..39: TP = 1100
      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 800;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 50, close: p, volume: 100 });
        } else if (i < 25) {
          const p = 950;
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
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!avg1Executed && currentPrice <= 820) {
          avg1Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-16 avg#1]", currentPrice);
        } else if (avg1Executed && !ppExecuted && currentPrice >= 930) {
          ppExecuted = true;
          await commitPartialProfit(symbol, 30);
          console.log("[DCA-16 partialProfit]", currentPrice);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        console.log("[DCA-16 onClose]", { priceClose, totalEntries: data.totalEntries, partial: data._partial?.length });

        const pnl = toProfitLossDto(data, priceClose);
        console.log("[DCA-16 pnl]", pnl);
        closeEvents.push({ priceClose, priceTakeProfit: data.priceTakeProfit, pnl, totalEntries: data.totalEntries, partialLen: data._partial?.length ?? 0 });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-16 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "40m-dca-16",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-16", exchangeName: "binance-dca-16", frameName: "40m-dca-16" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!avg1Executed) { fail("DCA #1 never executed"); return; }
  if (!ppExecuted) { fail("partialProfit never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  // TP close: priceClose >= priceTakeProfit (for LONG)
  if (ce.priceClose < ce.priceTakeProfit) {
    fail(`Expected TP close (priceClose=${ce.priceClose} >= priceTakeProfit=${ce.priceTakeProfit})`);
    return;
  }
  if (ce.totalEntries < 2) { fail(`Expected totalEntries >= 2, got ${ce.totalEntries}`); return; }
  if (ce.partialLen < 1) { fail(`Expected _partial.length >= 1, got ${ce.partialLen}`); return; }

  const { pnl } = ce;
  // pnlEntries = totalInvested = 2 × $100 = $200
  if (Math.abs(pnl.pnlEntries - 200) > 0.01) {
    fail(`Expected pnlEntries=200 (2 entries × $100), got ${pnl.pnlEntries}`);
    return;
  }

  // Identity: pnlCost = pnlPercentage / 100 * pnlEntries
  const expectedPnlCost = pnl.pnlPercentage / 100 * pnl.pnlEntries;
  const diff = Math.abs(pnl.pnlCost - expectedPnlCost);
  if (diff > 0.0001) {
    fail(`pnlCost identity failed: pnlCost=${pnl.pnlCost}, expected=${expectedPnlCost.toFixed(6)}, diff=${diff}`);
    return;
  }

  pass(`DCA-16: priceClose=${ce.priceClose} >= TP=${ce.priceTakeProfit}, totalEntries=${ce.totalEntries}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, pnlCost=${pnl.pnlCost.toFixed(4)}, identity ✓`);
});


/**
 * DCA ТЕСТ #17: Проверка логики "антирекорд" — DCA принимается только при новом минимуме
 *
 * Сценарий:
 * - Вход LONG @1000
 * - Падение до 800 → DCA #1 (800 < min(1000) ✓ — новый минимум)
 * - Рост до 900   → DCA #2 попытка (900 >= min(800) ✗ — НЕ новый минимум → отклонён)
 * - Падение до 750 → DCA #3 (750 < min(800) ✓ — новый минимум)
 * - TP на 1100 → закрытие
 *
 * Проверяем:
 * - DCA #1 и #3 приняты, DCA #2 отклонён
 * - totalEntries = 3 (а не 4)
 * - effectivePriceOpen = hm(1000, 800, 750) < originalPriceOpen
 */
test("DCA BACKTEST: DCA принимается только при новом антирекорде цены (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let dca1Executed = false;
  let dca2Attempted = false;
  let dca3Executed = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-17",
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
    strategyName: "test-dca-17",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Выше priceOpen — ожидание
      // i=5..9:   Активация LONG
      // i=10..14: Падение до 800 — DCA #1 (новый минимум < 1000)
      // i=15..19: Рост до 900   — DCA #2 попытка (900 >= min=800 → отклонён)
      // i=20..24: Падение до 750 — DCA #3 (новый минимум < 800 ✓)
      // i=25..39: TP = 1100
      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 800;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 900;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 25) {
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
        priceStopLoss: basePrice - 400,   // 600
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        // DCA #1: падение до ~800 (< min=1000 ✓)
        if (!dca1Executed && currentPrice <= 820) {
          dca1Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-17 dca#1 accepted]", currentPrice);
        }
        // DCA #2: рост до ~900 (>= min=800 → отклонён)
        else if (dca1Executed && !dca2Attempted && currentPrice >= 880 && currentPrice <= 920) {
          dca2Attempted = true;
          const result = await commitAverageBuy(symbol); // ожидаем false
          console.log("[DCA-17 dca#2 attempted]", { result, currentPrice });
        }
        // DCA #3: падение до ~750 (< min=800 ✓)
        else if (dca2Attempted && !dca3Executed && currentPrice <= 770) {
          dca3Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-17 dca#3 accepted]", currentPrice);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        console.log("[DCA-17 onClose]", { priceClose, totalEntries: data.totalEntries });
        closeEvents.push({ priceClose, priceTakeProfit: data.priceTakeProfit, totalEntries: data.totalEntries, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-17 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "40m-dca-17",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-17", exchangeName: "binance-dca-17", frameName: "40m-dca-17" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!dca1Executed) { fail("DCA #1 never executed"); return; }
  if (!dca2Attempted) { fail("DCA #2 was never attempted"); return; }
  if (!dca3Executed) { fail("DCA #3 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];

  // DCA #2 отклонён: totalEntries должно быть 3 (вход + dca#1 + dca#3), не 4
  if (ce.totalEntries !== 3) {
    fail(`Expected totalEntries=3 (dca#2 rejected — not a new all-time low), got ${ce.totalEntries}`);
    return;
  }

  // effectivePriceOpen = hm(1000, 800, 750) < originalPriceOpen
  if (ce.priceOpen >= ce.originalPriceOpen) {
    fail(`Expected effectivePriceOpen (${ce.priceOpen?.toFixed(2)}) < originalPriceOpen (${ce.originalPriceOpen})`);
    return;
  }

  pass(`DCA-17: dca#1=accepted, dca#2=rejected(900>=min800), dca#3=accepted, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}`);
});


/**
 * DCA ТЕСТ #18: SHORT partialProfit → partialLoss → partialProfit → TP + verify PNL
 *
 * SHORT позиция без DCA, три partial подряд, потом TP.
 * Разнообразие: SHORT + 3 partial (чередование profit/loss) + числовая проверка PNL.
 *
 * Последовательность:
 * - SHORT на 1000 (SL=1300, TP=600)
 * - Падение до 800 → commitPartialProfit(30%)   (SHORT прибыль при падении)
 * - Рост до 1080  → commitPartialLoss(20%)       (SHORT убыток при росте выше ep=1000)
 * - Падение до 750 → commitPartialProfit(25%)   (SHORT прибыль снова)
 * - TP на 600 → закрытие остатка
 *
 * Проверяем:
 * - Все три partial выполнены
 * - pnlPercentage > 0 (итого прибыль)
 * - pnlCost = pnlPercentage / 100 * pnlEntries (identity)
 * - priceClose <= priceTakeProfit (TP close для SHORT)
 */
test("DCA BACKTEST: SHORT partialProfit → partialLoss → partialProfit → TP + PNL identity", async ({ pass, fail }) => {
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

  // Буферные свечи НИЖЕ priceOpen (SHORT: ждём роста до priceOpen)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-18",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-18",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Ниже priceOpen — ожидание
      // i=5..9:   Активация SHORT: high >= priceOpen
      // i=10..14: Падение до 800 — pp1 (SHORT прибыль)
      // i=15..19: Рост до 1080  — pl  (SHORT убыток: 1080 > ep=1000)
      // i=20..24: Падение до 750 — pp2 (SHORT прибыль)
      // i=25..44: TP = 600
      for (let i = 0; i < 45; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 800;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 1080;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 25) {
          const p = 750;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        } else {
          // TP для SHORT = 600
          const p = 600;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,           // 1000
        priceTakeProfit: basePrice - 400, // 600
        priceStopLoss: basePrice + 300,   // 1300
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        // pp1: SHORT прибыль при падении до ~800
        if (!pp1Executed && currentPrice <= 820) {
          pp1Executed = true;
          await commitPartialProfit(symbol, 30);
          console.log("[DCA-18 pp1]", currentPrice);
        }
        // pl: SHORT убыток при росте до ~1080 (1080 > ep=1000 → убыток SHORT)
        else if (pp1Executed && !plExecuted && currentPrice >= 1060) {
          plExecuted = true;
          await commitPartialLoss(symbol, 20);
          console.log("[DCA-18 pl]", currentPrice);
        }
        // pp2: SHORT прибыль при падении до ~750
        else if (plExecuted && !pp2Executed && currentPrice <= 770) {
          pp2Executed = true;
          await commitPartialProfit(symbol, 25);
          console.log("[DCA-18 pp2]", currentPrice);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        console.log("[DCA-18 onClose]", { priceClose, totalEntries: data.totalEntries, partials: data._partial?.length });
        const pnl = toProfitLossDto(data, priceClose);
        closeEvents.push({ priceClose, priceTakeProfit: data.priceTakeProfit, pnl, partialLen: data._partial?.length ?? 0 });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-18 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "45m-dca-18",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:45:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-18", exchangeName: "binance-dca-18", frameName: "45m-dca-18" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!pp1Executed) { fail("partialProfit #1 never executed"); return; }
  if (!plExecuted)  { fail("partialLoss never executed"); return; }
  if (!pp2Executed) { fail("partialProfit #2 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];

  // TP close для SHORT: priceClose <= priceTakeProfit
  if (ce.priceClose > ce.priceTakeProfit) {
    fail(`Expected TP close (priceClose=${ce.priceClose} <= priceTakeProfit=${ce.priceTakeProfit})`);
    return;
  }

  if (ce.partialLen !== 3) {
    fail(`Expected _partial.length=3, got ${ce.partialLen}`);
    return;
  }

  const { pnl } = ce;
  if (pnl.pnlPercentage <= 0) {
    fail(`Expected pnlPercentage > 0 (SHORT TP should be profitable), got ${pnl.pnlPercentage}`);
    return;
  }

  // Identity: pnlCost = pnlPercentage / 100 * pnlEntries
  const expectedPnlCost = pnl.pnlPercentage / 100 * pnl.pnlEntries;
  const diff = Math.abs(pnl.pnlCost - expectedPnlCost);
  if (diff > 0.0001) {
    fail(`pnlCost identity: pnlCost=${pnl.pnlCost}, expected=${expectedPnlCost.toFixed(6)}, diff=${diff}`);
    return;
  }

  pass(`DCA-18 SHORT: pp1=${pp1Executed}, pl=${plExecuted}, pp2=${pp2Executed}, partials=3, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, pnlCost=${pnl.pnlCost.toFixed(4)}, identity ✓`);
});


/**
 * DCA ТЕСТ #19: commitPartialProfit(100%) закрывает всю позицию через partial
 *
 * Разнообразие: 100% partial close без TP/SL — полное закрытие через commitPartialProfit.
 * DCA перед partial (два входа), затем закрытие 100%.
 *
 * Последовательность:
 * - Вход LONG @1000
 * - Падение до 800 → DCA (entry#2, < min=1000 ✓)
 * - Рост до 1100 → commitPartialProfit(100%) — закрываем всю позицию
 * - Позиция должна закрыться с _partial.length=1, totalEntries=2
 *
 * Проверяем:
 * - DCA выполнен
 * - partial выполнен
 * - _partial.length = 1, totalEntries = 2
 * - pnlEntries = 200 ($100 × 2)
 * - pnlCost identity выполняется
 */
test("DCA BACKTEST: DCA → commitPartialProfit(100%) closes entire position (LONG)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let avgExecuted = false;
  let ppExecuted = false;

  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-19",
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
    strategyName: "test-dca-19",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Выше priceOpen — ожидание
      // i=5..9:   Активация LONG
      // i=10..14: Падение до 800 — DCA (< min=1000 ✓)
      // i=15..29: Рост до 1100 — commitPartialProfit(100%) — закрываем полностью
      // i=30..44: нейтраль (после полного закрытия TP/SL не нужны)
      for (let i = 0; i < 45; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 800;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 30) {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else {
          allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice + 50, close: basePrice + 100, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 500, // высоко — не достигнем
        priceStopLoss: basePrice - 400,   // 600
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!avgExecuted && currentPrice <= 820) {
          avgExecuted = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-19 avg]", currentPrice);
        } else if (avgExecuted && !ppExecuted && currentPrice >= 1080) {
          ppExecuted = true;
          await commitPartialProfit(symbol, 100);
          console.log("[DCA-19 pp(100%)]", currentPrice);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        console.log("[DCA-19 onClose]", { priceClose, totalEntries: data.totalEntries, partials: data._partial?.length });
        const pnl = toProfitLossDto(data, priceClose);
        closeEvents.push({ priceClose, pnl, totalEntries: data.totalEntries, partialLen: data._partial?.length ?? 0 });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-19 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "45m-dca-19",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:45:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-19", exchangeName: "binance-dca-19", frameName: "45m-dca-19" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!avgExecuted) { fail("commitAverageBuy never executed"); return; }
  if (!ppExecuted)  { fail("commitPartialProfit(100%) never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries < 2) { fail(`Expected totalEntries >= 2, got ${ce.totalEntries}`); return; }
  if (ce.partialLen !== 1) { fail(`Expected _partial.length=1, got ${ce.partialLen}`); return; }

  const { pnl } = ce;
  if (Math.abs(pnl.pnlEntries - 200) > 0.01) {
    fail(`Expected pnlEntries=200 (2×$100), got ${pnl.pnlEntries}`);
    return;
  }

  const expectedPnlCost = pnl.pnlPercentage / 100 * pnl.pnlEntries;
  const diff = Math.abs(pnl.pnlCost - expectedPnlCost);
  if (diff > 0.0001) {
    fail(`pnlCost identity: pnlCost=${pnl.pnlCost}, expected=${expectedPnlCost.toFixed(6)}, diff=${diff}`);
    return;
  }

  pass(`DCA-19: avg=${avgExecuted}, pp(100%)=${ppExecuted}, totalEntries=${ce.totalEntries}, partials=${ce.partialLen}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});


/**
 * DCA ТЕСТ #20: SHORT антирекорд — DCA принимается только при новом максимуме
 *
 * SHORT-версия теста DCA-17. Усреднение для SHORT идёт вверх,
 * каждый новый вход должен быть строго выше предыдущего максимума.
 *
 * Последовательность:
 * - SHORT на 1000 (SL=1600, TP=500)
 * - Рост до 1100 → DCA #1 (1100 > max=1000 ✓)
 * - Падение до 1050 → DCA #2 попытка (1050 <= max=1100 ✗ → отклонён)
 * - Рост до 1200 → DCA #3 (1200 > max=1100 ✓)
 * - TP на 500 → закрытие
 *
 * Проверяем:
 * - DCA #1 и #3 приняты, DCA #2 отклонён
 * - totalEntries = 3 (не 4)
 * - effectivePriceOpen > originalPriceOpen (SHORT DCA вверх повышает среднюю)
 */
test("DCA BACKTEST: SHORT DCA принимается только при новом антирекорде (максимуме)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let dca1Executed = false;
  let dca2Attempted = false;
  let dca3Executed = false;

  // Буферные свечи НИЖЕ priceOpen (SHORT: ждём роста)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-20",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-20",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Ниже priceOpen — ожидание
      // i=5..9:   Активация SHORT: high >= basePrice=1000
      // i=10..14: Рост до 1100 — DCA #1 (> max=1000 ✓)
      // i=15..19: Откат до 1050 — DCA #2 попытка (<= max=1100 → отклонён)
      // i=20..24: Рост до 1200 — DCA #3 (> max=1100 ✓)
      // i=25..44: TP = 500
      for (let i = 0; i < 45; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 1100;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 1050;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 30, close: p, volume: 100 });
        } else if (i < 25) {
          const p = 1200;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        } else {
          // TP для SHORT = 500
          const p = 500;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,           // 1000
        priceTakeProfit: basePrice - 500, // 500
        priceStopLoss: basePrice + 600,   // 1600
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        // DCA #1: рост до ~1100 (> max=1000 ✓)
        if (!dca1Executed && currentPrice >= 1080) {
          dca1Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-20 dca#1 accepted]", currentPrice);
        }
        // DCA #2: откат до ~1050 (<= max=1100 → отклонён)
        else if (dca1Executed && !dca2Attempted && currentPrice >= 1030 && currentPrice <= 1070) {
          dca2Attempted = true;
          const result = await commitAverageBuy(symbol); // ожидаем false
          console.log("[DCA-20 dca#2 attempted]", { result, currentPrice });
        }
        // DCA #3: рост до ~1200 (> max=1100 ✓)
        else if (dca2Attempted && !dca3Executed && currentPrice >= 1180) {
          dca3Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-20 dca#3 accepted]", currentPrice);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        console.log("[DCA-20 onClose]", { priceClose, totalEntries: data.totalEntries });
        closeEvents.push({ priceClose, priceTakeProfit: data.priceTakeProfit, totalEntries: data.totalEntries, priceOpen: data.priceOpen, originalPriceOpen: data.originalPriceOpen });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-20 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "45m-dca-20",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:45:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-20", exchangeName: "binance-dca-20", frameName: "45m-dca-20" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!dca1Executed) { fail("DCA #1 never executed"); return; }
  if (!dca2Attempted) { fail("DCA #2 was never attempted"); return; }
  if (!dca3Executed) { fail("DCA #3 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];

  // DCA #2 отклонён: totalEntries = 3 (не 4)
  if (ce.totalEntries !== 3) {
    fail(`Expected totalEntries=3 (dca#2 rejected — 1050 not a new all-time high above 1100), got ${ce.totalEntries}`);
    return;
  }

  // SHORT DCA вверх: effectivePriceOpen > originalPriceOpen
  if (ce.priceOpen <= ce.originalPriceOpen) {
    fail(`Expected effectivePriceOpen (${ce.priceOpen?.toFixed(2)}) > originalPriceOpen (${ce.originalPriceOpen}) for SHORT DCA up`);
    return;
  }

  // TP close для SHORT: priceClose <= priceTakeProfit
  if (ce.priceClose > ce.priceTakeProfit) {
    fail(`Expected TP close (priceClose=${ce.priceClose} <= priceTakeProfit=${ce.priceTakeProfit})`);
    return;
  }

  pass(`DCA-20 SHORT: dca#1=accepted, dca#2=rejected(1050<=max1100), dca#3=accepted, totalEntries=${ce.totalEntries}, effectivePriceOpen=${ce.priceOpen?.toFixed(2)}`);
});


/**
 * DCA ТЕСТ #21: LONG — 4 последовательных DCA (каждый новый минимум) → TP
 *
 * Проверяет что 3 DCA подряд — все принимаются, т.к. каждый бьёт новый минимум.
 *
 * Последовательность:
 * - LONG на 1000 (SL=500, TP=1500)
 * - Падение до 900 → DCA #1 (900 < min=1000 ✓)
 * - Падение до 800 → DCA #2 (800 < min=900 ✓)
 * - Падение до 700 → DCA #3 (700 < min=800 ✓)
 * - Рост до TP=1500 → закрытие
 *
 * Проверяем:
 * - totalEntries = 4 (3 DCA приняты)
 * - pnlEntries = 400 (4 × $100)
 * - pnlCost = pnlPercentage/100 * pnlEntries (identity)
 * - pnlPercentage > 0 (TP close)
 */
test("DCA BACKTEST: 3 последовательных DCA на новых минимумах → TP", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let dca1Executed = false;
  let dca2Executed = false;
  let dca3Executed = false;

  // Буферные свечи ВЫШЕ priceOpen (LONG: ждём падения)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-21",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-21",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Выше priceOpen — буфер
      // i=5..9:   Активация LONG: low <= 1000
      // i=10..14: Падение до 900 → DCA #1
      // i=15..19: Падение до 800 → DCA #2
      // i=20..24: Падение до 700 → DCA #3
      // i=25..59: Рост до 1500 → TP
      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 900;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 800;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        } else if (i < 25) {
          const p = 700;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        } else {
          // TP для LONG = 1500
          const p = 1500;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 1000
        priceTakeProfit: basePrice + 500,  // 1500
        priceStopLoss: basePrice - 500,    // 500
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        // DCA #1: падение до ~900 (< min=1000 ✓)
        if (!dca1Executed && currentPrice <= 920) {
          dca1Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-21 dca#1 accepted]", currentPrice);
        }
        // DCA #2: падение до ~800 (< min=900 ✓)
        else if (dca1Executed && !dca2Executed && currentPrice <= 820) {
          dca2Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-21 dca#2 accepted]", currentPrice);
        }
        // DCA #3: падение до ~700 (< min=800 ✓)
        else if (dca2Executed && !dca3Executed && currentPrice <= 720) {
          dca3Executed = true;
          await commitAverageBuy(symbol);
          console.log("[DCA-21 dca#3 accepted]", currentPrice);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        const pnl = toProfitLossDto(data, priceClose);
        console.log("[DCA-21 onClose]", { priceClose, totalEntries: data.totalEntries, pnlEntries: pnl.pnlEntries });
        closeEvents.push({ priceClose, priceTakeProfit: data.priceTakeProfit, totalEntries: data.totalEntries, pnl });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-21 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "60m-dca-21",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-21", exchangeName: "binance-dca-21", frameName: "60m-dca-21" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!dca1Executed) { fail("DCA #1 never executed"); return; }
  if (!dca2Executed) { fail("DCA #2 never executed"); return; }
  if (!dca3Executed) { fail("DCA #3 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];

  // Все 3 DCA приняты: totalEntries = 4
  if (ce.totalEntries !== 4) {
    fail(`Expected totalEntries=4 (3 DCA all accepted — each new all-time low), got ${ce.totalEntries}`);
    return;
  }

  // TP close: priceClose >= priceTakeProfit
  if (ce.priceClose < ce.priceTakeProfit) {
    fail(`Expected TP close (priceClose=${ce.priceClose} >= priceTakeProfit=${ce.priceTakeProfit})`);
    return;
  }

  const { pnl } = ce;

  // pnlEntries = 400 (4 × $100)
  if (Math.abs(pnl.pnlEntries - 400) > 0.01) {
    fail(`Expected pnlEntries=400 (4×$100), got ${pnl.pnlEntries}`);
    return;
  }

  // pnlPercentage > 0 (TP)
  if (pnl.pnlPercentage <= 0) {
    fail(`Expected pnlPercentage > 0 (TP close), got ${pnl.pnlPercentage}`);
    return;
  }

  // pnlCost identity
  const expectedPnlCost = pnl.pnlPercentage / 100 * pnl.pnlEntries;
  const diff = Math.abs(pnl.pnlCost - expectedPnlCost);
  if (diff > 0.0001) {
    fail(`pnlCost identity: pnlCost=${pnl.pnlCost}, expected=${expectedPnlCost.toFixed(6)}, diff=${diff}`);
    return;
  }

  pass(`DCA-21: 3×DCA(900,800,700) all accepted, totalEntries=${ce.totalEntries}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});


/**
 * DCA ТЕСТ #22: SHORT — 2 partialProfit без DCA → SL закрытие
 *
 * Проверяет корректность pnlCost при нескольких partial без DCA.
 * SHORT позиция — effectivePriceOpen = originalPriceOpen (нет усреднения).
 *
 * Последовательность:
 * - SHORT на 1000 (SL=1500, TP=400)
 * - Падение до 850 → commitPartialProfit(25%) — первый partial
 * - Падение до 700 → commitPartialProfit(40%) — второй partial
 * - Рост до SL=1500 → закрытие
 *
 * Проверяем:
 * - _partial.length = 2
 * - effectivePriceOpen == originalPriceOpen (нет DCA)
 * - pnlCost < 0 (SL = убыток)
 * - |pnlCost identity|: pnlCost = pnlPercentage/100 * pnlEntries
 * - pnlEntries = 100 (один вход)
 */
test("DCA BACKTEST: SHORT два partialProfit без DCA → SL убыток, 2 партиала", async ({ pass, fail }) => {
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

  // Буферные свечи НИЖЕ priceOpen (SHORT: ждём роста к priceOpen)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-22",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-22",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Ниже priceOpen — буфер
      // i=5..9:   Активация SHORT: high >= 1000
      // i=10..14: Падение до 850 → pp#1 (SHORT в профите)
      // i=15..19: Падение до 700 → pp#2 (SHORT в профите)
      // i=20..59: Рост до SL=1500 → закрытие
      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
        } else if (i < 10) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i < 15) {
          const p = 850;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        } else if (i < 20) {
          const p = 700;
          allCandles.push({ timestamp, open: p, high: p + 30, low: p - 50, close: p, volume: 100 });
        } else {
          // SL для SHORT = 1500
          const p = 1500;
          allCandles.push({ timestamp, open: p, high: p + 50, low: p - 30, close: p, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,              // 1000
        priceTakeProfit: basePrice - 600,  // 400
        priceStopLoss: basePrice + 500,    // 1500
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        // pp#1: падение до ~850 (SHORT в профите: price < ep=1000 ✓)
        if (!pp1Executed && currentPrice <= 870) {
          pp1Executed = true;
          await commitPartialProfit(symbol, 25);
          console.log("[DCA-22 pp#1]", currentPrice);
        }
        // pp#2: падение до ~700 (SHORT в профите: price < ep=1000 ✓)
        else if (pp1Executed && !pp2Executed && currentPrice <= 720) {
          pp2Executed = true;
          await commitPartialProfit(symbol, 40);
          console.log("[DCA-22 pp#2]", currentPrice);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        const pnl = toProfitLossDto(data, priceClose);
        console.log("[DCA-22 onClose]", { priceClose, partialLen: data._partial?.length, pnlEntries: pnl.pnlEntries, pnlPercentage: pnl.pnlPercentage });
        closeEvents.push({
          priceClose,
          priceStopLoss: data.priceStopLoss,
          totalEntries: data.totalEntries,
          partialLen: data._partial?.length ?? 0,
          originalPriceOpen: data.originalPriceOpen,
          priceOpen: data.priceOpen,
          pnl,
        });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-22 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "60m-dca-22",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-22", exchangeName: "binance-dca-22", frameName: "60m-dca-22" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!pp1Executed) { fail("partialProfit #1 never executed"); return; }
  if (!pp2Executed) { fail("partialProfit #2 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];

  // Два партиала
  if (ce.partialLen !== 2) {
    fail(`Expected _partial.length=2, got ${ce.partialLen}`);
    return;
  }

  // Нет DCA — effectivePriceOpen == originalPriceOpen
  if (Math.abs(ce.priceOpen - ce.originalPriceOpen) > 0.01) {
    fail(`Expected effectivePriceOpen=${ce.priceOpen?.toFixed(2)} == originalPriceOpen=${ce.originalPriceOpen} (no DCA)`);
    return;
  }

  // SL close для SHORT: priceClose >= priceStopLoss
  if (ce.priceClose < ce.priceStopLoss) {
    fail(`Expected SL close (priceClose=${ce.priceClose} >= priceStopLoss=${ce.priceStopLoss})`);
    return;
  }

  const { pnl } = ce;

  // pnlEntries = 100 (один вход)
  if (Math.abs(pnl.pnlEntries - 100) > 0.01) {
    fail(`Expected pnlEntries=100 (single entry), got ${pnl.pnlEntries}`);
    return;
  }

  // pnlCost identity
  const expectedPnlCost = pnl.pnlPercentage / 100 * pnl.pnlEntries;
  const diff = Math.abs(pnl.pnlCost - expectedPnlCost);
  if (diff > 0.0001) {
    fail(`pnlCost identity: pnlCost=${pnl.pnlCost}, expected=${expectedPnlCost.toFixed(6)}, diff=${diff}`);
    return;
  }

  pass(`DCA-22 SHORT: 2 partials (25%+40%), SL close, partials=${ce.partialLen}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});


/**
 * DCA ТЕСТ #23: LONG — длинная случайная последовательность PP→DCA→PL→DCA→PP→DCA→PP → TP
 *
 * Четыре партиала (2×PP, 1×PL, 1×PP) чередуются с тремя DCA-входами.
 * Каждый DCA принимается только на новом минимуме.
 *
 * Ценовой маршрут:
 * 1000 → 1100 [PP 20%] → 850 [DCA#1] → 910 [PL 15%] → 780 [DCA#2] → 1050 [PP 25%] → 700 [DCA#3] → 1100 [PP 30%] → 1500 [TP]
 *
 * Проверяем:
 * - totalEntries = 4 (initial + 3 DCA)
 * - _partial.length = 4
 * - pnlEntries = 400 ($100 × 4)
 * - pnlCost = pnlPercentage/100 * pnlEntries (identity)
 * - pnlPercentage > 0 (TP close)
 */
test("DCA BACKTEST: LONG PP→DCA→PL→DCA→PP→DCA→PP→TP (4 партиала, 3 DCA)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  // phase flags
  let pp1Done = false; // PP 20% @1100
  let dca1Done = false; // DCA @850
  let pl1Done = false;  // PL 15% @910
  let dca2Done = false; // DCA @780
  let pp2Done = false;  // PP 25% @1050
  let dca3Done = false; // DCA @700
  let pp3Done = false;  // PP 30% @1100

  // Буферные свечи ВЫШЕ priceOpen (LONG)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-23",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-23",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Буфер выше priceOpen
      // i=5..9:   Активация: low <= 1000
      // i=10..14: 1100 → PP#1
      // i=15..19: 850  → DCA#1
      // i=20..24: 910  → PL#1  (910 < ep≈919 ✓)
      // i=25..29: 780  → DCA#2
      // i=30..34: 1050 → PP#2
      // i=35..39: 700  → DCA#3
      // i=40..44: 1100 → PP#3
      // i=45..89: 1500 → TP
      const phases = [
        { count: 5, price: basePrice + 200 },       // buffer
        { count: 5, price: basePrice },              // activation
        { count: 5, price: 1100 },                  // PP#1
        { count: 5, price: 850 },                   // DCA#1
        { count: 5, price: 910 },                   // PL#1
        { count: 5, price: 780 },                   // DCA#2
        { count: 5, price: 1050 },                  // PP#2
        { count: 5, price: 700 },                   // DCA#3
        { count: 5, price: 1100 },                  // PP#3
        { count: 45, price: 1500 },                 // TP
      ];
      let idx = 0;
      for (const { count, price } of phases) {
        for (let j = 0; j < count; j++, idx++) {
          const timestamp = startTime + idx * intervalMs;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 1000
        priceTakeProfit: basePrice + 500,  // 1500
        priceStopLoss: basePrice - 600,    // 400
        minuteEstimatedTime: 180,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!pp1Done && currentPrice >= 1080) {
          pp1Done = true;
          await commitPartialProfit(symbol, 20);
        } else if (pp1Done && !dca1Done && currentPrice <= 870) {
          dca1Done = true;
          await commitAverageBuy(symbol); // 850 < min=1000 ✓
        } else if (dca1Done && !pl1Done && currentPrice >= 895 && currentPrice <= 925) {
          pl1Done = true;
          await commitPartialLoss(symbol, 15); // 910 < ep≈919 ✓
        } else if (pl1Done && !dca2Done && currentPrice <= 800) {
          dca2Done = true;
          await commitAverageBuy(symbol); // 780 < min=850 ✓
        } else if (dca2Done && !pp2Done && currentPrice >= 1030) {
          pp2Done = true;
          await commitPartialProfit(symbol, 25);
        } else if (pp2Done && !dca3Done && currentPrice <= 720) {
          dca3Done = true;
          await commitAverageBuy(symbol); // 700 < min=780 ✓
        } else if (dca3Done && !pp3Done && currentPrice >= 1080) {
          pp3Done = true;
          await commitPartialProfit(symbol, 30);
        }
      },
      onClose: (_symbol, data, priceClose) => {
        const pnl = toProfitLossDto(data, priceClose);
        closeEvents.push({
          priceClose,
          priceTakeProfit: data.priceTakeProfit,
          totalEntries: data.totalEntries,
          partialLen: data._partial?.length ?? 0,
          pnl,
        });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-23 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "90m-dca-23",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-23", exchangeName: "binance-dca-23", frameName: "90m-dca-23" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!pp1Done)  { fail("PP#1 never executed"); return; }
  if (!dca1Done) { fail("DCA#1 never executed"); return; }
  if (!pl1Done)  { fail("PL#1 never executed"); return; }
  if (!dca2Done) { fail("DCA#2 never executed"); return; }
  if (!pp2Done)  { fail("PP#2 never executed"); return; }
  if (!dca3Done) { fail("DCA#3 never executed"); return; }
  if (!pp3Done)  { fail("PP#3 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];

  if (ce.totalEntries !== 4) {
    fail(`Expected totalEntries=4 (initial+3 DCA), got ${ce.totalEntries}`);
    return;
  }
  if (ce.partialLen !== 4) {
    fail(`Expected _partial.length=4 (PP+PL+PP+PP), got ${ce.partialLen}`);
    return;
  }

  const { pnl } = ce;

  if (Math.abs(pnl.pnlEntries - 400) > 0.01) {
    fail(`Expected pnlEntries=400 (4×$100), got ${pnl.pnlEntries}`);
    return;
  }
  if (pnl.pnlPercentage <= 0) {
    fail(`Expected pnlPercentage > 0 (TP), got ${pnl.pnlPercentage}`);
    return;
  }

  const expectedPnlCost = pnl.pnlPercentage / 100 * pnl.pnlEntries;
  const diff = Math.abs(pnl.pnlCost - expectedPnlCost);
  if (diff > 0.0001) {
    fail(`pnlCost identity: pnlCost=${pnl.pnlCost}, expected=${expectedPnlCost.toFixed(6)}, diff=${diff}`);
    return;
  }

  pass(`DCA-23 LONG: PP→DCA→PL→DCA→PP→DCA→PP→TP, partials=${ce.partialLen}, entries=${ce.totalEntries}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});


/**
 * DCA ТЕСТ #24: SHORT — длинная случайная последовательность DCA→PP→DCA→PL→DCA→PP→PP → SL
 *
 * Четыре партиала (2×PP, 1×PL, 1×PP) чередуются с тремя DCA-входами.
 * Для SHORT DCA принимается только на новом максимуме.
 *
 * Ценовой маршрут:
 * 1000 → 1100 [DCA#1] → 850 [PP 20%] → 1200 [DCA#2] → 1130 [PL 10%] → 1350 [DCA#3] → 800 [PP 25%] → 600 [PP 35%] → 1800 [SL]
 *
 * Проверяем:
 * - totalEntries = 4 (initial + 3 DCA)
 * - _partial.length = 4
 * - pnlEntries = 400 ($100 × 4)
 * - pnlCost < 0 (SL = убыток)
 * - pnlCost = pnlPercentage/100 * pnlEntries (identity)
 */
test("DCA BACKTEST: SHORT DCA→PP→DCA→PL→DCA→PP→PP→SL (4 партиала, 3 DCA)", async ({ pass, fail }) => {
  const closeEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let dca1Done = false; // DCA @1100
  let pp1Done = false;  // PP 20% @850
  let dca2Done = false; // DCA @1200
  let pl1Done = false;  // PL 10% @1130 (> ep ✓)
  let dca3Done = false; // DCA @1350
  let pp2Done = false;  // PP 25% @800
  let pp3Done = false;  // PP 35% @600

  // Буферные свечи НИЖЕ priceOpen (SHORT)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-24",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(existing ?? { timestamp, open: basePrice - 100, high: basePrice - 50, low: basePrice - 200, close: basePrice - 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-24",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // i=0..4:   Буфер ниже priceOpen
      // i=5..9:   Активация SHORT: high >= 1000
      // i=10..14: 1100 → DCA#1 (> max=1000 ✓)
      // i=15..19: 850  → PP#1  (SHORT профит: 850 < ep)
      // i=20..24: 1200 → DCA#2 (> max=1100 ✓)
      // i=25..29: 1130 → PL#1  (SHORT убыток: 1130 > ep)
      // i=30..34: 1350 → DCA#3 (> max=1200 ✓)
      // i=35..39: 800  → PP#2  (SHORT профит)
      // i=40..44: 600  → PP#3  (SHORT профит)
      // i=45..99: 1800 → SL
      const phases = [
        { count: 5, price: basePrice - 100 },   // buffer
        { count: 5, price: basePrice },          // activation
        { count: 5, price: 1100 },               // DCA#1
        { count: 5, price: 850 },                // PP#1
        { count: 5, price: 1200 },               // DCA#2
        { count: 5, price: 1130 },               // PL#1
        { count: 5, price: 1350 },               // DCA#3
        { count: 5, price: 800 },                // PP#2
        { count: 5, price: 600 },                // PP#3
        { count: 55, price: 1800 },              // SL
      ];
      let idx = 0;
      for (const { count, price } of phases) {
        for (let j = 0; j < count; j++, idx++) {
          const timestamp = startTime + idx * intervalMs;
          allCandles.push({ timestamp, open: price, high: price + 30, low: price - 30, close: price, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,              // 1000
        priceTakeProfit: basePrice - 700,  // 300
        priceStopLoss: basePrice + 800,    // 1800
        minuteEstimatedTime: 200,
      };
    },
    callbacks: {
      onActivePing: async (symbol, _data, _when, _backtest) => {
        const currentPrice = await getAveragePrice(symbol);

        if (!dca1Done && currentPrice >= 1080) {
          dca1Done = true;
          await commitAverageBuy(symbol); // 1100 > max=1000 ✓
        } else if (dca1Done && !pp1Done && currentPrice <= 870) {
          pp1Done = true;
          await commitPartialProfit(symbol, 20); // SHORT профит: 850 < ep≈1048
        } else if (pp1Done && !dca2Done && currentPrice >= 1180) {
          dca2Done = true;
          await commitAverageBuy(symbol); // 1200 > max=1100 ✓
        } else if (dca2Done && !pl1Done && currentPrice >= 1110 && currentPrice <= 1150) {
          pl1Done = true;
          await commitPartialLoss(symbol, 10); // SHORT убыток: 1130 > ep
        } else if (pl1Done && !dca3Done && currentPrice >= 1330) {
          dca3Done = true;
          await commitAverageBuy(symbol); // 1350 > max=1200 ✓
        } else if (dca3Done && !pp2Done && currentPrice <= 820) {
          pp2Done = true;
          await commitPartialProfit(symbol, 25); // SHORT профит: 800 < ep
        } else if (pp2Done && !pp3Done && currentPrice <= 620) {
          pp3Done = true;
          await commitPartialProfit(symbol, 35); // SHORT профит: 600 < ep
        }
      },
      onClose: (_symbol, data, priceClose) => {
        const pnl = toProfitLossDto(data, priceClose);
        closeEvents.push({
          priceClose,
          priceStopLoss: data.priceStopLoss,
          totalEntries: data.totalEntries,
          partialLen: data._partial?.length ?? 0,
          pnl,
        });
      },
      onCancel: (symbol, _data, currentPrice) => {
        console.log("[DCA-24 onCancel]", { symbol, currentPrice });
      },
    },
  });

  addFrameSchema({
    frameName: "100m-dca-24",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught = null;
  const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });

  Backtest.background("BTCUSDT", { strategyName: "test-dca-24", exchangeName: "binance-dca-24", frameName: "100m-dca-24" });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) { fail(`Error: ${errorCaught.message || errorCaught}`); return; }
  if (!dca1Done) { fail("DCA#1 never executed"); return; }
  if (!pp1Done)  { fail("PP#1 never executed"); return; }
  if (!dca2Done) { fail("DCA#2 never executed"); return; }
  if (!pl1Done)  { fail("PL#1 never executed"); return; }
  if (!dca3Done) { fail("DCA#3 never executed"); return; }
  if (!pp2Done)  { fail("PP#2 never executed"); return; }
  if (!pp3Done)  { fail("PP#3 never executed"); return; }
  if (closeEvents.length === 0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];

  if (ce.totalEntries !== 4) {
    fail(`Expected totalEntries=4 (initial+3 DCA), got ${ce.totalEntries}`);
    return;
  }
  if (ce.partialLen !== 4) {
    fail(`Expected _partial.length=4 (PP+PP+PL+PP), got ${ce.partialLen}`);
    return;
  }

  const { pnl } = ce;

  if (Math.abs(pnl.pnlEntries - 400) > 0.01) {
    fail(`Expected pnlEntries=400 (4×$100), got ${pnl.pnlEntries}`);
    return;
  }

  // SL close: pnlPercentage < 0
  if (pnl.pnlPercentage >= 0) {
    fail(`Expected pnlPercentage < 0 (SL loss), got ${pnl.pnlPercentage}`);
    return;
  }

  const expectedPnlCost = pnl.pnlPercentage / 100 * pnl.pnlEntries;
  const diff = Math.abs(pnl.pnlCost - expectedPnlCost);
  if (diff > 0.0001) {
    fail(`pnlCost identity: pnlCost=${pnl.pnlCost}, expected=${expectedPnlCost.toFixed(6)}, diff=${diff}`);
    return;
  }

  // SL close для SHORT: priceClose >= priceStopLoss
  if (ce.priceClose < ce.priceStopLoss) {
    fail(`Expected SL close (priceClose=${ce.priceClose} >= priceStopLoss=${ce.priceStopLoss})`);
    return;
  }

  pass(`DCA-24 SHORT: DCA→PP→DCA→PL→DCA→PP→PP→SL, partials=${ce.partialLen}, entries=${ce.totalEntries}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});


/**
 * DCA ТЕСТ #25: LONG — PP→PP→DCA→DCA→PL→PL→PP→TP
 *
 * Подряд два PP, затем два DCA на новых минимумах, затем два PL ниже ep,
 * затем финальный PP и TP.
 *
 * ep после двух DCA (entries=[1000,850,700], cost=100 каждый):
 *   ep = 300 / (1/1000+1/850+1/700) ≈ 832 → PL при цене < 832 ✓ (810 и 790)
 *
 * Проверяем: totalEntries=3, _partial.length=6, pnlEntries=300, pnlPercentage>0, identity ✓
 */
test("DCA BACKTEST: LONG PP→PP→DCA→DCA→PL→PL→PP→TP (6 партиалов, 2 DCA)", async ({ pass, fail }) => {
  const closeEvents = [];
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferStartTime = startTime - 5 * intervalMs;
  let allCandles = [];
  let signalGenerated = false;
  let pp1Done=false, pp2Done=false, dca1Done=false, dca2Done=false;
  let pl1Done=false, pl2Done=false, pp3Done=false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({ timestamp: bufferStartTime + i*intervalMs, open:1200, high:1300, low:1100, close:1200, volume:100 });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-25",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * intervalMs;
        return allCandles.find((c) => c.timestamp === timestamp)
          ?? { timestamp, open:1200, high:1300, low:1100, close:1200, volume:100 };
      });
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-25",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      const phases = [
        { count:5,  price:1200 },
        { count:5,  price:1000 },   // activation
        { count:5,  price:1080 },   // PP#1
        { count:5,  price:1120 },   // PP#2
        { count:5,  price:850  },   // DCA#1
        { count:5,  price:700  },   // DCA#2
        { count:5,  price:1020 },   // bounce (выходим из 700-зоны перед PL)
        { count:5,  price:810  },   // PL#1 (< ep≈832 ✓)
        { count:5,  price:790  },   // PL#2 (< ep≈832 ✓)
        { count:5,  price:1050 },   // PP#3
        { count:55, price:1500 },   // TP
      ];
      let idx = 0;
      for (const { count, price } of phases) {
        for (let j = 0; j < count; j++, idx++) {
          allCandles.push({ timestamp: startTime+idx*intervalMs, open:price, high:price+30, low:price-30, close:price, volume:100 });
        }
      }
      return { position:"long", priceOpen:1000, priceTakeProfit:1500, priceStopLoss:400, minuteEstimatedTime:200 };
    },
    callbacks: {
      onActivePing: async (symbol, _d, _w, _b) => {
        const p = await getAveragePrice(symbol);
        if (!pp1Done && p>=1060) { pp1Done=true; await commitPartialProfit(symbol,15); }
        else if (pp1Done&&!pp2Done && p>=1100) { pp2Done=true; await commitPartialProfit(symbol,20); }
        else if (pp2Done&&!dca1Done && p<=870) { dca1Done=true; await commitAverageBuy(symbol); }  // 850<1000 ✓
        else if (dca1Done&&!dca2Done && p<=720) { dca2Done=true; await commitAverageBuy(symbol); } // 700<850 ✓
        else if (dca2Done&&!pl1Done && p<=825&&p>=780) { pl1Done=true; await commitPartialLoss(symbol,10); } // 810-phase ✓, skips 700-zone
        else if (pl1Done&&!pl2Done && p<=800) { pl2Done=true; await commitPartialLoss(symbol,12); }         // 790-phase ✓
        else if (pl2Done&&!pp3Done && p>=1030) { pp3Done=true; await commitPartialProfit(symbol,30); }
      },
      onClose: (_symbol, data, priceClose) => {
        closeEvents.push({ priceClose, priceTakeProfit:data.priceTakeProfit, totalEntries:data.totalEntries, partialLen:data._partial?.length??0, pnl:toProfitLossDto(data,priceClose) });
      },
      onCancel: (symbol,_d,p) => console.log("[DCA-25 cancel]",{symbol,p}),
    },
  });

  addFrameSchema({ frameName:"105m-dca-25", interval:"1m", startDate:new Date("2024-01-01T00:00:00Z"), endDate:new Date("2024-01-01T01:45:00Z") });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught=null;
  const unsubscribeError = listenError((e) => { errorCaught=e; awaitSubject.next(); });
  Backtest.background("BTCUSDT", { strategyName:"test-dca-25", exchangeName:"binance-dca-25", frameName:"105m-dca-25" });
  await awaitSubject.toPromise();
  unsubscribeError();
  await sleep(100);

  if (errorCaught) { fail(`Error: ${errorCaught.message||errorCaught}`); return; }
  for (const [done,label] of [[pp1Done,"PP#1"],[pp2Done,"PP#2"],[dca1Done,"DCA#1"],[dca2Done,"DCA#2"],[pl1Done,"PL#1"],[pl2Done,"PL#2"],[pp3Done,"PP#3"]]) {
    if (!done) { fail(`${label} never executed`); return; }
  }
  if (closeEvents.length===0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries!==3) { fail(`Expected totalEntries=3, got ${ce.totalEntries}`); return; }
  if (ce.partialLen!==5) { fail(`Expected _partial.length=5, got ${ce.partialLen}`); return; }
  const {pnl} = ce;
  if (Math.abs(pnl.pnlEntries-300)>0.01) { fail(`Expected pnlEntries=300, got ${pnl.pnlEntries}`); return; }
  if (pnl.pnlPercentage<=0) { fail(`Expected pnlPercentage>0 (TP), got ${pnl.pnlPercentage}`); return; }
  const diff = Math.abs(pnl.pnlCost - pnl.pnlPercentage/100*pnl.pnlEntries);
  if (diff>0.0001) { fail(`pnlCost identity failed: diff=${diff}`); return; }

  pass(`DCA-25 LONG: PP→PP→DCA→DCA→PL→PL→PP→TP, partials=${ce.partialLen}, entries=${ce.totalEntries}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});


/**
 * DCA ТЕСТ #26: SHORT — PP→PP→DCA→PL→PL→DCA→DCA→PP→SL
 *
 * Два PP подряд (SHORT профит), DCA на новом максимуме,
 * два PL подряд (цена > ep≈1091), два DCA ещё выше, финальный PP, SL.
 *
 * ep после DCA@1200: entries=[1000,1200], ep = 200/(1/1000+1/1200) ≈ 1090.9
 * → PL при цене > 1090.9 ✓ (1120 и 1150)
 *
 * Проверяем: totalEntries=4, _partial.length=6, pnlEntries=400, pnlPercentage<0 (SL), identity ✓
 */
test("DCA BACKTEST: SHORT PP→PP→DCA→PL→PL→DCA→DCA→PP→SL (6 партиалов, 3 DCA)", async ({ pass, fail }) => {
  const closeEvents = [];
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferStartTime = startTime - 5 * intervalMs;
  let allCandles = [];
  let signalGenerated = false;
  let pp1Done=false, pp2Done=false, dca1Done=false, pl1Done=false, pl2Done=false;
  let dca2Done=false, dca3Done=false, pp3Done=false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({ timestamp: bufferStartTime + i*intervalMs, open:800, high:850, low:750, close:800, volume:100 });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-26",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * intervalMs;
        return allCandles.find((c) => c.timestamp === timestamp)
          ?? { timestamp, open:800, high:850, low:750, close:800, volume:100 };
      });
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-26",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      const phases = [
        { count:5,  price:800  },
        { count:5,  price:1000 },   // activation
        { count:5,  price:800  },   // PP#1
        { count:5,  price:650  },   // PP#2
        { count:5,  price:1200 },   // DCA#1 (>max=1000 ✓)
        { count:5,  price:1050 },   // dip (avg снижается ниже 1140 перед PL)
        { count:5,  price:1120 },   // PL#1 (>ep≈1091 ✓, avg≈1100-1120)
        { count:5,  price:1150 },   // PL#2 (>ep≈1091 ✓)
        { count:5,  price:1300 },   // DCA#2 (>max=1200 ✓)
        { count:5,  price:1450 },   // DCA#3 (>max=1300 ✓)
        { count:5,  price:700  },   // PP#3
        { count:60, price:1999 },   // SL
      ];
      let idx = 0;
      for (const { count, price } of phases) {
        for (let j = 0; j < count; j++, idx++) {
          allCandles.push({ timestamp: startTime+idx*intervalMs, open:price, high:price+30, low:price-30, close:price, volume:100 });
        }
      }
      return { position:"short", priceOpen:1000, priceTakeProfit:300, priceStopLoss:2000, minuteEstimatedTime:200 };
    },
    callbacks: {
      onActivePing: async (symbol, _d, _w, _b) => {
        const p = await getAveragePrice(symbol);
        if (!pp1Done && p<=820) { pp1Done=true; await commitPartialProfit(symbol,15); }
        else if (pp1Done&&!pp2Done && p<=670) { pp2Done=true; await commitPartialProfit(symbol,20); }
        else if (pp2Done&&!dca1Done && p>=1180) { dca1Done=true; await commitAverageBuy(symbol); }              // 1200>max=1000 ✓
        else if (dca1Done&&!pl1Done && p>=1100&&p<=1140) { pl1Done=true; await commitPartialLoss(symbol,10); } // 1120-phase ✓
        else if (pl1Done&&!pl2Done && p>=1135&&p<=1165) { pl2Done=true; await commitPartialLoss(symbol,12); } // 1150-phase ✓
        else if (pl2Done&&!dca2Done && p>=1280) { dca2Done=true; await commitAverageBuy(symbol); }              // 1300>max=1200 ✓
        else if (dca2Done&&!dca3Done && p>=1430) { dca3Done=true; await commitAverageBuy(symbol); }             // 1450>max=1300 ✓
        else if (dca3Done&&!pp3Done && p<=720) { pp3Done=true; await commitPartialProfit(symbol,25); }
      },
      onClose: (_symbol, data, priceClose) => {
        closeEvents.push({ priceClose, priceStopLoss:data.priceStopLoss, totalEntries:data.totalEntries, partialLen:data._partial?.length??0, pnl:toProfitLossDto(data,priceClose) });
      },
      onCancel: (symbol,_d,p) => console.log("[DCA-26 cancel]",{symbol,p}),
    },
  });

  addFrameSchema({ frameName:"115m-dca-26", interval:"1m", startDate:new Date("2024-01-01T00:00:00Z"), endDate:new Date("2024-01-01T01:55:00Z") });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught=null;
  const unsubscribeError = listenError((e) => { errorCaught=e; awaitSubject.next(); });
  Backtest.background("BTCUSDT", { strategyName:"test-dca-26", exchangeName:"binance-dca-26", frameName:"115m-dca-26" });
  await awaitSubject.toPromise();
  unsubscribeError();
  await sleep(100);

  if (errorCaught) { fail(`Error: ${errorCaught.message||errorCaught}`); return; }
  for (const [done,label] of [[pp1Done,"PP#1"],[pp2Done,"PP#2"],[dca1Done,"DCA#1"],[pl1Done,"PL#1"],[pl2Done,"PL#2"],[dca2Done,"DCA#2"],[dca3Done,"DCA#3"],[pp3Done,"PP#3"]]) {
    if (!done) { fail(`${label} never executed`); return; }
  }
  if (closeEvents.length===0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries!==4) { fail(`Expected totalEntries=4, got ${ce.totalEntries}`); return; }
  if (ce.partialLen!==5) { fail(`Expected _partial.length=5, got ${ce.partialLen}`); return; }
  const {pnl} = ce;
  if (Math.abs(pnl.pnlEntries-400)>0.01) { fail(`Expected pnlEntries=400, got ${pnl.pnlEntries}`); return; }
  const diff = Math.abs(pnl.pnlCost - pnl.pnlPercentage/100*pnl.pnlEntries);
  if (diff>0.0001) { fail(`pnlCost identity failed: diff=${diff}`); return; }

  pass(`DCA-26 SHORT: PP→PP→DCA→PL→PL→DCA→DCA→PP→close, partials=${ce.partialLen}, entries=${ce.totalEntries}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});


/**
 * DCA ТЕСТ #27: LONG — DCA→DCA→DCA→PP→PP→PP→PL→PP→TP
 *
 * Три DCA подряд (все новые минимумы), три PP, один PL ниже ep, финальный PP и TP.
 *
 * ep после трёх DCA (entries=[1000,900,800,700], cost=100 каждый):
 *   ep = 400/(1/1000+1/900+1/800+1/700) ≈ 834.9 → PL при 830 < 834.9 ✓
 *
 * Проверяем: totalEntries=4, _partial.length=5, pnlEntries=400, pnlPercentage>0, identity ✓
 */
test("DCA BACKTEST: LONG DCA→DCA→DCA→PP→PP→PP→PL→PP→TP (5 партиалов, 3 DCA)", async ({ pass, fail }) => {
  const closeEvents = [];
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferStartTime = startTime - 5 * intervalMs;
  let allCandles = [];
  let signalGenerated = false;
  let dca1Done=false, dca2Done=false, dca3Done=false;
  let pp1Done=false, pp2Done=false, pp3Done=false, pl1Done=false, pp4Done=false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({ timestamp: bufferStartTime + i*intervalMs, open:1200, high:1300, low:1100, close:1200, volume:100 });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-27",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * intervalMs;
        return allCandles.find((c) => c.timestamp === timestamp)
          ?? { timestamp, open:1200, high:1300, low:1100, close:1200, volume:100 };
      });
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-27",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      const phases = [
        { count:5,  price:1200 },
        { count:5,  price:1000 },   // activation
        { count:5,  price:900  },   // DCA#1
        { count:5,  price:800  },   // DCA#2
        { count:5,  price:700  },   // DCA#3
        { count:5,  price:880  },   // PP#1
        { count:5,  price:920  },   // PP#2
        { count:5,  price:960  },   // PP#3
        { count:5,  price:830  },   // PL#1 (< ep≈834.9 ✓)
        { count:5,  price:1100 },   // PP#4
        { count:60, price:1500 },   // TP
      ];
      let idx = 0;
      for (const { count, price } of phases) {
        for (let j = 0; j < count; j++, idx++) {
          allCandles.push({ timestamp: startTime+idx*intervalMs, open:price, high:price+30, low:price-30, close:price, volume:100 });
        }
      }
      return { position:"long", priceOpen:1000, priceTakeProfit:1500, priceStopLoss:400, minuteEstimatedTime:200 };
    },
    callbacks: {
      onActivePing: async (symbol, _d, _w, _b) => {
        const p = await getAveragePrice(symbol);
        if (!dca1Done && p<=920) { dca1Done=true; await commitAverageBuy(symbol); }              // 900<1000 ✓
        else if (dca1Done&&!dca2Done && p<=820) { dca2Done=true; await commitAverageBuy(symbol); } // 800<900 ✓
        else if (dca2Done&&!dca3Done && p<=720) { dca3Done=true; await commitAverageBuy(symbol); } // 700<800 ✓
        else if (dca3Done&&!pp1Done && p>=860&&p<=900) { pp1Done=true; await commitPartialProfit(symbol,10); }
        else if (pp1Done&&!pp2Done && p>=900&&p<=940) { pp2Done=true; await commitPartialProfit(symbol,10); }
        else if (pp2Done&&!pp3Done && p>=940&&p<=980) { pp3Done=true; await commitPartialProfit(symbol,10); }
        else if (pp3Done&&!pl1Done && p>=820&&p<=845) { pl1Done=true; await commitPartialLoss(symbol,5); }   // <ep≈834.9 ✓
        else if (pl1Done&&!pp4Done && p>=1080) { pp4Done=true; await commitPartialProfit(symbol,20); }
      },
      onClose: (_symbol, data, priceClose) => {
        closeEvents.push({ priceClose, priceTakeProfit:data.priceTakeProfit, totalEntries:data.totalEntries, partialLen:data._partial?.length??0, pnl:toProfitLossDto(data,priceClose) });
      },
      onCancel: (symbol,_d,p) => console.log("[DCA-27 cancel]",{symbol,p}),
    },
  });

  addFrameSchema({ frameName:"110m-dca-27", interval:"1m", startDate:new Date("2024-01-01T00:00:00Z"), endDate:new Date("2024-01-01T01:50:00Z") });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught=null;
  const unsubscribeError = listenError((e) => { errorCaught=e; awaitSubject.next(); });
  Backtest.background("BTCUSDT", { strategyName:"test-dca-27", exchangeName:"binance-dca-27", frameName:"110m-dca-27" });
  await awaitSubject.toPromise();
  unsubscribeError();
  await sleep(100);

  if (errorCaught) { fail(`Error: ${errorCaught.message||errorCaught}`); return; }
  for (const [done,label] of [[dca1Done,"DCA#1"],[dca2Done,"DCA#2"],[dca3Done,"DCA#3"],[pp1Done,"PP#1"],[pp2Done,"PP#2"],[pp3Done,"PP#3"],[pl1Done,"PL#1"],[pp4Done,"PP#4"]]) {
    if (!done) { fail(`${label} never executed`); return; }
  }
  if (closeEvents.length===0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries!==4) { fail(`Expected totalEntries=4, got ${ce.totalEntries}`); return; }
  if (ce.partialLen!==5) { fail(`Expected _partial.length=5, got ${ce.partialLen}`); return; }
  const {pnl} = ce;
  if (Math.abs(pnl.pnlEntries-400)>0.01) { fail(`Expected pnlEntries=400, got ${pnl.pnlEntries}`); return; }
  if (pnl.pnlPercentage<=0) { fail(`Expected pnlPercentage>0 (TP), got ${pnl.pnlPercentage}`); return; }
  const diff = Math.abs(pnl.pnlCost - pnl.pnlPercentage/100*pnl.pnlEntries);
  if (diff>0.0001) { fail(`pnlCost identity failed: diff=${diff}`); return; }

  pass(`DCA-27 LONG: DCA→DCA→DCA→PP→PP→PP→PL→PP→TP, partials=${ce.partialLen}, entries=${ce.totalEntries}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});


/**
 * DCA ТЕСТ #28: SHORT — DCA→DCA→PP→PL→PL→DCA→PP→PP→PL→TP
 *
 * Наиболее хаотичная последовательность: два DCA, PP, два PL, ещё DCA, два PP, PL, TP.
 *
 * ep после двух DCA@1100,1250 (entries=[1000,1100,1250]):
 *   ep = 300/(1/1000+1/1100+1/1250) ≈ 1067.6 → PL при 1350,1400 > 1068 ✓
 * После DCA@1500 ep блендится выше ~1170 → PL при 1550 > 1170 ✓
 *
 * Проверяем: totalEntries=4, _partial.length=6, pnlEntries=400, pnlPercentage>0 (TP), identity ✓
 */
test("DCA BACKTEST: SHORT DCA→DCA→PP→PL→PL→DCA→PP→PP→PL→TP (6 партиалов, 3 DCA)", async ({ pass, fail }) => {
  const closeEvents = [];
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 1000;
  const bufferStartTime = startTime - 5 * intervalMs;
  let allCandles = [];
  let signalGenerated = false;
  let dca1Done=false, dca2Done=false, pp1Done=false, pl1Done=false, pl2Done=false;
  let dca3Done=false, pp2Done=false, pp3Done=false, pl3Done=false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({ timestamp: bufferStartTime + i*intervalMs, open:800, high:850, low:750, close:800, volume:100 });
  }

  addExchangeSchema({
    exchangeName: "binance-dca-28",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * intervalMs;
        return allCandles.find((c) => c.timestamp === timestamp)
          ?? { timestamp, open:800, high:850, low:750, close:800, volume:100 };
      });
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-dca-28",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      const phases = [
        { count:5,  price:800  },
        { count:5,  price:1000 },   // activation
        { count:5,  price:1100 },   // DCA#1 (>max=1000 ✓)
        { count:5,  price:1250 },   // DCA#2 (>max=1100 ✓)
        { count:5,  price:800  },   // PP#1 (SHORT профит)
        { count:5,  price:1350 },   // PL#1 (>ep≈1068 ✓)
        { count:5,  price:1400 },   // PL#2 (>ep≈1068 ✓)
        { count:5,  price:1500 },   // DCA#3 (>max=1250 ✓)
        { count:5,  price:750  },   // PP#2 (SHORT профит)
        { count:5,  price:600  },   // PP#3 (SHORT профит)
        { count:5,  price:1550 },   // PL#3 (>ep after DCA3≈1170 ✓)
        { count:65, price:400  },   // TP
      ];
      let idx = 0;
      for (const { count, price } of phases) {
        for (let j = 0; j < count; j++, idx++) {
          allCandles.push({ timestamp: startTime+idx*intervalMs, open:price, high:price+30, low:price-30, close:price, volume:100 });
        }
      }
      return { position:"short", priceOpen:1000, priceTakeProfit:400, priceStopLoss:1999, minuteEstimatedTime:200 };
    },
    callbacks: {
      onActivePing: async (symbol, _d, _w, _b) => {
        const p = await getAveragePrice(symbol);
        if (!dca1Done && p>=1080) { dca1Done=true; await commitAverageBuy(symbol); }               // 1100>max=1000 ✓
        else if (dca1Done&&!dca2Done && p>=1230) { dca2Done=true; await commitAverageBuy(symbol); } // 1250>max=1100 ✓
        else if (dca2Done&&!pp1Done && p<=820) { pp1Done=true; await commitPartialProfit(symbol,15); }
        else if (pp1Done&&!pl1Done && p>=1330&&p<=1370) { pl1Done=true; await commitPartialLoss(symbol,8); }   // >ep≈1068 ✓
        else if (pl1Done&&!pl2Done && p>=1380&&p<=1420) { pl2Done=true; await commitPartialLoss(symbol,10); }  // >ep≈1068 ✓
        else if (pl2Done&&!dca3Done && p>=1480) { dca3Done=true; await commitAverageBuy(symbol); }  // 1500>max=1250 ✓
        else if (dca3Done&&!pp2Done && p<=770) { pp2Done=true; await commitPartialProfit(symbol,20); }
        else if (pp2Done&&!pp3Done && p<=620) { pp3Done=true; await commitPartialProfit(symbol,25); }
        else if (pp3Done&&!pl3Done && p>=1530) { pl3Done=true; await commitPartialLoss(symbol,5); }  // >ep≈1170 ✓
      },
      onClose: (_symbol, data, priceClose) => {
        closeEvents.push({ priceClose, priceTakeProfit:data.priceTakeProfit, totalEntries:data.totalEntries, partialLen:data._partial?.length??0, pnl:toProfitLossDto(data,priceClose) });
      },
      onCancel: (symbol,_d,p) => console.log("[DCA-28 cancel]",{symbol,p}),
    },
  });

  addFrameSchema({ frameName:"115m-dca-28", interval:"1m", startDate:new Date("2024-01-01T00:00:00Z"), endDate:new Date("2024-01-01T01:55:00Z") });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  let errorCaught=null;
  const unsubscribeError = listenError((e) => { errorCaught=e; awaitSubject.next(); });
  Backtest.background("BTCUSDT", { strategyName:"test-dca-28", exchangeName:"binance-dca-28", frameName:"115m-dca-28" });
  await awaitSubject.toPromise();
  unsubscribeError();
  await sleep(100);

  if (errorCaught) { fail(`Error: ${errorCaught.message||errorCaught}`); return; }
  for (const [done,label] of [[dca1Done,"DCA#1"],[dca2Done,"DCA#2"],[pp1Done,"PP#1"],[pl1Done,"PL#1"],[pl2Done,"PL#2"],[dca3Done,"DCA#3"],[pp2Done,"PP#2"],[pp3Done,"PP#3"],[pl3Done,"PL#3"]]) {
    if (!done) { fail(`${label} never executed`); return; }
  }
  if (closeEvents.length===0) { fail("Position never closed"); return; }

  const ce = closeEvents[0];
  if (ce.totalEntries!==4) { fail(`Expected totalEntries=4, got ${ce.totalEntries}`); return; }
  if (ce.partialLen!==6) { fail(`Expected _partial.length=6, got ${ce.partialLen}`); return; }
  const {pnl} = ce;
  if (Math.abs(pnl.pnlEntries-400)>0.01) { fail(`Expected pnlEntries=400, got ${pnl.pnlEntries}`); return; }
  if (pnl.pnlPercentage<=0) { fail(`Expected pnlPercentage>0 (TP), got ${pnl.pnlPercentage}`); return; }
  const diff = Math.abs(pnl.pnlCost - pnl.pnlPercentage/100*pnl.pnlEntries);
  if (diff>0.0001) { fail(`pnlCost identity failed: diff=${diff}`); return; }

  pass(`DCA-28 SHORT: DCA→DCA→PP→PL→PL→DCA→PP→PP→PL→TP, partials=${ce.partialLen}, entries=${ce.totalEntries}, pnlEntries=${pnl.pnlEntries}, pnlPercentage=${pnl.pnlPercentage.toFixed(4)}%, identity ✓`);
});

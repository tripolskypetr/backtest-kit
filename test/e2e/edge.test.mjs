import { test } from "worker-testbed";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * EDGE CASE ТЕСТ #1: Scheduled SHORT отменяется по SL ДО активации
 *
 * Сценарий:
 * - SHORT: priceOpen=42000, StopLoss=44000
 * - Цена РАСТЁТ резко от 40000 → 45000, МИНУЯ priceOpen!
 * - Цена НЕ достигает priceOpen=42000, но достигает SL=44000
 * - КРИТИЧНО: Scheduled сигнал должен ОТМЕНЯТЬСЯ по SL до активации
 */
test("EDGE: Scheduled SHORT cancelled by SL BEFORE activation (price skips priceOpen)", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let cancelledResult = null;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 40000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Initial candles for buffer period (price low at 40000)
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
    exchangeName: "binance-edge-scheduled-short-sl-cancel",
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
    strategyName: "test-edge-scheduled-short-sl-cancel",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Reset candles and set up the scenario
      allCandles = [];

      // Buffer candles (price low at 40000)
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

      // After signal: first 5 candles at low price (scheduled waiting)
      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Первые 5 свечей: цена низкая (40000), scheduled ждет
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else {
          // С 6-й свечи: РЕЗКИЙ РОСТ, МИНУЯ priceOpen=42000!
          // Цена растёт от 40000 сразу до 45000 (выше SL=44000)
          const slPrice = 45000; // Выше SL=44000, НЕ достигает priceOpen=42000
          allCandles.push({
            timestamp,
            open: slPrice,
            high: slPrice + 100,
            low: slPrice - 100,
            close: slPrice,
            volume: 100,
          });
        }
      }

      return {
        position: "short",
        note: "EDGE: scheduled SHORT SL cancellation test",
        priceOpen: 42000,      // НЕ будет достигнут
        priceTakeProfit: 41000,
        priceStopLoss: 44000,   // Будет достигнут БЕЗ активации
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onCancel: (_symbol, data) => {
        cancelledResult = data;
      },
    },
  });

  addFrameSchema({
    frameName: "30m-edge-scheduled-short-sl-cancel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-scheduled-short-sl-cancel",
    exchangeName: "binance-edge-scheduled-short-sl-cancel",
    frameName: "30m-edge-scheduled-short-sl-cancel",
  });

  await awaitSubject.toPromise();

  if (!scheduledResult) {
    fail("CRITICAL: Scheduled SHORT signal was not created");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал НЕ должен быть открыт
  if (openedResult) {
    fail("LOGIC BUG: SHORT signal was OPENED despite price never reaching priceOpen! This violates limit order physics!");
    return;
  }

  // Сигнал должен быть отменен
  if (!cancelledResult) {
    fail("CRITICAL BUG: SHORT signal was not cancelled despite SL being hit before activation! Risk protection failed!");
    return;
  }

  pass(`MONEY SAFE: Scheduled SHORT cancelled by StopLoss BEFORE activation (price rose from 40000 to 45000, skipping priceOpen=42000). Pre-activation SL protection works for SHORT!`);
});


/**
 * EDGE CASE ТЕСТ #2: VWAP расчёт при нулевом volume
 *
 * Сценарий:
 * - Все свечи имеют volume=0 (низколиквидная монета)
 * - getAveragePrice должен использовать fallback (simple average close prices)
 * - КРИТИЧНО: Должен вернуть корректную цену, не сломаться
 */
test("EDGE: getAveragePrice works with zero volume (fallback to simple average)", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Initial candles for buffer period (zero volume)
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 0,  // НУЛЕВОЙ VOLUME!
    });
  }

  addExchangeSchema({
    exchangeName: "binance-edge-zero-volume",
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
            volume: 0,
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
    strategyName: "test-edge-zero-volume",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // КРИТИЧНО: getAveragePrice должен работать с volume=0
      const price = await getAveragePrice("BTCUSDT");

      // Reset candles and set up the scenario
      allCandles = [];

      // Buffer candles (zero volume)
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 0,
        });
      }

      // After signal: scenario with zero volume
      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Первые 5 свечей: volume=0, цена ВЫСОКАЯ (scheduled waiting)
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 0,
          });
        } else if (i >= 5 && i < 10) {
          // Следующие 5: активация (цена падает до priceOpen = 41500)
          const openPrice = price - 500;
          allCandles.push({
            timestamp,
            open: openPrice,
            high: openPrice + 100,
            low: openPrice - 100,
            close: openPrice,
            volume: 0,
          });
        } else {
          // TP достигнут (цена растет выше)
          const tpPrice = price + 1000;
          allCandles.push({
            timestamp,
            open: tpPrice,
            high: tpPrice + 100,
            low: tpPrice - 100,
            close: tpPrice,
            volume: 0,
          });
        }
      }

      return {
        position: "long",
        note: "EDGE: zero volume VWAP test",
        priceOpen: price - 500, // НИЖЕ текущей цены для LONG → scheduled
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 2000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data, priceClose) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-edge-zero-volume",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let finalResult = null;
  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      finalResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-zero-volume",
    exchangeName: "binance-edge-zero-volume",
    frameName: "30m-edge-zero-volume",
  });

  await awaitSubject.toPromise();

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал должен быть создан (getAveragePrice не сломался)
  if (!scheduledResult) {
    fail("EDGE CASE BUG: Signal was NOT scheduled! getAveragePrice failed with zero volume!");
    return;
  }

  if (!openedResult) {
    fail("Signal was NOT opened!");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected close by "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  pass(`EDGE WORKS: getAveragePrice handled zero volume correctly (fallback to simple average). Signal opened and closed by TP. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * EDGE CASE ТЕСТ #3: Очень большой профит (>100%)
 *
 * Сценарий:
 * - LONG: priceOpen=42000, TP=90000 (>100% профит)
 * - КРИТИЧНО: Валидация должна пропустить, позиция должна закрыться с огромным профитом
 */
test("EDGE: Very large profit (>100%) passes validation and yields huge profit", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 43000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Initial candles for buffer period
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
    exchangeName: "binance-edge-huge-profit",
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
    strategyName: "test-edge-huge-profit",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Reset candles and set up the scenario
      allCandles = [];

      // Buffer candles
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

      // After signal: scenario for huge profit
      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Фаза 1: Ждем активации
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 10) {
          // Фаза 2: Активация (цена падает до priceOpen = 42000)
          const openPrice = 42000;
          allCandles.push({
            timestamp,
            open: openPrice,
            high: openPrice + 100,
            low: openPrice - 100,
            close: openPrice,
            volume: 100,
          });
        } else {
          // Фаза 3: TP достигнут (огромный профит >100%)
          const tpPrice = 90000;
          allCandles.push({
            timestamp,
            open: tpPrice,
            high: tpPrice + 100,
            low: tpPrice - 100,
            close: tpPrice,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        note: "EDGE: huge profit test",
        priceOpen: 42000,
        priceTakeProfit: 90000,  // >100% профит!
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data, priceClose) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-edge-huge-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let finalResult = null;
  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      finalResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-huge-profit",
    exchangeName: "binance-edge-huge-profit",
    frameName: "30m-edge-huge-profit",
  });

  await awaitSubject.toPromise();

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал должен пройти валидацию
  if (!scheduledResult) {
    fail("VALIDATION BUG: Signal with >100% profit was rejected!");
    return;
  }

  if (!openedResult) {
    fail("Signal was NOT opened!");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected close by "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: PNL должен быть >100%
  if (finalResult.pnl.pnlPercentage < 100) {
    fail(`Expected PNL >100%, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  const expectedPnl = ((90000 - 42000) / 42000) * 100; // ~114%
  pass(`HUGE PROFIT WORKS: >100% profit signal passed validation. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}% (expected ~${expectedPnl.toFixed(2)}%). Moon landing successful!`);
});


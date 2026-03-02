import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addActionSchema,
  addRiskSchema,
  addWalkerSchema,
  Backtest,
  Walker,
  listenDoneBacktest,
  listenSchedulePing,
  listenError,
  listenWalkerComplete,
  listenSignalBacktest,
  listenBreakevenAvailable,
  listenPartialProfitAvailable,
  listenPartialProfitAvailableOnce,
  listenPartialLossAvailable,
  listenPartialLossAvailableOnce,
  commitTrailingStop,
  commitTrailingTake,
  ActionBase,
  getAveragePrice,
  Schedule,
  Heat,
  Performance,
  Partial,
  getDate,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * TRAILING STOP ТЕСТ #8: Move SL to breakeven using getPendingSignal
 *
 * Сценарий:
 * 1. LONG позиция: entry=100k, originalSL=98k (distance=2%), TP=120k (+20%)
 * 2. Цена растет до 110k (+10%)
 * 3. onPartialProfit срабатывает при revenuePercent >= 50%
 * 4. Используем getPendingSignal() → вычисляем percentShift для безубытка
 * 5. commitTrailingStop(-2%) → newSL=100k (breakeven)
 * 6. Цена откатывает к 100k → SL пробивается → closeReason=stop_loss
 */
test("TRAILING STOP: Move to breakeven using getPendingSignal", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let breakevenApplied = false;

  // Буферные свечи ВЫШЕ priceOpen (чтобы scheduled не активировался раньше startTime)
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 200,
      high: basePrice + 300,
      low: basePrice + 100,
      close: basePrice + 200,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-trailing-breakeven",
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
            open: basePrice + 200,
            high: basePrice + 300,
            low: basePrice + 100,
            close: basePrice + 200,
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
    strategyName: "test-trailing-breakeven",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буфер: выше priceOpen, чтобы scheduled не активировался до фазы активации
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice + 200,
          high: basePrice + 300,
          low: basePrice + 100,
          close: basePrice + 200,
          volume: 100,
        });
      }

      // minuteEstimatedTime=30, фрейм=30 минут
      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1 (0-4): выше priceOpen — ждём
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice + 200,
            high: basePrice + 300,
            low: basePrice + 100,
            close: basePrice + 200,
            volume: 100,
          });
        }
        // Фаза 2 (5-9): Активация — low <= priceOpen
        else if (i < 10) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        }
        // Фаза 3 (10-19): Рост до +10% (110k) — onPartialProfit должен сработать
        else if (i < 20) {
          const price = basePrice + 10000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
        // Фаза 4 (20-29): Откат к breakeven (100k) — пробьёт новый SL=100k
        else {
          const price = basePrice;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 200,  // low=99800, пробивает SL=100k
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 100000
        priceTakeProfit: basePrice + 20000, // 120000 (+20%)
        priceStopLoss: basePrice - 2000,    // 98000 (-2%)
        minuteEstimatedTime: 30,
      };
    },
    callbacks: {
      onPartialProfit: async (_symbol, _signal, _currentPrice, revenuePercent, _backtest) => {
        // Применяем breakeven при достижении 50% пути к TP
        if (!breakevenApplied && revenuePercent >= 50) {
          const pendingSignal = await Backtest.getPendingSignal("BTCUSDT", {
            strategyName: "test-trailing-breakeven",
            exchangeName: "binance-trailing-breakeven",
            frameName: "30m-trailing-breakeven",
          });

          if (!pendingSignal) return;

          const currentSlDistance = Math.abs((pendingSignal.priceOpen - pendingSignal.priceStopLoss) / pendingSignal.priceOpen * 100);
          // percentShift = 0% - 2% = -2% → SL переедет на entry (breakeven)
          const percentShift = -currentSlDistance;

          await commitTrailingStop("BTCUSDT", percentShift, _currentPrice);
          breakevenApplied = true;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "30m-trailing-breakeven",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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
    strategyName: "test-trailing-breakeven",
    exchangeName: "binance-trailing-breakeven",
    frameName: "30m-trailing-breakeven",
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

  if (closedResult.closeReason !== "stop_loss") {
    fail(`Expected closeReason="stop_loss", got "${closedResult.closeReason}"`);
    return;
  }

  if (closedResult.pnl.pnlPercentage < -0.5 || closedResult.pnl.pnlPercentage > 0.2) {
    fail(`PNL should be close to 0% (breakeven with fees), got ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`TRAILING STOP BREAKEVEN WORKS: SL moved to entry, closed by stop_loss with PNL ${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
});


// PARTIAL FUNCTION: partialLoss() closes 40% of LONG position
test("PARTIAL FUNCTION: partialLoss() closes 40% of LONG position", async ({ pass, fail }) => {
  const { commitPartialLoss } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialCalled = false;

  // Буферные свечи ВЫШЕ priceOpen
  for (let i = 0; i < bufferMinutes; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice + 200,
      high: basePrice + 300,
      low: basePrice + 100,
      close: basePrice + 200,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-function-partial-loss",
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
            open: basePrice + 200,
            high: basePrice + 300,
            low: basePrice + 100,
            close: basePrice + 200,
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
    strategyName: "test-function-partial-loss",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буфер: выше priceOpen
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice + 200,
          high: basePrice + 300,
          low: basePrice + 100,
          close: basePrice + 200,
          volume: 100,
        });
      }

      // minuteEstimatedTime=60, фрейм=60 минут
      // SL = basePrice - 15000 (15% от entry — в пределах CC_MAX_STOPLOSS_DISTANCE_PERCENT=20)
      // TP = basePrice + 40000 (+40%)
      // Цена падает до ~88k → это 80% пути к SL=85k → revenuePercent >= 20 → вызываем partialLoss(40%)
      for (let i = 0; i < 60; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1 (0-4): выше priceOpen — ждём активации
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice + 200,
            high: basePrice + 300,
            low: basePrice + 100,
            close: basePrice + 200,
            volume: 100,
          });
        }
        // Фаза 2 (5-9): Активация — low <= priceOpen
        else if (i < 10) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        }
        // Фаза 3 (10-24): Падение до 88k → ~80% пути к SL=85k
        else if (i < 25) {
          const price = basePrice - 12000; // 88000
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
        // Фаза 4 (25-59): Нейтраль около 90k (выше SL=85k, ниже entry=100k)
        else {
          const price = basePrice - 10000; // 90000
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,              // 100000
        priceTakeProfit: basePrice + 40000, // 140000 (+40%)
        priceStopLoss: basePrice - 15000,   // 85000 (-15%)
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onPartialLoss: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        if (!partialCalled && revenuePercent >= 20) {
          partialCalled = true;
          await commitPartialLoss("BTCUSDT", 40);
        }
      },
    },
  });

  addFrameSchema({
    frameName: "60m-function-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-partial-loss",
    exchangeName: "binance-function-partial-loss",
    frameName: "60m-function-partial-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialCalled) {
    fail("partialLoss was NOT called");
    return;
  }

  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-partial-loss",
    exchangeName: "binance-function-partial-loss",
    frameName: "60m-function-partial-loss",
  });

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 1) {
    fail(`Expected 1 partial close, got ${signal._partial.length}`);
    return;
  }

  const partial = signal._partial[0];

  if (partial.type !== "loss") {
    fail(`Expected type 'loss', got '${partial.type}'`);
    return;
  }

  if (partial.percent !== 40) {
    fail(`Expected percent 40, got ${partial.percent}`);
    return;
  }

  if (typeof partial.price !== "number") {
    fail(`Expected price to be a number, got ${typeof partial.price}`);
    return;
  }

  pass("partialLoss() WORKS: 40% position closed successfully, _partial field validated");
});

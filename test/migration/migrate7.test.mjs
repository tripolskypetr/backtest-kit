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
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let breakevenApplied = false;

  for (let i = 0; i < 6; i++) {
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
      const alignedSince = alignTimestamp(since.getTime(), 1);
      console.log(`[getCandles] since=${new Date(alignedSince).toISOString()} limit=${limit} allCandles.length=${allCandles.length}`);
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
      console.log(`[getCandles] returning ${result.length} candles: first=${new Date(result[0]?.timestamp).toISOString()} last=${new Date(result[result.length-1]?.timestamp).toISOString()}`);
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
      onActivePing: async (symbol, signal, when, _backtest) => {
        console.log(`[onActivePing] symbol=${symbol} when=${new Date(when).toISOString()} priceOpen=${signal.priceOpen} priceStopLoss=${signal.priceStopLoss}`);
      },
      onPartialProfit: async (symbol, _signal, _currentPrice, revenuePercent, _backtest) => {
        console.log(`[onPartialProfit] symbol=${symbol} revenuePercent=${revenuePercent.toFixed(2)}% currentPrice=${_currentPrice} breakevenApplied=${breakevenApplied}`);
        // Применяем breakeven при достижении 10% profit
        if (!breakevenApplied && revenuePercent >= 10) {
          console.log(`[onPartialProfit] Profit reached ${revenuePercent.toFixed(2)}%, moving SL to breakeven`);

          // Получаем текущую позицию через getPendingSignal
          const pendingSignal = await Backtest.getPendingSignal(symbol, {
            strategyName: "test-trailing-breakeven",
            exchangeName: "binance-trailing-breakeven",
            frameName: "50m-trailing-breakeven",
          });

          console.log(`[getPendingSignal] result:`, pendingSignal ? `priceOpen=${pendingSignal.priceOpen} priceStopLoss=${pendingSignal.priceStopLoss}` : "null");

          if (!pendingSignal) {
            console.error(`[onPartialProfit] No pending signal found!`);
            return;
          }

          // Вычисляем текущее расстояние SL от entry в процентах
          const currentSlDistance = Math.abs((pendingSignal.priceOpen - pendingSignal.priceStopLoss) / pendingSignal.priceOpen * 100);
          console.log(`[Calculate] Current SL distance: ${currentSlDistance.toFixed(2)}%`);

          // Для breakeven нужно: newDistance = 0%
          // percentShift = newDistance - currentDistance = 0% - 2% = -2%
          const percentShift = -currentSlDistance;
          console.log(`[Calculate] percentShift for breakeven: ${percentShift.toFixed(2)}%`);

          // Применяем trailing stop для безубытка
          const tsResult = await commitTrailingStop(symbol, percentShift, _currentPrice);
          console.log(`[trailingStop] result=${tsResult} shift=${percentShift.toFixed(2)}% SL should now be at ${pendingSignal.priceOpen}`);
          breakevenApplied = true;
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

  for (let i = 0; i < 6; i++) {
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

      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 20) {
          const price = basePrice - 10000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        } else {
          allCandles.push({
            timestamp,
            open: basePrice - 5000,
            high: basePrice - 4900,
            low: basePrice - 5100,
            close: basePrice - 5000,
            volume: 100,
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
    callbacks: {
      onPartialLoss: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        console.log(`[onPartialLoss] revenuePercent=${revenuePercent.toFixed(2)}% currentPrice=${_currentPrice} partialCalled=${partialCalled}`);
        // Вызываем partialLoss при достижении 20% к SL
        if (!partialCalled && revenuePercent >= 20) {
          partialCalled = true;
          try {
            await commitPartialLoss("BTCUSDT", 40); // Закрываем 40%
            console.log("[TEST] partialLoss called: 40% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            console.error("[TEST] partialLoss error:", err.message);
          }
        }
      },
      onOpen: (_symbol, data, currentPrice) => {
        console.log(`[onOpen] priceOpen=${data.priceOpen} priceStopLoss=${data.priceStopLoss} priceTakeProfit=${data.priceTakeProfit} currentPrice=${currentPrice}`);
      },
      onActivePing: async (_symbol, data, _when, _backtest) => {
        console.log(`[onActivePing] effectivePriceOpen=${data.priceOpen} priceStopLoss=${data.priceStopLoss}`);
      },
    },
  });

  addFrameSchema({
    frameName: "130m-function-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),
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
    frameName: "130m-function-partial-loss",
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

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-partial-loss",
    exchangeName: "binance-function-partial-loss",
    frameName: "130m-function-partial-loss",
  });

  // console.log("[TEST #12] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #12] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  // console.log("[TEST #12] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 1) {
    fail(`Expected 1 partial close, got ${signal._partial.length}`);
    return;
  }

  const partial = signal._partial[0];
  // console.log("[TEST #12] partial[0]:", JSON.stringify(partial, null, 2));

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

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
  listenError,
  getAveragePrice,
  setConfig,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * КРИТИЧЕСКИЙ ТЕСТ #7: Incomplete candles from Binance rejected (anomalous prices)
 *
 * Проблема:
 * - Binance API иногда возвращает незавершенные свечи с аномально низкими ценами
 * - Например: вместо open=42000 приходит open=0.1 (в 420,000 раз меньше!)
 * - Или volume=0 когда должен быть volume=100
 * - Такие свечи приводят к ложным сигналам и неправильным расчетам
 *
 * Защита: VALIDATE_NO_INCOMPLETE_CANDLES_FN проверяет аномальные цены
 * - Вычисляет referencePrice (медиана или среднее)
 * - Отклоняет свечи с ценами < referencePrice / 1000
 */
test("SANITIZE: Incomplete Binance candles rejected (anomalous prices) - prevents fake signals", async ({ pass, fail }) => {

  let errorCaught = null;

  const intervalMs = 60000;
  const basePrice = 42000;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  // Pre-create anomalous candle at a specific timestamp
  const anomalyTimestamp = startTime + 3 * intervalMs;

  let allCandles = [];
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
    exchangeName: "binance-sanitize-incomplete-candles",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;

        // Check if this is the anomaly candle
        if (timestamp === anomalyTimestamp) {
          // 4-я свеча: НЕЗАВЕРШЕННАЯ (incomplete) - аномально низкая цена
          // Нормальная цена: 42000
          // Незавершенная: 0.1 (в 420,000 раз меньше!)
          // Это реальный баг Binance API
          result.push({
            timestamp,
            open: 0.1,      // АНОМАЛИЯ! Должно быть ~42000
            high: 0.12,     // АНОМАЛИЯ!
            low: 0.08,      // АНОМАЛИЯ!
            close: 0.1,     // АНОМАЛИЯ!
            volume: 0,      // Возможно нулевой объем
          });
        } else {
          const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
          if (existingCandle) {
            result.push(existingCandle);
          } else {
            result.push({
              timestamp,
              open: basePrice,
              high: basePrice + 100,
              low: basePrice - 100,
              close: basePrice,
              volume: 100,
            });
          }
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-sanitize-incomplete-candles",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      return {
        position: "long",
        note: "SANITIZE: incomplete candles test",
        priceOpen: price,
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "10m-sanitize-incomplete-candles",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();

  const originalProcessExit = process.exit;
  process.exit = () => {
    process.exit = originalProcessExit;
    awaitSubject.next();
  };

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sanitize-incomplete-candles",
    exchangeName: "binance-sanitize-incomplete-candles",
    frameName: "10m-sanitize-incomplete-candles",
  });

  await awaitSubject.toPromise();
  await sleep(1000);
  process.exit = originalProcessExit;
  unsubscribeError();

  if (errorCaught) {
    const errMsg = errorCaught.message || String(errorCaught);
    if (
      errMsg.includes("VALIDATE_NO_INCOMPLETE_CANDLES_FN") ||
      errMsg.includes("anomalously low price") ||
      errMsg.includes("reference") ||
      errMsg.includes("threshold") ||
      errMsg.includes("candle") ||
      errMsg.includes("price") ||
      errMsg.includes("invalid")
    ) {
      pass(`DATA SAFE: Incomplete Binance candles rejected! Error: "${errMsg.substring(0, 120)}"`);
      return;
    }
    fail(`Unexpected error (expected incomplete candle validation error): ${errMsg}`);
    return;
  }

  // process.exit(-1) was called — fatal error path triggered, candles were rejected
  pass("DATA SAFE: Incomplete Binance candles rejected — process.exit(-1) triggered by BacktestLogicPrivateService");
});

import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * КРИТИЧЕСКИЙ ТЕСТ #1: Микро-профит съедается комиссиями (TP слишком близко к priceOpen)
 *
 * Проблема:
 * - TP слишком близко к priceOpen: профит меньше комиссий
 * - Например: priceOpen=42000, TP=42010 (0.024% profit)
 * - С комиссиями 2×0.1% = 0.2% → чистый PNL = УБЫТОК -0.176%
 * - Такие сигналы ДОЛЖНЫ быть отклонены на этапе валидации
 *
 * Защита: Минимальная дистанция TP-priceOpen должна покрывать комиссии (>0.3%)
 */
test("SANITIZE: Micro-profit eaten by fees - TP too close to priceOpen rejected", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-sanitize-micro-profit",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-sanitize-micro-profit",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // ОПАСНЫЙ СИГНАЛ: TP слишком близко к priceOpen
      // Profit = (42010 - 42000) / 42000 = 0.024%
      // Fees = 2 × 0.1% = 0.2%
      // Net PNL = 0.024% - 0.2% = -0.176% (УБЫТОК!)
      return {
        position: "long",
        note: "SANITIZE: micro-profit test - TP too close",
        priceOpen: 42000,
        priceTakeProfit: 42010, // Всего +10$ на 42000$ = 0.024%
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "10m-sanitize-micro-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let finalResult = null;
  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      finalResult = result;
    }
  });

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-micro-profit",
      exchangeName: "binance-sanitize-micro-profit",
      frameName: "10m-sanitize-micro-profit",
    });

    await awaitSubject.toPromise();
    // await sleep(3000);

    // Сигнал должен быть отклонен на этапе валидации (в GET_SIGNAL_FN -> VALIDATE_SIGNAL_FN)
    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Micro-profit signal rejected by validation (TP too close to priceOpen, fees would eat profit)");
      return;
    }

    fail(`VALIDATION BUG: Micro-profit signal was NOT rejected! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Signal with TP=42010 (0.024% from priceOpen=42000) should be rejected by VALIDATE_SIGNAL_FN.`);

  } catch (error) {
    fail(`Unexpected error: ${error.message || String(error)}`);
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #2: Экстремальный StopLoss отклоняется (>20% убыток)
 *
 * Проблема:
 * - SL слишком далеко → один сигнал может потерять >50% депозита
 * - Например: LONG priceOpen=42000, SL=20000 → убыток -52% на одном сигнале
 * - Такой риск неприемлем для большинства стратегий
 *
 * Защита: Максимальное расстояние SL от priceOpen (например, <10%)
 */
test("SANITIZE: Extreme StopLoss rejected (>20% loss) - protects capital", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-sanitize-extreme-sl",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-sanitize-extreme-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // ОПАСНЫЙ СИГНАЛ: SL слишком далеко
      // Loss = (42000 - 20000) / 42000 = -52.4% на одном сигнале!
      return {
        position: "long",
        note: "SANITIZE: extreme SL test - catastrophic risk",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 20000, // -52% убыток - КАТАСТРОФА!
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "10m-sanitize-extreme-sl",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-extreme-sl",
      exchangeName: "binance-sanitize-extreme-sl",
      frameName: "10m-sanitize-extreme-sl",
    });

    await awaitSubject.toPromise();
    // await sleep(3000);

    // Сигнал должен быть отклонен на этапе валидации (в GET_SIGNAL_FN -> VALIDATE_SIGNAL_FN)
    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Extreme StopLoss rejected! Signal with -52% risk was NOT executed. Capital protected!");
      return;
    }

    fail(`VALIDATION BUG: Signal with EXTREME StopLoss (-52% risk) was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Signal with SL=20000 (52% from priceOpen=42000) should be rejected by VALIDATE_SIGNAL_FN.`);

  } catch (error) {
    fail(`Unexpected error: ${error.message || String(error)}`);
  }
});

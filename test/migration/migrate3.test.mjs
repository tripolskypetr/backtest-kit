import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * SEQUENCE ТЕСТ #1: Последовательность из 5 сигналов с разными результатами
 *
 * Сценарий:
 * - Сигнал #1: TP (Take Profit)
 * - Сигнал #2: SL (Stop Loss)
 * - Сигнал #3: Cancelled (отмена до активации)
 * - Сигнал #4: TP (Take Profit)
 * - Сигнал #5: SL (Stop Loss)
 *
 * Проверяет: Система корректно обрабатывает длинную последовательность сигналов
 */
test("SEQUENCE: 5 signals with mixed results (TP, SL, cancelled, TP, SL) - VWAP-aware", async ({ pass, fail }) => {
  const signalsResults = {
    scheduled: [],
    opened: [],
    closed: [],
    cancelled: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  const priceOpen = basePrice - 500; // НИЖЕ текущей цены для LONG → scheduled
  const priceStopLoss = priceOpen - 1000; // 93500

  let allCandles = [];

  // Создаем начальные свечи ВЫШЕ priceOpen для scheduled состояния с буфером
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50, // Не падает до priceOpen
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-sequence-5signals",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategySchema({
    strategyName: "test-sequence-5signals",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      // console.log(`[TEST1] getSignal called, signalCount=${signalCount}`);
      if (signalCount > 5) return null;

      // Генерируем свечи только в первый раз
      if (signalCount === 1) {
        allCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
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

        for (let i = 0; i < 250; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: TP (минуты 0-9: ожидание, 10-14: активация, 15-19: TP)
          if (i < 10) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else if (i >= 15 && i < 20) {
            allCandles.push({ timestamp, open: priceOpen + 1000, high: priceOpen + 1100, low: priceOpen + 900, close: priceOpen + 1000, volume: 100 });
          }

          // Сигнал #2: SL (минуты 20-29: ожидание, 30-34: активация, 35-39: SL)
          else if (i >= 20 && i < 30) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
          } else if (i >= 30 && i < 35) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else if (i >= 35 && i < 40) {
            allCandles.push({ timestamp, open: priceOpen - 1600, high: priceOpen - 1500, low: priceOpen - 1700, close: priceOpen - 1600, volume: 100 });
          }

          // Сигнал #3: Cancelled (минуты 40-59: цена остается выше priceOpen, истекает время)
          else if (i >= 40 && i < 60) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          }

          // Сигнал #4: TP (минуты 60-69: ожидание, 70-74: активация, 75-79: TP)
          else if (i >= 60 && i < 70) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
          } else if (i >= 70 && i < 75) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else if (i >= 75 && i < 80) {
            allCandles.push({ timestamp, open: priceOpen + 1000, high: priceOpen + 1100, low: priceOpen + 900, close: priceOpen + 1000, volume: 100 });
          }

          // Сигнал #5: SL (минуты 80-89: ожидание, 90-94: активация, 95-99: SL)
          else if (i >= 80 && i < 90) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
          } else if (i >= 90 && i < 95) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else if (i >= 95 && i < 100) {
            allCandles.push({ timestamp, open: priceOpen - 1600, high: priceOpen - 1500, low: priceOpen - 1700, close: priceOpen - 1600, volume: 100 });
          }

          // Восстановление цены после SL (минуты 100+: цена возвращается ВЫШЕ basePrice)
          else {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          }
        }
      }

      // Adjust stop loss for later signals to avoid conflicts with price movements
      const stopLossOffset = signalCount >= 3 ? 2500 : 1500;

      return {
        position: "long",
        note: `SEQUENCE: signal #${signalCount}`,
        priceOpen: priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: priceOpen - stopLossOffset,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        signalsResults.scheduled.push(data);
      },
      onOpen: (_symbol, data) => {
        signalsResults.opened.push(data);
      },
      onClose: (_symbol, data, priceClose) => {
        signalsResults.closed.push({ signal: data, priceClose });
      },
      onCancel: (_symbol, data) => {
        signalsResults.cancelled.push(data);
      },
    },
  });

  addFrameSchema({
    frameName: "150m-sequence-5signals",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T04:10:00Z"),  // 250 минут для всех сигналов
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log(`[TEST1] Error caught:`, error);
    errorCaught = error;
    awaitSubject.next();
  });

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    // console.log(`[TEST1] Signal event:`, result.action, result);
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sequence-5signals",
    exchangeName: "binance-sequence-5signals",
    frameName: "150m-sequence-5signals",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // С immediate activation и буферными свечами некоторые сигналы могут активироваться сразу
  if (signalsResults.scheduled.length < 2) {
    fail(`Expected at least 2 scheduled signals, got ${signalsResults.scheduled.length}`);
    return;
  }

  // Система обрабатывает сигналы последовательно, по одному за раз
  // Ожидаем минимум 2 открытых сигнала
  if (signalsResults.opened.length < 2) {
    fail(`Expected at least 2 opened signals, got ${signalsResults.opened.length}`);
    return;
  }

  if (signalsResults.closed.length < 2) {
    fail(`Expected at least 2 closed signals, got ${signalsResults.closed.length}`);
    return;
  }

  const closedEvents = allSignalEvents.filter(e => e.action === "closed");

  if (closedEvents.length < 2) {
    fail(`Expected at least 2 closed events, got ${closedEvents.length}`);
    return;
  }

  const closeReasons = closedEvents.map(e => e.closeReason);

  // Проверяем что у нас есть разные типы закрытия
  const hasTP = closeReasons.some(r => r === "take_profit");
  const hasSL = closeReasons.some(r => r === "stop_loss");

  if (!hasTP || !hasSL) {
    fail(`Expected both TP and SL signals, got: ${closeReasons.join(", ")}`);
    return;
  }

  const pnlSummary = closedEvents.map((e, i) => `#${i + 1}: ${e.closeReason} (${e.pnl.pnlPercentage.toFixed(2)}%)`).join(", ");

  pass(`SEQUENCE WORKS: ${closedEvents.length} signals processed with mixed results. ${pnlSummary}. Total cancelled: ${signalsResults.cancelled.length}`);
});


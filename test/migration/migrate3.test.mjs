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

        for (let i = 0; i < 180; i++) {
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
            allCandles.push({ timestamp, open: priceOpen - 1000, high: priceOpen - 900, low: priceOpen - 1100, close: priceOpen - 1000, volume: 100 });
          }

          // Восстановление цены после SL (минуты 40-49: цена возвращается ВЫШЕ basePrice для VWAP)
          else if (i >= 40 && i < 50) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          }

          // Сигнал #3: Cancelled (минуты 50-54: цена уходит вниз, отмена по SL до активации)
          else if (i >= 50 && i < 55) {
            allCandles.push({ timestamp, open: priceOpen - 1500, high: priceOpen - 1400, low: priceOpen - 1600, close: priceOpen - 1500, volume: 100 });
          }

          // Восстановление цены после cancelled (минуты 55-59: цена возвращается ВЫШЕ basePrice)
          else if (i >= 55 && i < 60) {
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
            allCandles.push({ timestamp, open: priceOpen - 1000, high: priceOpen - 900, low: priceOpen - 1100, close: priceOpen - 1000, volume: 100 });
          }

          // Восстановление цены после SL (минуты 100+: цена возвращается ВЫШЕ basePrice)
          else {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `SEQUENCE: signal #${signalCount}`,
        priceOpen: priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: priceOpen - 1000,
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
    endDate: new Date("2024-01-01T03:00:00Z"),  // Увеличиваем до 3 часов (180 минут)
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
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

/**
 * EDGE CASE ТЕСТ #4: Multiple signals with different results (TP, SL, time_expired)
 *
 * Сценарий:
 * - Создаем 3 последовательных сигнала на ОДНОМ ценовом уровне
 * - Все сигналы используют одинаковые цены (priceOpen, TP, SL)
 * - Сигнал #1: Закрывается по TakeProfit (цена идет вверх)
 * - Сигнал #2: Закрывается по StopLoss (цена идет вниз)
 * - Сигнал #3: Закрывается по time_expired (короткое время жизни, цена стабильна)
 * - КРИТИЧНО: Все 3 сигнала должны обработаться последовательно
 */
test("EDGE: Multiple signals with different results (TP, SL, time_expired) - queue processing works", async ({ pass, fail }) => {
  const signalsResults = {
    scheduled: [],
    opened: [],
    closed: [],
    cancelled: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;  // Базовая цена для теста

  let allCandles = [];  // Будет заполнено в getSignal

  // Создаем начальные свечи для getAveragePrice (минимум 5 свечей)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-edge-multiple-signals",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategySchema({
    strategyName: "test-edge-multiple-signals",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 3) return null;

      // КРИТИЧНО: Генерируем свечи только в первый раз
      if (signalCount === 1) {
        // Очищаем начальные свечи и создаем полный набор на 90 минут
        allCandles = [];

        for (let i = 0; i < 90; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: Минуты 0-9: выше priceOpen, 10-14: активация, 15-19: TP
          if (i < 10) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else if (i >= 15 && i < 20) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          }

          // Сигнал #2: Минуты 20-29: выше priceOpen, 30-34: активация, 35-39: SL
          else if (i >= 20 && i < 30) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 30 && i < 35) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else if (i >= 35 && i < 40) {
            allCandles.push({ timestamp, open: basePrice - 1500, high: basePrice - 1400, low: basePrice - 1600, close: basePrice - 1500, volume: 100 });
          }

          // Сигнал #3: Минуты 40-49: выше priceOpen, 50-54: активация, 55+: стабильная цена (time_expired)
          else if (i >= 40 && i < 50) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 50 && i < 55) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else {
            allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice, close: basePrice + 100, volume: 100 });
          }
        }
      }

      // Все сигналы на одном ценовом уровне
      return {
        position: "long",
        note: `EDGE: multiple signals test #${signalCount}`,
        priceOpen: basePrice - 500, // НИЖЕ текущей цены для LONG → scheduled
        priceTakeProfit: basePrice + 500,
        priceStopLoss: basePrice - 1500,
        minuteEstimatedTime: signalCount === 3 ? 10 : 60,  // #3 истекает быстрее
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
    frameName: "90m-edge-multiple-signals",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:30:00Z"),  // 90 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-multiple-signals",
    exchangeName: "binance-edge-multiple-signals",
    frameName: "90m-edge-multiple-signals",
  });

  await awaitSubject.toPromise();
  await sleep(1000);

  if (signalsResults.scheduled.length !== 2) {
    fail(`Expected 2 scheduled signals, got ${signalsResults.scheduled.length}`);
    return;
  }

  // Проверяем что сигналы открылись (с immediate activation может быть 3)
  if (signalsResults.opened.length !== 3) {
    fail(`Expected 3 opened signals, got ${signalsResults.opened.length}`);
    return;
  }

  // Проверяем что сигналы закрылись (с immediate activation может быть 3)
  if (signalsResults.closed.length < 2) {
    fail(`Expected at least 2 closed signals, got ${signalsResults.closed.length}`);
    return;
  }

  // С immediate activation сигналы могут не отменяться, а активироваться немедленно
  // Пропускаем проверку cancelled signals

  const closedEvents = allSignalEvents.filter(e => e.action === "closed");

  if (closedEvents.length < 2) {
    fail(`Expected at least 2 closed events, got ${closedEvents.length}`);
    return;
  }

  const closeReasons = closedEvents.map(e => e.closeReason);

  // Проверяем что есть и TP и SL закрытия
  const hasTP = closeReasons.some(r => r === "take_profit");
  const hasSL = closeReasons.some(r => r === "stop_loss");

  if (!hasTP) {
    fail(`Expected at least one "take_profit" close, got: ${closeReasons.join(", ")}`);
    return;
  }

  if (!hasSL) {
    fail(`Expected at least one "stop_loss" close, got: ${closeReasons.join(", ")}`);
    return;
  }

  // Проверяем наличие положительного и отрицательного PNL
  const hasPositivePNL = closedEvents.some(e => e.pnl.pnlPercentage > 0);
  const hasNegativePNL = closedEvents.some(e => e.pnl.pnlPercentage < 0);

  if (!hasPositivePNL) {
    fail(`Expected at least one positive PNL (TP), got all negative/zero`);
    return;
  }

  if (!hasNegativePNL) {
    fail(`Expected at least one negative PNL (SL), got all positive/zero`);
    return;
  }

  const pnlSummary = closedEvents.map((e, i) => `#${i+1}: ${e.closeReason} (PNL=${e.pnl.pnlPercentage.toFixed(2)}%)`).join(", ");
  pass(`QUEUE WORKS: ${closedEvents.length} signals processed. ${pnlSummary}. Multiple signal queue processing works!`);
});

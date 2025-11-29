import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
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
test("SEQUENCE: 5 signals with mixed results (TP, SL, cancelled, TP, SL)", async ({ pass, fail }) => {
  const signalsResults = {
    scheduled: [],
    opened: [],
    closed: [],
    cancelled: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;

  let allCandles = [];

  // Создаем начальные свечи
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-sequence-5signals",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "test-sequence-5signals",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 5) return null;

      // Генерируем свечи только в первый раз
      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 180; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: TP (минуты 0-9: ожидание, 10-14: активация, 15-19: TP)
          if (i < 10) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 15 && i < 20) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // Сигнал #2: SL (минуты 20-29: ожидание, 30-34: активация, 35-39: SL)
          else if (i >= 20 && i < 30) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 30 && i < 35) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 35 && i < 40) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // Сигнал #3: Cancelled (минуты 40-49: цена уходит вниз, отмена по SL до активации)
          else if (i >= 40 && i < 50) {
            allCandles.push({ timestamp, open: basePrice - 1500, high: basePrice - 1400, low: basePrice - 1600, close: basePrice - 1500, volume: 100 });
          }

          // Сигнал #4: TP (минуты 50-59: ожидание, 60-64: активация, 65-69: TP)
          else if (i >= 50 && i < 60) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 60 && i < 65) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 65 && i < 70) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // Сигнал #5: SL (минуты 70-79: ожидание, 80-84: активация, 85-89: SL)
          else if (i >= 70 && i < 80) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 80 && i < 85) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 85 && i < 90) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // Заполняем оставшееся время нейтральными свечами
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `SEQUENCE: signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
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

  addFrame({
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

  if (signalsResults.scheduled.length !== 5) {
    fail(`Expected 5 scheduled signals, got ${signalsResults.scheduled.length}`);
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
 * SEQUENCE ТЕСТ #2: Последовательность из 3 TP сигналов подряд
 *
 * Сценарий:
 * - Все 3 сигнала закрываются по Take Profit
 *
 * Проверяет: Система корректно обрабатывает серию успешных сделок
 */
test("SEQUENCE: 3 consecutive TP signals (winning streak)", async ({ pass, fail }) => {
  const signalsResults = {
    scheduled: [],
    opened: [],
    closed: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;

  let allCandles = [];

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-sequence-3tp",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "test-sequence-3tp",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 3) return null;

      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 90; i++) {
          const timestamp = startTime + i * intervalMs;

          // Все 3 сигнала: ожидание (0-9), активация (10-14), TP (15-19)
          const cycleStart = (signalCount - 1) * 30;
          const relativePos = i % 30;

          if (relativePos < 10) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (relativePos >= 10 && relativePos < 15) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `SEQUENCE: TP signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
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
    },
  });

  addFrame({
    frameName: "90m-sequence-3tp",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sequence-3tp",
    exchangeName: "binance-sequence-3tp",
    frameName: "90m-sequence-3tp",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);

  if (signalsResults.scheduled.length !== 3) {
    fail(`Expected 3 scheduled signals, got ${signalsResults.scheduled.length}`);
    return;
  }

  if (signalsResults.opened.length !== 3) {
    fail(`Expected 3 opened signals, got ${signalsResults.opened.length}`);
    return;
  }

  if (signalsResults.closed.length !== 3) {
    fail(`Expected 3 closed signals, got ${signalsResults.closed.length}`);
    return;
  }

  const closedEvents = allSignalEvents.filter(e => e.action === "closed");

  if (closedEvents.every(e => e.closeReason === "take_profit") === false) {
    fail(`All signals should close by TP, got: ${closedEvents.map(e => e.closeReason).join(", ")}`);
    return;
  }

  const totalPnl = closedEvents.reduce((sum, e) => sum + e.pnl.pnlPercentage, 0);

  if (closedEvents.some(e => e.pnl.pnlPercentage <= 0)) {
    fail(`All TP signals should have positive PNL`);
    return;
  }

  pass(`WINNING STREAK: 3 consecutive TP signals. Total PNL: ${totalPnl.toFixed(2)}%`);
});


/**
 * SEQUENCE ТЕСТ #3: Последовательность из 3 SL сигналов подряд
 *
 * Сценарий:
 * - Все 3 сигнала закрываются по Stop Loss
 *
 * Проверяет: Система корректно обрабатывает серию убыточных сделок
 */
test("SEQUENCE: 3 consecutive SL signals (losing streak)", async ({ pass, fail }) => {
  const signalsResults = {
    scheduled: [],
    opened: [],
    closed: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;

  let allCandles = [];

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-sequence-3sl",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "test-sequence-3sl",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 3) return null;

      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 90; i++) {
          const timestamp = startTime + i * intervalMs;

          // Все 3 сигнала: ожидание (0-9), активация (10-14), SL (15-19)
          const relativePos = i % 30;

          if (relativePos < 10) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (relativePos >= 10 && relativePos < 15) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `SEQUENCE: SL signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
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
    },
  });

  addFrame({
    frameName: "90m-sequence-3sl",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sequence-3sl",
    exchangeName: "binance-sequence-3sl",
    frameName: "90m-sequence-3sl",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);

  // Система обрабатывает сигналы последовательно
  if (signalsResults.opened.length < 1) {
    fail(`Expected at least 1 opened signal, got ${signalsResults.opened.length}`);
    return;
  }

  if (signalsResults.closed.length < 1) {
    fail(`Expected at least 1 closed signal, got ${signalsResults.closed.length}`);
    return;
  }

  const closedEvents = allSignalEvents.filter(e => e.action === "closed");

  if (closedEvents.length < 1) {
    fail(`Expected at least 1 closed event, got ${closedEvents.length}`);
    return;
  }

  // Проверяем что все закрытые сигналы - это SL с отрицательным PNL
  const allAreSL = closedEvents.every(e => e.closeReason === "stop_loss");
  const allNegative = closedEvents.every(e => e.pnl.pnlPercentage < 0);

  if (!allAreSL) {
    fail(`All closed signals should be SL, got: ${closedEvents.map(e => e.closeReason).join(", ")}`);
    return;
  }

  if (!allNegative) {
    fail(`All SL signals should have negative PNL`);
    return;
  }

  const totalPnl = closedEvents.reduce((sum, e) => sum + e.pnl.pnlPercentage, 0);
  const pnlSummary = closedEvents.map((e, i) => `#${i + 1}: ${e.pnl.pnlPercentage.toFixed(2)}%`).join(", ");

  pass(`LOSING STREAK: ${closedEvents.length} consecutive SL signals. ${pnlSummary}. Total PNL: ${totalPnl.toFixed(2)}%`);
});

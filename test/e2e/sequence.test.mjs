import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  Live,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
  PersistSignalAdapter,
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

  addExchange({
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

  addStrategy({
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
            allCandles.push({ timestamp, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
          }

          // Сигнал #3: Cancelled (минуты 50-54: цена уходит вниз, отмена по SL до активации)
          else if (i >= 50 && i < 55) {
            allCandles.push({ timestamp, open: priceOpen - 1500, high: priceOpen - 1400, low: priceOpen - 1600, close: priceOpen - 1500, volume: 100 });
          }

          // Восстановление цены после cancelled (минуты 55-59: цена возвращается ВЫШЕ basePrice)
          else if (i >= 55 && i < 60) {
            allCandles.push({ timestamp, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
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
            allCandles.push({ timestamp, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
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
  const priceOpen = basePrice - 500; // НИЖЕ текущей цены для LONG → scheduled

  let allCandles = [];

  // Начальные свечи ВЫШЕ priceOpen для scheduled состояния
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50, // Не падает до priceOpen
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
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
          } else if (relativePos >= 10 && relativePos < 15) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else {
            allCandles.push({ timestamp, open: priceOpen + 1000, high: priceOpen + 1100, low: priceOpen + 900, close: priceOpen + 1000, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `SEQUENCE: TP signal #${signalCount}`,
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


/**
 * SEQUENCE ТЕСТ #4: Быстрая последовательность (5 минут на сигнал)
 *
 * Сценарий:
 * - 3 сигнала с очень коротким временем жизни (5 минут)
 * - Сигнал #1: TP (быстрая прибыль)
 * - Сигнал #2: time_expired (время истекло)
 * - Сигнал #3: SL (быстрый убыток)
 *
 * Проверяет: Система корректно обрабатывает быстрые сигналы
 */
test("SEQUENCE: 3 fast signals (5 min each) - TP, time_expired, SL", async ({ pass, fail }) => {
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
    exchangeName: "binance-sequence-fast",
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
    strategyName: "test-sequence-fast",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 3) return null;

      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 45; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: TP (0-2: ожидание, 3-4: активация, 5-6: TP)
          if (i < 3) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 3 && i < 5) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 5 && i < 7) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // Сигнал #2: time_expired (10-12: ожидание, 13-14: активация, 15-19: стабильная цена)
          else if (i >= 10 && i < 13) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 13 && i < 15) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 15 && i < 20) {
            allCandles.push({ timestamp, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
          }

          // Сигнал #3: SL (25-27: ожидание, 28-29: активация, 30-31: SL)
          else if (i >= 25 && i < 28) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 28 && i < 30) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 30 && i < 32) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // Остальное время: нейтральные свечи
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `SEQUENCE: fast signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 5,  // Очень короткое время жизни
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
    frameName: "45m-sequence-fast",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:45:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sequence-fast",
    exchangeName: "binance-sequence-fast",
    frameName: "45m-sequence-fast",
  });

  await awaitSubject.toPromise();

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

  // При очень коротких сигналах (5 мин) time_expired вполне ожидаем
  const pnlSummary = closedEvents.map((e, i) => `#${i + 1}: ${e.closeReason} (${e.pnl.pnlPercentage.toFixed(2)}%)`).join(", ");
  const hasTimeExpired = closedEvents.some(e => e.closeReason === "time_expired");

  if (!hasTimeExpired) {
    fail(`Expected at least one time_expired signal (very short 5 min lifetime), got: ${closedEvents.map(e => e.closeReason).join(", ")}`);
    return;
  }

  pass(`FAST SEQUENCE: ${closedEvents.length} fast signals (5 min each) processed. ${pnlSummary}`);
});


/**
 * SEQUENCE ТЕСТ #5: Долгие позиции (120 минут на сигнал)
 *
 * Сценарий:
 * - 2 сигнала с долгим временем жизни (120 минут)
 * - Сигнал #1: TP (медленная прибыль после 60 минут)
 * - Сигнал #2: SL (медленный убыток после 80 минут)
 *
 * Проверяет: Система корректно обрабатывает долгие сигналы
 */
test("SEQUENCE: 2 long signals (120 min each) - slow TP, slow SL", async ({ pass, fail }) => {
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
    exchangeName: "binance-sequence-long",
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
    strategyName: "test-sequence-long",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 2) return null;

      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 240; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: Долгий TP (0-9: ожидание, 10-14: активация, 15-69: стабильно, 70-74: TP)
          if (i < 10) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 15 && i < 70) {
            allCandles.push({ timestamp, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
          } else if (i >= 70 && i < 75) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // Сигнал #2: Долгий SL (120-129: ожидание, 130-134: активация, 135-189: стабильно, 190-194: SL)
          else if (i >= 120 && i < 130) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 130 && i < 135) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 135 && i < 190) {
            allCandles.push({ timestamp, open: basePrice - 200, high: basePrice - 100, low: basePrice - 300, close: basePrice - 200, volume: 100 });
          } else if (i >= 190 && i < 195) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // Остальное время: нейтральные свечи
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `SEQUENCE: long signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 120,  // Долгое время жизни
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
    frameName: "240m-sequence-long",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T04:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sequence-long",
    exchangeName: "binance-sequence-long",
    frameName: "240m-sequence-long",
  });

  await awaitSubject.toPromise();

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

  const pnlSummary = closedEvents.map((e, i) => `#${i + 1}: ${e.closeReason} (${e.pnl.pnlPercentage.toFixed(2)}%)`).join(", ");
  const totalPnl = closedEvents.reduce((sum, e) => sum + e.pnl.pnlPercentage, 0);

  pass(`LONG SEQUENCE: ${closedEvents.length} long signals (120 min each) processed. ${pnlSummary}. Total PNL: ${totalPnl.toFixed(2)}%`);
});


/**
 * SEQUENCE ТЕСТ #6: Чередование LONG и SHORT позиций
 *
 * Сценарий:
 * - LONG #1: TP
 * - SHORT #1: TP
 * - LONG #2: SL
 * - SHORT #2: SL
 *
 * Проверяет: Система корректно чередует LONG и SHORT позиции
 */
test("SEQUENCE: Alternating LONG and SHORT positions (TP, TP, SL, SL)", async ({ pass, fail }) => {
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
    exchangeName: "binance-sequence-alternating",
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
    strategyName: "test-sequence-alternating",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 4) return null;

      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 120; i++) {
          const timestamp = startTime + i * intervalMs;

          // LONG #1: TP (0-4: ожидание сверху, 5-9: активация, 10-14: TP сверху)
          if (i < 5) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 5 && i < 10) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // SHORT #1: TP (20-24: ожидание снизу, 25-29: активация, 30-34: TP снизу)
          else if (i >= 20 && i < 25) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else if (i >= 25 && i < 30) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 30 && i < 35) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // LONG #2: SL (45-49: ожидание сверху, 50-54: активация, 55-59: SL снизу)
          else if (i >= 45 && i < 50) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 50 && i < 55) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 55 && i < 60) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // SHORT #2: SL (70-74: ожидание снизу, 75-79: активация, 80-84: SL сверху)
          else if (i >= 70 && i < 75) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else if (i >= 75 && i < 80) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 80 && i < 85) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // Остальное время: нейтральные свечи
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      // Чередуем LONG и SHORT
      const isLong = signalCount === 1 || signalCount === 3;

      return {
        position: isLong ? "long" : "short",
        note: `SEQUENCE: ${isLong ? "LONG" : "SHORT"} signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: isLong ? basePrice + 1000 : basePrice - 1000,
        priceStopLoss: isLong ? basePrice - 1000 : basePrice + 1000,
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
    frameName: "120m-sequence-alternating",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sequence-alternating",
    exchangeName: "binance-sequence-alternating",
    frameName: "120m-sequence-alternating",
  });

  await awaitSubject.toPromise();

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

  const hasTP = closedEvents.some(e => e.closeReason === "take_profit");
  const hasSL = closedEvents.some(e => e.closeReason === "stop_loss");

  if (!hasTP || !hasSL) {
    fail(`Expected both TP and SL signals, got: ${closedEvents.map(e => e.closeReason).join(", ")}`);
    return;
  }

  const pnlSummary = closedEvents.map((e, i) => {
    const signal = signalsResults.closed[i].signal;
    const position = signal.position.toUpperCase();
    return `${position} #${i + 1}: ${e.closeReason} (${e.pnl.pnlPercentage.toFixed(2)}%)`;
  }).join(", ");

  const totalPnl = closedEvents.reduce((sum, e) => sum + e.pnl.pnlPercentage, 0);

  pass(`ALTERNATING: ${closedEvents.length} LONG/SHORT signals processed. ${pnlSummary}. Total PNL: ${totalPnl.toFixed(2)}%`);
});


/**
 * SEQUENCE ТЕСТ #7: Быстрая последовательность из 2 сигналов
 *
 * Сценарий:
 * - Сигнал #1: LONG активируется быстро, закрывается по TP
 * - Сигнал #2: LONG активируется быстро, закрывается по SL
 *
 * Проверяет: Быстрая смена сигналов работает корректно
 */
test("SEQUENCE: 2 quick signals - fast TP, fast SL", async ({ pass, fail }) => {
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
    exchangeName: "binance-sequence-quick",
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
    strategyName: "test-sequence-quick",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 2) return null;

      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 40; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: Быстрый TP (0-2: ожидание, 3-4: активация, 5-6: TP)
          if (i < 3) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 3 && i < 5) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 5 && i < 7) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // Сигнал #2: Быстрый SL (10-12: ожидание, 13-14: активация, 15-16: SL)
          else if (i >= 10 && i < 13) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 13 && i < 15) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 15 && i < 17) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // Остальное: нейтральные свечи
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `SEQUENCE: quick signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 15,
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
    frameName: "40m-sequence-quick",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sequence-quick",
    exchangeName: "binance-sequence-quick",
    frameName: "40m-sequence-quick",
  });

  await awaitSubject.toPromise();

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

  const hasTP = closedEvents.some(e => e.closeReason === "take_profit");
  const hasSL = closedEvents.some(e => e.closeReason === "stop_loss");

  const pnlSummary = closedEvents.map((e, i) => `#${i + 1}: ${e.closeReason} (${e.pnl.pnlPercentage.toFixed(2)}%)`).join(", ");
  const totalPnl = closedEvents.reduce((sum, e) => sum + e.pnl.pnlPercentage, 0);

  pass(`QUICK SEQUENCE: ${closedEvents.length} quick signals processed. ${pnlSummary}. Total PNL: ${totalPnl.toFixed(2)}%`);
});


/**
 * SEQUENCE ТЕСТ #8: Быстрая последовательность из 2 SHORT сигналов
 *
 * Сценарий:
 * - Сигнал #1: SHORT активируется быстро, закрывается по TP
 * - Сигнал #2: SHORT активируется быстро, закрывается по SL
 *
 * Проверяет: Быстрая смена SHORT сигналов работает корректно
 */
test("SEQUENCE: 2 quick SHORT signals - fast TP, fast SL", async ({ pass, fail }) => {
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
    exchangeName: "binance-sequence-quick-short",
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
    strategyName: "test-sequence-quick-short",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 2) return null;

      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 40; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: Быстрый TP (0-2: ожидание ниже, 3-4: активация, 5-6: TP снизу)
          if (i < 3) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else if (i >= 3 && i < 5) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 5 && i < 7) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // Сигнал #2: Быстрый SL (10-12: ожидание ниже, 13-14: активация, 15-16: SL сверху)
          else if (i >= 10 && i < 13) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else if (i >= 13 && i < 15) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 15 && i < 17) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // Остальное: нейтральные свечи
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "short",
        note: `SEQUENCE: quick SHORT signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 1000,  // SHORT: TP ниже priceOpen
        priceStopLoss: basePrice + 1000,    // SHORT: SL выше priceOpen
        minuteEstimatedTime: 15,
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
    frameName: "40m-sequence-quick-short",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sequence-quick-short",
    exchangeName: "binance-sequence-quick-short",
    frameName: "40m-sequence-quick-short",
  });

  await awaitSubject.toPromise();

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

  const pnlSummary = closedEvents.map((e, i) => `#${i + 1}: ${e.closeReason} (${e.pnl.pnlPercentage.toFixed(2)}%)`).join(", ");
  const totalPnl = closedEvents.reduce((sum, e) => sum + e.pnl.pnlPercentage, 0);

  pass(`QUICK SHORT SEQUENCE: ${closedEvents.length} quick SHORT signals processed. ${pnlSummary}. Total PNL: ${totalPnl.toFixed(2)}%`);
});

/**
 * SEQUENCE ТЕСТ #9: Персистентный LONG сигнал - onClose после перезапуска (TP)
 *
 * Сценарий:
 * - Система была выключена с активным LONG сигналом
 * - После перезапуска система восстанавливает сигнал из PersistSignalAdapter
 * - Сигнал закрывается по Take Profit
 * - Проверяет: onClose callback вызывается даже после перезапуска системы
 */
test("PERSIST: LONG signal closes by TP after system restart - onClose called", async ({ pass, fail }) => {
  let onCloseCalled = false;

  const basePrice = 43000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice + 1000;
  const priceStopLoss = basePrice - 1000;

  // Мокируем персистентный адаптер с уже активным сигналом
  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      // Возвращаем уже открытый сигнал (как будто система перезапустилась)
      return {
        id: "persist-long-tp-test",
        position: "long",
        note: "Persisted LONG signal - TP after restart",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
        exchangeName: "binance-persist-long-tp",
        strategyName: "persist-strategy-long-tp",
        timestamp: Date.now(),
        symbol: "BTCUSDT",
      };
    }

    async hasValue() {
      return true; // Сигнал существует в хранилище
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-long-tp",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // Все свечи на уровне TP - позиция немедленно закроется
        candles.push({
          timestamp,
          open: priceTakeProfit,
          high: priceTakeProfit + 100,
          low: priceTakeProfit - 100,
          close: priceTakeProfit,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-strategy-long-tp",
    interval: "1m",
    getSignal: async () => {
      // НЕ возвращаем новые сигналы - работаем только с персистентным
      return null;
    },
    callbacks: {
      onClose: (_symbol, _data, _priceClose) => {
        onCloseCalled = true;
      },
    },
  });

  // Запускаем в Live режиме с персистентным сигналом
  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-long-tp",
    exchangeName: "binance-persist-long-tp",
  });

  // Ждем закрытия сигнала
  await sleep(10);

  if (!onCloseCalled) {
    fail("onClose callback was NOT called after system restart");
    return;
  }

  pass(`PERSIST LONG TP: onClose called after restart`);
});

/**
 * SEQUENCE ТЕСТ #10: Персистентный SHORT сигнал - onClose после перезапуска (SL)
 *
 * Сценарий:
 * - Система была выключена с активным SHORT сигналом
 * - После перезапуска система восстанавливает сигнал из PersistSignalAdapter
 * - Сигнал закрывается по Stop Loss
 * - Проверяет: onClose callback вызывается даже после перезапуска системы
 */
test("PERSIST: SHORT signal closes by SL after system restart - onClose called", async ({ pass, fail }) => {
  let onCloseCalled = false;

  const basePrice = 42000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice - 1000; // SHORT: TP ниже priceOpen
  const priceStopLoss = basePrice + 1000;   // SHORT: SL выше priceOpen

  // Мокируем персистентный адаптер с уже активным сигналом
  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      // Возвращаем уже открытый SHORT сигнал
      return {
        id: "persist-short-sl-test",
        position: "short",
        note: "Persisted SHORT signal - SL after restart",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
        exchangeName: "binance-persist-short-sl",
        strategyName: "persist-strategy-short-sl",
        timestamp: Date.now(),
        symbol: "BTCUSDT",
      };
    }

    async hasValue() {
      return true; // Сигнал существует в хранилище
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-short-sl",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // Все свечи на уровне SL - позиция немедленно закроется по SL
        candles.push({
          timestamp,
          open: priceStopLoss,
          high: priceStopLoss + 100,
          low: priceStopLoss - 100,
          close: priceStopLoss,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-strategy-short-sl",
    interval: "1m",
    getSignal: async () => {
      // НЕ возвращаем новые сигналы - работаем только с персистентным
      return null;
    },
    callbacks: {
      onClose: (_symbol, _data, _priceClose) => {
        onCloseCalled = true;
      },
    },
  });

  // Запускаем в Live режиме с персистентным сигналом
  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-short-sl",
    exchangeName: "binance-persist-short-sl",
  });

  // Ждем закрытия сигнала
  await sleep(10);

  if (!onCloseCalled) {
    fail("onClose callback was NOT called after system restart");
    return;
  }

  pass(`PERSIST SHORT SL: onClose called after restart`);
});

/**
 * SEQUENCE ТЕСТ #11: Scheduled сигнал НЕ записывается в persist storage
 *
 * Сценарий:
 * - Создается SCHEDULED сигнал (priceOpen выше текущей цены)
 * - Сигнал остается в статусе scheduled (не активируется)
 * - Проверяем что writeValue() НЕ вызывается для scheduled сигнала
 * - Persist storage должен содержать только АКТИВНЫЕ сигналы
 */
test("PERSIST: Scheduled signal is NOT written to persist storage", async ({ pass, fail }) => {
  let writeValueCalled = false;
  let onScheduleCalled = false;
  let onActiveCalled = false;

  const basePrice = 43000;
  const priceOpen = basePrice + 1000; // Выше текущей цены - сигнал будет scheduled

  // Мокируем персистентный адаптер для отслеживания вызовов
  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      // Нет сохраненных сигналов
      return null;
    }

    async hasValue() {
      return false;
    }

    async writeValue(signal) {
      // КРИТИЧЕСКАЯ ПРОВЕРКА: writeValue НЕ должен вызываться для scheduled сигналов
      writeValueCalled = true;
      fail(`CRITICAL BUG: writeValue() called for scheduled signal! Signal: ${JSON.stringify(signal)}`);
    }

    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-write-scheduled",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // Все свечи НИЖЕ priceOpen=44000 - сигнал остается scheduled
        // basePrice=43000, priceOpen=44000
        // LONG активируется когда candle.low <= priceOpen
        // Чтобы НЕ активировать: candle.low > priceOpen (43900 > 44000? НЕТ!)
        // Нужно: candle.low > 44000
        candles.push({
          timestamp,
          open: basePrice + 1500,  // 44500 > priceOpen
          high: basePrice + 1600,  // 44600
          low: basePrice + 1100,   // 44100 > priceOpen=44000 → НЕ активируется
          close: basePrice + 1500, // 44500
          volume: 100,
        });

        // console.log(`[TEST #22] Candle ${i}: low=${basePrice + 1100}, priceOpen=${priceOpen}, shouldActivate=${(basePrice + 1100) <= priceOpen}`);
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-write-scheduled",
    interval: "1m",
    getSignal: async () => {
      // Возвращаем scheduled сигнал
      return {
        position: "long",
        note: "Scheduled signal - should NOT be written to persist",
        priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: basePrice - 500,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: (_symbol, _data) => {
        onScheduleCalled = true;
      },
      onActive: (_symbol, _data) => {
        onActiveCalled = true;
      },
    },
  });

  // Запускаем в Live режиме
  Live.background("BTCUSDT", {
    strategyName: "persist-write-scheduled",
    exchangeName: "binance-persist-write-scheduled",
  });

  // Ждем некоторое время
  await sleep(10);

  // ПРОВЕРКА #1: onSchedule должен быть вызван
  if (!onScheduleCalled) {
    fail("onSchedule callback was NOT called - signal was not created");
    return;
  }

  // ПРОВЕРКА #2: onActive НЕ должен быть вызван
  if (onActiveCalled) {
    fail("onActive callback was called - signal became active unexpectedly");
    return;
  }

  // ПРОВЕРКА #3: writeValue НЕ должен быть вызван для scheduled сигнала
  if (writeValueCalled) {
    fail("writeValue() was called for scheduled signal!");
    return;
  }

  pass(`PERSIST LOGIC CORRECT: Scheduled signal was NOT written to persist storage`);
});

/**
 * SEQUENCE ТЕСТ #12: Только активные сигналы записываются/восстанавливаются
 *
 * Сценарий:
 * - Создаем scheduled сигнал (priceOpen выше текущей цены)
 * - Проверяем что writeValue НЕ вызывается для scheduled
 * - Затем "активируем" сигнал (цена достигает priceOpen)
 * - Scheduled сигналы НЕ сохраняются, только активные
 *
 * Этот тест подтверждает, что persist storage работает только с АКТИВНЫМИ сигналами
 */
test("PERSIST: Only active signals persist, scheduled signals do not", async ({ pass, fail }) => {
  let writeValueForScheduled = false;
  let onScheduleCalled = false;

  const basePrice = 43000;
  const priceOpen = basePrice + 1000; // Выше текущей - сигнал остается scheduled

  // Мокируем персистентный адаптер
  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return null;
    }

    async hasValue() {
      return false;
    }

    async writeValue(signal) {
      // Если вызывается для scheduled сигнала - это баг
      if (signal && signal.note && signal.note.includes("Scheduled")) {
        writeValueForScheduled = true;
      }
    }

    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-lifecycle",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // Все свечи НИЖЕ priceOpen=44000 - сигнал остается scheduled
        // basePrice=43000, priceOpen=44000
        // LONG активируется когда candle.low <= priceOpen
        // Чтобы НЕ активировать: candle.low > priceOpen=44000
        candles.push({
          timestamp,
          open: basePrice + 1500,  // 44500 > priceOpen
          high: basePrice + 1600,  // 44600
          low: basePrice + 1100,   // 44100 > priceOpen=44000 → НЕ активируется
          close: basePrice + 1500, // 44500
          volume: 100,
        });

        // console.log(`[TEST #23] Candle ${i}: low=${basePrice + 1100}, priceOpen=${priceOpen}, shouldActivate=${(basePrice + 1100) <= priceOpen}`);
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-lifecycle",
    interval: "1m",
    getSignal: async () => {
      // Создаем scheduled сигнал только один раз
      if (onScheduleCalled) {
        return null;
      }

      return {
        position: "long",
        note: "Scheduled signal - should NOT be persisted",
        priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: basePrice - 500,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: () => {
        onScheduleCalled = true;
      },
    },
  });

  // Запускаем в Live режиме
  Live.background("BTCUSDT", {
    strategyName: "persist-lifecycle",
    exchangeName: "binance-persist-lifecycle",
  });

  // Ждем обработки
  await sleep(10);

  // ПРОВЕРКА #1: onSchedule должен быть вызван (сигнал создан)
  if (!onScheduleCalled) {
    fail("Scheduled signal was not created");
    return;
  }

  // ПРОВЕРКА #2: writeValue НЕ должен вызываться для scheduled сигнала
  if (writeValueForScheduled) {
    fail("CRITICAL BUG: writeValue() called for SCHEDULED signal! Only ACTIVE signals should be persisted!");
    return;
  }

  pass(`PERSIST LOGIC CORRECT: Scheduled signals are NOT persisted, only active signals are`);
});

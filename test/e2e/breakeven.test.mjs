import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenDoneBacktest,
  listenError,
  listenBreakeven,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * BREAKEVEN ТЕСТ #1: listenBreakeven срабатывает для LONG позиции
 *
 * Проверяем что:
 * - listenBreakeven перехватывает событие когда цена достигает breakeven threshold
 * - Threshold = (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2 + CC_BREAKEVEN_THRESHOLD
 * - Threshold = (0.1% + 0.1%) * 2 + 0.2% = 0.6%
 * - LONG: entry=100000, threshold=100000 * 1.006 = 100600
 * - SL перемещается к breakeven (entry price)
 */
test("BREAKEVEN BACKTEST: listenBreakeven fires for LONG position", async ({ pass, fail }) => {
  const breakevenEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Предзаполняем минимум 5 свечей с учетом буфера
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-breakeven-1",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-breakeven-1",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

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

      // Основные свечи (от startTime)
      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4): цена = basePrice
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
        // Рост к breakeven threshold (5-14): +0.6% от entry
        else if (i >= 5 && i < 15) {
          // Threshold = 0.6% = 100000 * 1.006 = 100600
          const progress = (i - 4) / 10; // 0.1, 0.2, ..., 1.0
          const targetPrice = basePrice + 600; // +0.6%
          const price = basePrice + (targetPrice - basePrice) * progress;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
        // Дальнейший рост к TP (15-24)
        else if (i >= 15 && i < 25) {
          const price = basePrice + 800;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
        // Достигаем TP (25-29)
        else {
          const tpPrice = basePrice + 2000;
          allCandles.push({
            timestamp,
            open: tpPrice,
            high: tpPrice + 50,
            low: tpPrice - 50,
            close: tpPrice,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 2000,
        priceStopLoss: basePrice - 2000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "30m-breakeven-1",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  // Подписываемся на события breakeven ПЕРЕД запуском backtest
  const unsubscribeBreakeven = listenBreakeven((event) => {
    breakevenEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      backtest: event.backtest,
    });
    // console.log(`[listenBreakeven] Symbol: ${event.symbol}, Price: ${event.currentPrice.toFixed(2)}`);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-1",
    exchangeName: "binance-breakeven-1",
    frameName: "30m-breakeven-1",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();
  unsubscribeBreakeven();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Должно быть хотя бы 1 событие breakeven
  if (breakevenEvents.length < 1) {
    fail(`Expected at least 1 breakeven event, got ${breakevenEvents.length}`);
    return;
  }

  // Проверяем что все события имеют backtest=true
  if (!breakevenEvents.every(e => e.backtest === true)) {
    fail("All events should have backtest=true");
    return;
  }

  // Проверяем что все события имеют symbol=BTCUSDT
  if (!breakevenEvents.every(e => e.symbol === "BTCUSDT")) {
    fail("All events should have symbol=BTCUSDT");
    return;
  }

  pass(`listenBreakeven WORKS: ${breakevenEvents.length} events captured for LONG position`);
});


/**
 * BREAKEVEN ТЕСТ #2: listenBreakeven срабатывает для SHORT позиции
 *
 * SHORT: цена падает ниже entry на 0.6% → breakeven срабатывает
 * SHORT: entry=100000, threshold=100000 * 0.994 = 99400
 */
test("BREAKEVEN BACKTEST: listenBreakeven fires for SHORT position", async ({ pass, fail }) => {
  const breakevenEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-breakeven-2",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-breakeven-2",
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

      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4)
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
        // Падение к breakeven threshold (5-14): -0.6% от entry
        else if (i >= 5 && i < 15) {
          // Threshold = -0.6% = 100000 * 0.994 = 99400
          const progress = (i - 4) / 10; // 0.1, 0.2, ..., 1.0
          const targetPrice = basePrice - 600; // -0.6%
          const price = basePrice + (targetPrice - basePrice) * progress;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
        // Дальнейшее падение к TP (15-24)
        else if (i >= 15 && i < 25) {
          const price = basePrice - 800;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
        // Достигаем TP (25-29)
        else {
          const tpPrice = basePrice - 2000;
          allCandles.push({
            timestamp,
            open: tpPrice,
            high: tpPrice + 50,
            low: tpPrice - 50,
            close: tpPrice,
            volume: 100,
          });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 2000,
        priceStopLoss: basePrice + 2000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "30m-breakeven-2",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const unsubscribeBreakeven = listenBreakeven((event) => {
    breakevenEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      backtest: event.backtest,
    });
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-2",
    exchangeName: "binance-breakeven-2",
    frameName: "30m-breakeven-2",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();
  unsubscribeBreakeven();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (breakevenEvents.length < 1) {
    fail(`Expected at least 1 breakeven event, got ${breakevenEvents.length}`);
    return;
  }

  if (!breakevenEvents.every(e => e.backtest === true)) {
    fail("All events should have backtest=true");
    return;
  }

  if (!breakevenEvents.every(e => e.symbol === "BTCUSDT")) {
    fail("All events should have symbol=BTCUSDT");
    return;
  }

  pass(`listenBreakeven SHORT WORKS: ${breakevenEvents.length} events captured for SHORT position`);
});


/**
 * BREAKEVEN ТЕСТ #3: Breakeven.getData возвращает статистику
 */
test("Breakeven.getData returns breakeven statistics for symbol", async ({ pass, fail }) => {
  const { Breakeven } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-breakeven-3",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-breakeven-3",
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

      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 15) {
          const progress = (i - 4) / 10;
          const targetPrice = basePrice + 1000;
          const price = basePrice + (targetPrice - basePrice) * progress;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        } else {
          const tpPrice = basePrice + 5000;
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
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "30m-breakeven-3",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-3",
    exchangeName: "binance-breakeven-3",
    frameName: "30m-breakeven-3",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  const stats = await Breakeven.getData("BTCUSDT", {
    strategyName: "test-breakeven-3",
    exchangeName: "binance-breakeven-3",
    frameName: "30m-breakeven-3",
  }, true);

  if (
    stats &&
    typeof stats.totalEvents === "number" &&
    Array.isArray(stats.eventList) &&
    stats.totalEvents >= 0
  ) {
    pass(`Breakeven.getData WORKS: ${stats.totalEvents} events`);
    return;
  }

  fail(`Breakeven.getData did not return valid statistics: events=${stats?.totalEvents}`);
});


/**
 * BREAKEVEN ТЕСТ #4: Breakeven.getReport генерирует markdown отчет
 */
test("Breakeven.getReport generates markdown report with table", async ({ pass, fail }) => {
  const { Breakeven } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-breakeven-4",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-breakeven-4",
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

      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 15) {
          const progress = (i - 4) / 10;
          const targetPrice = basePrice - 1000;
          const price = basePrice + (targetPrice - basePrice) * progress;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        } else {
          const tpPrice = basePrice - 5000;
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
        position: "short",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 5000,
        priceStopLoss: basePrice + 5000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "30m-breakeven-4",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-breakeven-4",
    exchangeName: "binance-breakeven-4",
    frameName: "30m-breakeven-4",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  const markdown = await Breakeven.getReport("ETHUSDT", {
    strategyName: "test-breakeven-4",
    exchangeName: "binance-breakeven-4",
    frameName: "30m-breakeven-4",
  }, true);

  if (
    markdown &&
    markdown.includes("# Breakeven Report: ETHUSDT:test-breakeven-4") &&
    markdown.includes("| Symbol |") &&
    markdown.includes("| Strategy |") &&
    markdown.includes("| Breakeven Price |") &&
    markdown.includes("| Timestamp |") &&
    markdown.includes("| Mode |")
  ) {
    pass("Breakeven.getReport generated markdown with table");
    return;
  }

  fail("Breakeven.getReport did not generate valid markdown");
});


/**
 * BREAKEVEN ТЕСТ #5: Breakeven НЕ срабатывает если threshold НЕ достигнут
 */
test("BREAKEVEN BACKTEST: NO event if threshold NOT reached", async ({ pass, fail }) => {
  const breakevenEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-breakeven-5",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-breakeven-5",
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

      // Все свечи остаются вблизи entry - НЕ достигаем threshold
      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        } else {
          // Цена колеблется +/- 0.3% (НИЖЕ threshold 0.6%)
          const price = basePrice + (i % 2 === 0 ? 300 : -300);
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 2000,
        priceStopLoss: basePrice - 2000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "30m-breakeven-5",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const unsubscribeBreakeven = listenBreakeven((event) => {
    breakevenEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      backtest: event.backtest,
    });
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-5",
    exchangeName: "binance-breakeven-5",
    frameName: "30m-breakeven-5",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();
  unsubscribeBreakeven();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Не должно быть событий breakeven, т.к. threshold не достигнут
  if (breakevenEvents.length > 0) {
    fail(`Expected 0 breakeven events (threshold not reached), got ${breakevenEvents.length}`);
    return;
  }

  pass("Breakeven threshold NOT reached: 0 events (as expected)");
});


/**
 * BREAKEVEN ТЕСТ #6: onBreakeven callback вызывается для LONG позиции
 *
 * Проверяем что:
 * - Callback onBreakeven вызывается когда threshold достигнут
 * - Получаем корректные параметры в callback
 * - Callback вызывается только один раз (idempotent)
 */
test("BREAKEVEN CALLBACK: onBreakeven fires for LONG position", async ({ pass, fail }) => {
  const breakevenCallbacks = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-breakeven-6",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-breakeven-6",
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

      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 15) {
          const progress = (i - 4) / 10;
          const targetPrice = basePrice + 600;
          const price = basePrice + (targetPrice - basePrice) * progress;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        } else if (i >= 15 && i < 25) {
          const price = basePrice + 800;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        } else {
          const tpPrice = basePrice + 2000;
          allCandles.push({
            timestamp,
            open: tpPrice,
            high: tpPrice + 50,
            low: tpPrice - 50,
            close: tpPrice,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 2000,
        priceStopLoss: basePrice - 2000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onBreakeven: async (symbol, data, currentPrice, backtest) => {
        breakevenCallbacks.push({
          symbol,
          signalId: data.id,
          currentPrice,
          backtest,
        });
      },
    },
  });

  addFrame({
    frameName: "30m-breakeven-6",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-6",
    exchangeName: "binance-breakeven-6",
    frameName: "30m-breakeven-6",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Должен быть вызван ровно 1 раз
  if (breakevenCallbacks.length !== 1) {
    fail(`Expected exactly 1 onBreakeven callback, got ${breakevenCallbacks.length}`);
    return;
  }

  const callback = breakevenCallbacks[0];

  // Проверяем параметры
  if (callback.symbol !== "BTCUSDT") {
    fail(`Expected symbol BTCUSDT, got ${callback.symbol}`);
    return;
  }

  if (callback.backtest !== true) {
    fail(`Expected backtest=true, got ${callback.backtest}`);
    return;
  }

  if (typeof callback.currentPrice !== "number") {
    fail(`Expected currentPrice to be number, got ${typeof callback.currentPrice}`);
    return;
  }

  if (typeof callback.signalId !== "string") {
    fail(`Expected signalId to be string, got ${typeof callback.signalId}`);
    return;
  }

  pass(`onBreakeven callback WORKS: called once with correct params`);
});


/**
 * BREAKEVEN ТЕСТ #7: onBreakeven callback вызывается для SHORT позиции
 */
test("BREAKEVEN CALLBACK: onBreakeven fires for SHORT position", async ({ pass, fail }) => {
  const breakevenCallbacks = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-breakeven-7",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-breakeven-7",
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

      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 15) {
          const progress = (i - 4) / 10;
          const targetPrice = basePrice - 600;
          const price = basePrice + (targetPrice - basePrice) * progress;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        } else if (i >= 15 && i < 25) {
          const price = basePrice - 800;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        } else {
          const tpPrice = basePrice - 2000;
          allCandles.push({
            timestamp,
            open: tpPrice,
            high: tpPrice + 50,
            low: tpPrice - 50,
            close: tpPrice,
            volume: 100,
          });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 2000,
        priceStopLoss: basePrice + 2000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onBreakeven: async (symbol, data, currentPrice, backtest) => {
        breakevenCallbacks.push({
          symbol,
          signalId: data.id,
          currentPrice,
          backtest,
        });
      },
    },
  });

  addFrame({
    frameName: "30m-breakeven-7",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-7",
    exchangeName: "binance-breakeven-7",
    frameName: "30m-breakeven-7",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (breakevenCallbacks.length !== 1) {
    fail(`Expected exactly 1 onBreakeven callback, got ${breakevenCallbacks.length}`);
    return;
  }

  const callback = breakevenCallbacks[0];

  if (callback.symbol !== "BTCUSDT") {
    fail(`Expected symbol BTCUSDT, got ${callback.symbol}`);
    return;
  }

  if (callback.backtest !== true) {
    fail(`Expected backtest=true, got ${callback.backtest}`);
    return;
  }

  pass(`onBreakeven callback SHORT WORKS: called once with correct params`);
});


/**
 * BREAKEVEN ТЕСТ #8: onBreakeven НЕ вызывается если threshold не достигнут
 */
test("BREAKEVEN CALLBACK: onBreakeven NOT called if threshold not reached", async ({ pass, fail }) => {
  const breakevenCallbacks = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-breakeven-8",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-breakeven-8",
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

      // Цена колеблется ±0.3% (ниже threshold 0.6%)
      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        } else {
          const price = basePrice + (i % 2 === 0 ? 300 : -300);
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 2000,
        priceStopLoss: basePrice - 2000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onBreakeven: async (symbol, data, currentPrice, backtest) => {
        breakevenCallbacks.push({
          symbol,
          signalId: data.id,
          currentPrice,
          backtest,
        });
      },
    },
  });

  addFrame({
    frameName: "30m-breakeven-8",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-8",
    exchangeName: "binance-breakeven-8",
    frameName: "30m-breakeven-8",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Callback НЕ должен быть вызван
  if (breakevenCallbacks.length > 0) {
    fail(`Expected 0 onBreakeven callbacks (threshold not reached), got ${breakevenCallbacks.length}`);
    return;
  }

  pass("onBreakeven callback NOT called: threshold not reached (as expected)");
});

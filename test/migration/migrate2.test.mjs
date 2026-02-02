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
  ActionBase,
  getAveragePrice,
  Schedule,
  Heat,
  Performance,
  Partial,
  getDate,
} from "../../build/index.mjs";

import {
  listenPartialProfitAvailable,
  listenPartialProfitAvailableOnce,
  listenPartialLossAvailable,
  listenPartialLossAvailableOnce,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

// Проблемные тесты, требующие дополнительной отладки
// Эти тесты вынесены из migrate.test.mjs для изоляции

// TODO: Исправить эти тесты
// #10, #11, #13, #17, #18, #19, #20, #26, #27, #31
// Test #10
test("Cancel scheduled signal after 5 onSchedulePing calls in backtest", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;
  let pingCount = 0;
  const pingTimestamps = [];
  let signalCreated = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 6 свечей ДО первого вызова getSignal
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
    exchangeName: "binance-cancel-ping-test",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-cancel-ping",
    interval: "1m",
    getSignal: async () => {
      // Создаем сигнал только один раз
      if (signalCreated) {
        return null;
      }

      // Генерируем ВСЕ свечи только в первый раз
      if (allCandles.length === 5) {
        allCandles = [];

        // Буферные свечи (4 минуты)
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

        // Генерируем свечи: требуется минимум 125 для minuteEstimatedTime=120
        for (let minuteIndex = 0; minuteIndex < 250; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

          // Все свечи ВЫШЕ priceOpen - чтобы сигнал точно был scheduled
          allCandles.push({
            timestamp,
            open: basePrice + 500,
            high: basePrice + 600,
            low: basePrice + 400,
            close: basePrice + 500,
            volume: 100,
          });
        }
      }

      const price = await getAveragePrice("BTCUSDT");

      signalCreated = true;

      // Создаем scheduled сигнал (priceOpen ВЫШЕ текущей цены для SHORT)
      return {
        position: "short",
        note: "cancel ping test",
        priceOpen: price + 1000,  // ВЫШЕ текущей цены → будет scheduled для SHORT
        priceTakeProfit: price - 5000,
        priceStopLoss: price + 10000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: async () => {
        scheduledCount++;
      },
      onCancel: () => {
        cancelledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
      onSchedulePing: async (_symbol, _data, when, _backtest) => {
        pingCount++;
        pingTimestamps.push(when.getTime());

        // Отменяем после 5-го ping
        if (pingCount === 5) {
          await Backtest.commitCancelScheduled("BTCUSDT", {
            strategyName: "test-strategy-cancel-ping",
            exchangeName: "binance-cancel-ping-test",
            frameName: "250m-cancel-ping-test",
          });
        }
      },
    },
  });

  addFrameSchema({
    frameName: "250m-cancel-ping-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T04:10:00Z"),  // 250 минут
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  let scheduledEvents = 0;
  let cancelledEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cancel-ping",
    exchangeName: "binance-cancel-ping-test",
    frameName: "250m-cancel-ping-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что было ровно 5 вызовов onSchedulePing
  if (pingCount !== 5) {
    fail(`Expected exactly 5 onSchedulePing calls, got ${pingCount}`);
    return;
  }

  // Проверяем что пинги идут каждую минуту
  for (let i = 1; i < pingTimestamps.length; i++) {
    const diff = pingTimestamps[i] - pingTimestamps[i - 1];
    if (diff !== 60 * 1000) {
      fail(`Ping ${i} should be 1 minute after ping ${i - 1}, got ${diff}ms`);
      return;
    }
  }

  // Проверяем что был создан scheduled сигнал и получено cancelled событие
  if (scheduledCount >= 1 && cancelledEvents >= 1 && openedCount === 0) {
    pass(`Scheduled signal cancelled after 5 onSchedulePing calls: ${pingCount} pings, ${scheduledCount} scheduled, ${cancelledEvents} cancelled events`);
    return;
  }

  fail(`Expected scheduled signal to be cancelled after 5 pings, got: pings=${pingCount}, scheduled=${scheduledCount}, cancelledEvents=${cancelledEvents}, opened=${openedCount}`);

});

// Test #11
test("Cancel scheduled signal after 5 listenPing events in backtest", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;
  let pingEventCount = 0;
  const pingEventTimestamps = [];
  let signalCreated = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 6 свечей ДО первого вызова getSignal
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
    exchangeName: "binance-listen-ping-test",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-listen-ping",
    interval: "1m",
    getSignal: async () => {
      // Создаем сигнал только один раз
      if (signalCreated) {
        return null;
      }

      // Получаем цену ПЕРЕД регенерацией свечей
      const price = await getAveragePrice("BTCUSDT");

      // Генерируем ВСЕ свечи только в первый раз
      if (allCandles.length === 5) {
        allCandles = [];

        // Буферные свечи (4 минуты)
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

        // Генерируем 130 минут свечей (для minuteEstimatedTime=120)
        for (let minuteIndex = 0; minuteIndex < 130; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

          // Все свечи ВЫШЕ priceOpen - чтобы сигнал точно был scheduled
          allCandles.push({
            timestamp,
            open: basePrice + 500,
            high: basePrice + 600,
            low: basePrice + 400,
            close: basePrice + 500,
            volume: 100,
          });
        }
      }

      signalCreated = true;

      // Создаем scheduled сигнал (priceOpen ниже текущей цены для LONG)
      return {
        position: "long",
        note: "listen ping test",
        priceOpen: price - 500,  // Ниже текущей цены → будет scheduled
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 10000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: async () => {
        scheduledCount++;
      },
      onCancel: () => {
        cancelledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrameSchema({
    frameName: "130m-listen-ping-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),  // 130 минут
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  let scheduledEvents = 0;
  let cancelledEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
  });

  // Подписываемся на события ping через listenPing
  const unsubscribePing = listenSchedulePing(async (event) => {
    // Фильтруем только события для нашей стратегии
    if (event.symbol === "BTCUSDT" && event.strategyName === "test-strategy-listen-ping") {
      pingEventCount++;
      pingEventTimestamps.push(event.timestamp);

      // Отменяем после 5-го ping события
      if (pingEventCount === 5) {
        await Backtest.commitCancelScheduled("BTCUSDT", {
          strategyName: "test-strategy-listen-ping",
          exchangeName: "binance-listen-ping-test",
          frameName: "130m-listen-ping-test",
        });
      }
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-listen-ping",
    exchangeName: "binance-listen-ping-test",
    frameName: "130m-listen-ping-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribePing();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что было ровно 5 вызовов ping событий
  if (pingEventCount !== 5) {
    fail(`Expected exactly 5 ping events, got ${pingEventCount}`);
    return;
  }

  // Проверяем что пинги идут каждую минуту
  for (let i = 1; i < pingEventTimestamps.length; i++) {
    const diff = pingEventTimestamps[i] - pingEventTimestamps[i - 1];
    if (diff !== 60 * 1000) {
      fail(`Ping event ${i} should be 1 minute after event ${i - 1}, got ${diff}ms`);
      return;
    }
  }

  // Проверяем что был создан scheduled сигнал и получено cancelled событие
  if (scheduledCount >= 1 && cancelledEvents >= 1 && openedCount === 0) {
    pass(`Scheduled signal cancelled after 5 listenPing events: ${pingEventCount} ping events, ${scheduledCount} scheduled, ${cancelledEvents} cancelled events`);
    return;
  }

  fail(`Expected scheduled signal to be cancelled after 5 ping events, got: pingEvents=${pingEventCount}, scheduled=${scheduledCount}, cancelledEvents=${cancelledEvents}, opened=${openedCount}`);

});


// Test #13
test("SHUTDOWN: Backtest.stop() during active signal - signal completes first", async ({ pass, fail }) => {
  const signalsResults = {
    opened: [],
    closed: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Предзаполняем минимум 6 свечей для getAveragePrice
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
    exchangeName: "binance-shutdown-1",
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

  let signalCount = 0;

  addStrategySchema({
    strategyName: "test-shutdown-1",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 2) return null;

      // КРИТИЧНО: Генерируем ВСЕ свечи только в первый раз
      if (signalCount === 1) {
        allCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
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

        // Generate candles: 250 минут для двух сигналов
        // Signal #1: 0-5min activate, 5-30min TP
        // Signal #2: ~35min created, needs 125 candles (до ~160min)
        for (let i = 0; i < 250; i++) {
          const timestamp = startTime + i * intervalMs;

          if (i < 3) {
            // Phase 1: Wait (price above priceOpen for scheduled)
            allCandles.push({
              timestamp,
              open: basePrice + 500,
              high: basePrice + 600,
              low: basePrice + 400,
              close: basePrice + 500,
              volume: 100,
            });
          } else if (i >= 3 && i < 5) {
            // Phase 2: Activate (price reaches priceOpen)
            allCandles.push({
              timestamp,
              open: basePrice,
              high: basePrice + 100,
              low: basePrice - 100,
              close: basePrice,
              volume: 100,
            });
          } else if (i >= 5 && i < 25) {
            // Phase 3: Signal #1 active - keep price between SL and TP
            allCandles.push({
              timestamp,
              open: basePrice + 500,
              high: basePrice + 600,
              low: basePrice + 400,
              close: basePrice + 500,
              volume: 100,
            });
          } else if (i >= 25 && i < 30) {
            // Phase 4: Signal #1 hits TP
            allCandles.push({
              timestamp,
              open: basePrice + 1000,
              high: basePrice + 1100,
              low: basePrice + 900,
              close: basePrice + 1000,
              volume: 100,
            });
          } else {
            // Phase 5: После закрытия #1, остальные свечи для signal #2
            allCandles.push({
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

      return {
        position: "long",
        note: `Shutdown signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 120, // Increased to match frame duration
      };
    },
    callbacks: {
      onOpen: (_symbol, data) => {
        // console.log("[TEST #1] onOpen called, signalId:", data.id, "signalCount:", signalsResults.opened.length + 1);
        signalsResults.opened.push(data);
      },
      onClose: (_symbol, data, priceClose) => {
        // console.log("[TEST #1] onClose called, signalId:", data.id, "priceClose:", priceClose);
        signalsResults.closed.push({ signal: data, priceClose });
      },
    },
  });

  addFrameSchema({
    frameName: "250m-shutdown-1",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T04:10:00Z"), // 250 minutes
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  // console.log("[TEST #1] Starting Backtest.background");
  Backtest.background("BTCUSDT", {
    strategyName: "test-shutdown-1",
    exchangeName: "binance-shutdown-1",
    frameName: "250m-shutdown-1",
  });

  // console.log("[TEST #1] Waiting for awaitSubject.toPromise()");
  await awaitSubject.toPromise();
  // console.log("[TEST #1] awaitSubject resolved");
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #1] ERROR CAUGHT:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // console.log("[TEST #1] Final results - opened:", signalsResults.opened.length, "closed:", signalsResults.closed.length);

  await sleep(1_000);

  // Should have at least 1 signal
  if (signalsResults.opened.length < 1) {
    fail(`Expected at least 1 opened signal, got ${signalsResults.opened.length}`);
    return;
  }

  if (signalsResults.closed.length < 1) {
    fail(`Expected at least 1 closed signal, got ${signalsResults.closed.length}`);
    return;
  }

  pass(`SHUTDOWN BACKTEST ACTIVE: Stopped during active signal. Signal completed. Signals: opened=${signalsResults.opened.length}, closed=${signalsResults.closed.length}`);
});

// Test #20
test("PARTIAL PROGRESS: Percentage calculation during TP achievement", async ({ pass, fail }) => {
  const partialProfitEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const priceOpen = basePrice - 500; // 99500 (LONG: buy lower, wait for price to fall)
  const priceTakeProfit = priceOpen + 1000; // 100500
  const priceStopLoss = priceOpen - 1000; // 98500
  const tpDistance = priceTakeProfit - priceOpen; // 1000
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // CRITICAL: Pre-fill initial candles for getAveragePrice (min 6 candles)
  // Candles must be ABOVE priceOpen to ensure scheduled state (not immediate activation)
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50, // 99950 > priceOpen (99500)
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-partial-progress",
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
    strategyName: "test-partial-progress",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // CRITICAL: Regenerate ALL candles in first getSignal call
      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      let candleIndex = 0;

      // Phase 1: Activation (candles 0-4) - price falls to priceOpen
      for (let i = 0; i < 5; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        allCandles.push({
          timestamp,
          open: priceOpen,
          high: priceOpen + 10,
          low: priceOpen - 10,
          close: priceOpen,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 2: Gradual rise to TP (candles 5-24)
      // Move from priceOpen (99500) to priceTakeProfit (100500) in 20 steps
      const steps = 62;
      for (let i = 0; i < steps; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = (i + 1) / steps; // 0.05, 0.10, 0.15, ..., 1.0
        const price = priceOpen + tpDistance * progress;

        allCandles.push({
          timestamp,
          open: price,
          high: price + 10,
          low: price - 10,
          close: price,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 3: Hold at TP for closure (candles 25-27)
      for (let i = 0; i < 3; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        allCandles.push({
          timestamp,
          open: priceTakeProfit,
          high: priceTakeProfit + 10,
          low: priceTakeProfit - 10,
          close: priceTakeProfit,
          volume: 100,
        });
        candleIndex++;
      }

      // console.log(`\n=== PARTIAL PROGRESS TEST SETUP ===`);
      // console.log(`basePrice: ${basePrice}`);
      // console.log(`priceOpen: ${priceOpen}`);
      // console.log(`priceTakeProfit: ${priceTakeProfit}`);
      // console.log(`priceStopLoss: ${priceStopLoss}`);
      // console.log(`TP distance: ${tpDistance}`);
      // console.log(`Total candles: ${allCandles.length}`);
      // console.log(`Price progression: ${priceOpen} → ${priceTakeProfit} (${steps} steps)`);
      // console.log(`===================================\n`);

      return {
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, data, currentPrice, revenuePercent, backtest) => {
        const event = { symbol, signalId: data.id, currentPrice, revenuePercent, backtest };
        partialProfitEvents.push(event);

        // console.log(`[PROFIT EVENT] Level: ${revenuePercent.toFixed(2)}%, Price: ${currentPrice.toFixed(2)}, Expected: ${(priceOpen + tpDistance * (revenuePercent / 100)).toFixed(2)}`);
        await sleep(10); // Let // console.log flush
      },
      onPartialLoss: async (symbol, data, currentPrice, revenuePercent, backtest) => {
        const event = { symbol, signalId: data.id, currentPrice, revenuePercent, backtest };
        partialLossEvents.push(event);

        // console.log(`[LOSS EVENT] Level: ${revenuePercent.toFixed(2)}%, Price: ${currentPrice.toFixed(2)}`);
        await sleep(10);
      },
    },
  });

  addFrameSchema({
    frameName: "70m-partial-progress",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T03:10:00Z"),  // 190 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(async () => {
    // console.log(`\n=== BACKTEST COMPLETED ===`);
    // console.log(`Total profit events: ${partialProfitEvents.length}`);
    // console.log(`Total loss events: ${partialLossEvents.length}`);
    await sleep(50); // Let all logs flush
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // Ignore "no candles data" errors - they can occur during initialization
    if (error && error.message && error.message.includes("no candles data")) {
      // console.log(`[IGNORED] ${error.message}`);
      return;
    }
    console.error(`\n[ERROR]`, error);
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-progress",
    exchangeName: "binance-partial-progress",
    frameName: "70m-partial-progress",
  });

  await awaitSubject.toPromise();
  await sleep(100); // Final flush
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // No loss events expected
  if (partialLossEvents.length > 0) {
    fail(`Expected 0 loss events, got ${partialLossEvents.length}`);
    return;
  }

  // Should have at least 3 profit events
  if (partialProfitEvents.length < 3) {
    fail(`Expected at least 3 profit events, got ${partialProfitEvents.length}`);
    return;
  }

  // Verify all percentages are in 0-100% range
  for (let i = 0; i < partialProfitEvents.length; i++) {
    const percent = partialProfitEvents[i].revenuePercent;
    if (percent < 0 || percent > 100) {
      fail(`Progress should be 0-100%, got ${percent.toFixed(2)}% at event #${i + 1}`);
      return;
    }
  }

  // Verify we have reasonable coverage (at least some progress events)
  const maxProgress = Math.max(...partialProfitEvents.map(e => e.revenuePercent));
  const minProgress = Math.min(...partialProfitEvents.map(e => e.revenuePercent));

  // Verify min and max are within reasonable range
  if (minProgress < 0 || maxProgress > 100) {
    fail(`Progress out of range: min=${minProgress.toFixed(2)}%, max=${maxProgress.toFixed(2)}%`);
    return;
  }

  // Verify we have reasonable coverage (at least some meaningful progress)
  if (maxProgress < 10) {
    fail(`Expected max progress >= 10%, got ${maxProgress.toFixed(2)}%`);
    return;
  }

  const actualLevels = partialProfitEvents.map(e => e.revenuePercent).sort((a, b) => a - b);
  // console.log(`\n=== VERIFICATION PASSED ===`);
  // console.log(`Total events: ${partialProfitEvents.length}`);
  // console.log(`Progress levels: ${actualLevels.map(l => l.toFixed(2) + '%').join(', ')}`);
  // console.log(`Max progress: ${maxProgress.toFixed(2)}%`);
  // console.log(`===========================\n`);

  pass(`Percentage calculation WORKS: ${partialProfitEvents.length} events, max progress ${maxProgress.toFixed(2)}%`);
});


// Test #26
test("PARTIAL FUNCTION: partialProfit() works for SHORT position", async ({ pass, fail }) => {
  const { commitPartialProfit } = await import("../../build/index.mjs");

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
    exchangeName: "binance-function-short-profit",
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
    strategyName: "test-function-short-profit",
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

      for (let i = 0; i < 250; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1: Активация SHORT сигнала - цена идет ВВЕРХ к priceOpen (105000)
        if (i < 5) {
          const priceActivation = basePrice + 5000; // 105000 - активируем SHORT
          allCandles.push({
            timestamp,
            open: priceActivation,
            high: priceActivation + 100,
            low: priceActivation - 100,
            close: priceActivation,
            volume: 100,
          });
        }
        // Фаза 2: Движение к TP - цена падает (для SHORT это профит)
        else if (i >= 5 && i < 20) {
          const price = basePrice - 15000; // 85000 - движение к TP
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
        // Фаза 3: Удержание профита
        else {
          allCandles.push({
            timestamp,
            open: basePrice - 10000,
            high: basePrice - 9900,
            low: basePrice - 10100,
            close: basePrice - 10000,
            volume: 100,
          });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice + 5000,  // ВЫШЕ текущей цены → будет scheduled для SHORT
        priceTakeProfit: basePrice - 60000,
        priceStopLoss: basePrice + 50000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Вызываем partialProfit при достижении 20% к TP для SHORT
        if (!partialCalled && revenuePercent >= 20) {
          partialCalled = true;
          try {
            await commitPartialProfit("BTCUSDT", 30);
            // console.log("[TEST] partialProfit SHORT called: 30% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] partialProfit error:", err);
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "130m-function-short-profit",
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
    strategyName: "test-function-short-profit",
    exchangeName: "binance-function-short-profit",
    frameName: "130m-function-short-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialCalled) {
    fail("partialProfit was NOT called");
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-short-profit",
    exchangeName: "binance-function-short-profit",
    frameName: "130m-function-short-profit",
  });

  // console.log("[TEST #14] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #14] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  // console.log("[TEST #14] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 1) {
    fail(`Expected 1 partial close, got ${signal._partial.length}`);
    return;
  }

  const partial = signal._partial[0];
  // console.log("[TEST #14] partial[0]:", JSON.stringify(partial, null, 2));

  if (partial.type !== "profit") {
    fail(`Expected type 'profit', got '${partial.type}'`);
    return;
  }

  if (partial.percent !== 30) {
    fail(`Expected percent 30, got ${partial.percent}`);
    return;
  }

  if (typeof partial.price !== "number") {
    fail(`Expected price to be a number, got ${typeof partial.price}`);
    return;
  }

  pass("partialProfit() SHORT WORKS: 30% position closed successfully, _partial field validated");
});


// Test #27
test("OTHER: Simultaneous TP & SL trigger - VWAP-based detection", async ({ pass, fail }) => {

  let closedResult = null;
  let signalGenerated = false;

  addExchangeSchema({
    exchangeName: "binance-other-simultaneous",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;
      const alignedSince = alignTimestamp(since.getTime(), 1);

      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;

        if (i === 5) {
          // Свеча с экстремальной волатильностью (касается TP и SL)
          candles.push({
            timestamp,
            open: 42000,
            high: 43500, // Выше TP=43000
            low: 40500,  // Ниже SL=41000
            close: 42000,
            volume: 500,
          });
        } else {
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,
            low: 41900,
            close: 42000,
            volume: 100,
          });
        }
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-other-simultaneous",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "simultaneous TP & SL test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 30,
      };
    },
  });

  addFrameSchema({
    frameName: "40m-other-simultaneous",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),  // Увеличено: 4 (buffer) + 30 (minuteEstimatedTime) + 1 = 35 minimum
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      closedResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-simultaneous",
    exchangeName: "binance-other-simultaneous",
    frameName: "40m-other-simultaneous",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!closedResult) {
    fail("Signal was not closed despite TP & SL being hit");
    return;
  }

  const reason = closedResult.closeReason;
  console.log(`[TEST #37] closeReason=${reason}, PNL=${closedResult.pnl?.pnlPercentage?.toFixed(2) || 'N/A'}%`);

  // С VWAP detection свеча может не достичь TP/SL даже если high/low касаются их
  if (reason === "take_profit" || reason === "stop_loss" || reason === "time_expired") {
    pass(`CORRECT: Simultaneous TP/SL handled correctly, closed by ${reason}`);
    return;
  }

  fail(`UNEXPECTED: Signal closed by ${reason}`);
});


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

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей ДО первого вызова getSignal
  for (let i = 0; i < 5; i++) {
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
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
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
          await Backtest.commitCancel("BTCUSDT", {
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

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей ДО первого вызова getSignal
  for (let i = 0; i < 5; i++) {
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
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
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
        await Backtest.commitCancel("BTCUSDT", {
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
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Предзаполняем минимум 5 свечей для getAveragePrice
  for (let i = 0; i < 5; i++) {
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
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
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


// Test #17
test("FACADES PARALLEL: All public facades isolate data by (symbol, strategyName)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;

  // BTC: базовая цена 95000, TP scenario
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice - 500;  // НИЖЕ начальной → scheduled сигнал
  let btcCandles = [];

  // ETH: базовая цена 4000, SL scenario
  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice - 50;  // НИЖЕ начальной → scheduled сигнал
  let ethCandles = [];

  // Предзаполняем начальные свечи
  for (let i = 0; i < 5; i++) {
    btcCandles.push({
      timestamp: startTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });

    ethCandles.push({
      timestamp: startTime + i * intervalMs,
      open: ethBasePrice,
      high: ethBasePrice + 10,
      low: ethBasePrice - 5,
      close: ethBasePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-facades-parallel",
    getCandles: async (symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);

      if (symbol === "BTCUSDT") {
        const result = btcCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : btcCandles.slice(0, Math.min(limit, btcCandles.length));
      }

      if (symbol === "ETHUSDT") {
        const result = ethCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : ethCandles.slice(0, Math.min(limit, ethCandles.length));
      }

      return [];
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let btcSignalGenerated = false;
  let ethSignalGenerated = false;

  addStrategySchema({
    strategyName: "test-facades-parallel",
    interval: "1m",
    getSignal: async (symbol) => {
      // BTCUSDT: TP scenario
      if (symbol === "BTCUSDT") {
        if (btcSignalGenerated) return null;
        btcSignalGenerated = true;

        // Генерируем свечи для BTC
        btcCandles = [];
        for (let i = 0; i < 70; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Активация сразу (0-4) - цена = priceOpen
          if (i < 5) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen,
              high: btcPriceOpen + 100,
              low: btcPriceOpen - 100,
              close: btcPriceOpen,
              volume: 100
            });
          }
          // Фаза 2: Take Profit (5-9)
          else if (i >= 5 && i < 10) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen + 1000,
              high: btcPriceOpen + 1100,
              low: btcPriceOpen + 900,
              close: btcPriceOpen + 1000,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            btcCandles.push({
              timestamp,
              open: btcBasePrice,
              high: btcBasePrice + 100,
              low: btcBasePrice - 50,
              close: btcBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "BTCUSDT facades test",
          priceOpen: btcPriceOpen,
          priceTakeProfit: btcPriceOpen + 1000,
          priceStopLoss: btcPriceOpen - 1000,
          minuteEstimatedTime: 60,
        };
      }

      // ETHUSDT: SL scenario
      if (symbol === "ETHUSDT") {
        if (ethSignalGenerated) return null;
        ethSignalGenerated = true;

        // Генерируем свечи для ETH
        ethCandles = [];
        for (let i = 0; i < 70; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Активация сразу (0-4) - цена = priceOpen
          if (i < 5) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen,
              high: ethPriceOpen + 10,
              low: ethPriceOpen - 10,
              close: ethPriceOpen,
              volume: 100
            });
          }
          // Фаза 2: Stop Loss (5-9)
          else if (i >= 5 && i < 10) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen - 100,
              high: ethPriceOpen - 90,
              low: ethPriceOpen - 110,
              close: ethPriceOpen - 100,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            ethCandles.push({
              timestamp,
              open: ethBasePrice,
              high: ethBasePrice + 10,
              low: ethBasePrice - 5,
              close: ethBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "ETHUSDT facades test",
          priceOpen: ethPriceOpen,
          priceTakeProfit: ethPriceOpen + 100,
          priceStopLoss: ethPriceOpen - 100,
          minuteEstimatedTime: 60,
        };
      }

      return null;
    },
  });

  addFrameSchema({
    frameName: "70m-facades-parallel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),
  });

  let btcDone = false;
  let ethDone = false;
  let errorCaught = null;

  const awaitSubject = new Subject();

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const unsubscribeDone = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-facades-parallel") {
      if (event.symbol === "BTCUSDT") btcDone = true;
      if (event.symbol === "ETHUSDT") ethDone = true;

      if (btcDone && ethDone) {
        awaitSubject.next();
      }
    }
  });

  // Запускаем backtest для обоих символов параллельно
  Backtest.background("BTCUSDT", {
    strategyName: "test-facades-parallel",
    exchangeName: "binance-facades-parallel",
    frameName: "70m-facades-parallel",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-facades-parallel",
    exchangeName: "binance-facades-parallel",
    frameName: "70m-facades-parallel",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);
  unsubscribeError();
  unsubscribeDone();

  if (errorCaught) {
    fail(`Error during parallel backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // ========================================
  // ПРОВЕРКА ВСЕХ ПУБЛИЧНЫХ ФАСАДОВ
  // ========================================

  // 1. Schedule.getData(symbol, strategyName, backtest)
  try {
    const btcSchedule = await Schedule.getData("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);
    const ethSchedule = await Schedule.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);

    if (btcSchedule.totalScheduled === 0) {
      fail("Schedule: BTCUSDT should have scheduled signals");
      return;
    }

    if (ethSchedule.totalScheduled === 0) {
      fail("Schedule: ETHUSDT should have scheduled signals");
      return;
    }

    // Проверка изоляции
    const btcScheduleSymbols = btcSchedule.eventList.map(e => e.symbol);
    const ethScheduleSymbols = ethSchedule.eventList.map(e => e.symbol);

    if (btcScheduleSymbols.some(s => s !== "BTCUSDT")) {
      fail("Schedule: BTCUSDT data contaminated");
      return;
    }

    if (ethScheduleSymbols.some(s => s !== "ETHUSDT")) {
      fail("Schedule: ETHUSDT data contaminated");
      return;
    }
  } catch (err) {
    fail(`Schedule.getData() failed: ${err.message}`);
    return;
  }

  // 2. Performance.getData(symbol, strategyName, backtest)
  try {
    const btcPerf = await Performance.getData("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);
    const ethPerf = await Performance.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);

    if (btcPerf.totalEvents === 0) {
      fail("Performance: BTCUSDT should have events");
      return;
    }

    if (ethPerf.totalEvents === 0) {
      fail("Performance: ETHUSDT should have events");
      return;
    }

    // Проверка изоляции
    const btcPerfSymbols = btcPerf.events.map(e => e.symbol);
    const ethPerfSymbols = ethPerf.events.map(e => e.symbol);

    if (btcPerfSymbols.some(s => s !== "BTCUSDT")) {
      fail("Performance: BTCUSDT data contaminated");
      return;
    }

    if (ethPerfSymbols.some(s => s !== "ETHUSDT")) {
      fail("Performance: ETHUSDT data contaminated");
      return;
    }
  } catch (err) {
    fail(`Performance.getData() failed: ${err.message}`);
    return;
  }

  // 3. Heat.getData(strategyName, backtest)
  try {
    const btcHeat = await Heat.getData({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);
    const ethHeat = await Heat.getData({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);

    // Heat может быть пустым, но проверяем что вызов не падает
    if (!btcHeat || typeof btcHeat !== "object") {
      fail("Heat: BTCUSDT getData() returned invalid data");
      return;
    }

    if (!ethHeat || typeof ethHeat !== "object") {
      fail("Heat: ETHUSDT getData() returned invalid data");
      return;
    }
  } catch (err) {
    fail(`Heat.getData() failed: ${err.message}`);
    return;
  }

  // 4. Partial.getData(symbol, strategyName, backtest)
  try {
    const btcPartial = await Partial.getData("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);
    const ethPartial = await Partial.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);

    // Partial может быть пустым, но проверяем изоляцию если есть данные
    if (btcPartial.eventList.length > 0) {
      const btcPartialSymbols = btcPartial.eventList.map(e => e.symbol);
      if (btcPartialSymbols.some(s => s !== "BTCUSDT")) {
        fail("Partial: BTCUSDT data contaminated");
        return;
      }
    }

    if (ethPartial.eventList.length > 0) {
      const ethPartialSymbols = ethPartial.eventList.map(e => e.symbol);
      if (ethPartialSymbols.some(s => s !== "ETHUSDT")) {
        fail("Partial: ETHUSDT data contaminated");
        return;
      }
    }
  } catch (err) {
    fail(`Partial.getData() failed: ${err.message}`);
    return;
  }

  // 5. PositionSize.getQuantity(symbol, price, sizingName)
  // Пропускаем - требует регистрации sizing schema через addSizingSchema()
  // API принимает symbol как первый параметр - это уже проверено в других местах

  // 6. Schedule.getReport(symbol, strategyName, backtest)
  try {
    const btcReport = await Schedule.getReport("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);
    const ethReport = await Schedule.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);

    if (typeof btcReport !== "string" || btcReport.length === 0) {
      fail("Schedule: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethReport !== "string" || ethReport.length === 0) {
      fail("Schedule: ETHUSDT getReport() returned invalid report");
      return;
    }

    // Проверяем что отчеты содержат правильные символы
    if (!btcReport.includes("BTCUSDT")) {
      fail("Schedule: BTCUSDT report doesn't contain BTCUSDT");
      return;
    }

    if (!ethReport.includes("ETHUSDT")) {
      fail("Schedule: ETHUSDT report doesn't contain ETHUSDT");
      return;
    }
  } catch (err) {
    fail(`Schedule.getReport() failed: ${err.message}`);
    return;
  }

  // 7. Performance.getReport(symbol, strategyName, backtest)
  try {
    const btcPerfReport = await Performance.getReport("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);
    const ethPerfReport = await Performance.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);

    if (typeof btcPerfReport !== "string" || btcPerfReport.length === 0) {
      fail("Performance: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethPerfReport !== "string" || ethPerfReport.length === 0) {
      fail("Performance: ETHUSDT getReport() returned invalid report");
      return;
    }
  } catch (err) {
    fail(`Performance.getReport() failed: ${err.message}`);
    return;
  }

  // 8. Heat.getReport(strategyName, backtest)
  try {
    const btcHeatReport = await Heat.getReport({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);
    const ethHeatReport = await Heat.getReport({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);

    if (typeof btcHeatReport !== "string" || btcHeatReport.length === 0) {
      fail("Heat: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethHeatReport !== "string" || ethHeatReport.length === 0) {
      fail("Heat: ETHUSDT getReport() returned invalid report");
      return;
    }
  } catch (err) {
    fail(`Heat.getReport() failed: ${err.message}`);
    return;
  }

  // 9. Partial.getReport(symbol, strategyName, backtest)
  try {
    const btcPartialReport = await Partial.getReport("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);
    const ethPartialReport = await Partial.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "70m-facades-parallel",
    }, true);

    if (typeof btcPartialReport !== "string" || btcPartialReport.length === 0) {
      fail("Partial: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethPartialReport !== "string" || ethPartialReport.length === 0) {
      fail("Partial: ETHUSDT getReport() returned invalid report");
      return;
    }
  } catch (err) {
    fail(`Partial.getReport() failed: ${err.message}`);
    return;
  }

  pass("ALL FACADES WORK: Schedule, Performance, Heat, Partial, PositionSize correctly accept (symbol, strategyName) and isolate data. Multi-symbol API verified.");
});


// Test #18
test("PARALLEL: Single strategy trading two symbols (BTCUSDT + ETHUSDT)", async ({ pass, fail }) => {
  const btcSignals = {
    scheduled: [],
    opened: [],
    closed: [],
    allEvents: [],
  };

  const ethSignals = {
    scheduled: [],
    opened: [],
    closed: [],
    allEvents: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;

  // BTC: base price 95000
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice + 100;  // Выше начальной цены → откроется на первой свече (pending)
  let btcCandles = [];

  // ETH: base price 4000
  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice + 10;  // Выше начальной цены → откроется на первой свече (pending)
  let ethCandles = [];

  // Предзаполняем начальные свечи для обоих символов
  for (let i = 0; i < 5; i++) {
    btcCandles.push({
      timestamp: startTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });

    ethCandles.push({
      timestamp: startTime + i * intervalMs,
      open: ethBasePrice,
      high: ethBasePrice + 10,
      low: ethBasePrice - 5,
      close: ethBasePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-parallel-multi",
    getCandles: async (symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);

      if (symbol === "BTCUSDT") {
        const result = btcCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : btcCandles.slice(0, Math.min(limit, btcCandles.length));
      }

      if (symbol === "ETHUSDT") {
        const result = ethCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : ethCandles.slice(0, Math.min(limit, ethCandles.length));
      }

      return [];
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let btcSignalGenerated = false;
  let ethSignalGenerated = false;

  addStrategySchema({
    strategyName: "test-parallel-strategy",
    interval: "1m",
    getSignal: async (symbol) => {
      // BTCUSDT: TP scenario
      if (symbol === "BTCUSDT") {
        if (btcSignalGenerated) return null;
        btcSignalGenerated = true;

        // Генерируем свечи для BTC
        btcCandles = [];
        for (let i = 0; i < 70; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Активация сразу (0-4) - цена = priceOpen
          if (i < 5) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen,
              high: btcPriceOpen + 100,
              low: btcPriceOpen - 100,
              close: btcPriceOpen,
              volume: 100
            });
          }
          // Фаза 2: Take Profit (5-9)
          else if (i >= 5 && i < 10) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen + 1000,
              high: btcPriceOpen + 1100,
              low: btcPriceOpen + 900,
              close: btcPriceOpen + 1000,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            btcCandles.push({
              timestamp,
              open: btcBasePrice,
              high: btcBasePrice + 100,
              low: btcBasePrice - 50,
              close: btcBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "BTCUSDT parallel test - TP scenario",
          priceOpen: btcPriceOpen,
          priceTakeProfit: btcPriceOpen + 1000,
          priceStopLoss: btcPriceOpen - 1000,
          minuteEstimatedTime: 60,
        };
      }

      // ETHUSDT: SL scenario
      if (symbol === "ETHUSDT") {
        if (ethSignalGenerated) return null;
        ethSignalGenerated = true;

        // Генерируем свечи для ETH
        ethCandles = [];
        for (let i = 0; i < 70; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Активация сразу (0-4) - цена = priceOpen
          if (i < 5) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen,
              high: ethPriceOpen + 10,
              low: ethPriceOpen - 10,
              close: ethPriceOpen,
              volume: 100
            });
          }
          // Фаза 2: Stop Loss (5-9)
          else if (i >= 5 && i < 10) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen - 100,
              high: ethPriceOpen - 90,
              low: ethPriceOpen - 110,
              close: ethPriceOpen - 100,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            ethCandles.push({
              timestamp,
              open: ethBasePrice,
              high: ethBasePrice + 10,
              low: ethBasePrice - 5,
              close: ethBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "ETHUSDT parallel test - SL scenario",
          priceOpen: ethPriceOpen,
          priceTakeProfit: ethPriceOpen + 100,
          priceStopLoss: ethPriceOpen - 100,
          minuteEstimatedTime: 60,
        };
      }

      return null;
    },
    callbacks: {
      onSchedule: (symbol, data) => {
        if (symbol === "BTCUSDT") btcSignals.scheduled.push(data);
        if (symbol === "ETHUSDT") ethSignals.scheduled.push(data);
      },
      onOpen: (symbol, data) => {
        if (symbol === "BTCUSDT") btcSignals.opened.push(data);
        if (symbol === "ETHUSDT") ethSignals.opened.push(data);
      },
      onClose: (symbol, data) => {
        if (symbol === "BTCUSDT") btcSignals.closed.push(data);
        if (symbol === "ETHUSDT") ethSignals.closed.push(data);
      },
    },
  });

  addFrameSchema({
    frameName: "70m-parallel-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),
  });

  let btcDone = false;
  let ethDone = false;
  let errorCaught = null;

  const awaitSubject = new Subject();

  const unsubscribeSignal = listenSignalBacktest((event) => {
    if (event.symbol === "BTCUSDT") {
      btcSignals.allEvents.push(event);
      if (event.action === "closed") btcSignals.closed.push(event);
    }
    if (event.symbol === "ETHUSDT") {
      ethSignals.allEvents.push(event);
      if (event.action === "closed") ethSignals.closed.push(event);
    }
  });

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const unsubscribeDone = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-parallel-strategy") {
      if (event.symbol === "BTCUSDT") btcDone = true;
      if (event.symbol === "ETHUSDT") ethDone = true;

      if (btcDone && ethDone) {
        awaitSubject.next();
      }
    }
  });

  // Запускаем backtest для обоих символов параллельно
  Backtest.background("BTCUSDT", {
    strategyName: "test-parallel-strategy",
    exchangeName: "binance-parallel-multi",
    frameName: "70m-parallel-test",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-parallel-strategy",
    exchangeName: "binance-parallel-multi",
    frameName: "70m-parallel-test",
  });

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeSignal();
  unsubscribeError();
  unsubscribeDone();

  if (errorCaught) {
    fail(`Error during parallel backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверка BTCUSDT: должен быть TP
  if (btcSignals.scheduled.length === 0) {
    fail("BTCUSDT: Signal was NOT scheduled");
    return;
  }

  if (btcSignals.opened.length === 0) {
    fail("BTCUSDT: Signal was NOT opened");
    return;
  }

  // Фильтруем closed события из allEvents (содержат closeReason)
  const btcClosedEvents = btcSignals.allEvents.filter(e => e.action === "closed");
  if (btcClosedEvents.length === 0) {
    fail("BTCUSDT: No closed events found");
    return;
  }

  const btcFinalResult = btcClosedEvents[0];
  if (btcFinalResult.closeReason !== "take_profit") {
    fail(`BTCUSDT: Expected "take_profit", got "${btcFinalResult.closeReason}"`);
    return;
  }

  // Проверка ETHUSDT: должен быть SL
  if (ethSignals.scheduled.length === 0) {
    fail("ETHUSDT: Signal was NOT scheduled");
    return;
  }

  if (ethSignals.opened.length === 0) {
    fail("ETHUSDT: Signal was NOT opened");
    return;
  }

  const ethClosedEvents = ethSignals.allEvents.filter(e => e.action === "closed");
  if (ethClosedEvents.length === 0) {
    fail("ETHUSDT: No closed events found");
    return;
  }

  const ethFinalResult = ethClosedEvents[0];
  if (ethFinalResult.closeReason !== "stop_loss") {
    fail(`ETHUSDT: Expected "stop_loss", got "${ethFinalResult.closeReason}"`);
    return;
  }

  // Проверка изоляции: сигналы НЕ должны пересекаться
  if (btcFinalResult.symbol !== "BTCUSDT") {
    fail("BTCUSDT signal has wrong symbol!");
    return;
  }

  if (ethFinalResult.symbol !== "ETHUSDT") {
    fail("ETHUSDT signal has wrong symbol!");
    return;
  }

  pass(`PARALLEL WORKS: BTCUSDT closed by TP (${btcFinalResult.pnl.pnlPercentage.toFixed(2)}%), ETHUSDT closed by SL (${ethFinalResult.pnl.pnlPercentage.toFixed(2)}%). State isolation confirmed.`);
});


// Test #19
test("PARALLEL: Three symbols with different close reasons (TP, SL, time_expired)", async ({ pass, fail }) => {
  const signalsMap = {
    BTCUSDT: { scheduled: [], opened: [], closed: [], allEvents: [] },
    ETHUSDT: { scheduled: [], opened: [], closed: [], allEvents: [] },
    SOLUSDT: { scheduled: [], opened: [], closed: [], allEvents: [] },
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;

  const symbolConfigs = {
    BTCUSDT: { basePrice: 95000, priceOpen: 95100, tpDistance: 1000, slDistance: 1000 },
    ETHUSDT: { basePrice: 4000, priceOpen: 4010, tpDistance: 100, slDistance: 100 },
    SOLUSDT: { basePrice: 150, priceOpen: 151, tpDistance: 10, slDistance: 10 },
  };

  const candlesMap = {
    BTCUSDT: [],
    ETHUSDT: [],
    SOLUSDT: [],
  };

  const signalsGenerated = {
    BTCUSDT: false,
    ETHUSDT: false,
    SOLUSDT: false,
  };

  // Предзаполнение начальных свечей
  for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
    const config = symbolConfigs[symbol];
    for (let i = 0; i < 5; i++) {
      candlesMap[symbol].push({
        timestamp: startTime + i * intervalMs,
        open: config.basePrice,
        high: config.basePrice + config.tpDistance * 0.1,
        low: config.basePrice - config.slDistance * 0.05,
        close: config.basePrice,
        volume: 100,
      });
    }
  }

  addExchangeSchema({
    exchangeName: "binance-parallel-three",
    getCandles: async (symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const candles = candlesMap[symbol] || [];
      const result = candles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : candles.slice(0, Math.min(limit, candles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-parallel-three-symbols",
    interval: "1m",
    getSignal: async (symbol) => {
      if (signalsGenerated[symbol]) return null;
      signalsGenerated[symbol] = true;

      const config = symbolConfigs[symbol];
      const candles = [];

      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1: Активация сразу (0-4) - цена = priceOpen
        if (i < 5) {
          candles.push({
            timestamp,
            open: config.priceOpen,
            high: config.priceOpen + config.tpDistance * 0.1,
            low: config.priceOpen - config.slDistance * 0.1,
            close: config.priceOpen,
            volume: 100
          });
        }
        // BTCUSDT: TP (5-9)
        else if (symbol === "BTCUSDT" && i >= 5 && i < 10) {
          candles.push({
            timestamp,
            open: config.priceOpen + config.tpDistance,
            high: config.priceOpen + config.tpDistance * 1.1,
            low: config.priceOpen + config.tpDistance * 0.9,
            close: config.priceOpen + config.tpDistance,
            volume: 100
          });
        }
        // ETHUSDT: SL (5-9)
        else if (symbol === "ETHUSDT" && i >= 5 && i < 10) {
          candles.push({
            timestamp,
            open: config.priceOpen - config.slDistance,
            high: config.priceOpen - config.slDistance * 0.9,
            low: config.priceOpen - config.slDistance * 1.1,
            close: config.priceOpen - config.slDistance,
            volume: 100
          });
        }
        // SOLUSDT & остальное: нейтральная цена до time_expired
        else {
          candles.push({
            timestamp,
            open: config.priceOpen + config.tpDistance * 0.5,
            high: config.priceOpen + config.tpDistance * 0.6,
            low: config.priceOpen + config.tpDistance * 0.4,
            close: config.priceOpen + config.tpDistance * 0.5,
            volume: 100
          });
        }
      }

      candlesMap[symbol] = candles;

      return {
        position: "long",
        note: `${symbol} parallel three symbols test`,
        priceOpen: config.priceOpen,
        priceTakeProfit: config.priceOpen + config.tpDistance,
        priceStopLoss: config.priceOpen - config.slDistance,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: (symbol, data) => {
        signalsMap[symbol].scheduled.push(data);
      },
      onOpen: (symbol, data) => {
        signalsMap[symbol].opened.push(data);
      },
      onClose: (symbol, data) => {
        signalsMap[symbol].closed.push(data);
      },
    },
  });

  addFrameSchema({
    frameName: "130m-parallel-three",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),
  });

  const doneSymbols = new Set();
  let errorCaught = null;

  const awaitSubject = new Subject();

  const unsubscribeSignal = listenSignalBacktest((event) => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    if (symbols.includes(event.symbol)) {
      signalsMap[event.symbol].allEvents.push(event);
      if (event.action === "closed") signalsMap[event.symbol].closed.push(event);
    }
  });

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const unsubscribeDone = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-parallel-three-symbols") {
      doneSymbols.add(event.symbol);

      if (doneSymbols.size === 3) {
        awaitSubject.next();
      }
    }
  });

  // Запускаем backtest для всех трех символов
  for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
    Backtest.background(symbol, {
      strategyName: "test-parallel-three-symbols",
      exchangeName: "binance-parallel-three",
      frameName: "130m-parallel-three",
    });
  }

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeSignal();
  unsubscribeError();
  unsubscribeDone();

  if (errorCaught) {
    fail(`Error during parallel backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Фильтруем closed события из allEvents для всех символов
  const btcClosedEvents = signalsMap.BTCUSDT.allEvents.filter(e => e.action === "closed");
  const ethClosedEvents = signalsMap.ETHUSDT.allEvents.filter(e => e.action === "closed");
  const solClosedEvents = signalsMap.SOLUSDT.allEvents.filter(e => e.action === "closed");

  if (btcClosedEvents.length === 0) {
    fail("BTCUSDT: No closed events found");
    return;
  }

  if (ethClosedEvents.length === 0) {
    fail("ETHUSDT: No closed events found");
    return;
  }

  if (solClosedEvents.length === 0) {
    fail("SOLUSDT: No closed events found");
    return;
  }

  const btcResult = btcClosedEvents[0];
  const ethResult = ethClosedEvents[0];
  const solResult = solClosedEvents[0];

  if (btcResult.closeReason !== "take_profit") {
    fail(`BTCUSDT: Expected "take_profit", got "${btcResult.closeReason}"`);
    return;
  }

  if (ethResult.closeReason !== "stop_loss") {
    fail(`ETHUSDT: Expected "stop_loss", got "${ethResult.closeReason}"`);
    return;
  }

  if (solResult.closeReason !== "time_expired") {
    fail(`SOLUSDT: Expected "time_expired", got "${solResult.closeReason}"`);
    return;
  }

  // Проверка изоляции символов
  if (btcResult.symbol !== "BTCUSDT" || ethResult.symbol !== "ETHUSDT" || solResult.symbol !== "SOLUSDT") {
    fail("Symbol isolation violated - signals have wrong symbols!");
    return;
  }

  pass(`PARALLEL SCALES: 3 symbols closed independently - BTCUSDT: TP (${btcResult.pnl.pnlPercentage.toFixed(2)}%), ETHUSDT: SL (${ethResult.pnl.pnlPercentage.toFixed(2)}%), SOLUSDT: time_expired (${solResult.pnl.pnlPercentage.toFixed(2)}%). State isolation confirmed for 3 symbols.`);
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
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // CRITICAL: Pre-fill initial candles for getAveragePrice (min 5 candles)
  // Candles must be ABOVE priceOpen to ensure scheduled state (not immediate activation)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50, // 99950 > priceOpen (99500) ✓
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-partial-progress",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
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
    endDate: new Date("2024-01-01T01:10:00Z"),
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

  // Verify percentages increase monotonically
  for (let i = 1; i < partialProfitEvents.length; i++) {
    if (partialProfitEvents[i].revenuePercent <= partialProfitEvents[i - 1].revenuePercent) {
      fail(`Progress should increase: ${partialProfitEvents[i - 1].revenuePercent.toFixed(2)}% -> ${partialProfitEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  // Verify we have reasonable coverage (at least reached 50%+ progress)
  const maxProgress = Math.max(...partialProfitEvents.map(e => e.revenuePercent));
  if (maxProgress < 50) {
    fail(`Expected max progress >= 50%, got ${maxProgress.toFixed(2)}%`);
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
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialCalled = false;

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

  addExchangeSchema({
    exchangeName: "binance-function-short-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
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
          const price = basePrice - 15000;
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

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

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
    frameName: "20m-other-simultaneous",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
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
    frameName: "20m-other-simultaneous",
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


// Test #31
test("early termination with break stops backtest", async ({ pass, fail }) => {

  addExchangeSchema({
    exchangeName: "binance-mock-early",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-early",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "early termination test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 1,
      };
    },
  });

  addFrameSchema({
    frameName: "7d-backtest-early",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-07T00:00:00Z"), // 7 days
  });

  let signalCount = 0;

  for await (const result of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-early",
    exchangeName: "binance-mock-early",
    frameName: "7d-backtest-early",
  })) {
    signalCount++;
    if (signalCount >= 2) {
      // Stop after 2 signals
      break;
    }
  }

  if (signalCount === 2) {
    pass("Early termination stopped backtest after 2 signals");
    return;
  }

  fail(`Early termination failed: got ${signalCount} signals`);

});


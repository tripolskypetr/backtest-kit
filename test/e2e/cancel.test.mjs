import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
  listenPing,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { Subject, sleep } from "functools-kit";

test("Scheduled signal is cancelled via Backtest.cancel() in onTimeframe", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;
  let closedCount = 0;
  let index = 0;
  let cancelCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей ДО первого вызова getSignal (для getAveragePrice)
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

  addExchange({
    exchangeName: "binance-cancel-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-cancel",
    interval: "1m",
    getSignal: async () => {
      index++;

      // Генерируем ВСЕ свечи только в первый раз
      if (index === 1) {
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

        // Генерируем свечи на весь тест: 10 минут (frame) + запас
        for (let minuteIndex = 0; minuteIndex < 20; minuteIndex++) {
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

      // console.log(`[TEST] getSignal called, index=${index}, price=${price}`);


      // Создаем scheduled сигнал (priceOpen ниже текущей цены для LONG)
      return {
        position: "long",
        note: "cancel test",
        priceOpen: price - 500,  // Ниже текущей цены → будет scheduled
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 10000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: async () => {
        scheduledCount++;
        // console.log(`[TEST] onSchedule called, total=${scheduledCount}`);

        // Отменяем первый scheduled сигнал
        if (scheduledCount === 1 && !cancelCalled) {
          cancelCalled = true;
          // console.log(`[TEST] Calling Backtest.cancel from onSchedule...`);
          await Backtest.cancel("BTCUSDT", "test-strategy-cancel");
          // console.log(`[TEST] Backtest.cancel() completed`);
        }
      },
      onCancel: () => {
        cancelledCount++;
        // console.log(`[TEST] onCancel called, total=${cancelledCount}`);
      },
      onOpen: () => {
        openedCount++;
        // console.log(`[TEST] onOpen called, total=${openedCount}`);
      },
      onClose: () => {
        closedCount++;
        // console.log(`[TEST] onClose called, total=${closedCount}`);
      },
    },
  });

  addFrame({
    frameName: "10m-cancel-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    // console.log("[TEST ERROR]", error);
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    // console.log("[TEST] Backtest done");
    awaitSubject.next();
  });

  let scheduledEvents = 0;
  let cancelledEvents = 0;
  let openedEvents = 0;
  let closedEvents = 0;

  listenSignalBacktest((result) => {
    // console.log(`[TEST] Signal event: ${result.action}`);
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
    if (result.action === "opened") {
      openedEvents++;
    }
    if (result.action === "closed") {
      closedEvents++;
    }
  });

  // console.log("[TEST] Starting backtest...");

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cancel",
    exchangeName: "binance-cancel-test",
    frameName: "10m-cancel-test",
  });

  await awaitSubject.toPromise();
  // await sleep(100);
  unsubscribeError();

  // console.log(`[TEST] Final counts: scheduled=${scheduledCount}, cancelled=${cancelledCount}, opened=${openedCount}, scheduledEvents=${scheduledEvents}, cancelledEvents=${cancelledEvents}`);

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что был создан scheduled сигнал и получено cancelled событие
  if (scheduledCount >= 1 && cancelledEvents >= 1 && openedCount === 0) {
    pass(`Scheduled signal cancelled via Backtest.cancel(): ${scheduledCount} scheduled, ${cancelledEvents} cancelled events, ${openedCount} opened`);
    return;
  }

  fail(`Expected scheduled signal to be cancelled, got: scheduled=${scheduledCount}, cancelledEvents=${cancelledEvents}, opened=${openedCount}`);

});

test("Multiple scheduled signals - cancel only first one via onSchedule", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;
  let closedCount = 0;
  let index = 0;
  let cancelCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000;
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей
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

  addExchange({
    exchangeName: "binance-cancel-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-cancel-multiple",
    interval: "1m",
    getSignal: async () => {
      index++;

      if (index === 1) {
        allCandles = [];

        // Буферные свечи
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

        // Генерируем 250 минут свечей для нескольких сигналов
        for (let minuteIndex = 0; minuteIndex < 250; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

          if (minuteIndex < 10) {
            // Первые 10 минут: цена ВЫШЕ priceOpen (scheduled)
            allCandles.push({
              timestamp,
              open: basePrice + 500,
              high: basePrice + 600,
              low: basePrice + 400,
              close: basePrice + 500,
              volume: 100,
            });
          } else if (minuteIndex >= 10 && minuteIndex < 130) {
            // Минуты 10-130: цена падает для активации LONG и достижения TP
            allCandles.push({
              timestamp,
              open: basePrice - 1000,
              high: basePrice + 200,
              low: basePrice - 1000,
              close: basePrice - 800,
              volume: 100,
            });
          } else {
            // Остальное время: нормальная цена
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

      const price = await getAveragePrice("BTCUSDT");

      // Создаем scheduled сигналы
      return {
        position: "long",
        note: "cancel multiple test",
        priceOpen: price - 500,
        priceTakeProfit: price + 500,
        priceStopLoss: price - 10000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: async () => {
        scheduledCount++;
        // console.log(`[TEST] onSchedule called, total=${scheduledCount}`);

        // Отменяем только первый scheduled сигнал
        if (scheduledCount === 1 && !cancelCalled) {
          cancelCalled = true;
          // console.log(`[TEST] Calling Backtest.cancel for first signal...`);
          await Backtest.cancel("BTCUSDT", "test-strategy-cancel-multiple");
          // console.log(`[TEST] First signal cancelled via Backtest.cancel()`);
        }
      },
      onOpen: () => {
        openedCount++;
        // console.log(`[TEST] onOpen called, total=${openedCount}`);
      },
      onClose: () => {
        closedCount++;
        // console.log(`[TEST] onClose called, total=${closedCount}`);
      },
    },
  });

  addFrame({
    frameName: "20m-cancel-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    // console.log("[TEST ERROR]", error);
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cancel-multiple",
    exchangeName: "binance-cancel-multiple",
    frameName: "20m-cancel-multiple",
  });

  await awaitSubject.toPromise();
  // await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Должно быть минимум 2 scheduled, минимум 1 opened (второй сигнал активировался)
  if (scheduledCount >= 2 && openedCount >= 1) {
    pass(`Cancel works selectively: ${scheduledCount} scheduled, ${openedCount} opened (first cancelled, others activated)`);
    return;
  }

  fail(`Expected >=2 scheduled and >=1 opened, got: scheduled=${scheduledCount}, opened=${openedCount}`);

});

test("Cancel scheduled signal after 5 onPing calls in backtest", async ({ pass, fail }) => {

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

  addExchange({
    exchangeName: "binance-cancel-ping-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

        // Генерируем 30 минут свечей (достаточно для 5 ping + отмена)
        for (let minuteIndex = 0; minuteIndex < 30; minuteIndex++) {
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

      // Создаем scheduled сигнал (priceOpen ниже текущей цены для LONG)
      return {
        position: "long",
        note: "cancel ping test",
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
      onPing: async (_symbol, _data, when, _backtest) => {
        pingCount++;
        pingTimestamps.push(when.getTime());

        // Отменяем после 5-го ping
        if (pingCount === 5) {
          await Backtest.cancel("BTCUSDT", "test-strategy-cancel-ping");
        }
      },
    },
  });

  addFrame({
    frameName: "30m-cancel-ping-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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
    frameName: "30m-cancel-ping-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что было ровно 5 вызовов onPing
  if (pingCount !== 5) {
    fail(`Expected exactly 5 onPing calls, got ${pingCount}`);
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
    pass(`Scheduled signal cancelled after 5 onPing calls: ${pingCount} pings, ${scheduledCount} scheduled, ${cancelledEvents} cancelled events`);
    return;
  }

  fail(`Expected scheduled signal to be cancelled after 5 pings, got: pings=${pingCount}, scheduled=${scheduledCount}, cancelledEvents=${cancelledEvents}, opened=${openedCount}`);

});

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

  addExchange({
    exchangeName: "binance-listen-ping-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-listen-ping",
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

        // Генерируем 30 минут свечей (достаточно для 5 ping + отмена)
        for (let minuteIndex = 0; minuteIndex < 30; minuteIndex++) {
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

  addFrame({
    frameName: "30m-listen-ping-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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
  const unsubscribePing = listenPing(async (event) => {
    // Фильтруем только события для нашей стратегии
    if (event.symbol === "BTCUSDT" && event.strategyName === "test-strategy-listen-ping") {
      pingEventCount++;
      pingEventTimestamps.push(event.timestamp);

      // Отменяем после 5-го ping события
      if (pingEventCount === 5) {
        await Backtest.cancel("BTCUSDT", "test-strategy-listen-ping");
      }
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-listen-ping",
    exchangeName: "binance-listen-ping-test",
    frameName: "30m-listen-ping-test",
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

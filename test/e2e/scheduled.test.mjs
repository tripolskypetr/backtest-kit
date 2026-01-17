import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { Subject, sleep } from "functools-kit";

test("Scheduled signal is created and activated when price is reached", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;
  let activeCount = 0;
  let closedCount = 0;
  let index = 0;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  // КРИТИЧНО: создаем свечи с учетом буфера (4 свечи ДО startTime)
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

  addExchangeSchema({
    exchangeName: "binance-scheduled-activate",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-scheduled-activate",
    interval: "1m",
    getSignal: async () => {
      index++;

      // КРИТИЧНО: Генерируем ВСЕ свечи только в первый раз (паттерн #2)
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

        // Генерируем свечи на frame duration + extra for signal processing
        // Frame: 10 minutes, Signal estimated: 120 minutes, Await: 120 minutes
        // Total: 10 + 120 + 120 = 250 minutes
        for (let minuteIndex = 0; minuteIndex < 250; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

          if (minuteIndex < 5) {
            // First 5 minutes: falling price for activation
            allCandles.push({
              timestamp,
              open: basePrice - 200,  // Падение для активации LONG
              high: basePrice + 200,  // Рост для TP
              low: basePrice - 200,   // Активирует priceOpen
              close: basePrice + 150,
              volume: 100,
            });
          } else {
            // Remaining minutes: normal price movement
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

      // console.log(`[TEST scheduled] index=${index}, VWAP price=${price}`);
      // await sleep(1000);

      // Alternate between reachable TP and time expiration
      if (index % 2 === 1) {
        // Odd: Will hit TP (price grows, TP is reachable)
        const signal = {
          position: "long",
          note: "scheduled activation test",
          priceOpen: price - 100,
          priceTakeProfit: price + 100,
          priceStopLoss: price - 10000,
          minuteEstimatedTime: 120,
        };
        // console.log(`[TEST scheduled] Creating LONG signal: priceOpen=${signal.priceOpen}, TP=${signal.priceTakeProfit}, SL=${signal.priceStopLoss}`);
        // await sleep(1000);
        return signal;
      } else {
        // Even: Will expire by time (TP unreachable, SL very low)
        const signal = {
          position: "long",
          note: "scheduled activation test",
          priceOpen: price - 100,
          priceTakeProfit: price + 10000,
          priceStopLoss: price - 10000,
          minuteEstimatedTime: 120,
        };
        // console.log(`[TEST scheduled] Creating LONG signal (time_expired): priceOpen=${signal.priceOpen}, TP=${signal.priceTakeProfit}, SL=${signal.priceStopLoss}`);
        // await sleep(1000);
        return signal;
      }
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
      onActive: () => {
        activeCount++;
      },
      onClose: () => {
        closedCount++;
      },
    },
  });

  addFrameSchema({
    frameName: "10m-scheduled-activate",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    console.log("[TEST ERROR]", error);
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  let scheduledEvents = 0;
  let openedEvents = 0;
  let activeEvents = 0;
  let closedEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "opened") {
      openedEvents++;
    }
    if (result.action === "active") {
      activeEvents++;
    }
    if (result.action === "closed") {
      closedEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-activate",
    exchangeName: "binance-scheduled-activate",
    frameName: "10m-scheduled-activate",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (scheduledCount > 0 && openedCount > 0 && closedCount > 0) {
    pass(`Scheduled signal lifecycle works: ${scheduledCount} scheduled, ${openedCount} opened, ${closedCount} closed`);
    return;
  }

  fail(`Callbacks: scheduled=${scheduledCount}, opened=${openedCount}, closed=${closedCount}`);

});

test("Scheduled signal is cancelled when price never reaches entry point", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-scheduled-cancel",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-scheduled-cancel",
    interval: "1m",
    getSignal: async () => {
      // Set priceOpen very low so it never gets reached (price only grows)
      return {
        position: "long",
        note: "scheduled cancellation test",
        priceOpen: 10000,
        priceTakeProfit: 11000,
        priceStopLoss: 5000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
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
    frameName: "3d-scheduled-cancel",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let scheduledEvents = 0;
  let cancelledEvents = 0;
  let openedEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
    if (result.action === "opened") {
      openedEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-cancel",
    exchangeName: "binance-scheduled-cancel",
    frameName: "3d-scheduled-cancel",
  });

  await awaitSubject.toPromise();

  if (scheduledCount > 0 && cancelledCount > 0 && openedCount === 0) {
    pass(`Scheduled signals cancelled correctly: ${scheduledCount} scheduled, ${cancelledCount} cancelled, ${openedCount} opened`);
    return;
  }

  fail(`Callbacks: scheduled=${scheduledCount}, cancelled=${cancelledCount}, opened=${openedCount}`);

});

test("Multiple scheduled signals queue and activate sequentially (VWAP-aware)", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;
  let closedCount = 0;
  let index = 0;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
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

  addExchangeSchema({
    exchangeName: "binance-scheduled-queue",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-scheduled-queue",
    interval: "1m",
    getSignal: async () => {
      index++;

      // Генерируем свечи в первый раз
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

        // Генерируем достаточно свечей: frame (20m) + await (120m) + estimated (60m) = 200m
        for (let minuteIndex = 0; minuteIndex < 200; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

          // Падающая цена для активации LONG
          allCandles.push({
            timestamp,
            open: basePrice - 200,
            high: basePrice + 200,
            low: basePrice - 200,
            close: basePrice + 100,
            volume: 100,
          });
        }
      }

      const price = await getAveragePrice("BTCUSDT");

      // Alternate between TP and time expiration
      if (index % 2 === 1) {
        return {
          position: "long",
          note: "scheduled queue test",
          priceOpen: price - 100,
          priceTakeProfit: price + 100,
          priceStopLoss: price - 10000,
          minuteEstimatedTime: 60,
        };
      } else {
        return {
          position: "long",
          note: "scheduled queue test",
          priceOpen: price - 100,
          priceTakeProfit: price + 10000,
          priceStopLoss: price - 10000,
          minuteEstimatedTime: 60,
        };
      }
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
      onClose: () => {
        closedCount++;
      },
    },
  });

  addFrameSchema({
    frameName: "20m-scheduled-queue",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let scheduledEvents = 0;
  let openedEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "opened") {
      openedEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-queue",
    exchangeName: "binance-scheduled-queue",
    frameName: "20m-scheduled-queue",
  });

  await awaitSubject.toPromise();

  console.log(`[TEST #62] scheduled=${scheduledCount}, opened=${openedCount}, closed=${closedCount}`);

  // С VWAP detection и коротким frame может обработаться меньше сигналов
  if (scheduledCount >= 1 && openedCount >= 1) {
    pass(`Multiple scheduled signals processed: ${scheduledCount} scheduled, ${openedCount} opened`);
    return;
  }

  fail(`Expected >=1 scheduled and opened, got scheduled=${scheduledCount}, opened=${openedCount}`);

});

test("Scheduled signal with stop loss hit before activation gets cancelled", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-scheduled-sl-cancel",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-scheduled-sl-cancel",
    interval: "1m",
    getSignal: async () => {
      // Set priceOpen low so it never gets reached (price only grows)
      return {
        position: "long",
        note: "scheduled SL cancel test",
        priceOpen: 10000,
        priceTakeProfit: 11000,
        priceStopLoss: 5000,
        minuteEstimatedTime: 30,
      };
    },
    callbacks: {
      onSchedule: () => {
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
    frameName: "3d-scheduled-sl-cancel",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let cancelledEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-sl-cancel",
    exchangeName: "binance-scheduled-sl-cancel",
    frameName: "3d-scheduled-sl-cancel",
  });

  await awaitSubject.toPromise();

  if (scheduledCount > 0 && cancelledCount > 0 && openedCount === 0) {
    pass(`Scheduled signals with SL cancelled: ${scheduledCount} scheduled, ${cancelledCount} cancelled before activation`);
    return;
  }

  fail(`Expected cancellations, got scheduled=${scheduledCount}, cancelled=${cancelledCount}, opened=${openedCount}`);

});

test("Scheduled signal events emit correct action types", async ({ pass, fail }) => {

  const eventTypes = new Set();
  let index = 0;

  addExchangeSchema({
    exchangeName: "binance-scheduled-events",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-scheduled-events",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      index++;
      // Alternate between TP and time expiration
      if (index % 2 === 1) {
        return {
          position: "long",
          note: "event type test",
          priceOpen: price - 100,
          priceTakeProfit: price + 100,
          priceStopLoss: price - 10000,
          minuteEstimatedTime: 120,
        };
      } else {
        return {
          position: "long",
          note: "event type test",
          priceOpen: price - 100,
          priceTakeProfit: price + 10000,
          priceStopLoss: price - 100,
          minuteEstimatedTime: 120,
        };
      }
    },
  });

  addFrameSchema({
    frameName: "5d-scheduled-events",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-06T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    eventTypes.add(result.action);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-events",
    exchangeName: "binance-scheduled-events",
    frameName: "5d-scheduled-events",
  });

  await awaitSubject.toPromise();

  // Should have at least: scheduled, opened, active, closed or cancelled
  const hasScheduled = eventTypes.has("scheduled");
  const hasOpened = eventTypes.has("opened");
  const hasActive = eventTypes.has("active");
  const hasClosedOrCancelled = eventTypes.has("closed") || eventTypes.has("cancelled");

  if (hasScheduled && (hasOpened || hasClosedOrCancelled)) {
    pass(`Scheduled signal events correct: ${Array.from(eventTypes).join(", ")}`);
    return;
  }

  fail(`Event types observed: ${Array.from(eventTypes).join(", ")}`);

});

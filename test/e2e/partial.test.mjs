import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenDoneBacktest,
  listenError,
  listenPartialProfitAvailable,
  listenPartialLossAvailable,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * PARTIAL ТЕСТ #1: onPartialProfit вызывается в BACKTEST для LONG позиции
 */
test("PARTIAL BACKTEST: onPartialProfit for LONG with gradual profit", async ({ pass, fail }) => {
  const partialFillEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
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

  addExchangeSchema({
    exchangeName: "binance-partial-fill",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-fill",
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
      for (let i = 0; i < 25; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4)
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        }
        // Постепенный рост (5-19)
        else if (i >= 5 && i < 20) {
          const increment = (i - 4) * 50;
          const price = basePrice + increment;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        }
        // TP (20-24)
        else {
          const tpPrice = basePrice + 1000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 50, low: tpPrice - 50, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onPartialProfit: (_symbol, _data, currentPrice, revenuePercent, backtest) => {
        partialFillEvents.push({ currentPrice, revenuePercent, backtest });
      },
      onPartialLoss: (_symbol, _data, currentPrice, revenuePercent, backtest) => {
        partialLossEvents.push({ currentPrice, revenuePercent, backtest });
      },
    },
  });

  addFrameSchema({
    frameName: "25m-partial-fill",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:25:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-fill",
    exchangeName: "binance-partial-fill",
    frameName: "25m-partial-fill",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (partialFillEvents.length < 5) {
    fail(`Expected at least 5 onPartialProfit calls, got ${partialFillEvents.length}`);
    return;
  }

  if (partialLossEvents.length > 0) {
    fail(`onPartialLoss should NOT be called, got ${partialLossEvents.length}`);
    return;
  }

  if (!partialFillEvents.every(e => e.backtest === true)) {
    fail("All events should have backtest=true");
    return;
  }

  // Check that all revenuePercent values are positive (0-100% progress towards TP)
  for (let i = 0; i < partialFillEvents.length; i++) {
    if (partialFillEvents[i].revenuePercent < 0 || partialFillEvents[i].revenuePercent > 100) {
      fail(`Progress should be 0-100%, got ${partialFillEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  // Check that progress increases
  for (let i = 1; i < partialFillEvents.length; i++) {
    if (partialFillEvents[i].revenuePercent <= partialFillEvents[i - 1].revenuePercent) {
      fail(`Progress should increase: ${partialFillEvents[i - 1].revenuePercent.toFixed(2)}% -> ${partialFillEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  const maxProgress = Math.max(...partialFillEvents.map(e => e.revenuePercent));
  pass(`onPartialProfit WORKS: ${partialFillEvents.length} calls, max progress ${maxProgress.toFixed(2)}%`);
});


/**
 * PARTIAL ТЕСТ #2: onPartialLoss вызывается в BACKTEST для LONG позиции
 */
test("PARTIAL BACKTEST: onPartialLoss for LONG with gradual loss", async ({ pass, fail }) => {
  const partialFillEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
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

  addExchangeSchema({
    exchangeName: "binance-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-loss",
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
      for (let i = 0; i < 25; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4)
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        }
        // Постепенное падение (5-19)
        else if (i >= 5 && i < 20) {
          const decrement = (i - 4) * 50;
          const price = basePrice - decrement;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        }
        // SL (20-24)
        else {
          const slPrice = basePrice - 1000;
          allCandles.push({ timestamp, open: slPrice, high: slPrice + 50, low: slPrice - 50, close: slPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onPartialProfit: (_symbol, _data, currentPrice, revenuePercent, backtest) => {
        partialFillEvents.push({ currentPrice, revenuePercent, backtest });
      },
      onPartialLoss: (_symbol, _data, currentPrice, revenuePercent, backtest) => {
        partialLossEvents.push({ currentPrice, revenuePercent, backtest });
      },
    },
  });

  addFrameSchema({
    frameName: "25m-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:25:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-loss",
    exchangeName: "binance-partial-loss",
    frameName: "25m-partial-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (partialLossEvents.length < 5) {
    fail(`Expected at least 5 onPartialLoss calls, got ${partialLossEvents.length}`);
    return;
  }

  if (partialFillEvents.length > 0) {
    fail(`onPartialProfit should NOT be called, got ${partialFillEvents.length}`);
    return;
  }

  if (!partialLossEvents.every(e => e.backtest === true)) {
    fail("All events should have backtest=true");
    return;
  }

  // Check that all revenuePercent values are positive (0-100% progress towards SL)
  for (let i = 0; i < partialLossEvents.length; i++) {
    if (partialLossEvents[i].revenuePercent < 0 || partialLossEvents[i].revenuePercent > 100) {
      fail(`Progress should be 0-100%, got ${partialLossEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  // Check that progress increases (moving closer to SL)
  for (let i = 1; i < partialLossEvents.length; i++) {
    if (partialLossEvents[i].revenuePercent <= partialLossEvents[i - 1].revenuePercent) {
      fail(`Progress should increase: ${partialLossEvents[i - 1].revenuePercent.toFixed(2)}% -> ${partialLossEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  const maxProgress = Math.max(...partialLossEvents.map(e => e.revenuePercent));
  pass(`onPartialLoss WORKS: ${partialLossEvents.length} calls, max progress ${maxProgress.toFixed(2)}%`);
});


/**
 * PARTIAL ТЕСТ #3: onPartialProfit для SHORT позиции
 */
test("PARTIAL BACKTEST: onPartialProfit for SHORT with price falling", async ({ pass, fail }) => {
  const partialFillEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
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

  addExchangeSchema({
    exchangeName: "binance-partial-short-fill",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-short-fill",
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
      for (let i = 0; i < 25; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        }
        // Падение цены (прибыль для SHORT)
        else if (i >= 5 && i < 20) {
          const decrement = (i - 4) * 50;
          const price = basePrice - decrement;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        }
        // TP
        else {
          const tpPrice = basePrice - 1000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 50, low: tpPrice - 50, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 1000,
        priceStopLoss: basePrice + 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onPartialProfit: (_symbol, _data, currentPrice, revenuePercent, backtest) => {
        partialFillEvents.push({ currentPrice, revenuePercent, backtest });
      },
      onPartialLoss: (_symbol, _data, currentPrice, revenuePercent, backtest) => {
        partialLossEvents.push({ currentPrice, revenuePercent, backtest });
      },
    },
  });

  addFrameSchema({
    frameName: "25m-partial-short-fill",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:25:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-short-fill",
    exchangeName: "binance-partial-short-fill",
    frameName: "25m-partial-short-fill",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (partialFillEvents.length < 5) {
    fail(`Expected at least 5 onPartialProfit calls, got ${partialFillEvents.length}`);
    return;
  }

  if (partialLossEvents.length > 0) {
    fail(`onPartialLoss should NOT be called, got ${partialLossEvents.length}`);
    return;
  }

  // Check that all revenuePercent values are positive (0-100% progress towards TP)
  for (let i = 0; i < partialFillEvents.length; i++) {
    if (partialFillEvents[i].revenuePercent < 0 || partialFillEvents[i].revenuePercent > 100) {
      fail(`Progress should be 0-100%, got ${partialFillEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  // Check that progress increases
  for (let i = 1; i < partialFillEvents.length; i++) {
    if (partialFillEvents[i].revenuePercent <= partialFillEvents[i - 1].revenuePercent) {
      fail(`Progress should increase: ${partialFillEvents[i - 1].revenuePercent.toFixed(2)}% -> ${partialFillEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  const maxProgress = Math.max(...partialFillEvents.map(e => e.revenuePercent));
  pass(`onPartialProfit SHORT WORKS: ${partialFillEvents.length} calls, max progress ${maxProgress.toFixed(2)}%`);
});


/**
 * PARTIAL ТЕСТ #4: onPartialLoss для SHORT позиции
 */
test("PARTIAL BACKTEST: onPartialLoss for SHORT with price rising", async ({ pass, fail }) => {
  const partialFillEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
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

  addExchangeSchema({
    exchangeName: "binance-partial-short-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-short-loss",
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
      for (let i = 0; i < 25; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        }
        // Рост цены (убыток для SHORT)
        else if (i >= 5 && i < 20) {
          const increment = (i - 4) * 50;
          const price = basePrice + increment;
          allCandles.push({ timestamp, open: price, high: price + 50, low: price - 50, close: price, volume: 100 });
        }
        // SL
        else {
          const slPrice = basePrice + 1000;
          allCandles.push({ timestamp, open: slPrice, high: slPrice + 50, low: slPrice - 50, close: slPrice, volume: 100 });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 1000,
        priceStopLoss: basePrice + 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onPartialProfit: (_symbol, _data, currentPrice, revenuePercent, backtest) => {
        partialFillEvents.push({ currentPrice, revenuePercent, backtest });
      },
      onPartialLoss: (_symbol, _data, currentPrice, revenuePercent, backtest) => {
        partialLossEvents.push({ currentPrice, revenuePercent, backtest });
      },
    },
  });

  addFrameSchema({
    frameName: "25m-partial-short-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:25:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-short-loss",
    exchangeName: "binance-partial-short-loss",
    frameName: "25m-partial-short-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (partialLossEvents.length < 5) {
    fail(`Expected at least 5 onPartialLoss calls, got ${partialLossEvents.length}`);
    return;
  }

  if (partialFillEvents.length > 0) {
    fail(`onPartialProfit should NOT be called, got ${partialFillEvents.length}`);
    return;
  }

  // Check that all revenuePercent values are positive (0-100% progress towards SL)
  for (let i = 0; i < partialLossEvents.length; i++) {
    if (partialLossEvents[i].revenuePercent < 0 || partialLossEvents[i].revenuePercent > 100) {
      fail(`Progress should be 0-100%, got ${partialLossEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  // Check that progress increases (moving closer to SL)
  for (let i = 1; i < partialLossEvents.length; i++) {
    if (partialLossEvents[i].revenuePercent <= partialLossEvents[i - 1].revenuePercent) {
      fail(`Progress should increase: ${partialLossEvents[i - 1].revenuePercent.toFixed(2)}% -> ${partialLossEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  const maxProgress = Math.max(...partialLossEvents.map(e => e.revenuePercent));
  pass(`onPartialLoss SHORT WORKS: ${partialLossEvents.length} calls, max progress ${maxProgress.toFixed(2)}%`);
});


/**
 * PARTIAL FACADE TEST #1: Partial.getData returns statistics
 */
test("Partial.getData returns partial profit/loss statistics for symbol", async ({ pass, fail }) => {
  const { Partial } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
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

  addExchangeSchema({
    exchangeName: "binance-partial-facade-1",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-facade-1",
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
      for (let i = 0; i < 25; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i >= 5 && i < 20) {
          const increment = (i - 4) * 1000;
          const price = basePrice + increment;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else {
          const tpPrice = basePrice + 20000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "25m-partial-facade-1",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:25:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-facade-1",
    exchangeName: "binance-partial-facade-1",
    frameName: "25m-partial-facade-1",
  });

  await awaitSubject.toPromise();
  // await sleep(1_000);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  const stats = await Partial.getData("BTCUSDT", {
    strategyName: "test-partial-facade-1",
    exchangeName: "binance-partial-facade-1",
    frameName: "25m-partial-facade-1",
  }, true);

  if (
    stats &&
    typeof stats.totalEvents === "number" &&
    typeof stats.totalProfit === "number" &&
    typeof stats.totalLoss === "number" &&
    Array.isArray(stats.eventList) &&
    stats.totalProfit > 0 &&
    stats.totalLoss === 0
  ) {
    pass(`Partial.getData WORKS: ${stats.totalEvents} events, ${stats.totalProfit} profit, ${stats.totalLoss} loss`);
    return;
  }

  fail(`Partial.getData did not return valid statistics: profit=${stats.totalProfit}, loss=${stats.totalLoss}, events=${stats.totalEvents}`);
});


/**
 * PARTIAL FACADE TEST #2: Partial.getReport generates markdown
 */
test("Partial.getReport generates markdown report with table", async ({ pass, fail }) => {
  const { Partial } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
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

  addExchangeSchema({
    exchangeName: "binance-partial-facade-2",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-facade-2",
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
      for (let i = 0; i < 25; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
        } else if (i >= 5 && i < 20) {
          const decrement = (i - 4) * 1000;
          const price = basePrice - decrement;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        } else {
          const slPrice = basePrice - 20000;
          allCandles.push({ timestamp, open: slPrice, high: slPrice + 100, low: slPrice - 100, close: slPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "25m-partial-facade-2",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:25:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-partial-facade-2",
    exchangeName: "binance-partial-facade-2",
    frameName: "25m-partial-facade-2",
  });

  await awaitSubject.toPromise();
  // await sleep(1_000);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  const markdown = await Partial.getReport("ETHUSDT", {
    strategyName: "test-partial-facade-2",
    exchangeName: "binance-partial-facade-2",
    frameName: "25m-partial-facade-2",
  }, true);

  if (
    markdown &&
    markdown.includes("# Partial Profit/Loss Report: ETHUSDT:test-partial-facade-2") &&
    markdown.includes("| Action |") &&
    markdown.includes("| Symbol |") &&
    markdown.includes("| Level % |") &&
    markdown.includes("| Current Price |") &&
    markdown.includes("| Timestamp |") &&
    markdown.includes("| Mode |")
  ) {
    pass("Partial.getReport generated markdown with table");
    return;
  }

  fail("Partial.getReport did not generate valid markdown");
});


/**
 * PARTIAL FACADE TEST #3: Empty statistics for nonexistent symbol
 */
test("Partial.getData returns empty statistics for nonexistent symbol", async ({ pass, fail }) => {
  const { Partial, addStrategySchema } = await import("../../build/index.mjs");

  // Register strategy first to pass validation
  addStrategySchema({
    strategyName: "nonexistent-strategy",
    interval: "1m",
    getSignal: async () => null,
  });

  addExchangeSchema({
    exchangeName: "nonexistent-exchange",
    getCandles: async () => [],
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  })

  addFrameSchema({
    frameName: "nonexistent-frame",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const stats = await Partial.getData("NONEXISTENT_SYMBOL_12345", {
    strategyName: "nonexistent-strategy",
    exchangeName: "nonexistent-exchange",
    frameName: "nonexistent-frame",
  }, true);

  if (
    stats &&
    stats.totalEvents === 0 &&
    stats.totalProfit === 0 &&
    stats.totalLoss === 0 &&
    stats.eventList.length === 0
  ) {
    pass("Partial.getData returns empty statistics for nonexistent symbol");
    return;
  }

  fail("Partial.getData did not return empty statistics correctly");
});


/**
 * PARTIAL PROGRESS TEST: Verify percentage calculations during TP achievement
 *
 * This test simulates market movement towards TP and verifies that:
 * - Events are emitted as price progresses
 * - Percentages are calculated correctly (0-100% range)
 * - Percentages increase monotonically
 *
 * Note: Exact levels (10%, 20%, etc) may vary due to VWAP and HIGH/LOW checks.
 * Tolerance: ±10% is acceptable for milestone verification.
 */
/**
 * PARTIAL LISTENERS TEST: Using listenPartialProfit/listenPartialLoss for event tracking
 *
 * This test verifies that global event listeners work correctly:
 * - listenPartialProfit captures profit milestone events
 * - listenPartialLoss captures loss milestone events
 * - Events contain correct data (symbol, level, currentPrice, backtest flag)
 * - Milestone levels (10%, 20%, 30%, etc.) are emitted correctly
 */
/**
 * PARTIAL DEDUPE TEST: Verify events are NOT emitted twice for same level
 *
 * This test simulates price oscillation (reaching level, dropping, reaching again)
 * and verifies that milestone events are emitted only ONCE per level:
 * - Price rises to 20% profit
 * - Price drops back to 15%
 * - Price rises again to 20% profit
 * - Expected: Only ONE event at 20% level (first time reached)
 *
 * This validates ClientPartial's Set-based deduplication logic.
 * Uses listenPartialProfit/listenPartialLoss instead of strategy callbacks.
 */
/**
 * PARTIAL FUNCTION TEST #1: partialProfit() успешно закрывает 30% позиции LONG
 *
 * Проверяем что:
 * - Функция partialProfit принимает symbol и percentToClose
 * - Извлекает currentPrice через getAveragePrice автоматически
 * - Валидация проходит (LONG: currentPrice > priceOpen для profit)
 * - Состояние _partial обновляется корректно
 */
/**
 * PARTIAL FUNCTION TEST #2: partialLoss() успешно закрывает 40% позиции LONG
 *
 * Проверяем что:
 * - Функция partialLoss принимает symbol и percentToClose
 * - Валидация проходит (LONG: currentPrice < priceOpen для loss)
 * - Состояние _partial обновляется типом "loss"
 */
/**
 * PARTIAL FUNCTION TEST #3: Множественные partialProfit - 30%, потом еще 40%
 */
/**
 * PARTIAL FUNCTION TEST #4: SHORT позиция - partialProfit
 */
/**
 * PARTIAL LISTENER TEST #15: partialProfit() with listenPartialProfit for LONG
 *
 * Проверяем что:
 * - listenPartialProfit срабатывает при вызовеcommitPartialProfit()
 * - Получаем корректные данные в событии
 * - Поле _partial обновляется в сигнале
 */
test("PARTIAL LISTENER: partialProfit() with listenPartialProfit for LONG", async ({ pass, fail }) => {
  const { commitPartialProfit, listenPartialProfitAvailable } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialCalled = false;
  let listenerFired = false;
  let listenerData = null;

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
    exchangeName: "binance-listener-partial-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-listener-partial-profit",
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

      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Активация: цена = basePrice
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 25) {
          // Рост к TP: постепенно растём до 40% пути к TP
          const progress = (i - 5) / 20; // 0 -> 1
          const targetPrice = basePrice + 60000; // TP
          const currentPrice = basePrice + (targetPrice - basePrice) * progress * 0.4; // 40% к TP
          allCandles.push({
            timestamp,
            open: currentPrice,
            high: currentPrice + 100,
            low: currentPrice - 100,
            close: currentPrice,
            volume: 100,
          });
        } else {
          // Достигаем TP
          const price = basePrice + 60000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "40m-listener-partial-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  // Подписываемся на события listenPartialProfit и вызываем partialProfit внутри
  const unsubscribeListener = listenPartialProfitAvailable(async ({ symbol, signal, price, level, backtest }) => {
    listenerFired = true;
    listenerData = { symbol, signalId: signal?.id, price, level, backtest };
    // console.log(`[TEST #15 listenPartialProfit] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);

    // Вызываем partialProfit при достижении уровня 30%
    if (!partialCalled && level >= 30) {
      partialCalled = true;
      await commitPartialProfit("BTCUSDT", 30);
      // console.log(`[TEST #15] partialProfit called at level ${level}%`);
    }
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-listener-partial-profit",
    exchangeName: "binance-listener-partial-profit",
    frameName: "40m-listener-partial-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeListener();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialCalled) {
    fail("partialProfit was NOT called");
    return;
  }

  if (!listenerFired) {
    fail("listenPartialProfit was NOT triggered");
    return;
  }

  if (!listenerData) {
    fail("listenPartialProfit did not receive data");
    return;
  }

  // Проверяем данные из listener
  if (listenerData.symbol !== "BTCUSDT") {
    fail(`Expected symbol 'BTCUSDT', got '${listenerData.symbol}'`);
    return;
  }

  if (typeof listenerData.level !== "number") {
    fail(`Expected level to be a number, got ${typeof listenerData.level}`);
    return;
  }

  if (listenerData.backtest !== true) {
    fail(`Expected backtest to be true, got ${listenerData.backtest}`);
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-listener-partial-profit",
    exchangeName: "binance-listener-partial-profit",
    frameName: "40m-listener-partial-profit",
  });

  // console.log("[TEST #15] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #15] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!signal._partial || !Array.isArray(signal._partial) || signal._partial.length !== 1) {
    fail("Field _partial is invalid or empty");
    return;
  }

  const partial = signal._partial[0];
  if (partial.type !== "profit" || partial.percent !== 30) {
    fail(`Expected type='profit' percent=30, got type='${partial.type}' percent=${partial.percent}`);
    return;
  }

  pass("listenPartialProfit WORKS: listener fired, _partial field validated");
});


/**
 * PARTIAL LISTENER TEST #16: partialLoss() with listenPartialLoss for LONG
 *
 * Проверяем что:
 * - listenPartialLoss срабатывает при вызовеcommitPartialLoss()
 * - Получаем корректные данные в событии
 * - Поле _partial обновляется типом "loss"
 */
test("PARTIAL LISTENER: partialLoss() with listenPartialLoss for LONG", async ({ pass, fail }) => {
  const { commitPartialLoss, listenPartialLossAvailable } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialCalled = false;
  let listenerFired = false;
  let listenerData = null;

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
    exchangeName: "binance-listener-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-listener-partial-loss",
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

      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Активация: цена = basePrice
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 25) {
          // Падение к SL: постепенно падаем до 40% пути к SL
          const progress = (i - 5) / 20; // 0 -> 1
          const targetPrice = basePrice - 50000; // SL
          const currentPrice = basePrice + (targetPrice - basePrice) * progress * 0.4; // 40% к SL
          allCandles.push({
            timestamp,
            open: currentPrice,
            high: currentPrice + 100,
            low: currentPrice - 100,
            close: currentPrice,
            volume: 100,
          });
        } else {
          // Достигаем SL
          const price = basePrice - 50000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "40m-listener-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  // Подписываемся на события listenPartialLoss и вызываем partialLoss внутри
  const unsubscribeListener = listenPartialLossAvailable(async ({ symbol, signal, price, level, backtest }) => {
    listenerFired = true;
    listenerData = { symbol, signalId: signal?.id, price, level, backtest };
    // console.log(`[TEST #16 listenPartialLoss] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);

    // Вызываем partialLoss при достижении уровня 30%
    if (!partialCalled && level >= 30) {
      partialCalled = true;
      await commitPartialLoss("BTCUSDT", 40);
      // console.log(`[TEST #16] partialLoss called at level ${level}%`);
    }
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-listener-partial-loss",
    exchangeName: "binance-listener-partial-loss",
    frameName: "40m-listener-partial-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeListener();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialCalled) {
    fail("partialLoss was NOT called");
    return;
  }

  if (!listenerFired) {
    fail("listenPartialLoss was NOT triggered");
    return;
  }

  if (!listenerData) {
    fail("listenPartialLoss did not receive data");
    return;
  }

  // Проверяем данные из listener
  if (listenerData.symbol !== "BTCUSDT") {
    fail(`Expected symbol 'BTCUSDT', got '${listenerData.symbol}'`);
    return;
  }

  if (typeof listenerData.level !== "number") {
    fail(`Expected level to be a number, got ${typeof listenerData.level}`);
    return;
  }

  if (listenerData.backtest !== true) {
    fail(`Expected backtest to be true, got ${listenerData.backtest}`);
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-listener-partial-loss",
    exchangeName: "binance-listener-partial-loss",
    frameName: "40m-listener-partial-loss",
  });

  // console.log("[TEST #16] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #16] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!signal._partial || !Array.isArray(signal._partial) || signal._partial.length !== 1) {
    fail("Field _partial is invalid or empty");
    return;
  }

  const partial = signal._partial[0];
  if (partial.type !== "loss" || partial.percent !== 40) {
    fail(`Expected type='loss' percent=40, got type='${partial.type}' percent=${partial.percent}`);
    return;
  }

  pass("listenPartialLoss WORKS: listener fired, _partial field validated");
});


/**
 * PARTIAL LISTENER TEST #17: Multiple partialProfit calls with listenPartialProfit
 *
 * Проверяем что:
 * - listenPartialProfit срабатывает несколько раз при множественных вызовах
 * - Каждое событие регистрируется корректно
 * - Массив _partial содержит оба закрытия
 */
test("PARTIAL LISTENER: Multiple partialProfit with listenPartialProfit (VWAP-aware)", async ({ pass, fail }) => {
  const { commitPartialProfit, listenPartialProfitAvailable } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let firstPartialCalled = false;
  let secondPartialCalled = false;
  const listenerEvents = [];

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
    exchangeName: "binance-listener-partial-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-listener-partial-multiple",
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

      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Активация: цена = basePrice
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 30) {
          // Рост к TP: постепенно растём до 40% пути к TP
          const progress = (i - 5) / 25; // 0 -> 1
          const targetPrice = basePrice + 60000; // TP
          const currentPrice = basePrice + (targetPrice - basePrice) * progress * 0.4; // 40% к TP
          allCandles.push({
            timestamp,
            open: currentPrice,
            high: currentPrice + 100,
            low: currentPrice - 100,
            close: currentPrice,
            volume: 100,
          });
        } else {
          // Достигаем TP
          const price = basePrice + 60000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "50m-listener-partial-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  // Подписываемся на события listenPartialProfit и вызываем partialProfit внутри
  const unsubscribeListener = listenPartialProfitAvailable(async ({ symbol, signal, price, level, backtest }) => {
    listenerEvents.push({ symbol, signalId: signal?.id, price, level, backtest });
    // console.log(`[TEST #17 listenPartialProfit] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}, count=${listenerEvents.length}`);

    // Вызываем partialProfit на разных уровнях
    if (!firstPartialCalled && level >= 20) {
      firstPartialCalled = true;
      await commitPartialProfit("BTCUSDT", 30);
      // console.log(`[TEST #17] First partialProfit called at level ${level}%`);
    } else if (!secondPartialCalled && level >= 30) {
      secondPartialCalled = true;
      await commitPartialProfit("BTCUSDT", 40);
      // console.log(`[TEST #17] Second partialProfit called at level ${level}%`);
    }
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-listener-partial-multiple",
    exchangeName: "binance-listener-partial-multiple",
    frameName: "50m-listener-partial-multiple",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeListener();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!firstPartialCalled) {
    fail("First partialProfit was NOT called");
    return;
  }

  if (!secondPartialCalled) {
    fail("Second partialProfit was NOT called");
    return;
  }

  if (listenerEvents.length < 3) {
    fail(`Expected at least 3 listener events, got ${listenerEvents.length}`);
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-listener-partial-multiple",
    exchangeName: "binance-listener-partial-multiple",
    frameName: "50m-listener-partial-multiple",
  });

  // console.log("[TEST #17] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #17] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!signal._partial || !Array.isArray(signal._partial) || signal._partial.length !== 2) {
    fail(`Field _partial should have 2 items, got ${signal._partial?.length}`);
    return;
  }

  const partial1 = signal._partial[0];
  const partial2 = signal._partial[1];

  if (partial1.type !== "profit" || partial1.percent !== 30) {
    fail(`Expected first type='profit' percent=30, got type='${partial1.type}' percent=${partial1.percent}`);
    return;
  }

  if (partial2.type !== "profit" || partial2.percent !== 40) {
    fail(`Expected second type='profit' percent=40, got type='${partial2.type}' percent=${partial2.percent}`);
    return;
  }

  pass("listenPartialProfit WORKS: 2 events fired, _partial field validated");
});


/**
 * PARTIAL LISTENER TEST #18: partialProfit() with listenPartialProfit for SHORT
 *
 * Проверяем что:
 * - listenPartialProfit срабатывает для SHORT позиций
 * - Валидация работает корректно (currentPrice < priceOpen для SHORT profit)
 * - Поле _partial обновляется правильно
 */
test("PARTIAL LISTENER: partialProfit() with listenPartialProfit for SHORT", async ({ pass, fail }) => {
  const { commitPartialProfit, listenPartialProfitAvailable } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialCalled = false;
  let listenerFired = false;
  let listenerData = null;

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
    exchangeName: "binance-listener-short-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-listener-short-profit",
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

      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Активация: цена = basePrice
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 25) {
          // Падение к TP: постепенно падаем до 40% пути к TP (для SHORT это падение = профит)
          const progress = (i - 5) / 20; // 0 -> 1
          const targetPrice = basePrice - 60000; // TP
          const currentPrice = basePrice + (targetPrice - basePrice) * progress * 0.4; // 40% к TP
          allCandles.push({
            timestamp,
            open: currentPrice,
            high: currentPrice + 100,
            low: currentPrice - 100,
            close: currentPrice,
            volume: 100,
          });
        } else {
          // Достигаем TP
          const price = basePrice - 60000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 60000,
        priceStopLoss: basePrice + 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "40m-listener-short-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  // Подписываемся на события listenPartialProfit и вызываем partialProfit внутри
  const unsubscribeListener = listenPartialProfitAvailable(async ({ symbol, signal, price, level, backtest }) => {
    listenerFired = true;
    listenerData = { symbol, signalId: signal?.id, price, level, backtest };
    // console.log(`[TEST #18 listenPartialProfit] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);

    // Вызываем partialProfit при достижении уровня 30%
    if (!partialCalled && level >= 30) {
      partialCalled = true;
      await commitPartialProfit("BTCUSDT", 30);
      // console.log(`[TEST #18] partialProfit called at level ${level}%`);
    }
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-listener-short-profit",
    exchangeName: "binance-listener-short-profit",
    frameName: "40m-listener-short-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeListener();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialCalled) {
    fail("partialProfit was NOT called");
    return;
  }

  if (!listenerFired) {
    fail("listenPartialProfit was NOT triggered");
    return;
  }

  if (!listenerData) {
    fail("listenPartialProfit did not receive data");
    return;
  }

  // Проверяем данные из listener
  if (listenerData.symbol !== "BTCUSDT") {
    fail(`Expected symbol 'BTCUSDT', got '${listenerData.symbol}'`);
    return;
  }

  if (typeof listenerData.level !== "number") {
    fail(`Expected level to be a number, got ${typeof listenerData.level}`);
    return;
  }

  if (listenerData.backtest !== true) {
    fail(`Expected backtest to be true, got ${listenerData.backtest}`);
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-listener-short-profit",
    exchangeName: "binance-listener-short-profit",
    frameName: "40m-listener-short-profit",
  });

  // console.log("[TEST #18] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #18] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!signal._partial || !Array.isArray(signal._partial) || signal._partial.length !== 1) {
    fail("Field _partial is invalid or empty");
    return;
  }

  const partial = signal._partial[0];
  if (partial.type !== "profit" || partial.percent !== 30) {
    fail(`Expected type='profit' percent=30, got type='${partial.type}' percent=${partial.percent}`);
    return;
  }

  pass("listenPartialProfit SHORT WORKS: listener fired, _partial field validated");
});

import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenDoneBacktest,
  listenError,
  listenPartialProfit,
  listenPartialLoss,
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

  addExchange({
    exchangeName: "binance-partial-fill",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-partial-short-fill",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-partial-short-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-partial-facade-1",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-partial-facade-2",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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
  const { Partial, addStrategy } = await import("../../build/index.mjs");

  // Register strategy first to pass validation
  addStrategy({
    strategyName: "nonexistent-strategy",
    interval: "1m",
    getSignal: async () => null,
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

  addExchange({
    exchangeName: "binance-partial-progress",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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
      const steps = 20;
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

  addFrame({
    frameName: "60m-partial-progress",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
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
    frameName: "60m-partial-progress",
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


/**
 * PARTIAL LISTENERS TEST: Using listenPartialProfit/listenPartialLoss for event tracking
 *
 * This test verifies that global event listeners work correctly:
 * - listenPartialProfit captures profit milestone events
 * - listenPartialLoss captures loss milestone events
 * - Events contain correct data (symbol, level, currentPrice, backtest flag)
 * - Milestone levels (10%, 20%, 30%, etc.) are emitted correctly
 */
test("PARTIAL LISTENERS: listenPartialProfit and listenPartialLoss capture events", async ({ pass, fail }) => {
  const partialProfitEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const priceOpen = basePrice - 500; // 99500 (LONG: buy lower)
  const priceTakeProfit = priceOpen + 1000; // 100500
  const priceStopLoss = priceOpen - 1000; // 98500
  const tpDistance = priceTakeProfit - priceOpen; // 1000
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Pre-fill initial candles for getAveragePrice (min 5 candles)
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

  addExchange({
    exchangeName: "binance-partial-listeners",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-partial-listeners",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Regenerate ALL candles in first getSignal call
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
      const steps = 20;
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

      return {
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "60m-partial-listeners",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();

  // Subscribe to partial profit/loss events BEFORE starting backtest
  const unsubscribeProfit = listenPartialProfit((event) => {
    partialProfitEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialProfit] Symbol: ${event.symbol}, Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  const unsubscribeLoss = listenPartialLoss((event) => {
    partialLossEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialLoss] Symbol: ${event.symbol}, Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

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
    strategyName: "test-partial-listeners",
    exchangeName: "binance-partial-listeners",
    frameName: "60m-partial-listeners",
  });

  await awaitSubject.toPromise();
  await sleep(100); // Final flush

  // Cleanup
  unsubscribeProfit();
  unsubscribeLoss();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // No loss events expected (price moves towards TP, not SL)
  if (partialLossEvents.length > 0) {
    fail(`Expected 0 loss events, got ${partialLossEvents.length}`);
    return;
  }

  // Should have at least 3 profit events
  if (partialProfitEvents.length < 3) {
    fail(`Expected at least 3 profit events, got ${partialProfitEvents.length}`);
    return;
  }

  // Verify all events have backtest=true
  if (!partialProfitEvents.every(e => e.backtest === true)) {
    fail("All events should have backtest=true");
    return;
  }

  // Verify all events have correct symbol
  if (!partialProfitEvents.every(e => e.symbol === "BTCUSDT")) {
    fail("All events should have symbol=BTCUSDT");
    return;
  }

  // Verify levels are milestone values (10, 20, 30, etc.)
  for (let i = 0; i < partialProfitEvents.length; i++) {
    const level = partialProfitEvents[i].level;
    if (level % 1 !== 0) {
      fail(`Level should be integer milestone (10, 20, 30), got ${level}`);
      return;
    }
  }

  // Verify levels increase monotonically
  for (let i = 1; i < partialProfitEvents.length; i++) {
    if (partialProfitEvents[i].level <= partialProfitEvents[i - 1].level) {
      fail(`Levels should increase: ${partialProfitEvents[i - 1].level}% -> ${partialProfitEvents[i].level}%`);
      return;
    }
  }

  const maxLevel = Math.max(...partialProfitEvents.map(e => e.level));
  const uniqueLevels = [...new Set(partialProfitEvents.map(e => e.level))].sort((a, b) => a - b);

  // console.log(`\n=== VERIFICATION PASSED ===`);
  // console.log(`Total events: ${partialProfitEvents.length}`);
  // console.log(`Unique levels: ${uniqueLevels.join('%, ')}%`);
  // console.log(`Max level: ${maxLevel}%`);
  // console.log(`===========================\n`);

  pass(`listenPartialProfit WORKS: ${partialProfitEvents.length} events, levels: ${uniqueLevels.join('%, ')}%, max ${maxLevel}%`);
});


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
test("PARTIAL DEDUPE: Events NOT emitted twice for same level", async ({ pass, fail }) => {
  const partialProfitEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const priceOpen = basePrice - 500; // 99500
  const priceTakeProfit = priceOpen + 1000; // 100500
  const priceStopLoss = priceOpen - 1000; // 98500
  const tpDistance = priceTakeProfit - priceOpen; // 1000
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Pre-fill initial candles for getAveragePrice (min 5 candles)
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
    exchangeName: "binance-partial-dedupe",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-partial-dedupe",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Regenerate ALL candles in first getSignal call
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

      // Phase 1: Activation (candles 0-4) - price at priceOpen
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

      // Phase 2: Rise to 25% profit (candles 5-9)
      // This should trigger events at 1%, 3%, 6%, 10%, 15%, 20%, 25%
      for (let i = 0; i < 5; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = 0.05 * (i + 1); // 0.05, 0.10, 0.15, 0.20, 0.25
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

      // Phase 3: Drop back to 12% profit (candles 10-12)
      // Price falls but NO new events should be emitted (levels already reached)
      for (let i = 0; i < 3; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = 0.12; // 12% profit
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

      // Phase 4: Rise AGAIN to 25% profit (candles 13-17)
      // Price returns to previous high, but NO duplicate events should be emitted
      for (let i = 0; i < 5; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = 0.05 * (i + 1) + 0.12; // 0.17, 0.22, 0.27, ...
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

      // Phase 5: Continue to TP (candles 18-25)
      const remainingSteps = 8;
      for (let i = 0; i < remainingSteps; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = 0.37 + (0.63 / remainingSteps) * (i + 1); // 0.37 -> 1.0
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

      // Phase 6: Hold at TP for closure (candles 26-28)
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

      // console.log(`\n=== PARTIAL DEDUPE TEST SETUP ===`);
      // console.log(`Total candles: ${allCandles.length}`);
      // console.log(`Phase 2: Rise to 25% (candles 5-9)`);
      // console.log(`Phase 3: Drop to 12% (candles 10-12)`);
      // console.log(`Phase 4: Rise again to 32% (candles 13-17)`);
      // console.log(`Expected: NO duplicate events for levels 15%, 20%, 25%`);
      // console.log(`===================================\n`);

      return {
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "60m-partial-dedupe",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();

  // Subscribe to partial profit/loss events BEFORE starting backtest
  const unsubscribeProfit = listenPartialProfit((event) => {
    partialProfitEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialProfit] Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  const unsubscribeLoss = listenPartialLoss((event) => {
    partialLossEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialLoss] Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  listenDoneBacktest(async () => {
    // console.log(`\n=== BACKTEST COMPLETED ===`);
    // console.log(`Total profit events: ${partialProfitEvents.length}`);
    await sleep(50);
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    if (error && error.message && error.message.includes("no candles data")) {
      // console.log(`[IGNORED] ${error.message}`);
      return;
    }
    console.error(`\n[ERROR]`, error);
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-dedupe",
    exchangeName: "binance-partial-dedupe",
    frameName: "60m-partial-dedupe",
  });

  await awaitSubject.toPromise();
  await sleep(100);

  // Cleanup
  unsubscribeProfit();
  unsubscribeLoss();
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

  // Should have profit events
  if (partialProfitEvents.length < 3) {
    fail(`Expected at least 3 profit events, got ${partialProfitEvents.length}`);
    return;
  }

  // CRITICAL: Check for duplicate levels
  const levelCounts = new Map();
  for (const event of partialProfitEvents) {
    const count = levelCounts.get(event.level) || 0;
    levelCounts.set(event.level, count + 1);
  }

  // Find any duplicates
  const duplicates = [];
  for (const [level, count] of levelCounts.entries()) {
    if (count > 1) {
      duplicates.push(`${level}% (${count} times)`);
    }
  }

  if (duplicates.length > 0) {
    fail(`Duplicate events detected: ${duplicates.join(', ')}. Each level should emit only ONCE!`);
    return;
  }

  // Verify all levels are unique
  const uniqueLevels = [...new Set(partialProfitEvents.map(e => e.level))].sort((a, b) => a - b);
  if (uniqueLevels.length !== partialProfitEvents.length) {
    fail(`Event count mismatch: ${partialProfitEvents.length} events but only ${uniqueLevels.length} unique levels`);
    return;
  }

  const maxLevel = Math.max(...partialProfitEvents.map(e => e.level));

  // console.log(`\n=== VERIFICATION PASSED ===`);
  // console.log(`Total events: ${partialProfitEvents.length}`);
  // console.log(`Unique levels: ${uniqueLevels.join('%, ')}%`);
  // console.log(`All levels emitted exactly ONCE (no duplicates)`);
  // console.log(`===========================\n`);

  pass(`Deduplication WORKS: ${partialProfitEvents.length} unique events, levels: ${uniqueLevels.join('%, ')}%, max ${maxLevel}%`);
});


/**
 * PARTIAL FUNCTION TEST #1: partialProfit() успешно закрывает 30% позиции LONG
 *
 * Проверяем что:
 * - Функция partialProfit принимает symbol и percentToClose
 * - Извлекает currentPrice через getAveragePrice автоматически
 * - Валидация проходит (LONG: currentPrice > priceOpen для profit)
 * - Состояние _partial обновляется корректно
 */
test("PARTIAL FUNCTION: partialProfit() closes 30% of LONG position", async ({ pass, fail }) => {
  const { partialProfit } = await import("../../build/index.mjs");

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

  addExchange({
    exchangeName: "binance-function-partial-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-function-partial-profit",
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
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 20) {
          const price = basePrice + 20000;
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
            open: basePrice + 10000,
            high: basePrice + 10100,
            low: basePrice + 9900,
            close: basePrice + 10000,
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
    callbacks: {
      onPartialProfit: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Вызываем partialProfit при достижении 20% к TP
        if (!partialCalled && revenuePercent >= 20) {
          partialCalled = true;
          try {
            await partialProfit("BTCUSDT", 30); // Закрываем 30%
            // console.log("[TEST] partialProfit called: 30% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] partialProfit error:", err);
          }
        }
      },
    },
  });

  addFrame({
    frameName: "40m-function-partial-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-partial-profit",
    exchangeName: "binance-function-partial-profit",
    frameName: "40m-function-partial-profit",
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
    strategyName: "test-function-partial-profit",
    exchangeName: "binance-function-partial-profit",
    frameName: "40m-function-partial-profit",
  });

// console.log("[TEST #11] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
// console.log("[TEST #11] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

// console.log("[TEST #11] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 1) {
    fail(`Expected 1 partial close, got ${signal._partial.length}`);
    return;
  }

  const partial = signal._partial[0];
// console.log("[TEST #11] partial[0]:", JSON.stringify(partial, null, 2));

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

  pass("partialProfit() WORKS: 30% position closed successfully, _partial field validated");
});


/**
 * PARTIAL FUNCTION TEST #2: partialLoss() успешно закрывает 40% позиции LONG
 *
 * Проверяем что:
 * - Функция partialLoss принимает symbol и percentToClose
 * - Валидация проходит (LONG: currentPrice < priceOpen для loss)
 * - Состояние _partial обновляется типом "loss"
 */
test("PARTIAL FUNCTION: partialLoss() closes 40% of LONG position", async ({ pass, fail }) => {
  const { partialLoss } = await import("../../build/index.mjs");

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

  addExchange({
    exchangeName: "binance-function-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-function-partial-loss",
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
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 20) {
          const price = basePrice - 10000;
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
            open: basePrice - 5000,
            high: basePrice - 4900,
            low: basePrice - 5100,
            close: basePrice - 5000,
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
    callbacks: {
      onPartialLoss: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Вызываем partialLoss при достижении 20% к SL
        if (!partialCalled && revenuePercent >= 20) {
          partialCalled = true;
          try {
            await partialLoss("BTCUSDT", 40); // Закрываем 40%
            // console.log("[TEST] partialLoss called: 40% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] partialLoss error:", err);
          }
        }
      },
    },
  });

  addFrame({
    frameName: "40m-function-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-partial-loss",
    exchangeName: "binance-function-partial-loss",
    frameName: "40m-function-partial-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialCalled) {
    fail("partialLoss was NOT called");
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-partial-loss",
    exchangeName: "binance-function-partial-loss",
    frameName: "40m-function-partial-loss",
  });

  // console.log("[TEST #12] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #12] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  // console.log("[TEST #12] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 1) {
    fail(`Expected 1 partial close, got ${signal._partial.length}`);
    return;
  }

  const partial = signal._partial[0];
  // console.log("[TEST #12] partial[0]:", JSON.stringify(partial, null, 2));

  if (partial.type !== "loss") {
    fail(`Expected type 'loss', got '${partial.type}'`);
    return;
  }

  if (partial.percent !== 40) {
    fail(`Expected percent 40, got ${partial.percent}`);
    return;
  }

  if (typeof partial.price !== "number") {
    fail(`Expected price to be a number, got ${typeof partial.price}`);
    return;
  }

  pass("partialLoss() WORKS: 40% position closed successfully, _partial field validated");
});


/**
 * PARTIAL FUNCTION TEST #3: Множественные partialProfit - 30%, потом еще 40%
 */
test("PARTIAL FUNCTION: Multiple partialProfit calls (30% + 40%)", async ({ pass, fail }) => {
  const { partialProfit } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let firstPartialCalled = false;
  let secondPartialCalled = false;

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
    exchangeName: "binance-function-partial-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-function-partial-multiple",
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
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else {
          const price = basePrice + 15000;
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
    callbacks: {
      onPartialProfit: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Первый вызов при 10%
        if (!firstPartialCalled && revenuePercent >= 10) {
          firstPartialCalled = true;
          try {
            await partialProfit("BTCUSDT", 30);
            // console.log("[TEST] First partial: 30% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] First partial error:", err);
          }
        }
        // Второй вызов при 20%
        else if (!secondPartialCalled && revenuePercent >= 20) {
          secondPartialCalled = true;
          try {
            await partialProfit("BTCUSDT", 40);
            // console.log("[TEST] Second partial: 40% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] Second partial error:", err);
          }
        }
      },
    },
  });

  addFrame({
    frameName: "50m-function-partial-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-partial-multiple",
    exchangeName: "binance-function-partial-multiple",
    frameName: "50m-function-partial-multiple",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

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

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-partial-multiple",
    exchangeName: "binance-function-partial-multiple",
    frameName: "50m-function-partial-multiple",
  });

  // console.log("[TEST #13] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #13] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  // console.log("[TEST #13] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 2) {
    fail(`Expected 2 partial closes, got ${signal._partial.length}`);
    return;
  }

  const partial1 = signal._partial[0];
  // console.log("[TEST #13] partial[0]:", JSON.stringify(partial1, null, 2));

  if (partial1.type !== "profit") {
    fail(`Expected first type 'profit', got '${partial1.type}'`);
    return;
  }

  if (partial1.percent !== 30) {
    fail(`Expected first percent 30, got ${partial1.percent}`);
    return;
  }

  if (typeof partial1.price !== "number") {
    fail(`Expected first price to be a number, got ${typeof partial1.price}`);
    return;
  }

  const partial2 = signal._partial[1];
  // console.log("[TEST #13] partial[1]:", JSON.stringify(partial2, null, 2));

  if (partial2.type !== "profit") {
    fail(`Expected second type 'profit', got '${partial2.type}'`);
    return;
  }

  if (partial2.percent !== 40) {
    fail(`Expected second percent 40, got ${partial2.percent}`);
    return;
  }

  if (typeof partial2.price !== "number") {
    fail(`Expected second price to be a number, got ${typeof partial2.price}`);
    return;
  }

  pass("Multiple partialProfit() WORKS: 30% + 40% = 70% closed, _partial field validated");
});


/**
 * PARTIAL FUNCTION TEST #4: SHORT позиция - partialProfit
 */
test("PARTIAL FUNCTION: partialProfit() works for SHORT position", async ({ pass, fail }) => {
  const { partialProfit } = await import("../../build/index.mjs");

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

  addExchange({
    exchangeName: "binance-function-short-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

      for (let i = 0; i < 40; i++) {
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
        priceOpen: basePrice,
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
            await partialProfit("BTCUSDT", 30);
            // console.log("[TEST] partialProfit SHORT called: 30% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] partialProfit error:", err);
          }
        }
      },
    },
  });

  addFrame({
    frameName: "40m-function-short-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
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
    frameName: "40m-function-short-profit",
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
    frameName: "40m-function-short-profit",
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


/**
 * PARTIAL LISTENER TEST #15: partialProfit() with listenPartialProfit for LONG
 *
 * Проверяем что:
 * - listenPartialProfit срабатывает при вызове partialProfit()
 * - Получаем корректные данные в событии
 * - Поле _partial обновляется в сигнале
 */
test("PARTIAL LISTENER: partialProfit() with listenPartialProfit for LONG", async ({ pass, fail }) => {
  const { partialProfit, listenPartialProfit } = await import("../../build/index.mjs");

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

  addExchange({
    exchangeName: "binance-listener-partial-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
    frameName: "40m-listener-partial-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  // Подписываемся на события listenPartialProfit и вызываем partialProfit внутри
  const unsubscribeListener = listenPartialProfit(async ({ symbol, signal, price, level, backtest }) => {
    listenerFired = true;
    listenerData = { symbol, signalId: signal?.id, price, level, backtest };
    // console.log(`[TEST #15 listenPartialProfit] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);

    // Вызываем partialProfit при достижении уровня 30%
    if (!partialCalled && level >= 30) {
      partialCalled = true;
      await partialProfit("BTCUSDT", 30);
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
 * - listenPartialLoss срабатывает при вызове partialLoss()
 * - Получаем корректные данные в событии
 * - Поле _partial обновляется типом "loss"
 */
test("PARTIAL LISTENER: partialLoss() with listenPartialLoss for LONG", async ({ pass, fail }) => {
  const { partialLoss, listenPartialLoss } = await import("../../build/index.mjs");

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

  addExchange({
    exchangeName: "binance-listener-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
    frameName: "40m-listener-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  // Подписываемся на события listenPartialLoss и вызываем partialLoss внутри
  const unsubscribeListener = listenPartialLoss(async ({ symbol, signal, price, level, backtest }) => {
    listenerFired = true;
    listenerData = { symbol, signalId: signal?.id, price, level, backtest };
    // console.log(`[TEST #16 listenPartialLoss] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);

    // Вызываем partialLoss при достижении уровня 30%
    if (!partialCalled && level >= 30) {
      partialCalled = true;
      await partialLoss("BTCUSDT", 40);
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
test("PARTIAL LISTENER: Multiple partialProfit with listenPartialProfit", async ({ pass, fail }) => {
  const { partialProfit, listenPartialProfit } = await import("../../build/index.mjs");

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

  addExchange({
    exchangeName: "binance-listener-partial-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
    frameName: "50m-listener-partial-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  // Подписываемся на события listenPartialProfit и вызываем partialProfit внутри
  const unsubscribeListener = listenPartialProfit(async ({ symbol, signal, price, level, backtest }) => {
    listenerEvents.push({ symbol, signalId: signal?.id, price, level, backtest });
    // console.log(`[TEST #17 listenPartialProfit] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}, count=${listenerEvents.length}`);

    // Вызываем partialProfit на разных уровнях
    if (!firstPartialCalled && level >= 20) {
      firstPartialCalled = true;
      await partialProfit("BTCUSDT", 30);
      // console.log(`[TEST #17] First partialProfit called at level ${level}%`);
    } else if (!secondPartialCalled && level >= 30) {
      secondPartialCalled = true;
      await partialProfit("BTCUSDT", 40);
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

  if (listenerEvents.length !== 3) {
    fail(`Expected 3 listener events, got ${listenerEvents.length}`);
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
  const { partialProfit, listenPartialProfit } = await import("../../build/index.mjs");

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

  addExchange({
    exchangeName: "binance-listener-short-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
    frameName: "40m-listener-short-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  // Подписываемся на события listenPartialProfit и вызываем partialProfit внутри
  const unsubscribeListener = listenPartialProfit(async ({ symbol, signal, price, level, backtest }) => {
    listenerFired = true;
    listenerData = { symbol, signalId: signal?.id, price, level, backtest };
    // console.log(`[TEST #18 listenPartialProfit] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);

    // Вызываем partialProfit при достижении уровня 30%
    if (!partialCalled && level >= 30) {
      partialCalled = true;
      await partialProfit("BTCUSDT", 30);
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

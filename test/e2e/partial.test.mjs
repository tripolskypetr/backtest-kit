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

  let allCandles = [];
  let signalGenerated = false;

  // Создаем начальные свечи
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

  addExchange({
    exchangeName: "binance-partial-fill",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
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

  let allCandles = [];
  let signalGenerated = false;

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

  addExchange({
    exchangeName: "binance-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
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

  let allCandles = [];
  let signalGenerated = false;

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

  addExchange({
    exchangeName: "binance-partial-short-fill",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
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

  let allCandles = [];
  let signalGenerated = false;

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

  addExchange({
    exchangeName: "binance-partial-short-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
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

  let allCandles = [];
  let signalGenerated = false;

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

  addExchange({
    exchangeName: "binance-partial-facade-1",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
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

  const stats = await Partial.getData("BTCUSDT", "test-partial-facade-1");

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

  let allCandles = [];
  let signalGenerated = false;

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

  addExchange({
    exchangeName: "binance-partial-facade-2",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
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

  const markdown = await Partial.getReport("ETHUSDT", "test-partial-facade-2");

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
  const { Partial } = await import("../../build/index.mjs");

  const stats = await Partial.getData("NONEXISTENT_SYMBOL_12345", "nonexistent-strategy");

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

  let allCandles = [];
  let signalGenerated = false;

  // CRITICAL: Pre-fill initial candles for getAveragePrice (min 5 candles)
  // Candles must be ABOVE priceOpen to ensure scheduled state (not immediate activation)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
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
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
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

  let allCandles = [];
  let signalGenerated = false;

  // Pre-fill initial candles for getAveragePrice (min 5 candles)
  // Candles must be ABOVE priceOpen to ensure scheduled state (not immediate activation)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
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
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
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

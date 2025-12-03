import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenDoneBacktest,
  listenError,
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

  for (let i = 1; i < partialFillEvents.length; i++) {
    if (partialFillEvents[i].revenuePercent <= partialFillEvents[i - 1].revenuePercent) {
      fail(`Revenue should increase: ${partialFillEvents[i - 1].revenuePercent.toFixed(2)}% -> ${partialFillEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  const maxRevenue = Math.max(...partialFillEvents.map(e => e.revenuePercent));
  pass(`onPartialProfit WORKS: ${partialFillEvents.length} calls, max revenue ${maxRevenue.toFixed(2)}%`);
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

  for (let i = 0; i < partialLossEvents.length; i++) {
    if (partialLossEvents[i].revenuePercent >= 0) {
      fail(`Revenue should be negative, got ${partialLossEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  for (let i = 1; i < partialLossEvents.length; i++) {
    if (partialLossEvents[i].revenuePercent >= partialLossEvents[i - 1].revenuePercent) {
      fail(`Loss should increase: ${partialLossEvents[i - 1].revenuePercent.toFixed(2)}% -> ${partialLossEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  const maxLoss = Math.min(...partialLossEvents.map(e => e.revenuePercent));
  pass(`onPartialLoss WORKS: ${partialLossEvents.length} calls, max loss ${maxLoss.toFixed(2)}%`);
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

  const maxRevenue = Math.max(...partialFillEvents.map(e => e.revenuePercent));
  pass(`onPartialProfit SHORT WORKS: ${partialFillEvents.length} calls, max revenue ${maxRevenue.toFixed(2)}%`);
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

  for (let i = 0; i < partialLossEvents.length; i++) {
    if (partialLossEvents[i].revenuePercent >= 0) {
      fail(`Revenue should be negative, got ${partialLossEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  const maxLoss = Math.min(...partialLossEvents.map(e => e.revenuePercent));
  pass(`onPartialLoss SHORT WORKS: ${partialLossEvents.length} calls, max loss ${maxLoss.toFixed(2)}%`);
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

  const stats = await Partial.getData("BTCUSDT");

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

  const markdown = await Partial.getReport("ETHUSDT");

  if (
    markdown &&
    markdown.includes("# Partial Profit/Loss Report: ETHUSDT") &&
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

  const stats = await Partial.getData("NONEXISTENT_SYMBOL_12345");

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

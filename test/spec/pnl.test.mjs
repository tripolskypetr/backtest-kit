import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter, sleep } from "functools-kit";

test("PNL is being calculated", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-costs",
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

  addStrategy({
    strategyName: "test-strategy-costs",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "calculation verification",
        priceTakeProfit: price + 100,
        priceStopLoss: price - 10_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-costs",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenSignalBacktest((event) => {
    if (event.action === "closed") {
      resolve(event.pnl);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-costs",
    exchangeName: "binance-mock-costs",
    frameName: "1d-backtest-costs",
  });

  const pnl = await awaiter;

  if (pnl) {
    pass(`PNL was calculated: ${pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  fail("PNL was not calculated");

});

test("getData returns BacktestStatistics structure", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-stats",
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

  addStrategy({
    strategyName: "test-strategy-stats",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "calculation verification",
        priceTakeProfit: price + 100,
        priceStopLoss: price - 10_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-stats",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenSignalBacktest((event) => {
    if (event.action === "closed") {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-stats",
    exchangeName: "binance-mock-stats",
    frameName: "1d-backtest-stats",
  });

  await awaiter;

  const stats = await Backtest.getData("test-strategy-stats");

  if (!stats) {
    fail("getData returned null");
    return;
  }

  if (typeof stats.totalSignals !== "number") {
    fail("totalSignals is not a number");
    return;
  }

  if (!Array.isArray(stats.signalList)) {
    fail("signalList is not an array");
    return;
  }

  if (stats.totalSignals !== stats.signalList.length) {
    fail(`totalSignals (${stats.totalSignals}) does not match signalList length (${stats.signalList.length})`);
    return;
  }

  pass(`getData returned valid BacktestStatistics with ${stats.totalSignals} signals`);

});


test("getData calculates all statistical metrics", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-metrics",
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

  addStrategy({
    strategyName: "test-strategy-metrics",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "calculation verification",
        priceTakeProfit: price + 100,
        priceStopLoss: price - 10_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-metrics",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenSignalBacktest((event) => {
    if (event.action === "closed") {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-metrics",
    exchangeName: "binance-mock-metrics",
    frameName: "1d-backtest-metrics",
  });

  await awaiter;

  const stats = await Backtest.getData("test-strategy-metrics");

  const requiredFields = [
    "signalList",
    "totalSignals",
    "winCount",
    "lossCount",
    "winRate",
    "avgPnl",
    "totalPnl",
    "stdDev",
    "sharpeRatio",
    "annualizedSharpeRatio",
    "certaintyRatio",
    "expectedYearlyReturns",
  ];

  for (const field of requiredFields) {
    if (!(field in stats)) {
      fail(`Missing field: ${field}`);
      return;
    }
  }

  pass(`All statistical metrics are present: ${requiredFields.join(", ")}`);

});


test("getData returns null for invalid metrics with safe math", async ({ pass, fail }) => {

  addExchange({
    exchangeName: "binance-mock-safemath",
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

  addStrategy({
    strategyName: "test-strategy-safemath",
    interval: "1m",
    getSignal: async () => {
      return null;
    },
  });

  addFrame({
    frameName: "1d-backtest-safemath",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-safemath",
    exchangeName: "binance-mock-safemath",
    frameName: "1d-backtest-safemath",
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  const stats = await Backtest.getData("test-strategy-safemath");

  if (stats.totalSignals !== 0) {
    fail(`Expected 0 signals, got ${stats.totalSignals}`);
    return;
  }

  if (stats.winRate !== null) {
    fail(`Expected null winRate for empty data, got ${stats.winRate}`);
    return;
  }

  if (stats.avgPnl !== null) {
    fail(`Expected null avgPnl for empty data, got ${stats.avgPnl}`);
    return;
  }

  pass("Safe math returns null for invalid metrics with empty data");

});



test("getData includes signalList with all closed trades", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();
  let closedCount = 0;

  addExchange({
    exchangeName: "binance-mock-signallist",
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

  addStrategy({
    strategyName: "test-strategy-signallist",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "calculation verification",
        priceTakeProfit: price + 100,
        priceStopLoss: price - 10_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-signallist",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-03T00:00:00Z"),
  });

  const unsubscribe = listenSignalBacktest((event) => {
    if (event.action === "closed") {
      closedCount++;
      if (closedCount >= 2) {
        resolve(true);
        unsubscribe();
      }
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-signallist",
    exchangeName: "binance-mock-signallist",
    frameName: "1d-backtest-signallist",
  });

  await awaiter;

  const stats = await Backtest.getData("test-strategy-signallist");

  if (!Array.isArray(stats.signalList)) {
    fail("signalList is not an array");
    return;
  }

  if (stats.signalList.length === 0) {
    fail("signalList is empty");
    return;
  }

  const hasValidSignals = stats.signalList.every((signal) => {
    return signal.action === "closed" && signal.pnl !== undefined;
  });

  if (!hasValidSignals) {
    fail("signalList contains invalid signals");
    return;
  }

  pass(`signalList contains ${stats.signalList.length} valid closed trades`);

});

test("Statistical metrics are calculated correctly", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();
  let closedCount = 0;

  addExchange({
    exchangeName: "binance-mock-calculation",
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

  addStrategy({
    strategyName: "test-strategy-calculation",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "calculation verification",
        priceTakeProfit: price + 100,
        priceStopLoss: price - 10_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-calculation",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-05T00:00:00Z"),
  });

  const unsubscribe = listenSignalBacktest((event) => {
    if (event.action === "closed") {
      closedCount++;
      if (closedCount >= 3) {
        resolve(true);
        unsubscribe();
      }
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-calculation",
    exchangeName: "binance-mock-calculation",
    frameName: "1d-backtest-calculation",
  });

  await awaiter;

  const stats = await Backtest.getData("test-strategy-calculation");

  if (stats.totalSignals < 3) {
    fail(`Expected at least 3 signals, got ${stats.totalSignals}`);
    return;
  }

  if (typeof stats.winRate !== "number") {
    fail(`winRate should be a number, got ${typeof stats.winRate}`);
    return;
  }

  if (stats.winRate < 0 || stats.winRate > 100) {
    fail(`winRate should be between 0 and 100, got ${stats.winRate}`);
    return;
  }

  if (typeof stats.stdDev !== "number") {
    fail(`stdDev should be a number, got ${typeof stats.stdDev}`);
    return;
  }

  if (stats.stdDev < 0) {
    fail(`stdDev should be positive, got ${stats.stdDev}`);
    return;
  }

  if (stats.sharpeRatio !== null && typeof stats.sharpeRatio !== "number") {
    fail(`sharpeRatio should be a number or null, got ${typeof stats.sharpeRatio}`);
    return;
  }

  if (stats.annualizedSharpeRatio !== null && typeof stats.annualizedSharpeRatio !== "number") {
    fail(`annualizedSharpeRatio should be a number or null, got ${typeof stats.annualizedSharpeRatio}`);
    return;
  }

  if (stats.certaintyRatio !== null && typeof stats.certaintyRatio !== "number") {
    fail(`certaintyRatio should be a number or null, got ${typeof stats.certaintyRatio}`);
    return;
  }

  pass(`All metrics calculated correctly: winRate=${stats.winRate.toFixed(2)}%, stdDev=${stats.stdDev.toFixed(2)}%`);

});

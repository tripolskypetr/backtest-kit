import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Performance,
  listenPerformance,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";

test("listenPerformance receives performance events", async ({ pass, fail }) => {
  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
    exchangeName: "binance-perf-events",
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
    strategyName: "test-strategy-perf-events",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "performance test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-perf-events",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  let eventCount = 0;
  const events = [];

  // Listen to performance events
  const unsubscribe = listenPerformance((event) => {
    eventCount++;
    events.push(event);

    // Unsubscribe after collecting some events
    if (eventCount >= 3) {
      resolve({ eventCount, events });
      unsubscribe();
    }
  });

  // Run backtest to generate performance events
  await Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-perf-events",
    exchangeName: "binance-perf-events",
    frameName: "1d-perf-events",
  });

  const result = await awaiter;

  if (result.eventCount >= 3) {
    pass(`Performance events received: ${result.eventCount}`);
    return;
  }

  fail("Performance events not received");
});

test("Performance events have required fields", async ({ pass, fail }) => {
  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
    exchangeName: "binance-perf-fields",
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
    strategyName: "test-strategy-perf-fields",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "performance fields test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-perf-fields",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Listen to first performance event
  const unsubscribe = listenPerformance((event) => {
    resolve(event);
    unsubscribe();
  });

  // Run backtest to generate performance events
  await Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-perf-fields",
    exchangeName: "binance-perf-fields",
    frameName: "1d-perf-fields",
  });

  const event = await awaiter;

  // Verify all required fields are present
  const hasTimestamp = typeof event.timestamp === "number";
  const hasMetricType = typeof event.metricType === "string";
  const hasDuration = typeof event.duration === "number";
  const hasStrategyName = typeof event.strategyName === "string";
  const hasExchangeName = typeof event.exchangeName === "string";
  const hasSymbol = typeof event.symbol === "string";
  const hasBacktest = typeof event.backtest === "boolean";

  if (
    hasTimestamp &&
    hasMetricType &&
    hasDuration &&
    hasStrategyName &&
    hasExchangeName &&
    hasSymbol &&
    hasBacktest
  ) {
    pass("Performance event has all required fields");
    return;
  }

  fail(
    `Missing fields: ${!hasTimestamp ? "timestamp " : ""}${!hasMetricType ? "metricType " : ""}${!hasDuration ? "duration " : ""}${!hasStrategyName ? "strategyName " : ""}${!hasExchangeName ? "exchangeName " : ""}${!hasSymbol ? "symbol " : ""}${!hasBacktest ? "backtest" : ""}`
  );
});

test("Performance.getData returns statistics", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "binance-perf-data",
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
    strategyName: "test-strategy-perf-data",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "performance data test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-perf-data",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Run backtest to generate performance data
  await Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-perf-data",
    exchangeName: "binance-perf-data",
    frameName: "1d-perf-data",
  });

  // Get performance statistics
  const stats = await Performance.getData("BTCUSDT", {
    strategyName: "test-strategy-perf-data",
    exchangeName: "binance-perf-data",
    frameName: "1d-perf-data",
  }, true);

  if (
    stats &&
    typeof stats.strategyName === "string" &&
    typeof stats.totalEvents === "number" &&
    typeof stats.totalDuration === "number" &&
    stats.metricStats &&
    Array.isArray(stats.events)
  ) {
    pass(`Performance.getData returned valid statistics with ${stats.totalEvents} events`);
    return;
  }

  fail("Performance.getData did not return valid statistics");
});

test("Performance statistics include metric types", async ({ pass, fail }) => {
  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
    exchangeName: "binance-perf-metrics",
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
    strategyName: "test-strategy-perf-metrics",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "performance metrics test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-perf-metrics",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Listen for backtest_total event to ensure processing is complete
  const unsubscribe = listenPerformance((event) => {
    if (event.metricType === "backtest_total") {
      resolve();
      unsubscribe();
    }
  });

  // Run backtest to generate performance data
  await Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-perf-metrics",
    exchangeName: "binance-perf-metrics",
    frameName: "1d-perf-metrics",
  });

  // Wait for backtest_total event
  await awaiter;

  // Get performance statistics
  const stats = await Performance.getData("BTCUSDT", {
    strategyName: "test-strategy-perf-metrics",
    exchangeName: "binance-perf-metrics",
    frameName: "1d-perf-metrics",
  }, true);

  // Check for expected metric types
  const metricTypes = Object.keys(stats.metricStats);
  const hasBacktestTotal = metricTypes.includes("backtest_total");
  const hasBacktestTimeframe = metricTypes.includes("backtest_timeframe");

  if (hasBacktestTotal && hasBacktestTimeframe) {
    pass(`Performance metrics include backtest_total and backtest_timeframe`);
    return;
  }

  fail(`Missing metric types. Found: ${metricTypes.join(", ")}`);
});

test("Performance.getReport returns markdown string", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "binance-perf-report",
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
    strategyName: "test-strategy-perf-report",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "performance report test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-perf-report",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Run backtest to generate performance data
  await Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-perf-report",
    exchangeName: "binance-perf-report",
    frameName: "1d-perf-report",
  });

  // Get performance report
  const markdown = await Performance.getReport("BTCUSDT", {
    strategyName: "test-strategy-perf-report",
    exchangeName: "binance-perf-report",
    frameName: "1d-perf-report",
  }, true);

  if (
    typeof markdown === "string" &&
    markdown.includes("# Performance Report") &&
    markdown.includes("test-strategy-perf-report")
  ) {
    pass("Performance.getReport returned valid markdown");
    return;
  }

  fail("Performance.getReport did not return valid markdown");
});

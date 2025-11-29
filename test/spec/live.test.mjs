import { test } from "worker-testbed";

import {
  addExchange,
  addStrategy,
  Live,
  PersistSignalAdapter,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";

test("Live.getData returns LiveStatistics structure", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const price = 42150.5;
  const now = Date.now();
  const mockSignal = {
    id: "mock-getdata-signal-id",
    position: "long",
    note: "Live getData test",
    priceOpen: price,
    priceTakeProfit: price + 8_000,
    priceStopLoss: price - 1_000,
    minuteEstimatedTime: 120,
    exchangeName: "binance-mock-live-getdata",
    strategyName: "test-strategy-live-getdata",
    scheduledAt: now,
    pendingAt: now,
    symbol: "BTCUSDT",
    _isScheduled: false,
  };

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}
    async readValue() {
      return mockSignal;
    }
    async hasValue() {
      return true;
    }
    async writeValue() {}
  });

  addExchange({
    exchangeName: "binance-mock-live-getdata",
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
    strategyName: "test-strategy-live-getdata",
    interval: "1m",
    getSignal: async () => {
      return null;
    },
    callbacks: {
      onActive: () => {
        resolve(true);
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "test-strategy-live-getdata",
    exchangeName: "binance-mock-live-getdata",
  });

  await awaiter;

  const stats = await Live.getData("test-strategy-live-getdata");

  if (
    stats &&
    typeof stats.totalEvents === "number" &&
    typeof stats.totalClosed === "number" &&
    Array.isArray(stats.eventList)
  ) {
    pass(`Live.getData returned valid LiveStatistics with ${stats.totalEvents} events`);
    return;
  }

  fail("Live.getData returned invalid structure");

});

test("Live.getData calculates all statistical metrics", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const price = 42150.5;
  const now = Date.now() - 2 * 60 * 1000;
  const mockSignal = {
    id: "mock-metrics-signal-id",
    position: "long",
    note: "Live metrics test",
    priceOpen: price,
    priceTakeProfit: price + 1_000,
    priceStopLoss: price - 1_000,
    minuteEstimatedTime: 1,
    exchangeName: "binance-mock-live-metrics",
    strategyName: "test-strategy-live-metrics",
    scheduledAt: now,
    pendingAt: now,
    symbol: "BTCUSDT",
    _isScheduled: false,
  };

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}
    async readValue() {
      return mockSignal;
    }
    async hasValue() {
      return true;
    }
    async writeValue() {}
  });

  addExchange({
    exchangeName: "binance-mock-live-metrics",
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
    strategyName: "test-strategy-live-metrics",
    interval: "1m",
    getSignal: async () => {
      return null;
    },
    callbacks: {
      onTick: (symbol, result) => {
        if (result.action === "closed") {
          resolve(true);
        }
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "test-strategy-live-metrics",
    exchangeName: "binance-mock-live-metrics",
  });

  await awaiter;

  const stats = await Live.getData("test-strategy-live-metrics");

  const hasAllMetrics =
    stats &&
    Array.isArray(stats.eventList) &&
    typeof stats.totalEvents === "number" &&
    typeof stats.totalClosed === "number" &&
    typeof stats.winCount === "number" &&
    typeof stats.lossCount === "number" &&
    (stats.winRate === null || typeof stats.winRate === "number") &&
    (stats.avgPnl === null || typeof stats.avgPnl === "number") &&
    (stats.totalPnl === null || typeof stats.totalPnl === "number") &&
    (stats.stdDev === null || typeof stats.stdDev === "number") &&
    (stats.sharpeRatio === null || typeof stats.sharpeRatio === "number") &&
    (stats.annualizedSharpeRatio === null || typeof stats.annualizedSharpeRatio === "number") &&
    (stats.certaintyRatio === null || typeof stats.certaintyRatio === "number") &&
    (stats.expectedYearlyReturns === null || typeof stats.expectedYearlyReturns === "number");

  if (hasAllMetrics) {
    pass("All statistical metrics are present: eventList, totalEvents, totalClosed, winCount, lossCount, winRate, avgPnl, totalPnl, stdDev, sharpeRatio, annualizedSharpeRatio, certaintyRatio, expectedYearlyReturns");
    return;
  }

  fail("Some statistical metrics are missing or have wrong type");

});

test("Live.getData returns null for invalid metrics with safe math", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-live-safe",
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
    strategyName: "test-strategy-live-safe",
    interval: "1m",
    getSignal: async () => {
      resolve(true);
      return null;
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "test-strategy-live-safe",
    exchangeName: "binance-mock-live-safe",
  });

  await awaiter;

  const stats = await Live.getData("test-strategy-live-safe");

  if (
    stats &&
    stats.totalClosed === 0 &&
    stats.winRate === null &&
    stats.avgPnl === null &&
    stats.totalPnl === null &&
    stats.stdDev === null &&
    stats.sharpeRatio === null &&
    stats.annualizedSharpeRatio === null &&
    stats.certaintyRatio === null &&
    stats.expectedYearlyReturns === null
  ) {
    pass("Safe math returns null for invalid metrics with empty data");
    return;
  }

  fail("Safe math did not return null for invalid metrics");

});

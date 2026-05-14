import { test } from "worker-testbed";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

import {
  addExchangeSchema,
  addStrategySchema,
  Live,
  PersistSignalAdapter,
} from "../../build/index.mjs";

import { createAwaiter } from "functools-kit";

test("Live.getData returns LiveStatistics structure", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const intervalMs = 60000;
  const basePrice = 42150.5;
  const bufferMinutes = 5;
  const now = Date.now();
  const bufferStartTime = alignTimestamp(now, 1) - bufferMinutes * intervalMs;

  let allCandles = [];
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  const mockSignal = {
    id: "mock-getdata-signal-id",
    position: "long",
    note: "Live getData test",
    priceOpen: basePrice,
    priceTakeProfit: basePrice + 8_000,
    priceStopLoss: basePrice - 1_000,
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
    async readSignalData() { return mockSignal; }
    async writeSignalData() {}
  });

  addExchangeSchema({
    exchangeName: "binance-mock-live-getdata",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategySchema({
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

  const stats = await Live.getData("BTCUSDT", {
    strategyName: "test-strategy-live-getdata",
    exchangeName: "binance-mock-live-getdata",
  });

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

  const intervalMs = 60000;
  const basePrice = 42150.5;
  const bufferMinutes = 5;
  const now = Date.now() - 2 * 60 * 1000;
  const bufferStartTime = alignTimestamp(now, 1) - bufferMinutes * intervalMs;

  let allCandles = [];
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  const mockSignal = {
    id: "mock-metrics-signal-id",
    position: "long",
    note: "Live metrics test",
    priceOpen: basePrice,
    priceTakeProfit: basePrice + 1_000,
    priceStopLoss: basePrice - 1_000,
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
    async readSignalData() { return mockSignal; }
    async writeSignalData() {}
  });

  addExchangeSchema({
    exchangeName: "binance-mock-live-metrics",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategySchema({
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

  const stats = await Live.getData("BTCUSDT", {
    strategyName: "test-strategy-live-metrics",
    exchangeName: "binance-mock-live-metrics",
  });

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

  const intervalMs = 60000;
  const basePrice = 42150.5;
  const bufferMinutes = 5;
  const now = Date.now();
  const bufferStartTime = alignTimestamp(now, 1) - bufferMinutes * intervalMs;

  let allCandles = [];
  for (let i = 0; i < 6; i++) {
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
    exchangeName: "binance-mock-live-safe",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategySchema({
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

  const stats = await Live.getData("BTCUSDT", {
    strategyName: "test-strategy-live-safe",
    exchangeName: "binance-mock-live-safe",
  });

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

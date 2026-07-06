import { test } from "worker-testbed";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import { createAwaiter, sleep } from "functools-kit";

test("PNL is being calculated", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

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
    exchangeName: "binance-mock-costs",
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
    strategyName: "test-strategy-costs",
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

      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else {
          const tpPrice = basePrice + 1000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

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

  addFrameSchema({
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

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

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
    exchangeName: "binance-mock-stats",
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
    strategyName: "test-strategy-stats",
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

      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else {
          const tpPrice = basePrice + 1000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

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

  addFrameSchema({
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

  const stats = await Backtest.getData("BTCUSDT", {
    strategyName: "test-strategy-stats",
    exchangeName: "binance-mock-stats",
    frameName: "1d-backtest-stats",
  });

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

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

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
    exchangeName: "binance-mock-metrics",
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
    strategyName: "test-strategy-metrics",
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

      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else {
          const tpPrice = basePrice + 1000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

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

  addFrameSchema({
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

  const stats = await Backtest.getData("BTCUSDT", {
    strategyName: "test-strategy-metrics",
    exchangeName: "binance-mock-metrics",
    frameName: "1d-backtest-metrics",
  });

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

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

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
    exchangeName: "binance-mock-safemath",
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
    strategyName: "test-strategy-safemath",
    interval: "1m",
    getSignal: async () => {
      return null;
    },
  });

  addFrameSchema({
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

  const stats = await Backtest.getData("BTCUSDT", {
    strategyName: "test-strategy-safemath",
    exchangeName: "binance-mock-safemath",
    frameName: "1d-backtest-safemath",
  });

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

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalCount = 0;

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
    exchangeName: "binance-mock-signallist",
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
    strategyName: "test-strategy-signallist",
    interval: "1m",
    getSignal: async () => {
      if (signalCount >= 2) return null;
      signalCount++;

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

      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else {
          const tpPrice = basePrice + 1000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

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

  addFrameSchema({
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

  const stats = await Backtest.getData("BTCUSDT", {
    strategyName: "test-strategy-signallist",
    exchangeName: "binance-mock-signallist",
    frameName: "1d-backtest-signallist",
  });

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

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalCount = 0;

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
    exchangeName: "binance-mock-calculation",
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
    strategyName: "test-strategy-calculation",
    interval: "1m",
    getSignal: async () => {
      if (signalCount >= 3) return null;
      signalCount++;

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

      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else {
          const tpPrice = basePrice + 1000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

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

  addFrameSchema({
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

  const stats = await Backtest.getData("BTCUSDT", {
    strategyName: "test-strategy-calculation",
    exchangeName: "binance-mock-calculation",
    frameName: "1d-backtest-calculation",
  });

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

  // stdDev (and the ratios below) are gated by MIN_SIGNALS_FOR_RATIOS — null when the
  // closed-signal count is under the threshold. This test closes only 3 signals, so
  // null is the expected value; assert number-or-null, matching sharpe/certainty.
  if (stats.stdDev !== null && typeof stats.stdDev !== "number") {
    fail(`stdDev should be a number or null, got ${typeof stats.stdDev}`);
    return;
  }

  if (typeof stats.stdDev === "number" && stats.stdDev < 0) {
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

  pass(`All metrics calculated correctly: winRate=${stats.winRate.toFixed(2)}%, stdDev=${stats.stdDev === null ? "N/A (N<MIN_SIGNALS_FOR_RATIOS)" : `${stats.stdDev.toFixed(2)}%`}`);

});

/**
 * toProfitLossDto: guard «партиалы превысили вложения» обязан использовать
 * относительный допуск. Кап партиалов пропускает дрейф до totalInvested×1e-9,
 * а чисто абсолютный порог 0.001$ отвергал легитимное 100%-закрытие позиции
 * с крупным кастомным cost (>$1M): дрейф в несколько центов — это шум double,
 * а не превышение вложений.
 */
test("toProfitLossDto tolerates float drift proportional to a large invested cost", async ({ pass, fail }) => {
  const { toProfitLossDto } = await import("../../build/index.mjs");

  const invested = 10_000_000; // $10M кастомный cost
  // Дрейф 5e-9 относительных = $0.05 — в пределах капа (1e-9 на шаг × реплей),
  // но больше старого абсолютного порога $0.001
  const drift = invested * 5e-9;

  const signal = {
    id: "pnl-tolerance-test",
    position: "long",
    priceOpen: 50000,
    priceTakeProfit: 60000,
    priceStopLoss: 40000,
    cost: invested,
    _entry: [{ price: 50000, cost: invested, timestamp: 1704067200000 }],
    _partial: [
      {
        type: "profit",
        percent: 100,
        currentPrice: 51000,
        costBasisAtClose: invested + drift,
        entryCountAtClose: 1,
        timestamp: 1704067260000,
      },
    ],
  };

  let result;
  try {
    result = toProfitLossDto(signal, 51000);
  } catch (e) {
    fail(`REGRESSION: float drift of $${drift.toFixed(3)} on $${invested} invested must not throw, got: ${e.message}`);
    return;
  }

  if (!Number.isFinite(result.pnlPercentage)) {
    fail(`pnlPercentage expected finite, got ${result.pnlPercentage}`);
    return;
  }

  // Реальное превышение (не шум) по-прежнему отклоняется
  let threw = false;
  try {
    toProfitLossDto({
      ...signal,
      _partial: [{ ...signal._partial[0], costBasisAtClose: invested * 1.01 }],
    }, 51000);
  } catch {
    threw = true;
  }
  if (!threw) {
    fail(`genuine over-close (+1%) must still throw`);
    return;
  }

  pass(`drift $${drift.toFixed(3)} tolerated on $10M invested, genuine over-close still rejected`);
});

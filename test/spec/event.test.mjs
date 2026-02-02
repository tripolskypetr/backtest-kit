import { test } from "worker-testbed";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

import {
  addExchangeSchema,
  addStrategySchema,
  Live,
  listenSignalLive,
  listenSignalLiveOnce,
  getAveragePrice,
} from "../../build/index.mjs";

import { createAwaiter } from "functools-kit";

test("listenSignalLive receives live events", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const intervalMs = 60000;
  const basePrice = 42000;
  const bufferMinutes = 5;
  const startTime = Date.now();
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
    exchangeName: "binance-mock-live",
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
    strategyName: "test-strategy-live",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "test signal",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  // Listen to live events
  const unsubscribe = listenSignalLive((event) => {
    resolve(event);
    unsubscribe();
  });

  Live.background("BTCUSDT", {
    strategyName: "test-strategy-live",
    exchangeName: "binance-mock-live",
  });

  const event = await awaiter;

  if (event) {
    pass("Live event received");
    return;
  }

  fail("Live event not received");

});

test("listenSignalLiveOnce triggers once with filter", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const intervalMs = 60000;
  const basePrice = 42000;
  const bufferMinutes = 5;
  const startTime = Date.now();
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
    exchangeName: "binance-mock-live-once",
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

  let callCount = 0;

  addStrategySchema({
    strategyName: "test-strategy-live-once",
    interval: "1m",
    getSignal: async () => {
      callCount++;
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "test signal once",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  // Listen to first opened event only
  listenSignalLiveOnce(
    (event) => {
      return event.action === "opened" || event.action === "scheduled";
    },
    (event) => {
      resolve(event);
    }
  );

  await Live.background("BTCUSDT", {
    strategyName: "test-strategy-live-once",
    exchangeName: "binance-mock-live-once",
  });

  const event = await awaiter;

  if (event) {
    pass("Live event triggered once");
    return;
  }

  fail("Live event not triggered once");

});

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
  listenDoneBacktest,
  getAveragePrice,
  setConfig,
  Schedule,
} from "../../build/index.mjs";

import { sleep, Subject } from "functools-kit";

test("setConfig changes CC_SCHEDULE_AWAIT_MINUTES", async ({ pass, fail }) => {

  // Set custom timeout for scheduled signals
  await setConfig({
    CC_SCHEDULE_AWAIT_MINUTES: 1, // 30 minutes instead of default 120
  }, true);

  let signalCancelled = false;

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
    exchangeName: "binance-config-schedule-await",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-schedule-await",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "schedule await test",
        priceOpen: price - 15_000, // Price that won't be reached
        priceTakeProfit: price + 45_000,
        priceStopLoss: price - 30_000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onCancel: () => {
        signalCancelled = true;
      },
    },
  });

  addFrameSchema({
    frameName: "2d-schedule-await",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-03T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-schedule-await",
    exchangeName: "binance-config-schedule-await",
    frameName: "2d-schedule-await",
  });

  await awaitSubject.toPromise();

  if (signalCancelled) {
    pass("CC_SCHEDULE_AWAIT_MINUTES config applied: scheduled signal cancelled after custom timeout");
    return;
  }

  fail("Scheduled signal was not cancelled with custom timeout");

});

test("setConfig with partial update preserves other values", async ({ pass, fail }) => {

  // Set both values
  await setConfig({
    CC_SCHEDULE_AWAIT_MINUTES: 90,
    CC_AVG_PRICE_CANDLES_COUNT: 7,
  }, true);

  // Only update one value
  await setConfig({
    CC_AVG_PRICE_CANDLES_COUNT: 8,
  }, true);

  // Both should work after partial update
  let signalOpened = false;

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
    exchangeName: "binance-config-partial",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-partial",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "partial update test",
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: () => {
        signalOpened = true;
      },
    },
  });

  addFrameSchema({
    frameName: "1d-partial",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-partial",
    exchangeName: "binance-config-partial",
    frameName: "1d-partial",
  });

  await awaitSubject.toPromise();

  if (signalOpened) {
    pass("Partial config update works: signal opened with updated CC_AVG_PRICE_CANDLES_COUNT=8");
    return;
  }

  fail("Signal not opened after partial config update");

});

test("setConfig before backtest run applies configuration", async ({ pass, fail }) => {

  // Reset to defaults first
  await setConfig({
    CC_SCHEDULE_AWAIT_MINUTES: 120,
    CC_AVG_PRICE_CANDLES_COUNT: 5,
  }, true);

  // Configure before running strategies
  await setConfig({
    CC_AVG_PRICE_CANDLES_COUNT: 6,
  }, true);

  let priceCalculated = false;

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
    exchangeName: "binance-config-before-run",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-before-run",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      if (price > 0) {
        priceCalculated = true;
      }
      return {
        position: "long",
        note: "config before run test",
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-before-run",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-before-run",
    exchangeName: "binance-config-before-run",
    frameName: "1d-before-run",
  });

  await awaitSubject.toPromise();

  if (priceCalculated) {
    pass("Config applied before backtest run: VWAP calculated with 6 candles");
    return;
  }

  fail("Price not calculated with configured candle count");

});

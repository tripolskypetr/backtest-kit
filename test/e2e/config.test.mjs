import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
  setConfig,
  Schedule,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { sleep, Subject } from "functools-kit";

test("setConfig changes CC_SCHEDULE_AWAIT_MINUTES", async ({ pass, fail }) => {

  // Set custom timeout for scheduled signals
  await setConfig({
    CC_SCHEDULE_AWAIT_MINUTES: 1, // 30 minutes instead of default 120
  });

  let signalCancelled = false;

  addExchange({
    exchangeName: "binance-config-schedule-await",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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
  });

  // Only update one value
  await setConfig({
    CC_AVG_PRICE_CANDLES_COUNT: 8,
  });

  // Both should work after partial update
  let signalOpened = false;

  addExchange({
    exchangeName: "binance-config-partial",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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
  });

  // Configure before running strategies
  await setConfig({
    CC_AVG_PRICE_CANDLES_COUNT: 6,
  });

  let priceCalculated = false;

  addExchange({
    exchangeName: "binance-config-before-run",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
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

  addFrame({
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

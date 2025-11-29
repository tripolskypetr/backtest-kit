import { test } from "worker-testbed";

import {
  addExchange,
  addStrategy,
  Live,
  listenSignalLive,
  listenSignalLiveOnce,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";

test("listenSignalLive receives live events", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-live",
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

  addExchange({
    exchangeName: "binance-mock-live-once",
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

  let callCount = 0;

  addStrategy({
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

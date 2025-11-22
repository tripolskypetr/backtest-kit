import { test } from "tape";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  getCandles,
  getAveragePrice,
  getDate,
  getMode,
  formatPrice,
  formatQuantity,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";

test("getCandles returns correct candle data", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock",
    getCandles: async (_symbol, interval, since, limit) => {
      // Generate mock candles dynamically based on interval, since and limit
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
    strategyName: "test-strategy",
    interval: "1m",
    getSignal: async () => {
      resolve(getCandles("BTCUSDT", "1h", 5));
      return null; // Don't generate signals
    },
  });

  addFrame({
    frameName: "1d-backtest",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy",
    exchangeName: "binance-mock",
    frameName: "1d-backtest",
  });

  const lastCandles = await awaiter;

  if (lastCandles !== null) {
    pass("Candles are fetched");
    return;
  }

  fail("Candles not fetched");

});

test("getAveragePrice returns VWAP from last 5 1m candles", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-vwap",
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
    strategyName: "test-strategy-vwap",
    interval: "1m",
    getSignal: async () => {
      resolve(getAveragePrice("BTCUSDT"));
      return null;
    },
  });

  addFrame({
    frameName: "1d-backtest-vwap",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-vwap",
    exchangeName: "binance-mock-vwap",
    frameName: "1d-backtest-vwap",
  });

  const vwap = await awaiter;

  if (typeof vwap === "number" && vwap > 0) {
    pass("VWAP is calculated");
    return;
  }

  fail("VWAP not calculated");

});

test("getDate returns frame timestamp in backtest mode", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-date",
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
    strategyName: "test-strategy-date",
    interval: "1m",
    getSignal: async () => {
      resolve(getDate());
      return null;
    },
  });

  addFrame({
    frameName: "1d-backtest-date",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-date",
    exchangeName: "binance-mock-date",
    frameName: "1d-backtest-date",
  });

  const date = await awaiter;

  if (date instanceof Date && date.getTime() === new Date("2024-01-01T00:00:00Z").getTime()) {
    pass("Date is frame timestamp");
    return;
  }

  fail("Date is not frame timestamp");

});

test("getMode returns 'backtest' in backtest mode", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-mode",
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
    strategyName: "test-strategy-mode",
    interval: "1m",
    getSignal: async () => {
      resolve(getMode());
      return null;
    },
  });

  addFrame({
    frameName: "1d-backtest-mode",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-mode",
    exchangeName: "binance-mock-mode",
    frameName: "1d-backtest-mode",
  });

  const mode = await awaiter;

  if (mode === "backtest") {
    pass("Mode is backtest");
    return;
  }

  fail("Mode is not backtest");

});

test("formatPrice formats price to exchange precision", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-format",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(2);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(5);
    },
  });

  addStrategy({
    strategyName: "test-strategy-format",
    interval: "1m",
    getSignal: async () => {
      resolve(formatPrice("BTCUSDT", 42685.3456789));
      return null;
    },
  });

  addFrame({
    frameName: "1d-backtest-format",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-format",
    exchangeName: "binance-mock-format",
    frameName: "1d-backtest-format",
  });

  const price = await awaiter;

  if (price === "42685.35") {
    pass("Price is formatted");
    return;
  }

  fail("Price is not formatted");

});

test("formatQuantity formats quantity to exchange precision", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-quantity",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(2);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(5);
    },
  });

  addStrategy({
    strategyName: "test-strategy-quantity",
    interval: "1m",
    getSignal: async () => {
      resolve(formatQuantity("BTCUSDT", 0.123456789));
      return null;
    },
  });

  addFrame({
    frameName: "1d-backtest-quantity",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-quantity",
    exchangeName: "binance-mock-quantity",
    frameName: "1d-backtest-quantity",
  });

  const quantity = await awaiter;

  if (quantity === "0.12346") {
    pass("Quantity is formatted");
    return;
  }

  fail("Quantity is not formatted");

});

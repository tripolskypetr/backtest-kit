import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Live,
  listenDoneBacktest,
  listenDoneLive,
  commitCancel,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";
import fs from "fs"

test("Backtest.getReport returns markdown string", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
    exchangeName: "binance-mock-bt-report",
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
    strategyName: "test-strategy-bt-report",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "backtest report test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-bt-report",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-strategy-bt-report") {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bt-report",
    exchangeName: "binance-mock-bt-report",
    frameName: "1d-backtest-bt-report",
  });

  await awaiter;

  const report = await Backtest.getReport("BTCUSDT", {
    strategyName: "test-strategy-bt-report",
    exchangeName: "binance-mock-bt-report",
    frameName: "1d-backtest-bt-report",
  });

  if (typeof report === "string" && report.includes("# Backtest Report:")) {
    pass("Backtest.getReport returns markdown string");
    return;
  }

  fail("Backtest.getReport did not return valid markdown");

});

test("Backtest report includes win rate statistics", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
    exchangeName: "binance-mock-bt-stats",
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
    strategyName: "test-strategy-bt-stats",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "backtest stats test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-bt-stats",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-strategy-bt-stats") {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bt-stats",
    exchangeName: "binance-mock-bt-stats",
    frameName: "1d-backtest-bt-stats",
  });

  await awaiter;

  const report = await Backtest.getReport("BTCUSDT", {
    strategyName: "test-strategy-bt-stats",
    exchangeName: "binance-mock-bt-stats",
    frameName: "1d-backtest-bt-stats",
  });

  const hasWinRate = report.includes("Win rate:");
  const hasAvgPnl = report.includes("Average PNL:");
  const hasTotalPnl = report.includes("Total PNL:");
  const hasClosedSignals = report.includes("Closed signals:");

  if (hasWinRate && hasAvgPnl && hasTotalPnl && hasClosedSignals) {
    pass("Backtest report includes win rate statistics");
    return;
  }

  fail("Backtest report missing statistics");

});

test("Live.getReport returns markdown string", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
    exchangeName: "binance-mock-live-report",
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
    strategyName: "test-strategy-live-report",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "live report test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  const cancel = await Live.background("BTCUSDT", {
    strategyName: "test-strategy-live-report",
    exchangeName: "binance-mock-live-report",
  });

  // Wait a bit for signal to be generated
  setTimeout(async () => {
    await cancel();
    resolve(true);
  }, 500);

  await awaiter;

  const report = await Live.getReport("BTCUSDT", {
    strategyName: "test-strategy-live-report",
    exchangeName: "binance-mock-live-report",
  });

  if (typeof report === "string" && report.includes("# Live Trading Report:")) {
    pass("Live.getReport returns markdown string");
    return;
  }

  fail("Live.getReport did not return valid markdown");

});

test("Backtest report includes signal details table", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
    exchangeName: "binance-mock-bt-table",
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
    strategyName: "test-strategy-bt-table",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "table test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-bt-table",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-strategy-bt-table") {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bt-table",
    exchangeName: "binance-mock-bt-table",
    frameName: "1d-backtest-bt-table",
  });

  await awaiter;

  const report = await Backtest.getReport("BTCUSDT", {
    strategyName: "test-strategy-bt-table",
    exchangeName: "binance-mock-bt-table",
    frameName: "1d-backtest-bt-table",
  });

  // Check for markdown table format
  const hasTableSeparator = report.includes(" | ");

  if (hasTableSeparator) {
    pass("Backtest report includes table");
    return;
  }

  fail("Backtest report missing table");

});

import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenDoneBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";

test("Backtest.getReport accepts custom columns", async ({ pass, fail }) => {
  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-custom-cols",
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
    strategyName: "test-strategy-custom-cols",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "custom columns test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-custom-cols",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-strategy-custom-cols") {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-custom-cols",
    exchangeName: "binance-mock-custom-cols",
    frameName: "1d-backtest-custom-cols",
  });

  await awaiter;

  // Define custom columns with only 3 columns
  const customColumns = [
    {
      key: "signalId",
      label: "ID",
      format: (data) => data.signal.id,
      isVisible: () => true,
    },
    {
      key: "position",
      label: "Position",
      format: (data) => data.signal.position.toUpperCase(),
      isVisible: () => true,
    },
    {
      key: "pnl",
      label: "PNL",
      format: (data) => `${data.pnl.pnlPercentage.toFixed(2)}%`,
      isVisible: () => true,
    },
  ];

  const customReport = await Backtest.getReport(
    "BTCUSDT",
    {
      strategyName: "test-strategy-custom-cols",
      exchangeName: "binance-mock-custom-cols",
      frameName: "1d-backtest-custom-cols",
    },
    customColumns
  );

  // Verify custom columns are used
  const hasCustomHeader = customReport.includes("| ID |");
  const hasPosition = customReport.includes("| Position |");
  const hasPnl = customReport.includes("| PNL |");

  // Verify default columns are NOT present
  const hasDefaultSymbol = customReport.includes("| Symbol |");
  const hasDefaultTakeProfit = customReport.includes("| Take Profit |");

  if (hasCustomHeader && hasPosition && hasPnl && !hasDefaultSymbol && !hasDefaultTakeProfit) {
    pass("Backtest.getReport accepts custom columns");
    return;
  }

  fail("Custom columns were not applied correctly");
});

test("Custom columns preserve table structure", async ({ pass, fail }) => {
  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-structure",
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
    strategyName: "test-strategy-structure",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "structure test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-structure",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-strategy-structure") {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-structure",
    exchangeName: "binance-mock-structure",
    frameName: "1d-backtest-structure",
  });

  await awaiter;

  // Custom columns with different number of fields
  const customColumns = [
    {
      key: "id",
      label: "ID",
      format: (data) => data.signal.id,
      isVisible: () => true,
    },
    {
      key: "result",
      label: "Result",
      format: (data) => data.pnl.pnlPercentage > 0 ? "WIN" : "LOSS",
      isVisible: () => true,
    },
  ];

  const report = await Backtest.getReport(
    "BTCUSDT",
    {
      strategyName: "test-strategy-structure",
      exchangeName: "binance-mock-structure",
      frameName: "1d-backtest-structure",
    },
    customColumns
  );

  // Verify markdown table structure is preserved
  const lines = report.split("\n");
  const headerLine = lines.find(line => line.includes("| ID |"));
  const separatorLine = lines.find(line => line.includes("| --- |"));

  if (headerLine && separatorLine) {
    // Count columns in header and separator
    const headerColumns = headerLine.split("|").filter(s => s.trim()).length;
    const separatorColumns = separatorLine.split("|").filter(s => s.trim()).length;

    if (headerColumns === 2 && separatorColumns === 2) {
      pass("Custom columns preserve table structure");
      return;
    }
  }

  fail("Table structure not preserved with custom columns");
});

test("Default columns are used when no custom columns provided", async ({ pass, fail }) => {
  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-default-cols",
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
    strategyName: "test-strategy-default-cols",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "default columns test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-default-cols",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-strategy-default-cols") {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-default-cols",
    exchangeName: "binance-mock-default-cols",
    frameName: "1d-backtest-default-cols",
  });

  await awaiter;

  // Call getReport WITHOUT custom columns
  const defaultReport = await Backtest.getReport("BTCUSDT", {
    strategyName: "test-strategy-default-cols",
    exchangeName: "binance-mock-default-cols",
    frameName: "1d-backtest-default-cols",
  });

  // Verify default columns are present
  const hasSignalId = defaultReport.includes("| Signal ID |");
  const hasSymbol = defaultReport.includes("| Symbol |");
  const hasPosition = defaultReport.includes("| Position |");
  const hasTakeProfit = defaultReport.includes("| Take Profit |");
  const hasStopLoss = defaultReport.includes("| Stop Loss |");

  if (hasSignalId && hasSymbol && hasPosition && hasTakeProfit && hasStopLoss) {
    pass("Default columns are used when no custom columns provided");
    return;
  }

  fail("Default columns were not applied");
});

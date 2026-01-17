import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Heat,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";

test("Heat.getData returns heatmap statistics for strategy", async ({ pass, fail }) => {

  addExchangeSchema({
    exchangeName: "binance-mock-heat-1",
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
    strategyName: "test-strategy-heat-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "heat test signal",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-heat-1",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Run backtest for BTCUSDT
  for await (const _ of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-heat-1",
    exchangeName: "binance-mock-heat-1",
    frameName: "1d-backtest-heat-1",
  })) {
    // Just consume
  }

  // Run backtest for ETHUSDT
  for await (const _ of Backtest.run("ETHUSDT", {
    strategyName: "test-strategy-heat-1",
    exchangeName: "binance-mock-heat-1",
    frameName: "1d-backtest-heat-1",
  })) {
    // Just consume
  }

  const stats = await Heat.getData({
    strategyName: "test-strategy-heat-1",
    exchangeName: "binance-mock-heat-1",
    frameName: "1d-backtest-heat-1",
  }, true);

  if (
    stats &&
    stats.totalSymbols === 2 &&
    stats.symbols.length === 2 &&
    stats.portfolioTotalTrades === 2
  ) {
    pass("Heat.getData returned valid heatmap statistics");
    return;
  }

  fail("Heat.getData did not return valid heatmap statistics");

});

test("Heat heatmap includes per-symbol statistics", async ({ pass, fail }) => {

  addExchangeSchema({
    exchangeName: "binance-mock-heat-2",
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
    strategyName: "test-strategy-heat-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "heat test signal",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-heat-2",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Run backtest for multiple symbols
  for await (const _ of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-heat-2",
    exchangeName: "binance-mock-heat-2",
    frameName: "1d-backtest-heat-2",
  })) {
    // Just consume
  }

  for await (const _ of Backtest.run("ETHUSDT", {
    strategyName: "test-strategy-heat-2",
    exchangeName: "binance-mock-heat-2",
    frameName: "1d-backtest-heat-2",
  })) {
    // Just consume
  }

  const stats = await Heat.getData({
    strategyName: "test-strategy-heat-2",
    exchangeName: "binance-mock-heat-2",
    frameName: "1d-backtest-heat-2",
  }, true);

  const btcRow = stats.symbols.find(s => s.symbol === "BTCUSDT");
  const ethRow = stats.symbols.find(s => s.symbol === "ETHUSDT");

  if (
    btcRow &&
    ethRow &&
    btcRow.totalTrades === 1 &&
    ethRow.totalTrades === 1 &&
    btcRow.totalPnl !== null &&
    ethRow.totalPnl !== null
  ) {
    pass("Heat heatmap includes per-symbol statistics");
    return;
  }

  fail("Heat heatmap does not include valid per-symbol statistics");

});

test("Heat.getReport generates markdown report", async ({ pass, fail }) => {

  addExchangeSchema({
    exchangeName: "binance-mock-heat-3",
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
    strategyName: "test-strategy-heat-3",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "heat test signal",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-heat-3",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Run backtest
  for await (const _ of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-heat-3",
    exchangeName: "binance-mock-heat-3",
    frameName: "1d-backtest-heat-3",
  })) {
    // Just consume
  }

  const markdown = await Heat.getReport({
    strategyName: "test-strategy-heat-3",
    exchangeName: "binance-mock-heat-3",
    frameName: "1d-backtest-heat-3",
  }, true);

  if (
    markdown &&
    markdown.includes("# Portfolio Heatmap: test-strategy-heat-3") &&
    markdown.includes("| Symbol |") &&
    markdown.includes("| Total PNL |") &&
    markdown.includes("| Sharpe |") &&
    markdown.includes("| PF |") &&
    markdown.includes("| Expect |") &&
    markdown.includes("| WR |") &&
    markdown.includes("| Avg Win |") &&
    markdown.includes("| Avg Loss |") &&
    markdown.includes("| Max DD |") &&
    markdown.includes("| W Streak |") &&
    markdown.includes("| L Streak |") &&
    markdown.includes("| Trades |") &&
    markdown.includes("BTCUSDT")
  ) {
    pass("Heat.getReport generated markdown report");
    return;
  }

  fail("Heat.getReport did not generate valid markdown report");

});

test("Heat calculates portfolio-wide metrics", async ({ pass, fail }) => {

  addExchangeSchema({
    exchangeName: "binance-mock-heat-4",
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
    strategyName: "test-strategy-heat-4",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "heat test signal",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-heat-4",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Run backtest for multiple symbols
  for await (const _ of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-heat-4",
    exchangeName: "binance-mock-heat-4",
    frameName: "1d-backtest-heat-4",
  })) {
    // Just consume
  }

  for await (const _ of Backtest.run("ETHUSDT", {
    strategyName: "test-strategy-heat-4",
    exchangeName: "binance-mock-heat-4",
    frameName: "1d-backtest-heat-4",
  })) {
    // Just consume
  }

  for await (const _ of Backtest.run("SOLUSDT", {
    strategyName: "test-strategy-heat-4",
    exchangeName: "binance-mock-heat-4",
    frameName: "1d-backtest-heat-4",
  })) {
    // Just consume
  }

  const stats = await Heat.getData({
    strategyName: "test-strategy-heat-4",
    exchangeName: "binance-mock-heat-4",
    frameName: "1d-backtest-heat-4",
  }, true);

  // Note: portfolioSharpeRatio will be null because each symbol only has 1 trade,
  // which is insufficient to calculate stdDev (requires > 1 trade per symbol)
  if (
    stats.totalSymbols === 3 &&
    stats.portfolioTotalTrades === 3 &&
    stats.portfolioTotalPnl !== null
  ) {
    pass("Heat calculates portfolio-wide metrics correctly");
    return;
  }

  fail("Heat did not calculate portfolio-wide metrics correctly");

});

test("Heat calculates extended metrics correctly", async ({ pass, fail }) => {

  addExchangeSchema({
    exchangeName: "binance-mock-heat-extended",
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
    strategyName: "test-strategy-heat-extended",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "heat test signal",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-heat-extended",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Run backtest to generate data
  for await (const _ of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-heat-extended",
    exchangeName: "binance-mock-heat-extended",
    frameName: "1d-backtest-heat-extended",
  })) {
    // Just consume
  }

  const stats = await Heat.getData({
    strategyName: "test-strategy-heat-extended",
    exchangeName: "binance-mock-heat-extended",
    frameName: "1d-backtest-heat-extended",
  }, true);
  const btcRow = stats.symbols.find(s => s.symbol === "BTCUSDT");

  if (
    btcRow &&
    btcRow.profitFactor !== undefined &&
    btcRow.avgWin !== undefined &&
    btcRow.avgLoss !== undefined &&
    btcRow.maxWinStreak !== undefined &&
    btcRow.maxLossStreak !== undefined &&
    btcRow.expectancy !== undefined
  ) {
    pass("Heat calculates extended metrics correctly");
    return;
  }

  fail("Heat did not calculate extended metrics correctly");

});

test("Heat sorts symbols by Sharpe Ratio descending", async ({ pass, fail }) => {

  addExchangeSchema({
    exchangeName: "binance-mock-heat-6",
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
    strategyName: "test-strategy-heat-6",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "heat test signal",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-heat-6",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Run backtest for multiple symbols
  for await (const _ of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-heat-6",
    exchangeName: "binance-mock-heat-6",
    frameName: "1d-backtest-heat-6",
  })) {
    // Just consume
  }

  for await (const _ of Backtest.run("ETHUSDT", {
    strategyName: "test-strategy-heat-6",
    exchangeName: "binance-mock-heat-6",
    frameName: "1d-backtest-heat-6",
  })) {
    // Just consume
  }

  const stats = await Heat.getData({
    strategyName: "test-strategy-heat-6",
    exchangeName: "binance-mock-heat-6",
    frameName: "1d-backtest-heat-6",
  }, true);

  if (stats.symbols.length < 2) {
    fail("Need at least 2 symbols for sorting test");
    return;
  }

  // Verify symbols are sorted by Sharpe Ratio descending (nulls last)
  let isSorted = true;
  for (let i = 0; i < stats.symbols.length - 1; i++) {
    const current = stats.symbols[i].sharpeRatio;
    const next = stats.symbols[i + 1].sharpeRatio;

    // null should always come after non-null
    if (current === null) {
      if (next !== null) {
        isSorted = false;
        break;
      }
    } else if (next !== null) {
      // Both non-null: current should be >= next
      if (current < next) {
        isSorted = false;
        break;
      }
    }
  }

  if (isSorted) {
    pass("Heat sorts symbols by Sharpe Ratio descending");
    return;
  }

  fail("Heat does not sort symbols correctly");

});

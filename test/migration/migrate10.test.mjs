import { test } from "worker-testbed";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addWalkerSchema,
  Walker,
  listenWalker,
  listenWalkerOnce,
  listenWalkerComplete,
  emitters,
  getAveragePrice,
} from "../../build/index.mjs";

import { createAwaiter } from "functools-kit";

test("Walker tracks best strategy correctly", async ({ pass, fail }) => {

  const [awaiter, { resolve, reject }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;
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
    exchangeName: "binance-mock-walker-best",
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
    strategyName: "test-strategy-walker-best-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker best test 1",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-walker-best-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker best test 2",
        priceOpen: price,
        priceTakeProfit: price + 2_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-walker-best",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalkerSchema({
    walkerName: "test-walker-best",
    exchangeName: "binance-mock-walker-best",
    frameName: "1d-backtest-walker-best",
    strategies: ["test-strategy-walker-best-1", "test-strategy-walker-best-2"],
    metric: "sharpeRatio",
  });

  const progressEvents = [];

  const unsubscribe = listenWalker((event) => {
    progressEvents.push({
      strategyName: event.strategyName,
      metricValue: event.metricValue,
      bestStrategy: event.bestStrategy,
      bestMetric: event.bestMetric,
    });

    if (event.strategiesTested === event.totalStrategies) {
      try {
        if (progressEvents && progressEvents.length === 2) {
          // Check that bestStrategy and bestMetric are tracked across events
          const firstEvent = progressEvents[0];
          const secondEvent = progressEvents[1];

          if (
            firstEvent.bestStrategy !== null &&
            secondEvent.bestStrategy !== null &&
            (secondEvent.bestMetric >= firstEvent.bestMetric || secondEvent.bestMetric === null)
          ) {
            pass("Walker tracks best strategy correctly across progress events");
            resolve();
          } else {
            fail("Walker did not track best strategy correctly");
            reject();
          }
        } else {
          fail("Walker did not track best strategy correctly");
          reject();
        }
      } finally {
        unsubscribe();
      }
    }
  });

  // Run walker and consume results
  for await (const _ of Walker.run("BTCUSDT", {
    walkerName: "test-walker-best",
  })) {
    // Just consume
  }

  await awaiter;

});

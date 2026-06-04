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
      strategiesTested: event.strategiesTested,
      totalStrategies: event.totalStrategies,
    });

    if (event.strategiesTested === event.totalStrategies) {
      try {
        if (progressEvents.length !== 2) {
          fail(`expected 2 progress events, got ${progressEvents.length}`);
          reject();
          return;
        }
        const [firstEvent, secondEvent] = progressEvents;

        if (firstEvent.strategiesTested !== 1 || secondEvent.strategiesTested !== 2) {
          fail(`strategiesTested must be 1 then 2, got ${firstEvent.strategiesTested}/${secondEvent.strategiesTested}`);
          reject();
          return;
        }
        if (firstEvent.totalStrategies !== 2 || secondEvent.totalStrategies !== 2) {
          fail(`totalStrategies must be 2 on both events, got ${firstEvent.totalStrategies}/${secondEvent.totalStrategies}`);
          reject();
          return;
        }

        // Flat-candle frame: neither strategy produces enough closed signals
        // for sharpeRatio (gated by N >= MIN_SIGNALS_FOR_RATIOS = 10). Both
        // metricValues come back null and bestStrategy stays null — the
        // correct outcome of the post-audit Sharpe gate.
        if (firstEvent.metricValue === null && secondEvent.metricValue === null) {
          if (firstEvent.bestStrategy !== null || secondEvent.bestStrategy !== null) {
            fail(`bestStrategy must stay null when both metrics are null, got ${firstEvent.bestStrategy}/${secondEvent.bestStrategy}`);
            reject();
            return;
          }
          if (firstEvent.bestMetric !== null || secondEvent.bestMetric !== null) {
            fail(`bestMetric must stay null when both metrics are null, got ${firstEvent.bestMetric}/${secondEvent.bestMetric}`);
            reject();
            return;
          }
          pass("Walker correctly leaves best=null when no strategy clears the metric gate");
          resolve();
          return;
        }

        // When a metric does come through, the running max must be monotonic.
        if (
          secondEvent.bestMetric !== null &&
          firstEvent.bestMetric !== null &&
          secondEvent.bestMetric < firstEvent.bestMetric
        ) {
          fail(`bestMetric regressed: ${firstEvent.bestMetric} -> ${secondEvent.bestMetric}`);
          reject();
          return;
        }
        pass("Walker tracks best strategy correctly across progress events");
        resolve();
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

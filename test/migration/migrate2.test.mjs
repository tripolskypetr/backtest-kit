import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenError,
  getAveragePrice,
} from "../../build/index.mjs";

import { sleep } from "functools-kit";

// Helper function to generate mock candles
function getMockCandles(interval, since, limit) {
  const candles = [];
  const basePrice = 95000;
  const intervalMs = 60000; // 1 minute
  const startTime = since.getTime();

  // For minuteEstimatedTime=1, need at least 6 candles (4 buffer + 1 signal lifetime + 1)
  // Return more candles than requested to ensure sufficient data
  const candleCount = Math.max(limit, 10);

  for (let i = 0; i < candleCount; i++) {
    candles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  return candles;
}

// Test #31
test("early termination with break stops backtest", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "binance-mock-early",
    getCandles: async (_symbol, interval, since, limit) => {
      return getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-early",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "early termination test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 1,
      };
    },
  });

  addFrameSchema({
    frameName: "7d-backtest-early",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-07T00:00:00Z"), // 7 days
  });

  // Listen to errors
  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
  });

  let signalCount = 0;

  try {
    for await (const result of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-early",
      exchangeName: "binance-mock-early",
      frameName: "7d-backtest-early",
    })) {
      signalCount++;

      if (signalCount >= 2) {
        // Stop after 2 signals
        break;
      }
    }
  } catch (error) {
    unsubscribeError();
    fail(`Error during backtest: ${error.message || error}`);
    return;
  }

  await sleep(500);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (signalCount === 2) {
    pass("Early termination stopped backtest after 2 signals");
    return;
  }

  fail(`Early termination failed: got ${signalCount} signals`);

});


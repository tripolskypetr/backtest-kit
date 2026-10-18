import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  setConfig,
} from "../../build/index.mjs";

const MINUTE_MS = 60_000;
const BASE_PRICE = 95_000;

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * MINUTE_MS;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * Exchange with 1m candles polyfilled from a flat daily bar, plus optional
 * per-minute overrides (minute index counted from startTime).
 */
const addPolyfilledExchange = (exchangeName, startTime, candleByMinute = {}) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MINUTE_MS;
        const minute = Math.floor((timestamp - startTime) / MINUTE_MS);
        const custom = candleByMinute[minute];
        result.push(custom
          ? { timestamp, ...custom, volume: 100 }
          : { timestamp, open: BASE_PRICE, high: BASE_PRICE, low: BASE_PRICE, close: BASE_PRICE, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });
};

test("CC_BACKTEST_STEP_MINUTES strides the pending candle loop (one iteration per day)", async ({ pass, fail }) => {
  const STEP_MINUTES = 24 * 60;
  const LIFETIME_DAYS = 3;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();

  await setConfig({ CC_BACKTEST_STEP_MINUTES: STEP_MINUTES }, true);

  try {
    addPolyfilledExchange("binance-step-pending", startTime);

    let issued = false;
    let activePings = 0;
    addStrategySchema({
      strategyName: "test-strategy-step-pending",
      interval: "1m",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return {
          position: "long",
          priceTakeProfit: BASE_PRICE * 2,
          priceStopLoss: BASE_PRICE / 2,
          minuteEstimatedTime: LIFETIME_DAYS * STEP_MINUTES,
        };
      },
      callbacks: {
        onActivePing: () => {
          activePings += 1;
        },
      },
    });

    addFrameSchema({
      frameName: "step-pending-frame",
      interval: "1d",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 10 * STEP_MINUTES * MINUTE_MS),
    });

    const closed = [];
    for await (const result of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-step-pending",
      exchangeName: "binance-step-pending",
      frameName: "step-pending-frame",
    })) {
      if (result.action === "closed") closed.push(result);
    }

    if (closed.length !== 1 || closed[0].closeReason !== "time_expired") {
      fail(`Expected a single time_expired close, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
      return;
    }

    // Lifetime = 3 days of 1m candles (4320). A per-minute loop pings 4320
    // times; a daily stride visits day 1, 2, 3 and expires on the 4th
    // iteration before pinging — 3 pings.
    if (activePings !== LIFETIME_DAYS) {
      fail(`Expected ${LIFETIME_DAYS} active pings (one per daily stride), got ${activePings}`);
      return;
    }

    pass(`Pending loop strided daily: ${activePings} pings over ${LIFETIME_DAYS * STEP_MINUTES} 1m candles`);
  } finally {
    await setConfig({ CC_BACKTEST_STEP_MINUTES: 0 }, true);
  }
});

test("CC_BACKTEST_STEP_MINUTES: a stop-loss touched on a SKIPPED candle still fires", async ({ pass, fail }) => {
  const STEP_MINUTES = 24 * 60;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const priceStopLoss = BASE_PRICE - 500;

  await setConfig({ CC_BACKTEST_STEP_MINUTES: STEP_MINUTES }, true);

  try {
    // Minute 700 of day 1 wicks through the SL; it never lands on a daily
    // stride index, so a naive stride would miss it entirely.
    addPolyfilledExchange("binance-step-touch", startTime, {
      700: { open: BASE_PRICE, high: BASE_PRICE, low: priceStopLoss - 100, close: BASE_PRICE },
    });

    let issued = false;
    addStrategySchema({
      strategyName: "test-strategy-step-touch",
      interval: "1m",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return {
          position: "long",
          priceTakeProfit: BASE_PRICE * 2,
          priceStopLoss,
          minuteEstimatedTime: 5 * STEP_MINUTES,
        };
      },
    });

    addFrameSchema({
      frameName: "step-touch-frame",
      interval: "1d",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 10 * STEP_MINUTES * MINUTE_MS),
    });

    const closed = [];
    for await (const result of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-step-touch",
      exchangeName: "binance-step-touch",
      frameName: "step-touch-frame",
    })) {
      if (result.action === "closed") closed.push(result);
    }

    if (closed.length !== 1 || closed[0].closeReason !== "stop_loss") {
      fail(`Expected a single stop_loss close, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
      return;
    }

    // The touch is detected on the first stride iteration AFTER the wick:
    // the day-2 candle (open + 1440 minutes)
    const expectedCloseTimestamp = startTime + STEP_MINUTES * MINUTE_MS;
    if (closed[0].closeTimestamp !== expectedCloseTimestamp) {
      fail(`Expected close at ${new Date(expectedCloseTimestamp).toISOString()}, got ${new Date(closed[0].closeTimestamp).toISOString()}`);
      return;
    }

    if (closed[0].currentPrice !== priceStopLoss) {
      fail(`Expected close at the exact SL level ${priceStopLoss}, got ${closed[0].currentPrice}`);
      return;
    }

    pass("Span-aggregated low caught the SL wick on a skipped candle; closed at the SL level on the next stride");
  } finally {
    await setConfig({ CC_BACKTEST_STEP_MINUTES: 0 }, true);
  }
});

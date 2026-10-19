import { test } from "worker-testbed";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenError,
} from "../../build/index.mjs";

import { createAwaiter } from "functools-kit";

test("valid long signal passes validation", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 50000;
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
    exchangeName: "binance-mock-valid-long",
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
    strategyName: "test-strategy-valid-long",
    interval: "1m",
    getSignal: async () => {
      resolve(true);
      return {
        position: "long",
        note: "valid long signal",
        priceOpen: 50000,
        priceTakeProfit: 51000, // TP > Open ✅
        priceStopLoss: 49000,   // SL < Open ✅
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-valid-long",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-valid-long",
    exchangeName: "binance-mock-valid-long",
    frameName: "1d-backtest-valid-long",
  });

  const result = await awaiter;

  if (result === true) {
    pass("Valid long signal passes validation");
    return;
  }

  fail("Valid long signal did not pass validation");

});

test("valid short signal passes validation", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 50000;
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
    exchangeName: "binance-mock-valid-short",
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
    strategyName: "test-strategy-valid-short",
    interval: "1m",
    getSignal: async () => {
      resolve(true);
      return {
        position: "short",
        note: "valid short signal",
        priceOpen: 50000,
        priceTakeProfit: 49000, // TP < Open ✅
        priceStopLoss: 51000,   // SL > Open ✅
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-valid-short",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-valid-short",
    exchangeName: "binance-mock-valid-short",
    frameName: "1d-backtest-valid-short",
  });

  const result = await awaiter;

  if (result === true) {
    pass("Valid short signal passes validation");
    return;
  }

  fail("Valid short signal did not pass validation");

});

test("invalid long signal - TP lower than Open", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 50000;
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
    exchangeName: "binance-mock-invalid-long-tp",
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
    strategyName: "test-strategy-invalid-long-tp",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "invalid long signal",
        priceOpen: 50000,
        priceTakeProfit: 49000, // TP < Open ❌
        priceStopLoss: 49500,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-invalid-long-tp",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  // Listen for validation error
  const unsubscribe = listenError((error) => {
    if (error.message.includes("priceTakeProfit") && error.message.includes("must be > priceOpen")) {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-invalid-long-tp",
    exchangeName: "binance-mock-invalid-long-tp",
    frameName: "1d-backtest-invalid-long-tp",
  });

  const errorReceived = await awaiter;

  if (errorReceived === true) {
    pass("Invalid long signal TP validation error caught");
    return;
  }

  fail("Invalid long signal TP validation error not caught");

});

test("invalid long signal - SL higher than Open", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 50000;
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
    exchangeName: "binance-mock-invalid-long-sl",
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
    strategyName: "test-strategy-invalid-long-sl",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "invalid long signal",
        priceOpen: 50000,
        priceTakeProfit: 51000,
        priceStopLoss: 51000, // SL > Open ❌
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-invalid-long-sl",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenError((error) => {
    if (error.message.includes("priceStopLoss") && error.message.includes("must be < priceOpen")) {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-invalid-long-sl",
    exchangeName: "binance-mock-invalid-long-sl",
    frameName: "1d-backtest-invalid-long-sl",
  });

  const errorReceived = await awaiter;

  if (errorReceived === true) {
    pass("Invalid long signal SL validation error caught");
    return;
  }

  fail("Invalid long signal SL validation error not caught");

});

test("invalid short signal - TP higher than Open", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 50000;
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
    exchangeName: "binance-mock-invalid-short-tp",
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
    strategyName: "test-strategy-invalid-short-tp",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "short",
        note: "invalid short signal",
        priceOpen: 50000,
        priceTakeProfit: 51000, // TP > Open ❌
        priceStopLoss: 51500,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-invalid-short-tp",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenError((error) => {
    if (error.message.includes("priceTakeProfit") && error.message.includes("must be < priceOpen")) {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-invalid-short-tp",
    exchangeName: "binance-mock-invalid-short-tp",
    frameName: "1d-backtest-invalid-short-tp",
  });

  const errorReceived = await awaiter;

  if (errorReceived === true) {
    pass("Invalid short signal TP validation error caught");
    return;
  }

  fail("Invalid short signal TP validation error not caught");

});

test("invalid short signal - SL lower than Open", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 50000;
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
    exchangeName: "binance-mock-invalid-short-sl",
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
    strategyName: "test-strategy-invalid-short-sl",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "short",
        note: "invalid short signal",
        priceOpen: 50000,
        priceTakeProfit: 49000,
        priceStopLoss: 49000, // SL < Open ❌
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-invalid-short-sl",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenError((error) => {
    if (error.message.includes("priceStopLoss") && error.message.includes("must be > priceOpen")) {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-invalid-short-sl",
    exchangeName: "binance-mock-invalid-short-sl",
    frameName: "1d-backtest-invalid-short-sl",
  });

  const errorReceived = await awaiter;

  if (errorReceived === true) {
    pass("Invalid short signal SL validation error caught");
    return;
  }

  fail("Invalid short signal SL validation error not caught");

});

test("negative priceOpen fails validation", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 50000;
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
    exchangeName: "binance-mock-negative-price",
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
    strategyName: "test-strategy-negative-price",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "negative price",
        priceOpen: -50000, // ❌ negative
        priceTakeProfit: 51000,
        priceStopLoss: 49000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-negative-price",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenError((error) => {
    if (error.message.includes("priceOpen must be positive")) {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-negative-price",
    exchangeName: "binance-mock-negative-price",
    frameName: "1d-backtest-negative-price",
  });

  const errorReceived = await awaiter;

  if (errorReceived === true) {
    pass("Negative price validation error caught");
    return;
  }

  fail("Negative price validation error not caught");

});

test("negative minuteEstimatedTime fails validation", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 50000;
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
    exchangeName: "binance-mock-negative-time",
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
    strategyName: "test-strategy-negative-time",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "negative time",
        priceOpen: 50000,
        priceTakeProfit: 51000,
        priceStopLoss: 49000,
        minuteEstimatedTime: -60, // ❌ negative
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-negative-time",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const unsubscribe = listenError((error) => {
    if (error.message.includes("minuteEstimatedTime must be positive")) {
      resolve(true);
      unsubscribe();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-negative-time",
    exchangeName: "binance-mock-negative-time",
    frameName: "1d-backtest-negative-time",
  });

  const errorReceived = await awaiter;

  if (errorReceived === true) {
    pass("Negative time validation error caught");
    return;
  }

  fail("Negative time validation error not caught");

});

/**
 * validateCandles: свеча с high < low определённо повреждена — молча пройдя в
 * кэш, она искажала VWAP ((h+l+c)/3) и проверки пробоя low/high у scheduled.
 * Когерентность open/close vs high/low намеренно НЕ проверяется (кросс-фидовая
 * агрегация на реальных биржах даёт погрешность округления).
 */
test("validateCandles rejects a candle with high < low", async ({ pass, fail }) => {
  const { validateCandles } = await import("../../build/index.mjs");

  const base = {
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 10,
    timestamp: 1704067200000,
  };

  // Когерентная пачка проходит
  try {
    validateCandles([base, { ...base, timestamp: base.timestamp + 60000 }]);
  } catch (e) {
    fail(`coherent candles must pass, got: ${e.message}`);
    return;
  }

  // high < low — отклоняется
  let threw = false;
  try {
    validateCandles([
      base,
      { ...base, high: 89, low: 111, timestamp: base.timestamp + 60000 },
    ]);
  } catch (e) {
    threw = /high.*<.*low|high \(89\)/.test(e.message) || e.message.includes("high");
  }
  if (!threw) {
    fail(`REGRESSION: candle with high (89) < low (111) must be rejected`);
    return;
  }

  // open/close вне [low, high] по-прежнему допускается (осознанно)
  try {
    validateCandles([base, { ...base, open: 111, timestamp: base.timestamp + 60000 }]);
  } catch (e) {
    fail(`open outside [low, high] must still pass (cross-feed rounding), got: ${e.message}`);
    return;
  }

  pass("high < low rejected, coherent and rounding-edge candles pass");
});

/**
 * validateCandles: локальная опорная цена (медиана close по ±2 соседям) вместо
 * медианы всего массива — битый тик ловится, настоящий обвал ступенями проходит.
 */
const makeCandle = (i, close, extra = {}) => ({
  timestamp: Date.UTC(2024, 0, 1) + i * 60000,
  open: close,
  high: close,
  low: close,
  close,
  volume: 100,
  ...extra,
});

test("validateCandles: a genuine crash (10-100x steps, 800000x overall) passes", async ({ pass, fail }) => {
  const { validateCandles, getCandleAnomalyFlags } = await import("../../build/index.mjs");
  const closes = [80, 60, 30, 17, 1, 0.01, 0.0001, 0.0001, 0.0001];
  const candles = closes.map((c, i) => makeCandle(i, c, { open: c * 1.2, high: c * 1.3, low: c * 0.9 }));
  try {
    validateCandles(candles);
  } catch (error) {
    return fail(`crash must not be an anomaly: ${error.message}`);
  }
  if (getCandleAnomalyFlags(candles).some(Boolean)) return fail("no flag expected on a crash");
  pass("800000x crash over 9 candles is accepted");
});

test("validateCandles: a bad tick is caught against its neighbours", async ({ pass, fail }) => {
  const { validateCandles } = await import("../../build/index.mjs");
  // Binance incomplete candle: all four prices at 0.1 among 42000
  const incomplete = [42000, 42000, 42000, 42000, 42000].map((c, i) => makeCandle(i, c));
  incomplete[2] = makeCandle(2, 0.1, { open: 0.1, high: 0.12, low: 0.08, volume: 0 });
  try {
    validateCandles(incomplete);
    return fail("the incomplete candle must be rejected");
  } catch (error) {
    if (!error.message.includes("candle[2]") || !error.message.includes("out of range of its neighbours")) return fail(`wrong error: ${error.message}`);
  }
  // Yahoo bad low: 0.00043 at price 1.07, other prices sane
  const badLow = [1.07, 1.07, 1.07].map((c, i) => makeCandle(i, c));
  badLow[1] = makeCandle(1, 1.07, { low: 0.00043 });
  try {
    validateCandles(badLow);
    return fail("the bad low must be rejected");
  } catch (error) {
    if (!error.message.includes("candle[1]")) return fail(`wrong error: ${error.message}`);
  }
  pass("incomplete candle and bad low are rejected");
});

test("validateCandles: a bad tick is caught even in a single-candle array (own close is the reference)", async ({ pass, fail }) => {
  const { validateCandles } = await import("../../build/index.mjs");
  try {
    validateCandles([makeCandle(0, 105, { low: 0.0004 })]);
    return fail("single candle with a bad low must be rejected");
  } catch (error) {
    if (!error.message.includes("candle[0]")) return fail(`wrong error: ${error.message}`);
  }
  pass("single-candle bad low rejected");
});

test("validateCandles: a high spike is caught (check is two-sided)", async ({ pass, fail }) => {
  const { validateCandles } = await import("../../build/index.mjs");
  const candles = [100, 100, 100].map((c, i) => makeCandle(i, c));
  candles[1] = makeCandle(1, 105, { high: 500_000 });
  try {
    validateCandles(candles);
    return fail("a 5000x high spike must be rejected");
  } catch (error) {
    if (!error.message.includes("candle[1]")) return fail(`wrong error: ${error.message}`);
  }
  pass("high spike rejected");
});

test("validateCandles: two adjacent candles broken in every price are caught by the 5-candle window", async ({ pass, fail }) => {
  const { validateCandles, getCandleAnomalyFlags } = await import("../../build/index.mjs");
  const candles = [105, 105, 0.0004, 0.0004, 105, 105].map((c, i) => makeCandle(i, c));
  const flags = getCandleAnomalyFlags(candles);
  if (JSON.stringify(flags) !== JSON.stringify([false, false, true, true, false, false])) return fail(`flags ${JSON.stringify(flags)}`);
  try {
    validateCandles(candles);
    return fail("must throw on the first broken candle");
  } catch (error) {
    if (!error.message.includes("candle[2]")) return fail(`wrong error: ${error.message}`);
  }
  pass("2 of 5 broken: median stays sane, both flagged");
});

test("validateCandles: a 99% single-candle drop within the factor passes", async ({ pass, fail }) => {
  const { validateCandles } = await import("../../build/index.mjs");
  const candles = [100, 100, 1, 1, 1].map((c, i) => makeCandle(i, c));
  try {
    validateCandles(candles);
  } catch (error) {
    return fail(`a 100x step must pass under factor 1000: ${error.message}`);
  }
  pass("100x step accepted");
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenDoneBacktest,
  listenError,
  getCandles,
  getRawCandles,
  getAveragePrice,
  getDate,
  getTimestamp,
  getMode,
  getSymbol,
  getContext,
  hasTradeContext,
  formatPrice,
  formatQuantity,
  PersistCandleAdapter,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

const MS_PER_MINUTE = 60_000;

class PersistMemory {
  _store = new Map();
  async waitForInit() {}
  async readValue(key) { return this._store.get(key) ?? null; }
  async hasValue(key) { return this._store.has(key); }
  async writeValue(key, value) { this._store.set(key, value); }
  async keys() { return [...this._store.keys()]; }
}

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * Builds a minimal candle adapter that returns candles starting at aligned since,
 * using the given price for all fields.
 */
const makeAdapter = (basePrice, intervalMinutes = 1) => async (_symbol, _interval, since, limit) => {
  const step = intervalMinutes * MS_PER_MINUTE;
  const start = alignTimestamp(since.getTime(), intervalMinutes);
  const candles = [];
  for (let i = 0; i < limit; i++) {
    candles.push({
      timestamp: start + i * step,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }
  return candles;
};

/**
 * Runs a backtest and resolves when done or on error.
 * Calls setup() once per test to register schemas before Backtest.background.
 * Returns captured error if any.
 */
const runBacktest = async (symbol, strategyName, exchangeName, frameName) => {
  const awaitSubject = new Subject();
  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });
  listenDoneBacktest(() => awaitSubject.next());
  Backtest.background(symbol, { strategyName, exchangeName, frameName });
  await awaitSubject.toPromise();
  unsubscribeError();
  return errorCaught;
};

// ---------------------------------------------------------------------------
// getCandles
// ---------------------------------------------------------------------------

test("e2e exchange.getCandles: returns correct count inside getSignal", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const basePrice = 50000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * MS_PER_MINUTE;

  let allCandles = [];
  for (let i = 0; i < bufferMinutes + 2; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * MS_PER_MINUTE,
      open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "e2e-gc-count",
    getCandles: async (_symbol, _interval, since, limit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const ts = start + i * MS_PER_MINUTE;
        const existing = allCandles.find((c) => c.timestamp === ts);
        result.push(existing ?? { timestamp: ts, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedCount = null;

  addStrategySchema({
    strategyName: "e2e-gc-count",
    interval: "1m",
    getSignal: async () => {
      const candles = await getCandles("BTCUSDT", "1m", 5);
      capturedCount = candles.length;
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-gc-count",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-gc-count", "e2e-gc-count", "e2e-gc-count");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (capturedCount !== 5) {
    fail(`Expected 5 candles from getCandles, got ${capturedCount}`);
    return;
  }

  pass("getCandles returned 5 candles inside getSignal");
});

test("e2e exchange.getCandles: candle timestamps are sequential with 1m step", async ({ pass, fail }) => {
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-gc-timestamps",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedCandles = null;

  addStrategySchema({
    strategyName: "e2e-gc-timestamps",
    interval: "1m",
    getSignal: async () => {
      capturedCandles = await getCandles("BTCUSDT", "1m", 6);
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-gc-timestamps",
    interval: "1m",
    startDate: new Date("2024-02-01T00:00:00Z"),
    endDate: new Date("2024-02-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-gc-timestamps", "e2e-gc-timestamps", "e2e-gc-timestamps");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (!capturedCandles || capturedCandles.length !== 6) {
    fail(`Expected 6 candles, got ${capturedCandles?.length}`);
    return;
  }

  for (let i = 1; i < capturedCandles.length; i++) {
    const step = capturedCandles[i].timestamp - capturedCandles[i - 1].timestamp;
    if (step !== MS_PER_MINUTE) {
      fail(`Candles [${i - 1}] and [${i}] step is ${step}ms, expected ${MS_PER_MINUTE}ms`);
      return;
    }
  }

  pass("getCandles returned candles with sequential 1m timestamps");
});

test("e2e exchange.getCandles: last candle is closed before execution context time", async ({ pass, fail }) => {
  const basePrice = 50000;
  const startTime = new Date("2024-03-01T00:00:00Z").getTime();

  addExchangeSchema({
    exchangeName: "e2e-gc-closed",
    getCandles: async (_symbol, _interval, since, limit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({ timestamp: start + i * MS_PER_MINUTE, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
      }
      return candles;
    },
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let lastCandleClose = null;
  let contextWhen = null;

  addStrategySchema({
    strategyName: "e2e-gc-closed",
    interval: "1m",
    getSignal: async () => {
      const candles = await getCandles("BTCUSDT", "1m", 5);
      const date = await getDate();
      lastCandleClose = candles[candles.length - 1].timestamp + MS_PER_MINUTE;
      contextWhen = date.getTime();
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-gc-closed",
    interval: "1m",
    startDate: new Date("2024-03-01T00:00:00Z"),
    endDate: new Date("2024-03-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-gc-closed", "e2e-gc-closed", "e2e-gc-closed");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (lastCandleClose === null) {
    fail("getSignal was not called");
    return;
  }

  if (lastCandleClose > contextWhen) {
    fail(`Last candle closes at ${lastCandleClose}, after context time ${contextWhen}`);
    return;
  }

  pass(`Last candle closeTime (${lastCandleClose}) <= context time (${contextWhen})`);
});

// ---------------------------------------------------------------------------
// getRawCandles
// ---------------------------------------------------------------------------

test("e2e exchange.getRawCandles: sDate+eDate returns candles in past range", async ({ pass, fail }) => {
  const basePrice = 48000;
  const PAST = new Date("2023-06-01T00:00:00Z").getTime();
  const limit = 5;
  const sDate = PAST;
  const eDate = PAST + limit * MS_PER_MINUTE;
  const alignedSince = alignTimestamp(PAST, 1);

  addExchangeSchema({
    exchangeName: "e2e-rc-sdate-edate",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedCandles = null;

  addStrategySchema({
    strategyName: "e2e-rc-sdate-edate",
    interval: "1m",
    getSignal: async () => {
      capturedCandles = await getRawCandles("BTCUSDT", "1m", undefined, sDate, eDate);
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-rc-sdate-edate",
    interval: "1m",
    startDate: new Date("2024-04-01T00:00:00Z"),
    endDate: new Date("2024-04-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-rc-sdate-edate", "e2e-rc-sdate-edate", "e2e-rc-sdate-edate");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (!capturedCandles || capturedCandles.length !== limit) {
    fail(`Expected ${limit} candles, got ${capturedCandles?.length}`);
    return;
  }

  if (capturedCandles[0].timestamp !== alignedSince) {
    fail(`First candle timestamp wrong: expected ${alignedSince}, got ${capturedCandles[0].timestamp}`);
    return;
  }

  pass(`getRawCandles (sDate+eDate) returned ${limit} candles from ${new Date(alignedSince).toISOString()}`);
});

test("e2e exchange.getRawCandles: limit-only returns N candles ending before context time", async ({ pass, fail }) => {
  const basePrice = 49000;
  const limit = 4;

  addExchangeSchema({
    exchangeName: "e2e-rc-limit-only",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedCandles = null;
  let contextWhen = null;

  addStrategySchema({
    strategyName: "e2e-rc-limit-only",
    interval: "1m",
    getSignal: async () => {
      capturedCandles = await getRawCandles("BTCUSDT", "1m", limit);
      contextWhen = (await getDate()).getTime();
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-rc-limit-only",
    interval: "1m",
    startDate: new Date("2024-05-01T00:00:00Z"),
    endDate: new Date("2024-05-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-rc-limit-only", "e2e-rc-limit-only", "e2e-rc-limit-only");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (!capturedCandles || capturedCandles.length !== limit) {
    fail(`Expected ${limit} candles, got ${capturedCandles?.length}`);
    return;
  }

  const lastClose = capturedCandles[capturedCandles.length - 1].timestamp + MS_PER_MINUTE;
  if (lastClose > contextWhen) {
    fail(`Last candle closeTime ${lastClose} > contextWhen ${contextWhen}`);
    return;
  }

  pass(`getRawCandles (limit-only) returned ${limit} candles all closed before context time`);
});

test("e2e exchange.getRawCandles: eDate+limit returns candles ending at eDate", async ({ pass, fail }) => {
  const basePrice = 51000;
  const PAST = new Date("2023-07-01T00:00:00Z").getTime();
  const limit = 4;
  const eDate = PAST + 60 * MS_PER_MINUTE;
  const alignedEDate = alignTimestamp(eDate, 1);
  const expectedSince = alignedEDate - limit * MS_PER_MINUTE;

  addExchangeSchema({
    exchangeName: "e2e-rc-edate-limit",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedCandles = null;

  addStrategySchema({
    strategyName: "e2e-rc-edate-limit",
    interval: "1m",
    getSignal: async () => {
      capturedCandles = await getRawCandles("BTCUSDT", "1m", limit, undefined, eDate);
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-rc-edate-limit",
    interval: "1m",
    startDate: new Date("2024-06-01T00:00:00Z"),
    endDate: new Date("2024-06-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-rc-edate-limit", "e2e-rc-edate-limit", "e2e-rc-edate-limit");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (!capturedCandles || capturedCandles.length !== limit) {
    fail(`Expected ${limit} candles, got ${capturedCandles?.length}`);
    return;
  }

  if (capturedCandles[0].timestamp !== expectedSince) {
    fail(`First candle timestamp wrong: expected ${expectedSince}, got ${capturedCandles[0].timestamp}`);
    return;
  }

  pass(`getRawCandles (eDate+limit) returned ${limit} candles starting at ${new Date(expectedSince).toISOString()}`);
});

// ---------------------------------------------------------------------------
// getAveragePrice
// ---------------------------------------------------------------------------

test("e2e exchange.getAveragePrice: returns positive VWAP number", async ({ pass, fail }) => {
  const basePrice = 55000;
  const startTime = new Date("2024-07-01T00:00:00Z").getTime();
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * MS_PER_MINUTE;

  const bufferCandles = [];
  for (let i = 0; i < bufferMinutes + 2; i++) {
    bufferCandles.push({ timestamp: bufferStartTime + i * MS_PER_MINUTE, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
  }

  addExchangeSchema({
    exchangeName: "e2e-avg-price",
    getCandles: async (_symbol, _interval, since, limit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const ts = start + i * MS_PER_MINUTE;
        const existing = bufferCandles.find((c) => c.timestamp === ts);
        result.push(existing ?? { timestamp: ts, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedVwap = null;

  addStrategySchema({
    strategyName: "e2e-avg-price",
    interval: "1m",
    getSignal: async () => {
      capturedVwap = await getAveragePrice("BTCUSDT");
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-avg-price",
    interval: "1m",
    startDate: new Date("2024-07-01T00:00:00Z"),
    endDate: new Date("2024-07-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-avg-price", "e2e-avg-price", "e2e-avg-price");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (typeof capturedVwap !== "number" || capturedVwap <= 0) {
    fail(`Expected positive VWAP number, got ${capturedVwap}`);
    return;
  }

  pass(`getAveragePrice returned VWAP=${capturedVwap.toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// getDate / getTimestamp
// ---------------------------------------------------------------------------

test("e2e exchange.getDate: returns frame startDate in backtest mode", async ({ pass, fail }) => {
  const startDate = new Date("2024-08-01T00:00:00Z");
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-get-date",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedDate = null;

  addStrategySchema({
    strategyName: "e2e-get-date",
    interval: "1m",
    getSignal: async () => {
      if (capturedDate === null) {
        capturedDate = await getDate();
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-get-date",
    interval: "1m",
    startDate,
    endDate: new Date("2024-08-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-get-date", "e2e-get-date", "e2e-get-date");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (!(capturedDate instanceof Date)) {
    fail(`Expected Date instance, got ${capturedDate}`);
    return;
  }

  if (capturedDate.getTime() !== startDate.getTime()) {
    fail(`Expected ${startDate.toISOString()}, got ${capturedDate.toISOString()}`);
    return;
  }

  pass(`getDate returned correct frame startDate: ${capturedDate.toISOString()}`);
});

test("e2e exchange.getTimestamp: returns numeric milliseconds matching frame startDate", async ({ pass, fail }) => {
  const startDate = new Date("2024-09-01T00:00:00Z");
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-get-timestamp",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedTimestamp = null;

  addStrategySchema({
    strategyName: "e2e-get-timestamp",
    interval: "1m",
    getSignal: async () => {
      if (capturedTimestamp === null) {
        capturedTimestamp = await getTimestamp();
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-get-timestamp",
    interval: "1m",
    startDate,
    endDate: new Date("2024-09-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-get-timestamp", "e2e-get-timestamp", "e2e-get-timestamp");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (typeof capturedTimestamp !== "number") {
    fail(`Expected number, got ${typeof capturedTimestamp}`);
    return;
  }

  if (capturedTimestamp !== startDate.getTime()) {
    fail(`Expected ${startDate.getTime()}, got ${capturedTimestamp}`);
    return;
  }

  pass(`getTimestamp returned ${capturedTimestamp} matching startDate`);
});

// ---------------------------------------------------------------------------
// getMode
// ---------------------------------------------------------------------------

test("e2e exchange.getMode: returns 'backtest' during Backtest.background", async ({ pass, fail }) => {
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-get-mode",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedMode = null;

  addStrategySchema({
    strategyName: "e2e-get-mode",
    interval: "1m",
    getSignal: async () => {
      capturedMode = await getMode();
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-get-mode",
    interval: "1m",
    startDate: new Date("2024-10-01T00:00:00Z"),
    endDate: new Date("2024-10-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-get-mode", "e2e-get-mode", "e2e-get-mode");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (capturedMode !== "backtest") {
    fail(`Expected 'backtest', got '${capturedMode}'`);
    return;
  }

  pass("getMode returned 'backtest' during Backtest.background");
});

// ---------------------------------------------------------------------------
// getSymbol
// ---------------------------------------------------------------------------

test("e2e exchange.getSymbol: returns the symbol passed to Backtest.background", async ({ pass, fail }) => {
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-get-symbol",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedSymbol = null;

  addStrategySchema({
    strategyName: "e2e-get-symbol",
    interval: "1m",
    getSignal: async () => {
      capturedSymbol = await getSymbol();
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-get-symbol",
    interval: "1m",
    startDate: new Date("2024-11-01T00:00:00Z"),
    endDate: new Date("2024-11-01T00:02:00Z"),
  });

  const error = await runBacktest("ETHUSDT", "e2e-get-symbol", "e2e-get-symbol", "e2e-get-symbol");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (capturedSymbol !== "ETHUSDT") {
    fail(`Expected 'ETHUSDT', got '${capturedSymbol}'`);
    return;
  }

  pass(`getSymbol returned '${capturedSymbol}'`);
});

// ---------------------------------------------------------------------------
// getContext
// ---------------------------------------------------------------------------

test("e2e exchange.getContext: returns method context object with expected fields", async ({ pass, fail }) => {
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-get-context",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedContext = null;

  addStrategySchema({
    strategyName: "e2e-get-context",
    interval: "1m",
    getSignal: async () => {
      capturedContext = await getContext();
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-get-context",
    interval: "1m",
    startDate: new Date("2024-12-01T00:00:00Z"),
    endDate: new Date("2024-12-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-get-context", "e2e-get-context", "e2e-get-context");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (capturedContext === null || typeof capturedContext !== "object") {
    fail(`Expected context object, got ${capturedContext}`);
    return;
  }

  pass("getContext returned a non-null object");
});

// ---------------------------------------------------------------------------
// hasTradeContext
// ---------------------------------------------------------------------------

test("e2e exchange.hasTradeContext: returns true inside getSignal", async ({ pass, fail }) => {
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-has-ctx",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedHasContext = null;

  addStrategySchema({
    strategyName: "e2e-has-ctx",
    interval: "1m",
    getSignal: async () => {
      capturedHasContext = hasTradeContext();
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-has-ctx",
    interval: "1m",
    startDate: new Date("2025-01-01T00:00:00Z"),
    endDate: new Date("2025-01-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-has-ctx", "e2e-has-ctx", "e2e-has-ctx");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (capturedHasContext !== true) {
    fail(`Expected hasTradeContext()=true inside getSignal, got ${capturedHasContext}`);
    return;
  }

  pass("hasTradeContext() returned true inside getSignal");
});

// ---------------------------------------------------------------------------
// formatPrice / formatQuantity
// ---------------------------------------------------------------------------

test("e2e exchange.formatPrice: uses exchange schema implementation", async ({ pass, fail }) => {
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-fmt-price",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(4),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let capturedFormatted = null;

  addStrategySchema({
    strategyName: "e2e-fmt-price",
    interval: "1m",
    getSignal: async () => {
      capturedFormatted = await formatPrice("BTCUSDT", 42685.1236);
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-fmt-price",
    interval: "1m",
    startDate: new Date("2025-02-01T00:00:00Z"),
    endDate: new Date("2025-02-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-fmt-price", "e2e-fmt-price", "e2e-fmt-price");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (capturedFormatted !== "42685.1236") {
    fail(`Expected "42685.1236" (4 decimals), got "${capturedFormatted}"`);
    return;
  }

  pass(`formatPrice returned "${capturedFormatted}" using exchange toFixed(4)`);
});

test("e2e exchange.formatQuantity: uses exchange schema implementation", async ({ pass, fail }) => {
  const basePrice = 50000;

  addExchangeSchema({
    exchangeName: "e2e-fmt-qty",
    getCandles: makeAdapter(basePrice, 1),
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(5),
  });

  let capturedFormatted = null;

  addStrategySchema({
    strategyName: "e2e-fmt-qty",
    interval: "1m",
    getSignal: async () => {
      capturedFormatted = await formatQuantity("BTCUSDT", 0.123456789);
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-fmt-qty",
    interval: "1m",
    startDate: new Date("2025-03-01T00:00:00Z"),
    endDate: new Date("2025-03-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-fmt-qty", "e2e-fmt-qty", "e2e-fmt-qty");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (capturedFormatted !== "0.12346") {
    fail(`Expected "0.12346" (5 decimals), got "${capturedFormatted}"`);
    return;
  }

  pass(`formatQuantity returned "${capturedFormatted}" using exchange toFixed(5)`);
});

// ---------------------------------------------------------------------------
// getCandles + getRawCandles: cache hit inside backtest (adapter called once)
// ---------------------------------------------------------------------------

test("e2e exchange.getCandles: adapter called once; second call inside same getSignal uses cache", async ({ pass, fail }) => {
  const basePrice = 50000;
  let adapterCallCount = 0;

  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  addExchangeSchema({
    exchangeName: "e2e-gc-cache-hit",
    getCandles: async (_symbol, _interval, since, limit) => {
      adapterCallCount++;
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({ timestamp: start + i * MS_PER_MINUTE, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
      }
      return candles;
    },
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let signalCount = 0;
  let cacheHitVerified = null;

  addStrategySchema({
    strategyName: "e2e-gc-cache-hit",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount === 1) {
        await getCandles("BTCUSDT", "1m", 5);
        const countAfterFirst = adapterCallCount;
        // Second call with same params — must hit cache, adapter count must not increase
        await getCandles("BTCUSDT", "1m", 5);
        cacheHitVerified = adapterCallCount === countAfterFirst;
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-gc-cache-hit",
    interval: "1m",
    startDate: new Date("2025-04-01T00:00:00Z"),
    endDate: new Date("2025-04-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-gc-cache-hit", "e2e-gc-cache-hit", "e2e-gc-cache-hit");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (!cacheHitVerified) {
    fail("Adapter called again on second getCandles — cache miss");
    return;
  }

  pass("Cache hit: second getCandles with same params served from cache without calling adapter");
});

test("e2e exchange.getRawCandles: adapter called once; second call with same sDate+eDate uses cache", async ({ pass, fail }) => {
  const basePrice = 52000;
  const PAST = new Date("2023-08-01T00:00:00Z").getTime();
  const sDate = PAST;
  const eDate = PAST + 5 * MS_PER_MINUTE;
  let adapterCallCount = 0;

  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  addExchangeSchema({
    exchangeName: "e2e-rc-cache-hit",
    getCandles: async (_symbol, _interval, since, limit) => {
      adapterCallCount++;
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({ timestamp: start + i * MS_PER_MINUTE, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
      }
      return candles;
    },
    formatPrice: async (_s, p) => p.toFixed(2),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });

  let signalCount = 0;
  let cacheHitVerified = null;

  addStrategySchema({
    strategyName: "e2e-rc-cache-hit",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount === 1) {
        await getRawCandles("BTCUSDT", "1m", undefined, sDate, eDate);
        const countAfterFirst = adapterCallCount;
        // Second call — same sDate+eDate, must hit cache, adapter count must not increase
        await getRawCandles("BTCUSDT", "1m", undefined, sDate, eDate);
        cacheHitVerified = adapterCallCount === countAfterFirst;
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "e2e-rc-cache-hit",
    interval: "1m",
    startDate: new Date("2025-05-01T00:00:00Z"),
    endDate: new Date("2025-05-01T00:02:00Z"),
  });

  const error = await runBacktest("BTCUSDT", "e2e-rc-cache-hit", "e2e-rc-cache-hit", "e2e-rc-cache-hit");

  if (error) {
    fail(`Unexpected error: ${error.message ?? error}`);
    return;
  }

  if (!cacheHitVerified) {
    fail("Adapter called again on second getRawCandles — cache miss");
    return;
  }

  pass("Cache hit: second getRawCandles with same sDate+eDate served from cache without calling adapter");
});

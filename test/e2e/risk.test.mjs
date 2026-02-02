import { test } from "worker-testbed";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addRiskSchema,
  Backtest,
  listenSignal,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
  listenRisk,
  listenRiskOnce,
  Risk,
} from "../../build/index.mjs";

import { sleep, Subject } from "functools-kit";

test("Risk rejects signals based on custom symbol filter", async ({ pass, fail }) => {

  let btcRejected = false;
  let ethAllowed = false;

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
    exchangeName: "binance-integration-symbol-filter",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "no-btc",
    validations: [
      ({ symbol }) => {
        if (symbol === "BTCUSDT") {
          throw new Error("BTC trading not allowed");
        }
      },
    ],
    callbacks: {
      onRejected: (symbol) => {
        if (symbol === "BTCUSDT") {
          btcRejected = true;
        }
      },
      onAllowed: (symbol) => {
        if (symbol === "ETHUSDT") {
          ethAllowed = true;
        }
      },
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-symbol-filter",
    interval: "1m",
    riskName: "no-btc",
    getSignal: async () => {
      return {
        position: "long",
        note: "symbol filter test",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-symbol-filter",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubjectBTC = new Subject();
  const awaitSubjectETH = new Subject();

  let backtestCount = 0;
  listenDoneBacktest(() => {
    backtestCount++;
    if (backtestCount === 1) {
      awaitSubjectBTC.next();
    } else if (backtestCount === 2) {
      awaitSubjectETH.next();
    }
  });

  let btcOpenedCount = 0;
  let ethOpenedCount = 0;

  listenSignalBacktest((result) => {
    if (result.symbol === "BTCUSDT" && result.action === "opened") {
      btcOpenedCount++;
    }
    if (result.symbol === "ETHUSDT" && result.action === "opened") {
      ethOpenedCount++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-symbol-filter",
    exchangeName: "binance-integration-symbol-filter",
    frameName: "1d-symbol-filter",
  });

  await awaitSubjectBTC.toPromise();

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-symbol-filter",
    exchangeName: "binance-integration-symbol-filter",
    frameName: "1d-symbol-filter",
  });

  await awaitSubjectETH.toPromise();

  if (btcRejected && btcOpenedCount === 0 && ethAllowed && ethOpenedCount > 0) {
    pass(`Risk correctly filtered symbols: BTC rejected (0 opened), ETH allowed (${ethOpenedCount} opened)`);
    return;
  }

  fail(`BTC rejected: ${btcRejected}, BTC opened: ${btcOpenedCount}, ETH allowed: ${ethAllowed}, ETH opened: ${ethOpenedCount}`);

});

test("Risk validation with price-based logic", async ({ pass, fail }) => {

  let lowPriceRejected = 0;
  let highPriceAllowed = 0;

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
    exchangeName: "binance-integration-price-filter",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "min-price-filter",
    validations: [
      ({ currentPrice }) => {
        if (currentPrice < 40000) {
          throw new Error("Price too low for trading");
        }
      },
    ],
    callbacks: {
      onRejected: () => {
        lowPriceRejected++;
      },
      onAllowed: () => {
        highPriceAllowed++;
      },
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-price-filter",
    interval: "1m",
    riskName: "min-price-filter",
    getSignal: async () => {
      return {
        position: "long",
        note: "price filter test",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-price-filter",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let openedCount = 0;
  listenSignalBacktest((result) => {
    if (result.symbol === "BTCUSDT" && result.action === "opened") {
      openedCount++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-price-filter",
    exchangeName: "binance-integration-price-filter",
    frameName: "1d-price-filter",
  });

  await awaitSubject.toPromise();

  if (highPriceAllowed > 0 && openedCount > 0) {
    pass(`Price-based risk validation works: ${highPriceAllowed} allowed at high price, ${lowPriceRejected} rejected at low price`);
    return;
  }

  fail(`Expected >0 high price allowed, got ${highPriceAllowed}; opened: ${openedCount}`);

});

test("Multiple strategies share same risk profile with concurrent positions", async ({ pass, fail }) => {

  let totalOpen = 0;
  let totalFinished = 0;

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
    exchangeName: "binance-integration-shared-risk",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "shared-max-1",
    validations: [
      ({ activePositionCount }) => {
        if (activePositionCount >= 1) {
          throw new Error("Maximum 1 concurrent position across all strategies");
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: "shared-strategy-1",
    interval: "1m",
    riskName: "shared-max-1",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "short",
        note: "shared risk test 2",
        priceOpen: price,
        priceTakeProfit: price - 10_000,
        priceStopLoss: price + 10_000,
        minuteEstimatedTime: 200,
      };
    },
    callbacks: {
      onOpen: () => {
        totalOpen++;
      },
      onClose: () => {
        totalOpen--;
      }
    }
  });

  addStrategySchema({
    strategyName: "shared-strategy-2",
    interval: "1m",
    riskName: "shared-max-1",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "short",
        note: "shared risk test 2",
        priceOpen: price,
        priceTakeProfit: price - 10_000,
        priceStopLoss: price + 10_000,
        minuteEstimatedTime: 200,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-shared-risk",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-05T00:00:00Z"),
  });

  const awaitSubject = new Subject();


  listenDoneBacktest(() => {
    totalFinished++;
    if (totalFinished === 2) {
      awaitSubject.next();
    }
  });


  Backtest.background("BTCUSDT", {
    strategyName: "shared-strategy-1",
    exchangeName: "binance-integration-shared-risk",
    frameName: "1d-shared-risk",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "shared-strategy-2",
    exchangeName: "binance-integration-shared-risk",
    frameName: "1d-shared-risk",
  });

  await awaitSubject.toPromise();

  if (totalOpen === 0) {
    pass();
    return;
  }
  fail();

});

test("Risk validation with activePositions array access", async ({ pass, fail }) => {

  let validationCalledWithPositions = false;
  let maxActivePositionsObserved = 0;

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
    exchangeName: "binance-integration-active-positions",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "check-active-positions",
    validations: [
      ({ activePositions, activePositionCount }) => {
        if (Array.isArray(activePositions) && activePositions.length === activePositionCount) {
          validationCalledWithPositions = true;
          maxActivePositionsObserved = Math.max(maxActivePositionsObserved, activePositionCount);
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: "test-strategy-active-positions",
    interval: "1m",
    riskName: "check-active-positions",
    getSignal: async () => {
      return {
        position: "long",
        note: "active positions test",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-active-positions",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-active-positions",
    exchangeName: "binance-integration-active-positions",
    frameName: "3d-active-positions",
  });

  await awaitSubject.toPromise();

  if (validationCalledWithPositions && maxActivePositionsObserved >= 0) {
    pass(`activePositions array accessible in validation, max observed: ${maxActivePositionsObserved}`);
    return;
  }

  fail(`Validation not called with positions: ${validationCalledWithPositions}, max: ${maxActivePositionsObserved}`);

});

test("Risk validation with timestamp-based logic", async ({ pass, fail }) => {

  let rejectedByTime = false;
  let allowedSignals = 0;

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
    exchangeName: "binance-integration-timestamp-filter",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  // Only allow trading after January 2nd
  const cutoffTime = new Date("2024-01-02T00:00:00Z").getTime();

  addRiskSchema({
    riskName: "time-filter",
    validations: [
      ({ timestamp }) => {
        if (timestamp < cutoffTime) {
          throw new Error("Trading not allowed before cutoff time");
        }
      },
    ],
    callbacks: {
      onRejected: () => {
        rejectedByTime = true;
      },
      onAllowed: () => {
        allowedSignals++;
      },
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-timestamp-filter",
    interval: "1m",
    riskName: "time-filter",
    getSignal: async () => {
      return {
        position: "long",
        note: "timestamp filter test",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-timestamp-filter",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-timestamp-filter",
    exchangeName: "binance-integration-timestamp-filter",
    frameName: "3d-timestamp-filter",
  });

  await awaitSubject.toPromise();

  if (rejectedByTime && allowedSignals > 0) {
    pass(`Timestamp-based filtering works: ${allowedSignals} allowed after cutoff`);
    return;
  }

  fail(`Rejected by time: ${rejectedByTime}, allowed: ${allowedSignals}`);

});

test("Risk rejects all signals with max positions set to 0", async ({ pass, fail }) => {

  let rejectedCount = 0;
  let allowedCount = 0;

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
    exchangeName: "binance-integration-zero-positions",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "no-trading",
    validations: [
      () => {
        throw new Error("No trading allowed");
      },
    ],
    callbacks: {
      onRejected: () => {
        rejectedCount++;
      },
      onAllowed: () => {
        allowedCount++;
      },
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-zero-positions",
    interval: "1m",
    riskName: "no-trading",
    getSignal: async () => {
      return {
        position: "long",
        note: "should be rejected",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-zero-positions",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let openedCount = 0;
  listenSignalBacktest((result) => {
    if (result.action === "opened") {
      openedCount++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-zero-positions",
    exchangeName: "binance-integration-zero-positions",
    frameName: "3d-zero-positions",
  });

  await awaitSubject.toPromise();

  if (rejectedCount > 0 && allowedCount === 0 && openedCount === 0) {
    pass(`All signals rejected: ${rejectedCount} rejected, ${allowedCount} allowed, ${openedCount} opened`);
    return;
  }

  fail(`Expected all rejections, got ${rejectedCount} rejected, ${allowedCount} allowed, ${openedCount} opened`);

});

test("Risk validation with strategyName and exchangeName checks", async ({ pass, fail }) => {

  let correctStrategyName = false;
  let correctExchangeName = false;

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
    exchangeName: "binance-integration-metadata",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "metadata-check",
    validations: [
      ({ strategyName, exchangeName }) => {
        if (strategyName === "test-strategy-metadata") {
          correctStrategyName = true;
        }
        if (exchangeName === "binance-integration-metadata") {
          correctExchangeName = true;
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: "test-strategy-metadata",
    interval: "1m",
    riskName: "metadata-check",
    getSignal: async () => {
      return {
        position: "long",
        note: "metadata check test",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-metadata",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-metadata",
    exchangeName: "binance-integration-metadata",
    frameName: "1d-metadata",
  });

  await awaitSubject.toPromise();

  if (correctStrategyName && correctExchangeName) {
    pass("Risk validation receives correct strategyName and exchangeName");
    return;
  }

  fail(`Strategy name: ${correctStrategyName}, Exchange name: ${correctExchangeName}`);

});

test("Multiple validations execute in order and fail fast", async ({ pass, fail }) => {

  let validation1Called = false;
  let validation2Called = false;
  let validation3Called = false;

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
    exchangeName: "binance-integration-fail-fast",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "fail-fast-check",
    validations: [
      () => {
        validation1Called = true;
        // This passes
      },
      () => {
        validation2Called = true;
        throw new Error("Second validation fails");
      },
      () => {
        validation3Called = true;
        // This should not be called due to fail-fast
      },
    ],
  });

  addStrategySchema({
    strategyName: "test-strategy-fail-fast",
    interval: "1m",
    riskName: "fail-fast-check",
    getSignal: async () => {
      return {
        position: "long",
        note: "fail fast test",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-fail-fast",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-fail-fast",
    exchangeName: "binance-integration-fail-fast",
    frameName: "1d-fail-fast",
  });

  await awaitSubject.toPromise();

  if (validation1Called && validation2Called && !validation3Called) {
    pass("Validations execute in order with fail-fast behavior");
    return;
  }

  fail(`V1: ${validation1Called}, V2: ${validation2Called}, V3: ${validation3Called}`);

});

test("listenRisk captures rejection events with correct data", async ({ pass, fail }) => {

  const rejectionEvents = [];

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
    exchangeName: "binance-integration-listen-risk",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "max-2-positions",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 2) {
            throw new Error("Maximum 2 positions allowed");
          }
        },
        note: "Max 2 positions allowed",
      },
    ],
  });

  // Listen to all risk rejection events
  listenRisk((event) => {
    // console.log("[TEST] Risk rejection event received", event.rejectionNote);
    rejectionEvents.push(event);
  });

  let openedCount = 0;
  let closedCount = 0;
  listenSignal((result) => {
    /*console.log("[TEST] listenSignal event", {
      action: result.action,
      symbol: result.symbol,
      strategyName: result.strategyName,
      reason: result.reason,
      priceOpen: result.signal?.priceOpen,
      priceClose: result.signal?.priceClose,
      priceTakeProfit: result.signal?.priceTakeProfit,
      priceStopLoss: result.signal?.priceStopLoss,
    });*/
    if (result.action === "opened") {
      openedCount++;
      // console.log("[TEST] Signal opened, total opened:", openedCount);
    }
    if (result.action === "closed") {
      closedCount++;
      // console.log("[TEST] Signal closed, reason:", result.reason, "total closed:", closedCount);
    }
  });

  // Strategy 1 - will open position 1
  addStrategySchema({
    strategyName: "test-strategy-listen-risk-1",
    interval: "1m",
    riskName: "max-2-positions",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,  // Very high TP that won't be reached
        priceStopLoss: price * 0.1,   // Very low SL that won't be reached
        minuteEstimatedTime: 100000,    // Very long time so positions stay open
      };
    },
  });

  // Strategy 2 - will open position 2
  addStrategySchema({
    strategyName: "test-strategy-listen-risk-2",
    interval: "1m",
    riskName: "max-2-positions",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "short",
        priceOpen: price,
        priceTakeProfit: price * 0.1,  // Very low TP that won't be reached
        priceStopLoss: price * 10,   // Very high SL that won't be reached
        minuteEstimatedTime: 100000,    // Very long time so positions stay open
      };
    },
  });

  // Strategy 3 - will try to open position 3 and get rejected
  addStrategySchema({
    strategyName: "test-strategy-listen-risk-3",
    interval: "1m",
    riskName: "max-2-positions",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,
        priceStopLoss: price * 0.1,
        minuteEstimatedTime: 100000,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-listen-risk",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestsDone = 0;
  listenDoneBacktest(() => {
    backtestsDone++;
    // console.log("[TEST] Backtest done, total:", backtestsDone);
    if (backtestsDone === 3) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-listen-risk-1",
    exchangeName: "binance-integration-listen-risk",
    frameName: "3d-listen-risk",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-listen-risk-2",
    exchangeName: "binance-integration-listen-risk",
    frameName: "3d-listen-risk",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-listen-risk-3",
    exchangeName: "binance-integration-listen-risk",
    frameName: "3d-listen-risk",
  });

  await awaitSubject.toPromise();

  // console.log("[TEST] After await, before sleep");
  // console.log("[TEST] Total rejection events:", rejectionEvents.length);
  // console.log("[TEST] Total opened:", openedCount);
  // console.log("[TEST] Total closed:", closedCount);

  // await sleep(2000);

  // Should have rejections when attempting to open more than 2 positions
  if (rejectionEvents.length > 0) {
    const event = rejectionEvents[0];
    // console.log("[TEST] First rejection event:", JSON.stringify(event, null, 2));

    // Verify event structure - one of the strategies should be rejected
    // (could be any strategy since they run in parallel)
    const isValidStrategy =
      event.strategyName === "test-strategy-listen-risk-1" ||
      event.strategyName === "test-strategy-listen-risk-2" ||
      event.strategyName === "test-strategy-listen-risk-3";

    if (
      event.symbol === "BTCUSDT" &&
      isValidStrategy &&
      event.exchangeName === "binance-integration-listen-risk" &&
      event.rejectionNote === "Maximum 2 positions allowed" &&
      event.activePositionCount >= 2 &&
      typeof event.currentPrice === "number" &&
      typeof event.timestamp === "number" &&
      (typeof event.rejectionId === "string" || event.rejectionId === null) &&
      event.currentSignal &&
      (event.currentSignal.position === "long" || event.currentSignal.position === "short")
    ) {
      pass(`listenRisk captured ${rejectionEvents.length} rejection events with correct data`);
      return;
    }

    // console.log("[TEST] Event validation failed. Event:", event);
    // console.log("[TEST] Validation checks:");
    // console.log("  symbol:", event.symbol === "BTCUSDT");
    // console.log("  strategyName:", isValidStrategy);
    // console.log("  exchangeName:", event.exchangeName === "binance-integration-listen-risk");
    // console.log("  rejectionNote:", event.rejectionNote === "Max 2 positions allowed");
    // console.log("  activePositionCount:", event.activePositionCount >= 2);
    // console.log("  currentPrice type:", typeof event.currentPrice);
    // console.log("  timestamp type:", typeof event.timestamp);
    // console.log("  rejectionId type:", typeof event.rejectionId);
    // console.log("  has currentSignal:", !!event.currentSignal);
    // console.log("  position:", event.currentSignal?.position);
  }

  fail(`Expected rejection events with correct structure, got ${rejectionEvents.length} events`);

});

test("listenRiskOnce with filter for specific rejection condition", async ({ pass, fail }) => {

  let btcRejectionCaptured = false;
  let ethRejectionCaptured = false;

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
    exchangeName: "binance-integration-listen-once",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "reject-btc-eth",
    validations: [
      {
        validate: ({ symbol }) => {
          if (symbol === "BTCUSDT" || symbol === "ETHUSDT") {
            throw new Error(`${symbol} trading blocked`);
          }
        },
        note: "BTC/ETH trading blocked",
      },
    ],
  });

  // Listen once for BTC rejection
  listenRiskOnce(
    (event) => event.symbol === "BTCUSDT",
    (event) => {
      btcRejectionCaptured = event.rejectionNote === "BTCUSDT trading blocked";
    }
  );

  // Listen once for ETH rejection
  listenRiskOnce(
    (event) => event.symbol === "ETHUSDT",
    (event) => {
      ethRejectionCaptured = event.rejectionNote === "ETHUSDT trading blocked";
    }
  );

  addStrategySchema({
    strategyName: "test-strategy-listen-once",
    interval: "1m",
    riskName: "reject-btc-eth",
    getSignal: async () => {
      return {
        position: "short",
        priceTakeProfit: 40000,
        priceStopLoss: 44000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-listen-once",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestCount = 0;
  listenDoneBacktest(() => {
    backtestCount++;
    if (backtestCount === 2) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-listen-once",
    exchangeName: "binance-integration-listen-once",
    frameName: "1d-listen-once",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-listen-once",
    exchangeName: "binance-integration-listen-once",
    frameName: "1d-listen-once",
  });

  await awaitSubject.toPromise();

  if (btcRejectionCaptured && ethRejectionCaptured) {
    pass("listenRiskOnce captured filtered rejection events for both symbols");
    return;
  }

  fail(`BTC captured: ${btcRejectionCaptured}, ETH captured: ${ethRejectionCaptured}`);

});

test("Risk.getData returns correct statistics after rejections", async ({ pass, fail }) => {

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
    exchangeName: "binance-integration-get-data",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "max-1-position-data",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 1) {
            throw new Error("Max 1 position");
          }
        },
        note: "Maximum 1 position allowed",
      },
    ],
  });

  // Strategy 1 - will open position
  addStrategySchema({
    strategyName: "test-strategy-get-data-1",
    interval: "1m",
    riskName: "max-1-position-data",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,
        priceStopLoss: price * 0.1,
        minuteEstimatedTime: 100000,
      };
    },
  });

  // Strategy 2 - will be rejected
  addStrategySchema({
    strategyName: "test-strategy-get-data-2",
    interval: "1m",
    riskName: "max-1-position-data",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "short",
        priceOpen: price,
        priceTakeProfit: price * 0.1,
        priceStopLoss: price * 10,
        minuteEstimatedTime: 100000,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-get-data",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestsDone = 0;
  listenDoneBacktest(() => {
    backtestsDone++;
    if (backtestsDone === 2) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-get-data-1",
    exchangeName: "binance-integration-get-data",
    frameName: "3d-get-data",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-get-data-2",
    exchangeName: "binance-integration-get-data",
    frameName: "3d-get-data",
  });

  await awaitSubject.toPromise();

  // Get statistics for rejected strategy (strategy 2)
  const stats = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-get-data-2",
    exchangeName: "binance-integration-get-data",
    frameName: "3d-get-data",
  }, true);

  if (
    stats.totalRejections > 0 &&
    stats.eventList.length === stats.totalRejections &&
    stats.bySymbol["BTCUSDT"] === stats.totalRejections &&
    stats.byStrategy["test-strategy-get-data-2"] === stats.totalRejections &&
    stats.eventList.every((event) => event.rejectionNote === "Max 1 position")
  ) {
    pass(`Risk.getData returns correct stats: ${stats.totalRejections} rejections tracked`);
    return;
  }

  fail(`Incorrect stats: total=${stats.totalRejections}, events=${stats.eventList.length}`);

});

test("Risk.getReport generates markdown with correct table structure", async ({ pass, fail }) => {

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
    exchangeName: "binance-integration-get-report",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "max-1-position-report",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 1) {
            throw new Error("Max 1");
          }
        },
        note: "Portfolio limit reached",
      },
    ],
  });

  // Strategy 1 - will open position
  addStrategySchema({
    strategyName: "test-strategy-get-report-1",
    interval: "1m",
    riskName: "max-1-position-report",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,
        priceStopLoss: price * 0.1,
        minuteEstimatedTime: 100000,
      };
    },
  });

  // Strategy 2 - will be rejected
  addStrategySchema({
    strategyName: "test-strategy-get-report-2",
    interval: "1m",
    riskName: "max-1-position-report",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "short",
        priceOpen: price,
        priceTakeProfit: price * 0.1,
        priceStopLoss: price * 10,
        minuteEstimatedTime: 100000,
      };
    },
  });

  addFrameSchema({
    frameName: "2d-get-report",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-03T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestsDone = 0;
  listenDoneBacktest(() => {
    backtestsDone++;
    if (backtestsDone === 2) {
      awaitSubject.next();
    }
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-get-report-1",
    exchangeName: "binance-integration-get-report",
    frameName: "2d-get-report",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-get-report-2",
    exchangeName: "binance-integration-get-report",
    frameName: "2d-get-report",
  });

  await awaitSubject.toPromise();
  // await sleep(2000);

  const report = await Risk.getReport("ETHUSDT", {
    strategyName: "test-strategy-get-report-2",
    exchangeName: "binance-integration-get-report",
    frameName: "2d-get-report",
  }, true);

  // Verify report structure
  const hasTitle = report.includes("# Risk Rejection Report: ETHUSDT:test-strategy-get-report-2");
  const hasTableHeader = report.includes("| Symbol |") && report.includes("| Rejection Reason |");
  const hasSymbolColumn = report.includes("| ETHUSDT |");
  const hasReasonColumn = report.includes("Max 1");
  const hasStatistics = report.includes("**Total rejections:**");
  const hasBySymbol = report.includes("## Rejections by Symbol");
  const hasByStrategy = report.includes("## Rejections by Strategy");
  const hasIDColumn = report.includes("| ID |");

  if (hasTitle && hasTableHeader && hasSymbolColumn && hasReasonColumn && hasStatistics && hasBySymbol && hasByStrategy && hasIDColumn) {
    pass("Risk.getReport generates markdown with correct table and statistics");
    return;
  }

  fail("Report missing expected structure");

});

test("RejectionNote field captures validation note in rejection events", async ({ pass, fail }) => {

  const rejectionNotes = [];

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
    exchangeName: "binance-integration-rejection-note-field",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "comment-capture-risk",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 1) {
            throw new Error("Limit exceeded");
          }
        },
        note: "Custom rejection reason for testing",
      },
    ],
  });

  listenRisk((event) => {
    rejectionNotes.push(event.rejectionNote);
  });

  // Strategy 1 - will open position
  addStrategySchema({
    strategyName: "test-strategy-comment-field-1",
    interval: "1m",
    riskName: "comment-capture-risk",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,
        priceStopLoss: price * 0.1,
        minuteEstimatedTime: 100000,
      };
    },
  });

  // Strategy 2 - will be rejected
  addStrategySchema({
    strategyName: "test-strategy-comment-field-2",
    interval: "1m",
    riskName: "comment-capture-risk",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "short",
        priceOpen: price,
        priceTakeProfit: price * 0.1,
        priceStopLoss: price * 10,
        minuteEstimatedTime: 100000,
      };
    },
  });

  addFrameSchema({
    frameName: "2d-comment-field",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-03T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestsDone = 0;
  listenDoneBacktest(() => {
    backtestsDone++;
    if (backtestsDone === 2) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-comment-field-1",
    exchangeName: "binance-integration-rejection-note-field",
    frameName: "2d-comment-field",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-comment-field-2",
    exchangeName: "binance-integration-rejection-note-field",
    frameName: "2d-comment-field",
  });

  await awaitSubject.toPromise();
  // await sleep(2000);

  if (rejectionNotes.length > 0 && rejectionNotes.every((c) => c === "Limit exceeded")) {
    pass(`All ${rejectionNotes.length} rejection events captured correct rejectionNote from validation note`);
    return;
  }

  fail(`Expected rejectionNotes with note, got: ${JSON.stringify(rejectionNotes)}`);

});

test("No events emitted for allowed signals (anti-spam)", async ({ pass, fail }) => {

  let rejectionCount = 0;
  let allowedCount = 0;
  let eventCount = 0;

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
    exchangeName: "binance-integration-no-spam",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "no-spam-risk",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 10) {
            throw new Error("Max 10");
          }
        },
        note: "Should rarely trigger",
      },
    ],
    callbacks: {
      onRejected: () => {
        rejectionCount++;
      },
      onAllowed: () => {
        allowedCount++;
      },
    },
  });

  // Count events from riskSubject
  listenRisk(() => {
    eventCount++;
  });

  addStrategySchema({
    strategyName: "test-strategy-no-spam",
    interval: "1m",
    riskName: "no-spam-risk",
    getSignal: async () => {
      return {
        position: "long",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-no-spam",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-no-spam",
    exchangeName: "binance-integration-no-spam",
    frameName: "3d-no-spam",
  });

  await awaitSubject.toPromise();

  // With max 10 positions, most signals should be allowed (not rejected)
  // Events should ONLY be emitted for rejections
  if (allowedCount > 0 && eventCount === rejectionCount && eventCount < allowedCount) {
    pass(`Anti-spam works: ${allowedCount} allowed, ${rejectionCount} rejected, ${eventCount} events (only rejections)`);
    return;
  }

  fail(`Allowed: ${allowedCount}, Rejected: ${rejectionCount}, Events: ${eventCount} (should match rejections only)`);

});

test("Multiple rejection tracking with bySymbol and byStrategy statistics", async ({ pass, fail }) => {

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
    exchangeName: "binance-integration-multi-stats",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "shared-limit-stats",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 2) {
            throw new Error("Shared limit");
          }
        },
        note: "Shared portfolio limit",
      },
    ],
  });

  // Strategy 1 - will open position
  addStrategySchema({
    strategyName: "test-strategy-stats-1",
    interval: "1m",
    riskName: "shared-limit-stats",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,
        priceStopLoss: price * 0.1,
        minuteEstimatedTime: 100000,
      };
    },
  });

  // Strategy 2 - will be rejected
  addStrategySchema({
    strategyName: "test-strategy-stats-2",
    interval: "1m",
    riskName: "shared-limit-stats",
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "short",
        priceOpen: price,
        priceTakeProfit: price * 0.1,
        priceStopLoss: price * 10,
        minuteEstimatedTime: 100000,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-multi-stats",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestCount = 0;
  listenDoneBacktest(() => {
    backtestCount++;
    if (backtestCount === 4) {
      awaitSubject.next();
    }
  });

  // Run multiple symbol-strategy combinations
  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-stats-1",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-stats-1",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-stats-2",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-stats-2",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  });

  await awaitSubject.toPromise();
  // await sleep(2000);

  // Check stats for all symbol-strategy pairs
  const statsBTC1 = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-stats-1",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  }, true);
  const statsBTC2 = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-stats-2",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  }, true);
  const statsETH1 = await Risk.getData("ETHUSDT", {
    strategyName: "test-strategy-stats-1",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  }, true);
  const statsETH2 = await Risk.getData("ETHUSDT", {
    strategyName: "test-strategy-stats-2",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  }, true);

  // At least 2 out of 4 should have rejections (due to limit of 2)
  const allStats = [statsBTC1, statsBTC2, statsETH1, statsETH2];
  const pairsWithRejections = allStats.filter(s => s.totalRejections > 0);

  // Verify bySymbol and byStrategy are tracked correctly for rejected pairs
  let hasValidBySymbol = false;
  let hasValidByStrategy = false;

  for (const stats of pairsWithRejections) {
    // Check if bySymbol contains either BTCUSDT or ETHUSDT
    if (stats.bySymbol["BTCUSDT"] > 0 || stats.bySymbol["ETHUSDT"] > 0) {
      hasValidBySymbol = true;
    }
    // Check if byStrategy contains either strategy name
    if (stats.byStrategy["test-strategy-stats-1"] > 0 || stats.byStrategy["test-strategy-stats-2"] > 0) {
      hasValidByStrategy = true;
    }
  }

  if (pairsWithRejections.length >= 2 && hasValidBySymbol && hasValidByStrategy) {
    pass(`Multiple rejection tracking works: ${pairsWithRejections.length} pairs had rejections with valid bySymbol and byStrategy aggregation`);
    return;
  }

  fail(`Statistics aggregation incomplete: only ${pairsWithRejections.length} pairs had rejections, bySymbol=${hasValidBySymbol}, byStrategy=${hasValidByStrategy}`);

});

test("Strategy with riskList combines multiple risk profiles (AND logic)", async ({ pass, fail }) => {

  let risk1Checked = 0;
  let risk2Checked = 0;
  let totalRejections = 0;
  let totalAllowed = 0;

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
    exchangeName: "binance-integration-risk-list",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  // Risk 1 - allows max 5 positions
  addRiskSchema({
    riskName: "max-5-positions",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          risk1Checked++;
          if (activePositionCount >= 5) {
            throw new Error("Max 5 positions");
          }
        },
        note: "Risk 1: Max 5 positions",
      },
    ],
  });

  // Risk 2 - blocks BTC trading
  addRiskSchema({
    riskName: "no-btc-trading",
    validations: [
      {
        validate: ({ symbol }) => {
          risk2Checked++;
          if (symbol === "BTCUSDT") {
            throw new Error("BTC trading not allowed");
          }
        },
        note: "Risk 2: No BTC",
      },
    ],
    callbacks: {
      onRejected: () => {
        totalRejections++;
      },
      onAllowed: () => {
        totalAllowed++;
      },
    },
  });

  // Strategy with riskList (both risks must pass)
  addStrategySchema({
    strategyName: "test-strategy-risk-list",
    interval: "1m",
    riskList: ["max-5-positions", "no-btc-trading"],
    getSignal: async () => {
      return {
        position: "long",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-risk-list",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestCount = 0;
  listenDoneBacktest(() => {
    backtestCount++;
    if (backtestCount === 2) {
      awaitSubject.next();
    }
  });

  let btcOpenedCount = 0;
  let ethOpenedCount = 0;
  listenSignalBacktest((result) => {
    if (result.symbol === "BTCUSDT" && result.action === "opened") {
      btcOpenedCount++;
    }
    if (result.symbol === "ETHUSDT" && result.action === "opened") {
      ethOpenedCount++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-risk-list",
    exchangeName: "binance-integration-risk-list",
    frameName: "1d-risk-list",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-risk-list",
    exchangeName: "binance-integration-risk-list",
    frameName: "1d-risk-list",
  });

  await awaitSubject.toPromise();

  // BTC should be rejected by risk2, ETH should pass both risks
  if (btcOpenedCount === 0 && ethOpenedCount > 0 && risk1Checked > 0 && risk2Checked > 0 && totalRejections > 0) {
    pass(`riskList combines risks with AND logic: BTC rejected (${totalRejections} rejections), ETH allowed (${ethOpenedCount} opened)`);
    return;
  }

  fail(`BTC opened: ${btcOpenedCount}, ETH opened: ${ethOpenedCount}, risk1: ${risk1Checked}, risk2: ${risk2Checked}, rejections: ${totalRejections}`);

});

test("Strategy with both riskName and riskList merges all risks", async ({ pass, fail }) => {

  let mainRiskChecked = 0;
  let listRisk1Checked = 0;
  let listRisk2Checked = 0;

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
    exchangeName: "binance-integration-risk-merge",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  // Main risk
  addRiskSchema({
    riskName: "main-risk",
    validations: [
      ({ activePositionCount }) => {
        mainRiskChecked++;
        if (activePositionCount >= 10) {
          throw new Error("Main risk: Max 10");
        }
      },
    ],
  });

  // Additional risk 1
  addRiskSchema({
    riskName: "additional-risk-1",
    validations: [
      ({ symbol }) => {
        listRisk1Checked++;
        if (symbol === "XRPUSDT") {
          throw new Error("XRP not allowed");
        }
      },
    ],
  });

  // Additional risk 2
  addRiskSchema({
    riskName: "additional-risk-2",
    validations: [
      ({ currentPrice }) => {
        listRisk2Checked++;
        if (currentPrice < 30000) {
          throw new Error("Price too low");
        }
      },
    ],
  });

  // Strategy with both riskName and riskList
  addStrategySchema({
    strategyName: "test-strategy-merged-risks",
    interval: "1m",
    riskName: "main-risk",
    riskList: ["additional-risk-1", "additional-risk-2"],
    getSignal: async () => {
      return {
        position: "long",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-merged-risks",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-merged-risks",
    exchangeName: "binance-integration-risk-merge",
    frameName: "1d-merged-risks",
  });

  await awaitSubject.toPromise();

  // All three risks should be checked
  if (mainRiskChecked > 0 && listRisk1Checked > 0 && listRisk2Checked > 0) {
    pass(`All risks checked: main=${mainRiskChecked}, list1=${listRisk1Checked}, list2=${listRisk2Checked}`);
    return;
  }

  fail(`Risk checks incomplete: main=${mainRiskChecked}, list1=${listRisk1Checked}, list2=${listRisk2Checked}`);

});

test("riskList with multiple validations - first rejection stops execution", async ({ pass, fail }) => {

  let risk1ValidationOrder = [];
  let risk2ValidationOrder = [];

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
    exchangeName: "binance-integration-risk-list-order",
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  // Risk 1 - will pass
  addRiskSchema({
    riskName: "risk-order-1",
    validations: [
      () => {
        risk1ValidationOrder.push("check1");
      },
      () => {
        risk1ValidationOrder.push("check2");
      },
    ],
  });

  // Risk 2 - will fail on second check
  addRiskSchema({
    riskName: "risk-order-2",
    validations: [
      () => {
        risk2ValidationOrder.push("check1");
      },
      () => {
        risk2ValidationOrder.push("check2");
        throw new Error("Risk 2 fails here");
      },
      () => {
        risk2ValidationOrder.push("check3"); // Should not be called
      },
    ],
  });

  addStrategySchema({
    strategyName: "test-strategy-risk-order",
    interval: "1m",
    riskList: ["risk-order-1", "risk-order-2"],
    getSignal: async () => {
      return {
        position: "long",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-risk-order",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-risk-order",
    exchangeName: "binance-integration-risk-list-order",
    frameName: "1d-risk-order",
  });

  await awaitSubject.toPromise();

  // Risk 1 should complete all checks, Risk 2 should stop at check2
  const risk1Complete = risk1ValidationOrder.length >= 2 && risk1ValidationOrder.includes("check2");
  const risk2Stopped = risk2ValidationOrder.includes("check2") && !risk2ValidationOrder.includes("check3");

  if (risk1Complete && risk2Stopped) {
    pass("Validation execution order correct: risk1 completes, risk2 stops on failure");
    return;
  }

  fail(`Risk1: ${JSON.stringify(risk1ValidationOrder)}, Risk2: ${JSON.stringify(risk2ValidationOrder)}`);

});

test("riskList with shared position counting across multiple risks", async ({ pass, fail }) => {

  let risk1ActiveCount = [];
  let risk2ActiveCount = [];

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
    exchangeName: "binance-integration-risk-list-shared",
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
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  // Both risks track the same activePositionCount
  addRiskSchema({
    riskName: "shared-count-1",
    validations: [
      ({ activePositionCount }) => {
        risk1ActiveCount.push(activePositionCount);
        if (activePositionCount >= 3) {
          throw new Error("Shared risk 1: Max 3");
        }
      },
    ],
  });

  addRiskSchema({
    riskName: "shared-count-2",
    validations: [
      ({ activePositionCount }) => {
        risk2ActiveCount.push(activePositionCount);
        if (activePositionCount >= 3) {
          throw new Error("Shared risk 2: Max 3");
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: "test-strategy-shared-count-1",
    interval: "1m",
    riskList: ["shared-count-1", "shared-count-2"],
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,
        priceStopLoss: price * 0.1,
        minuteEstimatedTime: 100000,
      };
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-shared-count-2",
    interval: "1m",
    riskList: ["shared-count-1", "shared-count-2"],
    getSignal: async () => {
      const price = await getAveragePrice();
      return {
        position: "short",
        priceOpen: price,
        priceTakeProfit: price * 0.1,
        priceStopLoss: price * 10,
        minuteEstimatedTime: 100000,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-shared-count",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestCount = 0;
  listenDoneBacktest(() => {
    backtestCount++;
    if (backtestCount === 2) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-shared-count-1",
    exchangeName: "binance-integration-risk-list-shared",
    frameName: "3d-shared-count",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-shared-count-2",
    exchangeName: "binance-integration-risk-list-shared",
    frameName: "3d-shared-count",
  });

  await awaitSubject.toPromise();

  // Both risks should see the same activePositionCount values
  const risk1HasCounts = risk1ActiveCount.length > 0;
  const risk2HasCounts = risk2ActiveCount.length > 0;
  const bothSeeSameCounts = risk1ActiveCount.some(c => risk2ActiveCount.includes(c));

  if (risk1HasCounts && risk2HasCounts && bothSeeSameCounts) {
    pass(`Both risks share position counting: risk1 saw ${risk1ActiveCount.length} checks, risk2 saw ${risk2ActiveCount.length} checks`);
    return;
  }

  fail(`Risk1 counts: ${JSON.stringify(risk1ActiveCount)}, Risk2 counts: ${JSON.stringify(risk2ActiveCount)}`);

});

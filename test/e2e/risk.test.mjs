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

test("Risk validation payload carries finite pnl for market signal without priceOpen", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  addExchangeSchema({
    exchangeName: "binance-integration-risk-pnl-nan",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({
          timestamp: alignedSince + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  // A market signal (no priceOpen in the DTO) is risk-checked BEFORE the row is
  // built, so TO_RISK_SIGNAL must apply the currentPrice fallback before
  // computing pnl — otherwise validations receive pnlPercentage=NaN and every
  // numeric comparison silently passes.
  let observedPnl;
  let observedPnlPriceOpen;

  addRiskSchema({
    riskName: "risk-pnl-nan-check",
    validations: [
      ({ currentSignal }) => {
        observedPnl = currentSignal.pnl?.pnlPercentage;
        observedPnlPriceOpen = currentSignal.pnl?.priceOpen;
      },
    ],
  });

  addStrategySchema({
    strategyName: "test-strategy-risk-pnl-nan",
    interval: "1m",
    riskName: "risk-pnl-nan-check",
    getSignal: async () => {
      return {
        position: "long",
        note: "market signal without priceOpen",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "2h-risk-pnl-nan",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-risk-pnl-nan",
    exchangeName: "binance-integration-risk-pnl-nan",
    frameName: "2h-risk-pnl-nan",
  });

  await awaitSubject.toPromise();

  if (observedPnl === undefined) {
    fail("risk validation was never called");
    return;
  }

  if (!Number.isFinite(observedPnl) || !Number.isFinite(observedPnlPriceOpen)) {
    fail(`pnl is not finite: pnlPercentage=${observedPnl}, pnl.priceOpen=${observedPnlPriceOpen}`);
    return;
  }

  pass(`pnl is finite for market signal: pnlPercentage=${observedPnl}, pnl.priceOpen=${observedPnlPriceOpen}`);
});

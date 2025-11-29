import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  addRisk,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { sleep, Subject } from "functools-kit";

test("Risk rejects signals based on custom symbol filter", async ({ pass, fail }) => {

  let btcRejected = false;
  let ethAllowed = false;

  addExchange({
    exchangeName: "binance-integration-symbol-filter",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRisk({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-integration-price-filter",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRisk({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-integration-shared-risk",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRisk({
    riskName: "shared-max-1",
    validations: [
      ({ activePositionCount }) => {
        if (activePositionCount >= 1) {
          throw new Error("Maximum 1 concurrent position across all strategies");
        }
      },
    ],
  });

  addStrategy({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-integration-active-positions",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRisk({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-integration-timestamp-filter",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  // Only allow trading after January 2nd
  const cutoffTime = new Date("2024-01-02T00:00:00Z").getTime();

  addRisk({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-integration-zero-positions",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRisk({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-integration-metadata",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRisk({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-integration-fail-fast",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addRisk({
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

  addStrategy({
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

  addFrame({
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

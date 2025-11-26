import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  addRisk,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { Subject } from "functools-kit";

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

  let totalRejected = 0;
  let totalAllowed = 0;

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
    callbacks: {
      onRejected: () => {
        totalRejected++;
      },
      onAllowed: () => {
        totalAllowed++;
      },
    },
  });

  addStrategy({
    strategyName: "shared-strategy-1",
    interval: "1m",
    riskName: "shared-max-1",
    getSignal: async () => {
      return {
        position: "long",
        note: "shared risk test 1",
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 200,
      };
    },
  });

  addStrategy({
    strategyName: "shared-strategy-2",
    interval: "1m",
    riskName: "shared-max-1",
    getSignal: async () => {
      return {
        position: "short",
        note: "shared risk test 2",
        priceTakeProfit: 41000,
        priceStopLoss: 43000,
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

  const awaitSubject1 = new Subject();
  const awaitSubject2 = new Subject();

  let backtestDoneCount = 0;
  listenDoneBacktest(() => {
    backtestDoneCount++;
    if (backtestDoneCount === 1) {
      awaitSubject1.next();
    } else if (backtestDoneCount === 2) {
      awaitSubject2.next();
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

  await Promise.all([awaitSubject1.toPromise(), awaitSubject2.toPromise()]);

  if (totalAllowed >= 1 && totalRejected > 0) {
    pass(`Shared risk profile limited strategies: ${totalAllowed} allowed, ${totalRejected} rejected`);
    return;
  }

  fail(`Expected >=1 allowed and >0 rejected, got ${totalAllowed} allowed, ${totalRejected} rejected`);

});

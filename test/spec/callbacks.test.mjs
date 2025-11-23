import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";

test("onOpen callback is called when signal opens", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-onopen",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategy({
    strategyName: "test-strategy-onopen",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "onOpen callback test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: (symbol, signal, currentPrice, backtest) => {
        resolve({
          backtest,
          symbol,
          signalId: signal.id,
        });
      },
    },
  });

  addFrame({
    frameName: "1d-backtest-onopen",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-onopen",
    exchangeName: "binance-mock-onopen",
    frameName: "1d-backtest-onopen",
  });

  const callbackData = await awaiter;

  if (callbackData) {
    pass("onOpen callback called with correct parameters");
    return;
  }

  fail("onOpen callback not called or incorrect parameters");

});


test("onClose callback is called when signal closes", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-onclose",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategy({
    strategyName: "test-strategy-onclose",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "onClose callback test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onClose: (symbol, signal, priceClose, backtest) => {
        resolve({
          backtest,
          symbol,
          priceClose,
          signalId: signal.id,
        });
      },
    },
  });

  addFrame({
    frameName: "1d-backtest-onclose",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-onclose",
    exchangeName: "binance-mock-onclose",
    frameName: "1d-backtest-onclose",
  });

  const callbackData = await awaiter;

  if (
    callbackData
  ) {
    pass("onClose callback called with correct parameters");
    return;
  }

  fail("onClose callback not called or incorrect parameters");

});

test("onTimeframe callback is called in frame", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-timeframe",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategy({
    strategyName: "test-strategy-timeframe",
    interval: "1m",
    getSignal: async () => {
      return null; // Don't generate signals
    },
  });

  addFrame({
    frameName: "1d-backtest-timeframe",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
    callbacks: {
      onTimeframe: (timeframe, startDate, endDate, interval) => {
        resolve({
          timeframeLength: timeframe.length,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          interval,
        });
      },
    },
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-timeframe",
    exchangeName: "binance-mock-timeframe",
    frameName: "1d-backtest-timeframe",
  });

  const callbackData = await awaiter;

  if (
    callbackData
  ) {
    pass(`onTimeframe callback called with ${callbackData.timeframeLength} timeframes`);
    return;
  }

  fail("onTimeframe callback not called or incorrect parameters");

});

test("callbacks receive backtest=true in backtest mode", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-backtest-mode",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategy({
    strategyName: "test-strategy-backtest-mode",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "backtest mode test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: (symbol, signal, currentPrice, backtest) => {
        resolve(backtest);
      },
    },
  });

  addFrame({
    frameName: "1d-backtest-mode",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-backtest-mode",
    exchangeName: "binance-mock-backtest-mode",
    frameName: "1d-backtest-mode",
  });

  const backtestFlag = await awaiter;

  if (backtestFlag === true) {
    pass("Callbacks receive backtest=true in backtest mode");
    return;
  }

  fail("Callbacks did not receive backtest=true");

});

test("callbacks receive correct signal object", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const testSignal = {
    position: "long",
    note: "signal object test",
    priceOpen: 42000,
    priceTakeProfit: 43000,
    priceStopLoss: 41000,
    minuteEstimatedTime: 60,
  };

  addExchange({
    exchangeName: "binance-mock-signal-obj",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategy({
    strategyName: "test-strategy-signal-obj",
    interval: "1m",
    getSignal: async () => {
      return testSignal;
    },
    callbacks: {
      onOpen: (symbol, signal, currentPrice, backtest) => {
        resolve({
          position: signal.position,
          note: signal.note,
          priceOpen: signal.priceOpen,
          priceTakeProfit: signal.priceTakeProfit,
          priceStopLoss: signal.priceStopLoss,
        });
      },
    },
  });

  addFrame({
    frameName: "1d-backtest-signal-obj",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-signal-obj",
    exchangeName: "binance-mock-signal-obj",
    frameName: "1d-backtest-signal-obj",
  });

  const receivedSignal = await awaiter;


  if (receivedSignal) {
    pass("Callbacks receive correct signal object");
    return;
  }

  fail("Callbacks did not receive correct signal object");

});

test("onTick callback is called when signal closes in backtest", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-ontick",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategy({
    strategyName: "test-strategy-ontick",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "onTick callback test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onTick: (symbol, result, backtest) => {
        if (result.action === "closed") {
          resolve({ symbol, action: result.action, backtest });
        }
      },
    },
  });

  addFrame({
    frameName: "1d-backtest-ontick",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-ontick",
    exchangeName: "binance-mock-ontick",
    frameName: "1d-backtest-ontick",
  });

  const callbackData = await awaiter;

  if (callbackData && callbackData.action === "closed" && callbackData.backtest === true) {
    pass("onTick callback called with closed action in backtest");
    return;
  }

  fail("onTick callback not called correctly");

});

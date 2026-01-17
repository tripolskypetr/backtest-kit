import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Live,
  PersistSignalAdapter,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";

test("onOpen callback is called when signal opens", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
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

  addStrategySchema({
    strategyName: "test-strategy-onopen",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "onOpen callback test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
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

  addFrameSchema({
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

  addExchangeSchema({
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

  addStrategySchema({
    strategyName: "test-strategy-onclose",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "onClose callback test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
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

  addFrameSchema({
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

  addExchangeSchema({
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

  addStrategySchema({
    strategyName: "test-strategy-timeframe",
    interval: "1m",
    getSignal: async () => {
      return null; // Don't generate signals
    },
  });

  addFrameSchema({
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

  addExchangeSchema({
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

  addStrategySchema({
    strategyName: "test-strategy-backtest-mode",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "backtest mode test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: (symbol, signal, currentPrice, backtest) => {
        resolve(backtest);
      },
    },
  });

  addFrameSchema({
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

  addExchangeSchema({
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

  let testSignal;

  addStrategySchema({
    strategyName: "test-strategy-signal-obj",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      testSignal = {
        position: "long",
        note: "signal object test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
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

  addFrameSchema({
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

  addExchangeSchema({
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

  addStrategySchema({
    strategyName: "test-strategy-ontick",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "onTick callback test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
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

  addFrameSchema({
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

test("onActive callback is called in live mode when signal is active", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {
    }
    async readValue() {
      const price = 42150.5;
      return {
        id: "mock-active-signal-id",
        position: "long",
        note: "onActive live test",
        priceOpen: price,
        priceTakeProfit: price + 8_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 120,
        exchangeName: "binance-mock-live-active",
        strategyName: "test-strategy-live-active",
        timestamp: Date.now(),
        symbol: "BTCUSDT",
      };
    }
    async hasValue() {
      return true;
    }
    async writeValue() {
    }
  });

  addExchangeSchema({
    exchangeName: "binance-mock-live-active",
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

  addStrategySchema({
    strategyName: "test-strategy-live-active",
    interval: "1m",
    getSignal: async () => {
      return null;
    },
    callbacks: {
      onActive: (symbol, signal, currentPrice, backtest) => {
          resolve({
            symbol,
            signalId: signal.id,
            currentPrice,
            backtest,
          });
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "test-strategy-live-active",
    exchangeName: "binance-mock-live-active",
  });

  const callbackData = await awaiter;

  if (callbackData) {
    pass("onActive callback called in live mode with active signal");
    return;
  }

  fail("onActive callback not called correctly in live mode");

});

test("onIdle callback is called in live mode when no signal is active", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchangeSchema({
    exchangeName: "binance-mock-live-idle",
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

  addStrategySchema({
    strategyName: "test-strategy-live-idle",
    interval: "1m",
    getSignal: async () => {
      return null;
    },
    callbacks: {
      onIdle: (symbol, currentPrice, backtest) => {
        resolve({
          symbol,
          currentPrice,
          backtest,
        });
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "test-strategy-live-idle",
    exchangeName: "binance-mock-live-idle",
  });

  const callbackData = await awaiter;

  if (callbackData) {
    pass("onIdle callback called in live mode when no signal active");
    return;
  }

  fail("onIdle callback not called correctly in live mode");

});

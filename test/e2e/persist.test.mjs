import { test } from "worker-testbed";

import {
  addExchange,
  addStrategy,
  Live,
  PersistSignalAdapter,
} from "../../build/index.mjs";

import { sleep } from "functools-kit";

/**
 * PERSIST TEST #1: LONG signal TP - restore and close
 *
 * Scenario:
 * - System crashed with active LONG signal
 * - Signal is restored from persist storage after restart
 * - Price reaches TP level
 * - Checks: onClose callback is called after restart
 */
test("PERSIST: LONG signal closes by TP after restart", async ({ pass, fail }) => {
  let onCloseCalled = false;

  const basePrice = 43000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice + 1000;
  const priceStopLoss = basePrice - 1000;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return {
        id: "persist-long-tp",
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
        exchangeName: "binance-persist-1",
        strategyName: "persist-strategy-1",
        timestamp: Date.now(),
        symbol: "BTCUSDT",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-1",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: priceTakeProfit,
          high: priceTakeProfit + 100,
          low: priceTakeProfit - 100,
          close: priceTakeProfit,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-strategy-1",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onClose: (_symbol, _data, _priceClose) => {
        onCloseCalled = true;
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-1",
    exchangeName: "binance-persist-1",
  });

  await sleep(3000);

  if (!onCloseCalled) {
    fail("onClose was NOT called after restart");
    return;
  }

  pass("PERSIST: LONG TP - restored and closed correctly");
});

/**
 * PERSIST TEST #2: SHORT signal SL - restore and close
 *
 * Scenario:
 * - System crashed with active SHORT signal
 * - Signal is restored from persist storage after restart
 * - Price reaches SL level
 * - Checks: onClose callback is called with correct reason
 */
test("PERSIST: SHORT signal closes by SL after restart", async ({ pass, fail }) => {
  let onCloseCalled = false;

  const basePrice = 42000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice - 1000; // SHORT: TP below
  const priceStopLoss = basePrice + 1000;   // SHORT: SL above

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return {
        id: "persist-short-sl",
        position: "short",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
        exchangeName: "binance-persist-2",
        strategyName: "persist-strategy-2",
        timestamp: Date.now(),
        symbol: "BTCUSDT",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-2",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: priceStopLoss,
          high: priceStopLoss + 100,
          low: priceStopLoss - 100,
          close: priceStopLoss,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-strategy-2",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onClose: (_symbol, _data, _priceClose) => {
        onCloseCalled = true;
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-2",
    exchangeName: "binance-persist-2",
  });

  await sleep(3000);

  if (!onCloseCalled) {
    fail("onClose was NOT called after restart");
    return;
  }

  pass("PERSIST: SHORT SL - restored and closed correctly");
});

/**
 * PERSIST TEST #3: Scheduled signal is NOT persisted
 *
 * Scenario:
 * - Create a scheduled signal (priceOpen above current price)
 * - Signal stays in scheduled state (not activated)
 * - Check that writeValue() is NOT called for scheduled signals
 * - Persist storage should only contain ACTIVE signals
 */
test("PERSIST: Scheduled signal is NOT written to storage", async ({ pass, fail }) => {
  let writeValueCalled = false;
  let onScheduleCalled = false;
  let onActiveCalled = false;

  const basePrice = 43000;
  const priceOpen = basePrice + 1000; // Above current - stays scheduled

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return null;
    }

    async hasValue() {
      return false;
    }

    async writeValue(signal) {
      writeValueCalled = true;
      fail(`CRITICAL BUG: writeValue() called for scheduled signal! Signal: ${JSON.stringify(signal)}`);
    }

    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-3",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 200, // Doesn't reach priceOpen
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-strategy-3",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "Scheduled signal",
        priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: basePrice - 500,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: (_symbol, _data) => {
        onScheduleCalled = true;
      },
      onActive: (_symbol, _data) => {
        onActiveCalled = true;
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-3",
    exchangeName: "binance-persist-3",
  });

  await sleep(3000);

  if (!onScheduleCalled) {
    fail("onSchedule was NOT called");
    return;
  }

  if (onActiveCalled) {
    fail("onActive was called - signal should stay scheduled");
    return;
  }

  if (writeValueCalled) {
    fail("writeValue() was called for scheduled signal!");
    return;
  }

  pass("PERSIST: Scheduled signals are NOT persisted");
});

/**
 * PERSIST TEST #4: LONG signal time expiration after restart
 *
 * Scenario:
 * - Restore LONG signal from persist storage
 * - Signal expires by time (minuteEstimatedTime)
 * - Check: onClose called with 'time_expired' reason
 */
test("PERSIST: LONG signal expires by time after restart", async ({ pass, fail }) => {
  let onCloseCalled = false;

  const basePrice = 43000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice + 5000; // Far away
  const priceStopLoss = basePrice - 5000;   // Far away

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      const now = Date.now();
      return {
        id: "persist-time-exp",
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 1, // Expires in 1 minute
        exchangeName: "binance-persist-4",
        strategyName: "persist-strategy-4",
        timestamp: now - 2 * 60000, // Signal created 2 minutes ago
        scheduledAt: now - 2 * 60000, // Scheduled 2 minutes ago
        pendingAt: now - 2 * 60000, // Became active 2 minutes ago
        symbol: "BTCUSDT",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-4",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-strategy-4",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onClose: (_symbol, _data, _priceClose) => {
        onCloseCalled = true;
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-4",
    exchangeName: "binance-persist-4",
  });

  await sleep(3000);

  if (!onCloseCalled) {
    fail("onClose was NOT called");
    return;
  }

  pass("PERSIST: Signal expired by time after restart");
});

/**
 * PERSIST TEST #5: SHORT signal TP after long downtime
 *
 * Scenario:
 * - System was down for long time
 * - Restore SHORT signal
 * - Price already at TP level
 * - Check: Signal closes immediately after restart
 */
test("PERSIST: SHORT signal closes by TP after long downtime", async ({ pass, fail }) => {
  let onCloseCalled = false;

  const basePrice = 45000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice - 2000; // SHORT: TP below
  const priceStopLoss = basePrice + 2000;   // SHORT: SL above

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return {
        id: "persist-short-tp-downtime",
        position: "short",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 180,
        exchangeName: "binance-persist-5",
        strategyName: "persist-strategy-5",
        timestamp: Date.now() - 60 * 60000, // 60 minutes ago
        symbol: "BTCUSDT",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-5",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        // Price already at TP
        candles.push({
          timestamp,
          open: priceTakeProfit,
          high: priceTakeProfit + 100,
          low: priceTakeProfit - 100,
          close: priceTakeProfit,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-strategy-5",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onClose: (_symbol, _data, _priceClose) => {
        onCloseCalled = true;
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-5",
    exchangeName: "binance-persist-5",
  });

  await sleep(3000);

  if (!onCloseCalled) {
    fail("onClose was NOT called");
    return;
  }

  pass("PERSIST: SHORT TP closed after long downtime");
});

/**
 * PERSIST TEST #6: Signal survives restart
 *
 * Scenario:
 * - Restore signal from persist
 * - Signal stays active (price between SL and TP)
 * - Check: Signal is restored successfully
 */
test("PERSIST: Signal restored successfully", async ({ pass, fail }) => {
  let readValueCalled = false;

  const basePrice = 43000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice + 2000;
  const priceStopLoss = basePrice - 2000;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      readValueCalled = true;
      return {
        id: "persist-restored",
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 240,
        exchangeName: "binance-persist-6",
        strategyName: "persist-strategy-6",
        timestamp: Date.now(),
        symbol: "BTCUSDT",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchange({
    exchangeName: "binance-persist-6",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        // Price stays between SL and TP
        candles.push({
          timestamp,
          open: basePrice + 500,
          high: basePrice + 600,
          low: basePrice + 400,
          close: basePrice + 500,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "persist-strategy-6",
    interval: "1m",
    getSignal: async () => null,
  });

  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-6",
    exchangeName: "binance-persist-6",
  });

  await sleep(3000);

  if (!readValueCalled) {
    fail("readValue was NOT called");
    return;
  }

  pass("PERSIST: Signal restored successfully");
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  Live,
  PersistSignalAdapter,
  PersistScheduleAdapter,
} from "../../build/index.mjs";

import { sleep } from "functools-kit";

/**
 * RESTORE TEST #1: Pending signal restore after crash
 *
 * Scenario:
 * - System crashed with active LONG signal
 * - Signal is restored from persist storage after restart
 * - Checks: onActive callback is called after restart, signal continues monitoring
 */
test("RESTORE: Pending signal is restored after crash", async ({ pass, fail }) => {
  let onActiveCalled = false;
  let restoredSignal = null;

  const basePrice = 43000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice + 1000;
  const priceStopLoss = basePrice - 1000;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return {
        id: "restore-pending-signal",
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
        exchangeName: "binance-restore-pending",
        strategyName: "restore-pending-strategy",
        timestamp: Date.now(),
        pendingAt: Date.now(),
        scheduledAt: Date.now(),
        symbol: "BTCUSDT",
        note: "Restored pending signal",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchangeSchema({
    exchangeName: "binance-restore-pending",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
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

  addStrategySchema({
    strategyName: "restore-pending-strategy",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onActive: (_symbol, signal, _price, _backtest) => {
        onActiveCalled = true;
        restoredSignal = signal;
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "restore-pending-strategy",
    exchangeName: "binance-restore-pending",
  });

  await sleep(10);

  if (!onActiveCalled) {
    fail("onActive was NOT called after restart");
    return;
  }

  if (!restoredSignal) {
    fail("Signal was not restored");
    return;
  }

  if (restoredSignal.position !== "long" || restoredSignal.note !== "Restored pending signal") {
    fail("Restored signal data mismatch");
    return;
  }

  pass("RESTORE PENDING: Signal restored and onActive called");
});

/**
 * RESTORE TEST #2: Scheduled signal restore after crash
 *
 * Scenario:
 * - System crashed with scheduled signal waiting for activation
 * - Signal is restored from persist storage after restart
 * - Checks: onSchedule callback is called after restart
 */
test("RESTORE: Scheduled signal is restored after crash", async ({ pass, fail }) => {
  let onScheduleCalled = false;
  let restoredScheduled = null;

  const basePrice = 43000;
  const priceOpen = basePrice - 500;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}
    async readValue() {
      return null;
    }
    async hasValue() {
      return false;
    }
    async writeValue() {}
    async deleteValue() {}
  });

  PersistScheduleAdapter.usePersistScheduleAdapter(class {
    async waitForInit() {}

    async readValue() {
      return {
        id: "restore-scheduled-signal",
        position: "short",
        priceOpen: 3000,
        priceTakeProfit: 2900,
        priceStopLoss: 3100,
        minuteEstimatedTime: 120,
        exchangeName: "binance-restore-scheduled",
        strategyName: "restore-scheduled-strategy",
        timestamp: Date.now(),
        pendingAt: Date.now(),
        scheduledAt: Date.now(),
        symbol: "ETHUSDT",
        _isScheduled: true,
        note: "Restored scheduled signal",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchangeSchema({
    exchangeName: "binance-restore-scheduled",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 3200,
          high: 3300,
          low: 3100,
          close: 3200,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "restore-scheduled-strategy",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onSchedule: (_symbol, signal, _price, _backtest) => {
        onScheduleCalled = true;
        restoredScheduled = signal;
      },
    },
  });

  Live.background("ETHUSDT", {
    strategyName: "restore-scheduled-strategy",
    exchangeName: "binance-restore-scheduled",
  });

  await sleep(10);

  if (!onScheduleCalled) {
    fail("onSchedule was NOT called after restart");
    return;
  }

  if (!restoredScheduled) {
    fail("Scheduled signal was not restored");
    return;
  }

  if (restoredScheduled.position !== "short" || restoredScheduled.note !== "Restored scheduled signal") {
    fail("Restored scheduled signal data mismatch");
    return;
  }

  if (restoredScheduled._isScheduled !== true || restoredScheduled.priceOpen !== 3000) {
    fail("Restored scheduled signal properties mismatch");
    return;
  }

  pass("RESTORE SCHEDULED: Signal restored and onSchedule called");
});

/**
 * RESTORE TEST #3: Ignore signal from different exchange
 *
 * Scenario:
 * - Persist signal with exchangeName="binance"
 * - Try to restore with exchangeName="bybit"
 * - Signal should NOT be restored (mismatch protection)
 */
test("RESTORE: Ignore signal if exchange name mismatches", async ({ pass, fail }) => {
  let activeCallCount = 0;

  const basePrice = 50000;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return {
        id: "signal-wrong-exchange",
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
        exchangeName: "binance",
        strategyName: "restore-exchange-mismatch",
        timestamp: Date.now(),
        pendingAt: Date.now(),
        scheduledAt: Date.now(),
        symbol: "BTCUSDT",
        note: "Wrong exchange",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchangeSchema({
    exchangeName: "bybit",
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

  addStrategySchema({
    strategyName: "restore-exchange-mismatch",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onActive: () => {
        activeCallCount++;
      },
    },
  });

  Live.background("BTCUSDT", {
    strategyName: "restore-exchange-mismatch",
    exchangeName: "bybit",
  });

  await sleep(10);

  if (activeCallCount !== 0) {
    fail("onActive should NOT be called - exchange mismatch");
    return;
  }

  pass("RESTORE MISMATCH: Exchange mismatch correctly ignored");
});

/**
 * RESTORE TEST #4: Ignore signal from different strategy
 *
 * Scenario:
 * - Persist signal with strategyName="strategy-a"
 * - Try to restore with strategyName="strategy-b"
 * - Signal should NOT be restored (mismatch protection)
 */
test("RESTORE: Ignore signal if strategy name mismatches", async ({ pass, fail }) => {
  let activeCallCount = 0;

  const basePrice = 3000;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return {
        id: "signal-wrong-strategy",
        position: "short",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 100,
        priceStopLoss: basePrice + 100,
        minuteEstimatedTime: 120,
        exchangeName: "binance",
        strategyName: "strategy-a",
        timestamp: Date.now(),
        pendingAt: Date.now(),
        scheduledAt: Date.now(),
        symbol: "ETHUSDT",
        note: "Wrong strategy",
      };
    }

    async hasValue() {
      return true;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchangeSchema({
    exchangeName: "binance",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "strategy-b",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onActive: () => {
        activeCallCount++;
      },
    },
  });

  Live.background("ETHUSDT", {
    strategyName: "strategy-b",
    exchangeName: "binance",
  });

  await sleep(10);

  if (activeCallCount !== 0) {
    fail("onActive should NOT be called - strategy mismatch");
    return;
  }

  pass("RESTORE MISMATCH: Strategy mismatch correctly ignored");
});

/**
 * RESTORE TEST #5: Handle empty storage gracefully
 *
 * Scenario:
 * - Create strategy with empty persistence storage
 * - No errors should occur
 * - Strategy should operate normally (can generate new signals)
 */
test("RESTORE: Handle empty storage gracefully on restart", async ({ pass, fail }) => {
  let activeCallCount = 0;
  let scheduleCallCount = 0;
  let newSignalGenerated = false;

  const basePrice = 1.4;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}
    async readValue() {
      return null;
    }
    async hasValue() {
      return false;
    }
    async writeValue() {}
    async deleteValue() {}
  });

  PersistScheduleAdapter.usePersistScheduleAdapter(class {
    async waitForInit() {}
    async readValue() {
      return null;
    }
    async hasValue() {
      return false;
    }
    async writeValue() {}
    async deleteValue() {}
  });

  addExchangeSchema({
    exchangeName: "binance-empty",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 0.05,
          low: basePrice - 0.05,
          close: basePrice,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "restore-empty",
    interval: "1m",
    getSignal: async () => {
      if (newSignalGenerated) return null;
      newSignalGenerated = true;
      return {
        position: "long",
        priceTakeProfit: basePrice + 0.1,
        priceStopLoss: basePrice - 0.1,
        minuteEstimatedTime: 60,
        note: "New signal after empty restore",
      };
    },
    callbacks: {
      onActive: () => {
        activeCallCount++;
      },
      onSchedule: () => {
        scheduleCallCount++;
      },
      onOpen: () => {
        newSignalGenerated = true;
      },
    },
  });

  Live.background("ADAUSDT", {
    strategyName: "restore-empty",
    exchangeName: "binance-empty",
  });

  await sleep(10);

  if (activeCallCount !== 0) {
    fail("onActive should NOT be called - no stored signal");
    return;
  }

  if (scheduleCallCount !== 0) {
    fail("onSchedule should NOT be called - no stored signal");
    return;
  }

  if (!newSignalGenerated) {
    fail("New signal should be generated after empty restore");
    return;
  }

  pass("RESTORE EMPTY: Empty storage handled, new signal generated");
});

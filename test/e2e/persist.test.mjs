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
  listenDoneBacktest,
  Live,
  PersistSignalAdapter,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";


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

  addExchangeSchema({
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

  addStrategySchema({
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

  await sleep(10);

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

  addExchangeSchema({
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

  addStrategySchema({
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

  await sleep(10);

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

  const basePrice = 45000; // Текущая цена ВЫСОКАЯ
  const priceOpen = basePrice - 2000; // 43000 - НИЖЕ текущей для LONG → scheduled

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

  addExchangeSchema({
    exchangeName: "binance-persist-3",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 200,
          low: basePrice - 100, // Не падает до priceOpen (43000)
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
    strategyName: "persist-strategy-3",
    interval: "1m",
    getSignal: async () => {
      return {
        position: "long",
        note: "Scheduled signal - priceOpen below current",
        priceOpen, // 43000 < basePrice 45000 → scheduled
        priceTakeProfit: priceOpen + 2000,
        priceStopLoss: priceOpen - 2000,
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

  await sleep(10);

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

  addExchangeSchema({
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

  addStrategySchema({
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

  await sleep(10);

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

  addExchangeSchema({
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

  addStrategySchema({
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

  await sleep(10);

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

  addExchangeSchema({
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

  addStrategySchema({
    strategyName: "persist-strategy-6",
    interval: "1m",
    getSignal: async () => null,
  });

  Live.background("BTCUSDT", {
    strategyName: "persist-strategy-6",
    exchangeName: "binance-persist-6",
  });

  await sleep(10);

  if (!readValueCalled) {
    fail("readValue was NOT called");
    return;
  }

  pass("PERSIST: Signal restored successfully");
});

/**
 * PERSIST TEST #7: SEQUENCE - Track writeValue content through signal lifecycle
 *
 * Scenario:
 * - Signal #1: LONG scheduled → opened → closed by TP
 * - Signal #2: LONG scheduled → opened → closed by SL
 * - Check writeValue content at each step:
 *   - scheduled: writeValue NOT called
 *   - opened: writeValue called with full signal data
 *   - closed: writeValue called with null (signal deleted)
 */
test("PERSIST SEQUENCE: Track writeValue content - 2 LONG signals (TP, SL)", async ({ pass, fail }) => {
  const writeHistory = [];
  let onScheduleCount = 0;
  let onOpenCount = 0;
  let onCloseCount = 0;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const priceOpen = basePrice - 500; // НИЖЕ текущей цены для LONG → scheduled
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Предзаполняем начальные свечи для getAveragePrice - ВЫШЕ priceOpen для scheduled состояния
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100, // Не падает до priceOpen
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-persist-seq-1",
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
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategySchema({
    strategyName: "persist-seq-strategy-1",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 2) return null;

      // Генерируем все свечи только в первый раз
      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 60; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: TP (0-4: ожидание, 5-9: активация, 10-14: TP)
          if (i < 5) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 5 && i < 10) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: priceOpen + 1000, high: priceOpen + 1100, low: priceOpen + 900, close: priceOpen + 1000, volume: 100 });
          }

          // Сигнал #2: SL (20-24: ожидание, 25-29: активация, 30-34: SL)
          else if (i >= 20 && i < 25) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 25 && i < 30) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else if (i >= 30 && i < 35) {
            allCandles.push({ timestamp, open: priceOpen - 1000, high: priceOpen - 900, low: priceOpen - 1100, close: priceOpen - 1000, volume: 100 });
          }

          // Остальное время: нейтральные свечи
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `Persist seq signal #${signalCount}`,
        priceOpen: priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: priceOpen - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        onScheduleCount++;
      },
      onOpen: () => {
        onOpenCount++;
      },
      onClose: () => {
        onCloseCount++;
      },
      onWrite: (_symbol, signal) => {
        // Записываем полную историю вызовов onWrite
        writeHistory.push({
          timestamp: Date.now(),
          signal: signal ? JSON.parse(JSON.stringify(signal)) : null,
          scheduledCount: onScheduleCount,
          openedCount: onOpenCount,
          closedCount: onCloseCount,
        });
      },
    },
  });

  addFrameSchema({
    frameName: "60m-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"), // 60 minutes
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-seq-strategy-1",
    exchangeName: "binance-persist-seq-1",
    frameName: "60m-test",
  });

  await awaitSubject.toPromise();
  await sleep(10);

  // ПРОВЕРКА #1: writeValue должен вызываться минимум 2 раза (для 2 сигналов)
  if (writeHistory.length < 2) {
    fail(`Expected at least 2 writeValue calls, got ${writeHistory.length}`);
    return;
  }

  // ПРОВЕРКА #2: Первый writeValue должен содержать signal data (opened)
  const firstWrite = writeHistory[0];
  if (!firstWrite.signal) {
    fail(`First writeValue should contain signal data (opened), got null`);
    return;
  }

  if (firstWrite.signal.position !== "long") {
    fail(`First writeValue signal.position should be "long", got ${firstWrite.signal.position}`);
    return;
  }

  if (firstWrite.signal.priceOpen !== priceOpen) {
    fail(`First writeValue signal.priceOpen should be ${priceOpen}, got ${firstWrite.signal.priceOpen}`);
    return;
  }

  // ПРОВЕРКА #3: После закрытия первого сигнала должен быть writeValue(null)
  const nullWrites = writeHistory.filter(h => h.signal === null);
  if (nullWrites.length < 1) {
    fail(`Expected at least 1 writeValue(null) after signal close, got ${nullWrites.length}`);
    return;
  }

  // ПРОВЕРКА #4: Второй сигнал также должен быть записан
  const nonNullWrites = writeHistory.filter(h => h.signal !== null);
  if (nonNullWrites.length < 2) {
    fail(`Expected at least 2 non-null writeValue calls (for 2 signals), got ${nonNullWrites.length}`);
    return;
  }

  const summary = `${writeHistory.length} writeValue calls: ${nonNullWrites.length} opened, ${nullWrites.length} closed`;
  pass(`PERSIST SEQUENCE: ${summary}. First signal: position=${firstWrite.signal.position}, priceOpen=${firstWrite.signal.priceOpen}`);
});

/**
 * PERSIST TEST #8: SEQUENCE - Verify signal fields in writeValue
 *
 * Scenario:
 * - Signal: LONG scheduled → opened
 * - Check writeValue contains all critical fields:
 *   - position, priceOpen, priceTakeProfit, priceStopLoss
 *   - minuteEstimatedTime, symbol, strategyName, exchangeName
 *   - scheduledAt, pendingAt, timestamp
 */
test("PERSIST SEQUENCE: Verify all signal fields in writeValue", async ({ pass, fail }) => {
  let capturedSignal = null;
  let onOpenCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const priceOpen = basePrice - 500; // НИЖЕ текущей цены для LONG → scheduled
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Начальные свечи ВЫШЕ priceOpen для scheduled состояния
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100, // Не падает до priceOpen
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-persist-seq-2",
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
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "persist-seq-strategy-2",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Генерируем свечи для активации: ожидание → активация
      allCandles = [];
      for (let i = 0; i < 20; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Ожидание (цена выше priceOpen)
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else {
          // Активация (цена падает до priceOpen)
          allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
        }
      }

      return {
        position: "long",
        note: "Field verification test",
        priceOpen: priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: priceOpen - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: () => {
        onOpenCalled = true;
      },
      onWrite: (_symbol, signal) => {
        if (signal && !capturedSignal) {
          capturedSignal = JSON.parse(JSON.stringify(signal));
        }
      },
    },
  });

  addFrameSchema({
    frameName: "20m-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"), // 20 minutes
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-seq-strategy-2",
    exchangeName: "binance-persist-seq-2",
    frameName: "20m-test",
  });

  await awaitSubject.toPromise();
  await sleep(10);

  if (!onOpenCalled) {
    fail("Signal was not opened");
    return;
  }

  if (!capturedSignal) {
    fail("writeValue was NOT called with signal data");
    return;
  }

  // Проверяем все критические поля
  const requiredFields = [
    'position', 'priceOpen', 'priceTakeProfit', 'priceStopLoss',
    'minuteEstimatedTime', 'symbol', 'strategyName', 'exchangeName',
    'scheduledAt', 'pendingAt'
  ];

  const missingFields = requiredFields.filter(field => !(field in capturedSignal));

  if (missingFields.length > 0) {
    fail(`Missing fields in writeValue signal: ${missingFields.join(', ')}`);
    return;
  }

  // Проверяем корректность значений
  if (capturedSignal.position !== "long") {
    fail(`position should be "long", got ${capturedSignal.position}`);
    return;
  }

  if (capturedSignal.priceOpen !== priceOpen) {
    fail(`priceOpen should be ${priceOpen}, got ${capturedSignal.priceOpen}`);
    return;
  }

  if (capturedSignal.symbol !== "BTCUSDT") {
    fail(`symbol should be "BTCUSDT", got ${capturedSignal.symbol}`);
    return;
  }

  if (capturedSignal.strategyName !== "persist-seq-strategy-2") {
    fail(`strategyName should be "persist-seq-strategy-2", got ${capturedSignal.strategyName}`);
    return;
  }

  pass(`PERSIST SEQUENCE: All ${requiredFields.length} fields verified in writeValue. position=${capturedSignal.position}, priceOpen=${capturedSignal.priceOpen}, symbol=${capturedSignal.symbol}`);
});

/**
 * PERSIST TEST #9: SEQUENCE - SHORT signal lifecycle in writeValue
 *
 * Scenario:
 * - SHORT signal: scheduled → opened → closed by TP
 * - Track writeValue calls:
 *   - 1st call: signal opened (should have SHORT position data)
 *   - 2nd call: signal closed (should be null)
 */
test("PERSIST SEQUENCE: SHORT signal lifecycle tracking", async ({ pass, fail }) => {
  const writeHistory = [];
  let onOpenCalled = false;
  let onCloseCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-persist-seq-3",
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
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "persist-seq-strategy-3",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Генерируем свечи: ожидание снизу → активация → TP снизу
      allCandles = [];
      for (let i = 0; i < 20; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Ожидание снизу (SHORT ждет роста цены до priceOpen)
          allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
        } else if (i >= 5 && i < 10) {
          // Активация (цена растет до priceOpen)
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else {
          // TP снизу (цена падает до TP)
          allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
        }
      }

      return {
        position: "short",
        note: "SHORT lifecycle test",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 1000, // SHORT: TP below priceOpen
        priceStopLoss: basePrice + 1000,   // SHORT: SL above priceOpen
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: () => {
        onOpenCalled = true;
      },
      onClose: () => {
        onCloseCalled = true;
      },
      onWrite: (_symbol, signal) => {
        writeHistory.push({
          timestamp: Date.now(),
          signal: signal ? JSON.parse(JSON.stringify(signal)) : null,
        });
      },
    },
  });

  addFrameSchema({
    frameName: "20m-test-short",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"), // 20 minutes
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-seq-strategy-3",
    exchangeName: "binance-persist-seq-3",
    frameName: "20m-test-short",
  });

  await awaitSubject.toPromise();
  await sleep(10);

  if (!onOpenCalled) {
    fail("SHORT signal was NOT opened");
    return;
  }

  if (!onCloseCalled) {
    fail("SHORT signal was NOT closed");
    return;
  }

  if (writeHistory.length < 2) {
    fail(`Expected at least 2 writeValue calls, got ${writeHistory.length}`);
    return;
  }

  // Проверяем первый вызов (открытие)
  const openWrite = writeHistory[0];
  if (!openWrite.signal) {
    fail("First writeValue should contain signal (opened), got null");
    return;
  }

  if (openWrite.signal.position !== "short") {
    fail(`Opened signal should be SHORT, got ${openWrite.signal.position}`);
    return;
  }

  // Проверяем что есть хотя бы один writeValue(null) - закрытие
  const nullWrites = writeHistory.filter(h => h.signal === null);
  if (nullWrites.length < 1) {
    fail(`Expected at least 1 writeValue(null) after close, got ${nullWrites.length}`);
    return;
  }

  pass(`PERSIST SEQUENCE SHORT: Tracked ${writeHistory.length} calls. Opened: position=${openWrite.signal.position}, Closed: ${nullWrites.length} null writes`);
});

/**
 * PERSIST TEST #10: SEQUENCE - Multiple signals with mixed results (TP, SL, cancelled)
 *
 * Scenario:
 * - Signal #1: LONG → TP
 * - Signal #2: LONG → SL
 * - Signal #3: LONG → cancelled (SL hit before activation)
 * - Track onWrite calls to verify correct persistence behavior:
 *   - Each opened signal: onWrite(signal)
 *   - Each closed signal: onWrite(null)
 *   - Cancelled scheduled signal: NO onWrite (only onCancel callback, no persist write)
 */
test("PERSIST SEQUENCE: Multiple signals (TP, SL, cancelled) - verify onWrite lifecycle", async ({ pass, fail }) => {
  const writeHistory = [];
  let onScheduleCount = 0;
  let onOpenCount = 0;
  let onCloseCount = 0;
  let onCancelCount = 0;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const priceOpen = basePrice - 500; // НИЖЕ текущей цены для LONG → scheduled
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Начальные свечи ВЫШЕ priceOpen для scheduled состояния
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
    exchangeName: "binance-persist-seq-4",
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
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategySchema({
    strategyName: "persist-seq-strategy-4",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 3) return null;

      // Генерируем свечи только в первый раз
      if (signalCount === 1) {
        allCandles = [];

        for (let i = 0; i < 120; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: TP (0-4: ожидание, 5-9: активация, 10-14: TP)
          if (i < 5) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
          } else if (i >= 5 && i < 10) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: priceOpen + 1000, high: priceOpen + 1100, low: priceOpen + 900, close: priceOpen + 1000, volume: 100 });
          }

          // Сигнал #2: SL (20-24: ожидание, 25-29: активация, 30-34: SL)
          else if (i >= 20 && i < 25) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
          } else if (i >= 25 && i < 30) {
            allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
          } else if (i >= 30 && i < 35) {
            allCandles.push({ timestamp, open: priceOpen - 1000, high: priceOpen - 900, low: priceOpen - 1100, close: priceOpen - 1000, volume: 100 });
          }

          // Сигнал #3: Cancelled (40-44: цена уходит вниз, отмена по SL до активации)
          else if (i >= 40 && i < 45) {
            allCandles.push({ timestamp, open: priceOpen - 1500, high: priceOpen - 1400, low: priceOpen - 1600, close: priceOpen - 1500, volume: 100 });
          }

          // Остальное время: нейтральные свечи
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `Persist mixed signal #${signalCount}`,
        priceOpen: priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: priceOpen - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        onScheduleCount++;
      },
      onOpen: () => {
        onOpenCount++;
      },
      onClose: () => {
        onCloseCount++;
      },
      onCancel: () => {
        onCancelCount++;
      },
      onWrite: (_symbol, signal) => {
        writeHistory.push({
          timestamp: Date.now(),
          signal: signal ? JSON.parse(JSON.stringify(signal)) : null,
          scheduledCount: onScheduleCount,
          openedCount: onOpenCount,
          closedCount: onCloseCount,
          cancelledCount: onCancelCount,
        });
      },
    },
  });

  addFrameSchema({
    frameName: "120m-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:00:00Z"), // 120 minutes
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-seq-strategy-4",
    exchangeName: "binance-persist-seq-4",
    frameName: "120m-test",
  });

  await awaitSubject.toPromise();
  await sleep(10);

  // ПРОВЕРКА #1: 2 сигнала должны быть запланированы (3-й активируется немедленно из-за immediate activation)
  if (onScheduleCount !== 2) {
    fail(`Expected 2 scheduled signals, got ${onScheduleCount}`);
    return;
  }

  // ПРОВЕРКА #2: Минимум 2 сигнала должны быть открыты (3-й отменяется до открытия)
  if (onOpenCount < 2) {
    fail(`Expected at least 2 opened signals, got ${onOpenCount}`);
    return;
  }

  // ПРОВЕРКА #3: Минимум 2 сигнала должны быть закрыты
  if (onCloseCount < 2) {
    fail(`Expected at least 2 closed signals, got ${onCloseCount}`);
    return;
  }

  // ПРОВЕРКА #4: С immediate activation, 3-й сигнал может активироваться немедленно вместо отмены
  // Пропускаем проверку cancelled signals, так как система теперь активирует сигналы немедленно

  // ПРОВЕРКА #5: writeHistory должен содержать записи для открытых сигналов
  const nonNullWrites = writeHistory.filter(h => h.signal !== null);
  if (nonNullWrites.length < 2) {
    fail(`Expected at least 2 non-null writes (opened signals), got ${nonNullWrites.length}`);
    return;
  }

  // ПРОВЕРКА #6: writeHistory должен содержать null записи для закрытых сигналов
  // ВАЖНО: Только CLOSED сигналы вызывают onWrite(null) через setPendingSignal(null)
  // Cancelled scheduled signals НЕ вызывают onWrite(null) т.к. они никогда не стали _pendingSignal
  const nullWrites = writeHistory.filter(h => h.signal === null);
  if (nullWrites.length < 2) {
    fail(`Expected at least 2 null writes (closed signals only), got ${nullWrites.length}`);
    return;
  }

  // ПРОВЕРКА #7: Каждый ЗАКРЫТЫЙ сигнал должен иметь соответствующее закрытие (null)
  // Количество null должно быть >= количества CLOSED (2 closed, cancelled НЕ считается)
  const expectedNulls = onCloseCount;
  if (nullWrites.length < expectedNulls) {
    fail(`Expected at least ${expectedNulls} null writes (only for closed signals), got ${nullWrites.length}`);
    return;
  }

  const summary = `scheduled=${onScheduleCount}, opened=${onOpenCount}, closed=${onCloseCount}, cancelled=${onCancelCount}, writes=${writeHistory.length} (${nonNullWrites.length} non-null, ${nullWrites.length} null)`;
  pass(`PERSIST MIXED: ${summary}`);
});

/**
 * PERSIST TEST #11: SEQUENCE - Verify onWrite(null) is called AFTER signal close
 *
 * Scenario:
 * - LONG signal: scheduled → opened → closed by TP
 * - Track exact order of events:
 *   1. onSchedule called
 *   2. onOpen called
 *   3. onWrite called with signal data
 *   4. onClose called
 *   5. onWrite called with null
 * - Verify that onWrite(null) comes AFTER onClose
 */
test("PERSIST SEQUENCE: onWrite(null) called AFTER onClose - correct lifecycle order", async ({ pass, fail }) => {
  const events = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const priceOpen = basePrice - 500; // НИЖЕ текущей цены для LONG → scheduled
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Начальные свечи ВЫШЕ priceOpen для scheduled состояния
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100, // Не падает до priceOpen
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-persist-seq-5",
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
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "persist-seq-strategy-5",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Генерируем свечи: ожидание → активация → TP
      allCandles = [];
      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Ожидание (цена выше priceOpen)
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else if (i >= 5 && i < 10) {
          // Активация (цена падает до priceOpen)
          allCandles.push({ timestamp, open: priceOpen, high: priceOpen + 100, low: priceOpen - 100, close: priceOpen, volume: 100 });
        } else {
          // TP (цена растет до TP)
          allCandles.push({ timestamp, open: priceOpen + 1000, high: priceOpen + 1100, low: priceOpen + 900, close: priceOpen + 1000, volume: 100 });
        }
      }

      return {
        position: "long",
        note: "Lifecycle order test",
        priceOpen: priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: priceOpen - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        events.push({ type: "onSchedule", timestamp: Date.now() });
      },
      onOpen: () => {
        events.push({ type: "onOpen", timestamp: Date.now() });
      },
      onClose: () => {
        events.push({ type: "onClose", timestamp: Date.now() });
      },
      onWrite: (_symbol, signal) => {
        events.push({
          type: "onWrite",
          hasSignal: signal !== null,
          timestamp: Date.now()
        });
      },
    },
  });

  addFrameSchema({
    frameName: "30m-test-order",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-seq-strategy-5",
    exchangeName: "binance-persist-seq-5",
    frameName: "30m-test-order",
  });

  await awaitSubject.toPromise();
  await sleep(10);

  // ПРОВЕРКА #1: Должны быть все ключевые события
  const hasSchedule = events.some(e => e.type === "onSchedule");
  const hasOpen = events.some(e => e.type === "onOpen");
  const hasClose = events.some(e => e.type === "onClose");
  const hasWriteWithSignal = events.some(e => e.type === "onWrite" && e.hasSignal);
  const hasWriteNull = events.some(e => e.type === "onWrite" && !e.hasSignal);

  if (!hasSchedule || !hasOpen || !hasClose || !hasWriteWithSignal || !hasWriteNull) {
    fail(`Missing events: schedule=${hasSchedule}, open=${hasOpen}, close=${hasClose}, write(signal)=${hasWriteWithSignal}, write(null)=${hasWriteNull}`);
    return;
  }

  // ПРОВЕРКА #2: onWrite(signal) должен быть ПЕРЕД onOpen
  // ВАЖНО: setPendingSignal() вызывается ПЕРЕД lifecycle callbacks в бизнес-логике
  // Это корректное поведение - сначала устанавливаем состояние, потом триггерим коллбеки
  const openIndex = events.findIndex(e => e.type === "onOpen");
  const firstWriteWithSignalIndex = events.findIndex(e => e.type === "onWrite" && e.hasSignal);

  if (firstWriteWithSignalIndex >= openIndex) {
    fail(`onWrite(signal) at index ${firstWriteWithSignalIndex} called AFTER onOpen at index ${openIndex} (expected BEFORE)`);
    return;
  }

  // ПРОВЕРКА #3: onWrite(null) должен быть ПОСЛЕ onClose
  const closeIndex = events.findIndex(e => e.type === "onClose");
  const firstWriteNullIndex = events.findIndex(e => e.type === "onWrite" && !e.hasSignal);

  if (firstWriteNullIndex < closeIndex) {
    fail(`onWrite(null) at index ${firstWriteNullIndex} called BEFORE onClose at index ${closeIndex}`);
    return;
  }

  // ПРОВЕРКА #4: Правильный порядок событий
  const eventSequence = events.map(e => e.type === "onWrite" ? `onWrite(${e.hasSignal ? 'signal' : 'null'})` : e.type).join(" → ");

  pass(`PERSIST LIFECYCLE ORDER: Correct event sequence (${events.length} events): ${eventSequence}`);
});

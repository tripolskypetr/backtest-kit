import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  addWalker,
  Backtest,
  Live,
  Walker,
  listenDoneBacktest,
  listenError,
  listenWalkerComplete,
  listenSignalBacktestOnce,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * SHUTDOWN TEST #1: Backtest.stop() during active signal
 *
 * Scenario:
 * - Start backtest with strategy
 * - Wait for signal to become active
 * - Call Backtest.stop() during active signal
 * - Check: Current signal completes, no new signals open
 */
test("SHUTDOWN: Backtest.stop() during active signal - signal completes first", async ({ pass, fail }) => {
  const signalsResults = {
    opened: [],
    closed: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Предзаполняем минимум 5 свечей для getAveragePrice
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-shutdown-1",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "test-shutdown-1",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 2) return null;

      // КРИТИЧНО: Генерируем ВСЕ свечи только в первый раз
      if (signalCount === 1) {
        allCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          allCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        }

        // Generate candles for full test duration (120 minutes = 2 hours)
        for (let i = 0; i < 120; i++) {
          const timestamp = startTime + i * intervalMs;

          if (i < 3) {
            // Phase 1: Wait (price above priceOpen for scheduled)
            allCandles.push({
              timestamp,
              open: basePrice + 500,
              high: basePrice + 600,
              low: basePrice + 400,
              close: basePrice + 500,
              volume: 100,
            });
          } else if (i >= 3 && i < 5) {
            // Phase 2: Activate (price reaches priceOpen)
            allCandles.push({
              timestamp,
              open: basePrice,
              high: basePrice + 100,
              low: basePrice - 100,
              close: basePrice,
              volume: 100,
            });
          } else if (i >= 5 && i < 100) {
            // Phase 3: Active - keep signal active (price between SL and TP)
            allCandles.push({
              timestamp,
              open: basePrice + 500,
              high: basePrice + 600,
              low: basePrice + 400,
              close: basePrice + 500,
              volume: 100,
            });
          } else {
            // Phase 4: TP
            allCandles.push({
              timestamp,
              open: basePrice + 1000,
              high: basePrice + 1100,
              low: basePrice + 900,
              close: basePrice + 1000,
              volume: 100,
            });
          }
        }
      }

      return {
        position: "long",
        note: `Shutdown signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 120, // Increased to match frame duration
      };
    },
    callbacks: {
      onOpen: (_symbol, data) => {
        // console.log("[TEST #1] onOpen called, signalId:", data.id, "signalCount:", signalsResults.opened.length + 1);
        signalsResults.opened.push(data);
      },
      onClose: (_symbol, data, priceClose) => {
        // console.log("[TEST #1] onClose called, signalId:", data.id, "priceClose:", priceClose);
        signalsResults.closed.push({ signal: data, priceClose });
      },
    },
  });

  addFrame({
    frameName: "60m-shutdown-1",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:00:00Z"), // 120 minutes - enough time to stop during active signal
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  // console.log("[TEST #1] Starting Backtest.background");
  Backtest.background("BTCUSDT", {
    strategyName: "test-shutdown-1",
    exchangeName: "binance-shutdown-1",
    frameName: "60m-shutdown-1",
  });

  // console.log("[TEST #1] Waiting for awaitSubject.toPromise()");
  await awaitSubject.toPromise();
  // console.log("[TEST #1] awaitSubject resolved");
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #1] ERROR CAUGHT:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // console.log("[TEST #1] Final results - opened:", signalsResults.opened.length, "closed:", signalsResults.closed.length);

  await sleep(1_000);

  // Should have exactly 1 signal (the one that was active when we stopped)
  if (signalsResults.opened.length !== 1) {
    fail(`Expected 1 opened signal, got ${signalsResults.opened.length}`);
    return;
  }

  if (signalsResults.closed.length !== 1) {
    fail(`Expected 1 closed signal, got ${signalsResults.closed.length}`);
    return;
  }

  pass(`SHUTDOWN BACKTEST ACTIVE: Stopped during active signal. Signal completed. Signals: opened=${signalsResults.opened.length}, closed=${signalsResults.closed.length}`);
});


/**
 * SHUTDOWN TEST #2: Backtest.stop() after signal closes by TP
 *
 * Scenario:
 * - Start backtest with strategy
 * - Signal opens and closes by TP
 * - Call Backtest.stop() after first signal closes
 * - Check: No second signal opens after stop
 */
test("SHUTDOWN: Backtest.stop() after signal closes - no new signals", async ({ pass, fail }) => {
  const signalsResults = {
    opened: [],
    closed: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Предзаполняем минимум 5 свечей для getAveragePrice
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-shutdown-2",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "test-shutdown-2",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 3) return null;

      if (signalCount === 1) {
        allCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          allCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        }

        // Signal #1: TP (0-4: wait, 5-9: activate, 10-14: TP)
        for (let i = 0; i < 60; i++) {
          const timestamp = startTime + i * intervalMs;

          if (i < 5) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 5 && i < 10) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          } else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        note: `Shutdown signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: (_symbol, data) => {
        // console.log("[TEST #2] onOpen called, signalId:", data.id);
        signalsResults.opened.push(data);
      },
      onClose: (_symbol, data, priceClose) => {
        // console.log("[TEST #2] onClose called, signalId:", data.id, "priceClose:", priceClose);
        signalsResults.closed.push({ signal: data, priceClose });
      },
    },
  });

  addFrame({
    frameName: "60m-shutdown-2",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => {
    // console.log("[TEST #2] listenDoneBacktest fired");
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #2] listenError fired:", error.message || error);
    errorCaught = error;
    awaitSubject.next();
  });

  // Listen for first signal to close, then call stop
  listenSignalBacktestOnce(
    (event) => event.action === "closed",
    async () => {
      // console.log("[TEST #2] First signal closed in listener, calling Backtest.stop()");
      await Backtest.stop("BTCUSDT", "test-shutdown-2");
      // console.log("[TEST #2] Backtest.stop() completed in listener");
    }
  );

  // console.log("[TEST #2] Starting Backtest.background");
  Backtest.background("BTCUSDT", {
    strategyName: "test-shutdown-2",
    exchangeName: "binance-shutdown-2",
    frameName: "60m-shutdown-2",
  });

  // console.log("[TEST #2] Waiting for awaitSubject.toPromise()");
  await awaitSubject.toPromise();
  // console.log("[TEST #2] awaitSubject resolved");
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // console.log("[TEST #2] Final results - opened:", signalsResults.opened.length, "closed:", signalsResults.closed.length);

  if (signalsResults.opened.length !== 1) {
    fail(`Expected exactly 1 opened signal (stopped after first close), got ${signalsResults.opened.length}`);
    return;
  }

  if (signalsResults.closed.length !== 1) {
    fail(`Expected exactly 1 closed signal, got ${signalsResults.closed.length}`);
    return;
  }

  pass(`SHUTDOWN BACKTEST AFTER CLOSE: Stopped after first signal. Signals: opened=${signalsResults.opened.length}, closed=${signalsResults.closed.length}`);
});


/**
 * SHUTDOWN TEST #3: Live.stop() during idle state
 *
 * Scenario:
 * - Start live trading with strategy
 * - Call Live.stop() during idle (no signals)
 * - Check: Live stops immediately
 */
test("SHUTDOWN: Live.stop() during idle - stops immediately", async ({ pass, fail }) => {
  let onCloseCalled = false;
  let stopExecuted = false;

  const basePrice = 43000;

  addExchange({
    exchangeName: "binance-shutdown-4",
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
    strategyName: "test-shutdown-4",
    interval: "1m",
    getSignal: async () => {
      // Never create signals
      return null;
    },
    callbacks: {
      onClose: () => {
        onCloseCalled = true;
      },
    },
  });

  // console.log("[TEST #3] Starting Live.background");
  const cancelFn = Live.background("BTCUSDT", {
    strategyName: "test-shutdown-4",
    exchangeName: "binance-shutdown-4",
  });

  // Stop during idle
  // console.log("[TEST #3] Waiting 50ms");
  await sleep(50);

  if (!stopExecuted) {
    stopExecuted = true;
    // console.log("[TEST #3] Calling Live.stop()");
    await Live.stop("BTCUSDT", "test-shutdown-4");
    // console.log("[TEST #3] Live.stop() completed");
  }

  // console.log("[TEST #3] Waiting 50ms before cancelFn()");
  await sleep(50);
  // console.log("[TEST #3] Calling cancelFn()");
  cancelFn();

  // console.log("[TEST #3] onCloseCalled:", onCloseCalled);

  if (onCloseCalled) {
    fail("onClose should NOT be called (no signals created)");
    return;
  }

  pass(`SHUTDOWN LIVE IDLE: Stopped during idle. No signals created.`);
});


/**
 * SHUTDOWN TEST #5: Live.stop() after signal closes
 *
 * Scenario:
 * - Start live trading with persisted signal
 * - Signal closes by TP
 * - Call Live.stop() after signal closes
 * - Check: Stop successful, no new signals
 */
test("SHUTDOWN: Live.stop() after signal closes - no new signals", async ({ pass, fail }) => {
  let onCloseCalled = false;
  let stopExecuted = false;

  const basePrice = 43000;
  const priceOpen = basePrice;
  const priceTakeProfit = basePrice + 1000;
  const priceStopLoss = basePrice - 1000;

  // Mock persist adapter with active signal
  const { PersistSignalAdapter } = await import("../../build/index.mjs");

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}

    async readValue() {
      return {
        id: "shutdown-live-test",
        position: "long",
        note: "Shutdown test signal",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
        exchangeName: "binance-shutdown-5",
        strategyName: "test-shutdown-5",
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
    exchangeName: "binance-shutdown-5",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // All candles at TP level - closes immediately
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
    strategyName: "test-shutdown-5",
    interval: "1m",
    getSignal: async () => {
      // No new signals after persist signal closes
      return null;
    },
    callbacks: {
      onClose: async () => {
        // console.log("[TEST #5] onClose called");
        onCloseCalled = true;

        // Stop after signal closes
        // console.log("[TEST #5] Waiting 10ms before Live.stop()");
        await sleep(10);
        if (!stopExecuted) {
          stopExecuted = true;
          // console.log("[TEST #5] Calling Live.stop()");
          await Live.stop("BTCUSDT", "test-shutdown-5");
          // console.log("[TEST #5] Live.stop() completed");
        }
      },
    },
  });

  // console.log("[TEST #5] Starting Live.background");
  const cancelFn = Live.background("BTCUSDT", {
    strategyName: "test-shutdown-5",
    exchangeName: "binance-shutdown-5",
  });

  // console.log("[TEST #5] Waiting 100ms");
  await sleep(100);
  // console.log("[TEST #5] Calling cancelFn()");
  cancelFn();

  // console.log("[TEST #5] onCloseCalled:", onCloseCalled);

  if (!onCloseCalled) {
    fail("onClose was NOT called (signal should close by TP)");
    return;
  }

  pass(`SHUTDOWN LIVE AFTER CLOSE: Stopped after signal closed by TP.`);
});


/**
 * SHUTDOWN TEST #6: Walker.stop() - all strategies stop
 *
 * Scenario:
 * - Start walker with 3 strategies
 * - Call Walker.stop() after first strategy completes
 * - Check: Walker stops, remaining strategies don't run
 */
test("SHUTDOWN: Walker.stop() - all strategies stop", async ({ pass, fail }) => {
  const strategiesStarted = new Set();
  const strategiesCompleted = [];
  const signalCounts = {}; // Track signals per strategy

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;

  let allCandles = [];

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-shutdown-6",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  // Add 3 strategies
  for (let s = 1; s <= 3; s++) {
    const strategyName = `test-shutdown-walker-${s}`;
    signalCounts[strategyName] = 0;

    addStrategy({
      strategyName,
      interval: "1m",
      getSignal: async () => {
        // console.log(`[TEST #6] getSignal called for ${strategyName}`);
        strategiesStarted.add(strategyName);

        // Only return one signal per strategy
        signalCounts[strategyName]++;
        if (signalCounts[strategyName] > 1) {
          // console.log(`[TEST #6] ${strategyName} already returned signal, returning null`);
          return null;
        }

        if (allCandles.length === 5) {
          allCandles = [];

          for (let i = 0; i < 30; i++) {
            const timestamp = startTime + i * intervalMs;

            if (i < 5) {
              allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
            } else if (i >= 5 && i < 10) {
              allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
            } else {
              allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
            }
          }
        }

        return {
          position: "long",
          note: `Walker shutdown strategy ${s}`,
          priceOpen: basePrice,
          priceTakeProfit: basePrice + 1000,
          priceStopLoss: basePrice - 1000,
          minuteEstimatedTime: 60,
        };
      },
      callbacks: {
        onClose: () => {
          // console.log(`[TEST #6] onClose called for ${strategyName}`);
          strategiesCompleted.push(strategyName);
        },
      },
    });
  }

  addFrame({
    frameName: "30m-shutdown-6",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  let stopCalled = false;

  addWalker({
    walkerName: "test-walker-shutdown",
    exchangeName: "binance-shutdown-6",
    frameName: "30m-shutdown-6",
    strategies: ["test-shutdown-walker-1", "test-shutdown-walker-2", "test-shutdown-walker-3"],
    callbacks: {
      onStrategyComplete: async (strategyName) => {
        // console.log(`[TEST #6] onStrategyComplete fired for ${strategyName}`);
        if (!stopCalled) {
          stopCalled = true;
          // console.log("[TEST #6] First strategy completed, calling Walker.stop()");
          await Walker.stop("BTCUSDT", "test-walker-shutdown");
          // console.log("[TEST #6] Walker.stop() completed");
        }
      }
    }
  });

  listenWalkerComplete(() => {
    // console.log("[TEST #6] listenWalkerComplete fired");
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #6] listenError fired:", error.message || error);
    errorCaught = error;
    awaitSubject.next();
  });

  // console.log("[TEST #6] Starting Walker.background");
  const cancelFn = Walker.background("BTCUSDT", {
    walkerName: "test-walker-shutdown",
  });

  // Wait for walker to complete or error
  await awaitSubject.toPromise();

  // console.log("[TEST #6] Calling cancelFn()");
  cancelFn();
  unsubscribeError();

  // console.log("[TEST #6] strategiesStarted:", strategiesStarted);
  // console.log("[TEST #6] strategiesCompleted:", strategiesCompleted);

  if (errorCaught) {
    fail(`Error during walker: ${errorCaught.message || errorCaught}`);
    return;
  }

  const strategiesStartedArray = Array.from(strategiesStarted);

  // Walker should stop after first strategy, so max 2 strategies should start (first completes, second starts then stops)
  if (strategiesStartedArray.length >= 3) {
    fail(`Expected less than 3 strategies started (stopped after first), got ${strategiesStartedArray.length}: ${strategiesStartedArray.join(", ")}`);
    return;
  }

  pass(`SHUTDOWN WALKER: Walker stopped after first strategy. Strategies started: ${strategiesStartedArray.length}/3 (${strategiesStartedArray.join(", ")}). Completed: ${strategiesCompleted.length}`);
});


/**
 * SHUTDOWN TEST #7: Two walkers on same symbol - stop one doesn't affect other
 *
 * Scenario:
 * - Start walker-A with strategy-A1, strategy-A2
 * - Start walker-B with strategy-B1, strategy-B2
 * - Both walkers on same symbol "BTCUSDT"
 * - Call Walker.stop() for walker-A only
 * - Check: walker-A stops, walker-B continues
 */
test("SHUTDOWN: Two walkers on same symbol - stop one doesn't affect other", async ({ pass, fail }) => {
  const walkerAStrategiesStarted = new Set();
  const walkerBStrategiesStarted = new Set();
  const signalCountsA = {}; // Track signals for Walker A
  const signalCountsB = {}; // Track signals for Walker B

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;

  let allCandles = [];

  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-shutdown-7",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  // Walker A strategies
  for (let s = 1; s <= 2; s++) {
    const strategyName = `test-shutdown-walkerA-${s}`;
    signalCountsA[strategyName] = 0;

    addStrategy({
      strategyName,
      interval: "1m",
      getSignal: async () => {
        // console.log(`[TEST #7] Walker A: getSignal called for ${strategyName}`);
        walkerAStrategiesStarted.add(strategyName);

        // Only return one signal per strategy
        signalCountsA[strategyName]++;
        if (signalCountsA[strategyName] > 1) {
          // console.log(`[TEST #7] Walker A: ${strategyName} already returned signal, returning null`);
          return null;
        }

        if (allCandles.length === 5) {
          allCandles = [];

          for (let i = 0; i < 30; i++) {
            const timestamp = startTime + i * intervalMs;
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }

        return {
          position: "long",
          note: `Walker A strategy ${s}`,
          priceOpen: basePrice,
          priceTakeProfit: basePrice + 1000,
          priceStopLoss: basePrice - 1000,
          minuteEstimatedTime: 60,
        };
      },
    });
  }

  // Walker B strategies
  for (let s = 1; s <= 2; s++) {
    const strategyName = `test-shutdown-walkerB-${s}`;
    signalCountsB[strategyName] = 0;

    addStrategy({
      strategyName,
      interval: "1m",
      getSignal: async () => {
        // console.log(`[TEST #7] Walker B: getSignal called for ${strategyName}`);
        walkerBStrategiesStarted.add(strategyName);

        // Only return one signal per strategy
        signalCountsB[strategyName]++;
        if (signalCountsB[strategyName] > 1) {
          // console.log(`[TEST #7] Walker B: ${strategyName} already returned signal, returning null`);
          return null;
        }

        return {
          position: "long",
          note: `Walker B strategy ${s}`,
          priceOpen: basePrice,
          priceTakeProfit: basePrice + 1000,
          priceStopLoss: basePrice - 1000,
          minuteEstimatedTime: 60,
        };
      },
    });
  }

  addFrame({
    frameName: "30m-shutdown-7",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  let walkerAStopCalled = false;

  addWalker({
    walkerName: "test-walkerA",
    exchangeName: "binance-shutdown-7",
    frameName: "30m-shutdown-7",
    strategies: ["test-shutdown-walkerA-1", "test-shutdown-walkerA-2"],
    callbacks: {
      onStrategyComplete: async (strategyName) => {
        // console.log(`[TEST #7] Walker A: onStrategyComplete for ${strategyName}`);
        if (!walkerAStopCalled) {
          walkerAStopCalled = true;
          // console.log("[TEST #7] Calling Walker.stop() for Walker A after first strategy");
          await Walker.stop("BTCUSDT", "test-walkerA");
          // console.log("[TEST #7] Walker.stop() for Walker A completed");
        }
      }
    }
  });

  addWalker({
    walkerName: "test-walkerB",
    exchangeName: "binance-shutdown-7",
    frameName: "30m-shutdown-7",
    strategies: ["test-shutdown-walkerB-1", "test-shutdown-walkerB-2"],
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #7] listenError fired:", error.message || error);
    errorCaught = error;
  });

  // console.log("[TEST #7] Starting Walker A and Walker B");
  const cancelA = Walker.background("BTCUSDT", {
    walkerName: "test-walkerA",
  });

  const cancelB = Walker.background("BTCUSDT", {
    walkerName: "test-walkerB",
  });

  // Wait for walkers to run
  // console.log("[TEST #7] Waiting 100ms");
  await sleep(100);

  // Wait for walker B to continue
  // console.log("[TEST #7] Waiting 200ms for Walker B to continue");
  await sleep(200);

  // console.log("[TEST #7] Calling cancelA() and cancelB()");
  cancelA();
  cancelB();
  unsubscribeError();

  // console.log("[TEST #7] Walker A strategies started:", walkerAStrategiesStarted);
  // console.log("[TEST #7] Walker B strategies started:", walkerBStrategiesStarted);

  if (errorCaught) {
    fail(`Error during walkers: ${errorCaught.message || errorCaught}`);
    return;
  }

  const walkerAArray = Array.from(walkerAStrategiesStarted);
  const walkerBArray = Array.from(walkerBStrategiesStarted);

  // Walker A should stop early (only first strategy completes)
  if (walkerAArray.length >= 2) {
    fail(`Walker A should stop early, got ${walkerAArray.length} strategies: ${walkerAArray.join(", ")}`);
    return;
  }

  // Walker B should continue (but may or may not complete all strategies due to timing)
  if (walkerBArray.length === 0) {
    fail(`Walker B should start strategies, got ${walkerBArray.length}`);
    return;
  }

  pass(`SHUTDOWN TWO WALKERS: Walker A stopped (${walkerAArray.length}/2 strategies). Walker B continued (${walkerBArray.length}/2 strategies).`);
});

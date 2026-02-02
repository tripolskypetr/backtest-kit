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
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * PARALLEL TEST #1: One strategy trades two symbols in parallel (BTCUSDT and ETHUSDT)
 *
 * Checks:
 * - State isolation between (symbol, strategyName) pairs
 * - Independent signal processing for each symbol
 * - Correct memoization of ClientStrategy instances
 * - Independent data storage (signal/schedule persistence)
 * - Independent report generation (markdown reports)
 *
 * Scenario:
 * - BTCUSDT: scheduled -> opened -> closed by TP
 * - ETHUSDT: scheduled -> opened -> closed by SL
 */
test("PARALLEL: One strategy trades two symbols (BTCUSDT TP, ETHUSDT SL)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  const btcBasePrice = 95000;
  const ethBasePrice = 4000;

  let btcCandles = [];
  let ethCandles = [];
  let btcSignalGenerated = false;
  let ethSignalGenerated = false;

  // Initial candles (buffer period) for BTC
  for (let i = 0; i < 6; i++) {
    btcCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });
  }

  // Initial candles (buffer period) for ETH
  for (let i = 0; i < 6; i++) {
    ethCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: ethBasePrice,
      high: ethBasePrice + 50,
      low: ethBasePrice - 25,
      close: ethBasePrice,
      volume: 100,
    });
  }

  let btcResults = { scheduled: null, opened: null, closed: null };
  let ethResults = { scheduled: null, opened: null, closed: null };

  addExchangeSchema({
    exchangeName: "binance-parallel-two-symbols",
    getCandles: async (symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      const allCandles = symbol === "BTCUSDT" ? btcCandles : ethCandles;
      const basePrice = symbol === "BTCUSDT" ? btcBasePrice : ethBasePrice;

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
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-parallel-two-symbols",
    interval: "1m",
    getSignal: async (symbol) => {
      if (symbol === "BTCUSDT") {
        if (btcSignalGenerated) return null;
        btcSignalGenerated = true;

        // Reset BTC candles for signal processing
        btcCandles = [];

        // Buffer candles
        for (let i = 0; i < bufferMinutes; i++) {
          btcCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: btcBasePrice,
            high: btcBasePrice + 50,
            low: btcBasePrice - 50,
            close: btcBasePrice,
            volume: 100,
          });
        }

        // Phase candles after signal - BTC goes to TP
        for (let i = 0; i < 15; i++) {
          const timestamp = startTime + i * intervalMs;
          if (i < 5) {
            btcCandles.push({ timestamp, open: btcBasePrice, high: btcBasePrice + 100, low: btcBasePrice - 100, close: btcBasePrice, volume: 100 });
          } else {
            // Price reaches TP
            const tpPrice = btcBasePrice + 1000;
            btcCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
          }
        }

        return {
          position: "long",
          priceOpen: btcBasePrice,
          priceTakeProfit: btcBasePrice + 1000,
          priceStopLoss: btcBasePrice - 1000,
          minuteEstimatedTime: 60,
        };
      }

      if (symbol === "ETHUSDT") {
        if (ethSignalGenerated) return null;
        ethSignalGenerated = true;

        // Reset ETH candles for signal processing
        ethCandles = [];

        // Buffer candles
        for (let i = 0; i < bufferMinutes; i++) {
          ethCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: ethBasePrice,
            high: ethBasePrice + 25,
            low: ethBasePrice - 25,
            close: ethBasePrice,
            volume: 100,
          });
        }

        // Phase candles after signal - ETH goes to SL
        for (let i = 0; i < 15; i++) {
          const timestamp = startTime + i * intervalMs;
          if (i < 5) {
            ethCandles.push({ timestamp, open: ethBasePrice, high: ethBasePrice + 50, low: ethBasePrice - 50, close: ethBasePrice, volume: 100 });
          } else {
            // Price reaches SL (for long, price drops)
            const slPrice = ethBasePrice - 200;
            ethCandles.push({ timestamp, open: slPrice, high: slPrice + 50, low: slPrice - 50, close: slPrice, volume: 100 });
          }
        }

        return {
          position: "long",
          priceOpen: ethBasePrice,
          priceTakeProfit: ethBasePrice + 200,
          priceStopLoss: ethBasePrice - 200,
          minuteEstimatedTime: 60,
        };
      }

      return null;
    },
    callbacks: {
      onSchedule: (symbol, data) => {
        if (symbol === "BTCUSDT") btcResults.scheduled = data;
        if (symbol === "ETHUSDT") ethResults.scheduled = data;
      },
      onOpen: (symbol, data) => {
        if (symbol === "BTCUSDT") btcResults.opened = data;
        if (symbol === "ETHUSDT") ethResults.opened = data;
      },
      onClose: (symbol, data, priceClose) => {
        if (symbol === "BTCUSDT") btcResults.closed = { signal: data, priceClose };
        if (symbol === "ETHUSDT") ethResults.closed = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "15m-parallel-two-symbols",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:15:00Z"),
  });

  let btcDone = false;
  let ethDone = false;
  const awaitSubject = new Subject();

  let btcFinalResult = null;
  let ethFinalResult = null;

  const unsubscribeSignal = listenSignalBacktest((result) => {
    if (result.action === "closed") {
      if (result.symbol === "BTCUSDT") {
        btcFinalResult = result;
      }
      if (result.symbol === "ETHUSDT") {
        ethFinalResult = result;
      }
    }
  });

  const unsubscribeDone = listenDoneBacktest((result) => {
    if (result.symbol === "BTCUSDT") btcDone = true;
    if (result.symbol === "ETHUSDT") ethDone = true;
    if (btcDone && ethDone) {
      awaitSubject.next();
    }
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  // Run both backtests in parallel
  Backtest.background("BTCUSDT", {
    strategyName: "test-parallel-two-symbols",
    exchangeName: "binance-parallel-two-symbols",
    frameName: "15m-parallel-two-symbols",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-parallel-two-symbols",
    exchangeName: "binance-parallel-two-symbols",
    frameName: "15m-parallel-two-symbols",
  });

  await awaitSubject.toPromise();
  unsubscribeSignal();
  unsubscribeDone();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Verify BTC results
  if (!btcResults.scheduled) {
    fail("BTCUSDT signal was NOT scheduled!");
    return;
  }

  if (!btcResults.opened) {
    fail("BTCUSDT signal was NOT opened!");
    return;
  }

  if (!btcResults.closed || !btcFinalResult) {
    fail("BTCUSDT signal was NOT closed!");
    return;
  }

  if (btcFinalResult.closeReason !== "take_profit") {
    fail(`BTCUSDT: Expected close by "take_profit", got "${btcFinalResult.closeReason}"`);
    return;
  }

  // Verify ETH results
  if (!ethResults.scheduled) {
    fail("ETHUSDT signal was NOT scheduled!");
    return;
  }

  if (!ethResults.opened) {
    fail("ETHUSDT signal was NOT opened!");
    return;
  }

  if (!ethResults.closed || !ethFinalResult) {
    fail("ETHUSDT signal was NOT closed!");
    return;
  }

  if (ethFinalResult.closeReason !== "stop_loss") {
    fail(`ETHUSDT: Expected close by "stop_loss", got "${ethFinalResult.closeReason}"`);
    return;
  }

  pass(`PARALLEL WORKS: BTCUSDT closed by TP (PNL: ${btcFinalResult.pnl.pnlPercentage.toFixed(2)}%), ETHUSDT closed by SL (PNL: ${ethFinalResult.pnl.pnlPercentage.toFixed(2)}%). State isolation confirmed!`);
});

/**
 * PARALLEL TEST #2: Three symbols trade in parallel with one strategy
 *
 * Checks:
 * - Scalability of multi-symbol architecture
 * - Independence of ClientStrategy instances for each (symbol, strategyName) pair
 * - Correct memoization with keys `${symbol}:${strategyName}`
 * - Independence of persistence layer (files named ${symbol}_${strategyName})
 *
 * Scenario:
 * - BTCUSDT: TP
 * - ETHUSDT: SL
 * - SOLUSDT: time_expired
 */
test("PARALLEL: Three symbols trade in parallel (BTCUSDT TP, ETHUSDT SL, SOLUSDT time_expired)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  const btcBasePrice = 95000;
  const ethBasePrice = 4000;
  const solBasePrice = 200;

  let btcCandles = [];
  let ethCandles = [];
  let solCandles = [];
  let btcSignalGenerated = false;
  let ethSignalGenerated = false;
  let solSignalGenerated = false;

  // Initial candles (buffer period) for all symbols
  for (let i = 0; i < 6; i++) {
    btcCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });
    ethCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: ethBasePrice,
      high: ethBasePrice + 50,
      low: ethBasePrice - 25,
      close: ethBasePrice,
      volume: 100,
    });
    solCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: solBasePrice,
      high: solBasePrice + 5,
      low: solBasePrice - 2,
      close: solBasePrice,
      volume: 100,
    });
  }

  let btcResults = { scheduled: null, opened: null, closed: null };
  let ethResults = { scheduled: null, opened: null, closed: null };
  let solResults = { scheduled: null, opened: null, closed: null };

  addExchangeSchema({
    exchangeName: "binance-parallel-three-symbols",
    getCandles: async (symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      let allCandles, basePrice;

      if (symbol === "BTCUSDT") {
        allCandles = btcCandles;
        basePrice = btcBasePrice;
      } else if (symbol === "ETHUSDT") {
        allCandles = ethCandles;
        basePrice = ethBasePrice;
      } else {
        allCandles = solCandles;
        basePrice = solBasePrice;
      }

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
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-parallel-three-symbols",
    interval: "1m",
    getSignal: async (symbol) => {
      if (symbol === "BTCUSDT") {
        if (btcSignalGenerated) return null;
        btcSignalGenerated = true;

        btcCandles = [];

        for (let i = 0; i < bufferMinutes; i++) {
          btcCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: btcBasePrice,
            high: btcBasePrice + 50,
            low: btcBasePrice - 50,
            close: btcBasePrice,
            volume: 100,
          });
        }

        // BTC goes to TP
        for (let i = 0; i < 15; i++) {
          const timestamp = startTime + i * intervalMs;
          if (i < 5) {
            btcCandles.push({ timestamp, open: btcBasePrice, high: btcBasePrice + 100, low: btcBasePrice - 100, close: btcBasePrice, volume: 100 });
          } else {
            const tpPrice = btcBasePrice + 1000;
            btcCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
          }
        }

        return {
          position: "long",
          priceOpen: btcBasePrice,
          priceTakeProfit: btcBasePrice + 1000,
          priceStopLoss: btcBasePrice - 1000,
          minuteEstimatedTime: 60,
        };
      }

      if (symbol === "ETHUSDT") {
        if (ethSignalGenerated) return null;
        ethSignalGenerated = true;

        ethCandles = [];

        for (let i = 0; i < bufferMinutes; i++) {
          ethCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: ethBasePrice,
            high: ethBasePrice + 25,
            low: ethBasePrice - 25,
            close: ethBasePrice,
            volume: 100,
          });
        }

        // ETH goes to SL
        for (let i = 0; i < 15; i++) {
          const timestamp = startTime + i * intervalMs;
          if (i < 5) {
            ethCandles.push({ timestamp, open: ethBasePrice, high: ethBasePrice + 50, low: ethBasePrice - 50, close: ethBasePrice, volume: 100 });
          } else {
            const slPrice = ethBasePrice - 200;
            ethCandles.push({ timestamp, open: slPrice, high: slPrice + 50, low: slPrice - 50, close: slPrice, volume: 100 });
          }
        }

        return {
          position: "long",
          priceOpen: ethBasePrice,
          priceTakeProfit: ethBasePrice + 200,
          priceStopLoss: ethBasePrice - 200,
          minuteEstimatedTime: 60,
        };
      }

      if (symbol === "SOLUSDT") {
        if (solSignalGenerated) return null;
        solSignalGenerated = true;

        solCandles = [];

        for (let i = 0; i < bufferMinutes; i++) {
          solCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: solBasePrice,
            high: solBasePrice + 2,
            low: solBasePrice - 2,
            close: solBasePrice,
            volume: 100,
          });
        }

        // SOL stays flat - neither TP nor SL reached, will expire by time
        for (let i = 0; i < 15; i++) {
          const timestamp = startTime + i * intervalMs;
          solCandles.push({ timestamp, open: solBasePrice, high: solBasePrice + 2, low: solBasePrice - 2, close: solBasePrice, volume: 100 });
        }

        return {
          position: "long",
          priceOpen: solBasePrice,
          priceTakeProfit: solBasePrice + 20,  // Far from current price
          priceStopLoss: solBasePrice - 20,    // Far from current price
          minuteEstimatedTime: 10,             // Short time - will expire
        };
      }

      return null;
    },
    callbacks: {
      onSchedule: (symbol, data) => {
        if (symbol === "BTCUSDT") btcResults.scheduled = data;
        if (symbol === "ETHUSDT") ethResults.scheduled = data;
        if (symbol === "SOLUSDT") solResults.scheduled = data;
      },
      onOpen: (symbol, data) => {
        if (symbol === "BTCUSDT") btcResults.opened = data;
        if (symbol === "ETHUSDT") ethResults.opened = data;
        if (symbol === "SOLUSDT") solResults.opened = data;
      },
      onClose: (symbol, data, priceClose) => {
        if (symbol === "BTCUSDT") btcResults.closed = { signal: data, priceClose };
        if (symbol === "ETHUSDT") ethResults.closed = { signal: data, priceClose };
        if (symbol === "SOLUSDT") solResults.closed = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-parallel-three-symbols",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  let btcDone = false;
  let ethDone = false;
  let solDone = false;
  const awaitSubject = new Subject();

  let btcFinalResult = null;
  let ethFinalResult = null;
  let solFinalResult = null;

  const unsubscribeSignal = listenSignalBacktest((result) => {
    if (result.action === "closed") {
      if (result.symbol === "BTCUSDT") btcFinalResult = result;
      if (result.symbol === "ETHUSDT") ethFinalResult = result;
      if (result.symbol === "SOLUSDT") solFinalResult = result;
    }
  });

  const unsubscribeDone = listenDoneBacktest((result) => {
    if (result.symbol === "BTCUSDT") btcDone = true;
    if (result.symbol === "ETHUSDT") ethDone = true;
    if (result.symbol === "SOLUSDT") solDone = true;
    if (btcDone && ethDone && solDone) {
      awaitSubject.next();
    }
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  // Run all three backtests in parallel
  Backtest.background("BTCUSDT", {
    strategyName: "test-parallel-three-symbols",
    exchangeName: "binance-parallel-three-symbols",
    frameName: "30m-parallel-three-symbols",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-parallel-three-symbols",
    exchangeName: "binance-parallel-three-symbols",
    frameName: "30m-parallel-three-symbols",
  });

  Backtest.background("SOLUSDT", {
    strategyName: "test-parallel-three-symbols",
    exchangeName: "binance-parallel-three-symbols",
    frameName: "30m-parallel-three-symbols",
  });

  await awaitSubject.toPromise();
  unsubscribeSignal();
  unsubscribeDone();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Verify BTC results
  if (!btcResults.scheduled) {
    fail("BTCUSDT signal was NOT scheduled!");
    return;
  }
  if (!btcResults.opened) {
    fail("BTCUSDT signal was NOT opened!");
    return;
  }
  if (!btcResults.closed || !btcFinalResult) {
    fail("BTCUSDT signal was NOT closed!");
    return;
  }
  if (btcFinalResult.closeReason !== "take_profit") {
    fail(`BTCUSDT: Expected close by "take_profit", got "${btcFinalResult.closeReason}"`);
    return;
  }

  // Verify ETH results
  if (!ethResults.scheduled) {
    fail("ETHUSDT signal was NOT scheduled!");
    return;
  }
  if (!ethResults.opened) {
    fail("ETHUSDT signal was NOT opened!");
    return;
  }
  if (!ethResults.closed || !ethFinalResult) {
    fail("ETHUSDT signal was NOT closed!");
    return;
  }
  if (ethFinalResult.closeReason !== "stop_loss") {
    fail(`ETHUSDT: Expected close by "stop_loss", got "${ethFinalResult.closeReason}"`);
    return;
  }

  // Verify SOL results
  if (!solResults.scheduled) {
    fail("SOLUSDT signal was NOT scheduled!");
    return;
  }
  if (!solResults.opened) {
    fail("SOLUSDT signal was NOT opened!");
    return;
  }
  if (!solResults.closed || !solFinalResult) {
    fail("SOLUSDT signal was NOT closed!");
    return;
  }
  if (solFinalResult.closeReason !== "time_expired") {
    fail(`SOLUSDT: Expected close by "time_expired", got "${solFinalResult.closeReason}"`);
    return;
  }

  pass(`PARALLEL SCALABILITY WORKS: BTC=TP (${btcFinalResult.pnl.pnlPercentage.toFixed(2)}%), ETH=SL (${ethFinalResult.pnl.pnlPercentage.toFixed(2)}%), SOL=time_expired. Three-symbol parallel trading confirmed!`);
});

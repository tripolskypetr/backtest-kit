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
  listenError,
  setConfig,
  Risk,
  lib,
} from "../../build/index.mjs";

import { sleep, Subject } from "functools-kit";

test("listenRisk captures rejection events with correct data", async ({ pass, fail }) => {

  setConfig({
    CC_ENABLE_CANDLE_FETCH_MUTEX: false,
  }, true);

  const rejectionEvents = [];

    setConfig({
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: 1_000,
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.4,
    CC_MIN_STOPLOSS_DISTANCE_PERCENT: 0.4,
  });


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
    exchangeName: "binance-integration-listen-risk",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      // console.log(`[CANDLES] interval=${_interval} since=${new Date(since).toISOString()} alignedSince=${new Date(alignedSince).toISOString()} limit=${limit}`);
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
    riskName: "max-2-positions",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 2) {
            throw new Error("Maximum 2 positions allowed");
          }
        },
        note: "Max 2 positions allowed",
      },
    ],
  });

  // Listen to all risk rejection events
  listenRisk((event) => {
    // console.log(`[RISK] rejection strategy=${event.strategyName} note=${event.rejectionNote} activeCount=${event.activePositionCount}`);
    rejectionEvents.push(event);
  });

  let openedCount = 0;
  let closedCount = 0;
  listenSignal((result) => {
    /*console.log("[TEST] listenSignal event", {
      action: result.action,
      symbol: result.symbol,
      strategyName: result.strategyName,
      reason: result.reason,
      priceOpen: result.signal?.priceOpen,
      priceClose: result.signal?.priceClose,
      priceTakeProfit: result.signal?.priceTakeProfit,
      priceStopLoss: result.signal?.priceStopLoss,
    });*/
    if (result.action === "opened") {
      openedCount++;
      // console.log(`[SIGNAL] opened strategy=${result.strategyName} total=${openedCount}`);
    }
    if (result.action === "closed") {
      closedCount++;
      // console.log(`[SIGNAL] closed closeReason=${result.closeReason} total=${closedCount}`);
    }
  });

  // Strategy 1 - will open position 1
  addStrategySchema({
    strategyName: "test-strategy-listen-risk-1",
    interval: "1m",
    riskName: "max-2-positions",
    getSignal: async () => {
      const price = await getAveragePrice();
      // console.log(`[SIGNAL-1] price=${price}`);
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,  // Very high TP that won't be reached
        priceStopLoss: price * 0.1,   // Very low SL that won't be reached
        minuteEstimatedTime: 100000,    // Very long time so positions stay open
      };
    },
  });

  // Strategy 2 - will open position 2
  addStrategySchema({
    strategyName: "test-strategy-listen-risk-2",
    interval: "1m",
    riskName: "max-2-positions",
    getSignal: async () => {
      const price = await getAveragePrice();
      // console.log(`[SIGNAL-2] price=${price}`);
      return {
        position: "short",
        priceOpen: price,
        priceTakeProfit: price * 0.1,  // Very low TP that won't be reached
        priceStopLoss: price * 10,   // Very high SL that won't be reached
        minuteEstimatedTime: 100000,    // Very long time so positions stay open
      };
    },
  });

  // Strategy 3 - will try to open position 3 and get rejected
  addStrategySchema({
    strategyName: "test-strategy-listen-risk-3",
    interval: "1m",
    riskName: "max-2-positions",
    getSignal: async () => {
      const price = await getAveragePrice();
      // console.log(`[SIGNAL-3] price=${price}`);
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price * 10,
        priceStopLoss: price * 0.1,
        minuteEstimatedTime: 100000,
      };
    },
  });

  addFrameSchema({
    frameName: "3d-listen-risk",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  listenError((err) => {
    // console.log(`[ERROR] ${err?.message ?? err}`);
  });

  const awaitSubject = new Subject();
  let backtestsDone = 0;

  const runInBackground = async (context) => {
    for await (const _ of lib.backtestCommandService.run("BTCUSDT", context)) {
      // drain
    }
    backtestsDone++;
    // console.log(`[DONE] backtest done total=${backtestsDone}`);
    if (backtestsDone === 3) {
      awaitSubject.next();
    }
  };

  runInBackground({
    strategyName: "test-strategy-listen-risk-1",
    exchangeName: "binance-integration-listen-risk",
    frameName: "3d-listen-risk",
  });

  runInBackground({
    strategyName: "test-strategy-listen-risk-2",
    exchangeName: "binance-integration-listen-risk",
    frameName: "3d-listen-risk",
  });

  runInBackground({
    strategyName: "test-strategy-listen-risk-3",
    exchangeName: "binance-integration-listen-risk",
    frameName: "3d-listen-risk",
  });

  await awaitSubject.toPromise();
  // await sleep(1_000);

  // console.log("[TEST] After await, before sleep");
  // console.log("[TEST] Total rejection events:", rejectionEvents.length);
  // console.log("[TEST] Total opened:", openedCount);
  // console.log("[TEST] Total closed:", closedCount);

  // await sleep(2000);

  // Should have rejections when attempting to open more than 2 positions
  if (rejectionEvents.length > 0) {
    const event = rejectionEvents[0];
    // console.log("[TEST] First rejection event:", JSON.stringify(event, null, 2));

    // Verify event structure - one of the strategies should be rejected
    // (could be any strategy since they run in parallel)
    const isValidStrategy =
      event.strategyName === "test-strategy-listen-risk-1" ||
      event.strategyName === "test-strategy-listen-risk-2" ||
      event.strategyName === "test-strategy-listen-risk-3";

    if (
      event.symbol === "BTCUSDT" &&
      isValidStrategy &&
      event.exchangeName === "binance-integration-listen-risk" &&
      event.rejectionNote === "Maximum 2 positions allowed" &&
      event.activePositionCount >= 2 &&
      typeof event.currentPrice === "number" &&
      typeof event.timestamp === "number" &&
      (typeof event.rejectionId === "string" || event.rejectionId === null) &&
      event.currentSignal &&
      (event.currentSignal.position === "long" || event.currentSignal.position === "short")
    ) {
      pass(`listenRisk captured ${rejectionEvents.length} rejection events with correct data`);
      return;
    }

    // console.log("[TEST] Event validation failed. Event:", event);
    // console.log("[TEST] Validation checks:");
    // console.log("  symbol:", event.symbol === "BTCUSDT");
    // console.log("  strategyName:", isValidStrategy);
    // console.log("  exchangeName:", event.exchangeName === "binance-integration-listen-risk");
    // console.log("  rejectionNote:", event.rejectionNote === "Max 2 positions allowed");
    // console.log("  activePositionCount:", event.activePositionCount >= 2);
    // console.log("  currentPrice type:", typeof event.currentPrice);
    // console.log("  timestamp type:", typeof event.timestamp);
    // console.log("  rejectionId type:", typeof event.rejectionId);
    // console.log("  has currentSignal:", !!event.currentSignal);
    // console.log("  position:", event.currentSignal?.position);
  }

  fail(`Expected rejection events with correct structure, got ${rejectionEvents.length} events`);

});


test("Risk.getData returns correct statistics after rejections", async ({ pass, fail }) => {

  setConfig({
    CC_ENABLE_CANDLE_FETCH_MUTEX: false,
  }, true);

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
    exchangeName: "binance-integration-get-data",
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
    riskName: "max-1-position-data",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 1) {
            throw new Error("Max 1 position");
          }
        },
        note: "Maximum 1 position allowed",
      },
    ],
  });

  // Strategy 1 - will open position
  addStrategySchema({
    strategyName: "test-strategy-get-data-1",
    interval: "1m",
    riskName: "max-1-position-data",
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

  // Strategy 2 - will be rejected
  addStrategySchema({
    strategyName: "test-strategy-get-data-2",
    interval: "1m",
    riskName: "max-1-position-data",
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
    frameName: "3d-get-data",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestsDone = 0;
  listenDoneBacktest(() => {
    backtestsDone++;
    if (backtestsDone === 2) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-get-data-1",
    exchangeName: "binance-integration-get-data",
    frameName: "3d-get-data",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-get-data-2",
    exchangeName: "binance-integration-get-data",
    frameName: "3d-get-data",
  });

  await awaitSubject.toPromise();

  // Get statistics for rejected strategy (strategy 2)
  const stats = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-get-data-2",
    exchangeName: "binance-integration-get-data",
    frameName: "3d-get-data",
  }, true);

  if (
    stats.totalRejections > 0 &&
    stats.eventList.length === stats.totalRejections &&
    stats.bySymbol["BTCUSDT"] === stats.totalRejections &&
    stats.byStrategy["test-strategy-get-data-2"] === stats.totalRejections &&
    stats.eventList.every((event) => event.rejectionNote === "Max 1 position")
  ) {
    pass(`Risk.getData returns correct stats: ${stats.totalRejections} rejections tracked`);
    return;
  }

  fail(`Incorrect stats: total=${stats.totalRejections}, events=${stats.eventList.length}`);

});


test("Risk.getReport generates markdown with correct table structure", async ({ pass, fail }) => {

  setConfig({
    CC_ENABLE_CANDLE_FETCH_MUTEX: false,
  }, true);

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
    exchangeName: "binance-integration-get-report",
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
    riskName: "max-1-position-report",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 1) {
            throw new Error("Max 1");
          }
        },
        note: "Portfolio limit reached",
      },
    ],
  });

  // Strategy 1 - will open position
  addStrategySchema({
    strategyName: "test-strategy-get-report-1",
    interval: "1m",
    riskName: "max-1-position-report",
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

  // Strategy 2 - will be rejected
  addStrategySchema({
    strategyName: "test-strategy-get-report-2",
    interval: "1m",
    riskName: "max-1-position-report",
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
    frameName: "2d-get-report",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-03T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestsDone = 0;
  listenDoneBacktest(() => {
    backtestsDone++;
    if (backtestsDone === 2) {
      awaitSubject.next();
    }
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-get-report-1",
    exchangeName: "binance-integration-get-report",
    frameName: "2d-get-report",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-get-report-2",
    exchangeName: "binance-integration-get-report",
    frameName: "2d-get-report",
  });

  await awaitSubject.toPromise();
  // await sleep(2000);

  const report = await Risk.getReport("ETHUSDT", {
    strategyName: "test-strategy-get-report-2",
    exchangeName: "binance-integration-get-report",
    frameName: "2d-get-report",
  }, true);

  // Verify report structure
  const hasTitle = report.includes("# Risk Rejection Report: ETHUSDT:test-strategy-get-report-2");
  const hasTableHeader = report.includes("| Symbol |") && report.includes("| Rejection Reason |");
  const hasSymbolColumn = report.includes("| ETHUSDT |");
  const hasReasonColumn = report.includes("Max 1");
  const hasStatistics = report.includes("**Total rejections:**");
  const hasBySymbol = report.includes("## Rejections by Symbol");
  const hasByStrategy = report.includes("## Rejections by Strategy");
  const hasIDColumn = report.includes("| ID |");

  if (hasTitle && hasTableHeader && hasSymbolColumn && hasReasonColumn && hasStatistics && hasBySymbol && hasByStrategy && hasIDColumn) {
    pass("Risk.getReport generates markdown with correct table and statistics");
    return;
  }

  fail("Report missing expected structure");

});


test("RejectionNote field captures validation note in rejection events", async ({ pass, fail }) => {

  setConfig({
    CC_ENABLE_CANDLE_FETCH_MUTEX: false,
  }, true);

  const rejectionNotes = [];

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
    exchangeName: "binance-integration-rejection-note-field",
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
    riskName: "comment-capture-risk",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 1) {
            throw new Error("Limit exceeded");
          }
        },
        note: "Custom rejection reason for testing",
      },
    ],
  });

  listenRisk((event) => {
    rejectionNotes.push(event.rejectionNote);
  });

  // Strategy 1 - will open position
  addStrategySchema({
    strategyName: "test-strategy-comment-field-1",
    interval: "1m",
    riskName: "comment-capture-risk",
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

  // Strategy 2 - will be rejected
  addStrategySchema({
    strategyName: "test-strategy-comment-field-2",
    interval: "1m",
    riskName: "comment-capture-risk",
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
    frameName: "2d-comment-field",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-03T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestsDone = 0;
  listenDoneBacktest(() => {
    backtestsDone++;
    if (backtestsDone === 2) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-comment-field-1",
    exchangeName: "binance-integration-rejection-note-field",
    frameName: "2d-comment-field",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-comment-field-2",
    exchangeName: "binance-integration-rejection-note-field",
    frameName: "2d-comment-field",
  });

  await awaitSubject.toPromise();
  // await sleep(2000);

  if (rejectionNotes.length > 0 && rejectionNotes.every((c) => c === "Limit exceeded")) {
    pass(`All ${rejectionNotes.length} rejection events captured correct rejectionNote from validation note`);
    return;
  }

  fail(`Expected rejectionNotes with note, got: ${JSON.stringify(rejectionNotes)}`);

});


test("Multiple rejection tracking with bySymbol and byStrategy statistics", async ({ pass, fail }) => {

  setConfig({
    CC_ENABLE_CANDLE_FETCH_MUTEX: false,
  }, true);

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
    exchangeName: "binance-integration-multi-stats",
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
    riskName: "shared-limit-stats",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 2) {
            throw new Error("Shared limit");
          }
        },
        note: "Shared portfolio limit",
      },
    ],
  });

  // Strategy 1 - will open position
  addStrategySchema({
    strategyName: "test-strategy-stats-1",
    interval: "1m",
    riskName: "shared-limit-stats",
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

  // Strategy 2 - will be rejected
  addStrategySchema({
    strategyName: "test-strategy-stats-2",
    interval: "1m",
    riskName: "shared-limit-stats",
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
    frameName: "3d-multi-stats",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  let backtestCount = 0;
  listenDoneBacktest(() => {
    backtestCount++;
    if (backtestCount === 4) {
      awaitSubject.next();
    }
  });

  // Run multiple symbol-strategy combinations
  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-stats-1",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-stats-1",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-stats-2",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-stats-2",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  });

  await awaitSubject.toPromise();
  await sleep(2000);

  // Check stats for all symbol-strategy pairs
  const statsBTC1 = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-stats-1",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  }, true);
  const statsBTC2 = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-stats-2",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  }, true);
  const statsETH1 = await Risk.getData("ETHUSDT", {
    strategyName: "test-strategy-stats-1",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  }, true);
  const statsETH2 = await Risk.getData("ETHUSDT", {
    strategyName: "test-strategy-stats-2",
    exchangeName: "binance-integration-multi-stats",
    frameName: "3d-multi-stats",
  }, true);

  // At least 2 out of 4 should have rejections (due to limit of 2)
  const allStats = [statsBTC1, statsBTC2, statsETH1, statsETH2];
  const pairsWithRejections = allStats.filter(s => s.totalRejections > 0);

  // Verify bySymbol and byStrategy are tracked correctly for rejected pairs
  let hasValidBySymbol = false;
  let hasValidByStrategy = false;

  for (const stats of pairsWithRejections) {
    // Check if bySymbol contains either BTCUSDT or ETHUSDT
    if (stats.bySymbol["BTCUSDT"] > 0 || stats.bySymbol["ETHUSDT"] > 0) {
      hasValidBySymbol = true;
    }
    // Check if byStrategy contains either strategy name
    if (stats.byStrategy["test-strategy-stats-1"] > 0 || stats.byStrategy["test-strategy-stats-2"] > 0) {
      hasValidByStrategy = true;
    }
  }

  if (pairsWithRejections.length >= 2 && hasValidBySymbol && hasValidByStrategy) {
    pass(`Multiple rejection tracking works: ${pairsWithRejections.length} pairs had rejections with valid bySymbol and byStrategy aggregation`);
    return;
  }

  fail(`Statistics aggregation incomplete: only ${pairsWithRejections.length} pairs had rejections, bySymbol=${hasValidBySymbol}, byStrategy=${hasValidByStrategy}`);

});

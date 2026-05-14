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
  listenDoneBacktest,
  getAveragePrice,
  listenRisk,
  listenError,
  setConfig,
  Risk,
} from "../../build/index.mjs";

import { sleep, Subject } from "functools-kit";

// NOTE: this file deliberately uses Backtest.background to demonstrate
// that it does NOT preserve risk state across concurrent backtests
// (Backtest.run clears the memoized ClientRisk instance via
// riskGlobalService.clear before each run). All 5 tests are expected
// to fail. migrate6.test.mjs uses lib.backtestCommandService.run directly
// and passes — keep both for regression coverage.

test("BG: listenRisk captures rejection events with correct data", async ({ pass, fail }) => {

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
    exchangeName: "binance-bg-listen-risk",
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
    riskName: "max-2-positions-bg",
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

  listenRisk((event) => {
    rejectionEvents.push(event);
  });

  addStrategySchema({
    strategyName: "test-strategy-bg-listen-risk-1",
    interval: "1m",
    riskName: "max-2-positions-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-listen-risk-2",
    interval: "1m",
    riskName: "max-2-positions-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-listen-risk-3",
    interval: "1m",
    riskName: "max-2-positions-bg",
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

  addFrameSchema({
    frameName: "3d-bg-listen-risk",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  listenError(() => {});

  const awaitSubject = new Subject();
  let backtestsDone = 0;
  listenDoneBacktest(() => {
    backtestsDone++;
    if (backtestsDone === 3) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bg-listen-risk-1",
    exchangeName: "binance-bg-listen-risk",
    frameName: "3d-bg-listen-risk",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bg-listen-risk-2",
    exchangeName: "binance-bg-listen-risk",
    frameName: "3d-bg-listen-risk",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bg-listen-risk-3",
    exchangeName: "binance-bg-listen-risk",
    frameName: "3d-bg-listen-risk",
  });

  await awaitSubject.toPromise();

  if (rejectionEvents.length > 0) {
    const event = rejectionEvents[0];
    const isValidStrategy =
      event.strategyName === "test-strategy-bg-listen-risk-1" ||
      event.strategyName === "test-strategy-bg-listen-risk-2" ||
      event.strategyName === "test-strategy-bg-listen-risk-3";

    if (
      event.symbol === "BTCUSDT" &&
      isValidStrategy &&
      event.exchangeName === "binance-bg-listen-risk" &&
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
  }

  fail(`Expected rejection events with correct structure, got ${rejectionEvents.length} events`);
});


test("BG: Risk.getData returns correct statistics after rejections", async ({ pass, fail }) => {

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
    exchangeName: "binance-bg-get-data",
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
    riskName: "max-1-position-data-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-get-data-1",
    interval: "1m",
    riskName: "max-1-position-data-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-get-data-2",
    interval: "1m",
    riskName: "max-1-position-data-bg",
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
    frameName: "3d-bg-get-data",
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
    strategyName: "test-strategy-bg-get-data-1",
    exchangeName: "binance-bg-get-data",
    frameName: "3d-bg-get-data",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bg-get-data-2",
    exchangeName: "binance-bg-get-data",
    frameName: "3d-bg-get-data",
  });

  await awaitSubject.toPromise();

  const stats = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-bg-get-data-2",
    exchangeName: "binance-bg-get-data",
    frameName: "3d-bg-get-data",
  }, true);

  if (
    stats.totalRejections > 0 &&
    stats.eventList.length === stats.totalRejections &&
    stats.bySymbol["BTCUSDT"] === stats.totalRejections &&
    stats.byStrategy["test-strategy-bg-get-data-2"] === stats.totalRejections &&
    stats.eventList.every((event) => event.rejectionNote === "Max 1 position")
  ) {
    pass(`Risk.getData returns correct stats: ${stats.totalRejections} rejections tracked`);
    return;
  }

  fail(`Incorrect stats: total=${stats.totalRejections}, events=${stats.eventList.length}`);
});


test("BG: Risk.getReport generates markdown with correct table structure", async ({ pass, fail }) => {

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
    exchangeName: "binance-bg-get-report",
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
    riskName: "max-1-position-report-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-get-report-1",
    interval: "1m",
    riskName: "max-1-position-report-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-get-report-2",
    interval: "1m",
    riskName: "max-1-position-report-bg",
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
    frameName: "2d-bg-get-report",
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
    strategyName: "test-strategy-bg-get-report-1",
    exchangeName: "binance-bg-get-report",
    frameName: "2d-bg-get-report",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-bg-get-report-2",
    exchangeName: "binance-bg-get-report",
    frameName: "2d-bg-get-report",
  });

  await awaitSubject.toPromise();

  const report = await Risk.getReport("ETHUSDT", {
    strategyName: "test-strategy-bg-get-report-2",
    exchangeName: "binance-bg-get-report",
    frameName: "2d-bg-get-report",
  }, true);

  const hasTitle = report.includes("# Risk Rejection Report: ETHUSDT:test-strategy-bg-get-report-2");
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


test("BG: RejectionNote field captures validation note in rejection events", async ({ pass, fail }) => {

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
    exchangeName: "binance-bg-rejection-note-field",
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
    riskName: "comment-capture-risk-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-comment-field-1",
    interval: "1m",
    riskName: "comment-capture-risk-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-comment-field-2",
    interval: "1m",
    riskName: "comment-capture-risk-bg",
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
    frameName: "2d-bg-comment-field",
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
    strategyName: "test-strategy-bg-comment-field-1",
    exchangeName: "binance-bg-rejection-note-field",
    frameName: "2d-bg-comment-field",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bg-comment-field-2",
    exchangeName: "binance-bg-rejection-note-field",
    frameName: "2d-bg-comment-field",
  });

  await awaitSubject.toPromise();

  if (rejectionNotes.length > 0 && rejectionNotes.every((c) => c === "Limit exceeded")) {
    pass(`All ${rejectionNotes.length} rejection events captured correct rejectionNote from validation note`);
    return;
  }

  fail(`Expected rejectionNotes with note, got: ${JSON.stringify(rejectionNotes)}`);
});


test("BG: Multiple rejection tracking with bySymbol and byStrategy statistics", async ({ pass, fail }) => {

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
    exchangeName: "binance-bg-multi-stats",
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
    riskName: "shared-limit-stats-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-stats-1",
    interval: "1m",
    riskName: "shared-limit-stats-bg",
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

  addStrategySchema({
    strategyName: "test-strategy-bg-stats-2",
    interval: "1m",
    riskName: "shared-limit-stats-bg",
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
    frameName: "3d-bg-multi-stats",
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

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bg-stats-1",
    exchangeName: "binance-bg-multi-stats",
    frameName: "3d-bg-multi-stats",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-bg-stats-1",
    exchangeName: "binance-bg-multi-stats",
    frameName: "3d-bg-multi-stats",
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-bg-stats-2",
    exchangeName: "binance-bg-multi-stats",
    frameName: "3d-bg-multi-stats",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-strategy-bg-stats-2",
    exchangeName: "binance-bg-multi-stats",
    frameName: "3d-bg-multi-stats",
  });

  await awaitSubject.toPromise();
  await sleep(2000);

  const statsBTC1 = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-bg-stats-1",
    exchangeName: "binance-bg-multi-stats",
    frameName: "3d-bg-multi-stats",
  }, true);
  const statsBTC2 = await Risk.getData("BTCUSDT", {
    strategyName: "test-strategy-bg-stats-2",
    exchangeName: "binance-bg-multi-stats",
    frameName: "3d-bg-multi-stats",
  }, true);
  const statsETH1 = await Risk.getData("ETHUSDT", {
    strategyName: "test-strategy-bg-stats-1",
    exchangeName: "binance-bg-multi-stats",
    frameName: "3d-bg-multi-stats",
  }, true);
  const statsETH2 = await Risk.getData("ETHUSDT", {
    strategyName: "test-strategy-bg-stats-2",
    exchangeName: "binance-bg-multi-stats",
    frameName: "3d-bg-multi-stats",
  }, true);

  const allStats = [statsBTC1, statsBTC2, statsETH1, statsETH2];
  const pairsWithRejections = allStats.filter(s => s.totalRejections > 0);

  let hasValidBySymbol = false;
  let hasValidByStrategy = false;

  for (const stats of pairsWithRejections) {
    if (stats.bySymbol["BTCUSDT"] > 0 || stats.bySymbol["ETHUSDT"] > 0) {
      hasValidBySymbol = true;
    }
    if (stats.byStrategy["test-strategy-bg-stats-1"] > 0 || stats.byStrategy["test-strategy-bg-stats-2"] > 0) {
      hasValidByStrategy = true;
    }
  }

  if (pairsWithRejections.length >= 2 && hasValidBySymbol && hasValidByStrategy) {
    pass(`Multiple rejection tracking works: ${pairsWithRejections.length} pairs had rejections with valid bySymbol and byStrategy aggregation`);
    return;
  }

  fail(`Statistics aggregation incomplete: only ${pairsWithRejections.length} pairs had rejections, bySymbol=${hasValidBySymbol}, byStrategy=${hasValidByStrategy}`);
});

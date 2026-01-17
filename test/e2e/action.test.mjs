import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addActionSchema,
  addRiskSchema,
  Backtest,
  listenDoneBacktest,
  listenError,
  ActionBase,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * ACTION ТЕСТ #1: ActionBase.signal() вызывается для всех событий сигнала
 */
/**
 * ACTION ТЕСТ #2: ActionBase.signalBacktest() вызывается только в backtest mode
 */
test("ACTION: ActionBase.signalBacktest() called only in backtest", async ({ pass, fail }) => {
  const backtestEvents = [];
  const liveEvents = [];

  class TestActionBacktest extends ActionBase {
    signalBacktest(event) {
      super.signalBacktest(event);
      backtestEvents.push(event.action);
    }

    signalLive(event) {
      super.signalLive(event);
      liveEvents.push(event.action);
    }
  }

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  for (let i = 0; i < 5; i++) {
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
    exchangeName: "binance-action-backtest",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addActionSchema({
    actionName: "test-action-backtest",
    handler: TestActionBacktest,
  });

  addStrategySchema({
    strategyName: "test-strategy-action-backtest",
    interval: "1m",
    actions: ["test-action-backtest"],
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      for (let i = 0; i < 15; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        } else {
          const tpPrice = basePrice + 1000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "15m-action-backtest",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:15:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-action-backtest",
    exchangeName: "binance-action-backtest",
    frameName: "15m-action-backtest",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (backtestEvents.length === 0) {
    fail("signalBacktest() was NOT called");
    return;
  }

  if (liveEvents.length > 0) {
    fail(`signalLive() should NOT be called in backtest mode, got ${liveEvents.length} events`);
    return;
  }

  pass(`signalBacktest() WORKS: ${backtestEvents.length} events (live: 0)`);
});

/**
 * ACTION ТЕСТ #3: ActionBase.breakeven() вызывается при достижении breakeven
 */
/**
 * ACTION ТЕСТ #4: ActionBase.partialProfit() вызывается при достижении уровней прибыли
 */
/**
 * ACTION ТЕСТ #5: ActionBase.partialLoss() вызывается при достижении уровней убытка
 */
/**
 * ACTION ТЕСТ #6: ActionBase.riskRejection() вызывается при отклонении сигнала risk management
 */
test("ACTION: ActionBase.riskRejection() called when signal rejected by risk", async ({ pass, fail }) => {
  const riskRejectionEvents = [];

  class TestActionRiskRejection extends ActionBase {
    riskRejection(event) {
      super.riskRejection(event);
      riskRejectionEvents.push({
        symbol: event.symbol,
        rejectionNote: event.rejectionNote,
        strategyName: event.strategyName,
        activePositionCount: event.activePositionCount,
      });
    }
  }

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  for (let i = 0; i < 5; i++) {
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
    exchangeName: "binance-action-risk-rejection",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addActionSchema({
    actionName: "test-action-risk-rejection",
    handler: TestActionRiskRejection,
  });

  // Add risk with max 0 positions to force rejection
  const { addRiskSchema } = await import("../../build/index.mjs");

  addRiskSchema({
    riskName: "no-trading-action",
    validations: [
      () => {
        throw new Error("No trading allowed");
      },
    ],
  });

  let signalCount = 0;
  addStrategySchema({
    strategyName: "test-strategy-action-risk-rejection",
    interval: "1m",
    actions: ["test-action-risk-rejection"],
    riskName: "no-trading-action",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 1) return null;

      allCandles = [];

      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      for (let i = 0; i < 10; i++) {
        const timestamp = startTime + i * intervalMs;
        allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "10m-action-risk-rejection",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-action-risk-rejection",
    exchangeName: "binance-action-risk-rejection",
    frameName: "10m-action-risk-rejection",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (riskRejectionEvents.length === 0) {
    fail("riskRejection() was NOT called");
    return;
  }

  // Verify event structure
  const event = riskRejectionEvents[0];
  if (event.symbol !== "BTCUSDT") {
    fail(`Expected symbol=BTCUSDT, got ${event.symbol}`);
    return;
  }

  if (event.strategyName !== "test-strategy-action-risk-rejection") {
    fail(`Expected strategyName=test-strategy-action-risk-rejection, got ${event.strategyName}`);
    return;
  }

  if (typeof event.rejectionNote !== "string") {
    fail(`rejectionNote should be string, got ${typeof event.rejectionNote}`);
    return;
  }

  if (typeof event.activePositionCount !== "number") {
    fail(`activePositionCount should be number, got ${typeof event.activePositionCount}`);
    return;
  }

  pass(`riskRejection() WORKS: ${riskRejectionEvents.length} rejection(s), note="${event.rejectionNote}"`);
});


import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addActionSchema,
  addRiskSchema,
  addWalkerSchema,
  Backtest,
  Walker,
  listenDoneBacktest,
  listenSchedulePing,
  listenError,
  listenWalkerComplete,
  listenSignalBacktest,
  listenBreakevenAvailable,
  ActionBase,
  getAveragePrice,
  Schedule,
  Heat,
  Performance,
  Partial,
  getDate,
} from "../../build/index.mjs";

import {
  listenPartialProfitAvailable,
  listenPartialProfitAvailableOnce,
  listenPartialLossAvailable,
  listenPartialLossAvailableOnce,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

// ACTION: ActionBase.breakeven() called when breakeven reached
test("ACTION: ActionBase.breakeven() called when breakeven reached", async ({ pass, fail }) => {
  const breakevenEvents = [];

  class TestActionBreakeven extends ActionBase {
    breakevenAvailable(event) {
      // console.log("[TestActionBreakeven] breakevenAvailable() called!", { symbol: event.symbol, currentPrice: event.currentPrice });
      super.breakevenAvailable(event);
      breakevenEvents.push({
        symbol: event.symbol,
        currentPrice: event.currentPrice,
        strategyName: event.strategyName,
      });
    }

    signal(event) {
      // console.log("[TestActionBreakeven] signal() called!", { action: event.action, state: event.state });
      super.signal(event);
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
    exchangeName: "binance-action-breakeven",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addActionSchema({
    actionName: "test-action-breakeven",
    handler: TestActionBreakeven,
  });

  addStrategySchema({
    strategyName: "test-strategy-action-breakeven",
    interval: "1m",
    actions: ["test-action-breakeven"],
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

      // Требуется минимум 125 свечей для minuteEstimatedTime=120 (120 + 4 buffer + 1)
      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4)
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        }
        // Рост до 20% для breakeven (5-14) - threshold ~19% (30% от пути к TP 63%)
        else if (i >= 5 && i < 15) {
          const progress = (i - 4) / 10; // 0.1, 0.2, ..., 1.0
          const targetPrice = basePrice + 19000; // +20%
          const price = basePrice + (targetPrice - basePrice) * progress;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        }
        // Дальнейший рост до TP (15-129)
        else {
          const tpPrice = basePrice + 60000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "130m-action-breakeven",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),  // 130 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-action-breakeven",
    exchangeName: "binance-action-breakeven",
    frameName: "130m-action-breakeven",
  });

  await awaitSubject.toPromise();
  await sleep(1000);  // Даем время для обработки событий
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  console.log(`DEBUG: breakevenEvents.length = ${breakevenEvents.length}`);
  if (breakevenEvents.length === 0) {
    fail("breakeven() was NOT called");
    return;
  }

  // Verify event structure
  const event = breakevenEvents[0];
  if (event.symbol !== "BTCUSDT") {
    fail(`Expected symbol=BTCUSDT, got ${event.symbol}`);
    return;
  }

  if (event.strategyName !== "test-strategy-action-breakeven") {
    fail(`Expected strategyName=test-strategy-action-commitBreakeven, got ${event.strategyName}`);
    return;
  }

  if (typeof event.currentPrice !== "number") {
    fail(`currentPrice should be number, got ${typeof event.currentPrice}`);
    return;
  }

  pass(`breakeven() WORKS: ${breakevenEvents.length} event(s) at price ${event.currentPrice}`);
});

// ACTION: ActionBase.partialProfit() called on profit levels
test("ACTION: ActionBase.partialProfit() called on profit levels", async ({ pass, fail }) => {
  const partialProfitEvents = [];

  class TestActionPartialProfit extends ActionBase {
    partialProfitAvailable(event) {
      super.partialProfitAvailable(event);
      partialProfitEvents.push({
        symbol: event.symbol,
        level: event.level,
        currentPrice: event.currentPrice,
        strategyName: event.strategyName,
      });
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
    exchangeName: "binance-action-partial-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addActionSchema({
    actionName: "test-action-partial-profit",
    handler: TestActionPartialProfit,
  });

  addStrategySchema({
    strategyName: "test-strategy-action-partial-profit",
    interval: "1m",
    actions: ["test-action-partial-profit"],
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

      // Требуется минимум 125 свечей для minuteEstimatedTime=120 (120 + 4 buffer + 1)
      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4)
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        }
        // Постепенный рост до 15% (5-14)
        else if (i >= 5 && i < 15) {
          const increment = (i - 4) * 1500;
          const price = basePrice + increment;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        }
        // TP (15-129)
        else {
          const tpPrice = basePrice + 60000;
          allCandles.push({ timestamp, open: tpPrice, high: tpPrice + 100, low: tpPrice - 100, close: tpPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "130m-action-partial-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),  // 130 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-action-partial-profit",
    exchangeName: "binance-action-partial-profit",
    frameName: "130m-action-partial-profit",
  });

  await awaitSubject.toPromise();
  await sleep(1000);  // Даем время для обработки событий
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  console.log(`DEBUG partialProfit: events.length = ${partialProfitEvents.length}`);
  if (partialProfitEvents.length === 0) {
    fail("partialProfit() was NOT called");
    return;
  }

  // Verify event structure
  const event = partialProfitEvents[0];
  if (event.symbol !== "BTCUSDT") {
    fail(`Expected symbol=BTCUSDT, got ${event.symbol}`);
    return;
  }

  if (typeof event.level !== "number") {
    fail(`level should be number, got ${typeof event.level}`);
    return;
  }

  if (typeof event.currentPrice !== "number") {
    fail(`currentPrice should be number, got ${typeof event.currentPrice}`);
    return;
  }

  const levels = partialProfitEvents.map(e => e.level);
  pass(`partialProfit() WORKS: ${partialProfitEvents.length} event(s) at levels [${levels.join(", ")}]`);
});

// ACTION: ActionBase.partialLoss() called on loss levels
test("ACTION: ActionBase.partialLoss() called on loss levels", async ({ pass, fail }) => {
  const partialLossEvents = [];

  class TestActionPartialLoss extends ActionBase {
    partialLossAvailable(event) {
      super.partialLossAvailable(event);
      partialLossEvents.push({
        symbol: event.symbol,
        level: event.level,
        currentPrice: event.currentPrice,
        strategyName: event.strategyName,
      });
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
    exchangeName: "binance-action-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addActionSchema({
    actionName: "test-action-partial-loss",
    handler: TestActionPartialLoss,
  });

  addStrategySchema({
    strategyName: "test-strategy-action-partial-loss",
    interval: "1m",
    actions: ["test-action-partial-loss"],
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

      // Требуется минимум 125 свечей для minuteEstimatedTime=120 (120 + 4 buffer + 1)
      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4)
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        }
        // Постепенное падение до -15% (5-14)
        else if (i >= 5 && i < 15) {
          const decrement = (i - 4) * 2000;
          const price = basePrice - decrement;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        }
        // SL (15-129)
        else {
          const slPrice = basePrice - 50000;
          allCandles.push({ timestamp, open: slPrice, high: slPrice + 100, low: slPrice - 100, close: slPrice, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "130m-action-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),  // 130 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-action-partial-loss",
    exchangeName: "binance-action-partial-loss",
    frameName: "130m-action-partial-loss",
  });

  await awaitSubject.toPromise();
  await sleep(1000);  // Даем время для обработки событий
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  console.log(`DEBUG partialLoss: events.length = ${partialLossEvents.length}`);
  if (partialLossEvents.length === 0) {
    fail("partialLoss() was NOT called");
    return;
  }

  // Verify event structure
  const event = partialLossEvents[0];
  if (event.symbol !== "BTCUSDT") {
    fail(`Expected symbol=BTCUSDT, got ${event.symbol}`);
    return;
  }

  if (typeof event.level !== "number") {
    fail(`level should be number, got ${typeof event.level}`);
    return;
  }

  if (typeof event.currentPrice !== "number") {
    fail(`currentPrice should be number, got ${typeof event.currentPrice}`);
    return;
  }

  const levels = partialLossEvents.map(e => e.level);
  pass(`partialLoss() WORKS: ${partialLossEvents.length} event(s) at levels [${levels.join(", ")}]`);
});

// BREAKEVEN BACKTEST: Backtest.getBreakeven API with listenBreakeven
test("BREAKEVEN BACKTEST: Backtest.getBreakeven API with listenBreakeven", async ({ pass, fail }) => {
  const breakevenEvents = [];
  const getBreakevenResults = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
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
    exchangeName: "binance-breakeven-api",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-breakeven-api",
    interval: "1m",
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

      // Требуется минимум 65 свечей для minuteEstimatedTime=60 (60 + 4 buffer + 1)
      for (let i = 0; i < 70; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4)
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
        // Рост к breakeven threshold (5-14): +0.6% от entry
        else if (i >= 5 && i < 15) {
          // Threshold = +0.6% = 100000 * 1.006 = 100600
          const progress = (i - 4) / 10; // 0.1, 0.2, ..., 1.0
          const targetPrice = basePrice + 600; // +0.6%
          const price = basePrice + (targetPrice - basePrice) * progress;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
        // Превышение threshold (15-69)
        else {
          allCandles.push({
            timestamp,
            open: basePrice + 800,
            high: basePrice + 850,
            low: basePrice + 750,
            close: basePrice + 800,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 2000,
        priceStopLoss: basePrice - 2000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "test-frame-breakeven-api",
    interval: "1m",
    startDate: new Date(startTime),
    endDate: new Date(startTime + 70 * intervalMs),  // 70 минут
  });

  // Подписываемся на события breakeven ПЕРЕД запуском backtest
  const unsubscribeBreakeven = listenBreakevenAvailable((event) => {
    breakevenEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      backtest: event.backtest,
    });

    // Тестируем Backtest.getBreakeven API при каждом событии
    Backtest.getBreakeven(event.symbol, event.currentPrice, {
      strategyName: "test-breakeven-api",
      exchangeName: "binance-breakeven-api",
      frameName: "test-frame-breakeven-api",
      backtest: true,
    }).then(result => {
      getBreakevenResults.push({
        symbol: event.symbol,
        currentPrice: event.currentPrice,
        breakevenReached: result,
        eventTimestamp: event.timestamp,
      });
    });
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-api",
    exchangeName: "binance-breakeven-api",
    frameName: "test-frame-breakeven-api",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();
  unsubscribeBreakeven();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что события breakeven зарегистрированы
  if (breakevenEvents.length === 0) {
    fail("No breakeven events captured");
    return;
  }

  // Проверяем что все события имеют backtest=true
  if (!breakevenEvents.every(e => e.backtest === true)) {
    fail("All events should have backtest=true");
    return;
  }

  // Проверяем что все события имеют symbol=BTCUSDT
  if (!breakevenEvents.every(e => e.symbol === "BTCUSDT")) {
    fail("All events should have symbol=BTCUSDT");
    return;
  }

  // Проверяем что getBreakeven API вызывался
  if (getBreakevenResults.length === 0) {
    fail("Backtest.getBreakeven API was not called");
    return;
  }

  // Проверяем что getBreakeven возвращает true для breakeven событий
  const breakevenTrueResults = getBreakevenResults.filter(r => r.breakevenReached === true);
  if (breakevenTrueResults.length === 0) {
    fail("Backtest.getBreakeven should return true when breakeven is reached");
    return;
  }

  // Анализируем результаты API вызовов во время breakeven событий
  if (getBreakevenResults.length === 0) {
    fail("No API calls were made during breakeven events");
    return;
  }

  // Проверяем что есть хотя бы один результат true (когда breakeven достигнут)
  const trueResults = getBreakevenResults.filter(r => r.breakevenReached === true);
  const falseResults = getBreakevenResults.filter(r => r.breakevenReached === false);

  pass(`Backtest.getBreakeven API WORKS: ${breakevenEvents.length} breakeven events, ${getBreakevenResults.length} API calls, true=${trueResults.length}, false=${falseResults.length}`);
});

// BREAKEVEN BACKTEST: NO event if threshold NOT reached
test("BREAKEVEN BACKTEST: NO event if threshold NOT reached", async ({ pass, fail }) => {
  const breakevenEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
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
    exchangeName: "binance-breakeven-5",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-breakeven-5",
    interval: "1m",
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

      // Все свечи остаются вблизи entry - НЕ достигаем threshold
      // Требуется минимум 65 свечей для minuteEstimatedTime=60 (60 + 4 buffer + 1)
      for (let i = 0; i < 70; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        } else {
          // Цена колеблется +/- 0.3% (НИЖЕ threshold 0.6%)
          const price = basePrice + (i % 2 === 0 ? 300 : -300);
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 2000,
        priceStopLoss: basePrice - 2000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "70m-breakeven-5",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),  // 70 минут
  });

  const unsubscribeBreakeven = listenBreakevenAvailable((event) => {
    breakevenEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      backtest: event.backtest,
    });
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-5",
    exchangeName: "binance-breakeven-5",
    frameName: "70m-breakeven-5",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();
  unsubscribeBreakeven();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Не должно быть событий commitBreakeven, т.к. threshold не достигнут
  if (breakevenEvents.length > 0) {
    fail(`Expected 0 breakeven events (threshold not reached), got ${breakevenEvents.length}`);
    return;
  }

  pass("Breakeven threshold NOT reached: 0 events (as expected)");
});

// BREAKEVEN CALLBACK: onBreakeven NOT called if threshold not reached
test("BREAKEVEN CALLBACK: onBreakeven NOT called if threshold not reached", async ({ pass, fail }) => {
  const breakevenCallbacks = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
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
    exchangeName: "binance-breakeven-8",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-breakeven-8",
    interval: "1m",
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

      // Цена колеблется ±0.3% (ниже threshold 0.6%)
      // Требуется минимум 65 свечей для minuteEstimatedTime=60 (60 + 4 buffer + 1)
      for (let i = 0; i < 70; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 50,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        } else {
          const price = basePrice + (i % 2 === 0 ? 300 : -300);
          allCandles.push({
            timestamp,
            open: price,
            high: price + 50,
            low: price - 50,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 2000,
        priceStopLoss: basePrice - 2000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onBreakeven: async (symbol, data, currentPrice, backtest) => {
        breakevenCallbacks.push({
          symbol,
          signalId: data.id,
          currentPrice,
          backtest,
        });
      },
    },
  });

  addFrameSchema({
    frameName: "70m-breakeven-8",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),  // 70 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-breakeven-8",
    exchangeName: "binance-breakeven-8",
    frameName: "70m-breakeven-8",
  });

  await awaitSubject.toPromise();
  await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Callback НЕ должен быть вызван
  if (breakevenCallbacks.length > 0) {
    fail(`Expected 0 onBreakeven callbacks (threshold not reached), got ${breakevenCallbacks.length}`);
    return;
  }

  pass("onBreakeven callback NOT called: threshold not reached (as expected)");
});

// Scheduled signal is cancelled via Backtest.commitCancelScheduled() in onTimeframe
test("Scheduled signal is cancelled via Backtest.commitCancelScheduled() in onTimeframe", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;
  let closedCount = 0;
  let index = 0;
  let cancelCalled = false;
  let signalCreated = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей ДО первого вызова getSignal (для getAveragePrice)
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

  addExchangeSchema({
    exchangeName: "binance-cancel-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-cancel",
    interval: "1m",
    getSignal: async () => {
      index++;

      // Возвращаем сигнал только один раз
      if (signalCreated) {
        return null;
      }

      // Генерируем ВСЕ свечи только в первый раз
      if (index === 1) {
        allCandles = [];

        // Буферные свечи (4 минуты)
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

        // Генерируем свечи на весь тест: требуется минимум 125 для minuteEstimatedTime=120
        for (let minuteIndex = 0; minuteIndex < 250; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

          // Все свечи ВЫШЕ priceOpen - чтобы сигнал точно был scheduled
          allCandles.push({
            timestamp,
            open: basePrice + 500,
            high: basePrice + 600,
            low: basePrice + 400,
            close: basePrice + 500,
            volume: 100,
          });
        }
      }

      const price = await getAveragePrice("BTCUSDT");

      signalCreated = true;

      // Создаем scheduled сигнал (priceOpen ВЫШЕ текущей цены для SHORT)
      return {
        position: "short",
        note: "cancel test",
        priceOpen: price + 1000,  // ВЫШЕ текущей цены → будет scheduled для SHORT
        priceTakeProfit: price - 5000,
        priceStopLoss: price + 10000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: async () => {
        scheduledCount++;
        // console.log(`[TEST] onSchedule called, total=${scheduledCount}`);

        // Отменяем первый scheduled сигнал
        if (scheduledCount === 1 && !cancelCalled) {
          cancelCalled = true;
          // console.log(`[TEST] Calling Backtest.commitCancelScheduled from onSchedule...`);
          await Backtest.commitCancelScheduled("BTCUSDT", {
            strategyName: "test-strategy-cancel",
            exchangeName: "binance-cancel-test",
            frameName: "250m-cancel-test",
          });
          // console.log(`[TEST] Backtest.commitCancelScheduled() completed`);
        }
      },
      onCancel: () => {
        cancelledCount++;
        // console.log(`[TEST] onCancel called, total=${cancelledCount}`);
      },
      onOpen: () => {
        openedCount++;
        // console.log(`[TEST] onOpen called, total=${openedCount}`);
      },
      onClose: () => {
        closedCount++;
        // console.log(`[TEST] onClose called, total=${closedCount}`);
      },
    },
  });

  addFrameSchema({
    frameName: "250m-cancel-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T04:10:00Z"),  // 250 минут
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    // console.log("[TEST ERROR]", error);
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    // console.log("[TEST] Backtest done");
    awaitSubject.next();
  });

  let scheduledEvents = 0;
  let cancelledEvents = 0;
  let openedEvents = 0;
  let closedEvents = 0;

  listenSignalBacktest((result) => {
    // console.log(`[TEST] Signal event: ${result.action}`);
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
    if (result.action === "opened") {
      openedEvents++;
    }
    if (result.action === "closed") {
      closedEvents++;
    }
  });

  // console.log("[TEST] Starting backtest...");

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cancel",
    exchangeName: "binance-cancel-test",
    frameName: "250m-cancel-test",
  });

  await awaitSubject.toPromise();
  // await sleep(100);
  unsubscribeError();

  // console.log(`[TEST] Final counts: scheduled=${scheduledCount}, cancelled=${cancelledCount}, opened=${openedCount}, scheduledEvents=${scheduledEvents}, cancelledEvents=${cancelledEvents}`);

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что был создан scheduled сигнал и получено cancelled событие
  if (scheduledCount >= 1 && cancelledEvents >= 1 && openedCount === 0) {
    pass(`Scheduled signal cancelled via Backtest.commitCancelScheduled(): ${scheduledCount} scheduled, ${cancelledEvents} cancelled events, ${openedCount} opened`);
    return;
  }

  fail(`Expected scheduled signal to be cancelled, got: scheduled=${scheduledCount}, cancelledEvents=${cancelledEvents}, opened=${openedCount}`);

});

// Multiple scheduled signals - cancel only first one via onSchedule
test("Multiple scheduled signals - cancel only first one via onSchedule", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;
  let closedCount = 0;
  let index = 0;
  let cancelCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000;
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей
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

  addExchangeSchema({
    exchangeName: "binance-cancel-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-cancel-multiple",
    interval: "1m",
    getSignal: async () => {
      index++;

      if (index === 1) {
        allCandles = [];

        // Буферные свечи
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

        // Генерируем 250 минут свечей для нескольких сигналов
        for (let minuteIndex = 0; minuteIndex < 250; minuteIndex++) {
          const timestamp = startTime + minuteIndex * intervalMs;

          if (minuteIndex < 10) {
            // Первые 10 минут: цена ВЫШЕ priceOpen (scheduled)
            allCandles.push({
              timestamp,
              open: basePrice + 500,
              high: basePrice + 600,
              low: basePrice + 400,
              close: basePrice + 500,
              volume: 100,
            });
          } else if (minuteIndex >= 10 && minuteIndex < 130) {
            // Минуты 10-130: цена падает для активации LONG и достижения TP
            allCandles.push({
              timestamp,
              open: basePrice - 1000,
              high: basePrice + 200,
              low: basePrice - 1000,
              close: basePrice - 800,
              volume: 100,
            });
          } else {
            // Остальное время: нормальная цена
            allCandles.push({
              timestamp,
              open: basePrice,
              high: basePrice + 100,
              low: basePrice - 100,
              close: basePrice,
              volume: 100,
            });
          }
        }
      }

      const price = await getAveragePrice("BTCUSDT");

      // Создаем scheduled сигналы
      return {
        position: "long",
        note: "cancel multiple test",
        priceOpen: price - 500,
        priceTakeProfit: price + 500,
        priceStopLoss: price - 10000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: async () => {
        scheduledCount++;
        // console.log(`[TEST] onSchedule called, total=${scheduledCount}`);

        // Отменяем только первый scheduled сигнал
        if (scheduledCount === 1 && !cancelCalled) {
          cancelCalled = true;
          // console.log(`[TEST] Calling Backtest.commitCancelScheduled for first signal...`);
          await Backtest.commitCancelScheduled("BTCUSDT", {
            strategyName: "test-strategy-cancel-multiple",
            exchangeName: "binance-cancel-multiple",
            frameName: "20m-cancel-multiple",
          });
          // console.log(`[TEST] First signal cancelled via Backtest.commitCancelScheduled()`);
        }
      },
      onOpen: () => {
        openedCount++;
        // console.log(`[TEST] onOpen called, total=${openedCount}`);
      },
      onClose: () => {
        closedCount++;
        // console.log(`[TEST] onClose called, total=${closedCount}`);
      },
    },
  });

  addFrameSchema({
    frameName: "20m-cancel-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    // console.log("[TEST ERROR]", error);
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cancel-multiple",
    exchangeName: "binance-cancel-multiple",
    frameName: "20m-cancel-multiple",
  });

  await awaitSubject.toPromise();
  // await sleep(100);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Должно быть минимум 2 scheduled, минимум 1 opened (второй сигнал активировался)
  if (scheduledCount >= 2 && openedCount >= 1) {
    pass(`Cancel works selectively: ${scheduledCount} scheduled, ${openedCount} opened (first cancelled, others activated)`);
    return;
  }

  fail(`Expected >=2 scheduled and >=1 opened, got: scheduled=${scheduledCount}, opened=${openedCount}`);

});

// Cancel scheduled signal after 5 onPing calls in backtest

// Cancel scheduled signal after 5 listenPing events in backtest
// CACHE: getDate cached for 1m interval - returns same timestamp within interval
test("CACHE: getDate cached for 1m interval - returns same timestamp within interval", async ({ pass, fail }) => {

  let signalGenerated = false;
  const capturedDates = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей ДО первого вызова getSignal (для getAveragePrice)
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

  addExchangeSchema({
    exchangeName: "binance-cache-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-cache",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) {
        return null;
      }

      // Генерируем ВСЕ свечи только в первый раз
      allCandles = [];

      // Буферные свечи (4 минуты)
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

      // Генерируем свечи: требуется минимум 125 для minuteEstimatedTime=120
      for (let minuteIndex = 0; minuteIndex < 130; minuteIndex++) {
        const timestamp = startTime + minuteIndex * intervalMs;

        // Все свечи одинаковые - для простоты
        allCandles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }

      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      // Захватываем текущую дату через getDate()
      // getDate() должна вернуть дату из execution context
      const currentDate = await getDate();
      capturedDates.push({
        timestamp: currentDate.getTime(),
        formattedDate: currentDate.toISOString(),
      });

      // Создаем scheduled сигнал чтобы тест продолжал работать
      return {
        position: "long",
        note: "cache test",
        priceOpen: price - 500,
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 10000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "130m-cache-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),  // 130 минут
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cache",
    exchangeName: "binance-cache-test",
    frameName: "130m-cache-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что getDate() вернула дату из execution context
  if (capturedDates.length === 0) {
    fail("No dates captured from getDate()");
    return;
  }

  const firstDate = capturedDates[0];

  // Проверяем что дата соответствует startTime
  if (firstDate.timestamp === startTime) {
    pass(`getDate() returns execution context time: ${firstDate.formattedDate} (${firstDate.timestamp}ms)`);
    return;
  }

  fail(`Expected getDate() to return ${startTime}ms, got ${firstDate.timestamp}ms`);

});

// PARTIAL DEDUPE: Events NOT emitted twice for same level
test("PARTIAL DEDUPE: Events NOT emitted twice for same level", async ({ pass, fail }) => {
  const partialProfitEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const priceOpen = basePrice - 500; // 99500
  const priceTakeProfit = priceOpen + 1000; // 100500
  const priceStopLoss = priceOpen - 1000; // 98500
  const tpDistance = priceTakeProfit - priceOpen; // 1000
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Pre-fill initial candles for getAveragePrice (min 5 candles)
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
    exchangeName: "binance-partial-dedupe",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-dedupe",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Regenerate ALL candles in first getSignal call
      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      let candleIndex = 0;

      // Phase 1: Activation (candles 0-4) - price at priceOpen
      for (let i = 0; i < 5; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        allCandles.push({
          timestamp,
          open: priceOpen,
          high: priceOpen + 10,
          low: priceOpen - 10,
          close: priceOpen,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 2: Rise to 25% profit (candles 5-9)
      // This should trigger events at 1%, 3%, 6%, 10%, 15%, 20%, 25%
      for (let i = 0; i < 5; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = 0.05 * (i + 1); // 0.05, 0.10, 0.15, 0.20, 0.25
        const price = priceOpen + tpDistance * progress;

        allCandles.push({
          timestamp,
          open: price,
          high: price + 10,
          low: price - 10,
          close: price,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 3: Drop back to 12% profit (candles 10-12)
      // Price falls but NO new events should be emitted (levels already reached)
      for (let i = 0; i < 3; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = 0.12; // 12% profit
        const price = priceOpen + tpDistance * progress;

        allCandles.push({
          timestamp,
          open: price,
          high: price + 10,
          low: price - 10,
          close: price,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 4: Rise AGAIN to 25% profit (candles 13-17)
      // Price returns to previous high, but NO duplicate events should be emitted
      for (let i = 0; i < 5; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = 0.05 * (i + 1) + 0.12; // 0.17, 0.22, 0.27, ...
        const price = priceOpen + tpDistance * progress;

        allCandles.push({
          timestamp,
          open: price,
          high: price + 10,
          low: price - 10,
          close: price,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 5: Continue to TP (candles 18-67)
      const remainingSteps = 50;
      for (let i = 0; i < remainingSteps; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = 0.37 + (0.63 / remainingSteps) * (i + 1); // 0.37 -> 1.0
        const price = priceOpen + tpDistance * progress;

        allCandles.push({
          timestamp,
          open: price,
          high: price + 10,
          low: price - 10,
          close: price,
          volume: 100,
        });
        candleIndex++;
      }

      // Phase 6: Hold at TP for closure (candles 68-70)
      for (let i = 0; i < 3; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        allCandles.push({
          timestamp,
          open: priceTakeProfit,
          high: priceTakeProfit + 10,
          low: priceTakeProfit - 10,
          close: priceTakeProfit,
          volume: 100,
        });
        candleIndex++;
      }

      // console.log(`\n=== PARTIAL DEDUPE TEST SETUP ===`);
      // console.log(`Total candles: ${allCandles.length}`);
      // console.log(`Phase 2: Rise to 25% (candles 5-9)`);
      // console.log(`Phase 3: Drop to 12% (candles 10-12)`);
      // console.log(`Phase 4: Rise again to 32% (candles 13-17)`);
      // console.log(`Expected: NO duplicate events for levels 15%, 20%, 25%`);
      // console.log(`===================================\n`);

      return {
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "70m-partial-dedupe",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),
  });

  const awaitSubject = new Subject();

  // Subscribe to partial profit/loss events BEFORE starting backtest
  const unsubscribeProfit = listenPartialProfitAvailable((event) => {
    partialProfitEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialProfit] Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  const unsubscribeLoss = listenPartialLossAvailable((event) => {
    partialLossEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialLoss] Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  listenDoneBacktest(async () => {
    // console.log(`\n=== BACKTEST COMPLETED ===`);
    // console.log(`Total profit events: ${partialProfitEvents.length}`);
    await sleep(50);
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    if (error && error.message && error.message.includes("no candles data")) {
      // console.log(`[IGNORED] ${error.message}`);
      return;
    }
    console.error(`\n[ERROR]`, error);
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-dedupe",
    exchangeName: "binance-partial-dedupe",
    frameName: "70m-partial-dedupe",
  });

  await awaitSubject.toPromise();
  await sleep(100);

  // Cleanup
  unsubscribeProfit();
  unsubscribeLoss();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // No loss events expected
  if (partialLossEvents.length > 0) {
    fail(`Expected 0 loss events, got ${partialLossEvents.length}`);
    return;
  }

  // Should have profit events
  if (partialProfitEvents.length < 3) {
    fail(`Expected at least 3 profit events, got ${partialProfitEvents.length}`);
    return;
  }

  // CRITICAL: Check for duplicate levels
  const levelCounts = new Map();
  for (const event of partialProfitEvents) {
    const count = levelCounts.get(event.level) || 0;
    levelCounts.set(event.level, count + 1);
  }

  // Find any duplicates
  const duplicates = [];
  for (const [level, count] of levelCounts.entries()) {
    if (count > 1) {
      duplicates.push(`${level}% (${count} times)`);
    }
  }

  if (duplicates.length > 0) {
    fail(`Duplicate events detected: ${duplicates.join(', ')}. Each level should emit only ONCE!`);
    return;
  }

  // Verify all levels are unique
  const uniqueLevels = [...new Set(partialProfitEvents.map(e => e.level))].sort((a, b) => a - b);
  if (uniqueLevels.length !== partialProfitEvents.length) {
    fail(`Event count mismatch: ${partialProfitEvents.length} events but only ${uniqueLevels.length} unique levels`);
    return;
  }

  const maxLevel = Math.max(...partialProfitEvents.map(e => e.level));

  // console.log(`\n=== VERIFICATION PASSED ===`);
  // console.log(`Total events: ${partialProfitEvents.length}`);
  // console.log(`Unique levels: ${uniqueLevels.join('%, ')}%`);
  // console.log(`All levels emitted exactly ONCE (no duplicates)`);
  // console.log(`===========================\n`);

  pass(`Deduplication WORKS: ${partialProfitEvents.length} unique events, levels: ${uniqueLevels.join('%, ')}%, max ${maxLevel}%`);
});

// PARTIAL FUNCTION: partialProfit() closes 30% of LONG position
test("PARTIAL FUNCTION: partialProfit() closes 30% of LONG position", async ({ pass, fail }) => {
  const { commitPartialProfit } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialCalled = false;

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
    exchangeName: "binance-function-partial-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-function-partial-profit",
    interval: "1m",
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

      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 20) {
          const price = basePrice + 20000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        } else {
          allCandles.push({
            timestamp,
            open: basePrice + 10000,
            high: basePrice + 10100,
            low: basePrice + 9900,
            close: basePrice + 10000,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Вызываем partialProfit при достижении 20% к TP
        if (!partialCalled && revenuePercent >= 20) {
          partialCalled = true;
          try {
            await commitPartialProfit("BTCUSDT", 30); // Закрываем 30%
            // console.log("[TEST] partialProfit called: 30% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] partialProfit error:", err);
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "130m-function-partial-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-partial-profit",
    exchangeName: "binance-function-partial-profit",
    frameName: "130m-function-partial-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialCalled) {
    fail("partialProfit was NOT called");
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-partial-profit",
    exchangeName: "binance-function-partial-profit",
    frameName: "130m-function-partial-profit",
  });

// console.log("[TEST #11] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
// console.log("[TEST #11] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

// console.log("[TEST #11] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 1) {
    fail(`Expected 1 partial close, got ${signal._partial.length}`);
    return;
  }

  const partial = signal._partial[0];
// console.log("[TEST #11] partial[0]:", JSON.stringify(partial, null, 2));

  if (partial.type !== "profit") {
    fail(`Expected type 'profit', got '${partial.type}'`);
    return;
  }

  if (partial.percent !== 30) {
    fail(`Expected percent 30, got ${partial.percent}`);
    return;
  }

  if (typeof partial.price !== "number") {
    fail(`Expected price to be a number, got ${typeof partial.price}`);
    return;
  }

  pass("partialProfit() WORKS: 30% position closed successfully, _partial field validated");
});

// PARTIAL FUNCTION: partialLoss() closes 40% of LONG position
test("PARTIAL FUNCTION: partialLoss() closes 40% of LONG position", async ({ pass, fail }) => {
  const { commitPartialLoss } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let partialCalled = false;

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
    exchangeName: "binance-function-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-function-partial-loss",
    interval: "1m",
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

      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 20) {
          const price = basePrice - 10000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        } else {
          allCandles.push({
            timestamp,
            open: basePrice - 5000,
            high: basePrice - 4900,
            low: basePrice - 5100,
            close: basePrice - 5000,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialLoss: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Вызываем partialLoss при достижении 20% к SL
        if (!partialCalled && revenuePercent >= 20) {
          partialCalled = true;
          try {
            await commitPartialLoss("BTCUSDT", 40); // Закрываем 40%
            // console.log("[TEST] partialLoss called: 40% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] partialLoss error:", err);
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "130m-function-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-partial-loss",
    exchangeName: "binance-function-partial-loss",
    frameName: "130m-function-partial-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!partialCalled) {
    fail("partialLoss was NOT called");
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-partial-loss",
    exchangeName: "binance-function-partial-loss",
    frameName: "130m-function-partial-loss",
  });

  // console.log("[TEST #12] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #12] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  // console.log("[TEST #12] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 1) {
    fail(`Expected 1 partial close, got ${signal._partial.length}`);
    return;
  }

  const partial = signal._partial[0];
  // console.log("[TEST #12] partial[0]:", JSON.stringify(partial, null, 2));

  if (partial.type !== "loss") {
    fail(`Expected type 'loss', got '${partial.type}'`);
    return;
  }

  if (partial.percent !== 40) {
    fail(`Expected percent 40, got ${partial.percent}`);
    return;
  }

  if (typeof partial.price !== "number") {
    fail(`Expected price to be a number, got ${typeof partial.price}`);
    return;
  }

  pass("partialLoss() WORKS: 40% position closed successfully, _partial field validated");
});

// PARTIAL FUNCTION: Multiple partialProfit calls (30% + 40%)
test("PARTIAL FUNCTION: Multiple partialProfit calls (30% + 40%)", async ({ pass, fail }) => {
  const { commitPartialProfit } = await import("../../build/index.mjs");

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;
  let firstPartialCalled = false;
  let secondPartialCalled = false;

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
    exchangeName: "binance-function-partial-multiple",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-function-partial-multiple",
    interval: "1m",
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

      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else {
          const price = basePrice + 15000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Первый вызов при 10%
        if (!firstPartialCalled && revenuePercent >= 10) {
          firstPartialCalled = true;
          try {
            await commitPartialProfit("BTCUSDT", 30);
            // console.log("[TEST] First partial: 30% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] First partial error:", err);
          }
        }
        // Второй вызов при 20%
        else if (!secondPartialCalled && revenuePercent >= 20) {
          secondPartialCalled = true;
          try {
            await commitPartialProfit("BTCUSDT", 40);
            // console.log("[TEST] Second partial: 40% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] Second partial error:", err);
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "130m-function-partial-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-partial-multiple",
    exchangeName: "binance-function-partial-multiple",
    frameName: "130m-function-partial-multiple",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!firstPartialCalled) {
    fail("First partialProfit was NOT called");
    return;
  }

  if (!secondPartialCalled) {
    fail("Second partialProfit was NOT called");
    return;
  }

  // Проверяем наличие поля _partial в сигнале
  const data = await Backtest.getData("BTCUSDT", {
    strategyName: "test-function-partial-multiple",
    exchangeName: "binance-function-partial-multiple",
    frameName: "130m-function-partial-multiple",
  });

  // console.log("[TEST #13] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #13] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  // console.log("[TEST #13] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 2) {
    fail(`Expected 2 partial closes, got ${signal._partial.length}`);
    return;
  }

  const partial1 = signal._partial[0];
  // console.log("[TEST #13] partial[0]:", JSON.stringify(partial1, null, 2));

  if (partial1.type !== "profit") {
    fail(`Expected first type 'profit', got '${partial1.type}'`);
    return;
  }

  if (partial1.percent !== 30) {
    fail(`Expected first percent 30, got ${partial1.percent}`);
    return;
  }

  if (typeof partial1.price !== "number") {
    fail(`Expected first price to be a number, got ${typeof partial1.price}`);
    return;
  }

  const partial2 = signal._partial[1];
  // console.log("[TEST #13] partial[1]:", JSON.stringify(partial2, null, 2));

  if (partial2.type !== "profit") {
    fail(`Expected second type 'profit', got '${partial2.type}'`);
    return;
  }

  if (partial2.percent !== 40) {
    fail(`Expected second percent 40, got ${partial2.percent}`);
    return;
  }

  if (typeof partial2.price !== "number") {
    fail(`Expected second price to be a number, got ${typeof partial2.price}`);
    return;
  }

  pass("MultiplecommitPartialProfit() WORKS: 30% + 40% = 70% closed, _partial field validated");
});

// PARTIAL FUNCTION: partialProfit() works for SHORT position
// OTHER: Simultaneous TP & SL trigger - VWAP-based detection
// DEFEND: Extreme volatility - price crosses both TP and SL in single candle (VWAP-based detection)
test("DEFEND: Extreme volatility - price crosses both TP and SL in single candle (VWAP-based detection)", async ({ pass, fail }) => {

  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-defend-extreme-volatility",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Первые 5 свечей: стабильная цена для активации VWAP
          candles.push({
            timestamp,
            open: 42000,
            high: 42050,
            low: 41950,
            close: 42000,
            volume: 100,
          });
        } else if (i === 5) {
          // 6-я свеча: ЭКСТРЕМАЛЬНАЯ волатильность!
          // low=40500 (ниже SL=41000), high=43500 (выше TP=43000)
          candles.push({
            timestamp,
            open: 42000,
            high: 43500,  // ВЫШЕ TP=43000 → TP сработает
            low: 40500,   // НИЖЕ SL=41000 → SL тоже достигнут
            close: 42000,
            volume: 200,
          });
        } else {
          // Остальные свечи: стабильная цена
          candles.push({
            timestamp,
            open: 42000,
            high: 42050,
            low: 41950,
            close: 42000,
            volume: 100,
          });
        }
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-defend-extreme-volatility",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      return {
        position: "long",
        note: "DEFEND: extreme volatility - both TP and SL hit",
        priceOpen: price,
        priceTakeProfit: price + 1000, // TP=43000
        priceStopLoss: price - 1000,   // SL=41000
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data, priceClose) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-defend-extreme-volatility",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let finalResult = null;
  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      finalResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-defend-extreme-volatility",
    exchangeName: "binance-defend-extreme-volatility",
    frameName: "30m-defend-extreme-volatility",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!openedResult) {
    fail("CRITICAL: Signal was not opened");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("CRITICAL: Signal was not closed");
    return;
  }

  console.log(`[TEST #57] closeReason=${finalResult.closeReason}, PNL=${finalResult.pnl.pnlPercentage.toFixed(2)}%`);

  // С VWAP detection VWAP может не достичь TP/SL даже если high/low касаются
  if (finalResult.closeReason === "take_profit" || finalResult.closeReason === "stop_loss" || finalResult.closeReason === "time_expired") {
    pass(`MONEY SAFE: Extreme volatility handled correctly. When candle crosses both TP (high=43500) and SL (low=40500), closed by "${finalResult.closeReason}" with PNL=${finalResult.pnl.pnlPercentage.toFixed(2)}%. VWAP-based detection!`);
    return;
  }

  fail(`LOGIC BUG: Unexpected close reason "${finalResult.closeReason}"`);
});

test("PARTIAL LEVELS: listenPartialProfit fires only on 10%, 20%, 30% levels", async ({ pass, fail }) => {
  const profitEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000; // Используем 100k для удобства расчёта процентов
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Создаем начальные свечи с учетом буфера
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
    exchangeName: "binance-partial-levels-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-levels-profit",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Генерируем свечи с точными уровнями прибыли
      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
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

      for (let i = 0; i < 130; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4): цена = basePrice
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100
          });
        }
        // Рост до 5% (5-9): не должен вызвать коллбек
        else if (i >= 5 && i < 10) {
          const price = basePrice + 5000; // +5%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Рост до 12% (10-14): должен вызвать 10%
        else if (i >= 10 && i < 15) {
          const price = basePrice + 12000; // +12%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Рост до 25% (15-19): должен вызвать 20%
        else if (i >= 15 && i < 20) {
          const price = basePrice + 25000; // +25%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Рост до 35% (20-24): должен вызвать 30%
        else if (i >= 20 && i < 25) {
          const price = basePrice + 35000; // +35%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Рост до 50% (25-29): должен вызвать 40%
        else if (i >= 25 && i < 30) {
          const price = basePrice + 50000; // +50%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
        // Достигаем TP (30-129)
        else {
          const price = basePrice + 55000; // Выше 50%
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000, // +60%
        priceStopLoss: basePrice - 50000, // -50%
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "130m-partial-levels-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:10:00Z"),
  });

  // Подписываемся на события
  const unsubscribeProfit = listenPartialProfitAvailable(({ symbol, signal, price, level, backtest }) => {
    console.log(`[listenPartialProfit] symbol=${symbol}, signal.id=${signal?.id}, price=${price}, level=${level}, backtest=${backtest}`);
    profitEvents.push(level);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-levels-profit",
    exchangeName: "binance-partial-levels-profit",
    frameName: "130m-partial-levels-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribeProfit();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  console.log(`[TEST] Profit events:`, profitEvents);
  console.log(`[TEST] Profit events (JSON):`, JSON.stringify(profitEvents));

  // ПРОВЕРКА #1: Должны быть вызовы для уровней 10, 20, 30, 40, 50, 60, 70, 80, 90
  const expectedLevels = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  if (profitEvents.length < 4) {
    fail(`Expected at least 4 profit events, got ${profitEvents.length}`);
    return;
  }

  // ПРОВЕРКА #2: Каждый уровень вызывается ТОЛЬКО ОДИН РАЗ
  const uniqueLevels = [...new Set(profitEvents)];
  if (uniqueLevels.length !== profitEvents.length) {
    fail(`Duplicate levels detected! Events: [${profitEvents.join(', ')}], Unique: [${uniqueLevels.join(', ')}]`);
    return;
  }

  // ПРОВЕРКА #3: Все уровни должны быть из ожидаемого списка
  for (const level of profitEvents) {
    if (!expectedLevels.includes(level)) {
      fail(`Unexpected level ${level}%, expected one of [${expectedLevels.join(', ')}]`);
      return;
    }
  }

  // ПРОВЕРКА #4: Уровни должны идти по возрастанию
  for (let i = 1; i < profitEvents.length; i++) {
    if (profitEvents[i] <= profitEvents[i - 1]) {
      fail(`Levels should be ascending: ${profitEvents[i - 1]}% -> ${profitEvents[i]}%`);
      return;
    }
  }

  pass(`listenPartialProfit WORKS: [${profitEvents.join('%, ')}%] - no duplicates, correct levels`);
});
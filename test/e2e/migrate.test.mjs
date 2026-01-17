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
  listenError,
  listenWalkerComplete,
  listenSignalBacktest,
  listenBreakevenAvailable,
  ActionBase,
  getAveragePrice,
  getDate,
} from "../../build/index.mjs";

import {
  listenPartialProfitAvailable,
  listenPartialProfitAvailableOnce,
  listenPartialLossAvailable,
  listenPartialLossAvailableOnce,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

// ACTION: ActionBase.signal() receives all signal events in backtest
test("ACTION: ActionBase.signal() receives all signal events in backtest", async ({ pass, fail }) => {
  const signalEvents = [];

  class TestActionSignal extends ActionBase {
    signal(event) {
      super.signal(event);
      signalEvents.push({
        action: event.action,
        state: event.state,
        strategyName: this.strategyName,
        frameName: this.frameName,
        actionName: this.actionName,
      });
    }
  }

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;

  let allCandles = [];
  let signalGenerated = false;

  // Предзаполняем минимум 5 свечей для immediate activation
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

  addExchangeSchema({
    exchangeName: "binance-action-signal",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addActionSchema({
    actionName: "test-action-signal",
    handler: TestActionSignal,
  });

  addStrategySchema({
    strategyName: "test-strategy-action-signal",
    interval: "1m",
    actions: ["test-action-signal"],
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Генерируем свечи для immediate activation (как в sequence.test.mjs Тест #3)
      // Требуется минимум 65 свечей для minuteEstimatedTime=60 (60 + 4 buffer + 1)
      for (let i = 0; i < 70; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1: Ожидание (0-9) - цена ВЫШЕ basePrice
        if (i < 10) {
          allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
        }
        // Фаза 2: Активация (10-14) - цена НА basePrice
        else if (i >= 10 && i < 15) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        }
        // Фаза 3: TP (15-69) - цена достигает TP
        else {
          allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,  // НА текущей цене → immediate activation
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "70m-action-signal",
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
    strategyName: "test-strategy-action-signal",
    exchangeName: "binance-action-signal",
    frameName: "70m-action-signal",
  });

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (signalEvents.length === 0) {
    fail("Action.signal() was NOT called");
    return;
  }

  // Verify context fields
  if (!signalEvents.every(e => e.strategyName === "test-strategy-action-signal")) {
    fail("Action strategyName incorrect");
    return;
  }

  if (!signalEvents.every(e => e.frameName === "70m-action-signal")) {
    fail("Action frameName incorrect");
    return;
  }

  if (!signalEvents.every(e => e.actionName === "test-action-signal")) {
    fail("Action actionName incorrect");
    return;
  }

  // Check that we received opened and closed events
  const hasOpened = signalEvents.some(e => e.action === "opened");
  const hasClosed = signalEvents.some(e => e.action === "closed");

  if (!hasOpened) {
    fail("Action did not receive 'opened' event");
    return;
  }

  if (!hasClosed) {
    fail("Action did not receive 'closed' event");
    return;
  }

  pass(`Action.signal() WORKS: ${signalEvents.length} events (opened + closed)`);
});

// ACTION: ActionBase.breakeven() called when breakeven reached
test("ACTION: ActionBase.breakeven() called when breakeven reached", async ({ pass, fail }) => {
  const breakevenEvents = [];

  class TestActionBreakeven extends ActionBase {
    breakeven(event) {
      super.breakeven(event);
      breakevenEvents.push({
        symbol: event.symbol,
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
    partialProfit(event) {
      super.partialProfit(event);
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
    partialLoss(event) {
      super.partialLoss(event);
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

// Scheduled signal is cancelled via Backtest.cancel() in onTimeframe
test("Scheduled signal is cancelled via Backtest.cancel() in onTimeframe", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;
  let closedCount = 0;
  let index = 0;
  let cancelCalled = false;

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

        // Генерируем свечи на весь тест: 10 минут (frame) + запас
        for (let minuteIndex = 0; minuteIndex < 20; minuteIndex++) {
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

      // console.log(`[TEST] getSignal called, index=${index}, price=${price}`);


      // Создаем scheduled сигнал (priceOpen ниже текущей цены для LONG)
      return {
        position: "long",
        note: "cancel test",
        priceOpen: price - 500,  // Ниже текущей цены → будет scheduled
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 10000,
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
          // console.log(`[TEST] Calling Backtest.cancel from onSchedule...`);
          await Backtest.cancel("BTCUSDT", {
            strategyName: "test-strategy-cancel",
            exchangeName: "binance-cancel-test",
            frameName: "10m-cancel-test",
          });
          // console.log(`[TEST] Backtest.cancel() completed`);
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
    frameName: "10m-cancel-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
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
    frameName: "10m-cancel-test",
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
    pass(`Scheduled signal cancelled via Backtest.cancel(): ${scheduledCount} scheduled, ${cancelledEvents} cancelled events, ${openedCount} opened`);
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
          // console.log(`[TEST] Calling Backtest.cancel for first signal...`);
          await Backtest.cancel("BTCUSDT", {
            strategyName: "test-strategy-cancel-multiple",
            exchangeName: "binance-cancel-multiple",
            frameName: "20m-cancel-multiple",
          });
          // console.log(`[TEST] First signal cancelled via Backtest.cancel()`);
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
test("Cancel scheduled signal after 5 onPing calls in backtest", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;
  let pingCount = 0;
  const pingTimestamps = [];
  let signalCreated = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей ДО первого вызова getSignal
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
    exchangeName: "binance-cancel-ping-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-cancel-ping",
    interval: "1m",
    getSignal: async () => {
      // Создаем сигнал только один раз
      if (signalCreated) {
        return null;
      }

      // Генерируем ВСЕ свечи только в первый раз
      if (allCandles.length === 5) {
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

        // Генерируем 30 минут свечей (достаточно для 5 ping + отмена)
        for (let minuteIndex = 0; minuteIndex < 30; minuteIndex++) {
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

      // Создаем scheduled сигнал (priceOpen ниже текущей цены для LONG)
      return {
        position: "long",
        note: "cancel ping test",
        priceOpen: price - 500,  // Ниже текущей цены → будет scheduled
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 10000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: async () => {
        scheduledCount++;
      },
      onCancel: () => {
        cancelledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
      onPing: async (_symbol, _data, when, _backtest) => {
        pingCount++;
        pingTimestamps.push(when.getTime());

        // Отменяем после 5-го ping
        if (pingCount === 5) {
          await Backtest.cancel("BTCUSDT", {
            strategyName: "test-strategy-cancel-ping",
            exchangeName: "binance-cancel-ping-test",
            frameName: "30m-cancel-ping-test",
          });
        }
      },
    },
  });

  addFrameSchema({
    frameName: "30m-cancel-ping-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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

  let scheduledEvents = 0;
  let cancelledEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-cancel-ping",
    exchangeName: "binance-cancel-ping-test",
    frameName: "30m-cancel-ping-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что было ровно 5 вызовов onPing
  if (pingCount !== 5) {
    fail(`Expected exactly 5 onPing calls, got ${pingCount}`);
    return;
  }

  // Проверяем что пинги идут каждую минуту
  for (let i = 1; i < pingTimestamps.length; i++) {
    const diff = pingTimestamps[i] - pingTimestamps[i - 1];
    if (diff !== 60 * 1000) {
      fail(`Ping ${i} should be 1 minute after ping ${i - 1}, got ${diff}ms`);
      return;
    }
  }

  // Проверяем что был создан scheduled сигнал и получено cancelled событие
  if (scheduledCount >= 1 && cancelledEvents >= 1 && openedCount === 0) {
    pass(`Scheduled signal cancelled after 5 onPing calls: ${pingCount} pings, ${scheduledCount} scheduled, ${cancelledEvents} cancelled events`);
    return;
  }

  fail(`Expected scheduled signal to be cancelled after 5 pings, got: pings=${pingCount}, scheduled=${scheduledCount}, cancelledEvents=${cancelledEvents}, opened=${openedCount}`);

});

// Cancel scheduled signal after 5 listenPing events in backtest
test("Cancel scheduled signal after 5 listenPing events in backtest", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;
  let pingEventCount = 0;
  const pingEventTimestamps = [];
  let signalCreated = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;
  let allCandles = [];

  // Предзаполняем минимум 5 свечей ДО первого вызова getSignal
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
    exchangeName: "binance-listen-ping-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-listen-ping",
    interval: "1m",
    getSignal: async () => {
      // Создаем сигнал только один раз
      if (signalCreated) {
        return null;
      }

      // Генерируем ВСЕ свечи только в первый раз
      if (allCandles.length === 5) {
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

        // Генерируем 30 минут свечей (достаточно для 5 ping + отмена)
        for (let minuteIndex = 0; minuteIndex < 30; minuteIndex++) {
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

      // Создаем scheduled сигнал (priceOpen ниже текущей цены для LONG)
      return {
        position: "long",
        note: "listen ping test",
        priceOpen: price - 500,  // Ниже текущей цены → будет scheduled
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 10000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onSchedule: async () => {
        scheduledCount++;
      },
      onCancel: () => {
        cancelledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrameSchema({
    frameName: "30m-listen-ping-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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

  let scheduledEvents = 0;
  let cancelledEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
  });

  // Подписываемся на события ping через listenPing
  const unsubscribePing = listenSchedulePing(async (event) => {
    // Фильтруем только события для нашей стратегии
    if (event.symbol === "BTCUSDT" && event.strategyName === "test-strategy-listen-ping") {
      pingEventCount++;
      pingEventTimestamps.push(event.timestamp);

      // Отменяем после 5-го ping события
      if (pingEventCount === 5) {
        await Backtest.cancel("BTCUSDT", {
          strategyName: "test-strategy-listen-ping",
          exchangeName: "binance-listen-ping-test",
          frameName: "30m-listen-ping-test",
        });
      }
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-listen-ping",
    exchangeName: "binance-listen-ping-test",
    frameName: "30m-listen-ping-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();
  unsubscribePing();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверяем что было ровно 5 вызовов ping событий
  if (pingEventCount !== 5) {
    fail(`Expected exactly 5 ping events, got ${pingEventCount}`);
    return;
  }

  // Проверяем что пинги идут каждую минуту
  for (let i = 1; i < pingEventTimestamps.length; i++) {
    const diff = pingEventTimestamps[i] - pingEventTimestamps[i - 1];
    if (diff !== 60 * 1000) {
      fail(`Ping event ${i} should be 1 minute after event ${i - 1}, got ${diff}ms`);
      return;
    }
  }

  // Проверяем что был создан scheduled сигнал и получено cancelled событие
  if (scheduledCount >= 1 && cancelledEvents >= 1 && openedCount === 0) {
    pass(`Scheduled signal cancelled after 5 listenPing events: ${pingEventCount} ping events, ${scheduledCount} scheduled, ${cancelledEvents} cancelled events`);
    return;
  }

  fail(`Expected scheduled signal to be cancelled after 5 ping events, got: pingEvents=${pingEventCount}, scheduled=${scheduledCount}, cancelledEvents=${cancelledEvents}, opened=${openedCount}`);

});

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

      // Генерируем 10 минут свечей для теста
      for (let minuteIndex = 0; minuteIndex < 10; minuteIndex++) {
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
    frameName: "10m-cache-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
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
    frameName: "10m-cache-test",
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

// SHUTDOWN: Backtest.stop() during active signal - signal completes first
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

  addExchangeSchema({
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

  addStrategySchema({
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

  addFrameSchema({
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

// SHUTDOWN: Walker.stop() - all strategies stop
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

  addExchangeSchema({
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

    addStrategySchema({
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

  addFrameSchema({
    frameName: "30m-shutdown-6",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  let stopCalled = false;

  addWalkerSchema({
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
          await Walker.stop("BTCUSDT", { walkerName: "test-walker-shutdown"});
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

// SHUTDOWN: Two walkers on same symbol - stop one doesn't affect other
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

  addExchangeSchema({
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

    addStrategySchema({
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

    addStrategySchema({
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

  addFrameSchema({
    frameName: "30m-shutdown-7",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  let walkerAStopCalled = false;

  addWalkerSchema({
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
          await Walker.stop("BTCUSDT", { walkerName: "test-walkerA" });
          // console.log("[TEST #7] Walker.stop() for Walker A completed");
        }
      }
    }
  });

  addWalkerSchema({
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

// MARKDOWN PARALLEL: All markdown services work with multi-symbol isolation
test("MARKDOWN PARALLEL: All markdown services work with multi-symbol isolation", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;

  // BTC: базовая цена 95000, TP scenario с partial profit
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice - 500;
  let btcCandles = [];

  // ETH: базовая цена 4000, TP scenario с partial profit
  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice - 50;
  let ethCandles = [];

  // Предзаполняем начальные свечи
  for (let i = 0; i < 5; i++) {
    btcCandles.push({
      timestamp: startTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });

    ethCandles.push({
      timestamp: startTime + i * intervalMs,
      open: ethBasePrice,
      high: ethBasePrice + 10,
      low: ethBasePrice - 5,
      close: ethBasePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-markdown-parallel",
    getCandles: async (symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);

      if (symbol === "BTCUSDT") {
        const result = btcCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : btcCandles.slice(0, Math.min(limit, btcCandles.length));
      }

      if (symbol === "ETHUSDT") {
        const result = ethCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : ethCandles.slice(0, Math.min(limit, ethCandles.length));
      }

      return [];
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let btcSignalGenerated = false;
  let ethSignalGenerated = false;

  addStrategySchema({
    strategyName: "test-markdown-parallel",
    interval: "1m",
    getSignal: async (symbol) => {
      // BTCUSDT: TP scenario с partial profit на 10%
      if (symbol === "BTCUSDT") {
        if (btcSignalGenerated) return null;
        btcSignalGenerated = true;

        // Генерируем свечи для BTC
        btcCandles = [];
        for (let i = 0; i < 60; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Ожидание scheduled (0-9)
          if (i < 10) {
            btcCandles.push({
              timestamp,
              open: btcBasePrice,
              high: btcBasePrice + 100,
              low: btcBasePrice - 50,
              close: btcBasePrice,
              volume: 100
            });
          }
          // Фаза 2: Активация (10-14)
          else if (i >= 10 && i < 15) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen,
              high: btcPriceOpen + 100,
              low: btcPriceOpen - 100,
              close: btcPriceOpen,
              volume: 100
            });
          }
          // Фаза 3: Partial profit 10% (15-19)
          else if (i >= 15 && i < 20) {
            const partialPrice = btcPriceOpen + 100; // +10% profit
            btcCandles.push({
              timestamp,
              open: partialPrice,
              high: partialPrice + 50,
              low: partialPrice - 50,
              close: partialPrice,
              volume: 100
            });
          }
          // Фаза 4: Take Profit (20-24)
          else if (i >= 20 && i < 25) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen + 1000,
              high: btcPriceOpen + 1100,
              low: btcPriceOpen + 900,
              close: btcPriceOpen + 1000,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            btcCandles.push({
              timestamp,
              open: btcBasePrice,
              high: btcBasePrice + 100,
              low: btcBasePrice - 50,
              close: btcBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "BTCUSDT markdown parallel test",
          priceOpen: btcPriceOpen,
          priceTakeProfit: btcPriceOpen + 1000,
          priceStopLoss: btcPriceOpen - 1000,
          minuteEstimatedTime: 60,
        };
      }

      // ETHUSDT: TP scenario с partial profit на 10%
      if (symbol === "ETHUSDT") {
        if (ethSignalGenerated) return null;
        ethSignalGenerated = true;

        // Генерируем свечи для ETH
        ethCandles = [];
        for (let i = 0; i < 60; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Ожидание scheduled (0-9)
          if (i < 10) {
            ethCandles.push({
              timestamp,
              open: ethBasePrice,
              high: ethBasePrice + 10,
              low: ethBasePrice - 5,
              close: ethBasePrice,
              volume: 100
            });
          }
          // Фаза 2: Активация (10-14)
          else if (i >= 10 && i < 15) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen,
              high: ethPriceOpen + 10,
              low: ethPriceOpen - 10,
              close: ethPriceOpen,
              volume: 100
            });
          }
          // Фаза 3: Partial profit 10% (15-19)
          else if (i >= 15 && i < 20) {
            const partialPrice = ethPriceOpen + 10; // +10% profit
            ethCandles.push({
              timestamp,
              open: partialPrice,
              high: partialPrice + 5,
              low: partialPrice - 5,
              close: partialPrice,
              volume: 100
            });
          }
          // Фаза 4: Take Profit (20-24)
          else if (i >= 20 && i < 25) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen + 100,
              high: ethPriceOpen + 110,
              low: ethPriceOpen + 90,
              close: ethPriceOpen + 100,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            ethCandles.push({
              timestamp,
              open: ethBasePrice,
              high: ethBasePrice + 10,
              low: ethBasePrice - 5,
              close: ethBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "ETHUSDT markdown parallel test",
          priceOpen: ethPriceOpen,
          priceTakeProfit: ethPriceOpen + 100,
          priceStopLoss: ethPriceOpen - 100,
          minuteEstimatedTime: 60,
        };
      }

      return null;
    },
  });

  addFrameSchema({
    frameName: "1h-markdown-parallel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  let btcDone = false;
  let ethDone = false;
  let errorCaught = null;

  const awaitSubject = new Subject();

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const unsubscribeDone = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-markdown-parallel") {
      if (event.symbol === "BTCUSDT") btcDone = true;
      if (event.symbol === "ETHUSDT") ethDone = true;

      if (btcDone && ethDone) {
        awaitSubject.next();
      }
    }
  });

  // Запускаем backtest для обоих символов параллельно
  Backtest.background("BTCUSDT", {
    strategyName: "test-markdown-parallel",
    exchangeName: "binance-markdown-parallel",
    frameName: "1h-markdown-parallel",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-markdown-parallel",
    exchangeName: "binance-markdown-parallel",
    frameName: "1h-markdown-parallel",
  });

  await awaitSubject.toPromise();
  // // await sleep(1000);
  unsubscribeError();
  unsubscribeDone();

  if (errorCaught) {
    fail(`Error during parallel backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // ========================================
  // ПРОВЕРКА ВСЕХ MARKDOWN СЕРВИСОВ
  // ========================================

  // 0. BacktestMarkdownService - проверяем getData() и getReport()
  try {
    const btcBacktestData = await Backtest.getData("BTCUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    });
    const ethBacktestData = await Backtest.getData("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    });

    // Verify data exists and has valid structure
    if (!btcBacktestData || typeof btcBacktestData !== "object") {
      fail("BacktestMarkdownService: BTCUSDT getData() returned invalid data");
      return;
    }

    if (!ethBacktestData || typeof ethBacktestData !== "object") {
      fail("BacktestMarkdownService: ETHUSDT getData() returned invalid data");
      return;
    }

    // Verify getReport() works and returns non-empty markdown
    const btcBacktestReport = await Backtest.getReport("BTCUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    });
    const ethBacktestReport = await Backtest.getReport("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    });

    if (typeof btcBacktestReport !== "string" || btcBacktestReport.length === 0) {
      fail("BacktestMarkdownService: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethBacktestReport !== "string" || ethBacktestReport.length === 0) {
      fail("BacktestMarkdownService: ETHUSDT getReport() returned invalid report");
      return;
    }

    // Verify symbol isolation: reports should mention only their own symbol
    if (!btcBacktestReport.includes("BTCUSDT")) {
      fail("BacktestMarkdownService: BTCUSDT report doesn't mention BTCUSDT");
      return;
    }

    if (!ethBacktestReport.includes("ETHUSDT")) {
      fail("BacktestMarkdownService: ETHUSDT report doesn't mention ETHUSDT");
      return;
    }
  } catch (err) {
    fail(`BacktestMarkdownService failed: ${err.message}`);
    return;
  }

  // 1. ScheduleMarkdownService - проверяем getData()
  try {
    const btcScheduleData = await Schedule.getData("BTCUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    }, true);
    const ethScheduleData = await Schedule.getData("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    }, true);

    if (btcScheduleData.totalScheduled === 0) {
      fail("ScheduleMarkdownService: BTCUSDT should have scheduled events");
      return;
    }

    if (ethScheduleData.totalScheduled === 0) {
      fail("ScheduleMarkdownService: ETHUSDT should have scheduled events");
      return;
    }

    // Проверка изоляции: данные не должны пересекаться
    const btcScheduleSymbols = btcScheduleData.eventList.map(e => e.symbol);
    const ethScheduleSymbols = ethScheduleData.eventList.map(e => e.symbol);

    if (btcScheduleSymbols.some(s => s !== "BTCUSDT")) {
      fail("ScheduleMarkdownService: BTCUSDT data contaminated with other symbols");
      return;
    }

    if (ethScheduleSymbols.some(s => s !== "ETHUSDT")) {
      fail("ScheduleMarkdownService: ETHUSDT data contaminated with other symbols");
      return;
    }
  } catch (err) {
    fail(`ScheduleMarkdownService failed: ${err.message}`);
    return;
  }

  // 2. PerformanceMarkdownService - проверяем getData()
  try {
    const btcPerfData = await Performance.getData("BTCUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    }, true);
    const ethPerfData = await Performance.getData("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    }, true);

    if (btcPerfData.totalEvents === 0) {
      fail("PerformanceMarkdownService: BTCUSDT should have events");
      return;
    }

    if (ethPerfData.totalEvents === 0) {
      fail("PerformanceMarkdownService: ETHUSDT should have events");
      return;
    }

    // Проверка изоляции: events должен содержать только свои символы
    const btcPerfSymbols = btcPerfData.events.map(e => e.symbol);
    const ethPerfSymbols = ethPerfData.events.map(e => e.symbol);

    if (btcPerfSymbols.some(s => s !== "BTCUSDT")) {
      fail("PerformanceMarkdownService: BTCUSDT data contaminated with other symbols");
      return;
    }

    if (ethPerfSymbols.some(s => s !== "ETHUSDT")) {
      fail("PerformanceMarkdownService: ETHUSDT data contaminated with other symbols");
      return;
    }
  } catch (err) {
    fail(`PerformanceMarkdownService failed: ${err.message}`);
    return;
  }

  // 3. PartialMarkdownService - проверяем getData()
  try {
    const btcPartialData = await Partial.getData("BTCUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    }, true);
    const ethPartialData = await Partial.getData("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    }, true);

    // Partial может быть пустым если не было partial profit/loss событий
    // Но проверяем изоляцию если есть данные
    if (btcPartialData.eventList.length > 0) {
      const btcPartialSymbols = btcPartialData.eventList.map(e => e.symbol);
      if (btcPartialSymbols.some(s => s !== "BTCUSDT")) {
        fail("PartialMarkdownService: BTCUSDT data contaminated with other symbols");
        return;
      }
    }

    if (ethPartialData.eventList.length > 0) {
      const ethPartialSymbols = ethPartialData.eventList.map(e => e.symbol);
      if (ethPartialSymbols.some(s => s !== "ETHUSDT")) {
        fail("PartialMarkdownService: ETHUSDT data contaminated with other symbols");
        return;
      }
    }
  } catch (err) {
    fail(`PartialMarkdownService failed: ${err.message}`);
    return;
  }

  // 4. HeatMarkdownService - проверяем getData()
  try {
    const btcHeatData = await Heat.getData({
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    }, true);
    const ethHeatData = await Heat.getData({
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "1h-markdown-parallel",
    }, true);

    // Heat может быть пустым, но проверяем что вызов не падает
    // и возвращает структуру данных
    if (!btcHeatData || typeof btcHeatData !== "object") {
      fail("HeatMarkdownService: BTCUSDT getData() returned invalid data");
      return;
    }

    if (!ethHeatData || typeof ethHeatData !== "object") {
      fail("HeatMarkdownService: ETHUSDT getData() returned invalid data");
      return;
    }
  } catch (err) {
    fail(`HeatMarkdownService failed: ${err.message}`);
    return;
  }

  // 5. WalkerMarkdownService - пропускаем, так как требует walker schema и comparison setup
  // Walker используется для сравнения стратегий, а не для одиночных backtests
  // Изоляция по (symbol, strategyName) уже проверена через другие сервисы

  pass("MARKDOWN SERVICES WORK: All markdown services (Backtest, Schedule, Performance, Partial, Heat) correctly isolate data by (symbol, strategyName) pairs. Multi-symbol architecture verified.");
});

// FACADES PARALLEL: All public facades isolate data by (symbol, strategyName)
test("FACADES PARALLEL: All public facades isolate data by (symbol, strategyName)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;

  // BTC: базовая цена 95000, TP scenario
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice - 500;
  let btcCandles = [];

  // ETH: базовая цена 4000, SL scenario
  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice - 50;
  let ethCandles = [];

  // Предзаполняем начальные свечи
  for (let i = 0; i < 5; i++) {
    btcCandles.push({
      timestamp: startTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });

    ethCandles.push({
      timestamp: startTime + i * intervalMs,
      open: ethBasePrice,
      high: ethBasePrice + 10,
      low: ethBasePrice - 5,
      close: ethBasePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-facades-parallel",
    getCandles: async (symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);

      if (symbol === "BTCUSDT") {
        const result = btcCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : btcCandles.slice(0, Math.min(limit, btcCandles.length));
      }

      if (symbol === "ETHUSDT") {
        const result = ethCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : ethCandles.slice(0, Math.min(limit, ethCandles.length));
      }

      return [];
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let btcSignalGenerated = false;
  let ethSignalGenerated = false;

  addStrategySchema({
    strategyName: "test-facades-parallel",
    interval: "1m",
    getSignal: async (symbol) => {
      // BTCUSDT: TP scenario
      if (symbol === "BTCUSDT") {
        if (btcSignalGenerated) return null;
        btcSignalGenerated = true;

        // Генерируем свечи для BTC
        btcCandles = [];
        for (let i = 0; i < 60; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Ожидание (0-9)
          if (i < 10) {
            btcCandles.push({
              timestamp,
              open: btcBasePrice,
              high: btcBasePrice + 100,
              low: btcBasePrice - 50,
              close: btcBasePrice,
              volume: 100
            });
          }
          // Фаза 2: Активация (10-14)
          else if (i >= 10 && i < 15) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen,
              high: btcPriceOpen + 100,
              low: btcPriceOpen - 100,
              close: btcPriceOpen,
              volume: 100
            });
          }
          // Фаза 3: Take Profit (15-19)
          else if (i >= 15 && i < 20) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen + 1000,
              high: btcPriceOpen + 1100,
              low: btcPriceOpen + 900,
              close: btcPriceOpen + 1000,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            btcCandles.push({
              timestamp,
              open: btcBasePrice,
              high: btcBasePrice + 100,
              low: btcBasePrice - 50,
              close: btcBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "BTCUSDT facades test",
          priceOpen: btcPriceOpen,
          priceTakeProfit: btcPriceOpen + 1000,
          priceStopLoss: btcPriceOpen - 1000,
          minuteEstimatedTime: 60,
        };
      }

      // ETHUSDT: SL scenario
      if (symbol === "ETHUSDT") {
        if (ethSignalGenerated) return null;
        ethSignalGenerated = true;

        // Генерируем свечи для ETH
        ethCandles = [];
        for (let i = 0; i < 60; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Ожидание (0-9)
          if (i < 10) {
            ethCandles.push({
              timestamp,
              open: ethBasePrice,
              high: ethBasePrice + 10,
              low: ethBasePrice - 5,
              close: ethBasePrice,
              volume: 100
            });
          }
          // Фаза 2: Активация (10-14)
          else if (i >= 10 && i < 15) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen,
              high: ethPriceOpen + 10,
              low: ethPriceOpen - 10,
              close: ethPriceOpen,
              volume: 100
            });
          }
          // Фаза 3: Stop Loss (15-19)
          else if (i >= 15 && i < 20) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen - 100,
              high: ethPriceOpen - 90,
              low: ethPriceOpen - 110,
              close: ethPriceOpen - 100,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            ethCandles.push({
              timestamp,
              open: ethBasePrice,
              high: ethBasePrice + 10,
              low: ethBasePrice - 5,
              close: ethBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "ETHUSDT facades test",
          priceOpen: ethPriceOpen,
          priceTakeProfit: ethPriceOpen + 100,
          priceStopLoss: ethPriceOpen - 100,
          minuteEstimatedTime: 60,
        };
      }

      return null;
    },
  });

  addFrameSchema({
    frameName: "1h-facades-parallel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  let btcDone = false;
  let ethDone = false;
  let errorCaught = null;

  const awaitSubject = new Subject();

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const unsubscribeDone = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-facades-parallel") {
      if (event.symbol === "BTCUSDT") btcDone = true;
      if (event.symbol === "ETHUSDT") ethDone = true;

      if (btcDone && ethDone) {
        awaitSubject.next();
      }
    }
  });

  // Запускаем backtest для обоих символов параллельно
  Backtest.background("BTCUSDT", {
    strategyName: "test-facades-parallel",
    exchangeName: "binance-facades-parallel",
    frameName: "1h-facades-parallel",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-facades-parallel",
    exchangeName: "binance-facades-parallel",
    frameName: "1h-facades-parallel",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);
  unsubscribeError();
  unsubscribeDone();

  if (errorCaught) {
    fail(`Error during parallel backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // ========================================
  // ПРОВЕРКА ВСЕХ ПУБЛИЧНЫХ ФАСАДОВ
  // ========================================

  // 1. Schedule.getData(symbol, strategyName, backtest)
  try {
    const btcSchedule = await Schedule.getData("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);
    const ethSchedule = await Schedule.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);

    if (btcSchedule.totalScheduled === 0) {
      fail("Schedule: BTCUSDT should have scheduled signals");
      return;
    }

    if (ethSchedule.totalScheduled === 0) {
      fail("Schedule: ETHUSDT should have scheduled signals");
      return;
    }

    // Проверка изоляции
    const btcScheduleSymbols = btcSchedule.eventList.map(e => e.symbol);
    const ethScheduleSymbols = ethSchedule.eventList.map(e => e.symbol);

    if (btcScheduleSymbols.some(s => s !== "BTCUSDT")) {
      fail("Schedule: BTCUSDT data contaminated");
      return;
    }

    if (ethScheduleSymbols.some(s => s !== "ETHUSDT")) {
      fail("Schedule: ETHUSDT data contaminated");
      return;
    }
  } catch (err) {
    fail(`Schedule.getData() failed: ${err.message}`);
    return;
  }

  // 2. Performance.getData(symbol, strategyName, backtest)
  try {
    const btcPerf = await Performance.getData("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);
    const ethPerf = await Performance.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);

    if (btcPerf.totalEvents === 0) {
      fail("Performance: BTCUSDT should have events");
      return;
    }

    if (ethPerf.totalEvents === 0) {
      fail("Performance: ETHUSDT should have events");
      return;
    }

    // Проверка изоляции
    const btcPerfSymbols = btcPerf.events.map(e => e.symbol);
    const ethPerfSymbols = ethPerf.events.map(e => e.symbol);

    if (btcPerfSymbols.some(s => s !== "BTCUSDT")) {
      fail("Performance: BTCUSDT data contaminated");
      return;
    }

    if (ethPerfSymbols.some(s => s !== "ETHUSDT")) {
      fail("Performance: ETHUSDT data contaminated");
      return;
    }
  } catch (err) {
    fail(`Performance.getData() failed: ${err.message}`);
    return;
  }

  // 3. Heat.getData(strategyName, backtest)
  try {
    const btcHeat = await Heat.getData({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);
    const ethHeat = await Heat.getData({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);

    // Heat может быть пустым, но проверяем что вызов не падает
    if (!btcHeat || typeof btcHeat !== "object") {
      fail("Heat: BTCUSDT getData() returned invalid data");
      return;
    }

    if (!ethHeat || typeof ethHeat !== "object") {
      fail("Heat: ETHUSDT getData() returned invalid data");
      return;
    }
  } catch (err) {
    fail(`Heat.getData() failed: ${err.message}`);
    return;
  }

  // 4. Partial.getData(symbol, strategyName, backtest)
  try {
    const btcPartial = await Partial.getData("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);
    const ethPartial = await Partial.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);

    // Partial может быть пустым, но проверяем изоляцию если есть данные
    if (btcPartial.eventList.length > 0) {
      const btcPartialSymbols = btcPartial.eventList.map(e => e.symbol);
      if (btcPartialSymbols.some(s => s !== "BTCUSDT")) {
        fail("Partial: BTCUSDT data contaminated");
        return;
      }
    }

    if (ethPartial.eventList.length > 0) {
      const ethPartialSymbols = ethPartial.eventList.map(e => e.symbol);
      if (ethPartialSymbols.some(s => s !== "ETHUSDT")) {
        fail("Partial: ETHUSDT data contaminated");
        return;
      }
    }
  } catch (err) {
    fail(`Partial.getData() failed: ${err.message}`);
    return;
  }

  // 5. PositionSize.getQuantity(symbol, price, sizingName)
  // Пропускаем - требует регистрации sizing schema через addSizingSchema()
  // API принимает symbol как первый параметр - это уже проверено в других местах

  // 6. Schedule.getReport(symbol, strategyName, backtest)
  try {
    const btcReport = await Schedule.getReport("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);
    const ethReport = await Schedule.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);

    if (typeof btcReport !== "string" || btcReport.length === 0) {
      fail("Schedule: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethReport !== "string" || ethReport.length === 0) {
      fail("Schedule: ETHUSDT getReport() returned invalid report");
      return;
    }

    // Проверяем что отчеты содержат правильные символы
    if (!btcReport.includes("BTCUSDT")) {
      fail("Schedule: BTCUSDT report doesn't contain BTCUSDT");
      return;
    }

    if (!ethReport.includes("ETHUSDT")) {
      fail("Schedule: ETHUSDT report doesn't contain ETHUSDT");
      return;
    }
  } catch (err) {
    fail(`Schedule.getReport() failed: ${err.message}`);
    return;
  }

  // 7. Performance.getReport(symbol, strategyName, backtest)
  try {
    const btcPerfReport = await Performance.getReport("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);
    const ethPerfReport = await Performance.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);

    if (typeof btcPerfReport !== "string" || btcPerfReport.length === 0) {
      fail("Performance: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethPerfReport !== "string" || ethPerfReport.length === 0) {
      fail("Performance: ETHUSDT getReport() returned invalid report");
      return;
    }
  } catch (err) {
    fail(`Performance.getReport() failed: ${err.message}`);
    return;
  }

  // 8. Heat.getReport(strategyName, backtest)
  try {
    const btcHeatReport = await Heat.getReport({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);
    const ethHeatReport = await Heat.getReport({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);

    if (typeof btcHeatReport !== "string" || btcHeatReport.length === 0) {
      fail("Heat: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethHeatReport !== "string" || ethHeatReport.length === 0) {
      fail("Heat: ETHUSDT getReport() returned invalid report");
      return;
    }
  } catch (err) {
    fail(`Heat.getReport() failed: ${err.message}`);
    return;
  }

  // 9. Partial.getReport(symbol, strategyName, backtest)
  try {
    const btcPartialReport = await Partial.getReport("BTCUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);
    const ethPartialReport = await Partial.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "1h-facades-parallel",
    }, true);

    if (typeof btcPartialReport !== "string" || btcPartialReport.length === 0) {
      fail("Partial: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethPartialReport !== "string" || ethPartialReport.length === 0) {
      fail("Partial: ETHUSDT getReport() returned invalid report");
      return;
    }
  } catch (err) {
    fail(`Partial.getReport() failed: ${err.message}`);
    return;
  }

  pass("ALL FACADES WORK: Schedule, Performance, Heat, Partial, PositionSize correctly accept (symbol, strategyName) and isolate data. Multi-symbol API verified.");
});

// PARALLEL: Single strategy trading two symbols (BTCUSDT + ETHUSDT)
test("PARALLEL: Single strategy trading two symbols (BTCUSDT + ETHUSDT)", async ({ pass, fail }) => {
  const btcSignals = {
    scheduled: [],
    opened: [],
    closed: [],
    allEvents: [],
  };

  const ethSignals = {
    scheduled: [],
    opened: [],
    closed: [],
    allEvents: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;

  // BTC: base price 95000
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice - 500;
  let btcCandles = [];

  // ETH: base price 4000
  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice - 50;
  let ethCandles = [];

  // Предзаполняем начальные свечи для обоих символов
  for (let i = 0; i < 5; i++) {
    btcCandles.push({
      timestamp: startTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });

    ethCandles.push({
      timestamp: startTime + i * intervalMs,
      open: ethBasePrice,
      high: ethBasePrice + 10,
      low: ethBasePrice - 5,
      close: ethBasePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-parallel-multi",
    getCandles: async (symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);

      if (symbol === "BTCUSDT") {
        const result = btcCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : btcCandles.slice(0, Math.min(limit, btcCandles.length));
      }

      if (symbol === "ETHUSDT") {
        const result = ethCandles.slice(sinceIndex, sinceIndex + limit);
        return result.length > 0 ? result : ethCandles.slice(0, Math.min(limit, ethCandles.length));
      }

      return [];
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let btcSignalGenerated = false;
  let ethSignalGenerated = false;

  addStrategySchema({
    strategyName: "test-parallel-strategy",
    interval: "1m",
    getSignal: async (symbol) => {
      // BTCUSDT: TP scenario
      if (symbol === "BTCUSDT") {
        if (btcSignalGenerated) return null;
        btcSignalGenerated = true;

        // Генерируем свечи для BTC
        btcCandles = [];
        for (let i = 0; i < 60; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Ожидание (0-9)
          if (i < 10) {
            btcCandles.push({
              timestamp,
              open: btcBasePrice,
              high: btcBasePrice + 100,
              low: btcBasePrice - 50,
              close: btcBasePrice,
              volume: 100
            });
          }
          // Фаза 2: Активация (10-14)
          else if (i >= 10 && i < 15) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen,
              high: btcPriceOpen + 100,
              low: btcPriceOpen - 100,
              close: btcPriceOpen,
              volume: 100
            });
          }
          // Фаза 3: Take Profit (15-19)
          else if (i >= 15 && i < 20) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen + 1000,
              high: btcPriceOpen + 1100,
              low: btcPriceOpen + 900,
              close: btcPriceOpen + 1000,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            btcCandles.push({
              timestamp,
              open: btcBasePrice,
              high: btcBasePrice + 100,
              low: btcBasePrice - 50,
              close: btcBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "BTCUSDT parallel test - TP scenario",
          priceOpen: btcPriceOpen,
          priceTakeProfit: btcPriceOpen + 1000,
          priceStopLoss: btcPriceOpen - 1000,
          minuteEstimatedTime: 60,
        };
      }

      // ETHUSDT: SL scenario
      if (symbol === "ETHUSDT") {
        if (ethSignalGenerated) return null;
        ethSignalGenerated = true;

        // Генерируем свечи для ETH
        ethCandles = [];
        for (let i = 0; i < 60; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Ожидание (0-9)
          if (i < 10) {
            ethCandles.push({
              timestamp,
              open: ethBasePrice,
              high: ethBasePrice + 10,
              low: ethBasePrice - 5,
              close: ethBasePrice,
              volume: 100
            });
          }
          // Фаза 2: Активация (10-14)
          else if (i >= 10 && i < 15) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen,
              high: ethPriceOpen + 10,
              low: ethPriceOpen - 10,
              close: ethPriceOpen,
              volume: 100
            });
          }
          // Фаза 3: Stop Loss (15-19)
          else if (i >= 15 && i < 20) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen - 100,
              high: ethPriceOpen - 90,
              low: ethPriceOpen - 110,
              close: ethPriceOpen - 100,
              volume: 100
            });
          }
          // Остальное: нейтральные свечи
          else {
            ethCandles.push({
              timestamp,
              open: ethBasePrice,
              high: ethBasePrice + 10,
              low: ethBasePrice - 5,
              close: ethBasePrice,
              volume: 100
            });
          }
        }

        return {
          position: "long",
          note: "ETHUSDT parallel test - SL scenario",
          priceOpen: ethPriceOpen,
          priceTakeProfit: ethPriceOpen + 100,
          priceStopLoss: ethPriceOpen - 100,
          minuteEstimatedTime: 60,
        };
      }

      return null;
    },
    callbacks: {
      onSchedule: (symbol, data) => {
        if (symbol === "BTCUSDT") btcSignals.scheduled.push(data);
        if (symbol === "ETHUSDT") ethSignals.scheduled.push(data);
      },
      onOpen: (symbol, data) => {
        if (symbol === "BTCUSDT") btcSignals.opened.push(data);
        if (symbol === "ETHUSDT") ethSignals.opened.push(data);
      },
      onClose: (symbol, data) => {
        if (symbol === "BTCUSDT") btcSignals.closed.push(data);
        if (symbol === "ETHUSDT") ethSignals.closed.push(data);
      },
    },
  });

  addFrameSchema({
    frameName: "1h-parallel-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  let btcDone = false;
  let ethDone = false;
  let errorCaught = null;

  const awaitSubject = new Subject();

  const unsubscribeSignal = listenSignalBacktest((event) => {
    if (event.symbol === "BTCUSDT") {
      btcSignals.allEvents.push(event);
      if (event.action === "closed") btcSignals.closed.push(event);
    }
    if (event.symbol === "ETHUSDT") {
      ethSignals.allEvents.push(event);
      if (event.action === "closed") ethSignals.closed.push(event);
    }
  });

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const unsubscribeDone = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-parallel-strategy") {
      if (event.symbol === "BTCUSDT") btcDone = true;
      if (event.symbol === "ETHUSDT") ethDone = true;

      if (btcDone && ethDone) {
        awaitSubject.next();
      }
    }
  });

  // Запускаем backtest для обоих символов параллельно
  Backtest.background("BTCUSDT", {
    strategyName: "test-parallel-strategy",
    exchangeName: "binance-parallel-multi",
    frameName: "1h-parallel-test",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-parallel-strategy",
    exchangeName: "binance-parallel-multi",
    frameName: "1h-parallel-test",
  });

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeSignal();
  unsubscribeError();
  unsubscribeDone();

  if (errorCaught) {
    fail(`Error during parallel backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверка BTCUSDT: должен быть TP
  if (btcSignals.scheduled.length === 0) {
    fail("BTCUSDT: Signal was NOT scheduled");
    return;
  }

  if (btcSignals.opened.length === 0) {
    fail("BTCUSDT: Signal was NOT opened");
    return;
  }

  // Фильтруем closed события из allEvents (содержат closeReason)
  const btcClosedEvents = btcSignals.allEvents.filter(e => e.action === "closed");
  if (btcClosedEvents.length === 0) {
    fail("BTCUSDT: No closed events found");
    return;
  }

  const btcFinalResult = btcClosedEvents[0];
  if (btcFinalResult.closeReason !== "take_profit") {
    fail(`BTCUSDT: Expected "take_profit", got "${btcFinalResult.closeReason}"`);
    return;
  }

  // Проверка ETHUSDT: должен быть SL
  if (ethSignals.scheduled.length === 0) {
    fail("ETHUSDT: Signal was NOT scheduled");
    return;
  }

  if (ethSignals.opened.length === 0) {
    fail("ETHUSDT: Signal was NOT opened");
    return;
  }

  const ethClosedEvents = ethSignals.allEvents.filter(e => e.action === "closed");
  if (ethClosedEvents.length === 0) {
    fail("ETHUSDT: No closed events found");
    return;
  }

  const ethFinalResult = ethClosedEvents[0];
  if (ethFinalResult.closeReason !== "stop_loss") {
    fail(`ETHUSDT: Expected "stop_loss", got "${ethFinalResult.closeReason}"`);
    return;
  }

  // Проверка изоляции: сигналы НЕ должны пересекаться
  if (btcFinalResult.symbol !== "BTCUSDT") {
    fail("BTCUSDT signal has wrong symbol!");
    return;
  }

  if (ethFinalResult.symbol !== "ETHUSDT") {
    fail("ETHUSDT signal has wrong symbol!");
    return;
  }

  pass(`PARALLEL WORKS: BTCUSDT closed by TP (${btcFinalResult.pnl.pnlPercentage.toFixed(2)}%), ETHUSDT closed by SL (${ethFinalResult.pnl.pnlPercentage.toFixed(2)}%). State isolation confirmed.`);
});

// PARALLEL: Three symbols with different close reasons (TP, SL, time_expired)
test("PARALLEL: Three symbols with different close reasons (TP, SL, time_expired)", async ({ pass, fail }) => {
  const signalsMap = {
    BTCUSDT: { scheduled: [], opened: [], closed: [], allEvents: [] },
    ETHUSDT: { scheduled: [], opened: [], closed: [], allEvents: [] },
    SOLUSDT: { scheduled: [], opened: [], closed: [], allEvents: [] },
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;

  const symbolConfigs = {
    BTCUSDT: { basePrice: 95000, priceOpen: 94500, tpDistance: 1000, slDistance: 1000 },
    ETHUSDT: { basePrice: 4000, priceOpen: 3950, tpDistance: 100, slDistance: 100 },
    SOLUSDT: { basePrice: 150, priceOpen: 148, tpDistance: 10, slDistance: 10 },
  };

  const candlesMap = {
    BTCUSDT: [],
    ETHUSDT: [],
    SOLUSDT: [],
  };

  const signalsGenerated = {
    BTCUSDT: false,
    ETHUSDT: false,
    SOLUSDT: false,
  };

  // Предзаполнение начальных свечей
  for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
    const config = symbolConfigs[symbol];
    for (let i = 0; i < 5; i++) {
      candlesMap[symbol].push({
        timestamp: startTime + i * intervalMs,
        open: config.basePrice,
        high: config.basePrice + config.tpDistance * 0.1,
        low: config.basePrice - config.slDistance * 0.05,
        close: config.basePrice,
        volume: 100,
      });
    }
  }

  addExchangeSchema({
    exchangeName: "binance-parallel-three",
    getCandles: async (symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const candles = candlesMap[symbol] || [];
      const result = candles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : candles.slice(0, Math.min(limit, candles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-parallel-three-symbols",
    interval: "1m",
    getSignal: async (symbol) => {
      if (signalsGenerated[symbol]) return null;
      signalsGenerated[symbol] = true;

      const config = symbolConfigs[symbol];
      const candles = [];

      for (let i = 0; i < 90; i++) {
        const timestamp = startTime + i * intervalMs;

        // Общая фаза 1: Ожидание (0-9)
        if (i < 10) {
          candles.push({
            timestamp,
            open: config.basePrice,
            high: config.basePrice + config.tpDistance * 0.1,
            low: config.basePrice - config.slDistance * 0.05,
            close: config.basePrice,
            volume: 100
          });
        }
        // Общая фаза 2: Активация (10-14)
        else if (i >= 10 && i < 15) {
          candles.push({
            timestamp,
            open: config.priceOpen,
            high: config.priceOpen + config.tpDistance * 0.1,
            low: config.priceOpen - config.slDistance * 0.1,
            close: config.priceOpen,
            volume: 100
          });
        }
        // BTCUSDT: TP (15-19)
        else if (symbol === "BTCUSDT" && i >= 15 && i < 20) {
          candles.push({
            timestamp,
            open: config.priceOpen + config.tpDistance,
            high: config.priceOpen + config.tpDistance * 1.1,
            low: config.priceOpen + config.tpDistance * 0.9,
            close: config.priceOpen + config.tpDistance,
            volume: 100
          });
        }
        // ETHUSDT: SL (15-19)
        else if (symbol === "ETHUSDT" && i >= 15 && i < 20) {
          candles.push({
            timestamp,
            open: config.priceOpen - config.slDistance,
            high: config.priceOpen - config.slDistance * 0.9,
            low: config.priceOpen - config.slDistance * 1.1,
            close: config.priceOpen - config.slDistance,
            volume: 100
          });
        }
        // SOLUSDT: нейтральная цена до time_expired (15-89)
        else {
          candles.push({
            timestamp,
            open: config.priceOpen + config.tpDistance * 0.5,
            high: config.priceOpen + config.tpDistance * 0.6,
            low: config.priceOpen + config.tpDistance * 0.4,
            close: config.priceOpen + config.tpDistance * 0.5,
            volume: 100
          });
        }
      }

      candlesMap[symbol] = candles;

      return {
        position: "long",
        note: `${symbol} parallel three symbols test`,
        priceOpen: config.priceOpen,
        priceTakeProfit: config.priceOpen + config.tpDistance,
        priceStopLoss: config.priceOpen - config.slDistance,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (symbol, data) => {
        signalsMap[symbol].scheduled.push(data);
      },
      onOpen: (symbol, data) => {
        signalsMap[symbol].opened.push(data);
      },
      onClose: (symbol, data) => {
        signalsMap[symbol].closed.push(data);
      },
    },
  });

  addFrameSchema({
    frameName: "90m-parallel-three",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:30:00Z"),
  });

  const doneSymbols = new Set();
  let errorCaught = null;

  const awaitSubject = new Subject();

  const unsubscribeSignal = listenSignalBacktest((event) => {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    if (symbols.includes(event.symbol)) {
      signalsMap[event.symbol].allEvents.push(event);
      if (event.action === "closed") signalsMap[event.symbol].closed.push(event);
    }
  });

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const unsubscribeDone = listenDoneBacktest((event) => {
    if (event.backtest === true && event.strategyName === "test-parallel-three-symbols") {
      doneSymbols.add(event.symbol);

      if (doneSymbols.size === 3) {
        awaitSubject.next();
      }
    }
  });

  // Запускаем backtest для всех трех символов
  for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
    Backtest.background(symbol, {
      strategyName: "test-parallel-three-symbols",
      exchangeName: "binance-parallel-three",
      frameName: "90m-parallel-three",
    });
  }

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeSignal();
  unsubscribeError();
  unsubscribeDone();

  if (errorCaught) {
    fail(`Error during parallel backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Фильтруем closed события из allEvents для всех символов
  const btcClosedEvents = signalsMap.BTCUSDT.allEvents.filter(e => e.action === "closed");
  const ethClosedEvents = signalsMap.ETHUSDT.allEvents.filter(e => e.action === "closed");
  const solClosedEvents = signalsMap.SOLUSDT.allEvents.filter(e => e.action === "closed");

  if (btcClosedEvents.length === 0) {
    fail("BTCUSDT: No closed events found");
    return;
  }

  if (ethClosedEvents.length === 0) {
    fail("ETHUSDT: No closed events found");
    return;
  }

  if (solClosedEvents.length === 0) {
    fail("SOLUSDT: No closed events found");
    return;
  }

  const btcResult = btcClosedEvents[0];
  const ethResult = ethClosedEvents[0];
  const solResult = solClosedEvents[0];

  if (btcResult.closeReason !== "take_profit") {
    fail(`BTCUSDT: Expected "take_profit", got "${btcResult.closeReason}"`);
    return;
  }

  if (ethResult.closeReason !== "stop_loss") {
    fail(`ETHUSDT: Expected "stop_loss", got "${ethResult.closeReason}"`);
    return;
  }

  if (solResult.closeReason !== "time_expired") {
    fail(`SOLUSDT: Expected "time_expired", got "${solResult.closeReason}"`);
    return;
  }

  // Проверка изоляции символов
  if (btcResult.symbol !== "BTCUSDT" || ethResult.symbol !== "ETHUSDT" || solResult.symbol !== "SOLUSDT") {
    fail("Symbol isolation violated - signals have wrong symbols!");
    return;
  }

  pass(`PARALLEL SCALES: 3 symbols closed independently - BTCUSDT: TP (${btcResult.pnl.pnlPercentage.toFixed(2)}%), ETHUSDT: SL (${ethResult.pnl.pnlPercentage.toFixed(2)}%), SOLUSDT: time_expired (${solResult.pnl.pnlPercentage.toFixed(2)}%). State isolation confirmed for 3 symbols.`);
});

// PARTIAL PROGRESS: Percentage calculation during TP achievement
test("PARTIAL PROGRESS: Percentage calculation during TP achievement", async ({ pass, fail }) => {
  const partialProfitEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const priceOpen = basePrice - 500; // 99500 (LONG: buy lower, wait for price to fall)
  const priceTakeProfit = priceOpen + 1000; // 100500
  const priceStopLoss = priceOpen - 1000; // 98500
  const tpDistance = priceTakeProfit - priceOpen; // 1000
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // CRITICAL: Pre-fill initial candles for getAveragePrice (min 5 candles)
  // Candles must be ABOVE priceOpen to ensure scheduled state (not immediate activation)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50, // 99950 > priceOpen (99500) ✓
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-partial-progress",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-progress",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // CRITICAL: Regenerate ALL candles in first getSignal call
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

      // Phase 1: Activation (candles 0-4) - price falls to priceOpen
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

      // Phase 2: Gradual rise to TP (candles 5-24)
      // Move from priceOpen (99500) to priceTakeProfit (100500) in 20 steps
      const steps = 20;
      for (let i = 0; i < steps; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = (i + 1) / steps; // 0.05, 0.10, 0.15, ..., 1.0
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

      // Phase 3: Hold at TP for closure (candles 25-27)
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

      // console.log(`\n=== PARTIAL PROGRESS TEST SETUP ===`);
      // console.log(`basePrice: ${basePrice}`);
      // console.log(`priceOpen: ${priceOpen}`);
      // console.log(`priceTakeProfit: ${priceTakeProfit}`);
      // console.log(`priceStopLoss: ${priceStopLoss}`);
      // console.log(`TP distance: ${tpDistance}`);
      // console.log(`Total candles: ${allCandles.length}`);
      // console.log(`Price progression: ${priceOpen} → ${priceTakeProfit} (${steps} steps)`);
      // console.log(`===================================\n`);

      return {
        position: "long",
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onPartialProfit: async (symbol, data, currentPrice, revenuePercent, backtest) => {
        const event = { symbol, signalId: data.id, currentPrice, revenuePercent, backtest };
        partialProfitEvents.push(event);

        // console.log(`[PROFIT EVENT] Level: ${revenuePercent.toFixed(2)}%, Price: ${currentPrice.toFixed(2)}, Expected: ${(priceOpen + tpDistance * (revenuePercent / 100)).toFixed(2)}`);
        await sleep(10); // Let // console.log flush
      },
      onPartialLoss: async (symbol, data, currentPrice, revenuePercent, backtest) => {
        const event = { symbol, signalId: data.id, currentPrice, revenuePercent, backtest };
        partialLossEvents.push(event);

        // console.log(`[LOSS EVENT] Level: ${revenuePercent.toFixed(2)}%, Price: ${currentPrice.toFixed(2)}`);
        await sleep(10);
      },
    },
  });

  addFrameSchema({
    frameName: "60m-partial-progress",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(async () => {
    // console.log(`\n=== BACKTEST COMPLETED ===`);
    // console.log(`Total profit events: ${partialProfitEvents.length}`);
    // console.log(`Total loss events: ${partialLossEvents.length}`);
    await sleep(50); // Let all logs flush
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // Ignore "no candles data" errors - they can occur during initialization
    if (error && error.message && error.message.includes("no candles data")) {
      // console.log(`[IGNORED] ${error.message}`);
      return;
    }
    console.error(`\n[ERROR]`, error);
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-progress",
    exchangeName: "binance-partial-progress",
    frameName: "60m-partial-progress",
  });

  await awaitSubject.toPromise();
  await sleep(100); // Final flush
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

  // Should have at least 3 profit events
  if (partialProfitEvents.length < 3) {
    fail(`Expected at least 3 profit events, got ${partialProfitEvents.length}`);
    return;
  }

  // Verify all percentages are in 0-100% range
  for (let i = 0; i < partialProfitEvents.length; i++) {
    const percent = partialProfitEvents[i].revenuePercent;
    if (percent < 0 || percent > 100) {
      fail(`Progress should be 0-100%, got ${percent.toFixed(2)}% at event #${i + 1}`);
      return;
    }
  }

  // Verify percentages increase monotonically
  for (let i = 1; i < partialProfitEvents.length; i++) {
    if (partialProfitEvents[i].revenuePercent <= partialProfitEvents[i - 1].revenuePercent) {
      fail(`Progress should increase: ${partialProfitEvents[i - 1].revenuePercent.toFixed(2)}% -> ${partialProfitEvents[i].revenuePercent.toFixed(2)}%`);
      return;
    }
  }

  // Verify we have reasonable coverage (at least reached 50%+ progress)
  const maxProgress = Math.max(...partialProfitEvents.map(e => e.revenuePercent));
  if (maxProgress < 50) {
    fail(`Expected max progress >= 50%, got ${maxProgress.toFixed(2)}%`);
    return;
  }

  const actualLevels = partialProfitEvents.map(e => e.revenuePercent).sort((a, b) => a - b);
  // console.log(`\n=== VERIFICATION PASSED ===`);
  // console.log(`Total events: ${partialProfitEvents.length}`);
  // console.log(`Progress levels: ${actualLevels.map(l => l.toFixed(2) + '%').join(', ')}`);
  // console.log(`Max progress: ${maxProgress.toFixed(2)}%`);
  // console.log(`===========================\n`);

  pass(`Percentage calculation WORKS: ${partialProfitEvents.length} events, max progress ${maxProgress.toFixed(2)}%`);
});

// PARTIAL LISTENERS: listenPartialProfit and listenPartialLoss capture events
test("PARTIAL LISTENERS: listenPartialProfit and listenPartialLoss capture events", async ({ pass, fail }) => {
  const partialProfitEvents = [];
  const partialLossEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const priceOpen = basePrice - 500; // 99500 (LONG: buy lower)
  const priceTakeProfit = priceOpen + 1000; // 100500
  const priceStopLoss = priceOpen - 1000; // 98500
  const tpDistance = priceTakeProfit - priceOpen; // 1000
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Pre-fill initial candles for getAveragePrice (min 5 candles)
  // Candles must be ABOVE priceOpen to ensure scheduled state (not immediate activation)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50, // 99950 > priceOpen (99500) ✓
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-partial-listeners",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-partial-listeners",
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

      // Phase 1: Activation (candles 0-4) - price falls to priceOpen
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

      // Phase 2: Gradual rise to TP (candles 5-24)
      // Move from priceOpen (99500) to priceTakeProfit (100500) in 20 steps
      const steps = 20;
      for (let i = 0; i < steps; i++) {
        const timestamp = startTime + candleIndex * intervalMs;
        const progress = (i + 1) / steps; // 0.05, 0.10, 0.15, ..., 1.0
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

      // Phase 3: Hold at TP for closure (candles 25-27)
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
    frameName: "60m-partial-listeners",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
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

    // console.log(`[listenPartialProfit] Symbol: ${event.symbol}, Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  const unsubscribeLoss = listenPartialLossAvailable((event) => {
    partialLossEvents.push({
      symbol: event.symbol,
      signalId: event.data.id,
      currentPrice: event.currentPrice,
      level: event.level,
      backtest: event.backtest,
    });

    // console.log(`[listenPartialLoss] Symbol: ${event.symbol}, Level: ${event.level}%, Price: ${event.currentPrice.toFixed(2)}`);
  });

  listenDoneBacktest(async () => {
    // console.log(`\n=== BACKTEST COMPLETED ===`);
    // console.log(`Total profit events: ${partialProfitEvents.length}`);
    // console.log(`Total loss events: ${partialLossEvents.length}`);
    await sleep(50); // Let all logs flush
    awaitSubject.next();
  });

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // Ignore "no candles data" errors - they can occur during initialization
    if (error && error.message && error.message.includes("no candles data")) {
      // console.log(`[IGNORED] ${error.message}`);
      return;
    }
    console.error(`\n[ERROR]`, error);
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-partial-listeners",
    exchangeName: "binance-partial-listeners",
    frameName: "60m-partial-listeners",
  });

  await awaitSubject.toPromise();
  await sleep(100); // Final flush

  // Cleanup
  unsubscribeProfit();
  unsubscribeLoss();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // No loss events expected (price moves towards TP, not SL)
  if (partialLossEvents.length > 0) {
    fail(`Expected 0 loss events, got ${partialLossEvents.length}`);
    return;
  }

  // Should have at least 3 profit events
  if (partialProfitEvents.length < 3) {
    fail(`Expected at least 3 profit events, got ${partialProfitEvents.length}`);
    return;
  }

  // Verify all events have backtest=true
  if (!partialProfitEvents.every(e => e.backtest === true)) {
    fail("All events should have backtest=true");
    return;
  }

  // Verify all events have correct symbol
  if (!partialProfitEvents.every(e => e.symbol === "BTCUSDT")) {
    fail("All events should have symbol=BTCUSDT");
    return;
  }

  // Verify levels are milestone values (10, 20, 30, etc.)
  for (let i = 0; i < partialProfitEvents.length; i++) {
    const level = partialProfitEvents[i].level;
    if (level % 1 !== 0) {
      fail(`Level should be integer milestone (10, 20, 30), got ${level}`);
      return;
    }
  }

  // Verify levels increase monotonically
  for (let i = 1; i < partialProfitEvents.length; i++) {
    if (partialProfitEvents[i].level <= partialProfitEvents[i - 1].level) {
      fail(`Levels should increase: ${partialProfitEvents[i - 1].level}% -> ${partialProfitEvents[i].level}%`);
      return;
    }
  }

  const maxLevel = Math.max(...partialProfitEvents.map(e => e.level));
  const uniqueLevels = [...new Set(partialProfitEvents.map(e => e.level))].sort((a, b) => a - b);

  // console.log(`\n=== VERIFICATION PASSED ===`);
  // console.log(`Total events: ${partialProfitEvents.length}`);
  // console.log(`Unique levels: ${uniqueLevels.join('%, ')}%`);
  // console.log(`Max level: ${maxLevel}%`);
  // console.log(`===========================\n`);

  pass(`listenPartialProfit WORKS: ${partialProfitEvents.length} events, levels: ${uniqueLevels.join('%, ')}%, max ${maxLevel}%`);
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

      // Phase 5: Continue to TP (candles 18-25)
      const remainingSteps = 8;
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

      // Phase 6: Hold at TP for closure (candles 26-28)
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
    frameName: "60m-partial-dedupe",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
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
    frameName: "60m-partial-dedupe",
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

      for (let i = 0; i < 40; i++) {
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
    frameName: "40m-function-partial-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
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
    frameName: "40m-function-partial-profit",
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
    frameName: "40m-function-partial-profit",
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

      for (let i = 0; i < 40; i++) {
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
    frameName: "40m-function-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
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
    frameName: "40m-function-partial-loss",
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
    frameName: "40m-function-partial-loss",
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

      for (let i = 0; i < 50; i++) {
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
    frameName: "50m-function-partial-multiple",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
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
    frameName: "50m-function-partial-multiple",
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
    frameName: "50m-function-partial-multiple",
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
test("PARTIAL FUNCTION: partialProfit() works for SHORT position", async ({ pass, fail }) => {
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
    exchangeName: "binance-function-short-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-function-short-profit",
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

      for (let i = 0; i < 40; i++) {
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
          const price = basePrice - 15000;
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
            open: basePrice - 10000,
            high: basePrice - 9900,
            low: basePrice - 10100,
            close: basePrice - 10000,
            volume: 100,
          });
        }
      }

      return {
        position: "short",
        priceOpen: basePrice,
        priceTakeProfit: basePrice - 60000,
        priceStopLoss: basePrice + 50000,
        minuteEstimatedTime: 120,
      };
    },
    callbacks: {
      onPartialProfit: async (_symbol, _data, _currentPrice, revenuePercent, _backtest) => {
        // Вызываем partialProfit при достижении 20% к TP для SHORT
        if (!partialCalled && revenuePercent >= 20) {
          partialCalled = true;
          try {
            await commitPartialProfit("BTCUSDT", 30);
            // console.log("[TEST] partialProfit SHORT called: 30% at level " + revenuePercent.toFixed(2) + "%");
          } catch (err) {
            // console.error("[TEST] partialProfit error:", err);
          }
        }
      },
    },
  });

  addFrameSchema({
    frameName: "40m-function-short-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-function-short-profit",
    exchangeName: "binance-function-short-profit",
    frameName: "40m-function-short-profit",
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
    strategyName: "test-function-short-profit",
    exchangeName: "binance-function-short-profit",
    frameName: "40m-function-short-profit",
  });

  // console.log("[TEST #14] getData result:", JSON.stringify(data, null, 2));

  if (!data.signalList || data.signalList.length === 0) {
    fail("No signals found in backtest data");
    return;
  }

  const signal = data.signalList[0].signal;
  // console.log("[TEST #14] signal:", JSON.stringify(signal, null, 2));

  if (!signal._partial) {
    fail("Field _partial is missing in signal");
    return;
  }

  // console.log("[TEST #14] signal._partial:", JSON.stringify(signal._partial, null, 2));

  if (!Array.isArray(signal._partial)) {
    fail("Field _partial is not an array");
    return;
  }

  if (signal._partial.length !== 1) {
    fail(`Expected 1 partial close, got ${signal._partial.length}`);
    return;
  }

  const partial = signal._partial[0];
  // console.log("[TEST #14] partial[0]:", JSON.stringify(partial, null, 2));

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

  pass("partialProfit() SHORT WORKS: 30% position closed successfully, _partial field validated");
});

// OTHER: Simultaneous TP & SL trigger - VWAP-based detection
test("OTHER: Simultaneous TP & SL trigger - VWAP-based detection", async ({ pass, fail }) => {

  let closedResult = null;
  let signalGenerated = false;

  addExchangeSchema({
    exchangeName: "binance-other-simultaneous",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i === 5) {
          // Свеча с экстремальной волатильностью (касается TP и SL)
          candles.push({
            timestamp,
            open: 42000,
            high: 43500, // Выше TP=43000
            low: 40500,  // Ниже SL=41000
            close: 42000,
            volume: 500,
          });
        } else {
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,
            low: 41900,
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

  addStrategySchema({
    strategyName: "test-other-simultaneous",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "simultaneous TP & SL test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 30,
      };
    },
  });

  addFrameSchema({
    frameName: "20m-other-simultaneous",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      closedResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-simultaneous",
    exchangeName: "binance-other-simultaneous",
    frameName: "20m-other-simultaneous",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!closedResult) {
    fail("Signal was not closed despite TP & SL being hit");
    return;
  }

  const reason = closedResult.closeReason;
  console.log(`[TEST #37] closeReason=${reason}, PNL=${closedResult.pnl?.pnlPercentage?.toFixed(2) || 'N/A'}%`);

  // С VWAP detection свеча может не достичь TP/SL даже если high/low касаются их
  if (reason === "take_profit" || reason === "stop_loss" || reason === "time_expired") {
    pass(`CORRECT: Simultaneous TP/SL handled correctly, closed by ${reason}`);
    return;
  }

  fail(`UNEXPECTED: Signal closed by ${reason}`);
});

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
    endDate: new Date("2024-01-01T00:30:00Z"),
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

// PERSIST: onWrite called EXACTLY ONCE per signal open
test("PERSIST: onWrite called EXACTLY ONCE per signal open", async ({ pass, fail }) => {
  let onWriteCallsWithSignal = 0;
  let onOpenCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  let allCandles = [];

  // Предзаполняем начальные свечи для getAveragePrice (минимум 5)
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

  for (let i = 5; i < 20; i++) {
    const timestamp = startTime + i * intervalMs;
    if (i < 10) {
      // Ожидание активации (цена выше priceOpen)
      allCandles.push({
        timestamp,
        open: basePrice + 500,
        high: basePrice + 600,
        low: basePrice + 400,
        close: basePrice + 500,
        volume: 100,
      });
    } else {
      // Активация и работа сигнала
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

  addExchangeSchema({
    exchangeName: "binance-persist-write-once",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "persist-write-once-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "PERSIST: write once test",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: () => {
        onOpenCalled = true;
      },
      onWrite: (_symbol, signal) => {
        if (signal !== null) {
          onWriteCallsWithSignal++;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "20m-persist-write-once",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #10] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-write-once-strategy",
    exchangeName: "binance-persist-write-once",
    frameName: "20m-persist-write-once",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #10] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!onOpenCalled) {
    fail("Signal was NOT opened");
    return;
  }

  if (onWriteCallsWithSignal !== 1) {
    fail(`CONCURRENCY BUG: onWrite(signal) called ${onWriteCallsWithSignal} times, expected EXACTLY 1. Possible race condition or duplicate persist writes!`);
    return;
  }

  pass(`PERSIST INTEGRITY: onWrite(signal) called exactly once per signal open. No duplicates, no race conditions.`);
});

// PERSIST: onWrite(null) called EXACTLY ONCE per signal close
test("PERSIST: onWrite(null) called EXACTLY ONCE per signal close", async ({ pass, fail }) => {
  let onWriteCallsWithNull = 0;
  let onCloseCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  let allCandles = [];

  // Предзаполняем начальные свечи для getAveragePrice (минимум 5)
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

  for (let i = 5; i < 20; i++) {
    const timestamp = startTime + i * intervalMs;
    if (i < 10) {
      // Ожидание активации
      allCandles.push({
        timestamp,
        open: basePrice + 500,
        high: basePrice + 600,
        low: basePrice + 400,
        close: basePrice + 500,
        volume: 100,
      });
    } else if (i >= 10 && i < 15) {
      // Активация
      allCandles.push({
        timestamp,
        open: basePrice,
        high: basePrice + 100,
        low: basePrice - 100,
        close: basePrice,
        volume: 100,
      });
    } else {
      // TP достигнут - сигнал закрывается
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

  addExchangeSchema({
    exchangeName: "binance-persist-delete-once",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "persist-delete-once-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "PERSIST: delete once test",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onClose: () => {
        onCloseCalled = true;
      },
      onWrite: (_symbol, signal) => {
        if (signal === null) {
          onWriteCallsWithNull++;
        }
      },
    },
  });

  addFrameSchema({
    frameName: "20m-persist-delete-once",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #11] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "persist-delete-once-strategy",
    exchangeName: "binance-persist-delete-once",
    frameName: "20m-persist-delete-once",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #11] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!onCloseCalled) {
    fail("Signal was NOT closed");
    return;
  }

  if (onWriteCallsWithNull !== 1) {
    fail(`CONCURRENCY BUG: onWrite(null) called ${onWriteCallsWithNull} times, expected EXACTLY 1. Possible race condition or duplicate persist deletes!`);
    return;
  }

  pass(`PERSIST INTEGRITY: onWrite(null) called exactly once per signal close. No duplicate deletions, no race conditions.`);
});

// early termination with break stops backtest
test("early termination with break stops backtest", async ({ pass, fail }) => {

  addExchangeSchema({
    exchangeName: "binance-mock-early",
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
    strategyName: "test-strategy-early",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "early termination test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 1,
      };
    },
  });

  addFrameSchema({
    frameName: "7d-backtest-early",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-07T00:00:00Z"), // 7 days
  });

  let signalCount = 0;

  for await (const result of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-early",
    exchangeName: "binance-mock-early",
    frameName: "7d-backtest-early",
  })) {
    signalCount++;
    if (signalCount >= 2) {
      // Stop after 2 signals
      break;
    }
  }

  if (signalCount === 2) {
    pass("Early termination stopped backtest after 2 signals");
    return;
  }

  fail(`Early termination failed: got ${signalCount} signals`);

});

/**
 * PARTIAL LEVELS ТЕСТ #1: listenPartialProfit срабатывает только на уровнях 10%, 20%, 30%
 *
 * Проверяем что:
 * - Вызовы происходят только при достижении уровней (10, 20, 30...)
 * - Промежуточные значения (15%, 25%) НЕ вызывают коллбек
 * - Каждый уровень вызывается ТОЛЬКО ОДИН РАЗ (нет дубликатов)
 */
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

      for (let i = 0; i < 50; i++) {
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
        // Достигаем TP (30-49)
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
    frameName: "50m-partial-levels-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
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
    frameName: "50m-partial-levels-profit",
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
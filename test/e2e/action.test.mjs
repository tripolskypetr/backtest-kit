import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  addAction,
  Backtest,
  listenDoneBacktest,
  listenError,
  ActionBase,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * ACTION ТЕСТ #1: ActionBase.signal() вызывается для всех событий сигнала
 */
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

  addExchange({
    exchangeName: "binance-action-signal",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addAction({
    actionName: "test-action-signal",
    handler: TestActionSignal,
  });

  addStrategy({
    strategyName: "test-strategy-action-signal",
    interval: "1m",
    actions: ["test-action-signal"],
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Генерируем свечи для immediate activation (как в sequence.test.mjs Тест #3)
      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        // Фаза 1: Ожидание (0-9) - цена ВЫШЕ basePrice
        if (i < 10) {
          allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
        }
        // Фаза 2: Активация (10-14) - цена НА basePrice
        else if (i >= 10 && i < 15) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        }
        // Фаза 3: TP (15-29) - цена достигает TP
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

  addFrame({
    frameName: "30m-action-signal",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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
    frameName: "30m-action-signal",
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

  if (!signalEvents.every(e => e.frameName === "30m-action-signal")) {
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

  addExchange({
    exchangeName: "binance-action-backtest",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addAction({
    actionName: "test-action-backtest",
    handler: TestActionBacktest,
  });

  addStrategy({
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

  addFrame({
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

  addExchange({
    exchangeName: "binance-action-breakeven",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addAction({
    actionName: "test-action-breakeven",
    handler: TestActionBreakeven,
  });

  addStrategy({
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

      for (let i = 0; i < 30; i++) {
        const timestamp = startTime + i * intervalMs;

        // Активация (0-4)
        if (i < 5) {
          allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
        }
        // Рост до 3% для breakeven (5-9)
        else if (i >= 5 && i < 10) {
          const price = basePrice + 3000;
          allCandles.push({ timestamp, open: price, high: price + 100, low: price - 100, close: price, volume: 100 });
        }
        // Дальнейший рост до TP (10-29)
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

  addFrame({
    frameName: "30m-action-breakeven",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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
    frameName: "30m-action-breakeven",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

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
    fail(`Expected strategyName=test-strategy-action-breakeven, got ${event.strategyName}`);
    return;
  }

  if (typeof event.currentPrice !== "number") {
    fail(`currentPrice should be number, got ${typeof event.currentPrice}`);
    return;
  }

  pass(`breakeven() WORKS: ${breakevenEvents.length} event(s) at price ${event.currentPrice}`);
});

/**
 * ACTION ТЕСТ #4: ActionBase.partialProfit() вызывается при достижении уровней прибыли
 */
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

  addExchange({
    exchangeName: "binance-action-partial-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addAction({
    actionName: "test-action-partial-profit",
    handler: TestActionPartialProfit,
  });

  addStrategy({
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

      for (let i = 0; i < 30; i++) {
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
        // TP (15-29)
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

  addFrame({
    frameName: "30m-action-partial-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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
    frameName: "30m-action-partial-profit",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

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

/**
 * ACTION ТЕСТ #5: ActionBase.partialLoss() вызывается при достижении уровней убытка
 */
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

  addExchange({
    exchangeName: "binance-action-partial-loss",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addAction({
    actionName: "test-action-partial-loss",
    handler: TestActionPartialLoss,
  });

  addStrategy({
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

      for (let i = 0; i < 30; i++) {
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
        // SL (15-29)
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

  addFrame({
    frameName: "30m-action-partial-loss",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
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
    frameName: "30m-action-partial-loss",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

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

  addExchange({
    exchangeName: "binance-action-risk-rejection",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addAction({
    actionName: "test-action-risk-rejection",
    handler: TestActionRiskRejection,
  });

  // Add risk with max 0 positions to force rejection
  const { addRisk } = await import("../../build/index.mjs");

  addRisk({
    riskName: "no-trading-action",
    validations: [
      () => {
        throw new Error("No trading allowed");
      },
    ],
  });

  let signalCount = 0;
  addStrategy({
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

  addFrame({
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


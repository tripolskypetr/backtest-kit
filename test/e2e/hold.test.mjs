import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenDoneBacktest,
  listenError,
  listenSignalBacktest,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * ТЕСТ #1: Infinity LONG закрывается по SL
 *
 * Сценарий:
 * - minuteEstimatedTime: Infinity
 * - Активация на минуте 5, SL пробивается на минуте 10
 * - Должен закрыться по stop_loss в первом чанке
 */
test("HOLD: Infinity LONG closes by stop_loss within first chunk", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60_000;
  // bufferMinutes = CC_AVG_PRICE_CANDLES_COUNT - 1 = 4
  const bufferStartTime = startTime - 4 * intervalMs;

  let signalGenerated = false;
  let finalResult = null;
  let errorCaught = null;

  addExchangeSchema({
    exchangeName: "binance-hold-sl",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const m = (timestamp - startTime) / intervalMs;
        if (timestamp < startTime) {
          // VWAP буфер: выше priceOpen (low > 42000)
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m < 5) {
          // Scheduled ожидание: выше priceOpen
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m === 5) {
          // Активация: low = priceOpen = 42000
          result.push({ timestamp, open: 42100, high: 42200, low: 42000, close: 42100, volume: 100 });
        } else if (m < 10) {
          // Нейтраль после активации
          result.push({ timestamp, open: 42100, high: 42200, low: 42050, close: 42100, volume: 100 });
        } else {
          // SL пробит: low <= 41000
          result.push({ timestamp, open: 41000, high: 41100, low: 40900, close: 41000, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-hold-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: Infinity,
      };
    },
    callbacks: {},
  });

  addFrameSchema({
    frameName: "5m-hold-sl",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:05:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenSignalBacktest((result) => {
    if (result.action === "closed") finalResult = result;
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-hold-sl",
    exchangeName: "binance-hold-sl",
    frameName: "5m-hold-sl",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (finalResult.closeReason !== "stop_loss") {
    fail(`Expected "stop_loss", got "${finalResult.closeReason}"`);
    return;
  }

  if (finalResult.pnl.pnlPercentage >= 0) {
    fail(`Expected negative PNL, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`HOLD SL: Infinity signal closed by stop_loss. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * ТЕСТ #2: Infinity LONG закрывается по TP
 *
 * Сценарий:
 * - minuteEstimatedTime: Infinity
 * - Активация на минуте 5, TP достигается на минуте 10
 * - Должен закрыться по take_profit в первом чанке
 */
test("HOLD: Infinity LONG closes by take_profit within first chunk", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T01:00:00Z").getTime();
  const intervalMs = 60_000;

  let signalGenerated = false;
  let finalResult = null;
  let errorCaught = null;

  addExchangeSchema({
    exchangeName: "binance-hold-tp",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const m = (timestamp - startTime) / intervalMs;
        if (timestamp < startTime) {
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m < 5) {
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m === 5) {
          // Активация
          result.push({ timestamp, open: 42100, high: 42200, low: 42000, close: 42100, volume: 100 });
        } else if (m < 10) {
          result.push({ timestamp, open: 42100, high: 42200, low: 42050, close: 42100, volume: 100 });
        } else {
          // TP пробит: high >= 43000
          result.push({ timestamp, open: 43000, high: 43100, low: 42900, close: 43000, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-hold-tp",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: Infinity,
      };
    },
    callbacks: {},
  });

  addFrameSchema({
    frameName: "5m-hold-tp",
    interval: "1m",
    startDate: new Date("2024-01-01T01:00:00Z"),
    endDate: new Date("2024-01-01T01:05:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenSignalBacktest((result) => {
    if (result.action === "closed") finalResult = result;
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-hold-tp",
    exchangeName: "binance-hold-tp",
    frameName: "5m-hold-tp",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  if (finalResult.pnl.pnlPercentage <= 0) {
    fail(`Expected positive PNL, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`HOLD TP: Infinity signal closed by take_profit. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * ТЕСТ #3: Infinity LONG закрывается по TP после 1200 минут (межчанковый переход)
 *
 * Сценарий:
 * - minuteEstimatedTime: Infinity
 * - CC_MAX_CANDLES_PER_REQUEST = 1000, CC_SCHEDULE_AWAIT_MINUTES = 120
 * - Первый бэктест: 4 + 120 + 1000 + 1 = 1125 свечей → active (TP ещё не достигнут)
 * - Второй чанк: TP достигается на минуте 1200 от startTime
 * - Тест проверяет механизм итерационного дозапроса чанков
 */
test("HOLD: Infinity LONG closes by take_profit after 1200 minutes (cross-chunk)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T02:00:00Z").getTime();
  const intervalMs = 60_000;

  let signalGenerated = false;
  let finalResult = null;
  let errorCaught = null;

  addExchangeSchema({
    exchangeName: "binance-hold-cross-chunk",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const m = (timestamp - startTime) / intervalMs;
        if (timestamp < startTime) {
          // VWAP буфер: выше priceOpen
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m < 5) {
          // Scheduled ожидание: выше priceOpen
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m === 5) {
          // Активация: low = priceOpen = 42000
          result.push({ timestamp, open: 42100, high: 42200, low: 42000, close: 42100, volume: 100 });
        } else if (m < 1200) {
          // Нейтраль: между SL=41000 и TP=43000
          result.push({ timestamp, open: 42100, high: 42200, low: 42050, close: 42100, volume: 100 });
        } else {
          // TP пробит на минуте 1200: high >= 43000
          result.push({ timestamp, open: 43000, high: 43100, low: 42900, close: 43000, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-hold-cross-chunk",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: Infinity,
      };
    },
    callbacks: {},
  });

  addFrameSchema({
    frameName: "5m-hold-cross-chunk",
    interval: "1m",
    startDate: new Date("2024-01-01T02:00:00Z"),
    endDate: new Date("2024-01-01T02:05:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenSignalBacktest((result) => {
    if (result.action === "closed") finalResult = result;
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-hold-cross-chunk",
    exchangeName: "binance-hold-cross-chunk",
    frameName: "5m-hold-cross-chunk",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!finalResult) {
    fail("Signal was NOT closed! Infinity cross-chunk iteration may be broken.");
    return;
  }

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  if (finalResult.pnl.pnlPercentage <= 0) {
    fail(`Expected positive PNL, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  const closeMinute = Math.round((finalResult.closeTimestamp - startTime) / intervalMs);
  pass(`HOLD CROSS-CHUNK: Infinity signal closed by take_profit at minute ~${closeMinute} (>1000). PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * ТЕСТ #4: Верификация 2-го подзапроса свечей (пагинация)
 *
 * Сценарий:
 * - CC_MAX_CANDLES_PER_REQUEST = 1000, bufferMinutes = 4, CC_SCHEDULE_AWAIT_MINUTES = 120
 * - Первый запрос (scheduled): 4 + 120 + 1000 + 1 = 1125 свечей → покрывает до минуты 1120
 * - TP размещён на минуте 1200 → требует 2-й подзапрос
 * - Тест считает вызовы getCandles и проверяет, что их ≥ 2
 */
test("HOLD: Infinity LONG — 2nd chunk request triggered (TP at minute 1200)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T03:00:00Z").getTime();
  const intervalMs = 60_000;

  let signalGenerated = false;
  let finalResult = null;
  let errorCaught = null;
  let getCandlesCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-hold-2chunk",
    getCandles: async (_symbol, _interval, since, limit) => {
      getCandlesCallCount++;
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const m = (timestamp - startTime) / intervalMs;
        if (timestamp < startTime) {
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m < 5) {
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m === 5) {
          result.push({ timestamp, open: 42100, high: 42200, low: 42000, close: 42100, volume: 100 });
        } else if (m < 1200) {
          result.push({ timestamp, open: 42100, high: 42200, low: 42050, close: 42100, volume: 100 });
        } else {
          // TP на минуте 1200: вне первого чанка (1125 свечей), требует 2-й подзапрос
          result.push({ timestamp, open: 43000, high: 43100, low: 42900, close: 43000, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-hold-2chunk",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: Infinity,
      };
    },
    callbacks: {},
  });

  addFrameSchema({
    frameName: "5m-hold-2chunk",
    interval: "1m",
    startDate: new Date("2024-01-01T03:00:00Z"),
    endDate: new Date("2024-01-01T03:05:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenSignalBacktest((result) => {
    if (result.action === "closed") finalResult = result;
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-hold-2chunk",
    exchangeName: "binance-hold-2chunk",
    frameName: "5m-hold-2chunk",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  if (getCandlesCallCount < 2) {
    fail(`Expected ≥2 getCandles calls (2nd chunk required for TP@1200), got ${getCandlesCallCount}`);
    return;
  }

  const closeMinute = Math.round((finalResult.closeTimestamp - startTime) / intervalMs);
  pass(`HOLD 2-CHUNK: closed by take_profit at minute ~${closeMinute}. getCandles called ${getCandlesCallCount}x (≥2 verified). PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * ТЕСТ #5: Верификация 3-го подзапроса свечей (пагинация)
 *
 * Сценарий:
 * - Первый запрос: 1125 свечей → покрывает до минуты 1120
 * - 2-й подзапрос: 1000 свечей с учётом буфера → покрывает до ~минуты 2116
 * - TP размещён на минуте 2300 → требует 3-й подзапрос
 * - Тест считает вызовы getCandles и проверяет, что их ≥ 3
 */
test("HOLD: Infinity LONG — 3rd chunk request triggered (TP at minute 2300)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T04:00:00Z").getTime();
  const intervalMs = 60_000;

  let signalGenerated = false;
  let finalResult = null;
  let errorCaught = null;
  let getCandlesCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-hold-3chunk",
    getCandles: async (_symbol, _interval, since, limit) => {
      getCandlesCallCount++;
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const m = (timestamp - startTime) / intervalMs;
        if (timestamp < startTime) {
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m < 5) {
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m === 5) {
          result.push({ timestamp, open: 42100, high: 42200, low: 42000, close: 42100, volume: 100 });
        } else if (m < 2300) {
          result.push({ timestamp, open: 42100, high: 42200, low: 42050, close: 42100, volume: 100 });
        } else {
          // TP на минуте 2300: требует 3-й подзапрос (1120 + ~1000 + ~1000 → ~3120 покрытие)
          result.push({ timestamp, open: 43000, high: 43100, low: 42900, close: 43000, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-hold-3chunk",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: Infinity,
      };
    },
    callbacks: {},
  });

  addFrameSchema({
    frameName: "5m-hold-3chunk",
    interval: "1m",
    startDate: new Date("2024-01-01T04:00:00Z"),
    endDate: new Date("2024-01-01T04:05:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenSignalBacktest((result) => {
    if (result.action === "closed") finalResult = result;
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-hold-3chunk",
    exchangeName: "binance-hold-3chunk",
    frameName: "5m-hold-3chunk",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  if (getCandlesCallCount < 3) {
    fail(`Expected ≥3 getCandles calls (3rd chunk required for TP@2300), got ${getCandlesCallCount}`);
    return;
  }

  const closeMinute = Math.round((finalResult.closeTimestamp - startTime) / intervalMs);
  pass(`HOLD 3-CHUNK: closed by take_profit at minute ~${closeMinute}. getCandles called ${getCandlesCallCount}x (≥3 verified). PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});

/**
 * ТЕСТ #7: 10 календарных дней — закрытие по stop_loss (14 400 минут)
 *
 * Та же схема пагинации, что и тест #6, но SL пробивается вместо TP:
 * - Нейтраль до минуты 14400, затем low <= 41000 (SL = 41000)
 * - Ожидается ≥15 вызовов getCandles, closeReason = "stop_loss", PNL < 0
 */
test("HOLD: Infinity LONG — 10 calendar days processed, closes by stop_loss", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T06:00:00Z").getTime();
  const intervalMs = 60_000;
  const SL_MINUTE = 14_400; // 10 days * 24h * 60min

  let signalGenerated = false;
  let finalResult = null;
  let errorCaught = null;
  let getCandlesCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-hold-10days-sl",
    getCandles: async (_symbol, _interval, since, limit) => {
      getCandlesCallCount++;
      console.log(`[getCandles] call #${getCandlesCallCount} since=${since.toISOString()} limit=${limit}`);
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const m = (timestamp - startTime) / intervalMs;
        if (timestamp < startTime) {
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m < 5) {
          result.push({ timestamp, open: 43000, high: 43100, low: 42100, close: 43000, volume: 100 });
        } else if (m === 5) {
          // Активация: low = priceOpen = 42000
          result.push({ timestamp, open: 42100, high: 42200, low: 42000, close: 42100, volume: 100 });
        } else if (m < SL_MINUTE) {
          // Нейтраль 10 дней: между SL=41000 и TP=43000
          result.push({ timestamp, open: 42100, high: 42200, low: 42050, close: 42100, volume: 100 });
        } else {
          // SL пробит на ровно 10 дней: все цены < 41000, high < 43000 (TP не задет)
          result.push({ timestamp, open: 40500, high: 40900, low: 40200, close: 40500, volume: 100 });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-hold-10days-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: Infinity,
      };
    },
    callbacks: {},
  });

  addFrameSchema({
    frameName: "5m-hold-10days-sl",
    interval: "1m",
    startDate: new Date("2024-01-01T06:00:00Z"),
    endDate: new Date("2024-01-01T06:06:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenSignalBacktest((result) => {
    if (result.action === "closed") finalResult = result;
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-hold-10days-sl",
    exchangeName: "binance-hold-10days-sl",
    frameName: "5m-hold-10days-sl",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!finalResult) {
    fail("Signal was NOT closed after 10 days!");
    return;
  }

  if (finalResult.closeReason !== "stop_loss") {
    fail(`Expected "stop_loss", got "${finalResult.closeReason}"`);
    return;
  }

  if (finalResult.pnl.pnlPercentage >= 0) {
    fail(`Expected negative PNL, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  // 1 initial scheduled call + 14 chunk loop iterations = 15 minimum
  if (getCandlesCallCount < 15) {
    fail(`Expected ≥15 getCandles calls for 10-day period (1 scheduled + 14 chunks), got ${getCandlesCallCount}`);
    return;
  }

  const closeDays = ((finalResult.closeTimestamp - startTime) / intervalMs / 60 / 24).toFixed(2);
  pass(`HOLD 10-DAYS SL: closed by stop_loss at day ~${closeDays}. getCandles called ${getCandlesCallCount}x (≥15 verified). PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});


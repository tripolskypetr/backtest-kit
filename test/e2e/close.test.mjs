import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * ТЕСТ #1: Закрытие по истечению времени (time_expired)
 *
 * Сценарий:
 * - LONG: priceOpen=42000, TP=43000, SL=41000
 * - minuteEstimatedTime=10 минут
 * - Цена НЕ достигает ни TP, ни SL за 10 минут
 * - КРИТИЧНО: Позиция должна закрыться по истечению времени
 */
test("CLOSE: Position closes by time_expired when neither TP nor SL reached", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-close-time-expired",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Фаза 1: Ждем активации (цена выше priceOpen)
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,
            close: 43000,
            volume: 100,
          });
        } else {
          // Фаза 2+3: Активация + цена СТАБИЛЬНА (не достигает ни TP=43000, ни SL=41000)
          // Цена держится ~42000, позиция должна закрыться по времени
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
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-close-time-expired",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "CLOSE: time_expired test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 10,  // 10 минут
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data, priceClose) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-close-time-expired",
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
    strategyName: "test-close-time-expired",
    exchangeName: "binance-close-time-expired",
    frameName: "30m-close-time-expired",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);

  if (!scheduledResult) {
    fail("Signal was NOT scheduled!");
    return;
  }

  if (!openedResult) {
    fail("Signal was NOT opened!");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("Signal was NOT closed! Expected close by time_expired after 10 minutes!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Закрытие должно быть по time_expired
  if (finalResult.closeReason !== "time_expired") {
    fail(`LOGIC BUG: Expected close by "time_expired", got "${finalResult.closeReason}". Position should close after 10 minutes!`);
    return;
  }

  pass(`TIME WORKS: Position closed by time_expired after 10 minutes. closeReason="${finalResult.closeReason}". Time-based exit works!`);
});


/**
 * ТЕСТ #2: Отмена scheduled сигнала по истечению времени
 *
 * Сценарий:
 * - LONG: priceOpen=42000, TP=43000, SL=41000
 * - minuteEstimatedTime=10 минут
 * - Цена НЕ достигает priceOpen за 10 минут (сигнал остается scheduled)
 * - КРИТИЧНО: Scheduled сигнал должен отмениться по истечению времени
 */
test("CLOSE: Scheduled signal cancelled by time_expired when priceOpen not reached", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let cancelledResult = null;

  addExchangeSchema({
    exchangeName: "binance-close-scheduled-time-cancel",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // ВСЕ свечи: цена ВЫШЕ priceOpen=42000 (сигнал никогда не активируется)
        candles.push({
          timestamp,
          open: 43000,
          high: 43100,
          low: 42900,  // Выше priceOpen=42000
          close: 43000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-close-scheduled-time-cancel",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "CLOSE: scheduled time cancellation test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 10,  // 10 минут
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onCancel: (_symbol, data) => {
        cancelledResult = data;
      },
    },
  });

  addFrameSchema({
    frameName: "30m-close-scheduled-time-cancel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-close-scheduled-time-cancel",
    exchangeName: "binance-close-scheduled-time-cancel",
    frameName: "30m-close-scheduled-time-cancel",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);

  if (!scheduledResult) {
    fail("Signal was NOT scheduled!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал НЕ должен быть открыт
  if (openedResult) {
    fail("LOGIC BUG: Signal was OPENED despite price never reaching priceOpen!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал должен быть отменен
  if (!cancelledResult) {
    fail("CRITICAL BUG: Scheduled signal was NOT cancelled after 10 minutes! Time-based cancellation failed!");
    return;
  }

  pass(`TIME WORKS: Scheduled signal cancelled by time_expired after 10 minutes without activation. Time-based scheduled cancellation works!`);
});


/**
 * ТЕСТ #3: SHORT позиция закрывается по StopLoss
 *
 * Сценарий:
 * - SHORT: priceOpen=42000, TP=41000, SL=43000
 * - Цена РАСТЕТ выше SL=43000
 * - КРИТИЧНО: SHORT должен закрыться по StopLoss с убытком
 */
test("CLOSE: SHORT position closes by stop_loss when price rises above SL", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-close-short-sl",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Фаза 1: Ждем активации (цена НИЖЕ priceOpen)
          candles.push({
            timestamp,
            open: 41000,
            high: 41100,
            low: 40900,
            close: 41000,
            volume: 100,
          });
        } else if (i >= 5 && i < 10) {
          // Фаза 2: Активация (цена РАСТЕТ до priceOpen)
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,
            low: 41900,
            close: 42000,
            volume: 100,
          });
        } else {
          // Фаза 3: Цена РАСТЕТ выше SL=43000 (SHORT закрывается по SL)
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,  // >= SL=43000 → закрытие по SL!
            low: 42900,
            close: 43000,
            volume: 100,
          });
        }
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-close-short-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "short",
        note: "CLOSE: SHORT stop_loss test",
        priceOpen: 42000,
        priceTakeProfit: 41000,  // SHORT: TP ниже priceOpen
        priceStopLoss: 43000,    // SHORT: SL выше priceOpen
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data, priceClose) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-close-short-sl",
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
    strategyName: "test-close-short-sl",
    exchangeName: "binance-close-short-sl",
    frameName: "30m-close-short-sl",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);

  if (!scheduledResult) {
    fail("SHORT signal was NOT scheduled!");
    return;
  }

  if (!openedResult) {
    fail("SHORT signal was NOT opened!");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("SHORT signal was NOT closed!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Закрытие должно быть по stop_loss
  if (finalResult.closeReason !== "stop_loss") {
    fail(`LOGIC BUG: Expected close by "stop_loss", got "${finalResult.closeReason}". SHORT should close when price rises above SL=43000!`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: PNL должен быть отрицательный (убыток)
  if (finalResult.pnl.pnlPercentage >= 0) {
    fail(`LOGIC BUG: Expected negative PNL (loss from SL), got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`SHORT SL WORKS: SHORT closed by stop_loss with loss. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%. SHORT StopLoss protection works!`);
});


/**
 * ТЕСТ #4: Граничный случай - priceOpen === candle.low (точное совпадение)
 *
 * Сценарий:
 * - LONG: priceOpen=42000
 * - Свеча: low=42000 (ТОЧНОЕ совпадение)
 * - КРИТИЧНО: Должна быть активация (candle.low <= priceOpen)
 */
test("CLOSE: LONG activates when candle.low exactly equals priceOpen", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-close-exact-price",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Фаза 1: Ждем активации (цена выше priceOpen)
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,
            close: 43000,
            volume: 100,
          });
        } else if (i === 5) {
          // Фаза 2: Активация с ТОЧНЫМ совпадением low=priceOpen
          candles.push({
            timestamp,
            open: 42100,
            high: 42200,
            low: 42000,  // ТОЧНО равно priceOpen=42000!
            close: 42100,
            volume: 100,
          });
        } else {
          // Фаза 3: TP достигнут
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,
            close: 43000,
            volume: 100,
          });
        }
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-close-exact-price",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "CLOSE: exact price activation test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data, priceClose) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-close-exact-price",
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
    strategyName: "test-close-exact-price",
    exchangeName: "binance-close-exact-price",
    frameName: "30m-close-exact-price",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);

  if (!scheduledResult) {
    fail("Signal was NOT scheduled!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал должен активироваться при точном совпадении
  if (!openedResult) {
    fail("BOUNDARY BUG: Signal was NOT opened when candle.low=42000 exactly equals priceOpen=42000! Activation condition should be '<=' not '<'!");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  pass(`BOUNDARY WORKS: LONG activated when candle.low exactly equals priceOpen (42000 <= 42000). Closed by "${finalResult.closeReason}". Exact price match works!`);
});


/**
 * ТЕСТ #5: Очень маленький профит (но не съедается комиссиями)
 *
 * Сценарий:
 * - LONG: priceOpen=42000, TP=42210 (0.5% профит)
 * - 0.5% профита должно ХВАТИТЬ чтобы покрыть комиссии
 * - КРИТИЧНО: Сигнал должен пройти валидацию и дать прибыль
 */
test("CLOSE: Small profit (0.5%) passes validation and yields profit", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-close-small-profit",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Фаза 1: Ждем активации
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,
            close: 43000,
            volume: 100,
          });
        } else if (i >= 5 && i < 10) {
          // Фаза 2: Активация
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,
            low: 41900,
            close: 42000,
            volume: 100,
          });
        } else {
          // Фаза 3: TP достигнут (маленький профит 0.5%)
          candles.push({
            timestamp,
            open: 42210,
            high: 42250,
            low: 42200,
            close: 42210,
            volume: 100,
          });
        }
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-close-small-profit",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "CLOSE: small profit test",
        priceOpen: 42000,
        priceTakeProfit: 42210,  // 0.5% профит
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data, priceClose) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-close-small-profit",
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
    strategyName: "test-close-small-profit",
    exchangeName: "binance-close-small-profit",
    frameName: "30m-close-small-profit",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал должен пройти валидацию
  if (!scheduledResult) {
    fail("VALIDATION BUG: Signal with 0.5% profit was rejected! This should be enough to cover fees!");
    return;
  }

  if (!openedResult) {
    fail("Signal was NOT opened!");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Закрытие должно быть по TP
  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected close by "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: PNL должен быть положительный
  if (finalResult.pnl.pnlPercentage <= 0) {
    fail(`VALIDATION BUG: Expected positive PNL with 0.5% TP, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%. Fees ate the profit!`);
    return;
  }

  const expectedPnl = ((42210 - 42000) / 42000) * 100; // ~0.5%
  pass(`SMALL PROFIT WORKS: 0.5% profit signal passed validation and yielded profit. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}% (expected ~${expectedPnl.toFixed(2)}%). Small profits work!`);
});


/**
 * ТЕСТ #6: LONG закрывается по StopLoss с убытком
 *
 * Сценарий:
 * - LONG: priceOpen=42000, TP=43000, SL=41000
 * - Цена ПАДАЕТ ниже SL=41000
 * - КРИТИЧНО: LONG должен закрыться по StopLoss с убытком
 */
test("CLOSE: LONG position closes by stop_loss when price falls below SL", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-close-long-sl",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Фаза 1: Ждем активации (цена выше priceOpen)
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,
            close: 43000,
            volume: 100,
          });
        } else if (i >= 5 && i < 10) {
          // Фаза 2: Активация (цена достигает priceOpen)
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,
            low: 41900,
            close: 42000,
            volume: 100,
          });
        } else {
          // Фаза 3: Цена ПАДАЕТ ниже SL=41000 (LONG закрывается по SL)
          candles.push({
            timestamp,
            open: 41000,
            high: 41100,
            low: 40900,  // <= SL=41000 → закрытие по SL!
            close: 41000,
            volume: 100,
          });
        }
      }

      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-close-long-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "CLOSE: LONG stop_loss test",
        priceOpen: 42000,
        priceTakeProfit: 43000,  // LONG: TP выше priceOpen
        priceStopLoss: 41000,    // LONG: SL ниже priceOpen
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data, priceClose) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-close-long-sl",
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
    strategyName: "test-close-long-sl",
    exchangeName: "binance-close-long-sl",
    frameName: "30m-close-long-sl",
  });

  await awaitSubject.toPromise();

  if (!scheduledResult) {
    fail("LONG signal was NOT scheduled!");
    return;
  }

  if (!openedResult) {
    fail("LONG signal was NOT opened!");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("LONG signal was NOT closed!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Закрытие должно быть по stop_loss
  if (finalResult.closeReason !== "stop_loss") {
    fail(`LOGIC BUG: Expected close by "stop_loss", got "${finalResult.closeReason}". LONG should close when price falls below SL=41000!`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: PNL должен быть отрицательный (убыток)
  if (finalResult.pnl.pnlPercentage >= 0) {
    fail(`LOGIC BUG: Expected negative PNL (loss from SL), got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`LONG SL WORKS: LONG closed by stop_loss with loss. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%. LONG StopLoss protection works!`);
});

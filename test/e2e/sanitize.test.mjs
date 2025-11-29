import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
  setConfig,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * КРИТИЧЕСКИЙ ТЕСТ #1: Микро-профит съедается комиссиями (TP слишком близко к priceOpen)
 *
 * Проблема:
 * - TP слишком близко к priceOpen: профит меньше комиссий
 * - Например: priceOpen=42000, TP=42010 (0.024% profit)
 * - С комиссиями 2×0.1% = 0.2% → чистый PNL = УБЫТОК -0.176%
 * - Такие сигналы ДОЛЖНЫ быть отклонены на этапе валидации
 *
 * Защита: Минимальная дистанция TP-priceOpen должна покрывать комиссии (>0.3%)
 */
test("SANITIZE: Micro-profit eaten by fees - TP too close to priceOpen rejected", async ({ pass, fail }) => {

  // Включаем валидацию для этого теста
  setConfig({
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3, // Минимум 0.3% для покрытия комиссий
  });

  let scheduledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-sanitize-micro-profit",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-sanitize-micro-profit",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // ОПАСНЫЙ СИГНАЛ: TP слишком близко к priceOpen
      // Profit = (42010 - 42000) / 42000 = 0.024%
      // Fees = 2 × 0.1% = 0.2%
      // Net PNL = 0.024% - 0.2% = -0.176% (УБЫТОК!)
      return {
        position: "long",
        note: "SANITIZE: micro-profit test - TP too close",
        priceOpen: 42000,
        priceTakeProfit: 42010, // Всего +10$ на 42000$ = 0.024%
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "10m-sanitize-micro-profit",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let finalResult = null;
  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      finalResult = result;
    }
  });

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-micro-profit",
      exchangeName: "binance-sanitize-micro-profit",
      frameName: "10m-sanitize-micro-profit",
    });

    await awaitSubject.toPromise();
    // await sleep(3000);

    // Сигнал должен быть отклонен на этапе валидации (в GET_SIGNAL_FN -> VALIDATE_SIGNAL_FN)
    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Micro-profit signal rejected by validation (TP too close to priceOpen, fees would eat profit)");
      return;
    }

    fail(`VALIDATION BUG: Micro-profit signal was NOT rejected! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Signal with TP=42010 (0.024% from priceOpen=42000) should be rejected by VALIDATE_SIGNAL_FN.`);

  } catch (error) {
    fail(`Unexpected error: ${error.message || String(error)}`);
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #2: Экстремальный StopLoss отклоняется (>20% убыток)
 *
 * Проблема:
 * - SL слишком далеко → один сигнал может потерять >50% депозита
 * - Например: LONG priceOpen=42000, SL=20000 → убыток -52% на одном сигнале
 * - Такой риск неприемлем для большинства стратегий
 *
 * Защита: Максимальное расстояние SL от priceOpen (например, <10%)
 */
test("SANITIZE: Extreme StopLoss rejected (>20% loss) - protects capital", async ({ pass, fail }) => {

  // Включаем валидацию для этого теста
  setConfig({
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: 20, // Максимум 20% риска на сигнал
  });

  let scheduledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-sanitize-extreme-sl",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-sanitize-extreme-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // ОПАСНЫЙ СИГНАЛ: SL слишком далеко
      // Loss = (42000 - 20000) / 42000 = -52.4% на одном сигнале!
      return {
        position: "long",
        note: "SANITIZE: extreme SL test - catastrophic risk",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 20000, // -52% убыток - КАТАСТРОФА!
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "10m-sanitize-extreme-sl",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-extreme-sl",
      exchangeName: "binance-sanitize-extreme-sl",
      frameName: "10m-sanitize-extreme-sl",
    });

    await awaitSubject.toPromise();
    // await sleep(3000);

    // Сигнал должен быть отклонен на этапе валидации (в GET_SIGNAL_FN -> VALIDATE_SIGNAL_FN)
    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Extreme StopLoss rejected! Signal with -52% risk was NOT executed. Capital protected!");
      return;
    }

    fail(`VALIDATION BUG: Signal with EXTREME StopLoss (-52% risk) was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Signal with SL=20000 (52% from priceOpen=42000) should be rejected by VALIDATE_SIGNAL_FN.`);

  } catch (error) {
    fail(`Unexpected error: ${error.message || String(error)}`);
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #3: Excessive minuteEstimatedTime rejected (>30 days)
 *
 * Проблема:
 * - minuteEstimatedTime = 50000 минут (>34 дня) → сигнал блокирует риск-лимиты на месяц+
 * - Один "вечный" сигнал = нет новых сделок в течение месяца
 * - Потенциальный deadlock стратегии
 *
 * Защита: Максимальное время жизни сигнала (например, <30 дней = 43200 минут)
 */
test("SANITIZE: Excessive minuteEstimatedTime rejected (>30 days) - prevents eternal signals", async ({ pass, fail }) => {

  // Включаем валидацию для этого теста
  setConfig({
    CC_MAX_SIGNAL_LIFETIME_MINUTES: 43200, // Максимум 30 дней (43200 минут)
  });

  let scheduledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-sanitize-excessive-time",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-sanitize-excessive-time",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // ОПАСНЫЙ СИГНАЛ: minuteEstimatedTime = 50000 минут (>34 дня!)
      // Блокирует риск-лимиты на месяц+, стратегия не может торговать
      return {
        position: "long",
        note: "SANITIZE: excessive time - eternal signal",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 50000, // >34 дня - ОПАСНО!
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "10m-sanitize-excessive-time",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-excessive-time",
      exchangeName: "binance-sanitize-excessive-time",
      frameName: "10m-sanitize-excessive-time",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Excessive minuteEstimatedTime rejected! Signal with >30 days lifetime was NOT executed. Strategy deadlock prevented!");
      return;
    }

    fail(`VALIDATION BUG: Signal with EXCESSIVE minuteEstimatedTime (50000min = 34+ days) was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Signal should be rejected by VALIDATE_SIGNAL_FN to prevent strategy deadlock.`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("minuteEstimatedTime") || errMsg.includes("time") || errMsg.includes("excessive") || errMsg.includes("Invalid signal")) {
      pass(`MONEY SAFE: Excessive minuteEstimatedTime rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #4: Negative prices rejected - prevents impossible trades
 *
 * Проблема:
 * - Отрицательные цены физически невозможны на крипто-биржах
 * - priceOpen < 0 или priceTakeProfit < 0 → краш системы или неопределенное поведение
 * - Математические операции с отрицательными ценами дают некорректные результаты
 *
 * Защита: Все цены ДОЛЖНЫ быть > 0
 */
test("SANITIZE: Negative prices rejected - prevents impossible trades", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-sanitize-negative-prices",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-sanitize-negative-prices",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // НЕВАЛИДНЫЙ СИГНАЛ: Отрицательные цены
      return {
        position: "long",
        note: "SANITIZE: negative prices test",
        priceOpen: -42000, // НЕВОЗМОЖНО! Отрицательная цена!
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "10m-sanitize-negative-prices",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-negative-prices",
      exchangeName: "binance-sanitize-negative-prices",
      frameName: "10m-sanitize-negative-prices",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Negative price rejected! Signal with priceOpen=-42000 was NOT executed. Impossible trade prevented!");
      return;
    }

    fail(`VALIDATION BUG: Signal with NEGATIVE price was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Signal with priceOpen=-42000 should be rejected by VALIDATE_SIGNAL_FN.`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("negative") || errMsg.includes("must be") || errMsg.includes("priceOpen") || errMsg.includes("Invalid signal") || errMsg.includes("positive")) {
      pass(`MONEY SAFE: Negative price rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #5: NaN/Infinity prices rejected - prevents calculation explosions
 *
 * Проблема:
 * - NaN или Infinity в ценах → все расчеты PNL становятся NaN
 * - Один NaN заражает весь бэктест → невозможно вычислить прибыль/убыток
 * - Infinity в расчетах может вызвать переполнение или деление на ноль
 *
 * Защита: Все цены ДОЛЖНЫ быть конечными числами (isFinite)
 */
test("SANITIZE: NaN/Infinity prices rejected - prevents calculation explosions", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-sanitize-nan-prices",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-sanitize-nan-prices",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // НЕВАЛИДНЫЙ СИГНАЛ: NaN в ценах
      return {
        position: "long",
        note: "SANITIZE: NaN price test",
        priceOpen: NaN, // КАТАСТРОФА! Все расчеты станут NaN!
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "10m-sanitize-nan-prices",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-nan-prices",
      exchangeName: "binance-sanitize-nan-prices",
      frameName: "10m-sanitize-nan-prices",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: NaN price rejected! Signal with priceOpen=NaN was NOT executed. Calculation explosion prevented!");
      return;
    }

    fail(`VALIDATION BUG: Signal with NaN price was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Signal with priceOpen=NaN should be rejected by VALIDATE_SIGNAL_FN.`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("NaN") || errMsg.includes("finite") || errMsg.includes("number") || errMsg.includes("Invalid signal") || errMsg.includes("must be")) {
      pass(`MONEY SAFE: NaN price rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #6: Infinity prices rejected - prevents overflow
 *
 * Проблема:
 * - Infinity в ценах → расчеты переполняются
 * - priceTakeProfit = Infinity → невозможно достичь TP, сигнал вечно активен
 * - Математические операции с Infinity дают неопределенные результаты
 *
 * Защита: Все цены ДОЛЖНЫ быть конечными числами (not Infinity)
 */
test("SANITIZE: Infinity prices rejected - prevents overflow", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-sanitize-infinity-prices",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        candles.push({
          timestamp,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-sanitize-infinity-prices",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // НЕВАЛИДНЫЙ СИГНАЛ: Infinity в ценах
      return {
        position: "long",
        note: "SANITIZE: Infinity price test",
        priceOpen: 42000,
        priceTakeProfit: Infinity, // НЕВОЗМОЖНО достичь! Сигнал вечно активен!
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "10m-sanitize-infinity-prices",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-infinity-prices",
      exchangeName: "binance-sanitize-infinity-prices",
      frameName: "10m-sanitize-infinity-prices",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Infinity price rejected! Signal with priceTakeProfit=Infinity was NOT executed. Eternal signal prevented!");
      return;
    }

    fail(`VALIDATION BUG: Signal with Infinity price was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Signal with priceTakeProfit=Infinity should be rejected by VALIDATE_SIGNAL_FN.`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("Infinity") || errMsg.includes("finite") || errMsg.includes("number") || errMsg.includes("Invalid signal") || errMsg.includes("must be")) {
      pass(`MONEY SAFE: Infinity price rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

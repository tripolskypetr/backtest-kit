import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
  getAveragePrice,
  setConfig,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * КРИТИЧЕСКИЙ ТЕСТ #1: Микро-профит съедается комиссиями (TP слишком близко к priceOpen)
 *
 * Проблема:
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

      // ОПАСНЫЙ СИГНАЛ: TP=42010 слишком близко к priceOpen=42000 (0.024%)
      // После комиссий (2×0.1% = 0.2%) получим убыток -0.176%
      return {
        position: "long",
        note: "SANITIZE: micro-profit test",
        priceOpen: 42000,
        priceTakeProfit: 42010, // Всего 0.024% profit - комиссии съедят!
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

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-sanitize-micro-profit",
      exchangeName: "binance-sanitize-micro-profit",
      frameName: "10m-sanitize-micro-profit",
    });

    await awaitSubject.toPromise();
    // await sleep(10);

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

      // ОПАСНЫЙ СИГНАЛ: SL=20000 слишком далеко от priceOpen=42000 (-52% риск!)
      // Один сигнал может уничтожить половину депозита
      return {
        position: "long",
        note: "SANITIZE: extreme SL test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 20000, // -52% риск - КАТАСТРОФА!
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
    // await sleep(10);

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

/**
 * КРИТИЧЕСКИЙ ТЕСТ #7: Incomplete candles from Binance rejected (anomalous prices)
 *
 * Проблема:
 * - Binance API иногда возвращает незавершенные свечи с аномально низкими ценами
 * - Например: вместо open=42000 приходит open=0.1 (в 420,000 раз меньше!)
 * - Или volume=0 когда должен быть volume=100
 * - Такие свечи приводят к ложным сигналам и неправильным расчетам
 *
 * Защита: VALIDATE_NO_INCOMPLETE_CANDLES_FN проверяет аномальные цены
 * - Вычисляет referencePrice (медиана или среднее)
 * - Отклоняет свечи с ценами < referencePrice / 1000
 */
test("SANITIZE: Incomplete Binance candles rejected (anomalous prices) - prevents fake signals", async ({ pass, fail }) => {

  let errorCaught = null;

  addExchange({
    exchangeName: "binance-sanitize-incomplete-candles",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i === 3) {
          // 4-я свеча: НЕЗАВЕРШЕННАЯ (incomplete) - аномально низкая цена
          // Нормальная цена: 42000
          // Незавершенная: 0.1 (в 420,000 раз меньше!)
          // Это реальный баг Binance API
          candles.push({
            timestamp,
            open: 0.1,      // АНОМАЛИЯ! Должно быть ~42000
            high: 0.12,     // АНОМАЛИЯ!
            low: 0.08,      // АНОМАЛИЯ!
            close: 0.1,     // АНОМАЛИЯ!
            volume: 0,      // Возможно нулевой объем
          });
        } else {
          // Остальные свечи: нормальные цены
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

  addStrategy({
    strategyName: "test-sanitize-incomplete-candles",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      return {
        position: "long",
        note: "SANITIZE: incomplete candles test",
        priceOpen: price,
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "10m-sanitize-incomplete-candles",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-sanitize-incomplete-candles",
    exchangeName: "binance-sanitize-incomplete-candles",
    frameName: "10m-sanitize-incomplete-candles",
  });

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeError();

  if (!errorCaught) {
    fail("VALIDATION BUG: Incomplete candles were NOT rejected! VALIDATE_NO_INCOMPLETE_CANDLES_FN should have thrown error!");
    return;
  }

  const errMsg = errorCaught.message || String(errorCaught);

  // Ожидаем ошибку от VALIDATE_NO_INCOMPLETE_CANDLES_FN
  if (errMsg.includes("VALIDATE_NO_INCOMPLETE_CANDLES_FN") ||
      errMsg.includes("anomalously low price") ||
      errMsg.includes("reference") ||
      errMsg.includes("threshold")) {
    pass(`DATA SAFE: Incomplete Binance candles rejected! Error: "${errMsg.substring(0, 120)}"`);
    return;
  }

  // Любая другая ошибка связанная с валидацией свечей тоже приемлема
  if (errMsg.includes("candle") || errMsg.includes("price") || errMsg.includes("invalid")) {
    pass(`DATA SAFE: Incomplete candles rejected: ${errMsg.substring(0, 100)}`);
    return;
  }

  fail(`Unexpected error (expected incomplete candle validation error): ${errMsg}`);
});

/**
 * БАЗОВЫЙ ТЕСТ #8: Система вообще работает - открывает и закрывает позиции
 *
 * Проблема:
 * - Если все предыдущие тесты проверяют что ПЛОХОЕ отклоняется,
 * - то этот тест проверяет что ХОРОШЕЕ работает!
 * - Санитарная проверка: система должна уметь торговать в принципе
 *
 * Защита: Базовая функциональность
 * - Сигнал создается (scheduled)
 * - Сигнал активируется (opened) когда цена достигает priceOpen
 * - Сигнал закрывается (closed) когда цена достигает TP
 * - PNL положительный (прибыль)
 */
test("SANITIZE: Basic trading works - system can open and close positions", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchange({
    exchangeName: "binance-sanitize-basic-trading",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Первые 5 свечей: цена выше priceOpen (сигнал ждет активации)
          // ВАЖНО: low должен быть ВЫШЕ StopLoss=41000!
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,  // Выше SL=41000, выше priceOpen=42000
            close: 43000,
            volume: 100,
          });
        } else if (i >= 5 && i < 10) {
          // Следующие 5 свечей: цена достигает priceOpen=42000 (сигнал активируется)
          // low=41900 <= priceOpen=42000 → активация!
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,
            low: 41900,  // Ниже priceOpen=42000, но выше SL=41000
            close: 42000,
            volume: 100,
          });
        } else {
          // Остальные свечи: цена достигает TP=43000 (сигнал закрывается)
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

  addStrategy({
    strategyName: "test-sanitize-basic-trading",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "SANITIZE: basic trading test",
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

  addFrame({
    frameName: "30m-sanitize-basic-trading",
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
    strategyName: "test-sanitize-basic-trading",
    exchangeName: "binance-sanitize-basic-trading",
    frameName: "30m-sanitize-basic-trading",
  });

  await awaitSubject.toPromise();
  await sleep(1000);

  // КРИТИЧЕСКАЯ ПРОВЕРКА #1: Сигнал должен быть создан (scheduled)
  if (!scheduledResult) {
    fail("SYSTEM BROKEN: Signal was NOT scheduled! Basic trading functionality broken!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #2: Сигнал должен быть открыт (opened)
  if (!openedResult) {
    fail("SYSTEM BROKEN: Signal was NOT opened! Price reached priceOpen=42000 but signal didn't activate!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #3: Сигнал должен быть закрыт (closed)
  if (!closedResult || !finalResult) {
    fail("SYSTEM BROKEN: Signal was NOT closed! Price reached TP=43000 but signal didn't close!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #4: Закрытие должно быть по TP (не по SL)
  if (finalResult.closeReason !== "take_profit") {
    fail(`LOGIC BUG: Expected close by "take_profit", got "${finalResult.closeReason}". Price reached TP=43000!`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #5: PNL должен быть положительный (прибыль)
  if (finalResult.pnl.pnlPercentage <= 0) {
    fail(`LOGIC BUG: Expected positive PNL (profit from TP), got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #6: PNL должен быть разумным (~2.38% для priceOpen=42000, TP=43000)
  const expectedPnl = ((43000 - 42000) / 42000) * 100; // ~2.38%
  if (Math.abs(finalResult.pnl.pnlPercentage - expectedPnl) > 0.5) {
    fail(`LOGIC BUG: PNL mismatch! Expected ~${expectedPnl.toFixed(2)}%, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`SYSTEM WORKS: Basic trading successful! Signal: scheduled -> opened -> closed by TP. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}% (expected ~${expectedPnl.toFixed(2)}%)`);
});


/**
 * БАЗОВЫЙ ТЕСТ #9: SHORT позиция работает - открывает и закрывает позиции
 *
 * Проблема:
 * - Тест #8 проверяет LONG, но нужно убедиться что SHORT тоже работает
 * - SHORT имеет обратную логику: ждем РОСТА цены до priceOpen
 *
 * Защита: Базовая функциональность SHORT
 * - Сигнал создается (scheduled)
 * - Сигнал активируется (opened) когда цена РАСТЕТ до priceOpen
 * - Сигнал закрывается (closed) когда цена ПАДАЕТ до TP
 * - PNL положительный (прибыль)
 */
test("SANITIZE: Basic SHORT trading works - system can open and close SHORT positions", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchange({
    exchangeName: "binance-sanitize-basic-short",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Фаза 1: Ждем активации (цена НИЖЕ priceOpen)
          // ВАЖНО: high должен быть НИЖЕ StopLoss=43000!
          candles.push({
            timestamp,
            open: 41000,
            high: 41100,  // Ниже SL=43000, ниже priceOpen=42000
            low: 40900,
            close: 41000,
            volume: 100,
          });
        } else if (i >= 5 && i < 10) {
          // Фаза 2: Активация (цена РАСТЕТ до priceOpen)
          // high=42100 >= priceOpen=42000 → активация!
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,  // Выше priceOpen=42000, но ниже SL=43000
            low: 41900,
            close: 42000,
            volume: 100,
          });
        } else {
          // Фаза 3: Закрытие (цена ПАДАЕТ до TP)
          // low=40900 <= TP=41000 → закрытие по TP!
          candles.push({
            timestamp,
            open: 41000,
            high: 41100,
            low: 40900,
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

  addStrategy({
    strategyName: "test-sanitize-basic-short",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "short",
        note: "SANITIZE: basic SHORT trading test",
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

  addFrame({
    frameName: "30m-sanitize-basic-short",
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
    strategyName: "test-sanitize-basic-short",
    exchangeName: "binance-sanitize-basic-short",
    frameName: "30m-sanitize-basic-short",
  });

  await awaitSubject.toPromise();
  await sleep(1000);

  // КРИТИЧЕСКАЯ ПРОВЕРКА #1: Сигнал должен быть создан (scheduled)
  if (!scheduledResult) {
    fail("SYSTEM BROKEN: SHORT signal was NOT scheduled! Basic SHORT trading functionality broken!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #2: Сигнал должен быть открыт (opened)
  if (!openedResult) {
    fail("SYSTEM BROKEN: SHORT signal was NOT opened! Price reached priceOpen=42000 but signal didn't activate!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #3: Сигнал должен быть закрыт (closed)
  if (!closedResult || !finalResult) {
    fail("SYSTEM BROKEN: SHORT signal was NOT closed! Price reached TP=41000 but signal didn't close!");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #4: Закрытие должно быть по TP (не по SL)
  if (finalResult.closeReason !== "take_profit") {
    fail(`LOGIC BUG: Expected close by "take_profit", got "${finalResult.closeReason}". Price reached TP=41000!`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #5: PNL должен быть положительный (прибыль)
  if (finalResult.pnl.pnlPercentage <= 0) {
    fail(`LOGIC BUG: Expected positive PNL (profit from TP), got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА #6: PNL должен быть разумным (~2.38% для priceOpen=42000, TP=41000)
  const expectedPnl = ((42000 - 41000) / 42000) * 100; // ~2.38%
  if (Math.abs(finalResult.pnl.pnlPercentage - expectedPnl) > 0.5) {
    fail(`LOGIC BUG: PNL mismatch! Expected ~${expectedPnl.toFixed(2)}%, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`SYSTEM WORKS: SHORT trading successful! Signal: scheduled → opened → closed by TP. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}% (expected ~${expectedPnl.toFixed(2)}%)`);
});

/**
 * PERSIST TEST #10: onWrite called EXACTLY ONCE per signal open
 *
 * Проблема:
 * - Множественные вызовы onWrite для одного сигнала
 * - Может быть race condition
 *
 * Проверка:
 * - При открытии сигнала onWrite(signal) вызывается ровно 1 раз
 * - Не должно быть дублирования записей в persist storage
 */
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

  addExchange({
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

  addStrategy({
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

  addFrame({
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

/**
 * PERSIST TEST #11: onWrite(null) called EXACTLY ONCE per signal close
 *
 * Проблема:
 * - onWrite(null) вызывается многократно при закрытии
 * - Может быть race condition при удалении из persist storage
 *
 * Проверка:
 * - При закрытии сигнала onWrite(null) вызывается ровно 1 раз
 * - Не должно быть дублирования удалений
 */
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

  addExchange({
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

  addStrategy({
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

  addFrame({
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

/**
 * EDGE CASE TEST #12: SL hit on activation candle - signal cancelled BEFORE open
 *
 * Сценарий:
 * - Scheduled LONG: priceOpen=42000, SL=41000
 * - Candle: low=40500 (пробит SL до активации)
 * - Проверка: onCancel вызывается, onOpen НЕ вызывается
 *
 * Критично: Сигнал должен отменяться ДО открытия, если SL пробит раньше priceOpen
 */
test("EDGE CASE: SL hit on activation candle - signal cancelled BEFORE open", async ({ pass, fail }) => {
  let onScheduleCalled = false;
  let onCancelCalled = false;
  let onOpenCalled = false;

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;
  const priceOpen = basePrice;
  const priceStopLoss = basePrice - 1000; // SL=41000

  let allCandles = [];

  // Предзаполняем начальные свечи для getAveragePrice (минимум 5)
  // ВАЖНО: Для LONG сигнала с priceOpen=42000:
  // - Чтобы НЕ активировать: candle.low > priceOpen (low > 42000)
  // - VWAP должен быть ВЫШЕ priceOpen чтобы избежать immediate activation
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice + 2000,  // 44000 - ВЫШЕ priceOpen
      high: basePrice + 2100,  // 44100
      low: basePrice + 1900,   // 43900 > priceOpen=42000 → НЕ активируется
      close: basePrice + 2000, // 44000
      volume: 100,
    });
    // console.log(`[TEST #12] Initial candle ${i}: low=${basePrice + 1900}, priceOpen=${priceOpen}, StopLoss=${priceStopLoss}`);
  }

  for (let i = 5; i < 20; i++) {
    const timestamp = startTime + i * intervalMs;
    if (i < 10) {
      // Ожидание (цена выше priceOpen, VWAP не активирует)
      allCandles.push({
        timestamp,
        open: basePrice + 2000,  // 44000
        high: basePrice + 2100,  // 44100
        low: basePrice + 1900,   // 43900 > priceOpen=42000
        close: basePrice + 2000, // 44000
        volume: 100,
      });
      // console.log(`[TEST #12] Waiting candle ${i}: low=${basePrice + 1900}, priceOpen=${priceOpen}`);
    } else if (i === 10) {
      // КРИТИЧЕСКАЯ СВЕЧА: low=40500 пробивает SL=41000 ДО достижения priceOpen=42000
      // Сигнал должен отмениться БЕЗ активации
      allCandles.push({
        timestamp,
        open: basePrice + 200,   // 42200
        high: basePrice + 300,   // 42300
        low: 40500, // ПРОБИЛИ SL! (40500 < 41000 < 42000)
        close: 41500,  // 41500 (между SL и priceOpen)
        volume: 100,
      });
      // console.log(`[TEST #12] CRITICAL candle ${i}: low=40500, priceOpen=${priceOpen}, StopLoss=${priceStopLoss} → SHOULD CANCEL`);
    } else {
      // Остальные свечи - возврат к нормальным ценам
      allCandles.push({
        timestamp,
        open: basePrice + 1000,  // 43000
        high: basePrice + 1100,  // 43100
        low: basePrice + 900,    // 42900 > priceOpen
        close: basePrice + 1000, // 43000
        volume: 100,
      });
    }
  }

  addExchange({
    exchangeName: "binance-edge-sl-before-open",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "edge-sl-before-open-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "EDGE CASE: SL hit before activation",
        priceOpen,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        onScheduleCalled = true;
      },
      onCancel: () => {
        onCancelCalled = true;
      },
      onOpen: () => {
        onOpenCalled = true;
      },
    },
  });

  addFrame({
    frameName: "20m-edge-sl-before-open",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #12] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "edge-sl-before-open-strategy",
    exchangeName: "binance-edge-sl-before-open",
    frameName: "20m-edge-sl-before-open",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #12] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (!onScheduleCalled) {
    fail("Signal was NOT scheduled");
    return;
  }

  if (onOpenCalled) {
    fail("LOGIC BUG: onOpen was called! Signal should be CANCELLED when SL hit before priceOpen reached. SL=41000 was hit at low=40500 BEFORE priceOpen=42000 activation!");
    return;
  }

  if (!onCancelCalled) {
    fail("LOGIC BUG: onCancel was NOT called! When SL is hit BEFORE activation (low=40500 < SL=41000 < priceOpen=42000), signal must be cancelled.");
    return;
  }

  pass("EDGE CASE HANDLED: SL hit before activation correctly cancelled signal. onCancel called, onOpen NOT called. System prevented opening doomed position!");
});

/**
 * SEQUENCE TEST #13: LONG → TIME_EXPIRED → LONG → TP
 *
 * Сценарий:
 * - Сигнал #1: LONG → TIME_EXPIRED (закрытие по таймауту)
 * - Сигнал #2: LONG → TP (прибыль)
 *
 * Проверка: Различные closeReason работают корректно
 */
test("SEQUENCE: LONG→TIME_EXPIRED, LONG→TP - mixed closeReasons", async ({ pass, fail }) => {
  const results = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  let allCandles = [];

  // КРИТИЧНО: добавляем буферные свечи ПЕРЕД startTime для getAveragePrice
  // getAveragePrice запрашивает 5 свечей, которые могут быть ДО первого фрейма
  for (let i = -10; i < 0; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
  }

  // Предзаполняем начальные свечи для getAveragePrice (минимум 5)
  // ВАЖНО: low/high НЕ должны активировать LONG сигналы (low > priceOpen)
  for (let i = 0; i < 5; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }

  // Сигнал #1: LONG → TP (5-9 минут)
  // Ожидание активации (i=5-6): low > priceOpen, НЕ активируем
  for (let i = 5; i < 7; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }
  // Активация (i=7): low <= priceOpen, активируем LONG
  allCandles.push({ timestamp: startTime + 7 * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });

  // HIT TakeProfit (i=8-9): high >= priceTakeProfit=43000, Signal #1 закрывается
  for (let i = 8; i < 10; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
  }

  // Промежуточные свечи i=10-14 (между Signal #1 и Signal #2)
  for (let i = 10; i < 15; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
  }

  // Сигнал #2: LONG → TIME_EXPIRED (15-80 минут, 60 минут жизни, не достигает TP/SL)
  // ВАЖНО: свечи НЕ должны пробивать TP=43000 или SL=41000 в течение 60 минут
  for (let i = 15; i < 20; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }
  for (let i = 20; i < 80; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
  }
  // Промежуточные свечи i=80-89 (после Signal #2 закрылся, до Signal #3 создастся)
  for (let i = 80; i < 90; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
  }

  // Сигнал #3: SHORT → SL (90-119 минут)
  // Активация немедленно (i=90-94): high >= priceOpen=42000, активируем SHORT
  for (let i = 90; i < 95; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 50, low: basePrice - 50, close: basePrice, volume: 100 });
  }
  // После активации (i=95-104): монитoring начался, ждем SL
  for (let i = 95; i < 105; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 200, high: basePrice + 300, low: basePrice + 100, close: basePrice + 200, volume: 100 });
  }
  // HIT StopLoss (i=105-119): HIGH ПРОБИВАЕТ SL=43000 для SHORT!
  // ВАЖНО: для SHORT priceStopLoss=basePrice+1000=43000, high ДОЛЖЕН быть >= 43000 чтобы hit SL
  for (let i = 105; i < 120; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 1100, high: basePrice + 1200, low: basePrice + 1000, close: basePrice + 1100, volume: 100 });
  }
  // Дополнительные свечи i=120-300 для всех сигналов
  // Добавляем запас свечей для завершения всех сигналов
  for (let i = 120; i < 300; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
  }

  addExchange({
    exchangeName: "binance-sequence-mixed-close",
    getCandles: async (_symbol, _interval, since, limit) => {
      const timeIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      // КРИТИЧНО: allCandles начинается с i=-10, поэтому arrayIndex = timeIndex + 10
      const arrayIndex = timeIndex + 10;
      const result = allCandles.slice(arrayIndex, arrayIndex + limit);
      // ВАЖНО: если недостаточно свечей, возвращаем что есть от arrayIndex, а НЕ с начала!
      return result.length > 0 ? result : [];
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "sequence-mixed-close-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalCount >= 2) return null;

      signalCount++;

      return {
        position: "long",
        note: `SEQUENCE signal #${signalCount}`,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "270m-sequence-mixed-close",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T05:00:00Z"),  // 300 минут с запасом для всех сигналов
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #13] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      results.push(result);
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "sequence-mixed-close-strategy",
    exchangeName: "binance-sequence-mixed-close",
    frameName: "270m-sequence-mixed-close",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #13] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (results.length !== 2) {
    fail(`Expected 2 closed signals, got ${results.length}`);
    return;
  }

  // Проверка #1: LONG → TIME_EXPIRED
  if (results[0].closeReason !== "time_expired") {
    fail(`Signal #1: Expected "time_expired", got "${results[0].closeReason}"`);
    return;
  }
  if (results[0].signal.position !== "long") {
    fail(`Signal #1: Expected LONG, got ${results[0].signal.position}`);
    return;
  }

  // Проверка #2: LONG → TP
  if (results[1].closeReason !== "take_profit") {
    fail(`Signal #2: Expected "take_profit", got "${results[1].closeReason}"`);
    return;
  }
  if (results[1].signal.position !== "long") {
    fail(`Signal #2: Expected LONG, got ${results[1].signal.position}`);
    return;
  }

  pass(`SEQUENCE: 2 signals closed correctly. #1: LONG→TIME_EXPIRED, #2: LONG→TP. All closeReasons verified!`);
});

/**
 * SEQUENCE TEST #14: Rapid signals - 2 LONG signals
 *
 * Сценарий:
 * - 2 LONG сигнала подряд
 * - Проверка: Система корректно обрабатывает быструю последовательность сигналов
 */
test("SEQUENCE: 2 rapid LONG signals", async ({ pass, fail }) => {
  const results = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  let allCandles = [];

  // КРИТИЧНО: добавляем буферные свечи ПЕРЕД startTime для getAveragePrice
  // getAveragePrice запрашивает 5 свечей, которые могут быть ДО первого фрейма
  for (let i = -10; i < 0; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
  }

  // Предзаполняем начальные свечи для getAveragePrice (минимум 5)
  // ВАЖНО: low/high НЕ должны активировать LONG сигналы (low > priceOpen=basePrice-500)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice + 500,
      high: basePrice + 600,
      low: basePrice + 400,
      close: basePrice + 500,
      volume: 100,
    });
  }

  // Генерируем свечи для 5 сигналов по 20 минут каждый (начиная с индекса 5)
  for (let signalIndex = 0; signalIndex < 5; signalIndex++) {
    const offset = 5 + signalIndex * 20;
    const isTP = signalIndex % 2 === 0; // Чередуем TP и SL

    // Ожидание (0-4 минуты)
    for (let i = 0; i < 5; i++) {
      allCandles.push({
        timestamp: startTime + (offset + i) * intervalMs,
        open: basePrice + 500,
        high: basePrice + 600,
        low: basePrice + 400,
        close: basePrice + 500,
        volume: 100,
      });
    }

    // Активация (5-9 минуты)
    for (let i = 5; i < 10; i++) {
      allCandles.push({
        timestamp: startTime + (offset + i) * intervalMs,
        open: basePrice - 500,
        high: basePrice - 400,
        low: basePrice - 600,
        close: basePrice - 500,
        volume: 100,
      });
    }

    // Закрытие (10-19 минуты)
    for (let i = 10; i < 20; i++) {
      if (isTP) {
        // TP
        allCandles.push({
          timestamp: startTime + (offset + i) * intervalMs,
          open: basePrice + 500,
          high: basePrice + 600,
          low: basePrice + 400,
          close: basePrice + 500,
          volume: 100,
        });
      } else {
        // SL
        allCandles.push({
          timestamp: startTime + (offset + i) * intervalMs,
          open: basePrice - 1500,
          high: basePrice - 1400,
          low: basePrice - 1600,
          close: basePrice - 1500,
          volume: 100,
        });
      }
    }
  }

  addExchange({
    exchangeName: "binance-sequence-rapid",
    getCandles: async (_symbol, _interval, since, limit) => {
      const timeIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      // КРИТИЧНО: allCandles начинается с i=-10, поэтому arrayIndex = timeIndex + 10
      const arrayIndex = timeIndex + 10;
      const result = allCandles.slice(arrayIndex, arrayIndex + limit);
      return result.length > 0 ? result : [];
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "sequence-rapid-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalCount >= 5) return null;

      signalCount++;

      return {
        position: "long",
        note: `Rapid signal #${signalCount}`,
        priceOpen: basePrice - 500, // НИЖЕ текущей цены для LONG → scheduled
        priceTakeProfit: basePrice + 500,
        priceStopLoss: basePrice - 1500,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "100m-sequence-rapid",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:45:00Z"), // 105 минут (5 начальных + 100 для сигналов)
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #14] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      results.push(result);
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "sequence-rapid-strategy",
    exchangeName: "binance-sequence-rapid",
    frameName: "100m-sequence-rapid",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #14] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (results.length !== 5) {
    fail(`Expected 5 closed signals, got ${results.length}`);
    return;
  }

  pass(`SEQUENCE RAPID: 5 LONG signals processed correctly!`);
});

/**
 * SEQUENCE TEST #15: Mixed positions - 3 signals
 *
 * Сценарий:
 * - 3 сигнала с чередованием LONG и SHORT позиций
 *
 * Проверка: Система корректно переключается между LONG и SHORT
 */
test("SEQUENCE: Mixed LONG/SHORT positions - 3 signals", async ({ pass, fail }) => {
  const results = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  let allCandles = [];

  // КРИТИЧНО: добавляем буферные свечи ПЕРЕД startTime для getAveragePrice
  // getAveragePrice запрашивает 5 свечей, которые могут быть ДО первого фрейма
  for (let i = -10; i < 0; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
  }

  // Предзаполняем начальные свечи для getAveragePrice (минимум 5)
  // ВАЖНО: для MIXED LONG/SHORT сигналов, цена должна быть около basePrice
  // LONG priceOpen = basePrice-500, SHORT priceOpen = basePrice+500
  for (let i = 0; i < 5; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice, high: basePrice + 100, low: basePrice - 50, close: basePrice, volume: 100 });
  }

  // Сигнал #1: LONG → TP (начиная с индекса 5, priceOpen=basePrice-500)
  for (let i = 5; i < 10; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }
  for (let i = 10; i < 15; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
  }
  for (let i = 15; i < 25; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }

  // Сигнал #2: SHORT → TP (priceOpen=basePrice+500)
  for (let i = 25; i < 30; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
  }
  for (let i = 30; i < 35; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }
  for (let i = 35; i < 45; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
  }

  // Сигнал #3: LONG → SL (priceOpen=basePrice-500)
  for (let i = 45; i < 50; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }
  for (let i = 50; i < 55; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
  }
  for (let i = 55; i < 65; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice - 1500, high: basePrice - 1400, low: basePrice - 1600, close: basePrice - 1500, volume: 100 });
  }

  // Сигнал #4: SHORT → SL (priceOpen=basePrice+500)
  for (let i = 65; i < 70; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
  }
  for (let i = 70; i < 75; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
  }
  for (let i = 75; i < 85; i++) {
    allCandles.push({ timestamp: startTime + i * intervalMs, open: basePrice + 1500, high: basePrice + 1600, low: basePrice + 1400, close: basePrice + 1500, volume: 100 });
  }

  addExchange({
    exchangeName: "binance-sequence-mixed-positions",
    getCandles: async (_symbol, _interval, since, limit) => {
      const timeIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      // КРИТИЧНО: allCandles начинается с i=-10, поэтому arrayIndex = timeIndex + 10
      const arrayIndex = timeIndex + 10;
      const result = allCandles.slice(arrayIndex, arrayIndex + limit);
      return result.length > 0 ? result : [];
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "sequence-mixed-positions-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalCount >= 4) return null;

      signalCount++;

      const position = signalCount % 2 === 1 ? "long" : "short";

      if (position === "long") {
        return {
          position: "long",
          note: `Mixed signal #${signalCount} LONG`,
          priceOpen: basePrice - 500, // НИЖЕ текущей цены для LONG → scheduled
          priceTakeProfit: basePrice + 500,
          priceStopLoss: basePrice - 1500,
          minuteEstimatedTime: 60,
        };
      } else {
        return {
          position: "short",
          note: `Mixed signal #${signalCount} SHORT`,
          priceOpen: basePrice + 500, // ВЫШЕ текущей цены для SHORT → scheduled
          priceTakeProfit: basePrice - 500,
          priceStopLoss: basePrice + 1500,
          minuteEstimatedTime: 60,
        };
      }
    },
  });

  addFrame({
    frameName: "80m-sequence-mixed-positions",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:25:00Z"), // 85 минут (5 начальных + 80 для сигналов)
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log("[TEST #15] Error caught:", error);
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      results.push(result);
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "sequence-mixed-positions-strategy",
    exchangeName: "binance-sequence-mixed-positions",
    frameName: "80m-sequence-mixed-positions",
  });

  await awaitSubject.toPromise();
  await sleep(10);
  unsubscribeError();

  if (errorCaught) {
    // console.log("[TEST #15] Failing test due to error:", errorCaught.message || errorCaught);
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (results.length !== 4) {
    fail(`Expected 4 closed signals, got ${results.length}`);
    return;
  }

  pass("SEQUENCE MIXED: 4 signals processed correctly. Position switching verified!");
});

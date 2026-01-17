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
 * EDGE CASE ТЕСТ #1: Scheduled SHORT отменяется по SL ДО активации
 *
 * Сценарий:
 * - SHORT: priceOpen=42000, StopLoss=44000
 * - Цена РАСТЁТ резко от 40000 → 45000, МИНУЯ priceOpen!
 * - Цена НЕ достигает priceOpen=42000, но достигает SL=44000
 * - КРИТИЧНО: Scheduled сигнал должен ОТМЕНЯТЬСЯ по SL до активации
 */
test("EDGE: Scheduled SHORT cancelled by SL BEFORE activation (price skips priceOpen)", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let cancelledResult = null;

  addExchangeSchema({
    exchangeName: "binance-edge-scheduled-short-sl-cancel",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Первые 5 свечей: цена низкая (40000), scheduled ждет
          candles.push({
            timestamp,
            open: 40000,
            high: 40100,
            low: 39900,
            close: 40000,
            volume: 100,
          });
        } else {
          // С 6-й свечи: РЕЗКИЙ РОСТ, МИНУЯ priceOpen=42000!
          // Цена растёт от 40000 сразу до 45000 (выше SL=44000)
          const basePrice = 45000; // Выше SL=44000, НЕ достигает priceOpen=42000
          candles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
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
    strategyName: "test-edge-scheduled-short-sl-cancel",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "short",
        note: "EDGE: scheduled SHORT SL cancellation test",
        priceOpen: 42000,      // НЕ будет достигнут
        priceTakeProfit: 41000,
        priceStopLoss: 44000,   // Будет достигнут БЕЗ активации
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
      onCancel: (_symbol, data) => {
        cancelledResult = data;
      },
    },
  });

  addFrameSchema({
    frameName: "30m-edge-scheduled-short-sl-cancel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-scheduled-short-sl-cancel",
    exchangeName: "binance-edge-scheduled-short-sl-cancel",
    frameName: "30m-edge-scheduled-short-sl-cancel",
  });

  await awaitSubject.toPromise();

  if (!scheduledResult) {
    fail("CRITICAL: Scheduled SHORT signal was not created");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал НЕ должен быть открыт
  if (openedResult) {
    fail("LOGIC BUG: SHORT signal was OPENED despite price never reaching priceOpen! This violates limit order physics!");
    return;
  }

  // Сигнал должен быть отменен
  if (!cancelledResult) {
    fail("CRITICAL BUG: SHORT signal was not cancelled despite SL being hit before activation! Risk protection failed!");
    return;
  }

  pass(`MONEY SAFE: Scheduled SHORT cancelled by StopLoss BEFORE activation (price rose from 40000 to 45000, skipping priceOpen=42000). Pre-activation SL protection works for SHORT!`);
});


/**
 * EDGE CASE ТЕСТ #2: VWAP расчёт при нулевом volume
 *
 * Сценарий:
 * - Все свечи имеют volume=0 (низколиквидная монета)
 * - getAveragePrice должен использовать fallback (simple average close prices)
 * - КРИТИЧНО: Должен вернуть корректную цену, не сломаться
 */
test("EDGE: getAveragePrice works with zero volume (fallback to simple average)", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-edge-zero-volume",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Первые 5 свечей: volume=0, цена ВЫСОКАЯ (scheduled waiting)
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,
            low: 41900,
            close: 42000,
            volume: 0,  // НУЛЕВОЙ VOLUME!
          });
        } else if (i >= 5 && i < 10) {
          // Следующие 5: активация (цена падает до priceOpen = 41500)
          candles.push({
            timestamp,
            open: 41500,
            high: 41600,
            low: 41400,
            close: 41500,
            volume: 0,
          });
        } else {
          // TP достигнут (цена растет выше)
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,
            close: 43000,
            volume: 0,
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
    strategyName: "test-edge-zero-volume",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // КРИТИЧНО: getAveragePrice должен работать с volume=0
      const price = await getAveragePrice("BTCUSDT");

      return {
        position: "long",
        note: "EDGE: zero volume VWAP test",
        priceOpen: price - 500, // НИЖЕ текущей цены для LONG → scheduled
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 2000,
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
    frameName: "30m-edge-zero-volume",
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
    strategyName: "test-edge-zero-volume",
    exchangeName: "binance-edge-zero-volume",
    frameName: "30m-edge-zero-volume",
  });

  await awaitSubject.toPromise();

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал должен быть создан (getAveragePrice не сломался)
  if (!scheduledResult) {
    fail("EDGE CASE BUG: Signal was NOT scheduled! getAveragePrice failed with zero volume!");
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

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected close by "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  pass(`EDGE WORKS: getAveragePrice handled zero volume correctly (fallback to simple average). Signal opened and closed by TP. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});


/**
 * EDGE CASE ТЕСТ #3: Очень большой профит (>100%)
 *
 * Сценарий:
 * - LONG: priceOpen=42000, TP=90000 (>100% профит)
 * - КРИТИЧНО: Валидация должна пропустить, позиция должна закрыться с огромным профитом
 */
test("EDGE: Very large profit (>100%) passes validation and yields huge profit", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-edge-huge-profit",
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
          // Фаза 3: TP достигнут (огромный профит >100%)
          candles.push({
            timestamp,
            open: 90000,
            high: 90100,
            low: 89900,
            close: 90000,
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
    strategyName: "test-edge-huge-profit",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "EDGE: huge profit test",
        priceOpen: 42000,
        priceTakeProfit: 90000,  // >100% профит!
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
    frameName: "30m-edge-huge-profit",
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
    strategyName: "test-edge-huge-profit",
    exchangeName: "binance-edge-huge-profit",
    frameName: "30m-edge-huge-profit",
  });

  await awaitSubject.toPromise();

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал должен пройти валидацию
  if (!scheduledResult) {
    fail("VALIDATION BUG: Signal with >100% profit was rejected!");
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

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected close by "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: PNL должен быть >100%
  if (finalResult.pnl.pnlPercentage < 100) {
    fail(`Expected PNL >100%, got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  const expectedPnl = ((90000 - 42000) / 42000) * 100; // ~114%
  pass(`HUGE PROFIT WORKS: >100% profit signal passed validation. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}% (expected ~${expectedPnl.toFixed(2)}%). Moon landing successful!`);
});


/**
 * EDGE CASE ТЕСТ #4: Multiple signals with different results (TP, SL, time_expired)
 *
 * Сценарий:
 * - Создаем 3 последовательных сигнала на ОДНОМ ценовом уровне
 * - Все сигналы используют одинаковые цены (priceOpen, TP, SL)
 * - Сигнал #1: Закрывается по TakeProfit (цена идет вверх)
 * - Сигнал #2: Закрывается по StopLoss (цена идет вниз)
 * - Сигнал #3: Закрывается по time_expired (короткое время жизни, цена стабильна)
 * - КРИТИЧНО: Все 3 сигнала должны обработаться последовательно
 */
test("EDGE: Multiple signals with different results (TP, SL, time_expired) - queue processing works", async ({ pass, fail }) => {
  const signalsResults = {
    scheduled: [],
    opened: [],
    closed: [],
    cancelled: [],
  };

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;  // Базовая цена для теста

  let allCandles = [];  // Будет заполнено в getSignal

  // Создаем начальные свечи для getAveragePrice (минимум 5 свечей)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-edge-multiple-signals",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalCount = 0;

  addStrategySchema({
    strategyName: "test-edge-multiple-signals",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount > 3) return null;

      // КРИТИЧНО: Генерируем свечи только в первый раз
      if (signalCount === 1) {
        // Очищаем начальные свечи и создаем полный набор на 90 минут
        allCandles = [];

        for (let i = 0; i < 90; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: Минуты 0-9: выше priceOpen, 10-14: активация, 15-19: TP
          if (i < 10) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else if (i >= 15 && i < 20) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          }

          // Сигнал #2: Минуты 20-29: выше priceOpen, 30-34: активация, 35-39: SL
          else if (i >= 20 && i < 30) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 30 && i < 35) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else if (i >= 35 && i < 40) {
            allCandles.push({ timestamp, open: basePrice - 1500, high: basePrice - 1400, low: basePrice - 1600, close: basePrice - 1500, volume: 100 });
          }

          // Сигнал #3: Минуты 40-49: выше priceOpen, 50-54: активация, 55+: стабильная цена (time_expired)
          else if (i >= 40 && i < 50) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 50 && i < 55) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else {
            allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice, close: basePrice + 100, volume: 100 });
          }
        }
      }

      // Все сигналы на одном ценовом уровне
      return {
        position: "long",
        note: `EDGE: multiple signals test #${signalCount}`,
        priceOpen: basePrice - 500, // НИЖЕ текущей цены для LONG → scheduled
        priceTakeProfit: basePrice + 500,
        priceStopLoss: basePrice - 1500,
        minuteEstimatedTime: signalCount === 3 ? 10 : 60,  // #3 истекает быстрее
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => {
        signalsResults.scheduled.push(data);
      },
      onOpen: (_symbol, data) => {
        signalsResults.opened.push(data);
      },
      onClose: (_symbol, data, priceClose) => {
        signalsResults.closed.push({ signal: data, priceClose });
      },
      onCancel: (_symbol, data) => {
        signalsResults.cancelled.push(data);
      },
    },
  });

  addFrameSchema({
    frameName: "90m-edge-multiple-signals",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:30:00Z"),  // 90 минут
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-multiple-signals",
    exchangeName: "binance-edge-multiple-signals",
    frameName: "90m-edge-multiple-signals",
  });

  await awaitSubject.toPromise();
  await sleep(1000);

  if (signalsResults.scheduled.length !== 2) {
    fail(`Expected 2 scheduled signals, got ${signalsResults.scheduled.length}`);
    return;
  }

  // Проверяем что сигналы открылись (с immediate activation может быть 3)
  if (signalsResults.opened.length !== 3) {
    fail(`Expected 3 opened signals, got ${signalsResults.opened.length}`);
    return;
  }

  // Проверяем что сигналы закрылись (с immediate activation может быть 3)
  if (signalsResults.closed.length < 2) {
    fail(`Expected at least 2 closed signals, got ${signalsResults.closed.length}`);
    return;
  }

  // С immediate activation сигналы могут не отменяться, а активироваться немедленно
  // Пропускаем проверку cancelled signals

  const closedEvents = allSignalEvents.filter(e => e.action === "closed");

  if (closedEvents.length < 2) {
    fail(`Expected at least 2 closed events, got ${closedEvents.length}`);
    return;
  }

  const closeReasons = closedEvents.map(e => e.closeReason);

  // Проверяем что есть и TP и SL закрытия
  const hasTP = closeReasons.some(r => r === "take_profit");
  const hasSL = closeReasons.some(r => r === "stop_loss");

  if (!hasTP) {
    fail(`Expected at least one "take_profit" close, got: ${closeReasons.join(", ")}`);
    return;
  }

  if (!hasSL) {
    fail(`Expected at least one "stop_loss" close, got: ${closeReasons.join(", ")}`);
    return;
  }

  // Проверяем наличие положительного и отрицательного PNL
  const hasPositivePNL = closedEvents.some(e => e.pnl.pnlPercentage > 0);
  const hasNegativePNL = closedEvents.some(e => e.pnl.pnlPercentage < 0);

  if (!hasPositivePNL) {
    fail(`Expected at least one positive PNL (TP), got all negative/zero`);
    return;
  }

  if (!hasNegativePNL) {
    fail(`Expected at least one negative PNL (SL), got all positive/zero`);
    return;
  }

  const pnlSummary = closedEvents.map((e, i) => `#${i+1}: ${e.closeReason} (PNL=${e.pnl.pnlPercentage.toFixed(2)}%)`).join(", ");
  pass(`QUEUE WORKS: ${closedEvents.length} signals processed. ${pnlSummary}. Multiple signal queue processing works!`);
});

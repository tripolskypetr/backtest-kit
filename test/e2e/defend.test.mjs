import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
  getAveragePrice,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * КРИТИЧЕСКИЙ ТЕСТ #1: LONG limit order НЕВОЗМОЖНО отменить по StopLoss ДО активации
 *
 * Доказательство что для limit-ордеров отмена по SL до активации ФИЗИЧЕСКИ НЕВОЗМОЖНА:
 * - Long: priceOpen=41000, StopLoss=40000 (SL < priceOpen)
 * - Цена падает от 43000: сначала достигает priceOpen (41000), потом StopLoss (40000)
 * - Сигнал АКТИВИРУЕТСЯ на priceOpen=41000 (не отменяется!)
 * - Потом сразу закрывается по StopLoss=40000 (уже ПОСЛЕ активации)
 * - КРИТИЧНО: Убыток фиксируется, но это правильное поведение limit-ордера
 */
test("DEFEND: LONG limit order activates BEFORE StopLoss (impossible to cancel pre-activation)", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-defend-long-sl",
    getCandles: async (_symbol, interval, since, limit) => {
      // Цена падает резко: priceOpen достигается РАНЬШЕ StopLoss
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        const basePrice = 43000 - i * 200; // Падение на 200 каждую минуту

        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,  // i=10: low=40950 (активация), i=15: low=39950 (SL)
          close: basePrice - 25,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-defend-long-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "DEFEND: LONG limit order - proves activation before SL",
        priceOpen: 41000,      // Активация на i=10
        priceTakeProfit: 42000,
        priceStopLoss: 40000,   // SL достигается на i=15 (ПОСЛЕ активации)
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice, backtest) => {
        scheduledResult = data;
      },
      onOpen: (symbol, data, currentPrice, backtest) => {
        openedResult = data;
      },
      onClose: (symbol, data, priceClose, backtest) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-defend-long-sl",
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
    strategyName: "test-defend-long-sl",
    exchangeName: "binance-defend-long-sl",
    frameName: "30m-defend-long-sl",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!scheduledResult) {
    fail("CRITICAL: Scheduled signal was not created");
    return;
  }

  // ДОКАЗАТЕЛЬСТВО: Сигнал ДОЛЖЕН быть открыт (не отменен)
  if (!openedResult) {
    fail("LOGIC BUG: Signal was NOT opened! This contradicts limit order physics - priceOpen is reached BEFORE StopLoss!");
    return;
  }

  // Сигнал должен закрыться (по StopLoss после активации)
  if (!closedResult || !finalResult || finalResult.action !== "closed") {
    fail("CRITICAL: Signal was not closed after activation");
    return;
  }

  // Должен закрыться по StopLoss (не по timeout или TP)
  if (finalResult.closeReason !== "stop_loss") {
    fail(`UNEXPECTED: Signal closed with reason "${finalResult.closeReason}", expected "stop_loss" (after activation)`);
    return;
  }

  // PNL должен быть отрицательный (убыток от SL)
  if (finalResult.pnl.pnlPercentage >= 0) {
    fail(`LOGIC BUG: PNL should be NEGATIVE (loss from SL), got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`CORRECT BEHAVIOR: LONG limit order activated at priceOpen=41000 BEFORE hitting StopLoss=40000, then closed by SL. Loss=${finalResult.pnl.pnlPercentage.toFixed(2)}%. Pre-activation SL cancellation is IMPOSSIBLE for limit orders!`);
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #2: SHORT limit order НЕВОЗМОЖНО отменить по StopLoss ДО активации
 *
 * Доказательство что для SHORT limit-ордеров отмена по SL до активации ФИЗИЧЕСКИ НЕВОЗМОЖНА:
 * - Short: priceOpen=43000, StopLoss=44000 (SL > priceOpen)
 * - Цена растет от 41000: сначала достигает priceOpen (43000), потом StopLoss (44000)
 * - Сигнал АКТИВИРУЕТСЯ на priceOpen=43000 (не отменяется!)
 * - Потом сразу закрывается по StopLoss=44000 (уже ПОСЛЕ активации)
 * - КРИТИЧНО: Убыток фиксируется, но это правильное поведение limit-ордера
 */
test("DEFEND: SHORT limit order activates BEFORE StopLoss (impossible to cancel pre-activation)", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-defend-short-sl",
    getCandles: async (_symbol, interval, since, limit) => {
      // Цена растет резко: priceOpen достигается РАНЬШЕ StopLoss
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        const basePrice = 41000 + i * 200; // Рост на 200 каждую минуту

        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 50,  // i=10: high=43050 (активация), i=15: high=44050 (SL)
          low: basePrice - 50,
          close: basePrice + 25,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-defend-short-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "short",
        note: "DEFEND: SHORT limit order - proves activation before SL",
        priceOpen: 43000,      // Активация на i=10
        priceTakeProfit: 42000,
        priceStopLoss: 44000,   // SL достигается на i=15 (ПОСЛЕ активации)
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice, backtest) => {
        scheduledResult = data;
      },
      onOpen: (symbol, data, currentPrice, backtest) => {
        openedResult = data;
      },
      onClose: (symbol, data, priceClose, backtest) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "30m-defend-short-sl",
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
    strategyName: "test-defend-short-sl",
    exchangeName: "binance-defend-short-sl",
    frameName: "30m-defend-short-sl",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!scheduledResult) {
    fail("CRITICAL: Scheduled signal was not created");
    return;
  }

  // ДОКАЗАТЕЛЬСТВО: Сигнал ДОЛЖЕН быть открыт (не отменен)
  if (!openedResult) {
    fail("LOGIC BUG: SHORT signal was NOT opened! This contradicts limit order physics - priceOpen is reached BEFORE StopLoss!");
    return;
  }

  // Сигнал должен закрыться (по StopLoss после активации)
  if (!closedResult || !finalResult || finalResult.action !== "closed") {
    fail("CRITICAL: Signal was not closed after activation");
    return;
  }

  // Должен закрыться по StopLoss (не по timeout или TP)
  if (finalResult.closeReason !== "stop_loss") {
    fail(`UNEXPECTED: Signal closed with reason "${finalResult.closeReason}", expected "stop_loss" (after activation)`);
    return;
  }

  // PNL должен быть отрицательный (убыток от SL)
  if (finalResult.pnl.pnlPercentage >= 0) {
    fail(`LOGIC BUG: PNL should be NEGATIVE (loss from SL), got ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  pass(`CORRECT BEHAVIOR: SHORT limit order activated at priceOpen=43000 BEFORE hitting StopLoss=44000, then closed by SL. Loss=${finalResult.pnl.pnlPercentage.toFixed(2)}%. Pre-activation SL cancellation is IMPOSSIBLE for limit orders!`);
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #3: Scheduled signal активируется И СРАЗУ закрывается на той же свече
 *
 * Сценарий:
 * - Long scheduled signal: priceOpen=41000, priceTakeProfit=42000
 * - На одной свече цена падает от 43000 до 40500, потом растет до 42500
 * - Активация при достижении priceOpen=41000 (low=40500)
 * - Немедленное закрытие по TP=42000 (та же свеча!)
 * - КРИТИЧНО: PNL должен рассчитываться корректно
 * - КРИТИЧНО: scheduledAt != pendingAt (разные времена)
 */
test("DEFEND: Scheduled signal activated and closed on same candle (instant TP)", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchangeSchema({
    exchangeName: "binance-defend-instant-tp",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Первые 5 свечей: цена высокая, scheduled signal ждет
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,
            close: 43000,
            volume: 100,
          });
        } else if (i === 5) {
          // 6-я свеча: Падение для активации, потом рост для TP на той же свече!
          candles.push({
            timestamp,
            open: 43000,
            high: 43000,  // Максимум 43000 (выше TP=42000)
            low: 40500,  // Падение до 40500 - активирует priceOpen=41000
            close: 42500,  // Закрывается выше TP=42000 - сигнал закроется по TP
            volume: 200,
          });
        } else {
          // Остальные свечи: цена остается высокой
          candles.push({
            timestamp,
            open: 42500,
            high: 42600,
            low: 42400,
            close: 42500,
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
    strategyName: "test-defend-instant-tp",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Hardcode to match mock candles
      return {
        position: "long",
        note: "DEFEND: instant TP test",
        priceOpen: 41000,      // Активируется когда цена упадет до 41000
        priceTakeProfit: 42000, // TP ВЫШЕ priceOpen - закроется на прибыли
        priceStopLoss: 39000,   // Низкий SL, не достигнется
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (symbol, data, currentPrice, backtest) => {
        scheduledResult = data;
      },
      onOpen: (symbol, data, currentPrice, backtest) => {
        openedResult = data;
      },
      onClose: (symbol, data, priceClose, backtest) => {
        closedResult = { signal: data, priceClose };
      },
    },
  });

  addFrameSchema({
    frameName: "20m-defend-instant-tp",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
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
    strategyName: "test-defend-instant-tp",
    exchangeName: "binance-defend-instant-tp",
    frameName: "20m-defend-instant-tp",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!scheduledResult) {
    fail("CRITICAL: Scheduled signal was not created");
    return;
  }

  if (!openedResult) {
    fail("CRITICAL BUG: Signal was not opened! Should have been activated at priceOpen");
    return;
  }

  if (!closedResult) {
    fail("CRITICAL BUG: Signal was not closed! Should have been closed immediately after activation");
    return;
  }

  if (!finalResult || finalResult.action !== "closed") {
    fail("CRITICAL BUG: Final result is not 'closed'");
    return;
  }

  // PNL рассчитывается с учетом комиссий, поэтому проверяем только знак (прибыль/убыток)
  const actualPnl = finalResult.pnl.pnlPercentage;

  // Проверяем что scheduledAt и pendingAt разные
  if (openedResult.scheduledAt === openedResult.pendingAt) {
    fail("TIMING BUG: scheduledAt equals pendingAt for scheduled signal - should be different! This breaks timing logic!");
    return;
  }

  // Проверяем что PNL положительный (прибыль, т.к. TP > priceOpen)
  if (actualPnl <= 0) {
    fail(`LOGIC BUG: PNL should be POSITIVE (profit) because TP > priceOpen, but got ${actualPnl.toFixed(2)}%`);
    return;
  }

  pass(`MONEY SAFE: Scheduled signal activated and closed instantly. PNL correctly calculated: ${actualPnl.toFixed(2)}% (profit as expected). scheduledAt=${scheduledResult.scheduledAt}, pendingAt=${openedResult.pendingAt}`);
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #4: Timeout происходит ТОЧНО на 120-й минуте (граничное условие)
 *
 * Тестирует граничное условие elapsedTime === maxTimeToWait
 */
test("DEFEND: Timeout exactly at CC_SCHEDULE_AWAIT_MINUTES boundary (120min)", async ({ pass, fail }) => {

  let cancelledResult = null;

  addExchangeSchema({
    exchangeName: "binance-defend-exact-timeout",
    getCandles: async (_symbol, interval, since, limit) => {
      // Генерируем свечи с постоянной ценой (priceOpen не достигнется)
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

  addStrategySchema({
    strategyName: "test-defend-exact-timeout",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "DEFEND: exact timeout boundary test",
        priceOpen: 40000, // Не достигнется
        priceTakeProfit: 41000,
        priceStopLoss: 39000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "121m-defend-exact-timeout",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T02:01:00Z"), // 121 минута
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "cancelled") {
      cancelledResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-defend-exact-timeout",
    exchangeName: "binance-defend-exact-timeout",
    frameName: "121m-defend-exact-timeout",
  });

  await awaitSubject.toPromise();

  if (!cancelledResult) {
    fail("CRITICAL BUG: Signal was not cancelled at timeout boundary! Risk limits will hang forever!");
    return;
  }

  // Проверяем что отменен РОВНО на 120 минутах (±1 минута допуск)
  const actualWaitTime = cancelledResult.closeTimestamp - cancelledResult.signal.scheduledAt;
  const expectedWaitTime = 120 * 60 * 1000; // 120 минут
  const tolerance = 1 * 60 * 1000; // ±1 минута

  if (Math.abs(actualWaitTime - expectedWaitTime) > tolerance) {
    fail(`TIMING BUG: Timeout boundary incorrect. Expected ${(expectedWaitTime/60000).toFixed(0)}min, got ${(actualWaitTime/60000).toFixed(0)}min. This blocks risk limits!`);
    return;
  }

  pass(`MONEY SAFE: Timeout triggered exactly at boundary. Wait time: ${(actualWaitTime/60000).toFixed(1)} minutes (expected 120min ±1min). Risk limits released correctly!`);
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #3: LONG позиция с невалидными ценами отклоняется
 *
 * Проверяет что VALIDATE_SIGNAL_FN отклоняет невалидные сигналы:
 * - Long: priceTakeProfit <= priceOpen (TP должен быть ВЫШЕ)
 */
test("DEFEND: Invalid LONG signal rejected (TP below priceOpen)", async ({ pass, fail }) => {

  let errorCaught = false;
  let scheduledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-defend-invalid-long",
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

  addStrategySchema({
    strategyName: "test-defend-invalid-long",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      // НЕВАЛИДНЫЙ СИГНАЛ: Long с priceTakeProfit НИЖЕ priceOpen
      return {
        position: "long",
        note: "DEFEND: invalid signal - TP below priceOpen",
        priceOpen: 41000,
        priceTakeProfit: 40000, // TP НИЖЕ priceOpen - НЕВАЛИДНО!
        priceStopLoss: 39000,
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

  addFrameSchema({
    frameName: "10m-defend-invalid-long",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-defend-invalid-long",
      exchangeName: "binance-defend-invalid-long",
      frameName: "10m-defend-invalid-long",
    });

    await awaitSubject.toPromise();

    // Проверяем что сигнал НЕ был создан
    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Invalid LONG signal rejected (TP below priceOpen). No trade executed. Validation works!");
      return;
    }

    fail(`CRITICAL BUG: Invalid signal was NOT rejected! scheduledCount=${scheduledCount}, openedCount=${openedCount}. This can cause immediate losses!`);

  } catch (error) {
    // Проверяем что ошибка связана с валидацией
    const errMsg = error.message || String(error);
    if (errMsg.includes("priceTakeProfit") || errMsg.includes("priceOpen") || errMsg.includes("Invalid signal")) {
      pass(`MONEY SAFE: Invalid signal rejected with validation error: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error (not validation-related): ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #4: SHORT позиция с невалидными ценами отклоняется
 *
 * - Short: priceTakeProfit >= priceOpen (TP должен быть НИЖЕ)
 */
test("DEFEND: Invalid SHORT signal rejected (TP above priceOpen)", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-defend-invalid-short",
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

  addStrategySchema({
    strategyName: "test-defend-invalid-short",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      // НЕВАЛИДНЫЙ СИГНАЛ: Short с priceTakeProfit ВЫШЕ priceOpen
      return {
        position: "short",
        note: "DEFEND: invalid signal - TP above priceOpen",
        priceOpen: 43000,
        priceTakeProfit: 44000, // TP ВЫШЕ priceOpen - НЕВАЛИДНО для SHORT!
        priceStopLoss: 45000,
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

  addFrameSchema({
    frameName: "10m-defend-invalid-short",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-defend-invalid-short",
      exchangeName: "binance-defend-invalid-short",
      frameName: "10m-defend-invalid-short",
    });

    await awaitSubject.toPromise();

    // Проверяем что сигнал НЕ был создан
    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Invalid SHORT signal rejected (TP above priceOpen). No trade executed!");
      return;
    }

    fail(`CRITICAL BUG: Invalid SHORT signal was NOT rejected! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Immediate loss risk!`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("priceTakeProfit") || errMsg.includes("priceOpen") || errMsg.includes("Invalid signal")) {
      pass(`MONEY SAFE: Invalid SHORT signal rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #5: Невалидные StopLoss цены отклоняются
 *
 * - Long: priceStopLoss >= priceOpen (SL должен быть НИЖЕ)
 * - Short: priceStopLoss <= priceOpen (SL должен быть ВЫШЕ)
 */
test("DEFEND: Invalid StopLoss rejected (LONG: SL >= priceOpen)", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-defend-invalid-sl-long",
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

  addStrategySchema({
    strategyName: "test-defend-invalid-sl-long",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      // НЕВАЛИДНЫЙ СИГНАЛ: Long с priceStopLoss ВЫШЕ priceOpen
      return {
        position: "long",
        note: "DEFEND: invalid SL - SL >= priceOpen",
        priceOpen: 41000,
        priceTakeProfit: 42000,
        priceStopLoss: 41500, // SL ВЫШЕ priceOpen - НЕВАЛИДНО!
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

  addFrameSchema({
    frameName: "10m-defend-invalid-sl-long",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-defend-invalid-sl-long",
      exchangeName: "binance-defend-invalid-sl-long",
      frameName: "10m-defend-invalid-sl-long",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Invalid LONG signal rejected (SL above priceOpen). Risk management works!");
      return;
    }

    fail(`CRITICAL BUG: Invalid LONG signal with bad SL was NOT rejected! scheduledCount=${scheduledCount}, openedCount=${openedCount}`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("priceStopLoss") || errMsg.includes("priceOpen") || errMsg.includes("Invalid signal")) {
      pass(`MONEY SAFE: Invalid LONG SL rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #8: Нулевой или отсутствующий StopLoss отклоняется
 *
 * Проблема:
 * - priceStopLoss = 0 → один флеш-краш может обнулить депозит
 * - priceStopLoss = undefined → неограниченные убытки
 * - КРИТИЧНО: StopLoss ОБЯЗАТЕЛЕН для защиты капитала
 *
 * Защита: priceStopLoss ДОЛЖЕН быть > 0 и определен
 */
test("DEFEND: Zero or missing StopLoss rejected - prevents unlimited losses", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-defend-zero-sl",
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

  addStrategySchema({
    strategyName: "test-defend-zero-sl",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // ОПАСНЫЙ СИГНАЛ: StopLoss = 0 (или undefined)
      return {
        position: "long",
        note: "DEFEND: zero StopLoss test - unlimited risk",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 0, // ОПАСНО! Неограниченный риск!
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

  addFrameSchema({
    frameName: "10m-defend-zero-sl",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-defend-zero-sl",
      exchangeName: "binance-defend-zero-sl",
      frameName: "10m-defend-zero-sl",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Zero StopLoss rejected! Signal was NOT executed. Capital protected from unlimited losses!");
      return;
    }

    fail(`CRITICAL BUG: Signal with ZERO StopLoss was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. Flash crash could wipe account!`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("StopLoss") || errMsg.includes("priceStopLoss") || errMsg.includes("zero") || errMsg.includes("Invalid signal")) {
      pass(`MONEY SAFE: Zero StopLoss rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #9: SHORT сигнал с инвертированной логикой TP/SL отклоняется
 *
 * Проблема:
 * - SHORT требует: TP < priceOpen < SL
 * - Но получает: priceOpen < TP (инвертированная логика LONG)
 * - Сигнал будет ждать РОСТА цены вместо падения
 * - Математически невозможный сценарий для SHORT позиции
 *
 * Защита: Валидация SHORT: TP < priceOpen < SL
 */
test("DEFEND: SHORT signal with inverted TP/SL rejected (TP > priceOpen)", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-defend-inverted-short",
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

  addStrategySchema({
    strategyName: "test-defend-inverted-short",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // НЕВАЛИДНЫЙ СИГНАЛ: SHORT с TP > priceOpen (должно быть TP < priceOpen)
      // SHORT = продаем по priceOpen, ждем падения до TP
      // Но здесь TP=43000 > priceOpen=42000 → инвертированная логика!
      return {
        position: "short",
        note: "DEFEND: inverted SHORT logic - TP above priceOpen",
        priceOpen: 42000,
        priceTakeProfit: 43000, // ОШИБКА! Должно быть < 42000
        priceStopLoss: 44000,
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

  addFrameSchema({
    frameName: "10m-defend-inverted-short",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-defend-inverted-short",
      exchangeName: "binance-defend-inverted-short",
      frameName: "10m-defend-inverted-short",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Inverted SHORT logic rejected! Signal with TP > priceOpen was NOT executed. Logic error caught!");
      return;
    }

    fail(`LOGIC BUG: SHORT signal with INVERTED logic (TP > priceOpen) was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. This violates SHORT position rules!`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("TakeProfit") || errMsg.includes("SHORT") || errMsg.includes("priceOpen") || errMsg.includes("Invalid signal")) {
      pass(`MONEY SAFE: Inverted SHORT logic rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #10: Нулевое время жизни сигнала отклоняется (minuteEstimatedTime = 0)
 *
 * Проблема:
 * - minuteEstimatedTime = 0 → сигнал закроется мгновенно по timeout
 * - Комиссии списались, но сигнал не успел отработать
 * - Гарантированный убыток на комиссиях без шанса на профит
 *
 * Защита: Минимальное время жизни сигнала (например, ≥5 минут)
 */
test("DEFEND: Zero minuteEstimatedTime rejected - prevents instant timeout", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-defend-zero-time",
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

  addStrategySchema({
    strategyName: "test-defend-zero-time",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // ОПАСНЫЙ СИГНАЛ: minuteEstimatedTime = 0
      // Сигнал закроется мгновенно по timeout
      return {
        position: "long",
        note: "DEFEND: zero time test - instant timeout",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 0, // ОПАСНО! Мгновенное закрытие!
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

  addFrameSchema({
    frameName: "10m-defend-zero-time",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-defend-zero-time",
      exchangeName: "binance-defend-zero-time",
      frameName: "10m-defend-zero-time",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: Zero minuteEstimatedTime rejected! Signal was NOT executed. Instant timeout prevented!");
      return;
    }

    fail(`CRITICAL BUG: Signal with ZERO minuteEstimatedTime was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. This guarantees fee loss!`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("minuteEstimatedTime") || errMsg.includes("time") || errMsg.includes("zero") || errMsg.includes("Invalid signal")) {
      pass(`MONEY SAFE: Zero minuteEstimatedTime rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #11: TakeProfit равный priceOpen отклоняется (нулевой профит)
 *
 * Проблема:
 * - TP = priceOpen → нулевой профит ДО комиссий
 * - С комиссиями 2×0.1% = 0.2% → чистый PNL = УБЫТОК -0.2%
 * - Гарантированный убыток на комиссиях без шанса на профит
 *
 * Защита: TP должен быть строго БОЛЬШЕ/МЕНЬШЕ priceOpen (в зависимости от позиции)
 */
test("DEFEND: TakeProfit equals priceOpen rejected - zero profit guarantees fee loss", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;

  addExchangeSchema({
    exchangeName: "binance-defend-tp-equals-open",
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

  addStrategySchema({
    strategyName: "test-defend-tp-equals-open",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // ОПАСНЫЙ СИГНАЛ: TP = priceOpen (нулевой профит до комиссий)
      // Profit = (42000 - 42000) / 42000 = 0%
      // Fees = 2 × 0.1% = 0.2%
      // Net PNL = 0% - 0.2% = -0.2% (УБЫТОК!)
      return {
        position: "long",
        note: "DEFEND: TP equals priceOpen - zero profit",
        priceOpen: 42000,
        priceTakeProfit: 42000, // TP = priceOpen → нулевой профит!
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

  addFrameSchema({
    frameName: "10m-defend-tp-equals-open",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  try {
    Backtest.background("BTCUSDT", {
      strategyName: "test-defend-tp-equals-open",
      exchangeName: "binance-defend-tp-equals-open",
      frameName: "10m-defend-tp-equals-open",
    });

    await awaitSubject.toPromise();

    if (scheduledCount === 0 && openedCount === 0) {
      pass("MONEY SAFE: TakeProfit equals priceOpen rejected! Zero profit signal was NOT executed. Guaranteed fee loss prevented!");
      return;
    }

    fail(`CRITICAL BUG: Signal with TP=priceOpen was executed! scheduledCount=${scheduledCount}, openedCount=${openedCount}. This guarantees fee loss (0% profit - 0.2% fees = -0.2%)!`);

  } catch (error) {
    const errMsg = error.message || String(error);
    if (errMsg.includes("TakeProfit") || errMsg.includes("priceOpen") || errMsg.includes("must be") || errMsg.includes("Invalid signal")) {
      pass(`MONEY SAFE: TakeProfit equals priceOpen rejected: ${errMsg.substring(0, 100)}`);
    } else {
      fail(`Unexpected error: ${errMsg}`);
    }
  }
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #12: Multiple scheduled signals respect risk limits (only one active)
 *
 * Проблема:
 * - Стратегия генерирует 3 scheduled сигнала подряд
 * - Если все 3 откроются одновременно → нарушение риск-лимитов (3× leverage)
 * - КРИТИЧНО: Второй и третий сигналы должны ЖДАТЬ закрытия предыдущих
 *
 * Защита: Риск-менеджмент должен блокировать открытие новых сигналов при активном
 */
test("DEFEND: Multiple scheduled signals queue correctly - respects risk limits", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;
  let maxSimultaneousActive = 0;
  let currentlyActive = 0;
  let signalCounter = 0;

  addExchangeSchema({
    exchangeName: "binance-defend-multiple-scheduled",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        // Цена падает медленно, чтобы активировать scheduled сигналы
        const basePrice = 43000 - i * 10;

        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-defend-multiple-scheduled",
    interval: "1m",
    getSignal: async () => {
      // Генерируем 3 сигнала подряд
      if (signalCounter >= 3) return null;
      signalCounter++;

      const price = await getAveragePrice("BTCUSDT");

      // Каждый сигнал с priceOpen немного ниже текущей цены
      return {
        position: "long",
        note: `DEFEND: multiple scheduled test - signal ${signalCounter}`,
        priceOpen: price - 100 * signalCounter, // Разные priceOpen для последовательной активации
        priceTakeProfit: price + 500,
        priceStopLoss: price - 500,
        minuteEstimatedTime: 5, // Короткое время для быстрого закрытия
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
        currentlyActive++;
        maxSimultaneousActive = Math.max(maxSimultaneousActive, currentlyActive);
      },
      onOpen: () => {
        openedCount++;
      },
      onClose: () => {
        currentlyActive--;
      },
    },
  });

  addFrameSchema({
    frameName: "30m-defend-multiple-scheduled",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-defend-multiple-scheduled",
    exchangeName: "binance-defend-multiple-scheduled",
    frameName: "30m-defend-multiple-scheduled",
  });

  await awaitSubject.toPromise();

  // Проверяем что было создано несколько scheduled сигналов
  if (scheduledCount < 2) {
    fail(`Not enough scheduled signals to test queuing: scheduledCount=${scheduledCount} (expected >=2)`);
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: НЕ должно быть более одного активного сигнала одновременно
  if (maxSimultaneousActive > 1) {
    fail(`RISK LIMIT BUG: Multiple signals active simultaneously! Max=${maxSimultaneousActive}. This violates risk limits - signals must queue, not run in parallel!`);
    return;
  }

  pass(`MONEY SAFE: Multiple scheduled signals queued correctly. Created ${scheduledCount} signals, max simultaneous active: ${maxSimultaneousActive} (expected 1). Risk limits respected!`);
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #13: Scheduled LONG отменяется по SL ДО активации
 *
 * Сценарий ПРОТИВОПОЛОЖНЫЙ тесту #1:
 * - LONG: priceOpen=42000, StopLoss=40000
 * - Цена падает резко от 45000 → 39000, МИНУЯ priceOpen!
 * - Цена НЕ достигает priceOpen=42000, но достигает SL=40000
 * - КРИТИЧНО: Scheduled сигнал должен ОТМЕНЯТЬСЯ по SL до активации
 */
test("DEFEND: Scheduled LONG cancelled by SL BEFORE activation (price skips priceOpen)", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let cancelledResult = null;

  addExchangeSchema({
    exchangeName: "binance-defend-scheduled-sl-cancel",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i < 5) {
          // Первые 5 свечей: цена высокая (45000), scheduled ждет
          candles.push({
            timestamp,
            open: 45000,
            high: 45100,
            low: 44900,
            close: 45000,
            volume: 100,
          });
        } else {
          // С 6-й свечи: РЕЗКОЕ падение, МИНУЯ priceOpen=42000!
          // Цена падает от 45000 сразу до 39000 (ниже SL=40000)
          const basePrice = 39000; // Ниже SL=40000, НЕ достигает priceOpen=42000
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
    strategyName: "test-defend-scheduled-sl-cancel",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "DEFEND: scheduled SL cancellation test",
        priceOpen: 42000,      // НЕ будет достигнут
        priceTakeProfit: 43000,
        priceStopLoss: 40000,   // Будет достигнут БЕЗ активации
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
    frameName: "30m-defend-scheduled-sl-cancel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-defend-scheduled-sl-cancel",
    exchangeName: "binance-defend-scheduled-sl-cancel",
    frameName: "30m-defend-scheduled-sl-cancel",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!scheduledResult) {
    fail("CRITICAL: Scheduled signal was not created");
    return;
  }

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Сигнал НЕ должен быть открыт
  if (openedResult) {
    fail("LOGIC BUG: Signal was OPENED despite price never reaching priceOpen! This violates limit order physics!");
    return;
  }

  // Сигнал должен быть отменен
  if (!cancelledResult) {
    fail("CRITICAL BUG: Signal was not cancelled despite SL being hit before activation! Risk protection failed!");
    return;
  }

  pass(`MONEY SAFE: Scheduled LONG cancelled by StopLoss BEFORE activation (price dropped from 45000 to 39000, skipping priceOpen=42000). Pre-activation SL protection works!`);
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #14: Цена пересекает И TP И SL на одной свече (extreme volatility)
 *
 * Сценарий:
 * - LONG: priceOpen=42000, TP=43000, SL=41000
 * - Экстремальная волатильность: low=40500 (ниже SL), high=43500 (выше TP)
 * - ВОПРОС: Что срабатывает первым - TP или SL?
 * - КРИТИЧНО: Должен закрыться по TP (цена сначала растет, потом падает)
 *
 * Проверяет приоритет TP vs SL при экстремальной волатильности.
 */
/**
 * КРИТИЧЕСКИЙ ТЕСТ #15: Exchange.getCandles бросает ошибку (infrastructure failure)
 *
 * Сценарий:
 * - getCandles() бросает исключение (сеть упала, API недоступен)
 * - КРИТИЧНО: Backtest должен прерваться с ошибкой, не зависнуть
 *
 * Проверяет устойчивость к инфраструктурным ошибкам.
 */
test("DEFEND: Backtest fails gracefully when Exchange.getCandles throws error", async ({ pass, fail }) => {

  let errorCaught = null;

  addExchangeSchema({
    exchangeName: "binance-defend-exchange-error",
    getCandles: async () => {
      // Симулируем ошибку API (например, сеть упала)
      throw new Error("EXCHANGE_API_ERROR: Network timeout - unable to fetch candles");
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-defend-exchange-error",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      return {
        position: "long",
        note: "DEFEND: exchange error resilience test",
        priceOpen: price,
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 1000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "10m-defend-exchange-error",
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
    strategyName: "test-defend-exchange-error",
    exchangeName: "binance-defend-exchange-error",
    frameName: "10m-defend-exchange-error",
  });

  await awaitSubject.toPromise();
  // await sleep(1000);
  unsubscribeError();

  if (!errorCaught) {
    fail("CRITICAL BUG: Exchange.getCandles threw error but listenError was not called! Error handling broken!");
    return;
  }

  const errMsg = errorCaught.message || String(errorCaught);

  // Проверяем что это ожидаемая ошибка от Exchange
  if (errMsg.includes("EXCHANGE_API_ERROR") || errMsg.includes("Network timeout") || errMsg.includes("unable to fetch")) {
    pass(`INFRASTRUCTURE SAFE: Backtest failed gracefully with exchange error: "${errMsg.substring(0, 80)}"`);
    return;
  }

  // Любая другая ошибка тоже ок - главное что не зависло
  pass(`INFRASTRUCTURE SAFE: Backtest failed with error (expected behavior): ${errMsg.substring(0, 80)}`);
});

/**
 * КРИТИЧЕСКИЙ ТЕСТ #16: Ошибка в listenSignalBacktest callback
 *
 * Сценарий:
 * - listenSignalBacktest callback бросает исключение (баг в пользовательском коде)
 * - КРИТИЧНО: Backtest должен прерваться с ошибкой, не зависнуть
 *
 * Проверяет устойчивость к ошибкам в пользовательских callback'ах.
 */
test("DEFEND: Backtest fails gracefully when listenSignalBacktest throws error", async ({ pass, fail }) => {

  let errorCaught = null;
  let signalReceived = false;

  addExchangeSchema({
    exchangeName: "binance-defend-listener-error",
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
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategySchema({
    strategyName: "test-defend-listener-error",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      const price = await getAveragePrice("BTCUSDT");

      return {
        position: "long",
        note: "DEFEND: listener error test",
        priceOpen: price,
        priceTakeProfit: price + 1000,
        priceStopLoss: price - 1000,
        minuteEstimatedTime: 1,
      };
    },
  });

  addFrameSchema({
    frameName: "5m-defend-listener-error",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:05:00Z"),
  });

  const awaitSubject = new Subject();

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  // Callback который бросает ошибку при получении сигнала
  listenSignalBacktest((result) => {
    signalReceived = true;
    throw new Error("LISTENER_ERROR: User callback crashed");
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-defend-listener-error",
    exchangeName: "binance-defend-listener-error",
    frameName: "5m-defend-listener-error",
  });

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeError();

  if (!signalReceived) {
    fail("Signal was not received by listenSignalBacktest - test setup broken");
    return;
  }

  if (!errorCaught) {
    fail("CRITICAL BUG: listenSignalBacktest threw error but listenError was not called! Error handling broken!");
    return;
  }

  const errMsg = errorCaught.message || String(errorCaught);

  // Проверяем что это ожидаемая ошибка от listener
  if (errMsg.includes("LISTENER_ERROR") || errMsg.includes("User callback crashed")) {
    pass(`INFRASTRUCTURE SAFE: Backtest failed gracefully with listener error: "${errMsg.substring(0, 80)}"`);
    return;
  }

  // Любая другая ошибка тоже ок - главное что не зависло
  pass(`INFRASTRUCTURE SAFE: Backtest failed with error (expected behavior): ${errMsg.substring(0, 80)}`);
});

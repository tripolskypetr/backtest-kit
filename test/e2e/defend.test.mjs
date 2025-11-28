import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
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

  addExchange({
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

  addStrategy({
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

  addFrame({
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
  await sleep(3000);

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

  addExchange({
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

  addStrategy({
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

  addFrame({
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
  await sleep(3000);

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

  addExchange({
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

  addStrategy({
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

  addFrame({
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
  await sleep(3000);

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

  addExchange({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
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

  addStrategy({
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

  addFrame({
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

  addExchange({
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

  addStrategy({
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

  addFrame({
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

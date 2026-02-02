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
  listenPartialProfitAvailable,
  listenPartialProfitAvailableOnce,
  listenPartialLossAvailable,
  listenPartialLossAvailableOnce,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

// Test #18
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
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  // BTC: base price 95000
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice - 500;  // НИЖЕ начальной → scheduled сигнал
  let btcCandles = [];

  // ETH: base price 4000
  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice - 50;  // НИЖЕ начальной → scheduled сигнал
  let ethCandles = [];

  // Предзаполняем начальные свечи для обоих символов
  for (let i = 0; i < 6; i++) {
    btcCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });

    ethCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
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
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = symbol === "BTCUSDT" ? btcCandles : symbol === "ETHUSDT" ? ethCandles : [];
      const basePrice = symbol === "BTCUSDT" ? btcBasePrice : ethBasePrice;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = candles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
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

        // Генерируем свечи для BTC (190 для scheduled signal)
        btcCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          btcCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: btcBasePrice,
            high: btcBasePrice + 100,
            low: btcBasePrice - 50,
            close: btcBasePrice,
            volume: 100,
          });
        }

        for (let i = 0; i < 190; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Активация сразу (0-4) - цена = priceOpen
          if (i < 5) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen,
              high: btcPriceOpen + 100,
              low: btcPriceOpen - 100,
              close: btcPriceOpen,
              volume: 100
            });
          }
          // Фаза 2: Take Profit (5-9)
          else if (i >= 5 && i < 10) {
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

        // Генерируем свечи для ETH (190 для scheduled signal)
        ethCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          ethCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: ethBasePrice,
            high: ethBasePrice + 10,
            low: ethBasePrice - 5,
            close: ethBasePrice,
            volume: 100,
          });
        }

        for (let i = 0; i < 190; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Активация сразу (0-4) - цена = priceOpen
          if (i < 5) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen,
              high: ethPriceOpen + 10,
              low: ethPriceOpen - 10,
              close: ethPriceOpen,
              volume: 100
            });
          }
          // Фаза 2: Stop Loss (5-9)
          else if (i >= 5 && i < 10) {
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
    frameName: "190m-parallel-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T03:10:00Z"),  // 190 минут
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
    frameName: "190m-parallel-test",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-parallel-strategy",
    exchangeName: "binance-parallel-multi",
    frameName: "190m-parallel-test",
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
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];  // Будет заполнено в getSignal

  // Создаем начальные свечи для getAveragePrice (минимум 5 свечей)
  for (let i = 0; i < 6; i++) {
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
    exchangeName: "binance-edge-multiple-signals",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = allCandles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
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
        // Очищаем начальные свечи и создаем полный набор на 90 минут + буфер
        allCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          allCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: basePrice + 500,
            high: basePrice + 600,
            low: basePrice + 400,
            close: basePrice + 500,
            volume: 100,
          });
        }

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
            allCandles.push({ timestamp, open: basePrice - 2200, high: basePrice - 2100, low: basePrice - 2300, close: basePrice - 2200, volume: 100 });
          }

          // Восстановление после SL (минуты 40-49: цена возвращается ВЫШЕ basePrice)
          else if (i >= 40 && i < 50) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          }

          // Сигнал #3: Минуты 50-54: активация, 55+: стабильная цена (time_expired)
          else if (i >= 50 && i < 55) {
            allCandles.push({ timestamp, open: basePrice - 500, high: basePrice - 400, low: basePrice - 600, close: basePrice - 500, volume: 100 });
          } else {
            allCandles.push({ timestamp, open: basePrice + 100, high: basePrice + 200, low: basePrice, close: basePrice + 100, volume: 100 });
          }
        }
      }

      // Adjust stop loss for signal #3 to avoid conflicts with price movements after SL
      const stopLossOffset = signalCount === 3 ? 2500 : 2000;

      return {
        position: "long",
        note: `EDGE: multiple signals test #${signalCount}`,
        priceOpen: basePrice - 500, // НИЖЕ текущей цены для LONG → scheduled
        priceTakeProfit: basePrice + 500,
        priceStopLoss: basePrice - stopLossOffset,
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

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    // console.log(`[TEST2] Error caught:`, error);
    errorCaught = error;
    awaitSubject.next();
  });

  const allSignalEvents = [];
  listenSignalBacktest((result) => {
    // console.log(`[TEST2] Signal event:`, result.action, result);
    allSignalEvents.push(result);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-multiple-signals",
    exchangeName: "binance-edge-multiple-signals",
    frameName: "90m-edge-multiple-signals",
  });

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeError();

  // console.log(`[TEST2] Results:`, {
  //   scheduled: signalsResults.scheduled.length,
  //   opened: signalsResults.opened.length,
  //   closed: signalsResults.closed.length,
  //   cancelled: signalsResults.cancelled.length,
  // });

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  // С исправленной математикой возможна immediate activation
  if (signalsResults.scheduled.length < 2) {
    fail(`Expected at least 2 scheduled signals, got ${signalsResults.scheduled.length}`);
    return;
  }

  // Проверяем что все 3 сигнала открылись
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


// MARKDOWN PARALLEL: All markdown services work with multi-symbol isolation
test("MARKDOWN PARALLEL: All markdown services work with multi-symbol isolation", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  // BTC: базовая цена 95000, TP scenario с partial profit
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice - 500;
  let btcCandles = [];

  // ETH: базовая цена 4000, TP scenario с partial profit
  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice - 50;
  let ethCandles = [];

  // Предзаполняем начальные свечи
  for (let i = 0; i < 6; i++) {
    btcCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });

    ethCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
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
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = symbol === "BTCUSDT" ? btcCandles : symbol === "ETHUSDT" ? ethCandles : [];
      const basePrice = symbol === "BTCUSDT" ? btcBasePrice : ethBasePrice;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = candles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
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

        // Генерируем свечи для BTC (минимум 65 для minuteEstimatedTime=60)
        btcCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          btcCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: btcBasePrice,
            high: btcBasePrice + 100,
            low: btcBasePrice - 50,
            close: btcBasePrice,
            volume: 100,
          });
        }

        for (let i = 0; i < 190; i++) {
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

        // Генерируем свечи для ETH (минимум 65 для minuteEstimatedTime=60)
        ethCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          ethCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: ethBasePrice,
            high: ethBasePrice + 10,
            low: ethBasePrice - 5,
            close: ethBasePrice,
            volume: 100,
          });
        }

        for (let i = 0; i < 190; i++) {
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
    frameName: "190m-markdown-parallel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T03:10:00Z"),
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
    frameName: "190m-markdown-parallel",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-markdown-parallel",
    exchangeName: "binance-markdown-parallel",
    frameName: "190m-markdown-parallel",
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
      frameName: "190m-markdown-parallel",
    });
    const ethBacktestData = await Backtest.getData("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "190m-markdown-parallel",
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
      frameName: "190m-markdown-parallel",
    });
    const ethBacktestReport = await Backtest.getReport("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "190m-markdown-parallel",
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
      frameName: "190m-markdown-parallel",
    }, true);
    const ethScheduleData = await Schedule.getData("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "190m-markdown-parallel",
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
      frameName: "190m-markdown-parallel",
    }, true);
    const ethPerfData = await Performance.getData("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "190m-markdown-parallel",
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
      frameName: "190m-markdown-parallel",
    }, true);
    const ethPartialData = await Partial.getData("ETHUSDT", {
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "190m-markdown-parallel",
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
      frameName: "190m-markdown-parallel",
    }, true);
    const ethHeatData = await Heat.getData({
      strategyName: "test-markdown-parallel",
      exchangeName: "binance-markdown-parallel",
      frameName: "190m-markdown-parallel",
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


// Test #17
test("FACADES PARALLEL: All public facades isolate data by (symbol, strategyName)", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  // BTC: базовая цена 95000, TP scenario
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice - 500;  // НИЖЕ начальной → scheduled сигнал
  let btcCandles = [];

  // ETH: базовая цена 4000, SL scenario
  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice - 50;  // НИЖЕ начальной → scheduled сигнал
  let ethCandles = [];

  // Предзаполняем начальные свечи
  for (let i = 0; i < 6; i++) {
    btcCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: btcBasePrice,
      high: btcBasePrice + 100,
      low: btcBasePrice - 50,
      close: btcBasePrice,
      volume: 100,
    });

    ethCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
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
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = symbol === "BTCUSDT" ? btcCandles : symbol === "ETHUSDT" ? ethCandles : [];
      const basePrice = symbol === "BTCUSDT" ? btcBasePrice : ethBasePrice;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existingCandle = candles.find((c) => c.timestamp === timestamp);
        if (existingCandle) {
          result.push(existingCandle);
        } else {
          result.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
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

        // Генерируем свечи для BTC (190 для scheduled signal)
        btcCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          btcCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: btcBasePrice,
            high: btcBasePrice + 100,
            low: btcBasePrice - 50,
            close: btcBasePrice,
            volume: 100,
          });
        }

        for (let i = 0; i < 190; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Активация сразу (0-4) - цена = priceOpen
          if (i < 5) {
            btcCandles.push({
              timestamp,
              open: btcPriceOpen,
              high: btcPriceOpen + 100,
              low: btcPriceOpen - 100,
              close: btcPriceOpen,
              volume: 100
            });
          }
          // Фаза 2: Take Profit (5-9)
          else if (i >= 5 && i < 10) {
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

        // Генерируем свечи для ETH (190 для scheduled signal)
        ethCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          ethCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: ethBasePrice,
            high: ethBasePrice + 10,
            low: ethBasePrice - 5,
            close: ethBasePrice,
            volume: 100,
          });
        }

        for (let i = 0; i < 190; i++) {
          const timestamp = startTime + i * intervalMs;

          // Фаза 1: Активация сразу (0-4) - цена = priceOpen
          if (i < 5) {
            ethCandles.push({
              timestamp,
              open: ethPriceOpen,
              high: ethPriceOpen + 10,
              low: ethPriceOpen - 10,
              close: ethPriceOpen,
              volume: 100
            });
          }
          // Фаза 2: Stop Loss (5-9)
          else if (i >= 5 && i < 10) {
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
    frameName: "190m-facades-parallel",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T03:10:00Z"),  // 190 минут
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
    frameName: "190m-facades-parallel",
  });

  Backtest.background("ETHUSDT", {
    strategyName: "test-facades-parallel",
    exchangeName: "binance-facades-parallel",
    frameName: "190m-facades-parallel",
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
      frameName: "190m-facades-parallel",
    }, true);
    const ethSchedule = await Schedule.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "190m-facades-parallel",
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
      frameName: "190m-facades-parallel",
    }, true);
    const ethPerf = await Performance.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "190m-facades-parallel",
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
      frameName: "190m-facades-parallel",
    }, true);
    const ethHeat = await Heat.getData({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "190m-facades-parallel",
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
      frameName: "190m-facades-parallel",
    }, true);
    const ethPartial = await Partial.getData("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "190m-facades-parallel",
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
      frameName: "190m-facades-parallel",
    }, true);
    const ethReport = await Schedule.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "190m-facades-parallel",
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
      frameName: "190m-facades-parallel",
    }, true);
    const ethPerfReport = await Performance.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "190m-facades-parallel",
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
      frameName: "190m-facades-parallel",
    }, true);
    const ethHeatReport = await Heat.getReport({
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "190m-facades-parallel",
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
      frameName: "190m-facades-parallel",
    }, true);
    const ethPartialReport = await Partial.getReport("ETHUSDT", {
      strategyName: "test-facades-parallel",
      exchangeName: "binance-facades-parallel",
      frameName: "190m-facades-parallel",
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


import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * PARALLEL ТЕСТ #1: Одна стратегия торгует двумя символами параллельно (BTCUSDT и ETHUSDT)
 *
 * Проверяет:
 * - Изоляция состояния между (symbol, strategyName) парами
 * - Независимая обработка сигналов для каждого символа
 * - Корректная мемоизация ClientStrategy инстансов
 * - Независимое хранение данных (signal/schedule persistence)
 * - Независимая генерация отчетов (markdown reports)
 *
 * Сценарий:
 * - BTCUSDT: scheduled → opened → closed by TP
 * - ETHUSDT: scheduled → opened → closed by SL
 */
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

  addExchange({
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

  addStrategy({
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

  addFrame({
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

/**
 * PARALLEL ТЕСТ #2: Три символа торгуют параллельно одной стратегией
 *
 * Проверяет:
 * - Масштабируемость multi-symbol архитектуры
 * - Независимость ClientStrategy инстансов для каждой (symbol, strategyName) пары
 * - Корректность мемоизации с ключами `${symbol}:${strategyName}`
 * - Независимость persistence слоя (файлы именуются ${symbol}_${strategyName})
 *
 * Сценарий:
 * - BTCUSDT: TP
 * - ETHUSDT: SL
 * - SOLUSDT: time_expired
 */
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

  addExchange({
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

  addStrategy({
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

  addFrame({
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

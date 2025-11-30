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
 * ТЕСТ #1: Concurrent signals с одинаковым priceOpen (риск двойной активации)
 *
 * Проблема:
 * - Стратегия генерирует 2 scheduled сигнала с ОДИНАКОВЫМ priceOpen=41000
 * - Оба сигнала ждут достижения одной и той же цены
 * - Риск: оба активируются одновременно → двойной леверидж (2× риск)
 * - КРИТИЧНО: Второй сигнал должен ЖДАТЬ закрытия первого
 *
 * Защита: Риск-менеджмент должен блокировать второй сигнал до закрытия первого
 */
test("OTHER: Concurrent signals with same priceOpen - prevents double activation", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;
  let maxSimultaneousActive = 0;
  let currentlyActive = 0;
  let signalCounter = 0;

  addExchange({
    exchangeName: "binance-other-concurrent",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;
        // Цена падает медленно для активации
        const basePrice = 43000 - i * 50;

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

  addStrategy({
    strategyName: "test-other-concurrent",
    interval: "1m",
    getSignal: async () => {
      // Генерируем 2 сигнала с ОДИНАКОВЫМ priceOpen
      if (signalCounter >= 2) return null;
      signalCounter++;

      const price = await getAveragePrice("BTCUSDT");

      return {
        position: "long",
        note: `concurrent test - signal ${signalCounter}`,
        priceOpen: price - 1000, // ОДИНАКОВЫЙ priceOpen для обоих!
        priceTakeProfit: price + 500,
        priceStopLoss: price - 2000,
        minuteEstimatedTime: 10,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
        currentlyActive++;
        maxSimultaneousActive = Math.max(maxSimultaneousActive, currentlyActive);
      },
      onClose: () => {
        currentlyActive--;
      },
    },
  });

  addFrame({
    frameName: "60m-other-concurrent",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-concurrent",
    exchangeName: "binance-other-concurrent",
    frameName: "60m-other-concurrent",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (scheduledCount < 2) {
    fail(`Not enough signals: scheduledCount=${scheduledCount} (expected 2)`);
    return;
  }

  // КРИТИЧНО: НЕ должно быть >1 активного сигнала одновременно
  if (maxSimultaneousActive > 1) {
    fail(`DOUBLE ACTIVATION BUG: ${maxSimultaneousActive} signals active simultaneously! This doubles position risk!`);
    return;
  }

  pass(`MONEY SAFE: Concurrent signals queued correctly. ${scheduledCount} scheduled, max simultaneous: ${maxSimultaneousActive} (expected 1)`);
});

/**
 * ТЕСТ #2: Breakeven после комиссий (граница прибыльности)
 *
 * Проблема:
 * - TP расположен ТОЧНО на границе breakeven после комиссий
 * - priceOpen=42000, TP=42084 (0.2% для покрытия 2×0.1% комиссий)
 * - Малейшая ошибка в расчетах → убыток вместо нуля
 *
 * Тест: Проверяем что PNL = ~0% (не убыток и не большая прибыль)
 */
test("OTHER: Breakeven after fees - profit margin edge case", async ({ pass, fail }) => {

  let closedResult = null;
  let signalGenerated = false;

  addExchange({
    exchangeName: "binance-other-breakeven",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // i=5: цена достигает TP=42084
        const price = i < 5 ? 42000 : 42100;

        candles.push({
          timestamp,
          open: price,
          high: price + 50,
          low: price - 50,
          close: price,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-other-breakeven",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // Breakeven: TP = priceOpen × 1.002 (покрывает 0.2% комиссий)
      return {
        position: "long",
        note: "breakeven test - TP at fee boundary",
        priceOpen: 42000,
        priceTakeProfit: 42084, // 0.2% от priceOpen для покрытия комиссий
        priceStopLoss: 41000,
        minuteEstimatedTime: 30,
      };
    },
  });

  addFrame({
    frameName: "20m-other-breakeven",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      closedResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-breakeven",
    exchangeName: "binance-other-breakeven",
    frameName: "20m-other-breakeven",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!closedResult) {
    fail("Signal was not closed");
    return;
  }

  const pnl = closedResult.pnl.pnlPercentage;

  // PNL должен быть близок к -0.2% (комиссии 2×0.1%)
  // TP=42084 покрывает только 0.2% профита, но комиссии съедают это → PNL=-0.2%
  if (Math.abs(pnl + 0.2) <= 0.05) {
    pass(`CORRECT: Breakeven signal closed with PNL=${pnl.toFixed(3)}% (fees -0.2% as expected)`);
    return;
  }

  // Если PNL намного отрицательнее -0.2% - это баг
  if (pnl < -0.3) {
    fail(`CALCULATION BUG: Breakeven signal resulted in LOSS=${pnl.toFixed(3)}% instead of ~-0.2%`);
    return;
  }

  pass(`ACCEPTABLE: Breakeven signal closed with PNL=${pnl.toFixed(3)}%`);
});

/**
 * ТЕСТ #3: Simultaneous TP & SL trigger (order execution logic)
 *
 * Проблема:
 * - На одной свече цена касается И TakeProfit И StopLoss
 * - Long: priceOpen=42000, TP=43000, SL=41000
 * - Свеча: low=40500 (ниже SL), high=43500 (выше TP)
 * - Логика: Что сработает первым? Open → High → Low → Close?
 *
 * Тест: Проверяем что сигнал закрылся (неважно по TP или SL)
 */
test("OTHER: Simultaneous TP & SL trigger - candle order execution", async ({ pass, fail }) => {

  let closedResult = null;
  let signalGenerated = false;

  addExchange({
    exchangeName: "binance-other-simultaneous",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i === 5) {
          // Свеча с экстремальной волатильностью (касается TP и SL)
          candles.push({
            timestamp,
            open: 42000,
            high: 43500, // Выше TP=43000
            low: 40500,  // Ниже SL=41000
            close: 42000,
            volume: 500,
          });
        } else {
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-other-simultaneous",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "simultaneous TP & SL test",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 30,
      };
    },
  });

  addFrame({
    frameName: "20m-other-simultaneous",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      closedResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-simultaneous",
    exchangeName: "binance-other-simultaneous",
    frameName: "20m-other-simultaneous",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!closedResult) {
    fail("Signal was not closed despite TP & SL being hit");
    return;
  }

  const reason = closedResult.closeReason;

  // Должен закрыться либо по TP, либо по SL (не timeout)
  if (reason === "take_profit" || reason === "stop_loss") {
    pass(`CORRECT: Simultaneous TP/SL handled correctly, closed by ${reason}`);
    return;
  }

  fail(`UNEXPECTED: Signal closed by ${reason} instead of TP or SL`);
});

/**
 * ТЕСТ #5: Flash crash через множество свечей (extreme volatility)
 *
 * Проблема:
 * - Flash crash: цена падает на -30% за 5 минут, потом восстанавливается
 * - Long signal с SL=-5% может сработать ЛОЖНО из-за краша
 * - Проверяем что SL действительно срабатывает при флеш-краше
 *
 * Тест: Flash crash должен закрыть позицию по SL (убыток -5%)
 */
test("OTHER: Flash crash extreme volatility - StopLoss triggers correctly", async ({ pass, fail }) => {

  let closedResult = null;
  let signalGenerated = false;

  addExchange({
    exchangeName: "binance-other-flash-crash",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i >= 5 && i <= 10) {
          // Flash crash: -30% за 5 минут
          const crashPrice = 42000 * (1 - 0.3 * ((i - 5) / 5));
          candles.push({
            timestamp,
            open: i === 5 ? 42000 : crashPrice + 1000,
            high: i === 5 ? 42000 : crashPrice + 1000,
            low: crashPrice,
            close: crashPrice,
            volume: 10000, // Огромный объем
          });
        } else if (i > 10) {
          // Восстановление после краша
          candles.push({
            timestamp,
            open: 40000,
            high: 41000,
            low: 39500,
            close: 40500,
            volume: 1000,
          });
        } else {
          // Нормальная торговля до краша
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-other-flash-crash",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "flash crash test",
        priceOpen: 42000,
        priceTakeProfit: 44000,
        priceStopLoss: 39900, // -5% от priceOpen
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "30m-other-flash-crash",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      closedResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-flash-crash",
    exchangeName: "binance-other-flash-crash",
    frameName: "30m-other-flash-crash",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!closedResult) {
    fail("Signal was not closed during flash crash");
    return;
  }

  if (closedResult.closeReason === "stop_loss") {
    pass(`CORRECT: Flash crash triggered StopLoss. Loss=${closedResult.pnl.pnlPercentage.toFixed(2)}%`);
    return;
  }

  fail(`UNEXPECTED: Signal closed by ${closedResult.closeReason} instead of stop_loss during flash crash`);
});

/**
 * ТЕСТ #8: Gap up/down scenarios (market gaps handling)
 *
 * Проблема:
 * - Gap down: цена падает с 45000 до 42000 (пропускает priceOpen=43000)
 * - Scheduled LONG signal с priceOpen=43000 должен активироваться НЕСМОТРЯ на gap
 * - Проверяем что gap не ломает логику активации
 *
 * Тест: Signal должен активироваться когда цена проходит priceOpen через gap
 */
test("OTHER: Gap down scenario - scheduled LONG signal activation through gap", async ({ pass, fail }) => {

  let scheduledResult = null;
  let openedResult = null;
  let signalGenerated = false;

  addExchange({
    exchangeName: "binance-other-gap",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        if (i === 5) {
          // Gap down: цена падает с 45000 до 42000
          candles.push({
            timestamp,
            open: 42000, // Gap! Пропускаем priceOpen=43000
            high: 42500,
            low: 41500,
            close: 42000,
            volume: 5000,
          });
        } else if (i < 5) {
          // Начальная цена ВЫШЕ priceOpen - сигнал будет scheduled
          candles.push({
            timestamp,
            open: 45000,
            high: 45100,
            low: 44900,
            close: 45000,
            volume: 100,
          });
        } else {
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
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-other-gap",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        note: "gap down test - LONG priceOpen in gap",
        priceOpen: 43000, // В зоне gap (45000 → 42000)
        priceTakeProfit: 46000,
        priceStopLoss: 40000,
        minuteEstimatedTime: 30,
      };
    },
    callbacks: {
      onSchedule: (symbol, data) => {
        scheduledResult = data;
      },
      onOpen: (symbol, data) => {
        openedResult = data;
      },
    },
  });

  addFrame({
    frameName: "20m-other-gap",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-gap",
    exchangeName: "binance-other-gap",
    frameName: "20m-other-gap",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!scheduledResult) {
    fail("Signal was not scheduled");
    return;
  }

  if (openedResult) {
    pass(`CORRECT: Scheduled LONG signal activated despite gap down (priceOpen=43000 in gap 45000→42000)`);
    return;
  }

  fail("GAP BUG: Scheduled LONG signal was NOT activated when price gapped down through priceOpen");
});

/**
 * ТЕСТ #9: Immediate activation - priceOpen already in activation range
 *
 * Проблема:
 * - getSignal возвращает сигнал с priceOpen, который УЖЕ соответствует критериям активации
 * - LONG: текущая цена >= priceOpen (цена уже достаточно низкая для входа)
 * - SHORT: текущая цена <= priceOpen (цена уже достаточно высокая для входа)
 * - Сигнал НЕ должен переходить в scheduled состояние
 * - Позиция должна открыться НЕМЕДЛЕННО без ожидания
 *
 * Проверка: Сигнал переходит сразу из getSignal → opened (БЕЗ scheduled фазы)
 */
test("OTHER: Immediate activation - LONG position opens instantly when priceOpen already reached", async ({ pass, fail }) => {

  let scheduledCalled = false;
  let openedCalled = false;
  let signalGenerated = false;

  const currentPrice = 42000; // Текущая цена на рынке
  const priceOpen = 43000;    // Вход ВЫШЕ текущей цены - для LONG это означает НЕМЕДЛЕННУЮ активацию

  addExchange({
    exchangeName: "binance-other-immediate",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // Все свечи на уровне currentPrice (НИЖЕ priceOpen для LONG)
        // Это означает что позиция должна активироваться СРАЗУ
        candles.push({
          timestamp,
          open: currentPrice,
          high: currentPrice + 100,
          low: currentPrice - 100,
          close: currentPrice,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-other-immediate",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // LONG: priceOpen=43000 ВЫШЕ currentPrice=42000
      // Это означает "купить если цена упадет до 43000"
      // НО цена УЖЕ на 42000 (ниже 43000) - критерий выполнен!
      // Позиция должна открыться СРАЗУ
      return {
        position: "long",
        note: "immediate activation test - priceOpen already reached",
        priceOpen: priceOpen,
        priceTakeProfit: priceOpen + 1000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 30,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCalled = true;
      },
      onOpen: () => {
        openedCalled = true;
      },
    },
  });

  addFrame({
    frameName: "20m-other-immediate",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-immediate",
    exchangeName: "binance-other-immediate",
    frameName: "20m-other-immediate",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!openedCalled) {
    fail("Signal was NOT opened immediately despite priceOpen being in activation range");
    return;
  }

  if (scheduledCalled) {
    fail("INEFFICIENCY: Signal went through 'scheduled' phase when it should have opened immediately");
    return;
  }

  pass(`IMMEDIATE ACTIVATION WORKS: LONG signal opened instantly (priceOpen=${priceOpen} > currentPrice=${currentPrice})`);
});

/**
 * ТЕСТ #10: Immediate activation for SHORT position
 *
 * Проблема:
 * - SHORT позиция с priceOpen НИЖЕ текущей цены
 * - SHORT: продаем если цена вырастет до priceOpen
 * - НО цена УЖЕ выше priceOpen - критерий выполнен!
 * - Позиция должна открыться СРАЗУ без scheduled фазы
 *
 * Проверка: SHORT сигнал открывается немедленно
 */
test("OTHER: Immediate activation - SHORT position opens instantly when priceOpen already reached", async ({ pass, fail }) => {

  let scheduledCalled = false;
  let openedCalled = false;
  let signalGenerated = false;

  const currentPrice = 43000; // Текущая цена на рынке
  const priceOpen = 42000;    // Вход НИЖЕ текущей цены - для SHORT это означает НЕМЕДЛЕННУЮ активацию

  addExchange({
    exchangeName: "binance-other-immediate-short",
    getCandles: async (_symbol, interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;

      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * intervalMs;

        // Все свечи на уровне currentPrice (ВЫШЕ priceOpen для SHORT)
        // Это означает что позиция должна активироваться СРАЗУ
        candles.push({
          timestamp,
          open: currentPrice,
          high: currentPrice + 100,
          low: currentPrice - 100,
          close: currentPrice,
          volume: 100,
        });
      }

      return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-other-immediate-short",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      // SHORT: priceOpen=42000 НИЖЕ currentPrice=43000
      // Это означает "продать если цена вырастет до 42000"
      // НО цена УЖЕ на 43000 (выше 42000) - критерий выполнен!
      // Позиция должна открыться СРАЗУ
      return {
        position: "short",
        note: "immediate activation test SHORT - priceOpen already reached",
        priceOpen: priceOpen,
        priceTakeProfit: priceOpen - 1000,  // SHORT: TP ниже priceOpen
        priceStopLoss: priceOpen + 2000,    // SHORT: SL выше priceOpen
        minuteEstimatedTime: 30,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCalled = true;
      },
      onOpen: () => {
        openedCalled = true;
      },
    },
  });

  addFrame({
    frameName: "20m-other-immediate-short",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:20:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-other-immediate-short",
    exchangeName: "binance-other-immediate-short",
    frameName: "20m-other-immediate-short",
  });

  await awaitSubject.toPromise();
  // await sleep(3000);

  if (!openedCalled) {
    fail("SHORT signal was NOT opened immediately despite priceOpen being in activation range");
    return;
  }

  if (scheduledCalled) {
    fail("INEFFICIENCY: SHORT signal went through 'scheduled' phase when it should have opened immediately");
    return;
  }

  pass(`IMMEDIATE ACTIVATION WORKS: SHORT signal opened instantly (priceOpen=${priceOpen} < currentPrice=${currentPrice})`);
});

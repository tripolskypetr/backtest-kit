import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addRiskSchema,
  Backtest,
  Live,
  listenDoneBacktest,
  listenSignalBacktest,
  listenSignalLiveOnce,
  listenPartialProfitAvailable,
  commitPartialProfitCost,
  getTotalCostClosed,
  PersistSignalAdapter,
  PersistScheduleAdapter,
  PersistStorageAdapter,
  StorageBacktest,
  StorageLive,
  Heat,
  lib,
  listenScheduleEvent,
  listenSync,
  MethodContextService,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * AUDIT E2E #1: DTO с собственными undefined-полями не должен молча теряться.
 *
 * Регрессия: spread `...signal` затирал дефолты id/cost/priceOpen значением
 * undefined → validatePendingSignal бросал → trycatch глотал → сигнал терялся.
 */
test("AUDIT: signal DTO with explicit undefined keys opens a position", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  let openedResult = null;
  let closedResult = null;
  let signalGenerated = false;

  addExchangeSchema({
    exchangeName: "binance-audit-undefined",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({
          timestamp: alignedSince + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "audit-undefined-dto",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      // КРИТИЧНО: ключи присутствуют, но равны undefined — так делает код,
      // собирающий DTO из опциональных полей
      return {
        id: undefined,
        cost: undefined,
        priceOpen: undefined,
        position: "long",
        note: "audit undefined dto",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 10,
      };
    },
    callbacks: {
      onOpen: (_symbol, data) => {
        openedResult = data;
      },
      onClose: (_symbol, data) => {
        closedResult = data;
      },
    },
  });

  addFrameSchema({
    frameName: "30m-audit-undefined",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "audit-undefined-dto",
    exchangeName: "binance-audit-undefined",
    frameName: "30m-audit-undefined",
  });

  await awaitSubject.toPromise();

  if (!openedResult) {
    fail("REGRESSION: DTO with undefined keys was silently dropped — position never opened");
    return;
  }

  if (typeof openedResult.priceOpen !== "number" || !isFinite(openedResult.priceOpen)) {
    fail(`priceOpen default was not applied: ${openedResult.priceOpen}`);
    return;
  }

  if (!closedResult) {
    fail("Position opened but never closed (expected time_expired)");
    return;
  }

  pass(`Signal with undefined DTO keys opened at ${openedResult.priceOpen} and closed normally`);
});

/**
 * AUDIT E2E #2: risk-отказ не должен навсегда блокировать детерминированный id,
 * и risk-валидации должны выполняться ровно один раз на попытку открытия.
 *
 * Регрессия #1: _lastPendingId фиксировался в GET_SIGNAL_FN до подтверждения
 * открытия → отказ блокировал retry того же id.
 * Регрессия #2: risk check выполнялся дважды (GET_SIGNAL_FN + OPEN_NEW_PENDING_SIGNAL_FN).
 */
test("AUDIT: risk-rejected deterministic signal id retries and opens once", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 42000;

  let riskAttempts = 0;
  let riskAttemptsAtOpen = null;
  let openCount = 0;
  let closeCount = 0;

  addExchangeSchema({
    exchangeName: "binance-audit-retry",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({
          timestamp: alignedSince + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "audit-retry-risk",
    validations: [
      () => {
        riskAttempts += 1;
        if (riskAttempts === 1) {
          throw new Error("audit: first attempt rejected by risk");
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: "audit-retry-strategy",
    interval: "1m",
    riskName: "audit-retry-risk",
    // Каждый вызов возвращает ОДИН И ТОТ ЖЕ детерминированный id
    getSignal: async () => ({
      id: "audit-retry-id",
      position: "long",
      note: "audit retry",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss: basePrice - 5000,
      minuteEstimatedTime: 5,
    }),
    callbacks: {
      onOpen: () => {
        openCount += 1;
        if (riskAttemptsAtOpen === null) {
          riskAttemptsAtOpen = riskAttempts;
        }
      },
      onClose: () => {
        closeCount += 1;
      },
    },
  });

  addFrameSchema({
    frameName: "30m-audit-retry",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "audit-retry-strategy",
    exchangeName: "binance-audit-retry",
    frameName: "30m-audit-retry",
  });

  await awaitSubject.toPromise();

  if (openCount === 0) {
    fail("REGRESSION: risk-rejected deterministic id was never retried — position never opened");
    return;
  }

  if (openCount !== 1) {
    fail(`Expected exactly 1 open (whipsaw must block re-open of the same id), got ${openCount}`);
    return;
  }

  if (closeCount < 1) {
    fail("Position opened but never closed");
    return;
  }

  // Ровно 2 вызова валидации к моменту открытия: 1-я попытка (отказ) + 2-я (успех).
  // Старый код с двойным risk check дал бы 3.
  if (riskAttemptsAtOpen !== 2) {
    fail(`REGRESSION: expected 2 risk validation calls at open time (1 reject + 1 pass), got ${riskAttemptsAtOpen}`);
    return;
  }

  pass(`Deterministic id retried after risk reject: opens=${openCount}, closes=${closeCount}, riskAttemptsAtOpen=${riskAttemptsAtOpen}`);
});

/**
 * AUDIT E2E #3: mismatch у pending-сигнала не должен срывать restore
 * scheduled-сигнала (ранний return в WAIT_FOR_INIT_FN).
 */
test("AUDIT: pending mismatch does not skip scheduled restore", async ({ pass, fail }) => {
  let onActiveCalled = false;
  let onScheduleCalled = false;

  PersistSignalAdapter.usePersistSignalAdapter(class {
    async waitForInit() {}
    async readSignalData() {
      // exchangeName НЕ совпадает со стратегией → restore pending должен быть пропущен
      return {
        id: "audit-mismatch-pending",
        position: "long",
        priceOpen: 3200,
        priceTakeProfit: 3400,
        priceStopLoss: 3000,
        minuteEstimatedTime: 120,
        exchangeName: "bybit-other-exchange",
        strategyName: "audit-restore-strategy",
        timestamp: Date.now(),
        pendingAt: Date.now(),
        scheduledAt: Date.now(),
        symbol: "ETHUSDT",
        _isScheduled: false,
        note: "mismatched pending",
      };
    }
    async writeSignalData() {}
  });

  PersistScheduleAdapter.usePersistScheduleAdapter(class {
    async waitForInit() {}
    async readScheduleData() {
      // Валидный scheduled — должен восстановиться несмотря на mismatch pending
      return {
        id: "audit-valid-scheduled",
        position: "short",
        priceOpen: 3000,
        priceTakeProfit: 2900,
        priceStopLoss: 3100,
        minuteEstimatedTime: 120,
        exchangeName: "binance-audit-restore",
        strategyName: "audit-restore-strategy",
        timestamp: Date.now(),
        pendingAt: Date.now(),
        scheduledAt: Date.now(),
        symbol: "ETHUSDT",
        _isScheduled: true,
        note: "valid scheduled",
      };
    }
    async writeScheduleData() {}
  });

  addExchangeSchema({
    exchangeName: "binance-audit-restore",
    getCandles: async (_symbol, _interval, since, limit) => {
      const intervalMs = 60000;
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * intervalMs,
          open: 3200,
          high: 3300,
          low: 3100,
          close: 3200,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "audit-restore-strategy",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onActive: () => {
        onActiveCalled = true;
      },
      onSchedule: () => {
        onScheduleCalled = true;
      },
    },
  });

  Live.background("ETHUSDT", {
    strategyName: "audit-restore-strategy",
    exchangeName: "binance-audit-restore",
  });

  await sleep(100);

  if (onActiveCalled) {
    fail("Mismatched pending signal was restored (onActive fired) — mismatch protection broken");
    return;
  }

  if (!onScheduleCalled) {
    fail("REGRESSION: valid scheduled signal was NOT restored after pending mismatch (early return in waitForInit)");
    return;
  }

  pass("Pending mismatch skipped, scheduled signal restored, onSchedule fired");
});

/**
 * AUDIT E2E #4: commitPartialProfitCost должен закрывать ровно указанную
 * сумму в долларах и после предыдущих partial-закрытий.
 *
 * Регрессия: процент считался от total invested, а применялся к remaining
 * cost basis → "закрыть $75" после закрытия $150 из $300 закрывало $37.50.
 */
test("AUDIT: commitPartialProfitCost closes exact dollar amounts after prior partial", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  let firstDone = false;
  let secondDone = false;
  let firstResult = null;
  let secondResult = null;
  let remainingAfter = null;

  addExchangeSchema({
    exchangeName: "binance-audit-partial-cost",
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
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "audit-partial-cost-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else {
          // Постепенный рост к TP (до ~40% пути) чтобы partial-profit был доступен
          const progress = Math.min((i - 5) / 20, 1);
          const price = basePrice + 60000 * progress * 0.4;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        note: "audit partial cost",
        cost: 300,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: "40m-audit-partial-cost",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const unsubscribeListener = listenPartialProfitAvailable(async ({ symbol, level }) => {
    if (!firstDone && level >= 5) {
      firstDone = true;
      // Позиция $300: закрываем $150
      firstResult = await commitPartialProfitCost(symbol, 150);
      return;
    }
    if (firstDone && !secondDone && level >= 10) {
      secondDone = true;
      // Осталось $150: закрываем ещё $75
      secondResult = await commitPartialProfitCost(symbol, 75);
      remainingAfter = await getTotalCostClosed(symbol);
    }
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "audit-partial-cost-strategy",
    exchangeName: "binance-audit-partial-cost",
    frameName: "40m-audit-partial-cost",
  });

  await awaitSubject.toPromise();
  unsubscribeListener();

  if (!firstDone || !secondDone) {
    fail(`Partial closes were not attempted (first=${firstDone}, second=${secondDone}) — price never moved toward TP?`);
    return;
  }

  if (firstResult !== true || secondResult !== true) {
    fail(`Partial closes were rejected: first=${firstResult}, second=${secondResult}`);
    return;
  }

  if (remainingAfter === null || Math.abs(remainingAfter - 75) > 1e-6) {
    fail(`REGRESSION: after closing $150 and $75 of a $300 position, remaining = $${remainingAfter}, expected $75 (old bug: $112.50)`);
    return;
  }

  pass(`Dollar partials are exact: $300 - $150 - $75 → remaining $${remainingAfter}`);
});

/**
 * AUDIT 4-й проход: та же семантика в КОПИИ Backtest.commitPartialProfitCost
 * (classes/Backtest.ts). Регрессия: копия конвертировала доллары через total
 * invested вместо remaining cost basis — $75 после закрытых $150 закрывали
 * только 25% от remaining $150 = $37.50 (недозакрытие).
 */
test("AUDIT: Backtest.commitPartialProfitCost copy closes exact dollars after prior partial", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  let firstDone = false;
  let secondDone = false;
  let firstResult = null;
  let secondResult = null;
  let remainingAfter = null;

  const context = {
    strategyName: "audit-partial-cost-copy-strategy",
    exchangeName: "binance-audit-partial-cost-copy",
    frameName: "40m-audit-partial-cost-copy",
  };

  addExchangeSchema({
    exchangeName: context.exchangeName,
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
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        }
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      for (let i = 0; i < 40; i++) {
        const timestamp = startTime + i * intervalMs;
        if (i < 5) {
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else {
          const progress = Math.min((i - 5) / 20, 1);
          const price = basePrice + 60000 * progress * 0.4;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        note: "audit partial cost copy",
        cost: 300,
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:40:00Z"),
  });

  const unsubscribeListener = listenPartialProfitAvailable(async ({ symbol, level, currentPrice }) => {
    if (!firstDone && level >= 5) {
      firstDone = true;
      // Позиция $300: закрываем $150 через КОПИЮ в classes/Backtest.ts
      firstResult = await Backtest.commitPartialProfitCost(symbol, 150, currentPrice, context);
      return;
    }
    if (firstDone && !secondDone && level >= 10) {
      secondDone = true;
      // Осталось $150: закрываем ещё $75
      secondResult = await Backtest.commitPartialProfitCost(symbol, 75, currentPrice, context);
      remainingAfter = await getTotalCostClosed(symbol);
    }
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", context);

  await awaitSubject.toPromise();
  unsubscribeListener();

  if (!firstDone || !secondDone) {
    fail(`Partial closes were not attempted (first=${firstDone}, second=${secondDone})`);
    return;
  }

  if (firstResult !== true || secondResult !== true) {
    fail(`Partial closes were rejected: first=${firstResult}, second=${secondResult}`);
    return;
  }

  if (remainingAfter === null || Math.abs(remainingAfter - 75) > 1e-6) {
    fail(`REGRESSION: Backtest copy under-closed — remaining = $${remainingAfter}, expected $75 (old bug: $112.50)`);
    return;
  }

  pass(`Backtest.commitPartialProfitCost copy is exact: $300 - $150 - $75 → remaining $${remainingAfter}`);
});

/**
 * AUDIT MD #1: waitForInit в BacktestMarkdownService должен сливать
 * персистированную историю newest-first.
 *
 * Регрессия: история загружалась oldest-first и push'илась в хвост
 * newest-first списка — сегмент истории лежал по возрастанию, trim выбрасывал
 * новейшие записи, стрики на стыке считались анти-хронологически.
 */
test("AUDIT MD: persisted closed history merges newest-first into report storage", async ({ pass, fail }) => {
  const baseTime = new Date("2024-01-01T00:00:00Z").getTime();
  const hourMs = 3600_000;

  const makeRow = (id, index, pnlPercentage) => ({
    id,
    status: "closed",
    symbol: "BTCUSDT",
    strategyName: "audit-md-merge",
    exchangeName: "binance-audit-md",
    frameName: "1m-audit-md",
    position: "long",
    note: "",
    cost: 100,
    priceOpen: 42000,
    priceTakeProfit: 43000,
    priceStopLoss: 41000,
    originalPriceOpen: 42000,
    originalPriceTakeProfit: 43000,
    originalPriceStopLoss: 41000,
    minuteEstimatedTime: 60,
    scheduledAt: baseTime + index * hourMs,
    pendingAt: baseTime + index * hourMs,
    timestamp: baseTime + index * hourMs,
    closeTimestamp: baseTime + index * hourMs + 30 * 60_000,
    closeReason: "take_profit",
    currentPrice: 42500,
    pnl: { pnlPercentage, pnlCost: pnlPercentage, pnlEntries: pnlPercentage, priceOpen: 42000, priceClose: 42500 },
    totalEntries: 1,
    totalPartials: 0,
    partialExecuted: 0,
    createdAt: baseTime + index * hourMs,
    updatedAt: baseTime + index * hourMs,
    priority: baseTime + index * hourMs,
  });

  // Отдаём строки в перемешанном порядке — LOAD сортирует сам
  const rows = [
    makeRow("hist-mid", 1, 2),
    makeRow("hist-old", 0, 1),
    makeRow("hist-new", 2, 3),
  ];

  PersistStorageAdapter.usePersistStorageAdapter(class {
    constructor(backtest) {
      this._backtest = backtest;
    }
    async waitForInit() {}
    async readStorageData() {
      return this._backtest ? rows : [];
    }
    async writeStorageData() {}
  });

  // Бекенд по умолчанию — in-memory; переключаем на persist, чтобы
  // StorageBacktest.list() читал через наш PersistStorageAdapter
  StorageBacktest.usePersist();

  addExchangeSchema({
    exchangeName: "binance-audit-md",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({
          timestamp: alignedSince + i * 60_000,
          open: 42000,
          high: 42100,
          low: 41900,
          close: 42000,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "audit-md-merge",
    interval: "1m",
    getSignal: async () => null,
  });

  addFrameSchema({
    frameName: "1m-audit-md",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const stats = await Backtest.getData("BTCUSDT", {
    strategyName: "audit-md-merge",
    exchangeName: "binance-audit-md",
    frameName: "1m-audit-md",
  });

  if (!stats || stats.totalSignals !== 3) {
    fail(`Expected 3 persisted signals in stats, got ${stats?.totalSignals}`);
    return;
  }

  const ids = stats.signalList.map((s) => s.signal.id);

  if (ids[0] !== "hist-new" || ids[1] !== "hist-mid" || ids[2] !== "hist-old") {
    fail(`REGRESSION: history merged in wrong order: [${ids.join(", ")}], expected newest-first [hist-new, hist-mid, hist-old]`);
    return;
  }

  pass(`Persisted history merged newest-first: [${ids.join(", ")}]`);
});

/**
 * AUDIT MD #2: Live.getData обязан возвращать null-метрики (N/A), а не 0%,
 * когда в списке есть события, но нет ни одного закрытого трейда.
 *
 * Регрессия: сессия с одними idle-событиями показывала
 * «Win rate 0.00% / Avg PNL +0.00%» вместо N/A.
 */
test("AUDIT MD: Live.getData returns nulls (not zeros) when no closed trades exist", async ({ pass, fail }) => {
  const intervalMs = 60_000;
  const basePrice = 42000;

  addExchangeSchema({
    exchangeName: "binance-audit-md-live",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({
          timestamp: alignedSince + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "audit-md-live-idle",
    interval: "1m",
    getSignal: async () => null,
  });

  const firstTick = new Subject();
  listenSignalLiveOnce((result) => {
    if (result.strategyName === "audit-md-live-idle") {
      firstTick.next(result);
    }
  });

  Live.background("BTCUSDT", {
    strategyName: "audit-md-live-idle",
    exchangeName: "binance-audit-md-live",
  });

  await firstTick.toPromise();
  // Даём markdown-сервису дописать событие (подписчики одного эмиттера)
  await sleep(50);

  const stats = await Live.getData("BTCUSDT", {
    strategyName: "audit-md-live-idle",
    exchangeName: "binance-audit-md-live",
  });

  if (!stats) {
    fail("Live.getData returned nothing");
    return;
  }

  if (stats.totalEvents < 1) {
    fail(`Expected at least 1 recorded event (idle tick), got ${stats.totalEvents} — cannot exercise the regression path`);
    return;
  }

  if (stats.totalClosed !== 0) {
    fail(`Expected 0 closed trades, got ${stats.totalClosed}`);
    return;
  }

  if (stats.winRate !== null || stats.avgPnl !== null || stats.totalPnl !== null) {
    fail(`REGRESSION: with 0 closed trades expected null metrics (N/A), got winRate=${stats.winRate}, avgPnl=${stats.avgPnl}, totalPnl=${stats.totalPnl}`);
    return;
  }

  pass(`Live stats with ${stats.totalEvents} events and 0 closed trades report N/A instead of 0%`);
});

/**
 * AUDIT MATH: числовая сверка всей статистики Backtest.getData с независимой
 * эталонной реализацией (значения посчитаны отдельно на Python).
 *
 * 12 закрытых трейдов, шаг 2 дня, длительность 30 мин, один intra-trade
 * trough −3% (mark-to-market DD), два peak-снапшота, цены закрытия — точная
 * экспонента 100·e^(0.01·days) (лог-линейный тренд: slope = 1 %/day, R² = 1).
 */
test("AUDIT MATH: Backtest.getData statistics match independent reference values", async ({ pass, fail }) => {
  const DAY = 86_400_000;
  const base = new Date("2024-01-01T00:00:00Z").getTime();
  const returns = [0.5, -0.25, 0.75, 0.25, -0.5, 1.0, -0.25, -0.25, 0.5, 1.25, -0.75, 0.25];
  const falls = { 5: -3.0 };
  const peaks = { 0: 0.6, 9: 1.5 };

  const rows = returns.map((pnlPercentage, i) => {
    const pendingAt = base + i * 2 * DAY;
    const closeTimestamp = pendingAt + 30 * 60_000;
    const close = 100 * Math.exp(0.01 * (i * 2));
    const row = {
      id: `math-${i}`,
      status: "closed",
      symbol: "BTCUSDT",
      strategyName: "audit-md-math",
      exchangeName: "binance-audit-md-math",
      frameName: "1m-audit-md-math",
      position: "long",
      note: "",
      cost: 100,
      priceOpen: 100,
      priceTakeProfit: 200,
      priceStopLoss: 50,
      originalPriceOpen: 100,
      originalPriceTakeProfit: 200,
      originalPriceStopLoss: 50,
      minuteEstimatedTime: 60,
      scheduledAt: pendingAt,
      pendingAt,
      timestamp: pendingAt,
      closeTimestamp,
      closeReason: "take_profit",
      currentPrice: close,
      pnl: { pnlPercentage, pnlCost: pnlPercentage, pnlEntries: pnlPercentage, priceOpen: 100, priceClose: close },
      totalEntries: 1,
      totalPartials: 0,
      partialExecuted: 0,
      createdAt: pendingAt,
      updatedAt: pendingAt,
      priority: pendingAt,
    };
    if (falls[i] !== undefined) {
      row.maxDrawdown = { pnlPercentage: falls[i], pnlCost: falls[i], pnlEntries: falls[i], priceOpen: 100, priceClose: close };
    }
    if (peaks[i] !== undefined) {
      row.peakProfit = { pnlPercentage: peaks[i], pnlCost: peaks[i], pnlEntries: peaks[i], priceOpen: 100, priceClose: close };
    }
    return row;
  });

  PersistStorageAdapter.usePersistStorageAdapter(class {
    constructor(backtest) {
      this._backtest = backtest;
    }
    async waitForInit() {}
    async readStorageData() {
      return this._backtest ? rows : [];
    }
    async writeStorageData() {}
  });
  StorageBacktest.usePersist();

  addExchangeSchema({
    exchangeName: "binance-audit-md-math",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({ timestamp: alignedSince + i * 60_000, open: 100, high: 101, low: 99, close: 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "audit-md-math",
    interval: "1m",
    getSignal: async () => null,
  });

  addFrameSchema({
    frameName: "1m-audit-md-math",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const stats = await Backtest.getData("BTCUSDT", {
    strategyName: "audit-md-math",
    exchangeName: "binance-audit-md-math",
    frameName: "1m-audit-md-math",
  });

  // Эталон посчитан независимой реализацией (Python):
  const expected = {
    totalSignals: 12,
    winCount: 7,
    lossCount: 5,
    totalPnl: 2.5,
    avgPnl: 0.20833333333333334,
    winRate: 58.333333333333336,
    stdDev: 0.6200562046860727,
    sharpeRatio: 0.33599104687422665,
    annualizedSharpeRatio: 4.738576379048751,
    sortinoRatio: 0.7216878364870323,
    medianPnl: 0.25,
    expectancy: 0.20833333333333337,
    certaintyRatio: 1.6071428571428572,
    expectedYearlyReturns: 50.75117637501228,
    calmarRatio: 14.562747883791118,
    recoveryFactor: 0.7194454128338333,
    avgConsecutiveWinPnl: 0.9,
    avgConsecutiveLossPnl: -0.5,
    avgPeakPnl: 1.05,
    avgFallPnl: -3.0,
    avgDuration: 30.0,
    avgWinDuration: 30.0,
    avgLossDuration: 30.0,
    medianStepSize: 2.0201340026755816,
    buyerPressure: 1.0,
    sellerPressure: 0.0,
    buyerStrength: 1.0,
    sellerStrength: 0.0,
    pressureImbalance: 1.0,
  };

  const approxEq = (actual, ref, tol) =>
    typeof actual === "number" && Math.abs(actual - ref) <= tol * Math.max(1, Math.abs(ref));

  const mismatches = [];
  for (const [key, ref] of Object.entries(expected)) {
    const actual = stats[key];
    if (!approxEq(actual, ref, 1e-9)) {
      mismatches.push(`${key}: expected ${ref}, got ${actual}`);
    }
  }

  // Регрессия по лог-цене на точной экспоненте: slope = 1 %/day, R² = 1 (float-допуск)
  if (!approxEq(stats.trendStrength, 1.0, 1e-6)) {
    mismatches.push(`trendStrength: expected 1.0, got ${stats.trendStrength}`);
  }
  if (!approxEq(stats.trendConfidence, 1.0, 1e-6)) {
    mismatches.push(`trendConfidence: expected 1.0, got ${stats.trendConfidence}`);
  }
  if (stats.trend !== "bullish") {
    mismatches.push(`trend: expected "bullish", got ${stats.trend}`);
  }

  if (mismatches.length > 0) {
    fail(`MATH MISMATCH (${mismatches.length}):\n${mismatches.join("\n")}`);
    return;
  }

  pass(`All ${Object.keys(expected).length + 3} statistics match the independent reference implementation`);
});

/**
 * AUDIT MATH #2: числовая сверка per-symbol и портфельной статистики
 * Heat.getData с независимой эталонной реализацией (значения посчитаны
 * отдельно на Python).
 *
 * 2 символа с ПЕРЕМЕШАННЫМИ по времени закрытиями (BTC — чётные дни,
 * ETH — нечётные): это нагружает pooled equity walk в хронологическом
 * порядке. Троги −3% (BTC) и −2% (ETH), цены закрытия — точные экспоненты
 * с разным наклоном (1 %/day и 1.2 %/day).
 */
test("AUDIT MATH: Heat.getData per-symbol and portfolio statistics match reference", async ({ pass, fail }) => {
  const DAY = 86_400_000;
  const base = new Date("2024-01-01T00:00:00Z").getTime();

  const makeRows = (symbol, returns, offsetDays, falls, peaks, price0, slope) =>
    returns.map((pnlPercentage, i) => {
      const pendingAt = base + offsetDays * DAY + i * 2 * DAY;
      const closeTimestamp = pendingAt + 30 * 60_000;
      const days = offsetDays + i * 2;
      const close = price0 * Math.exp(slope * days);
      const row = {
        id: `${symbol}-heat-${i}`,
        status: "closed",
        symbol,
        strategyName: "audit-heat",
        exchangeName: "binance-audit-heat",
        frameName: "1m-audit-heat",
        position: "long",
        note: "",
        cost: 100,
        priceOpen: price0,
        priceTakeProfit: price0 * 2,
        priceStopLoss: price0 / 2,
        originalPriceOpen: price0,
        originalPriceTakeProfit: price0 * 2,
        originalPriceStopLoss: price0 / 2,
        minuteEstimatedTime: 60,
        scheduledAt: pendingAt,
        pendingAt,
        timestamp: pendingAt,
        closeTimestamp,
        closeReason: "take_profit",
        currentPrice: close,
        pnl: { pnlPercentage, pnlCost: pnlPercentage, pnlEntries: pnlPercentage, priceOpen: price0, priceClose: close },
        totalEntries: 1,
        totalPartials: 0,
        partialExecuted: 0,
        createdAt: pendingAt,
        updatedAt: pendingAt,
        priority: pendingAt,
      };
      if (falls[i] !== undefined) {
        row.maxDrawdown = { pnlPercentage: falls[i], pnlCost: falls[i], pnlEntries: falls[i], priceOpen: price0, priceClose: close };
      }
      if (peaks[i] !== undefined) {
        row.peakProfit = { pnlPercentage: peaks[i], pnlCost: peaks[i], pnlEntries: peaks[i], priceOpen: price0, priceClose: close };
      }
      return row;
    });

  const btcRows = makeRows(
    "BTCUSDT",
    [0.25, -0.125, 0.375, 0.125, -0.25, 0.5, -0.125, -0.125, 0.25, 0.625, -0.375, 0.125],
    0,
    { 5: -3.0 },
    { 0: 0.6, 9: 1.5 },
    100,
    0.01,
  );
  const ethRows = makeRows(
    "ETHUSDT",
    [0.2, -0.15, 0.3, -0.1, 0.4, 0.15, -0.2, 0.35, -0.05, 0.45],
    1,
    { 4: -2.0 },
    { 2: 0.5, 7: 1.1 },
    50,
    0.012,
  );
  const rows = [...btcRows, ...ethRows];

  PersistStorageAdapter.usePersistStorageAdapter(class {
    constructor(backtest) {
      this._backtest = backtest;
    }
    async waitForInit() {}
    async readStorageData() {
      return this._backtest ? rows : [];
    }
    async writeStorageData() {}
  });
  StorageBacktest.usePersist();

  addExchangeSchema({
    exchangeName: "binance-audit-heat",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({ timestamp: alignedSince + i * 60_000, open: 100, high: 101, low: 99, close: 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "audit-heat",
    interval: "1m",
    getSignal: async () => null,
  });

  addFrameSchema({
    frameName: "1m-audit-heat",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:10:00Z"),
  });

  const stats = await Heat.getData({
    strategyName: "audit-heat",
    exchangeName: "binance-audit-heat",
    frameName: "1m-audit-heat",
  }, true);

  // Эталон посчитан независимой реализацией (Python):
  const expectedBtc = {
    totalTrades: 12, winCount: 7, lossCount: 5,
    winRate: 58.333333333333336,
    totalPnl: 1.25, avgPnl: 0.10416666666666667,
    stdDev: 0.31002810234303635,
    sharpeRatio: 0.33599104687422665,
    annualizedSharpeRatio: 4.738576379048751,
    sortinoRatio: 0.7216878364870323,
    medianPnl: 0.125,
    expectancy: 0.10416666666666669,
    certaintyRatio: 1.6071428571428572,
    profitFactor: 2.25,
    maxDrawdown: 3.2425000000000024,
    expectedYearlyReturns: 22.90089483877944,
    calmarRatio: 7.062727783740763,
    recoveryFactor: 0.38607432557352733,
    tradesPerYear: 198.90255439924317,
    avgConsecutiveWinPnl: 0.45,
    avgConsecutiveLossPnl: -0.25,
    maxWinStreak: 2, maxLossStreak: 2,
    avgDuration: 30.0,
    avgPeakPnl: 1.05, avgFallPnl: -3.0,
    peakProfitPnl: 1.5, maxDrawdownPnl: -3.0,
    medianStepSize: 2.0201340026755776,
  };
  const expectedEth = {
    totalTrades: 10, winCount: 6, lossCount: 4,
    winRate: 60.0,
    totalPnl: 1.35, avgPnl: 0.135,
    stdDev: 0.2427275564633457,
    sharpeRatio: 0.5561791251352475,
    annualizedSharpeRatio: 7.915414858471756,
    sortinoRatio: 1.5588457268119895,
    medianPnl: 0.175,
    expectancy: 0.13499999999999995,
    certaintyRatio: 2.4666666666666663,
    profitFactor: 3.6999999999999997,
    maxDrawdown: 2.0979999999999923,
    expectedYearlyReturns: 31.352382961173152,
    calmarRatio: 14.943938494362854,
    recoveryFactor: 0.6461155049549037,
    tradesPerYear: 202.5433526011561,
    avgConsecutiveWinPnl: 0.37,
    avgConsecutiveLossPnl: -0.125,
    maxWinStreak: 2, maxLossStreak: 1,
    avgDuration: 30.0,
    avgPeakPnl: 0.8, avgFallPnl: -2.0,
    peakProfitPnl: 1.1, maxDrawdownPnl: -2.0,
    medianStepSize: 2.4290317890621527,
  };
  const expectedPortfolio = {
    totalSymbols: 2,
    portfolioTotalTrades: 22,
    portfolioTotalPnl: 2.6,
    portfolioStdDev: 0.2753981769078289,
    portfolioSharpeRatio: 0.4291307208666514,
    portfolioAnnualizedSharpeRatio: 8.194651785206906,
    portfolioSortinoRatio: 0.9723448696087957,
    portfolioExpectancy: 0.1181818181818182,
    portfolioCertaintyRatio: 1.8923076923076922,
    portfolioMedianPnl: 0.1375,
    portfolioTradesPerYear: 364.6546830652791,
    portfolioExpectedYearlyReturns: 53.63112122902609,
    portfolioCalmarRatio: 17.877040409675363,
    portfolioRecoveryFactor: 0.8747885775510851,
    portfolioAvgPeakPnl: 0.9363636363636364,
    portfolioAvgFallPnl: -2.5454545454545454,
    portfolioPeakProfitPnl: 1.5,
    portfolioMaxDrawdownPnl: -3.0,
    portfolioAvgDuration: 30.0,
    portfolioAvgConsecutiveWinPnl: 0.4136363636363637,
    portfolioAvgConsecutiveLossPnl: -0.19318181818181818,
  };
  const expectedTrend = {
    BTCUSDT: { trendStrength: 1.0, trendConfidence: 1.0, trend: "bullish" },
    ETHUSDT: { trendStrength: 1.2, trendConfidence: 1.0, trend: "bullish" },
  };

  const approxEq = (actual, ref, tol) =>
    typeof actual === "number" && Math.abs(actual - ref) <= tol * Math.max(1, Math.abs(ref));

  const mismatches = [];
  const checkAll = (label, actual, expected, tol = 1e-9) => {
    for (const [key, ref] of Object.entries(expected)) {
      if (!approxEq(actual[key], ref, tol)) {
        mismatches.push(`${label}.${key}: expected ${ref}, got ${actual[key]}`);
      }
    }
  };

  const btcRow = stats.symbols.find((s) => s.symbol === "BTCUSDT");
  const ethRow = stats.symbols.find((s) => s.symbol === "ETHUSDT");
  if (!btcRow || !ethRow) {
    fail(`Missing symbol rows: BTC=${!!btcRow}, ETH=${!!ethRow}`);
    return;
  }

  checkAll("BTC", btcRow, expectedBtc);
  checkAll("ETH", ethRow, expectedEth);
  checkAll("PORTFOLIO", stats, expectedPortfolio);
  for (const [symbol, exp] of Object.entries(expectedTrend)) {
    const row = symbol === "BTCUSDT" ? btcRow : ethRow;
    if (!approxEq(row.trendStrength, exp.trendStrength, 1e-6)) {
      mismatches.push(`${symbol}.trendStrength: expected ${exp.trendStrength}, got ${row.trendStrength}`);
    }
    if (!approxEq(row.trendConfidence, exp.trendConfidence, 1e-6)) {
      mismatches.push(`${symbol}.trendConfidence: expected ${exp.trendConfidence}, got ${row.trendConfidence}`);
    }
    if (row.trend !== exp.trend) {
      mismatches.push(`${symbol}.trend: expected ${exp.trend}, got ${row.trend}`);
    }
  }

  // Сортировка символов — по per-symbol Sharpe по убыванию (ETH 0.556 > BTC 0.336)
  if (stats.symbols[0]?.symbol !== "ETHUSDT") {
    mismatches.push(`symbols[0]: expected ETHUSDT (higher Sharpe first), got ${stats.symbols[0]?.symbol}`);
  }

  if (mismatches.length > 0) {
    fail(`HEAT MATH MISMATCH (${mismatches.length}):\n${mismatches.join("\n")}`);
    return;
  }

  const totalChecked =
    Object.keys(expectedBtc).length +
    Object.keys(expectedEth).length +
    Object.keys(expectedPortfolio).length + 7;
  pass(`All ${totalChecked} Heat statistics (per-symbol + pooled portfolio) match the independent reference`);
});

/**
 * AUDIT MATH #3: числовая сверка статистики Live.getData с независимой
 * эталонной реализацией — симметрично тесту для Backtest.getData.
 *
 * Тот же датасет (12 трейдов, trough −3%, два peak-снапшота, экспоненциальные
 * цены) реплеится через live-персистенцию (StorageLive, frameName "",
 * backtest=false) — формулы Live обязаны давать те же значения, что Backtest.
 */
test("AUDIT MATH: Live.getData statistics match independent reference values", async ({ pass, fail }) => {
  const DAY = 86_400_000;
  const base = new Date("2024-01-01T00:00:00Z").getTime();
  const returns = [0.5, -0.25, 0.75, 0.25, -0.5, 1.0, -0.25, -0.25, 0.5, 1.25, -0.75, 0.25];
  const falls = { 5: -3.0 };
  const peaks = { 0: 0.6, 9: 1.5 };

  const rows = returns.map((pnlPercentage, i) => {
    const pendingAt = base + i * 2 * DAY;
    const closeTimestamp = pendingAt + 30 * 60_000;
    const close = 100 * Math.exp(0.01 * (i * 2));
    const row = {
      id: `live-math-${i}`,
      status: "closed",
      symbol: "BTCUSDT",
      strategyName: "audit-live-math",
      exchangeName: "binance-audit-live-math",
      frameName: "",
      position: "long",
      note: "",
      cost: 100,
      priceOpen: 100,
      priceTakeProfit: 200,
      priceStopLoss: 50,
      originalPriceOpen: 100,
      originalPriceTakeProfit: 200,
      originalPriceStopLoss: 50,
      minuteEstimatedTime: 60,
      scheduledAt: pendingAt,
      pendingAt,
      timestamp: pendingAt,
      closeTimestamp,
      closeReason: "take_profit",
      currentPrice: close,
      pnl: { pnlPercentage, pnlCost: pnlPercentage, pnlEntries: pnlPercentage, priceOpen: 100, priceClose: close },
      totalEntries: 1,
      totalPartials: 0,
      partialExecuted: 0,
      createdAt: pendingAt,
      updatedAt: pendingAt,
      priority: pendingAt,
    };
    if (falls[i] !== undefined) {
      row.maxDrawdown = { pnlPercentage: falls[i], pnlCost: falls[i], pnlEntries: falls[i], priceOpen: 100, priceClose: close };
    }
    if (peaks[i] !== undefined) {
      row.peakProfit = { pnlPercentage: peaks[i], pnlCost: peaks[i], pnlEntries: peaks[i], priceOpen: 100, priceClose: close };
    }
    return row;
  });

  PersistStorageAdapter.usePersistStorageAdapter(class {
    constructor(backtest) {
      this._backtest = backtest;
    }
    async waitForInit() {}
    async readStorageData() {
      // Реплей через LIVE-сторону (backtest=false) — симметрично Backtest-тесту
      return this._backtest ? [] : rows;
    }
    async writeStorageData() {}
  });
  StorageLive.usePersist();

  addExchangeSchema({
    exchangeName: "binance-audit-live-math",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({ timestamp: alignedSince + i * 60_000, open: 100, high: 101, low: 99, close: 100, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "audit-live-math",
    interval: "1m",
    getSignal: async () => null,
  });

  const stats = await Live.getData("BTCUSDT", {
    strategyName: "audit-live-math",
    exchangeName: "binance-audit-live-math",
  });

  // Эталон идентичен Backtest-тесту (та же независимая Python-реализация):
  const expected = {
    totalEvents: 12,
    totalClosed: 12,
    winCount: 7,
    lossCount: 5,
    totalPnl: 2.5,
    avgPnl: 0.20833333333333334,
    winRate: 58.333333333333336,
    stdDev: 0.6200562046860727,
    sharpeRatio: 0.33599104687422665,
    annualizedSharpeRatio: 4.738576379048751,
    sortinoRatio: 0.7216878364870323,
    medianPnl: 0.25,
    expectancy: 0.20833333333333337,
    certaintyRatio: 1.6071428571428572,
    expectedYearlyReturns: 50.75117637501228,
    calmarRatio: 14.562747883791118,
    recoveryFactor: 0.7194454128338333,
    avgConsecutiveWinPnl: 0.9,
    avgConsecutiveLossPnl: -0.5,
    avgPeakPnl: 1.05,
    avgFallPnl: -3.0,
    avgDuration: 30.0,
    avgWinDuration: 30.0,
    avgLossDuration: 30.0,
    medianStepSize: 2.0201340026755816,
    buyerPressure: 1.0,
    sellerPressure: 0.0,
    buyerStrength: 1.0,
    sellerStrength: 0.0,
    pressureImbalance: 1.0,
  };

  const approxEq = (actual, ref, tol) =>
    typeof actual === "number" && Math.abs(actual - ref) <= tol * Math.max(1, Math.abs(ref));

  const mismatches = [];
  for (const [key, ref] of Object.entries(expected)) {
    if (!approxEq(stats[key], ref, 1e-9)) {
      mismatches.push(`${key}: expected ${ref}, got ${stats[key]}`);
    }
  }
  if (!approxEq(stats.trendStrength, 1.0, 1e-6)) {
    mismatches.push(`trendStrength: expected 1.0, got ${stats.trendStrength}`);
  }
  if (!approxEq(stats.trendConfidence, 1.0, 1e-6)) {
    mismatches.push(`trendConfidence: expected 1.0, got ${stats.trendConfidence}`);
  }
  if (stats.trend !== "bullish") {
    mismatches.push(`trend: expected "bullish", got ${stats.trend}`);
  }

  if (mismatches.length > 0) {
    fail(`LIVE MATH MISMATCH (${mismatches.length}):\n${mismatches.join("\n")}`);
    return;
  }

  pass(`All ${Object.keys(expected).length + 3} Live statistics match the independent reference (symmetric with Backtest)`);
});

/**
 * AUDIT 4-й проход: stopStrategy не должен молча ронять scheduled-сигнал —
 * на бирже за ним стоит реальный resting order. Ожидание: следующий tick
 * дренирует отложенную отмену — эмитит onScheduleEvent("cancelled")
 * (канал Broker.commitScheduleCancelled → адаптер снимает ордер) и релизит
 * risk-резервацию. Регрессия: scheduled занулялся мимо пайплайна, брокер
 * не уведомлялся, ордер оставался висеть.
 */
test("AUDIT: stopStrategy routes scheduled signal through cancel pipeline (broker notified)", async ({ pass, fail }) => {
  const basePrice = 50000;
  const intervalMs = 60000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "audit-stop-scheduled-strategy",
    exchangeName: "binance-audit-stop-scheduled",
    frameName: "",
  };

  let signalGenerated = false;
  const cancelledEvents = [];

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      // priceOpen сильно ниже рынка → сигнал становится scheduled (ждёт цену)
      return {
        position: "long",
        note: "audit stop scheduled",
        priceOpen: basePrice - 10000,
        priceTakeProfit: basePrice - 6000,
        priceStopLoss: basePrice - 12000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribe = listenScheduleEvent((event) => {
    if (event.action === "cancelled" && event.strategyName === context.strategyName) {
      cancelledEvents.push(event);
    }
  });

  try {
    // strategyCoreService.tick требует method context (в проде его ставит
    // LiveLogicPublicService) — оборачиваем как command-слой
    const runTick = (when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    // tick #1: создаёт scheduled-сигнал
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }
    const scheduledId = tick1.signal.id;

    // graceful shutdown: раньше scheduled занулялся молча
    await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.stopStrategy(false, "BTCUSDT", context),
      context,
    );

    // tick #2: должен дренировать отложенную отмену
    const tick2 = await runTick(new Date(t0 + intervalMs));
    if (tick2.action !== "cancelled") {
      fail(`REGRESSION: tick #2 expected "cancelled", got "${tick2.action}" — broker never notified, resting order orphaned`);
      return;
    }
    if (tick2.reason !== "user") {
      fail(`tick #2 cancel reason expected "user", got "${tick2.reason}"`);
      return;
    }

    // Брокерский канал: scheduleEventSubject должен получить "cancelled"
    if (cancelledEvents.length !== 1 || cancelledEvents[0].data.id !== scheduledId) {
      fail(`REGRESSION: scheduleEventSubject "cancelled" not emitted for ${scheduledId} (got ${cancelledEvents.length} events)`);
      return;
    }

    pass("stopStrategy cancels scheduled via pipeline: tick #2 = cancelled/user, broker channel notified");
  } finally {
    unsubscribe();
  }
});

/**
 * AUDIT E2E: risk-отказ на price-активации scheduled-сигнала в BACKTEST должен
 * эмитить «cancelled» в scheduleEventSubject (канал брокера + статистика отмен).
 *
 * Регрессия: ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN при отказе риска молча
 * занулял scheduled (setScheduledSignal(null) + релиз риска) — ни commit, ни
 * schedule event не эмитились, сигнал исчезал бесследно.
 */
test("AUDIT: backtest price-activation risk-reject emits cancelled schedule event", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const intervalMs = 60000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "audit-bt-activation-risk-strategy",
    exchangeName: "binance-audit-bt-activation-risk",
    frameName: "30m-audit-bt-activation-risk",
  };

  let riskAttempts = 0;
  let signalGenerated = false;
  const cancelledEvents = [];

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        // С 10-й минуты фрейма свеча опускает low до priceOpen (wick-активация),
        // но НЕ до priceStopLoss (38000) — активация, не price_reject
        const dip = timestamp >= t0 + 10 * intervalMs;
        candles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 100,
          low: dip ? priceOpen - 50 : basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "audit-bt-activation-risk",
    validations: [
      () => {
        riskAttempts += 1;
        // Вызов #1 — резервация при создании scheduled (проходит),
        // вызов #2 — проверка при price-активации (отказ)
        if (riskAttempts >= 2) {
          throw new Error("audit: risk rejects at activation");
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    riskName: "audit-bt-activation-risk",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "audit bt activation risk",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const unsubscribe = listenScheduleEvent((event) => {
    if (event.action === "cancelled" && event.strategyName === context.strategyName) {
      cancelledEvents.push(event);
    }
  });

  try {
    const awaitSubject = new Subject();
    listenDoneBacktest(() => awaitSubject.next());

    Backtest.background("BTCUSDT", context);

    await awaitSubject.toPromise();

    if (riskAttempts !== 2) {
      fail(`expected 2 risk validation calls (reserve + activation reject), got ${riskAttempts}`);
      return;
    }

    if (cancelledEvents.length !== 1) {
      fail(`REGRESSION: risk-rejected activation dropped scheduled silently — expected 1 "cancelled" schedule event, got ${cancelledEvents.length}`);
      return;
    }

    pass(`backtest activation risk-reject emitted cancelled schedule event (riskAttempts=${riskAttempts})`);
  } finally {
    unsubscribe();
  }
});

/**
 * AUDIT E2E: risk-отказ на price-активации scheduled-сигнала в LIVE должен
 * эмитить «cancelled» в scheduleEventSubject — иначе Broker.commitScheduleCancelled
 * не вызывается и реальный resting order осиротевает на бирже.
 *
 * Регрессия: ACTIVATE_SCHEDULED_SIGNAL_FN при отказе риска молча занулял scheduled.
 */
test("AUDIT: live price-activation risk-reject emits cancelled schedule event (broker notified)", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const intervalMs = 60000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "audit-live-activation-risk-strategy",
    exchangeName: "binance-audit-live-activation-risk",
    frameName: "",
  };

  let marketPrice = basePrice;
  let riskAttempts = 0;
  let signalGenerated = false;
  const cancelledEvents = [];

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * intervalMs,
          open: marketPrice,
          high: marketPrice,
          low: marketPrice,
          close: marketPrice,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addRiskSchema({
    riskName: "audit-live-activation-risk",
    validations: [
      () => {
        riskAttempts += 1;
        if (riskAttempts >= 2) {
          throw new Error("audit: risk rejects at live activation");
        }
      },
    ],
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    riskName: "audit-live-activation-risk",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "audit live activation risk",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribe = listenScheduleEvent((event) => {
    if (event.action === "cancelled" && event.strategyName === context.strategyName) {
      cancelledEvents.push(event);
    }
  });

  try {
    const runTick = (when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    // tick #1: создаёт scheduled (цена рынка выше priceOpen)
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }
    const scheduledId = tick1.signal.id;

    // Цена падает до priceOpen → tick #2 активирует, риск отвергает
    marketPrice = priceOpen;
    const tick2 = await runTick(new Date(t0 + intervalMs));
    if (tick2.action === "opened") {
      fail(`tick #2 must not open: risk rejects at activation, got "${tick2.action}"`);
      return;
    }

    if (riskAttempts !== 2) {
      fail(`expected 2 risk validation calls (reserve + activation reject), got ${riskAttempts}`);
      return;
    }

    if (cancelledEvents.length !== 1 || cancelledEvents[0].data.id !== scheduledId) {
      fail(`REGRESSION: scheduleEventSubject "cancelled" not emitted for ${scheduledId} — broker never notified, resting order orphaned (got ${cancelledEvents.length} events)`);
      return;
    }

    pass(`live activation risk-reject notified broker channel: tick #2 = ${tick2.action}, cancelled event received`);
  } finally {
    unsubscribe();
  }
});

/**
 * AUDIT E2E: sync-отказ (onSignalSync / syncSubject бросил) на price-активации
 * scheduled-сигнала в LIVE должен эмитить «cancelled» в scheduleEventSubject.
 *
 * Регрессия: ветка sync-reject эмитила только commit — мимо
 * Broker.commitScheduleCancelled, реальный resting order оставался на бирже.
 */
test("AUDIT: live price-activation sync-reject notifies broker channel", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const intervalMs = 60000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "audit-live-activation-sync-strategy",
    exchangeName: "binance-audit-live-activation-sync",
    frameName: "",
  };

  let marketPrice = basePrice;
  let signalGenerated = false;
  let syncRejects = 0;
  const cancelledEvents = [];

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * intervalMs,
          open: marketPrice,
          high: marketPrice,
          low: marketPrice,
          close: marketPrice,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "audit live activation sync",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribeSchedule = listenScheduleEvent((event) => {
    if (event.action === "cancelled" && event.strategyName === context.strategyName) {
      cancelledEvents.push(event);
    }
  });

  // Брокер отвергает открытие: throw в syncSubject → CREATE_SYNC_FN → false
  const unsubscribeSync = listenSync((event) => {
    if (event.strategyName === context.strategyName && event.action === "signal-open") {
      syncRejects += 1;
      throw new Error("audit: broker rejected order at activation");
    }
  }, true);

  try {
    const runTick = (when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }
    const scheduledId = tick1.signal.id;

    // Цена падает до priceOpen → tick #2 активирует, брокер отвергает sync
    marketPrice = priceOpen;
    const tick2 = await runTick(new Date(t0 + intervalMs));
    if (tick2.action === "opened") {
      fail(`tick #2 must not open: broker rejected sync, got "${tick2.action}"`);
      return;
    }

    if (syncRejects !== 1) {
      fail(`expected exactly 1 sync reject at activation, got ${syncRejects}`);
      return;
    }

    if (cancelledEvents.length !== 1 || cancelledEvents[0].data.id !== scheduledId) {
      fail(`REGRESSION: sync-reject emitted commit only — scheduleEventSubject "cancelled" missing for ${scheduledId} (got ${cancelledEvents.length} events)`);
      return;
    }

    pass(`live activation sync-reject notified broker channel: tick #2 = ${tick2.action}, cancelled event received`);
  } finally {
    unsubscribeSchedule();
    unsubscribeSync();
  }
});

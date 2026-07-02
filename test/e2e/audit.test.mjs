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

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addActionSchema,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Консумация id УСПЕШНЫМ филлом (REPORT: каскад из пяти траншей по одному
// детерминированному id, 22.07.2026). Терминальный реджект персистит
// консумацию (фикс 16.5.0), а успешный open записывал _lastPendingId только в
// память ПОСЛЕ персиста — на диске оставался старый id. Рестарт между филлом и
// закрытием позиции восстанавливал устаревший гард, и после закрытия стратегия
// переоткрывала тот же сигнал реальным ордером — по траншу за рестарт.

const MIN = 60_000;

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

const makeExchange = (exchangeName, getPrice) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const price = getPrice();
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });
};

const makeRunTick = (context) => (when) =>
  MethodContextService.runInContext(
    async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
    context,
  );

const EMPTY_STRATEGY_DATA = {
  pendingSignalId: null,
  lastPendingId: null,
  createdSignal: null,
  commitQueue: [],
  closedSignal: null,
  cancelledSignal: null,
  activatedSignal: null,
  takeProfitSignal: null,
  stopLossSignal: null,
  retryOpenSignal: null,
  retryOpenCount: 0,
  retryCloseCount: 0,
};

/**
 * FILL: успешный open обязан ДЮРАБЕЛЬНО потребить детерминированный id.
 * Сценарий инцидента: филл -> рестарт (позиция ещё открыта) -> позиция
 * закрывается -> стратегия переиздаёт тот же id. Ожидание: idle (одна позиция
 * на сигнал); регрессия: второй "opened" с реальным ордером на бирже.
 */
test("FILL: filled id stays consumed across a restart (no re-open cascade)", async ({ pass, fail }) => {
  const DET_ID = "fill-consume-id";
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "fill-consume-strategy",
    exchangeName: "binance-fill-consume",
    frameName: "",
  };

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    // Сброс остатков прошлых прогонов сьюта (json-файлы живут на диске)
    await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(
      { ...EMPTY_STRATEGY_DATA },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const gateOpenIds = [];
    let getSignalCalls = 0;

    makeExchange(context.exchangeName, () => basePrice);

    class EmptyAction {}
    addActionSchema({
      actionName: "fill-consume-action",
      handler: EmptyAction,
      callbacks: {
        onOrderSync: (event) => {
          if (event.action !== "signal-open" || event.type !== "active") return;
          gateOpenIds.push(event.signalId);
        },
      },
    });

    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      actions: ["fill-consume-action"],
      // Детерминированный id: канал переиздаёт один и тот же сигнал каждый тик,
      // пока цена в entry-диапазоне (сетап инцидента)
      getSignal: async () => {
        getSignalCalls += 1;
        return {
          id: DET_ID,
          position: "long",
          note: "fill consume",
          priceTakeProfit: basePrice + 5000,
          priceStopLoss: basePrice - 5000,
          minuteEstimatedTime: 2,
        };
      },
    });

    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened" (broker confirmed the fill), got "${tick1.action}"`);
      return;
    }

    // Снапшот сразу после подтверждённого open: консумация обязана быть на диске
    const afterOpen = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);

    // «Крэш»: голый dispose инстанса — новый инстанс восстановится в waitForInit
    await lib.strategyConnectionService.clear({
      symbol: "BTCUSDT",
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: false,
    });

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 after restart expected "active" (restored position), got "${tick2.action}"`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed") {
      fail(`tick #3 expected "closed" (time_expired), got "${tick3.action}"`);
      return;
    }

    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "idle") {
      fail(`REGRESSION (fill cascade): tick #4 re-opened the consumed id "${DET_ID}" — expected "idle", got "${tick4.action}" (a second REAL order would hit the exchange)`);
      return;
    }
    if (gateOpenIds.length !== 1) {
      fail(`REGRESSION (fill cascade): gate must see exactly 1 signal-open for "${DET_ID}", got ${gateOpenIds.length} [${gateOpenIds.join(", ")}]`);
      return;
    }
    if (getSignalCalls < 2) {
      fail(`tick #4 must consult getSignal and reject the id AFTER generation, got ${getSignalCalls} calls total`);
      return;
    }
    if (afterOpen?.lastPendingId !== DET_ID) {
      fail(`persisted snapshot right after the confirmed open must carry the consumed id, got lastPendingId=${afterOpen?.lastPendingId}`);
      return;
    }

    pass(`filled id "${DET_ID}" consumed durably: persisted at open, survived the restart, re-emission blocked (gate opens=1)`);
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

/**
 * FILL: восстановление pending-снапшота само потребляет его id (heal). Крэш в
 * окно между записью pending и записью strategy-снапшота оставляет на диске
 * живую позицию при устаревшем lastPendingId — рестарт обязан вывести
 * консумацию из самого факта существования позиции, а не доверять снапшоту.
 */
test("FILL: restored pending signal heals a stale lastPendingId snapshot", async ({ pass, fail }) => {
  const DET_ID = "fill-heal-id";
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "fill-heal-strategy",
    exchangeName: "binance-fill-heal",
    frameName: "",
  };

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(
      { ...EMPTY_STRATEGY_DATA },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const gateOpenIds = [];

    makeExchange(context.exchangeName, () => basePrice);

    class EmptyAction {}
    addActionSchema({
      actionName: "fill-heal-action",
      handler: EmptyAction,
      callbacks: {
        onOrderSync: (event) => {
          if (event.action !== "signal-open" || event.type !== "active") return;
          gateOpenIds.push(event.signalId);
        },
      },
    });

    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      actions: ["fill-heal-action"],
      getSignal: async () => ({
        id: DET_ID,
        position: "long",
        note: "fill heal",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 2,
      }),
    });

    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // «Крэш» + симуляция окна: strategy-снапшот на диске устарел (lastPendingId
    // не дожил до записи), при этом pending-снапшот позиции записан
    await lib.strategyConnectionService.clear({
      symbol: "BTCUSDT",
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: false,
    });
    const snapshot = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(
      { ...snapshot, lastPendingId: null },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 after restart expected "active" (restored position), got "${tick2.action}"`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed") {
      fail(`tick #3 expected "closed" (time_expired), got "${tick3.action}"`);
      return;
    }

    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "idle") {
      fail(`REGRESSION (stale snapshot): tick #4 re-opened "${DET_ID}" after the heal-less restore — expected "idle", got "${tick4.action}"`);
      return;
    }
    if (gateOpenIds.length !== 1) {
      fail(`gate must see exactly 1 signal-open for "${DET_ID}", got ${gateOpenIds.length}`);
      return;
    }

    pass(`restored pending consumed its own id: stale snapshot healed, re-emission blocked after close`);
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

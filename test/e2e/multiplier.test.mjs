import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  Notification,
  toProfitLossDto,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// ---------------------------------------------------------------------------
// multiplier (плечо PNL) — e2e-проводка через живой tick-цикл:
//   1) поле из getSignal-DTO попадает в ISignalRow, персистится и удваивает
//      pnlPercentage закрытия (pnlCost следует за ним, pnlEntries не скейлится);
//      нотификации signal.opened / signal.closed несут то же значение;
//   2) сигнал БЕЗ поля получает дефолт CC_SIGNAL_MULTIPLIER = 1, дефолт
//      переживает рестарт, а старый персист-снапшот без поля читается с
//      back-compat дефолтом.
// ---------------------------------------------------------------------------

const MIN = 60_000;
const EPS = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < EPS;

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
          open: price, high: price, low: price, close: price, volume: 100,
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
  pendingSignalId: null, lastPendingId: null, createdSignal: null,
  commitQueue: [], closedSignal: null, cancelledSignal: null,
  activatedSignal: null, takeProfitSignal: null, stopLossSignal: null,
  retryOpenSignal: null, retryOpenCount: 0, retryCloseCount: 0,
  isPaused: false,
};

test("MULTIPLIER: signal multiplier persists, scales closed PNL and reaches notifications", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "multiplier-scale-strategy",
    exchangeName: "binance-multiplier-scale",
    frameName: "",
  };

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  const disableNotification = Notification.enable();

  try {
    // Сброс остатков прошлых прогонов сьюта (json-файлы живут на диске)
    await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(
      { ...EMPTY_STRATEGY_DATA },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    makeExchange(context.exchangeName, () => basePrice);

    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => ({
        position: "long",
        note: "multiplier scale",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 2,
        multiplier: 2,
      }),
    });

    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }
    if (tick1.signal.multiplier !== 2) {
      fail(`tick #1 signal must carry multiplier 2, got ${tick1.signal.multiplier}`);
      return;
    }

    // Персистнутая строка обязана нести multiplier
    const persisted = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (persisted?.multiplier !== 2) {
      fail(`persisted signal row must carry multiplier 2, got ${persisted?.multiplier}`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 expected "active", got "${tick2.action}"`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed") {
      fail(`tick #3 expected "closed" (time_expired), got "${tick3.action}"`);
      return;
    }

    // Эталон: тот же сигнал с multiplier: 1 — закрытие должно дать ровно 2x
    const reference = toProfitLossDto(
      { position: "long", priceOpen: persisted.priceOpen, cost: persisted.cost, multiplier: 1 },
      tick3.currentPrice,
    );
    if (!approxEqual(tick3.pnl.pnlPercentage, 2 * reference.pnlPercentage)) {
      fail(`closed pnlPercentage must be 2x the unleveraged reference: expected ${2 * reference.pnlPercentage}, got ${tick3.pnl.pnlPercentage}`);
      return;
    }
    // Инвариант pnlCost = pnlPercentage / 100 * pnlEntries; pnlEntries не скейлится
    if (tick3.pnl.pnlEntries !== reference.pnlEntries) {
      fail(`pnlEntries must stay unscaled: expected ${reference.pnlEntries}, got ${tick3.pnl.pnlEntries}`);
      return;
    }
    const expectedCost = (tick3.pnl.pnlPercentage / 100) * tick3.pnl.pnlEntries;
    if (!approxEqual(tick3.pnl.pnlCost, expectedCost)) {
      fail(`pnlCost identity failed: pnlCost=${tick3.pnl.pnlCost}, expected=${expectedCost}`);
      return;
    }

    // Нотификации канала signal.* несут multiplier
    const feed = (await Notification.getData(false))
      .filter((row) => row.strategyName === context.strategyName);
    const opened = feed.filter(({ type }) => type === "signal.opened");
    const closed = feed.filter(({ type }) => type === "signal.closed");
    if (opened.length !== 1 || opened[0].multiplier !== 2) {
      fail(`signal.opened notification must carry multiplier 2, got ${opened.length} rows [${opened.map((r) => r.multiplier).join(", ")}]`);
      return;
    }
    if (closed.length !== 1 || closed[0].multiplier !== 2) {
      fail(`signal.closed notification must carry multiplier 2, got ${closed.length} rows [${closed.map((r) => r.multiplier).join(", ")}]`);
      return;
    }

    pass(`multiplier 2 persisted, scaled closed pnl to ${tick3.pnl.pnlPercentage.toFixed(6)}% (2x ${reference.pnlPercentage.toFixed(6)}%) and reached notifications`);
  } finally {
    disableNotification();
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

test("MULTIPLIER: omitted field defaults to 1, survives a restart and back-compat read", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-02-01T00:00:00Z").getTime();
  const context = {
    strategyName: "multiplier-default-strategy",
    exchangeName: "binance-multiplier-default",
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

    makeExchange(context.exchangeName, () => basePrice);

    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      // multiplier намеренно опущен — должен примениться CC_SIGNAL_MULTIPLIER = 1
      getSignal: async () => ({
        position: "long",
        note: "multiplier default",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 5,
      }),
    });

    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }
    if (tick1.signal.multiplier !== 1) {
      fail(`tick #1 signal must default multiplier to 1, got ${tick1.signal.multiplier}`);
      return;
    }

    const persisted = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (persisted?.multiplier !== 1) {
      fail(`persisted signal row must default multiplier to 1, got ${persisted?.multiplier}`);
      return;
    }

    // Back-compat: снапшот, записанный ДО появления поля (стираем multiplier
    // вручную) обязан читаться с дефолтом из конфига
    const legacyRow = { ...persisted };
    delete legacyRow.multiplier;
    await PersistSignalAdapter.writeSignalData(legacyRow, "BTCUSDT", context.strategyName, context.exchangeName);
    const restoredLegacy = await PersistSignalAdapter.readSignalData("BTCUSDT", context.strategyName, context.exchangeName);
    if (restoredLegacy?.multiplier !== 1) {
      fail(`legacy row without multiplier must read back with the config default 1, got ${restoredLegacy?.multiplier}`);
      return;
    }

    // «Крэш»: dispose инстанса — новый восстановится из legacy-снапшота в waitForInit
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
    if (tick2.signal.multiplier !== 1) {
      fail(`restored signal must carry the default multiplier 1 after restart, got ${tick2.signal.multiplier}`);
      return;
    }

    pass("omitted multiplier defaulted to 1, survived the restart and the legacy-snapshot back-compat read");
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

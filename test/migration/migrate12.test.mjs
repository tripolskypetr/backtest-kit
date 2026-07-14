import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  listenSync,
  listenStrategyCommit,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Тесты на изменения `git diff master -- src/client/ClientStrategy.ts`,
// НЕ покрытые audit/gauntlet/broker/strategy-файлами. Каждый тест привязан
// к конкретному ханку дифа (см. докстринги).

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

const inCtx = (context, fn) => MethodContextService.runInContext(fn, context);

// di-kit: реальный сервис — прототип InstanceAccessor'а (см. test/README.md)
const realConnectionService = () => Object.getPrototypeOf(lib.strategyConnectionService);

/**
 * DIFF: WAIT_FOR_INIT_FN — restore отложенного состояния (PersistStrategyAdapter):
 * deferred close переживает «крэш» (dispose инстанса) и дренится после рестарта.
 * Заодно покрывает getStatus (снапшот отложенных флагов).
 */
test("DIFF: deferred user close survives a crash and drains after restore", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "coverage-crash-restore-strategy",
    exchangeName: "binance-coverage-crash-restore",
    frameName: "",
  };

  let signalGenerated = false;
  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "coverage crash restore",
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 300,
      };
    },
  });

  // Реальная персистенция ТОЛЬКО в скоупе теста (глобально — dummy)
  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    // JSON-персистенция переживает границы прогонов: прогон, прерванный между
    // открытием (tick #1 персистит pending) и closePending (затирает снапшот),
    // оставляет pending на диске — waitForInit его восстановит и tick #1
    // вернёт "active" вместо "opened" во всех последующих прогонах. Зачищаем
    // свои ключи до первого тика (recent не трогаем: whipsaw сравнивает по id,
    // а id генерируется заново).
    // Заодно регрессия на null-гард readStrategyData: записанный literal null
    // должен читаться как «нет данных», а не ронять waitForInit на рестарте.
    await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(null, "BTCUSDT", context.strategyName, context.exchangeName);

    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Отложенное закрытие: pending → null, _closedSignal персистится
    await inCtx(context, () => lib.strategyCoreService.closePending(false, "BTCUSDT", context, { id: "crash-close-1" }));

    const status = await inCtx(context, () => lib.strategyCoreService.getStatus(false, "BTCUSDT", context));
    if (!status.closedSignal || status.pendingSignalId !== null) {
      fail(`getStatus before crash expected closedSignal set and pendingSignalId null, got ${JSON.stringify({ closed: !!status.closedSignal, pendingSignalId: status.pendingSignalId })}`);
      return;
    }

    // «Крэш»: dispose инстанса ГОЛЫМ вызовом — без method/execution контекстов.
    // Фиксирует контекстно-независимый dispose (WAIT_FOR_DISPOSE_FN читает
    // только статические params); упадёт, если вернуть контекстные чтения.
    await lib.strategyConnectionService.clear({
      symbol: "BTCUSDT",
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: false,
    });

    // Рестарт: новый инстанс восстанавливает deferred close и дренит его
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "closed") {
      fail(`REGRESSION: tick after restore expected closed/"closed" (deferred close drained), got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (tick2.closeId !== "crash-close-1") {
      fail(`restored close must carry closeId "crash-close-1", got "${tick2.closeId}"`);
      return;
    }

    pass(`deferred close survived dispose/restore and drained with closeId (crash recovery)`);
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

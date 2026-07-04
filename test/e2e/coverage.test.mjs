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
 * DIFF: PARTIAL_CAP_TOLERANCE_FACTOR — относительный допуск 1e-9 в капе партиалов
 * (PARTIAL_PROFIT_FN/PARTIAL_LOSS_FN/validate*).
 *
 * Закрытие ровно 100% остатка через цепочку percent↔dollar конверсий копит
 * fp-дрейф; строгий `>` отверг бы последний партиал. 30% → 50% → 100% от
 * остатка должны пройти все три, остаток — ровно 0.
 */
test("DIFF: partial cap epsilon lets the final 100%-of-remaining close through fp drift", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "coverage-epsilon-strategy",
    exchangeName: "binance-coverage-epsilon",
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
        note: "coverage epsilon",
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`tick #1 expected "opened", got "${tick1.action}"`);
    return;
  }

  const price = basePrice + 1000; // профит-направление для long
  const r1 = await inCtx(context, () => lib.strategyCoreService.partialProfit(false, "BTCUSDT", 30, price, context));
  const r2 = await inCtx(context, () => lib.strategyCoreService.partialProfit(false, "BTCUSDT", 50, price, context));
  const r3 = await inCtx(context, () => lib.strategyCoreService.partialProfit(false, "BTCUSDT", 100, price, context));

  if (!r1 || !r2) {
    fail(`intermediate partials must succeed: 30%=${r1}, 50%=${r2}`);
    return;
  }
  if (!r3) {
    fail(`REGRESSION: closing exactly the remaining 100% was rejected by the fp-strict cap`);
    return;
  }

  const remaining = await inCtx(context, () => lib.strategyCoreService.getTotalCostClosed(false, "BTCUSDT", context));
  if (remaining !== 0) {
    fail(`remaining cost basis after 100%-of-remaining close expected 0, got ${remaining}`);
    return;
  }

  pass(`partials 30/50/100-of-remaining all executed, remaining cost basis = 0`);
});

/**
 * DIFF: CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN — релиз риск-резервации при
 * timeout-отмене scheduled (добавленный CALL_RISK_REMOVE_SIGNAL_FN).
 *
 * Резервация делается при создании scheduled; до фикса timeout-отмена её
 * утаивала (phantom reservation в общей риск-мапе). Патчим risk.removeSignal
 * на инстансе и считаем вызовы.
 */
test("DIFF: scheduled timeout cancellation releases the risk reservation", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "coverage-timeout-risk-strategy",
    exchangeName: "binance-coverage-timeout-risk",
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
        note: "coverage timeout risk",
        priceOpen: 40000,
        priceTakeProfit: 55000,
        priceStopLoss: 38000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const strategy = await inCtx(context, async () =>
    realConnectionService().getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false),
  );
  let riskRemoves = 0;
  const originalRemove = strategy.params.risk.removeSignal;
  strategy.params.risk.removeSignal = async (...args) => {
    riskRemoves += 1;
    return await originalRemove.call(strategy.params.risk, ...args);
  };

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "scheduled") {
    fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
    return;
  }

  // Прыжок за CC_SCHEDULE_AWAIT_MINUTES → отмена по timeout
  const tick2 = await runTick(new Date(t0 + 24 * 60 * MIN));
  if (tick2.action !== "cancelled" || tick2.reason !== "timeout") {
    fail(`tick #2 expected cancelled/timeout, got "${tick2.action}"/"${tick2.reason}"`);
    return;
  }

  if (riskRemoves !== 1) {
    fail(`REGRESSION: timeout cancel must release the reservation exactly once, got ${riskRemoves} removeSignal calls`);
    return;
  }

  pass(`timeout cancel released the risk reservation (removeSignal ×1)`);
});

/**
 * DIFF: CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN — релиз риск-резервации при
 * отмене scheduled по пробитию SL до активации (price_reject).
 */
test("DIFF: scheduled pre-activation SL cancellation releases the risk reservation", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "coverage-slcancel-risk-strategy",
    exchangeName: "binance-coverage-slcancel-risk",
    frameName: "",
  };

  let marketPrice = basePrice;
  let signalGenerated = false;
  makeExchange(context.exchangeName, () => marketPrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "coverage sl cancel risk",
        priceOpen: 40000,
        priceTakeProfit: 55000,
        priceStopLoss: 38000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const strategy = await inCtx(context, async () =>
    realConnectionService().getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false),
  );
  let riskRemoves = 0;
  const originalRemove = strategy.params.risk.removeSignal;
  strategy.params.risk.removeSignal = async (...args) => {
    riskRemoves += 1;
    return await originalRemove.call(strategy.params.risk, ...args);
  };

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "scheduled") {
    fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
    return;
  }

  // Цена проваливается НИЖЕ SL scheduled (минуя priceOpen) → price_reject
  marketPrice = 37000;
  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "cancelled" || tick2.reason !== "price_reject") {
    fail(`tick #2 expected cancelled/price_reject, got "${tick2.action}"/"${tick2.reason}"`);
    return;
  }

  if (riskRemoves !== 1) {
    fail(`REGRESSION: SL cancel must release the reservation exactly once, got ${riskRemoves} removeSignal calls`);
    return;
  }

  pass(`pre-activation SL cancel released the risk reservation (removeSignal ×1)`);
});

/**
 * DIFF: GET_SIGNAL_FN fallback — релиз риск-резервации, когда validate* бросает
 * ПОСЛЕ успешного checkSignalAndReserve (утечка phantom-резервации).
 *
 * getSignal возвращает невалидный DTO для long (SL выше входа) — валидация
 * бросает уже после резервации; fallback обязан снять слот.
 */
test("DIFF: validate-throw after risk reservation releases the leaked slot", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "coverage-validate-leak-strategy",
    exchangeName: "binance-coverage-validate-leak",
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
      // Невалидно для long: SL ВЫШЕ входа
      return {
        position: "long",
        note: "coverage validate leak",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice + 1000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const strategy = await inCtx(context, async () =>
    realConnectionService().getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false),
  );
  let riskReserves = 0;
  let riskRemoves = 0;
  const originalCheck = strategy.params.risk.checkSignalAndReserve;
  const originalRemove = strategy.params.risk.removeSignal;
  strategy.params.risk.checkSignalAndReserve = async (...args) => {
    riskReserves += 1;
    return await originalCheck.call(strategy.params.risk, ...args);
  };
  strategy.params.risk.removeSignal = async (...args) => {
    riskRemoves += 1;
    return await originalRemove.call(strategy.params.risk, ...args);
  };

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "idle") {
    fail(`tick #1 expected "idle" (invalid DTO dropped), got "${tick1.action}"`);
    return;
  }

  if (riskReserves !== 1) {
    fail(`expected exactly 1 reservation before validate-throw, got ${riskReserves}`);
    return;
  }
  if (riskRemoves !== 1) {
    fail(`REGRESSION: validate-throw after reservation must release the slot, got ${riskRemoves} removeSignal calls`);
    return;
  }

  pass(`validate-throw released the leaked reservation (reserve ×1, remove ×1)`);
});

/**
 * DIFF: GET_PROGRESS_PERCENT_FN — нулевая/отрицательная дистанция → 100 вместо
 * деления на ноль.
 *
 * Путь: breakeven переносит SL ровно на effective entry, затем цена уходит под
 * entry → штатное закрытие stop_loss отвергается sync-гейтом → fall-through в
 * мониторинг → percentSl считается при slDistance = 0. До фикса — Infinity/NaN.
 */
test("DIFF: zero SL distance after breakeven yields percentSl=100, not division by zero", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "coverage-progress-strategy",
    exchangeName: "binance-coverage-progress",
    frameName: "",
  };

  let marketPrice = basePrice;
  let signalGenerated = false;
  let closeRejects = 0;

  makeExchange(context.exchangeName, () => marketPrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "coverage progress",
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 300,
      };
    },
  });

  // Отвергаем закрытие stop_loss → fall-through в мониторинг
  const unsubscribeSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closeRejects += 1;
    throw new Error("coverage: close rejected, keep monitoring");
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Порог breakeven достигнут → SL = effective entry (slDistance = 0)
    marketPrice = basePrice + 1000;
    const breakevenSet = await inCtx(context, () => lib.strategyCoreService.breakeven(false, "BTCUSDT", marketPrice, context));
    if (!breakevenSet) {
      fail(`breakeven must be set at +1000 above entry`);
      return;
    }

    // Цена под entry (= новый SL): close stop_loss → sync reject → мониторинг
    marketPrice = basePrice - 100;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 expected "active" (rejected close falls through to monitoring), got "${tick2.action}"`);
      return;
    }
    if (!Number.isFinite(tick2.percentSl) || tick2.percentSl !== 100) {
      fail(`REGRESSION: percentSl at zero SL distance expected 100, got ${tick2.percentSl}`);
      return;
    }
    if (closeRejects !== 1) {
      fail(`expected exactly 1 rejected close before monitoring, got ${closeRejects}`);
      return;
    }

    pass(`zero-distance progress clamped: percentSl=100 with SL at effective entry`);
  } finally {
    unsubscribeSync();
  }
});

/**
 * DIFF: PROCESS_COMMIT_QUEUE_FN — очередь коммитов при отсутствии pending
 * дропается С ПРЕДУПРЕЖДЕНИЕМ (at-most-once), а не эмитится в чужой контекст.
 *
 * partialProfit ставит commit в очередь; createTakeProfit тем же интервалом
 * зануляет pending; следующий tick: очередь дропнута (partial-profit commit НЕ
 * эмитится), TP-филл закрывает позицию (close-pending commit эмитится).
 */
test("DIFF: queued commits are dropped (not emitted) when the pending signal is gone", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "coverage-queue-drop-strategy",
    exchangeName: "binance-coverage-queue-drop",
    frameName: "",
  };

  let signalGenerated = false;
  const commits = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "coverage queue drop",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push(event.action);
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // Партиал ставит commit в очередь (дренаж — на следующем tick)
    const partial = await inCtx(context, () => lib.strategyCoreService.partialProfit(false, "BTCUSDT", 30, basePrice + 1000, context));
    if (!partial) {
      fail(`partialProfit(30%) must execute`);
      return;
    }
    // TP-филл зануляет pending ДО дренажа очереди
    await inCtx(context, () => lib.strategyCoreService.createTakeProfit(false, "BTCUSDT", context, { id: "queue-drop-tp" }));

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "take_profit") {
      fail(`tick #2 expected closed/take_profit, got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }

    if (commits.includes("partial-profit")) {
      fail(`REGRESSION: orphaned partial-profit commit was emitted after pending vanished: ${JSON.stringify(commits)}`);
      return;
    }
    if (!commits.includes("close-pending")) {
      fail(`close-pending commit expected in ${JSON.stringify(commits)}`);
      return;
    }

    pass(`orphaned queued commit dropped, close-pending delivered: ${JSON.stringify(commits)}`);
  } finally {
    unsubscribeCommit();
  }
});

/**
 * DIFF: fallback `signal.cost ?? CC_POSITION_ENTRY_COST` — сигнал с кастомным
 * cost и пустым _entry (симуляция старой персистенции) не должен падать на
 * константу $100 в getPositionInvestedCost/getPositionEntries.
 */
test("DIFF: cost fallback uses signal.cost for entry-less signals, not the $100 constant", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const CUSTOM_COST = 250;

  const context = {
    strategyName: "coverage-cost-fallback-strategy",
    exchangeName: "binance-coverage-cost-fallback",
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
        note: "coverage cost fallback",
        cost: CUSTOM_COST,
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 20000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`tick #1 expected "opened", got "${tick1.action}"`);
    return;
  }

  // Симуляция сигнала из старой персистенции: _entry отсутствует
  const strategy = await inCtx(context, async () =>
    realConnectionService().getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false),
  );
  strategy._pendingSignal._entry = [];

  const invested = await inCtx(context, () => lib.strategyCoreService.getPositionInvestedCost(false, "BTCUSDT", context));
  if (invested !== CUSTOM_COST) {
    fail(`REGRESSION: entry-less invested cost expected signal.cost=${CUSTOM_COST}, got ${invested} (constant fallback?)`);
    return;
  }

  const entries = await inCtx(context, () => lib.strategyCoreService.getPositionEntries(false, "BTCUSDT", context));
  if (!entries || entries.length !== 1 || entries[0].cost !== CUSTOM_COST) {
    fail(`REGRESSION: entry-less getPositionEntries expected [{cost: ${CUSTOM_COST}}], got ${JSON.stringify(entries)}`);
    return;
  }

  pass(`entry-less signal reports invested=${invested} and entries cost=${entries[0].cost} from signal.cost`);
});

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

/**
 * DIFF: контекстно-независимая поверхность ClientStrategy.
 *
 * ФИКСИРУЕТ инвариант рефактора: все геттеры, validate*, позиционные команды,
 * deferred-команды, setScheduledSignal, waitForInit (пустой restore), stopStrategy
 * и dispose работают БЕЗ MethodContext и ExecutionContext — голыми вызовами на
 * инстансе. Если кто-то вернёт чтение execution.context/method.context в любой
 * из них — тест назовёт метод по имени (ScopeContextError).
 *
 * Вне инварианта (законно требуют контекстов): tick, backtest, setPendingSignal
 * (ленивый `when` для onWrite), restore-ветки waitForInit (время симулируемо).
 */
test("DIFF: every getter and command on ClientStrategy runs bare, without contexts", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const NOW = t0 + 60_000;

  const context = {
    strategyName: "coverage-bare-strategy",
    exchangeName: "binance-coverage-bare",
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
        note: "coverage bare",
        priceTakeProfit: basePrice + 20000,
        priceStopLoss: basePrice - 10000,
        minuteEstimatedTime: 300,
      };
    },
  });

  // Вторая стратегия — для голых waitForInit/createSignal/stopStrategy/dispose
  const context2 = {
    strategyName: "coverage-bare2-strategy",
    exchangeName: "binance-coverage-bare",
    frameName: "",
  };
  addStrategySchema({
    strategyName: context2.strategyName,
    interval: "1m",
    getSignal: async () => null,
  });

  // Открываем позицию штатным пайплайном (tick законно требует контексты)
  const runTick = makeRunTick(context);
  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`tick #1 expected "opened", got "${tick1.action}"`);
    return;
  }

  // ГОЛЫЙ доступ к инстансу — с этой точки НИ ОДНОЙ обёртки контекста
  const conn = realConnectionService();
  const s = conn.getStrategy("BTCUSDT", context.strategyName, context.exchangeName, context.frameName, false);

  const failures = [];
  const results = {};
  const bare = async (name, fn) => {
    try {
      results[name] = await fn();
    } catch (e) {
      failures.push(`${name}: ${e.message}`);
    }
  };

  // --- геттеры состояния ---
  await bare("hasPendingSignal", () => s.hasPendingSignal("BTCUSDT"));
  await bare("hasScheduledSignal", () => s.hasScheduledSignal("BTCUSDT"));
  await bare("getPendingSignal", () => s.getPendingSignal("BTCUSDT", basePrice));
  await bare("getScheduledSignal", () => s.getScheduledSignal("BTCUSDT", basePrice));
  await bare("getStopped", () => s.getStopped("BTCUSDT"));
  await bare("getBreakeven", () => s.getBreakeven("BTCUSDT", basePrice + 1000));
  await bare("getStatus", () => s.getStatus("BTCUSDT"));
  // --- позиционные геттеры ---
  await bare("getTotalPercentClosed", () => s.getTotalPercentClosed("BTCUSDT"));
  await bare("getTotalCostClosed", () => s.getTotalCostClosed("BTCUSDT"));
  await bare("getPositionEffectivePrice", () => s.getPositionEffectivePrice("BTCUSDT"));
  await bare("getPositionInvestedCount", () => s.getPositionInvestedCount("BTCUSDT"));
  await bare("getPositionInvestedCost", () => s.getPositionInvestedCost("BTCUSDT"));
  await bare("getPositionPnlPercent", () => s.getPositionPnlPercent("BTCUSDT", basePrice + 500));
  await bare("getPositionPnlCost", () => s.getPositionPnlCost("BTCUSDT", basePrice + 500));
  await bare("getPositionLevels", () => s.getPositionLevels("BTCUSDT"));
  await bare("getPositionPartials", () => s.getPositionPartials("BTCUSDT"));
  await bare("getPositionEntries", () => s.getPositionEntries("BTCUSDT", NOW));
  await bare("getPositionEstimateMinutes", () => s.getPositionEstimateMinutes("BTCUSDT"));
  await bare("getPositionCountdownMinutes", () => s.getPositionCountdownMinutes("BTCUSDT", NOW));
  await bare("getPositionActiveMinutes", () => s.getPositionActiveMinutes("BTCUSDT", NOW));
  await bare("getPositionWaitingMinutes", () => s.getPositionWaitingMinutes("BTCUSDT", NOW));
  // --- peak/fall геттеры ---
  await bare("getPositionHighestProfitPrice", () => s.getPositionHighestProfitPrice("BTCUSDT"));
  await bare("getPositionHighestProfitTimestamp", () => s.getPositionHighestProfitTimestamp("BTCUSDT"));
  await bare("getPositionHighestPnlPercentage", () => s.getPositionHighestPnlPercentage("BTCUSDT"));
  await bare("getPositionHighestPnlCost", () => s.getPositionHighestPnlCost("BTCUSDT"));
  await bare("getPositionHighestProfitBreakeven", () => s.getPositionHighestProfitBreakeven("BTCUSDT"));
  await bare("getPositionHighestProfitMinutes", () => s.getPositionHighestProfitMinutes("BTCUSDT", NOW));
  await bare("getPositionDrawdownMinutes", () => s.getPositionDrawdownMinutes("BTCUSDT", NOW));
  await bare("getPositionMaxDrawdownMinutes", () => s.getPositionMaxDrawdownMinutes("BTCUSDT", NOW));
  await bare("getPositionMaxDrawdownPrice", () => s.getPositionMaxDrawdownPrice("BTCUSDT"));
  await bare("getPositionMaxDrawdownTimestamp", () => s.getPositionMaxDrawdownTimestamp("BTCUSDT"));
  await bare("getPositionMaxDrawdownPnlPercentage", () => s.getPositionMaxDrawdownPnlPercentage("BTCUSDT"));
  await bare("getPositionMaxDrawdownPnlCost", () => s.getPositionMaxDrawdownPnlCost("BTCUSDT"));
  await bare("getPositionHighestProfitDistancePnlPercentage", () => s.getPositionHighestProfitDistancePnlPercentage("BTCUSDT", basePrice));
  await bare("getPositionHighestProfitDistancePnlCost", () => s.getPositionHighestProfitDistancePnlCost("BTCUSDT", basePrice));
  await bare("getPositionHighestMaxDrawdownPnlPercentage", () => s.getPositionHighestMaxDrawdownPnlPercentage("BTCUSDT", basePrice));
  await bare("getPositionHighestMaxDrawdownPnlCost", () => s.getPositionHighestMaxDrawdownPnlCost("BTCUSDT", basePrice));
  await bare("getMaxDrawdownDistancePnlPercentage", () => s.getMaxDrawdownDistancePnlPercentage("BTCUSDT", basePrice));
  await bare("getMaxDrawdownDistancePnlCost", () => s.getMaxDrawdownDistancePnlCost("BTCUSDT", basePrice));
  // --- validate* ---
  await bare("validatePartialProfit", () => s.validatePartialProfit("BTCUSDT", 10, basePrice + 2000));
  await bare("validatePartialLoss", () => s.validatePartialLoss("BTCUSDT", 10, basePrice - 2000));
  await bare("validateBreakeven", () => s.validateBreakeven("BTCUSDT", basePrice + 2000));
  await bare("validateTrailingStop", () => s.validateTrailingStop("BTCUSDT", -5, basePrice + 2000));
  await bare("validateTrailingTake", () => s.validateTrailingTake("BTCUSDT", -10, basePrice + 2000));
  await bare("validateAverageBuy", () => s.validateAverageBuy("BTCUSDT", basePrice - 2000));
  // --- позиционные команды (мутирующие) ---
  await bare("partialProfit", () => s.partialProfit("BTCUSDT", 10, basePrice + 2000, false, NOW));
  await bare("partialLoss", () => s.partialLoss("BTCUSDT", 10, basePrice - 2000, false, NOW));
  await bare("trailingStop", () => s.trailingStop("BTCUSDT", -5, basePrice + 2000, false, NOW));
  await bare("trailingTake", () => s.trailingTake("BTCUSDT", -10, basePrice + 2000, false, NOW));
  await bare("breakeven", () => s.breakeven("BTCUSDT", basePrice + 2000, false, NOW));
  await bare("averageBuy", () => s.averageBuy("BTCUSDT", basePrice - 2000, false, NOW, 100));
  // --- deferred-команды ---
  await bare("createTakeProfit", () => s.createTakeProfit("BTCUSDT", false, { id: "bare-tp" }));
  await bare("getStatus#afterTp", () => s.getStatus("BTCUSDT"));
  await bare("setScheduledSignal(null)", () => s.setScheduledSignal(null));
  await bare("stopStrategy", () => s.stopStrategy("BTCUSDT", false));

  // --- вторая стратегия: голые waitForInit / createSignal / closePending / cancelScheduled / dispose ---
  const s2 = conn.getStrategy("BTCUSDT", context2.strategyName, context2.exchangeName, context2.frameName, false);
  await bare("waitForInit#fresh", () => s2.waitForInit());
  await bare("createSignal", () => s2.createSignal("BTCUSDT", basePrice, {
    position: "long",
    note: "bare created",
    priceTakeProfit: basePrice + 20000,
    priceStopLoss: basePrice - 10000,
    minuteEstimatedTime: 300,
  }));
  await bare("getStatus#created", () => s2.getStatus("BTCUSDT"));
  await bare("closePending#noop", () => s2.closePending("BTCUSDT", false, { id: "bare-close" }));
  await bare("cancelScheduled#noop", () => s2.cancelScheduled("BTCUSDT", false, { id: "bare-cancel" }));
  await bare("activateScheduled#noop", () => s2.activateScheduled("BTCUSDT", false, { id: "bare-activate" }));
  await bare("dispose#fresh", () => s2.dispose());

  if (failures.length > 0) {
    fail(`REGRESSION: ${failures.length} method(s) required a context:\n  ${failures.join("\n  ")}`);
    return;
  }

  // Выборочные смысловые проверки (не только «не бросило»)
  if (results["hasPendingSignal"] !== true || results["getPositionInvestedCount"] !== 1) {
    fail(`sanity: expected open position with 1 entry, got hasPending=${results["hasPendingSignal"]} count=${results["getPositionInvestedCount"]}`);
    return;
  }
  if (results["partialProfit"] !== true || results["averageBuy"] !== true || results["trailingStop"] !== true) {
    fail(`sanity: mutating commands expected true, got pp=${results["partialProfit"]} dca=${results["averageBuy"]} ts=${results["trailingStop"]}`);
    return;
  }
  if (!results["getStatus#afterTp"].takeProfitSignal) {
    fail(`sanity: createTakeProfit must snapshot into takeProfitSignal`);
    return;
  }
  if (!results["getStatus#created"].createdSignal) {
    fail(`sanity: createSignal must queue createdSignal on the fresh instance`);
    return;
  }

  const total = Object.keys(results).length;
  pass(`${total} bare calls succeeded without method/execution contexts`);
});

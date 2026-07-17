import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  setConfig,
  listenSync,
  listenExit,
  commitClosePending,
  runInMockContext,
  Backtest,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Close-пути адаптивного брокера, не покрытые базовыми файлами:
// - user-close (commitClosePending) дренаж: bounded-ретрай, force, крэш посреди
//   серии (restore через closedSignal-ветку с клэмпом);
// - backtest: force-close в candle-цикле через манкипатч params.onOrderSync;
// - id-гейт restore: стейл retryCloseCount ЧУЖОГО pendingSignalId не применяется;
// - клэмп до 1 на restore высокого счётчика (не мгновенный force после рестарта);
// - CC_ORDER_CLOSE_RETRY_ATTEMPTS=0 — legacy вечный ретрай без exit;
// - новая позиция не наследует счётчик закрытия предыдущей (attempt снова 0);
// - после force + рестарта движок чист: стейл-счётчик игнорируется.

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

const inMock = (fn, whenMs, context) =>
  runInMockContext(fn, {
    when: new Date(whenMs),
    strategyName: context.strategyName,
    exchangeName: context.exchangeName,
    frameName: context.frameName,
    symbol: "BTCUSDT",
    backtest: false,
  });

/** listenExit-хендлер queued-асинхронный — даём ему такт перед ассертом */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const BASE_PRICE = 50000;

const makeStrategy = (context, { minuteEstimatedTime, issues = 1 }) => {
  let issued = 0;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued >= issues) return null;
      issued += 1;
      return {
        position: "long",
        note: "retry close",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime,
      };
    },
  });
};

const resetPersist = async (context) => {
  await PersistSignalAdapter.writeSignalData(null, "BTCUSDT", context.strategyName, context.exchangeName);
  await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
  await PersistStrategyAdapter.writeStrategyData(
    {
      pendingSignalId: null,
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
    },
    "BTCUSDT", context.strategyName, context.exchangeName,
  );
};

/** Валидная pending-строка для крафтовых restore-сценариев */
const makePendingRow = (context, id, t0) => ({
  id,
  position: "long",
  priceOpen: BASE_PRICE,
  priceTakeProfit: BASE_PRICE + 15000,
  priceStopLoss: BASE_PRICE - 15000,
  minuteEstimatedTime: 1,
  exchangeName: context.exchangeName,
  strategyName: context.strategyName,
  timestamp: t0,
  pendingAt: t0,
  scheduledAt: t0,
  symbol: "BTCUSDT",
  _isScheduled: false,
  note: "crafted pending row",
});

/**
 * USER CLOSE: дренаж commitClosePending — отвергнутый гейтом user-close
 * ретраится (тик возвращает idle, _closedSignal сохранён), attempt растёт,
 * подтверждение закрывает с reason "closed".
 */
test("USER CLOSE: rejected drain retries with attempt sequence and closes on confirm", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "uclose-retry-strategy",
    exchangeName: "binance-uclose-retry",
    frameName: "",
  };

  const closeAttempts = [];

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 600 });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closeAttempts.push(event.attempt);
    if (closeAttempts.length <= 2) {
      throw new Error("uclose-retry: broker lost the user-close response");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }
    const openedId = tick1.signal.id;

    await inMock(() => commitClosePending("BTCUSDT"), t0 + 5000, context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "idle" || tick3.action !== "idle") {
      fail(`ticks #2/#3 expected "idle" (drain rejected, retry pending), got "${tick2.action}"/"${tick3.action}"`);
      return;
    }

    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "closed") {
      fail(`tick #4 expected closed/"closed" on confirm, got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }
    if (tick4.signal.id !== openedId) {
      fail(`closed id "${tick4.signal.id}" must equal the opened id "${openedId}"`);
      return;
    }
    if (closeAttempts.join(",") !== "0,1,2") {
      fail(`expected drain attempts "0,1,2", got "${closeAttempts.join(",")}"`);
      return;
    }

    pass(`user-close drain retried twice (attempts 0,1,2) and closed with reason "closed"`);
  } finally {
    unsubscribe();
  }
});

/**
 * USER CLOSE: исчерпание CC_ORDER_CLOSE_RETRY_ATTEMPTS в дренаже — force-close
 * с reason "closed" + ровно один фатальный exit.
 */
test("USER CLOSE: exhausted drain attempts force-close and signal fatal exit", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "uclose-exhaust-strategy",
    exchangeName: "binance-uclose-exhaust",
    frameName: "",
  };

  const closeAttempts = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 600 });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closeAttempts.push(event.attempt);
    throw new Error("uclose-exhaust: broker always rejects the user close");
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    await inMock(() => commitClosePending("BTCUSDT"), t0 + 5000, context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "idle" || tick3.action !== "idle") {
      fail(`ticks #2/#3 expected "idle" (rejections within the cap), got "${tick2.action}"/"${tick3.action}"`);
      return;
    }

    // Отказ #3 превышает CC=2 → force-дренаж
    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "closed") {
      fail(`tick #4 expected FORCED closed/"closed", got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }
    if (closeAttempts.join(",") !== "0,1,2") {
      fail(`expected drain attempts "0,1,2", got "${closeAttempts.join(",")}"`);
      return;
    }

    await settle();
    if (exitCount !== 1) {
      fail(`network exhaustion of the user-close drain must signal fatal exit exactly once, got ${exitCount}`);
      return;
    }

    pass(`user-close drain force-closed after exhausting 2 retries (attempts 0,1,2), fatal exit signaled`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * USER CLOSE: крэш посреди дренажа — closedSignal + retryCloseCount персистятся,
 * restore идёт через closedSignal-ветку с КЛЭМПОМ до 1, подтверждение зачищает.
 */
test("USER CLOSE: drain state survives a crash via the closedSignal branch with a clamped attempt", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "uclose-crash-strategy",
    exchangeName: "binance-uclose-crash",
    frameName: "",
  };

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    await resetPersist(context);

    const closeAttempts = [];

    makeExchange(context.exchangeName, () => BASE_PRICE);
    makeStrategy(context, { minuteEstimatedTime: 600 });

    const unsubscribe = listenSync((event) => {
      if (event.strategyName !== context.strategyName) return;
      if (event.action !== "signal-close") return;
      closeAttempts.push(event.attempt);
      if (closeAttempts.length === 1) {
        throw new Error("uclose-crash: broker lost the user-close response");
      }
    }, true);

    try {
      const runTick = makeRunTick(context);

      const tick1 = await runTick(new Date(t0));
      if (tick1.action !== "opened") {
        fail(`tick #1 expected "opened", got "${tick1.action}"`);
        return;
      }
      const openedId = tick1.signal.id;

      await inMock(() => commitClosePending("BTCUSDT"), t0 + 5000, context);

      const tick2 = await runTick(new Date(t0 + 1 * MIN));
      if (tick2.action !== "idle") {
        fail(`tick #2 expected "idle" (drain rejected), got "${tick2.action}"`);
        return;
      }

      const armed = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
      if (armed?.closedSignal?.id !== openedId || armed?.retryCloseCount !== 1) {
        fail(`persisted snapshot must carry closedSignal=${openedId} retryCloseCount=1, got closedSignal=${armed?.closedSignal?.id} retryCloseCount=${armed?.retryCloseCount}`);
        return;
      }

      // «Крэш» посреди дренажа user-close
      await lib.strategyConnectionService.clear({
        symbol: "BTCUSDT",
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: false,
      });

      const tick3 = await runTick(new Date(t0 + 2 * MIN));
      if (tick3.action !== "closed" || tick3.closeReason !== "closed") {
        fail(`tick #3 after crash expected closed/"closed" (restored drain confirmed), got "${tick3.action}"/"${tick3.closeReason}"`);
        return;
      }
      if (tick3.signal.id !== openedId) {
        fail(`closed id "${tick3.signal.id}" must equal the opened id "${openedId}"`);
        return;
      }
      // Pre-arm инвариант + КЛЭМП через closedSignal-ветку restore
      if (closeAttempts.join(",") !== "0,1") {
        fail(`drain attempts across the crash must be "0,1" (clamped), got "${closeAttempts.join(",")}"`);
        return;
      }

      const cleared = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
      if (cleared?.closedSignal !== null || cleared?.retryCloseCount !== 0) {
        fail(`confirmed drain must wipe the snapshot, got closedSignal=${JSON.stringify(cleared?.closedSignal)} retryCloseCount=${cleared?.retryCloseCount}`);
        return;
      }

      pass(`user-close drain survived the crash (closedSignal branch), closed with clamped attempt 1, snapshot wiped`);
    } finally {
      unsubscribe();
    }
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

/**
 * BACKTEST CLOSE: исчерпание close-ретраев в candle-цикле — манкипатч
 * params.onOrderSync отвергает signal-close, TP-кросс ретраится по свече
 * с попытками 0,1,2 и force-close'ится mid-frame.
 *
 * НЮАНС: time_expired в backtest — ОДИН финальный close после candle-цикла
 * (его отказ = задокументированный фатал "Retry backtest() with new candle
 * data"); per-candle bounded-ретрай с force существует для in-loop закрытий
 * (TP/SL) — поэтому здесь используется take_profit.
 */
test("BACKTEST CLOSE: exhausted close attempts force-close inside the candle loop", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 2 }, true);

  const context = {
    strategyName: "btclose-strategy",
    exchangeName: "binance-btclose",
    frameName: "btclose-frame",
  };

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const closeAttempts = [];
  let issued = false;

  // Цена пробивает TP (55000) с 10-й минуты — in-loop TP-close ретраится по свече
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const ts = alignedSince + i * MIN;
        const price = ts >= t0 + 10 * MIN ? 60000 : BASE_PRICE;
        candles.push({ timestamp: ts, open: price, high: price, low: price, close: price, volume: 100 });
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
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "btclose",
        priceTakeProfit: BASE_PRICE + 5000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 25,
      };
    },
  });
  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  // Манкипатч гейта: боевые каналы в backtest short-circuit'ятся (confirmed),
  // отказ можно скормить только на уровне params.onOrderSync инстанса
  {
    const realService = Object.getPrototypeOf(lib.strategyConnectionService);
    const originalGetStrategy = realService.getStrategy;
    const wrapped = (...args) => {
      const strategy = originalGetStrategy(...args);
      if (!strategy.__orderPatched) {
        strategy.__orderPatched = true;
        const original = strategy.params.onOrderSync;
        strategy.params.onOrderSync = async (event) => {
          if (event.action === "signal-close") {
            closeAttempts.push(event.attempt);
            throw new Error("btclose: exit rejected in backtest");
          }
          return await original(event);
        };
      }
      return strategy;
    };
    wrapped.clear = originalGetStrategy.clear;
    wrapped.has = originalGetStrategy.has;
    wrapped.values = originalGetStrategy.values;
    realService.getStrategy = wrapped;
  }

  const results = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    results.push(`${result.action}${result.closeReason ? `/${result.closeReason}` : ""}`);
  }

  const closedCount = results.filter((r) => r === "closed/take_profit").length;
  if (closedCount !== 1) {
    fail(`expected exactly one FORCED closed/take_profit in results, got ${closedCount} (${JSON.stringify(results)})`);
    return;
  }
  if (closeAttempts.join(",") !== "0,1,2") {
    fail(`candle loop must retry with attempts "0,1,2" before the force, got "${closeAttempts.join(",")}"`);
    return;
  }

  pass(`backtest candle loop retried the TP close (attempts 0,1,2) and force-closed take_profit`);
});

/**
 * RESTORE GATE: стейл retryCloseCount ЧУЖОГО pendingSignalId в снапшоте НЕ
 * наследуется восстановленной позицией — первая close-попытка идёт с attempt 0.
 */
test("RESTORE GATE: stale retryCloseCount of a foreign pendingSignalId is discarded on restore", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "idgate-strategy",
    exchangeName: "binance-idgate",
    frameName: "",
  };

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    await resetPersist(context);

    const rowId = "idgate-pending-x";
    await PersistSignalAdapter.writeSignalData(makePendingRow(context, rowId, t0), "BTCUSDT", context.strategyName, context.exchangeName);
    // Снапшот от ДРУГОЙ позиции: высокий счётчик закрытия под чужим id
    await PersistStrategyAdapter.writeStrategyData(
      {
        pendingSignalId: "idgate-someone-else",
        createdSignal: null,
        commitQueue: [],
        closedSignal: null,
        cancelledSignal: null,
        activatedSignal: null,
        takeProfitSignal: null,
        stopLossSignal: null,
        retryOpenSignal: null,
        retryOpenCount: 0,
        retryCloseCount: 5,
      },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const closeAttempts = [];

    makeExchange(context.exchangeName, () => BASE_PRICE);
    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => null,
    });

    const unsubscribe = listenSync((event) => {
      if (event.strategyName !== context.strategyName) return;
      if (event.action !== "signal-close") return;
      closeAttempts.push(event.attempt);
      if (closeAttempts.length === 1) {
        throw new Error("idgate: close rejected once");
      }
    }, true);

    try {
      const runTick = makeRunTick(context);

      // Восстановленная позиция (pendingAt=t0, ttl=1m) истекла → close-гейт
      const tick1 = await runTick(new Date(t0 + 5 * MIN));
      if (tick1.action !== "active") {
        fail(`tick #1 expected "active" (close rejected, position kept), got "${tick1.action}"`);
        return;
      }

      const tick2 = await runTick(new Date(t0 + 6 * MIN));
      if (tick2.action !== "closed" || tick2.closeReason !== "time_expired") {
        fail(`tick #2 expected closed/time_expired, got "${tick2.action}"/"${tick2.closeReason}"`);
        return;
      }
      // КЛЮЧЕВОЕ: чужой счётчик (5) отброшен id-гейтом — attempt начинается с 0
      if (closeAttempts.join(",") !== "0,1") {
        fail(`foreign stale counter must be discarded (attempts "0,1"), got "${closeAttempts.join(",")}"`);
        return;
      }

      pass(`foreign retryCloseCount=5 discarded by the pendingSignalId gate: attempts started at 0`);
    } finally {
      unsubscribe();
    }
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

/**
 * RESTORE CLAMP: высокий retryCloseCount СВОЕГО pendingSignalId клэмпится до 1 —
 * рестарт не умирает с первой попытки (не мгновенный force), бюджет ретраев
 * свежий: force наступает только после полной новой серии отказов.
 */
test("RESTORE CLAMP: a high own retryCloseCount clamps to 1 and grants a fresh retry budget", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "clamp-strategy",
    exchangeName: "binance-clamp",
    frameName: "",
  };

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    await resetPersist(context);

    const rowId = "clamp-pending-x";
    await PersistSignalAdapter.writeSignalData(makePendingRow(context, rowId, t0), "BTCUSDT", context.strategyName, context.exchangeName);
    // Снапшот СВОЕЙ позиции: счётчик на грани исчерпания (CC дефолт = 5)
    await PersistStrategyAdapter.writeStrategyData(
      {
        pendingSignalId: rowId,
        createdSignal: null,
        commitQueue: [],
        closedSignal: null,
        cancelledSignal: null,
        activatedSignal: null,
        takeProfitSignal: null,
        stopLossSignal: null,
        retryOpenSignal: null,
        retryOpenCount: 0,
        retryCloseCount: 5,
      },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const closeAttempts = [];
    let exitCount = 0;

    makeExchange(context.exchangeName, () => BASE_PRICE);
    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => null,
    });

    const unsubscribeExit = listenExit(() => { exitCount += 1; });
    const unsubscribe = listenSync((event) => {
      if (event.strategyName !== context.strategyName) return;
      if (event.action !== "signal-close") return;
      closeAttempts.push(event.attempt);
      throw new Error("clamp: broker still rejects after the restart");
    }, true);

    try {
      const runTick = makeRunTick(context);

      // Без клэмпа restored count=5 дал бы count=6 > 5 → мгновенный force на первом тике
      const tick1 = await runTick(new Date(t0 + 5 * MIN));
      if (tick1.action !== "active") {
        fail(`REGRESSION: restored counter must be clamped — expected "active" (no instant force), got "${tick1.action}"`);
        return;
      }
      if (closeAttempts[0] !== 1) {
        fail(`first post-restart attempt must be 1 (reconcile bit kept, streak reset), got ${closeAttempts[0]}`);
        return;
      }

      // Свежий бюджет: ещё 3 отказа терпятся, 5-й старт (count=6>5) — force
      const tick2 = await runTick(new Date(t0 + 6 * MIN));
      const tick3 = await runTick(new Date(t0 + 7 * MIN));
      const tick4 = await runTick(new Date(t0 + 8 * MIN));
      if (tick2.action !== "active" || tick3.action !== "active" || tick4.action !== "active") {
        fail(`ticks #2-#4 expected "active" (fresh budget), got "${tick2.action}"/"${tick3.action}"/"${tick4.action}"`);
        return;
      }
      const tick5 = await runTick(new Date(t0 + 9 * MIN));
      if (tick5.action !== "closed" || tick5.closeReason !== "time_expired") {
        fail(`tick #5 expected FORCED closed/time_expired after the fresh budget, got "${tick5.action}"/"${tick5.closeReason}"`);
        return;
      }
      if (closeAttempts.join(",") !== "1,2,3,4,5") {
        fail(`expected post-restart attempts "1,2,3,4,5", got "${closeAttempts.join(",")}"`);
        return;
      }

      await settle();
      if (exitCount !== 1) {
        fail(`exhaustion after the fresh budget must signal fatal exit exactly once, got ${exitCount}`);
        return;
      }

      pass(`retryCloseCount=5 clamped to 1 on restore: no instant force, fresh budget spent as attempts 1..5`);
    } finally {
      unsubscribe();
      unsubscribeExit();
    }
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

/**
 * LEGACY: CC_ORDER_CLOSE_RETRY_ATTEMPTS=0 — кап отключён: закрытие ретраится
 * вечно (позиция живёт сквозь 8 отказов), attempt растёт без force и без exit.
 */
test("LEGACY: zero close attempts disable the cap — the close retries forever without exit", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 0 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "legacy-close-strategy",
    exchangeName: "binance-legacy-close",
    frameName: "",
  };

  const closeAttempts = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 1 });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closeAttempts.push(event.attempt);
    if (closeAttempts.length <= 8) {
      throw new Error("legacy-close: broker keeps rejecting");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // 8 отказов подряд — при включённом капе (дефолт 5) force наступил бы раньше
    for (let i = 0; i < 8; i++) {
      const tick = await runTick(new Date(t0 + (2 + i) * MIN));
      if (tick.action !== "active") {
        fail(`rejection #${i + 1} expected "active" (cap disabled, retry forever), got "${tick.action}"`);
        return;
      }
    }

    const tickFinal = await runTick(new Date(t0 + 11 * MIN));
    if (tickFinal.action !== "closed" || tickFinal.closeReason !== "time_expired") {
      fail(`final tick expected closed/time_expired on confirm, got "${tickFinal.action}"/"${tickFinal.closeReason}"`);
      return;
    }
    if (closeAttempts.join(",") !== "0,1,2,3,4,5,6,7,8") {
      fail(`expected attempts "0..8" (unbounded growth), got "${closeAttempts.join(",")}"`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`legacy retry-forever must NEVER signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`cap disabled: 8 rejections tolerated (attempts 0..8), closed on confirm, no exit`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * NEW POSITION: force-close позиции A сбрасывает счётчик — следующая позиция B
 * начинает свою close-серию с attempt 0 (без наследования серии A).
 */
test("NEW POSITION: the next position starts its close attempts at 0 after a forced close", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "newpos-strategy",
    exchangeName: "binance-newpos",
    frameName: "",
  };

  const closes = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 1, issues: 2 });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closes.push({ id: event.signalId, attempt: event.attempt });
    // Позиция A: отказы 1..3 (force на 3-м); позиция B: отказ 4-й, подтверждение 5-е
    if (closes.length <= 4) {
      throw new Error("newpos: broker rejects the close");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened" (position A), got "${tick1.action}"`);
      return;
    }
    const idA = tick1.signal.id;

    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick2.action !== "active" || tick3.action !== "active") {
      fail(`ticks #2/#3 expected "active", got "${tick2.action}"/"${tick3.action}"`);
      return;
    }
    const tick4 = await runTick(new Date(t0 + 4 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "time_expired") {
      fail(`tick #4 expected FORCED closed/time_expired for A, got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }

    const tick5 = await runTick(new Date(t0 + 5 * MIN));
    if (tick5.action !== "opened") {
      fail(`tick #5 expected "opened" (position B), got "${tick5.action}"`);
      return;
    }
    const idB = tick5.signal.id;
    if (idB === idA) {
      fail(`position B must carry a fresh id, got the same "${idB}"`);
      return;
    }

    const tick6 = await runTick(new Date(t0 + 7 * MIN));
    if (tick6.action !== "active") {
      fail(`tick #6 expected "active" (B close rejected once), got "${tick6.action}"`);
      return;
    }
    const tick7 = await runTick(new Date(t0 + 8 * MIN));
    if (tick7.action !== "closed" || tick7.closeReason !== "time_expired") {
      fail(`tick #7 expected closed/time_expired for B, got "${tick7.action}"/"${tick7.closeReason}"`);
      return;
    }

    const flat = closes.map(({ attempt }) => attempt).join(",");
    // A: 0,1,2 (force) → B: 0,1 — счётчик A не протёк в B
    if (flat !== "0,1,2,0,1") {
      fail(`expected attempts "0,1,2,0,1" (B starts at 0), got "${flat}"`);
      return;
    }
    const bCloses = closes.filter(({ id }) => id === idB);
    if (bCloses.length !== 2 || bCloses[0].attempt !== 0) {
      fail(`position B must start its close series at attempt 0, got ${JSON.stringify(bCloses)}`);
      return;
    }

    await settle();
    if (exitCount !== 1) {
      fail(`only A's exhaustion must signal fatal exit (exactly once), got ${exitCount}`);
      return;
    }

    pass(`A force-closed (attempts 0,1,2), B started fresh (attempts 0,1) — no counter leakage`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * RESTART CLEAN: после force-close снапшот чист (счётчик сброшен, pending снят) —
 * рестарт продолжает работу свежим сигналом, стейл-состояние A не влияет на B.
 */
test("RESTART CLEAN: after a forced close the snapshot is clean and a restart continues fresh", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "restart-clean-strategy",
    exchangeName: "binance-restart-clean",
    frameName: "",
  };

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    await resetPersist(context);

    const closes = [];
    let exitCount = 0;

    makeExchange(context.exchangeName, () => BASE_PRICE);
    makeStrategy(context, { minuteEstimatedTime: 1, issues: 2 });

    const unsubscribeExit = listenExit(() => { exitCount += 1; });
    const unsubscribe = listenSync((event) => {
      if (event.strategyName !== context.strategyName) return;
      if (event.action !== "signal-close") return;
      closes.push({ id: event.signalId, attempt: event.attempt });
      // A: отказы 1..3 (force); B после рестарта: отказ 4-й, подтверждение 5-е
      if (closes.length <= 4) {
        throw new Error("restart-clean: broker rejects the close");
      }
    }, true);

    try {
      const runTick = makeRunTick(context);

      const tick1 = await runTick(new Date(t0));
      if (tick1.action !== "opened") {
        fail(`tick #1 expected "opened" (position A), got "${tick1.action}"`);
        return;
      }
      const idA = tick1.signal.id;

      await runTick(new Date(t0 + 2 * MIN));
      await runTick(new Date(t0 + 3 * MIN));
      const tick4 = await runTick(new Date(t0 + 4 * MIN));
      if (tick4.action !== "closed" || tick4.closeReason !== "time_expired") {
        fail(`tick #4 expected FORCED closed/time_expired for A, got "${tick4.action}"/"${tick4.closeReason}"`);
        return;
      }

      // Снапшот после force НЕ зачищается (последняя запись — pre-arm попытки №3):
      // чистоту рестарта гарантирует не запись, а id-гейт restore — pending-строка A
      // снята, значит стейл-счётчик снапшота не найдёт совпадения и будет отброшен.
      const afterForce = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
      if (afterForce?.pendingSignalId !== idA || afterForce?.retryCloseCount !== 3) {
        fail(`post-force snapshot expected to carry the STALE pair (pendingSignalId=${idA}, retryCloseCount=3) discarded later by the restore id-gate, got pendingSignalId=${afterForce?.pendingSignalId} retryCloseCount=${afterForce?.retryCloseCount}`);
        return;
      }

      // «Крэш» сразу после force-close
      await lib.strategyConnectionService.clear({
        symbol: "BTCUSDT",
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: false,
      });

      const tick5 = await runTick(new Date(t0 + 5 * MIN));
      if (tick5.action !== "opened") {
        fail(`tick #5 after restart expected "opened" (fresh position B), got "${tick5.action}"`);
        return;
      }
      const idB = tick5.signal.id;
      if (idB === idA) {
        fail(`post-restart position must carry a fresh id, got the same "${idB}"`);
        return;
      }

      const tick6 = await runTick(new Date(t0 + 7 * MIN));
      if (tick6.action !== "active") {
        fail(`tick #6 expected "active" (B close rejected once), got "${tick6.action}"`);
        return;
      }
      const tick7 = await runTick(new Date(t0 + 8 * MIN));
      if (tick7.action !== "closed" || tick7.closeReason !== "time_expired") {
        fail(`tick #7 expected closed/time_expired for B, got "${tick7.action}"/"${tick7.closeReason}"`);
        return;
      }

      const flat = closes.map(({ attempt }) => attempt).join(",");
      if (flat !== "0,1,2,0,1") {
        fail(`expected attempts "0,1,2,0,1" (B starts at 0 after the restart), got "${flat}"`);
        return;
      }

      await settle();
      if (exitCount !== 1) {
        fail(`only A's exhaustion must signal fatal exit (exactly once), got ${exitCount}`);
        return;
      }

      pass(`forced close left a clean snapshot; restart opened fresh ${idB} whose close started at attempt 0`);
    } finally {
      unsubscribe();
      unsubscribeExit();
    }
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

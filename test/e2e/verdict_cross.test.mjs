import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  listenSync,
  listenCheck,
  listenExit,
  OrderRejectedError,
  OrderDeletedError,
  OrderTransientError,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Кросс-контекстные нарушения протокола и brand-safety вердиктов:
// - OrderDeletedError в ГЕЙТАХ (open/close) — нарушение протокола из userspace,
//   намеренно деградирует до transient (bounded retry), НЕ терминальна;
// - OrderRejectedError в ЧЕКАХ — аналогично деградирует до transient
//   (толерантность), НЕ закрывает позицию немедленно;
// - вердикт распознаётся ТОЛЬКО по runtime-бренду __type__ (Symbol.for) —
//   duck-typing {reason: "rejected"} и truthy-строки НЕ являются вердиктами
//   (legacy-контракт: falsy → transient, любой truthy → confirmed);
// - OrderTransientError.fromError сохраняет message, is*Error-гарды номинальны
//   (бренд переживает дублированные бандлы, instanceof не используется).

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

const makeStrategy = (context, { minuteEstimatedTime, once }) => {
  const basePrice = 50000;
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (once && issued) return null;
      issued = true;
      return {
        position: "long",
        note: "cross test",
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime,
      };
    },
  });
};

/** listenExit-хендлер queued-асинхронный — даём ему такт перед ассертом */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/**
 * Манкипатч params.onOrderSync на уровне ClientStrategy (мимо connection-слоя):
 * сырой return проходит через TO_ORDER_VERDICT_FN — единственный способ скормить
 * движку НЕбрендированные значения (боевые каналы всегда возвращают вердикт).
 */
const patchOnOrderSync = (impl) => {
  const realService = Object.getPrototypeOf(lib.strategyConnectionService);
  const originalGetStrategy = realService.getStrategy;
  const wrapped = (...args) => {
    const strategy = originalGetStrategy(...args);
    if (!strategy.__orderPatched) {
      strategy.__orderPatched = true;
      const original = strategy.params.onOrderSync;
      strategy.params.onOrderSync = async (event) => await impl(event, original);
    }
    return strategy;
  };
  wrapped.clear = originalGetStrategy.clear;
  wrapped.has = originalGetStrategy.has;
  wrapped.values = originalGetStrategy.values;
  realService.getStrategy = wrapped;
};

/**
 * CROSS: OrderDeletedError в OPEN-гейте — нарушение протокола (deleted описывает
 * чеки), деградирует до transient: identity-stable ретрай с тем же id, НЕ
 * терминальный дроп со свежей генерацией.
 */
test("CROSS: OrderDeletedError in the open gate degrades to transient and retries the same id", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "cross-open-deleted-strategy",
    exchangeName: "binance-cross-open-deleted",
    frameName: "",
  };

  const opens = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: false });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    opens.push({ id: event.signalId, attempt: event.attempt });
    if (opens.length === 1) {
      throw new OrderDeletedError("cross: deleted thrown in the WRONG context (gate)");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));

    if (tick1.action !== "idle" || tick2.action !== "opened") {
      fail(`expected idle, opened — got ${tick1.action}, ${tick2.action}`);
      return;
    }
    if (opens.length !== 2 || opens[0].id !== opens[1].id) {
      fail(`protocol violation must degrade to transient (SAME id retried), got ${JSON.stringify(opens)}`);
      return;
    }
    const attempts = opens.map(({ attempt }) => attempt).join(",");
    if (attempts !== "0,1") {
      fail(`expected open attempts "0,1" (transient accounting), got "${attempts}"`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`a tolerated transient retry must NOT signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`OrderDeletedError in the open gate degraded to transient: same id ${opens[0].id}, attempts ${attempts}`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * CROSS: OrderDeletedError в CLOSE-гейте — деградирует до transient: позиция
 * живёт, закрытие ретраится и подтверждается на второй попытке (НЕ force).
 */
test("CROSS: OrderDeletedError in the close gate degrades to transient and retries the close", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "cross-close-deleted-strategy",
    exchangeName: "binance-cross-close-deleted",
    frameName: "",
  };

  const closeAttempts = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 1, once: true });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closeAttempts.push(event.attempt);
    if (closeAttempts.length === 1) {
      throw new OrderDeletedError("cross: deleted thrown in the WRONG context (close gate)");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 expected "active" (degraded to transient, position kept), got "${tick2.action}"`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "time_expired") {
      fail(`tick #3 expected closed/time_expired on confirm, got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }
    if (closeAttempts.join(",") !== "0,1") {
      fail(`expected close attempts "0,1", got "${closeAttempts.join(",")}"`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`a tolerated transient retry must NOT signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`OrderDeletedError in the close gate degraded to transient: attempts ${closeAttempts.join(",")}, closed on confirm`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * CROSS: OrderRejectedError в active-чеке — нарушение протокола (rejected
 * описывает гейты), деградирует до transient: сбой ТЕРПИТСЯ (позиция живёт),
 * attempt растёт и сбрасывается после успешного чека.
 */
test("CROSS: OrderRejectedError in the active check degrades to transient and is tolerated", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "cross-check-rejected-strategy",
    exchangeName: "binance-cross-check-rejected",
    frameName: "",
  };

  const checkAttempts = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: true });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    checkAttempts.push(event.attempt);
    // Чеки #1/#2 кидают rejected (нарушение протокола), #3 успешен, #4 снова кидает
    if (checkAttempts.length !== 3) {
      throw new OrderRejectedError("cross: rejected thrown in the WRONG context (check)");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    for (let i = 1; i <= 4; i++) {
      const tick = await runTick(new Date(t0 + i * MIN));
      if (tick.action !== "active") {
        fail(`tick #${1 + i} expected "active" (degraded to transient, tolerated), got "${tick.action}"`);
        return;
      }
    }

    const attempts = checkAttempts.join(",");
    if (attempts !== "0,1,2,0") {
      fail(`expected check attempts "0,1,2,0" (transient accounting + reset), got "${attempts}"`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`tolerated failures must NOT signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`OrderRejectedError in the check degraded to transient: attempts ${attempts}, position alive`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * CROSS: OrderRejectedError в schedule-чеке — деградирует до transient:
 * resting-ордер остаётся waiting, отмены нет, attempt растёт и сбрасывается.
 */
test("CROSS: OrderRejectedError in the schedule check degrades to transient — resting order stays", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "cross-sched-rejected-strategy",
    exchangeName: "binance-cross-sched-rejected",
    frameName: "",
  };

  const checkAttempts = [];
  let exitCount = 0;
  let issued = false;

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "cross sched rejected",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    checkAttempts.push(event.attempt);
    // Чеки #1/#2 кидают rejected, #3 успешен, #4 снова кидает — ордер живёт всё время
    if (checkAttempts.length !== 3) {
      throw new OrderRejectedError("cross: rejected thrown in the WRONG context (schedule check)");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    for (let i = 1; i <= 4; i++) {
      const tick = await runTick(new Date(t0 + i * MIN));
      if (tick.action !== "waiting") {
        fail(`tick #${1 + i} expected "waiting" (degraded to transient, no cancel), got "${tick.action}"`);
        return;
      }
    }

    const attempts = checkAttempts.join(",");
    if (attempts !== "0,1,2,0") {
      fail(`expected schedule-check attempts "0,1,2,0", got "${attempts}"`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`tolerated failures must NOT signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`OrderRejectedError in the schedule check degraded to transient: attempts ${attempts}, order stayed waiting`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * BRAND: небрендированный объект {reason: "rejected"} — НЕ вердикт. Duck-typing
 * не признаётся: без __type__ = Symbol.for("BrokerOrderVerdict") объект трактуется
 * по legacy-контракту (truthy → confirmed), и open ПРОХОДИТ.
 */
test("BRAND: unbranded {reason:'rejected'} is not a verdict — legacy truthy confirms the open", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brand-ducktype-strategy",
    exchangeName: "binance-brand-ducktype",
    frameName: "",
  };

  let gateCalls = 0;

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: true });

  patchOnOrderSync(async (event, original) => {
    if (event.action === "signal-open" && event.type === "active") {
      gateCalls += 1;
      // Похоже на вердикт, но БЕЗ runtime-бренда __type__ — подделка
      return { reason: "rejected" };
    }
    return await original(event);
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`REGRESSION: unbranded object was honored as a verdict — expected "opened" (legacy truthy), got "${tick1.action}"`);
    return;
  }
  if (gateCalls !== 1) {
    fail(`expected exactly 1 gate call, got ${gateCalls}`);
    return;
  }

  pass(`unbranded {reason:'rejected'} treated as legacy truthy: position opened on the first tick`);
});

/**
 * BRAND: legacy false из сырого гейта — transient: identity-stable ретрай с тем
 * же id и attempt-инкрементом (обратная совместимость boolean-контракта).
 */
test("BRAND: legacy false from the raw gate is transient — identity-stable retry", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brand-false-strategy",
    exchangeName: "binance-brand-false",
    frameName: "",
  };

  const opens = [];

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: false });

  patchOnOrderSync(async (event, original) => {
    if (event.action === "signal-open" && event.type === "active") {
      opens.push({ id: event.signalId, attempt: event.attempt });
      if (opens.length === 1) return false; // legacy-отказ
      return true; // legacy-подтверждение
    }
    return await original(event);
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  const tick2 = await runTick(new Date(t0 + 1 * MIN));

  if (tick1.action !== "idle" || tick2.action !== "opened") {
    fail(`expected idle, opened — got ${tick1.action}, ${tick2.action}`);
    return;
  }
  if (opens.length !== 2 || opens[0].id !== opens[1].id) {
    fail(`legacy false must arm the identity-stable retry (same id), got ${JSON.stringify(opens)}`);
    return;
  }
  const attempts = opens.map(({ attempt }) => attempt).join(",");
  if (attempts !== "0,1") {
    fail(`expected attempts "0,1", got "${attempts}"`);
    return;
  }

  pass(`legacy false → transient: same id ${opens[0].id} retried with attempts ${attempts}`);
});

/**
 * BRAND: truthy-строка "deleted" — НЕ вердикт: строки не признаются причинами,
 * legacy-контракт трактует любой truthy как confirmed (пиннинг фикса
 * !!"deleted" === true: строковые «вердикты» ломали бы каждый if (!result)).
 */
test("BRAND: truthy string 'deleted' is not a verdict — legacy truthy confirms the open", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brand-string-strategy",
    exchangeName: "binance-brand-string",
    frameName: "",
  };

  let gateCalls = 0;

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: true });

  patchOnOrderSync(async (event, original) => {
    if (event.action === "signal-open" && event.type === "active") {
      gateCalls += 1;
      return "deleted"; // строка, не вердикт и не boolean
    }
    return await original(event);
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`REGRESSION: string "deleted" was honored as a verdict — expected "opened" (legacy truthy), got "${tick1.action}"`);
    return;
  }
  if (gateCalls !== 1) {
    fail(`expected exactly 1 gate call, got ${gateCalls}`);
    return;
  }

  pass(`truthy string "deleted" treated as legacy confirm: position opened on the first tick`);
});

/**
 * BRAND: номинальные гарды и fromError — message сохраняется, is*Error узнаёт
 * бренд из «чужой копии» модуля (Symbol.for), instanceof не участвует; поведение
 * fromError-инстанса в гейте = transient (identity-stable ретрай).
 */
test("BRAND: fromError preserves the message, nominal guards recognize cross-bundle brands", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brand-fromerror-strategy",
    exchangeName: "binance-brand-fromerror",
    frameName: "",
  };

  // --- Номинальная семантика (unit-часть) ---
  const original = new Error("RKN cut the wire in a 200ms window");
  const wrapped = OrderTransientError.fromError(original);
  if (!wrapped.message.includes("RKN cut the wire in a 200ms window")) {
    fail(`fromError must preserve the original message, got "${wrapped.message}"`);
    return;
  }
  if (!OrderTransientError.isOrderTransientError(wrapped)) {
    fail(`isOrderTransientError must recognize its own instance`);
    return;
  }
  if (OrderTransientError.isOrderTransientError(original)) {
    fail(`isOrderTransientError must NOT recognize a plain Error`);
    return;
  }
  // «Чужая копия модуля»: голый объект с тем же Symbol.for-брендом
  const foreignRejected = { __type__: Symbol.for("OrderRejectedError"), message: "foreign" };
  const foreignDeleted = { __type__: Symbol.for("OrderDeletedError"), message: "foreign" };
  if (!OrderRejectedError.isOrderRejectedError(foreignRejected)) {
    fail(`isOrderRejectedError must recognize the brand from a duplicated bundle (Symbol.for)`);
    return;
  }
  if (!OrderDeletedError.isOrderDeletedError(foreignDeleted)) {
    fail(`isOrderDeletedError must recognize the brand from a duplicated bundle (Symbol.for)`);
    return;
  }
  if (OrderRejectedError.isOrderRejectedError(foreignDeleted) || OrderDeletedError.isOrderDeletedError(foreignRejected)) {
    fail(`brands must not cross-match between the error classes`);
    return;
  }

  // --- Поведенческая часть: fromError-инстанс в гейте = transient ---
  const opens = [];

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: false });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    opens.push({ id: event.signalId, attempt: event.attempt });
    if (opens.length === 1) {
      throw OrderTransientError.fromError(new Error("RKN cut the wire in a 200ms window"));
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));

    if (tick1.action !== "idle" || tick2.action !== "opened") {
      fail(`expected idle, opened — got ${tick1.action}, ${tick2.action}`);
      return;
    }
    if (opens.length !== 2 || opens[0].id !== opens[1].id || opens.map(({ attempt }) => attempt).join(",") !== "0,1") {
      fail(`fromError instance must behave as transient (same id, attempts 0,1), got ${JSON.stringify(opens)}`);
      return;
    }

    pass(`fromError preserved the message, nominal guards matched cross-bundle brands, gate behavior = transient`);
  } finally {
    unsubscribe();
  }
});

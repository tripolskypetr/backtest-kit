import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addActionSchema,
  setConfig,
  listenSync,
  listenCheck,
  OrderRejectedError,
  OrderDeletedError,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Вердикты гейтов/чеков (BrokerOrderVerdict) и счётчики attempt:
// - attempt в payload: 0 на первой попытке, +1 на каждом сбое, сброс в 0 на успехе;
// - close-гейт: транзиентные отказы ретраятся до CC_ORDER_CLOSE_RETRY_ATTEMPTS,
//   исчерпание (или OrderRejectedError) => force-close с исходным closeReason;
// - order-check: транзиентные сбои терпятся до CC_ORDER_CHECK_RETRY_ATTEMPTS,
//   исчерпание (или OrderDeletedError) => терминальное close "closed";
// - open-гейт: OrderRejectedError => дроп без взвода identity-stable ретрая.

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
        note: "verdict test",
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime,
      };
    },
  });
};

/**
 * VERDICT: attempt в open-гейте — 0 на первой попытке, инкремент на каждом
 * отказе (identity-stable ретрай несёт тот же id), сброс после подтверждения.
 */
test("VERDICT: open gate carries attempt sequence 0,1,2 across identity-stable retries", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-open-attempt-strategy",
    exchangeName: "binance-verdict-open-attempt",
    frameName: "",
  };

  const openEvents = [];

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: false });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    openEvents.push({ id: event.signalId, attempt: event.attempt });
    if (openEvents.length <= 2) {
      throw new Error("verdict: transient network failure on open");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));

    if (tick1.action !== "idle" || tick2.action !== "idle" || tick3.action !== "opened") {
      fail(`expected idle, idle, opened — got ${tick1.action}, ${tick2.action}, ${tick3.action}`);
      return;
    }
    const attempts = openEvents.map(({ attempt }) => attempt).join(",");
    if (attempts !== "0,1,2") {
      fail(`expected open attempts "0,1,2", got "${attempts}"`);
      return;
    }
    if (new Set(openEvents.map(({ id }) => id)).size !== 1) {
      fail(`expected the SAME signalId across retries, got ${JSON.stringify(openEvents)}`);
      return;
    }

    pass(`open gate attempts 0,1,2 with stable id ${openEvents[0].id}`);
  } finally {
    unsubscribe();
  }
});

/**
 * VERDICT: транзиентный отказ close-гейта ретраится (позиция живёт), attempt
 * инкрементится; подтверждение закрывает с исходным closeReason.
 */
test("VERDICT: transient close rejections retry with attempt sequence and close on confirm", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-close-retry-strategy",
    exchangeName: "binance-verdict-close-retry",
    frameName: "",
  };

  const closeEvents = [];

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 1, once: true });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closeEvents.push({ attempt: event.attempt });
    if (closeEvents.length <= 2) {
      throw new Error("verdict: transient network failure on close");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    // time_expired (minuteEstimatedTime=1) наступает с tick #2; гейт отвергает
    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick2.action !== "active" || tick3.action !== "active") {
      fail(`ticks #2/#3 expected "active" (close rejected, position kept), got "${tick2.action}"/"${tick3.action}"`);
      return;
    }

    const tick4 = await runTick(new Date(t0 + 4 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "time_expired") {
      fail(`tick #4 expected closed/time_expired, got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }

    const attempts = closeEvents.map(({ attempt }) => attempt).join(",");
    if (attempts !== "0,1,2") {
      fail(`expected close attempts "0,1,2", got "${attempts}"`);
      return;
    }

    pass(`close retried twice (attempts 0,1,2) and closed time_expired on confirm`);
  } finally {
    unsubscribe();
  }
});

/**
 * VERDICT: исчерпание CC_ORDER_CLOSE_RETRY_ATTEMPTS — движок force-close'ит
 * состояние с исходным closeReason, не дожидаясь подтверждения брокера.
 */
test("VERDICT: exhausted close attempts force-close the engine state with the original reason", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-close-exhaust-strategy",
    exchangeName: "binance-verdict-close-exhaust",
    frameName: "",
  };

  const closeAttempts = [];

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 1, once: true });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closeAttempts.push(event.attempt);
    throw new Error("verdict: broker always rejects the close");
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick2.action !== "active" || tick3.action !== "active") {
      fail(`ticks #2/#3 expected "active" (rejections within the cap), got "${tick2.action}"/"${tick3.action}"`);
      return;
    }

    // Отказ #3 превышает CC_ORDER_CLOSE_RETRY_ATTEMPTS=2 → force-close
    const tick4 = await runTick(new Date(t0 + 4 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "time_expired") {
      fail(`tick #4 expected FORCED closed/time_expired, got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }

    if (closeAttempts.join(",") !== "0,1,2") {
      fail(`expected close attempts "0,1,2", got "${closeAttempts.join(",")}"`);
      return;
    }

    pass(`close force-closed after exhausting 2 retries (attempts ${closeAttempts.join(",")})`);
  } finally {
    unsubscribe();
  }
});

/**
 * VERDICT: OrderRejectedError в close-гейте — терминальный отказ, force-close
 * СРАЗУ, минуя счётчик попыток.
 */
test("VERDICT: OrderRejectedError on close force-closes immediately bypassing the counter", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-close-terminal-strategy",
    exchangeName: "binance-verdict-close-terminal",
    frameName: "",
  };

  let closeCalls = 0;

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 1, once: true });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-close") return;
    closeCalls += 1;
    throw new OrderRejectedError("verdict: no counterparty, retrying is pointless");
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "time_expired") {
      fail(`tick #2 expected IMMEDIATE forced closed/time_expired, got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (closeCalls !== 1) {
      fail(`expected exactly 1 close-gate call (terminal, no retries), got ${closeCalls}`);
      return;
    }

    pass(`OrderRejectedError force-closed on the first attempt (calls=${closeCalls})`);
  } finally {
    unsubscribe();
  }
});

/**
 * VERDICT: OrderRejectedError в open-гейте — терминальный дроп: identity-stable
 * ретрай НЕ взводится, следующий tick генерирует свежий сигнал с новым id.
 */
test("VERDICT: OrderRejectedError on open drops the attempt without arming the retry", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-open-terminal-strategy",
    exchangeName: "binance-verdict-open-terminal",
    frameName: "",
  };

  const openIds = [];

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: false });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    openIds.push(event.signalId);
    if (openIds.length === 1) {
      throw new OrderRejectedError("verdict: order can never be placed");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (terminal rejection), got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (fresh signal), got "${tick2.action}"`);
      return;
    }
    if (openIds.length !== 2) {
      fail(`expected 2 open-gate calls, got ${openIds.length}`);
      return;
    }
    if (openIds[0] === openIds[1]) {
      fail(`REGRESSION: terminal rejection must NOT arm the identity-stable retry, got the same id "${openIds[0]}"`);
      return;
    }

    pass(`terminal open rejection dropped id ${openIds[0]}, fresh id ${openIds[1]} opened`);
  } finally {
    unsubscribe();
  }
});

/**
 * VERDICT: типизированная ошибка доезжает до вердикта и через ACTION-канал —
 * OrderRejectedError из callbacks.onOrderSync (ClientAction → ActionProxy →
 * connection → core → CREATE_SYNC_FN) терминально дропает open без ретрая.
 */
test("VERDICT: OrderRejectedError thrown from action onOrderSync is terminal through the action channel", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-action-terminal-strategy",
    exchangeName: "binance-verdict-action-terminal",
    frameName: "",
  };

  const openIds = [];

  makeExchange(context.exchangeName, () => 50000);

  class EmptyAction {}
  addActionSchema({
    actionName: "verdict-action-terminal-action",
    handler: EmptyAction,
    callbacks: {
      onOrderSync: (event) => {
        if (event.action !== "signal-open" || event.type !== "active") return;
        openIds.push(event.signalId);
        if (openIds.length === 1) {
          throw new OrderRejectedError("verdict: action says the order can never be placed");
        }
      },
    },
  });

  const basePrice = 50000;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    actions: ["verdict-action-terminal-action"],
    getSignal: async () => ({
      position: "long",
      note: "verdict action terminal",
      priceTakeProfit: basePrice + 15000,
      priceStopLoss: basePrice - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "idle") {
    fail(`tick #1 expected "idle" (terminal rejection via action), got "${tick1.action}"`);
    return;
  }

  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "opened") {
    fail(`tick #2 expected "opened" (fresh signal), got "${tick2.action}"`);
    return;
  }
  if (openIds.length !== 2 || openIds[0] === openIds[1]) {
    fail(`REGRESSION: typed error lost its brand through the action channel — expected a FRESH id (no armed retry), got ${JSON.stringify(openIds)}`);
    return;
  }

  pass(`OrderRejectedError survived the action channel: dropped ${openIds[0]}, opened fresh ${openIds[1]}`);
});

/**
 * VERDICT: OrderDeletedError из callbacks.onOrderCheck (action-канал) —
 * немедленное терминальное закрытие, минуя толерантность (дефолт 5).
 */
test("VERDICT: OrderDeletedError thrown from action onOrderCheck closes immediately through the action channel", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-action-deleted-strategy",
    exchangeName: "binance-verdict-action-deleted",
    frameName: "",
  };

  let checkCalls = 0;

  makeExchange(context.exchangeName, () => 50000);

  class EmptyAction {}
  addActionSchema({
    actionName: "verdict-action-deleted-action",
    handler: EmptyAction,
    callbacks: {
      onOrderCheck: () => {
        checkCalls += 1;
        throw new OrderDeletedError("verdict: action confirms the order is gone");
      },
    },
  });

  const basePrice = 50000;
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    actions: ["verdict-action-deleted-action"],
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "verdict action deleted",
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`tick #1 expected "opened", got "${tick1.action}"`);
    return;
  }

  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "closed" || tick2.closeReason !== "closed") {
    fail(`tick #2 expected IMMEDIATE closed/"closed" (deleted via action, tolerance bypassed), got "${tick2.action}"/"${tick2.closeReason}"`);
    return;
  }
  if (checkCalls !== 1) {
    fail(`expected exactly 1 check call, got ${checkCalls}`);
    return;
  }

  pass(`OrderDeletedError survived the action channel: closed on the first check (calls=${checkCalls})`);
});

/**
 * VERDICT: толерантность order-check — транзиентные сбои не закрывают позицию,
 * attempt растёт 0,1,2 и сбрасывается в 0 после успешного чека.
 */
test("VERDICT: transient check failures are tolerated and attempt resets on success", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-check-tolerate-strategy",
    exchangeName: "binance-verdict-check-tolerate",
    frameName: "",
  };

  const checkAttempts = [];

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: true });

  const unsubscribe = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    checkAttempts.push(event.attempt);
    // Чеки #1 и #2 падают транзиентно, #3 успешен, #4 снова видит attempt=0
    if (checkAttempts.length <= 2) {
      throw new Error("verdict: transient network failure on check");
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
        fail(`tick #${1 + i} expected "active" (transient check failures tolerated), got "${tick.action}"`);
        return;
      }
    }

    const attempts = checkAttempts.join(",");
    if (attempts !== "0,1,2,0") {
      fail(`expected check attempts "0,1,2,0" (reset after success), got "${attempts}"`);
      return;
    }

    pass(`checks tolerated 2 transient failures and reset: attempts ${attempts}`);
  } finally {
    unsubscribe();
  }
});

/**
 * VERDICT: исчерпание CC_ORDER_CHECK_RETRY_ATTEMPTS — после N последовательных
 * транзиентных сбоев чека позиция закрывается closed/"closed".
 */
test("VERDICT: exhausted check attempts close the position with reason closed", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CHECK_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-check-exhaust-strategy",
    exchangeName: "binance-verdict-check-exhaust",
    frameName: "",
  };

  const checkAttempts = [];

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: true });

  const unsubscribe = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    checkAttempts.push(event.attempt);
    throw new Error("verdict: check always fails");
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "active" || tick3.action !== "active") {
      fail(`ticks #2/#3 expected "active" (failures within tolerance), got "${tick2.action}"/"${tick3.action}"`);
      return;
    }

    // Сбой #3 превышает CC_ORDER_CHECK_RETRY_ATTEMPTS=2 → терминальное закрытие
    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "closed") {
      fail(`tick #4 expected closed/"closed" (check attempts exhausted), got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }

    if (checkAttempts.join(",") !== "0,1,2") {
      fail(`expected check attempts "0,1,2", got "${checkAttempts.join(",")}"`);
      return;
    }

    pass(`position closed after exhausting 2 tolerated check failures (attempts ${checkAttempts.join(",")})`);
  } finally {
    unsubscribe();
  }
});

/**
 * VERDICT: OrderDeletedError в чеке — подтверждённый not-found, терминальное
 * закрытие СРАЗУ, минуя толерантность (дефолт CC_ORDER_CHECK_RETRY_ATTEMPTS=5).
 */
test("VERDICT: OrderDeletedError on check closes immediately bypassing tolerance", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "verdict-check-deleted-strategy",
    exchangeName: "binance-verdict-check-deleted",
    frameName: "",
  };

  let checkCalls = 0;

  makeExchange(context.exchangeName, () => 50000);
  makeStrategy(context, { minuteEstimatedTime: 120, once: true });

  const unsubscribe = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    checkCalls += 1;
    throw new OrderDeletedError("verdict: user deleted the order manually");
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "closed") {
      fail(`tick #2 expected IMMEDIATE closed/"closed" (confirmed not-found), got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (checkCalls !== 1) {
      fail(`expected exactly 1 check call (terminal, no tolerance), got ${checkCalls}`);
      return;
    }

    pass(`OrderDeletedError closed the position on the first check (calls=${checkCalls})`);
  } finally {
    unsubscribe();
  }
});

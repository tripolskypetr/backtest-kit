import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  setConfig,
  listenExit,
  Broker,
  OrderRejectedError,
  OrderDeletedError,
  OrderTransientError,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// attempt-счётчики и триада типизированных ошибок ЧЕРЕЗ Broker-адаптер:
// проверяем именно канал Broker.useBrokerAdapter → enable() → payload.attempt
// (маппинг event.attempt в BrokerOrder*Payload) для всех четырёх хуков:
// onOrderOpenCommit (type active/schedule), onOrderCloseCommit,
// onOrderActiveCheck, onOrderScheduleCheck.

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

/** listenExit-хендлер queued-асинхронный — даём ему такт перед ассертом */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/**
 * BROKER ATTEMPT: onOrderOpenCommit (type "active") видит attempt 0,1,2 при
 * identity-stable ретрае — payload.attempt промаплен из event.attempt, id стабилен.
 */
test("BROKER ATTEMPT: active open carries attempt 0,1,2 with a stable signalId", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brk-att-open-strategy",
    exchangeName: "binance-brk-att-open",
    frameName: "",
  };

  const opens = [];

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "brk att open",
      priceTakeProfit: basePrice + 15000,
      priceStopLoss: basePrice - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      opens.push({ id: payload.signalId, attempt: payload.attempt });
      if (opens.length <= 2) {
        throw new OrderTransientError("brk: exchange unreachable");
      }
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));

    if (tick1.action !== "idle" || tick2.action !== "idle" || tick3.action !== "opened") {
      fail(`expected idle, idle, opened — got ${tick1.action}, ${tick2.action}, ${tick3.action}`);
      return;
    }
    const attempts = opens.map(({ attempt }) => attempt).join(",");
    if (attempts !== "0,1,2") {
      fail(`adapter must see attempts "0,1,2", got "${attempts}"`);
      return;
    }
    if (new Set(opens.map(({ id }) => id)).size !== 1) {
      fail(`adapter must see the SAME signalId across retries, got ${JSON.stringify(opens)}`);
      return;
    }
    if (tick3.signal.id !== opens[0].id) {
      fail(`opened id "${tick3.signal.id}" must equal the retried id "${opens[0].id}"`);
      return;
    }

    pass(`adapter saw open attempts 0,1,2 with stable id ${opens[0].id}`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER ATTEMPT: onOrderOpenCommit (type "schedule") — размещение resting-ордера
 * тоже ретраится identity-stable с attempt 0,1,2.
 */
test("BROKER ATTEMPT: schedule placement carries attempt 0,1,2 with a stable signalId", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brk-att-place-strategy",
    exchangeName: "binance-brk-att-place",
    frameName: "",
  };

  const placements = [];

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "brk att place",
      priceOpen,
      priceTakeProfit: priceOpen + 4000,
      priceStopLoss: priceOpen - 2000,
      minuteEstimatedTime: 120,
    }),
  });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "schedule") return;
      placements.push({ id: payload.signalId, attempt: payload.attempt });
      if (placements.length <= 2) {
        throw new OrderTransientError("brk: resting order placement timed out");
      }
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));

    if (tick1.action !== "idle" || tick2.action !== "idle" || tick3.action !== "scheduled") {
      fail(`expected idle, idle, scheduled — got ${tick1.action}, ${tick2.action}, ${tick3.action}`);
      return;
    }
    const attempts = placements.map(({ attempt }) => attempt).join(",");
    if (attempts !== "0,1,2") {
      fail(`adapter must see placement attempts "0,1,2", got "${attempts}"`);
      return;
    }
    if (new Set(placements.map(({ id }) => id)).size !== 1) {
      fail(`adapter must see the SAME signalId across placement retries, got ${JSON.stringify(placements)}`);
      return;
    }

    pass(`adapter saw placement attempts 0,1,2 with stable id ${placements[0].id}`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER ATTEMPT: OrderRejectedError из onOrderOpenCommit — терминальный дроп:
 * следующая попытка приходит со СВЕЖИМ id и attempt снова 0.
 */
test("BROKER ATTEMPT: OrderRejectedError from onOrderOpenCommit resets to a fresh id with attempt 0", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brk-att-reject-strategy",
    exchangeName: "binance-brk-att-reject",
    frameName: "",
  };

  const opens = [];

  makeExchange(context.exchangeName, () => basePrice);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "brk att reject",
      priceTakeProfit: basePrice + 15000,
      priceStopLoss: basePrice - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      opens.push({ id: payload.signalId, attempt: payload.attempt });
      if (opens.length === 1) {
        throw new OrderRejectedError("brk: min notional violated");
      }
    },
  });
  Broker.enable();

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
    if (opens.length !== 2 || opens[0].id === opens[1].id) {
      fail(`terminal rejection must NOT arm the retry — expected a fresh id, got ${JSON.stringify(opens)}`);
      return;
    }
    if (opens[0].attempt !== 0 || opens[1].attempt !== 0) {
      fail(`both attempts must be 0 (no retry accounting across a terminal drop), got ${JSON.stringify(opens)}`);
      return;
    }

    pass(`terminal rejection dropped ${opens[0].id}, fresh ${opens[1].id} opened with attempt 0`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER ATTEMPT: onOrderCloseCommit видит attempt 0,1,2 при транзиентных отказах
 * закрытия; позиция живёт между попытками, закрытие подтверждается на третьей.
 */
test("BROKER ATTEMPT: close gate carries attempt 0,1,2 and closes on confirm", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brk-att-close-strategy",
    exchangeName: "binance-brk-att-close",
    frameName: "",
  };

  const closes = [];
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
        note: "brk att close",
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime: 1,
      };
    },
  });

  Broker.useBrokerAdapter({
    onOrderCloseCommit: async (payload) => {
      closes.push({ id: payload.signalId, attempt: payload.attempt });
      if (closes.length <= 2) {
        throw new OrderTransientError("brk: exit not filled");
      }
    },
  });
  Broker.enable();

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
      fail(`ticks #2/#3 expected "active" (close rejected, position kept), got "${tick2.action}"/"${tick3.action}"`);
      return;
    }

    const tick4 = await runTick(new Date(t0 + 4 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "time_expired") {
      fail(`tick #4 expected closed/time_expired, got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }

    const attempts = closes.map(({ attempt }) => attempt).join(",");
    if (attempts !== "0,1,2") {
      fail(`adapter must see close attempts "0,1,2", got "${attempts}"`);
      return;
    }
    if (new Set(closes.map(({ id }) => id)).size !== 1) {
      fail(`close attempts must carry the same signalId, got ${JSON.stringify(closes)}`);
      return;
    }

    pass(`adapter saw close attempts 0,1,2 and the position closed time_expired on confirm`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER ATTEMPT: исчерпание close-ретраев через адаптер — force-close с исходным
 * closeReason + ровно один фатальный exit; адаптер видит attempts 0,1,2.
 */
test("BROKER ATTEMPT: close exhaustion through the adapter force-closes and signals fatal exit", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CLOSE_RETRY_ATTEMPTS: 2 }, true);

  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brk-att-close-exhaust-strategy",
    exchangeName: "binance-brk-att-close-exhaust",
    frameName: "",
  };

  const closeAttempts = [];
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
        note: "brk att close exhaust",
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime: 1,
      };
    },
  });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });

  Broker.useBrokerAdapter({
    onOrderCloseCommit: async (payload) => {
      closeAttempts.push(payload.attempt);
      throw new OrderTransientError("brk: exchange down");
    },
  });
  Broker.enable();

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

    const tick4 = await runTick(new Date(t0 + 4 * MIN));
    if (tick4.action !== "closed" || tick4.closeReason !== "time_expired") {
      fail(`tick #4 expected FORCED closed/time_expired, got "${tick4.action}"/"${tick4.closeReason}"`);
      return;
    }

    if (closeAttempts.join(",") !== "0,1,2") {
      fail(`adapter must see close attempts "0,1,2", got "${closeAttempts.join(",")}"`);
      return;
    }

    await settle();
    if (exitCount !== 1) {
      fail(`network exhaustion of the close must signal fatal exit exactly once, got ${exitCount}`);
      return;
    }

    pass(`adapter-driven close exhaustion force-closed (attempts ${closeAttempts.join(",")}), fatal exit signaled`);
  } finally {
    Broker.disable();
    unsubscribeExit();
  }
});

/**
 * BROKER ATTEMPT: onOrderActiveCheck — транзиентные сбои терпятся, attempt растёт
 * 0,1,2 и сбрасывается в 0 после успешного чека; позиция живёт всё время.
 */
test("BROKER ATTEMPT: active check tolerates transient failures and resets attempt on success", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brk-att-check-strategy",
    exchangeName: "binance-brk-att-check",
    frameName: "",
  };

  const checkAttempts = [];
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
        note: "brk att check",
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime: 120,
      };
    },
  });

  Broker.useBrokerAdapter({
    onOrderActiveCheck: async (payload) => {
      checkAttempts.push(payload.attempt);
      // Чеки #1 и #2 падают транзиентно, #3 успешен, #4 снова видит attempt=0
      if (checkAttempts.length <= 2) {
        throw new OrderTransientError("brk: exchange unreachable");
      }
    },
  });
  Broker.enable();

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
      fail(`adapter must see check attempts "0,1,2,0" (reset after success), got "${attempts}"`);
      return;
    }

    pass(`adapter saw check attempts ${attempts}: 2 transient failures tolerated, streak reset on success`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER ATTEMPT: OrderDeletedError из onOrderActiveCheck — мгновенное закрытие
 * closed/"closed" на первом же чеке (attempt 0), толерантность не участвует.
 */
test("BROKER ATTEMPT: OrderDeletedError from onOrderActiveCheck closes at once with attempt 0", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brk-att-deleted-strategy",
    exchangeName: "binance-brk-att-deleted",
    frameName: "",
  };

  const checkAttempts = [];
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
        note: "brk att deleted",
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime: 120,
      };
    },
  });

  Broker.useBrokerAdapter({
    onOrderActiveCheck: async (payload) => {
      checkAttempts.push(payload.attempt);
      throw new OrderDeletedError(`brk: order ${payload.signalId} not found`);
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "closed") {
      fail(`tick #2 expected IMMEDIATE closed/"closed", got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (checkAttempts.length !== 1 || checkAttempts[0] !== 0) {
      fail(`expected a single check with attempt 0 (tolerance bypassed), got ${JSON.stringify(checkAttempts)}`);
      return;
    }

    pass(`OrderDeletedError closed the position on the first check (attempt 0)`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER ATTEMPT: исчерпание толерантности onOrderScheduleCheck — resting-ордер
 * отменяется cancelled/"user" после attempts 0,1,2 + ровно один фатальный exit.
 */
test("BROKER ATTEMPT: schedule check exhaustion cancels the resting order and signals fatal exit", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_CHECK_RETRY_ATTEMPTS: 2 }, true);

  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "brk-att-sched-exhaust-strategy",
    exchangeName: "binance-brk-att-sched-exhaust",
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
        note: "brk att sched exhaust",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });

  Broker.useBrokerAdapter({
    onOrderScheduleCheck: async (payload) => {
      checkAttempts.push(payload.attempt);
      throw new OrderTransientError("brk: exchange down");
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "waiting" || tick3.action !== "waiting") {
      fail(`ticks #2/#3 expected "waiting" (failures within tolerance), got "${tick2.action}"/"${tick3.action}"`);
      return;
    }

    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "cancelled" || tick4.reason !== "user") {
      fail(`tick #4 expected cancelled/"user" (check attempts exhausted), got "${tick4.action}"/"${tick4.reason}"`);
      return;
    }

    if (checkAttempts.join(",") !== "0,1,2") {
      fail(`adapter must see schedule-check attempts "0,1,2", got "${checkAttempts.join(",")}"`);
      return;
    }

    await settle();
    if (exitCount !== 1) {
      fail(`network exhaustion of the schedule check must signal fatal exit exactly once, got ${exitCount}`);
      return;
    }

    pass(`schedule check exhausted (attempts ${checkAttempts.join(",")}): cancelled/"user", fatal exit signaled`);
  } finally {
    Broker.disable();
    unsubscribeExit();
  }
});

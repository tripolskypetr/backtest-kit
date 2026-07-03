import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Broker,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

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
          timestamp: alignedSince + i * 60000,
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

/**
 * BROKER #1: полный роутинг жизненного цикла scheduled→активация→TP через адаптер.
 *
 * Проверяет, что каждый этап доходит до СВОЕГО метода IBroker в правильном порядке:
 * onSignalOpenCommit(type "schedule") [размещение лимитника, гейт] →
 * onSignalScheduleOpen [scheduled зарегистрирован] →
 * onOrderCheck(type "schedule") [пинг resting-ордера] →
 * onSignalOpenCommit(type "active") [филл активации, гейт] →
 * onSignalPendingOpen [позиция открыта] →
 * onOrderCheck(type "active") [пинг позиции] →
 * onSignalCloseCommit [гейт закрытия TP] →
 * onSignalPendingClose(closeReason "take_profit").
 */
test("BROKER: full scheduled lifecycle routes every stage to the adapter in order", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "broker-lifecycle-strategy",
    exchangeName: "binance-broker-lifecycle",
    frameName: "",
  };

  let marketPrice = basePrice;
  let signalGenerated = false;
  const calls = [];

  makeExchange(context.exchangeName, () => marketPrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "broker lifecycle",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const record = (m, extra = {}) => calls.push({ m, ...extra });

  Broker.useBrokerAdapter({
    onSignalOpenCommit: async (p) => record("openCommit", { type: p.type, signalId: p.signalId }),
    onSignalCloseCommit: async (p) => record("closeCommit", { signalId: p.signalId }),
    onOrderCheck: async (p) => record("orderCheck", { type: p.type, signalId: p.signalId }),
    onSignalScheduleOpen: async (p) => record("scheduleOpen", { signalId: p.signalId }),
    onSignalScheduleCancelled: async (p) => record("scheduleCancelled", { reason: p.reason }),
    onSignalPendingOpen: async (p) => record("pendingOpen", { signalId: p.signalId }),
    onSignalPendingClose: async (p) => record("pendingClose", { closeReason: p.closeReason }),
  });
  Broker.enable();

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

    marketPrice = priceOpen;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (activation), got "${tick2.action}"`);
      return;
    }

    marketPrice = basePrice; // VWAP 50000 >= TP 44000 → take_profit
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "take_profit") {
      fail(`tick #3 expected closed/take_profit, got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }

    const milestones = [
      (c) => c.m === "openCommit" && c.type === "schedule",
      (c) => c.m === "scheduleOpen",
      (c) => c.m === "orderCheck" && c.type === "schedule",
      (c) => c.m === "openCommit" && c.type === "active",
      (c) => c.m === "pendingOpen",
      (c) => c.m === "orderCheck" && c.type === "active",
      (c) => c.m === "closeCommit",
      (c) => c.m === "pendingClose" && c.closeReason === "take_profit",
    ];
    let cursor = -1;
    for (let i = 0; i < milestones.length; i++) {
      const idx = calls.findIndex((c, j) => j > cursor && milestones[i](c));
      if (idx === -1) {
        fail(`milestone #${i} not found after index ${cursor}: calls=${JSON.stringify(calls)}`);
        return;
      }
      cursor = idx;
    }

    if (calls.some((c) => c.m === "scheduleCancelled")) {
      fail(`unexpected scheduleCancelled in a fully successful lifecycle: ${JSON.stringify(calls)}`);
      return;
    }

    const ids = new Set(calls.filter((c) => c.signalId).map((c) => c.signalId));
    if (ids.size !== 1) {
      fail(`all adapter calls must carry the same signalId, got ${JSON.stringify([...ids])}`);
      return;
    }

    pass(`adapter received all 8 lifecycle milestones in order (${calls.length} calls total)`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER #2: адаптер как ГЕЙТ — throw в onSignalOpenCommit отвергает размещение
 * (scheduled не регистрируется, onSignalScheduleOpen НЕ вызывается, ретрай на
 * следующем tick), а throw в onOrderCheck (type "schedule") отменяет scheduled,
 * и сам адаптер получает onSignalScheduleCancelled (reason "user").
 */
test("BROKER: adapter throw gates placement and order-check cancels back into the adapter", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const MIN = 60_000;

  const context = {
    strategyName: "broker-gate-strategy",
    exchangeName: "binance-broker-gate",
    frameName: "",
  };

  let placements = 0;
  let scheduleChecks = 0;
  let scheduleOpens = 0;
  const cancels = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      id: "broker-gate-id",
      position: "long",
      note: "broker gate",
      priceOpen,
      priceTakeProfit: priceOpen + 4000,
      priceStopLoss: priceOpen - 2000,
      minuteEstimatedTime: 120,
    }),
  });

  Broker.useBrokerAdapter({
    onSignalOpenCommit: async (p) => {
      if (p.type !== "schedule") return;
      placements += 1;
      if (placements === 1) {
        throw new Error("broker: exchange rejected resting order");
      }
    },
    onOrderCheck: async (p) => {
      if (p.type !== "schedule") return;
      scheduleChecks += 1;
      throw new Error("broker: resting order not found");
    },
    onSignalScheduleOpen: async () => {
      scheduleOpens += 1;
    },
    onSignalScheduleCancelled: async (p) => {
      cancels.push({ reason: p.reason, signalId: p.signalId });
    },
  });
  Broker.enable();

  try {
    const runTick = (when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    // tick #1: размещение отвергнуто адаптером
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (adapter rejected placement), got "${tick1.action}"`);
      return;
    }
    if (scheduleOpens !== 0) {
      fail(`REGRESSION: onSignalScheduleOpen fired for a REJECTED placement (${scheduleOpens})`);
      return;
    }

    // tick #2: размещение принято (откат троттла)
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "scheduled") {
      fail(`tick #2 expected "scheduled" (placement retry), got "${tick2.action}"`);
      return;
    }
    if (scheduleOpens !== 1) {
      fail(`expected exactly 1 onSignalScheduleOpen after accepted placement, got ${scheduleOpens}`);
      return;
    }

    // tick #3: onOrderCheck(schedule) бросает → отмена, адаптер уведомлён
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "cancelled" || tick3.reason !== "user") {
      fail(`tick #3 expected cancelled/user (adapter order-check failed), got "${tick3.action}"/"${tick3.reason}"`);
      return;
    }

    if (placements !== 2 || scheduleChecks !== 1) {
      fail(`adapter call counts mismatch: placements=${placements} (expected 2), scheduleChecks=${scheduleChecks} (expected 1)`);
      return;
    }
    if (cancels.length !== 1 || cancels[0].reason !== "user" || cancels[0].signalId !== "broker-gate-id") {
      fail(`expected exactly 1 onSignalScheduleCancelled(user, broker-gate-id), got ${JSON.stringify(cancels)}`);
      return;
    }

    pass(`adapter gated placement (retry worked) and its failed order-check cancelled back into onSignalScheduleCancelled`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER #3: в backtest адаптер ПОЛНОСТЬЮ молчит.
 *
 * Все commit*-методы скипают payload.backtest, а sync-гейты short-circuit'ятся
 * до syncSubject — прогон бектеста с включённым брокером не должен дать ни
 * одного вызова адаптера.
 */
test("BROKER: enabled adapter stays completely silent during backtest", async ({ pass, fail }) => {
  const basePrice = 50000;

  const context = {
    strategyName: "broker-silent-strategy",
    exchangeName: "binance-broker-silent",
    frameName: "30m-broker-silent",
  };

  let signalGenerated = false;
  let adapterCalls = 0;
  const results = [];

  makeExchange(context.exchangeName, () => basePrice);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "broker silent",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 5,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const count = async () => { adapterCalls += 1; };
  Broker.useBrokerAdapter({
    onSignalOpenCommit: count,
    onSignalCloseCommit: count,
    onOrderCheck: count,
    onSignalActivePing: count,
    onSignalSchedulePing: count,
    onSignalIdlePing: count,
    onSignalScheduleOpen: count,
    onSignalScheduleCancelled: count,
    onSignalPendingOpen: count,
    onSignalPendingClose: count,
  });
  Broker.enable();

  try {
    // Backtest.run — async-генератор: детерминированное завершение без done-слушателя
    for await (const result of Backtest.run("BTCUSDT", context)) {
      results.push(result);
    }

    if (adapterCalls !== 0) {
      fail(`REGRESSION: adapter received ${adapterCalls} calls during backtest — must be 0`);
      return;
    }
    if (!results.some((r) => r.action === "closed")) {
      fail(`backtest must produce a closed result to prove the run exercised the pipeline, got ${JSON.stringify(results.map((r) => r.action))}`);
      return;
    }

    pass(`backtest completed with enabled broker adapter and 0 adapter calls (${results.length} results)`);
  } finally {
    Broker.disable();
  }
});

/**
 * BROKER #4: enable-семантика.
 *
 * 1. enable() без адаптера бросает (и сбрасывает singleshot — повторный enable
 *    после регистрации работает).
 * 2. После enable события роутятся в адаптер.
 * 3. После disable() события НЕ роутятся, но фреймворк работает дальше
 *    (гейт без подписчиков пропускает размещение).
 */
test("BROKER: enable throws without adapter, disable detaches routing but framework continues", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 40000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const makeStrategy = (strategyName) => {
    addStrategySchema({
      strategyName,
      interval: "1m",
      getSignal: async () => ({
        position: "long",
        note: strategyName,
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      }),
    });
  };

  const contextA = {
    strategyName: "broker-enable-a-strategy",
    exchangeName: "binance-broker-enable",
    frameName: "",
  };
  const contextB = {
    strategyName: "broker-enable-b-strategy",
    exchangeName: "binance-broker-enable",
    frameName: "",
  };

  makeExchange(contextA.exchangeName, () => basePrice);
  makeStrategy(contextA.strategyName);
  makeStrategy(contextB.strategyName);

  const placementsByStrategy = {};

  // 1. enable без адаптера — throw
  let threw = false;
  try {
    Broker.enable();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    Broker.disable();
    fail("Broker.enable() without adapter must throw");
    return;
  }

  Broker.useBrokerAdapter({
    onSignalOpenCommit: async (p) => {
      if (p.type !== "schedule") return;
      placementsByStrategy[p.context.strategyName] =
        (placementsByStrategy[p.context.strategyName] ?? 0) + 1;
    },
  });
  Broker.enable();

  try {
    const runTick = (context, when) =>
      MethodContextService.runInContext(
        async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
        context,
      );

    // 2. enabled: размещение стратегии A доходит до адаптера
    const tickA = await runTick(contextA, new Date(t0));
    if (tickA.action !== "scheduled") {
      fail(`strategy A tick expected "scheduled", got "${tickA.action}"`);
      return;
    }
    if ((placementsByStrategy[contextA.strategyName] ?? 0) !== 1) {
      fail(`expected 1 routed placement for strategy A, got ${JSON.stringify(placementsByStrategy)}`);
      return;
    }

    // 3. disable: стратегия B работает, но адаптер молчит
    Broker.disable();

    const tickB = await runTick(contextB, new Date(t0));
    if (tickB.action !== "scheduled") {
      fail(`strategy B tick after disable expected "scheduled" (framework must keep working), got "${tickB.action}"`);
      return;
    }
    if (placementsByStrategy[contextB.strategyName] !== undefined) {
      fail(`REGRESSION: adapter received strategy B placement AFTER disable: ${JSON.stringify(placementsByStrategy)}`);
      return;
    }

    pass(`enable threw without adapter, routed while enabled, detached after disable (framework kept working)`);
  } finally {
    Broker.disable();
  }
});

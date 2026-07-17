import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addActionSchema,
  setConfig,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Идемпотентный ретрай open-гейта (CC_ORDER_OPEN_RETRY_ATTEMPTS): отклонённый
// брокером open повторяется с ТЕМ ЖЕ signalId (clientOrderId-идемпотентность на
// стороне адаптера — потерянный ответ на исполненный ордер реконсилируется
// вместо повторной покупки, REPORT №10). Счётчик попыток персистится по
// signalId и переживает крэш; при 0 слот не используется (legacy-поведение).

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

/**
 * RETRY: отклонённый гейтом open повторяется следующим tick с ТЕМ ЖЕ signalId.
 * getSignal НЕ вызывается повторно (id не регенерируется) — без фикса второй
 * tick открывал бы позицию с новым случайным id, ломая clientOrderId-идемпотентность.
 */
test("RETRY: gate-rejected open retries with the SAME signalId on the next tick", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "retry-sameid-strategy",
    exchangeName: "binance-retry-sameid",
    frameName: "",
  };

  const gateIds = [];
  let getSignalCalls = 0;

  makeExchange(context.exchangeName, () => basePrice);

  class EmptyAction {}
  addActionSchema({
    actionName: "retry-sameid-action",
    handler: EmptyAction,
    callbacks: {
      onOrderSync: (event) => {
        if (event.action !== "signal-open" || event.type !== "active") return;
        gateIds.push(event.signalId);
        if (gateIds.length === 1) {
          throw new Error("retry-sameid: broker lost the response");
        }
      },
    },
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    actions: ["retry-sameid-action"],
    // Без явного id: каждый вызов getSignal породил бы НОВЫЙ randomString-id —
    // ретрай обязан прийти из слота, а не из повторной генерации.
    getSignal: async () => {
      getSignalCalls += 1;
      return {
        position: "long",
        note: "retry sameid",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "idle") {
    fail(`tick #1 expected "idle" (gate rejected the open), got "${tick1.action}"`);
    return;
  }

  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "opened") {
    fail(`tick #2 expected "opened" (identity-stable retry), got "${tick2.action}"`);
    return;
  }
  if (gateIds.length !== 2) {
    fail(`expected 2 gate calls (reject + accept), got ${gateIds.length}`);
    return;
  }
  if (gateIds[0] !== gateIds[1]) {
    fail(`REGRESSION: retry regenerated the signal id — gate saw "${gateIds[0]}" then "${gateIds[1]}" (clientOrderId idempotency broken)`);
    return;
  }
  if (tick2.signal.id !== gateIds[0]) {
    fail(`opened signal id "${tick2.signal.id}" does not match the rejected attempt id "${gateIds[0]}"`);
    return;
  }
  if (getSignalCalls !== 1) {
    fail(`expected getSignal to be called once (retry consumes the slot), got ${getSignalCalls}`);
    return;
  }

  pass(`gate-rejected open retried with the same id "${gateIds[0]}" and opened (getSignal calls=${getSignalCalls})`);
});

/**
 * RETRY: исчерпание CC_ORDER_OPEN_RETRY_ATTEMPTS — после N ретраев того же id
 * слот громко дропается и генерация возобновляется со СВЕЖИМ id.
 */
test("RETRY: exhausted attempts drop the row and generation resumes with a fresh id", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 2 }, true);

  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "retry-exhaust-strategy",
    exchangeName: "binance-retry-exhaust",
    frameName: "",
  };

  const gateIds = [];
  let getSignalCalls = 0;

  makeExchange(context.exchangeName, () => basePrice);

  class EmptyAction {}
  addActionSchema({
    actionName: "retry-exhaust-action",
    handler: EmptyAction,
    callbacks: {
      onOrderSync: (event) => {
        if (event.action !== "signal-open" || event.type !== "active") return;
        gateIds.push(event.signalId);
        throw new Error("retry-exhaust: broker always rejects");
      },
    },
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    actions: ["retry-exhaust-action"],
    getSignal: async () => {
      getSignalCalls += 1;
      return {
        position: "long",
        note: "retry exhaust",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const runTick = makeRunTick(context);

  // tick1: исходная попытка (id A, отказ №1) → стэш
  // tick2: ретрай №1 (id A, отказ №2) → стэш
  // tick3: ретрай №2 (id A, отказ №3 > 2) → исчерпание, дроп
  // tick4: свежая генерация (id B, отказ №1 нового id)
  for (let i = 0; i < 4; i++) {
    const tick = await runTick(new Date(t0 + i * MIN));
    if (tick.action !== "idle") {
      fail(`tick #${i + 1} expected "idle" (gate always rejects), got "${tick.action}"`);
      return;
    }
  }

  if (gateIds.length !== 4) {
    fail(`expected 4 gate calls (1 initial + 2 retries + 1 fresh), got ${gateIds.length}`);
    return;
  }
  if (gateIds[0] !== gateIds[1] || gateIds[1] !== gateIds[2]) {
    fail(`attempts 1..3 must carry the same id, got [${gateIds.join(", ")}]`);
    return;
  }
  if (gateIds[3] === gateIds[0]) {
    fail(`attempt 4 must carry a FRESH id after exhaustion, got the same "${gateIds[3]}"`);
    return;
  }
  if (getSignalCalls !== 2) {
    fail(`expected getSignal calls only for initial + post-exhaustion generation (2), got ${getSignalCalls}`);
    return;
  }

  pass(`same id for 1+2 attempts, fresh id after exhaustion: [${gateIds.join(", ")}]`);
});

/**
 * RETRY: CC_ORDER_OPEN_RETRY_ATTEMPTS = 0 — слот не используется, каждая
 * попытка регенерируется с новым id (legacy drop-and-regenerate).
 */
test("RETRY: zero attempts disable the slot — every rejected open regenerates a fresh id", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 0 }, true);

  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "retry-disabled-strategy",
    exchangeName: "binance-retry-disabled",
    frameName: "",
  };

  const gateIds = [];
  let getSignalCalls = 0;

  makeExchange(context.exchangeName, () => basePrice);

  class EmptyAction {}
  addActionSchema({
    actionName: "retry-disabled-action",
    handler: EmptyAction,
    callbacks: {
      onOrderSync: (event) => {
        if (event.action !== "signal-open" || event.type !== "active") return;
        gateIds.push(event.signalId);
        throw new Error("retry-disabled: broker always rejects");
      },
    },
  });

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    actions: ["retry-disabled-action"],
    getSignal: async () => {
      getSignalCalls += 1;
      return {
        position: "long",
        note: "retry disabled",
        priceTakeProfit: basePrice + 5000,
        priceStopLoss: basePrice - 5000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick1.action !== "idle" || tick2.action !== "idle") {
    fail(`expected both ticks "idle", got "${tick1.action}" / "${tick2.action}"`);
    return;
  }
  if (gateIds.length !== 2) {
    fail(`expected 2 gate calls, got ${gateIds.length}`);
    return;
  }
  if (gateIds[0] === gateIds[1]) {
    fail(`with retries disabled ids must differ (fresh generation), got the same "${gateIds[0]}"`);
    return;
  }
  if (getSignalCalls !== 2) {
    fail(`with retries disabled getSignal must run every tick, got ${getSignalCalls} calls`);
    return;
  }

  pass(`retries disabled: fresh id per attempt [${gateIds.join(", ")}]`);
});

/**
 * RETRY: персистентность попыток по signalId — вооружённый слот и счётчик
 * пишутся в StrategyData, переживают крэш (dispose + новый инстанс) и ретраят
 * ТОТ ЖЕ id после рестарта; успешный open зачищает слот в снапшоте.
 */
test("RETRY: armed slot and per-signalId counter survive a crash and clear on success", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "retry-persist-strategy",
    exchangeName: "binance-retry-persist",
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
      },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const gateIds = [];
    let getSignalCalls = 0;

    makeExchange(context.exchangeName, () => basePrice);

    class EmptyAction {}
    addActionSchema({
      actionName: "retry-persist-action",
      handler: EmptyAction,
      callbacks: {
        onOrderSync: (event) => {
          if (event.action !== "signal-open" || event.type !== "active") return;
          gateIds.push(event.signalId);
          if (gateIds.length === 1) {
            throw new Error("retry-persist: broker lost the response");
          }
        },
      },
    });

    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      actions: ["retry-persist-action"],
      getSignal: async () => {
        getSignalCalls += 1;
        return {
          position: "long",
          note: "retry persist",
          priceTakeProfit: basePrice + 5000,
          priceStopLoss: basePrice - 5000,
          minuteEstimatedTime: 120,
        };
      },
    });

    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (gate rejected the open), got "${tick1.action}"`);
      return;
    }

    const armed = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
    if (!armed?.retryOpenSignal) {
      fail("persisted snapshot must carry the armed retryOpenSignal after the rejection");
      return;
    }
    if (armed.retryOpenSignal.id !== gateIds[0]) {
      fail(`persisted retryOpenSignal.id "${armed.retryOpenSignal.id}" must equal the rejected id "${gateIds[0]}"`);
      return;
    }
    if (armed.retryOpenCount !== 1) {
      fail(`persisted retryOpenCount must be 1 after the first rejection, got ${armed.retryOpenCount}`);
      return;
    }

    // «Крэш»: голый dispose инстанса — новый инстанс восстановит слот в waitForInit
    await lib.strategyConnectionService.clear({
      symbol: "BTCUSDT",
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: false,
    });

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 after crash expected "opened" (restored retry), got "${tick2.action}"`);
      return;
    }
    if (gateIds.length !== 2 || gateIds[0] !== gateIds[1]) {
      fail(`REGRESSION: restored retry must carry the same id, gate saw [${gateIds.join(", ")}]`);
      return;
    }
    if (getSignalCalls !== 1) {
      fail(`getSignal must not regenerate after the crash (restored slot wins), got ${getSignalCalls} calls`);
      return;
    }

    const cleared = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
    if (cleared?.retryOpenSignal !== null || cleared?.retryOpenCount !== 0) {
      fail(`successful open must wipe the persisted slot, got retryOpenSignal=${JSON.stringify(cleared?.retryOpenSignal)} retryOpenCount=${cleared?.retryOpenCount}`);
      return;
    }

    pass(`armed slot persisted (id=${gateIds[0]}, count=1), survived the crash, opened with the same id, wiped on success`);
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

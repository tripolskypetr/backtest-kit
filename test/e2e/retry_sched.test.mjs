import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  setConfig,
  listenSync,
  listenCheck,
  listenExit,
  OrderRejectedError,
  OrderDeletedError,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Scheduled-ветка адаптивного брокера (type "schedule" open-гейта + schedule-чек):
// - размещение resting-ордера ретраится identity-stable с исчерпанием и exit;
// - OrderRejectedError на размещении — терминальный дроп без взвода слота;
// - вооружённый слот размещения персистится, переживает крэш и клэмпится до 1;
// - OrderDeletedError в schedule-чеке — мгновенный cancel "user" мимо толерантности;
// - успешная активация после ретраев размещения идёт с attempt 0 (слот зачищен).

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

const BASE_PRICE = 50000;
const PRICE_OPEN = 40000;

const makeScheduledStrategy = (context, { once, onIssue } = {}) => {
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (once && issued) return null;
      issued = true;
      onIssue?.();
      return {
        position: "long",
        note: "retry sched",
        priceOpen: PRICE_OPEN,
        priceTakeProfit: PRICE_OPEN + 4000,
        priceStopLoss: PRICE_OPEN - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });
};

/**
 * SCHED RETRY: исчерпание размещения resting-ордера — attempts 0,1,2 того же id,
 * затем громкий дроп с фатальным exit и свежая генерация (id B, attempt 0).
 */
test("SCHED RETRY: exhausted placement attempts drop the row and resume with a fresh id", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "sched-exhaust-strategy",
    exchangeName: "binance-sched-exhaust",
    frameName: "",
  };

  const placements = [];
  let getSignalCalls = 0;
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeScheduledStrategy(context, { onIssue: () => { getSignalCalls += 1; } });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "schedule") return;
    placements.push({ id: event.signalId, attempt: event.attempt });
    throw new Error("sched-exhaust: placement always rejected");
  }, true);

  try {
    const runTick = makeRunTick(context);

    // tick1: id A, attempt 0; tick2: A, 1; tick3: A, 2; tick4: исчерпание → дроп + свежий B, attempt 0
    for (let i = 0; i < 4; i++) {
      const tick = await runTick(new Date(t0 + i * MIN));
      if (tick.action !== "idle") {
        fail(`tick #${i + 1} expected "idle" (placement always rejected), got "${tick.action}"`);
        return;
      }
    }

    if (placements.length !== 4) {
      fail(`expected 4 placement gate calls, got ${placements.length}`);
      return;
    }
    const ids = placements.map(({ id }) => id);
    if (ids[0] !== ids[1] || ids[1] !== ids[2]) {
      fail(`placement retries must carry the same id, got [${ids.join(", ")}]`);
      return;
    }
    if (ids[3] === ids[0]) {
      fail(`post-exhaustion placement must carry a FRESH id, got the same "${ids[3]}"`);
      return;
    }
    const attempts = placements.map(({ attempt }) => attempt).join(",");
    if (attempts !== "0,1,2,0") {
      fail(`expected placement attempts "0,1,2,0", got "${attempts}"`);
      return;
    }
    if (getSignalCalls !== 2) {
      fail(`expected getSignal calls only for initial + post-exhaustion generation (2), got ${getSignalCalls}`);
      return;
    }

    await settle();
    if (exitCount !== 1) {
      fail(`network exhaustion of the placement must signal fatal exit exactly once, got ${exitCount}`);
      return;
    }

    pass(`placement exhausted for ${ids[0]} (attempts 0,1,2), fresh ${ids[3]} with attempt 0, fatal exit signaled`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * SCHED RETRY: OrderRejectedError на размещении — терминальный дроп: слот НЕ
 * взводится, следующий tick размещает свежий id с attempt 0, без фатального exit.
 */
test("SCHED RETRY: OrderRejectedError on placement drops terminally without arming the retry", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "sched-terminal-strategy",
    exchangeName: "binance-sched-terminal",
    frameName: "",
  };

  const placements = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeScheduledStrategy(context, {});

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "schedule") return;
    placements.push({ id: event.signalId, attempt: event.attempt });
    if (placements.length === 1) {
      throw new OrderRejectedError("sched-terminal: resting order can never be placed");
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
    if (tick2.action !== "scheduled") {
      fail(`tick #2 expected "scheduled" (fresh signal placed), got "${tick2.action}"`);
      return;
    }
    if (placements.length !== 2 || placements[0].id === placements[1].id) {
      fail(`terminal rejection must NOT arm the retry — expected a fresh id, got ${JSON.stringify(placements)}`);
      return;
    }
    if (placements[0].attempt !== 0 || placements[1].attempt !== 0) {
      fail(`both placement attempts must be 0 (no accounting across a terminal drop), got ${JSON.stringify(placements)}`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`terminal business rejection must NOT signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`terminal placement rejection dropped ${placements[0].id}, fresh ${placements[1].id} scheduled with attempt 0`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * SCHED RETRY: вооружённый слот размещения персистится, переживает крэш и
 * КЛЭМПИТСЯ до 1 — после рестарта тот же id размещается с attempt 1 (не 2),
 * успех зачищает слот в снапшоте.
 */
test("SCHED RETRY: armed placement slot survives a crash with a clamped attempt and clears on success", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "sched-persist-strategy",
    exchangeName: "binance-sched-persist",
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
        retryCloseCount: 0,
      },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const placements = [];
    let getSignalCalls = 0;

    makeExchange(context.exchangeName, () => BASE_PRICE);
    makeScheduledStrategy(context, { onIssue: () => { getSignalCalls += 1; } });

    const unsubscribe = listenSync((event) => {
      if (event.strategyName !== context.strategyName) return;
      if (event.action !== "signal-open" || event.type !== "schedule") return;
      placements.push({ id: event.signalId, attempt: event.attempt });
      if (placements.length <= 2) {
        throw new Error("sched-persist: placement response lost");
      }
    }, true);

    try {
      const runTick = makeRunTick(context);

      const tick1 = await runTick(new Date(t0));
      const tick2 = await runTick(new Date(t0 + 1 * MIN));
      if (tick1.action !== "idle" || tick2.action !== "idle") {
        fail(`ticks #1/#2 expected "idle" (placement rejected twice), got "${tick1.action}"/"${tick2.action}"`);
        return;
      }

      const armed = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
      if (armed?.retryOpenSignal?.id !== placements[0].id || armed?.retryOpenCount !== 2) {
        fail(`persisted snapshot must carry the armed slot (id=${placements[0].id}, count=2), got id=${armed?.retryOpenSignal?.id} count=${armed?.retryOpenCount}`);
        return;
      }

      // «Крэш» посреди серии попыток размещения
      await lib.strategyConnectionService.clear({
        symbol: "BTCUSDT",
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: false,
      });

      const tick3 = await runTick(new Date(t0 + 2 * MIN));
      if (tick3.action !== "scheduled") {
        fail(`tick #3 after crash expected "scheduled" (restored retry accepted), got "${tick3.action}"`);
        return;
      }
      if (placements.length !== 3 || new Set(placements.map(({ id }) => id)).size !== 1) {
        fail(`restored placement retry must carry the same id, got ${JSON.stringify(placements)}`);
        return;
      }
      // Pre-arm инвариант + КЛЭМП: после крэша attempt = 1 (не 2) — бит «прошлое
      // размещение могло дойти» сохранён, серия отказов не сжигает свежий бюджет
      const attempts = placements.map(({ attempt }) => attempt).join(",");
      if (attempts !== "0,1,1") {
        fail(`placement attempts across the crash must be "0,1,1" (clamped), got "${attempts}"`);
        return;
      }
      if (getSignalCalls !== 1) {
        fail(`getSignal must not regenerate after the crash (restored slot wins), got ${getSignalCalls} calls`);
        return;
      }

      const cleared = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
      if (cleared?.retryOpenSignal !== null || cleared?.retryOpenCount !== 0) {
        fail(`successful placement must wipe the persisted slot, got retryOpenSignal=${JSON.stringify(cleared?.retryOpenSignal)} retryOpenCount=${cleared?.retryOpenCount}`);
        return;
      }

      pass(`placement slot persisted (id=${placements[0].id}), survived the crash with clamped attempt 1, wiped on success`);
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
 * SCHED RETRY: OrderDeletedError в schedule-чеке — подтверждённый not-found:
 * мгновенный cancel "user" на первом же чеке (attempt 0), толерантность
 * (дефолт CC_ORDER_CHECK_RETRY_ATTEMPTS=5) не участвует, фатального exit нет.
 */
test("SCHED RETRY: OrderDeletedError on the schedule check cancels immediately with attempt 0", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "sched-deleted-strategy",
    exchangeName: "binance-sched-deleted",
    frameName: "",
  };

  const checkAttempts = [];
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeScheduledStrategy(context, { once: true });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  const unsubscribe = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    checkAttempts.push(event.attempt);
    throw new OrderDeletedError("sched-deleted: resting order not found on the exchange");
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "scheduled") {
      fail(`tick #1 expected "scheduled", got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "cancelled" || tick2.reason !== "user") {
      fail(`tick #2 expected IMMEDIATE cancelled/"user" (confirmed not-found), got "${tick2.action}"/"${tick2.reason}"`);
      return;
    }
    if (checkAttempts.length !== 1 || checkAttempts[0] !== 0) {
      fail(`expected a single schedule check with attempt 0 (tolerance bypassed), got ${JSON.stringify(checkAttempts)}`);
      return;
    }

    await settle();
    if (exitCount !== 0) {
      fail(`confirmed not-found must NOT signal fatal exit, got ${exitCount}`);
      return;
    }

    pass(`OrderDeletedError cancelled the resting order on the first check (attempt 0), no fatal exit`);
  } finally {
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * SCHED RETRY: толерантность schedule-чека — транзиентные сбои не отменяют
 * resting-ордер, attempt растёт 0,1,2 и сбрасывается в 0 после успешного чека.
 */
test("SCHED RETRY: transient schedule-check failures are tolerated and attempt resets on success", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "sched-tolerate-strategy",
    exchangeName: "binance-sched-tolerate",
    frameName: "",
  };

  const checkAttempts = [];

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeScheduledStrategy(context, { once: true });

  const unsubscribe = listenCheck((event) => {
    if (event.strategyName !== context.strategyName) return;
    checkAttempts.push(event.attempt);
    // Чеки #1/#2 падают транзиентно, #3 успешен, #4 снова видит attempt=0
    if (checkAttempts.length <= 2) {
      throw new Error("sched-tolerate: transient network failure on the schedule check");
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
        fail(`tick #${1 + i} expected "waiting" (transient failures tolerated), got "${tick.action}"`);
        return;
      }
    }

    const attempts = checkAttempts.join(",");
    if (attempts !== "0,1,2,0") {
      fail(`expected schedule-check attempts "0,1,2,0" (reset after success), got "${attempts}"`);
      return;
    }

    pass(`schedule checks tolerated 2 transient failures and reset: attempts ${attempts}`);
  } finally {
    unsubscribe();
  }
});

/**
 * SCHED RETRY: успешное размещение после ретрая зачищает слот — последующая
 * АКТИВАЦИЯ (филл resting-ордера) идёт через open-гейт type "active" с attempt 0.
 */
test("SCHED RETRY: activation after placement retries carries attempt 0 (slot cleared on success)", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "sched-activate-strategy",
    exchangeName: "binance-sched-activate",
    frameName: "",
  };

  let px = BASE_PRICE;
  const gates = [];

  makeExchange(context.exchangeName, () => px);
  makeScheduledStrategy(context, { once: true });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open") return;
    gates.push({ type: event.type, attempt: event.attempt });
    if (event.type === "schedule" && gates.length === 1) {
      throw new Error("sched-activate: placement response lost");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (placement rejected), got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "scheduled") {
      fail(`tick #2 expected "scheduled" (placement retry accepted), got "${tick2.action}"`);
      return;
    }

    // Цена падает до priceOpen → resting-ордер филлится, активация через "active"-гейт
    px = PRICE_OPEN - 1000;
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "opened") {
      fail(`tick #3 expected "opened" (resting order filled), got "${tick3.action}"`);
      return;
    }

    const flat = gates.map(({ type, attempt }) => `${type}:${attempt}`).join(",");
    // Активация — отдельный путь вне retry-слота: attempt обязан быть 0
    if (flat !== "schedule:0,schedule:1,active:0") {
      fail(`expected gate sequence "schedule:0,schedule:1,active:0", got "${flat}"`);
      return;
    }

    pass(`placement retried (0,1), slot cleared, activation fired with attempt 0`);
  } finally {
    unsubscribe();
  }
});

/**
 * SCHED RETRY: потреблённый терминальным реджектом id ПЕРЕЖИВАЕТ рестарт —
 * lastPendingId персистится в strategy-снапшоте (DROP_RETRY_OPEN_SIGNAL_FN)
 * и восстанавливается в waitForInit ПОВЕРХ Recent-фолбэка. Без персиста каждый
 * рестарт процесса (супервизор после exitEmitter и т.п.) выдавал бы ещё один
 * реальный отклонённый ордер на тот же детерминированный id.
 */
test("SCHED RETRY: a terminally consumed deterministic id survives a crash (no extra real order per restart)", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "sched-consume-persist-strategy",
    exchangeName: "binance-sched-consume-persist",
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
      },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

    const gateEvents = [];

    makeExchange(context.exchangeName, () => BASE_PRICE);
    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => ({
        id: "sched-consume-persist-id",
        position: "long",
        note: "consume persist",
        priceTakeProfit: BASE_PRICE + 5000,
        priceStopLoss: BASE_PRICE - 5000,
        minuteEstimatedTime: 120,
      }),
    });

    const unsubscribe = listenSync((event) => {
      if (event.strategyName !== context.strategyName) return;
      if (event.action !== "signal-open" || event.type !== "active") return;
      gateEvents.push({ id: event.signalId, attempt: event.attempt });
      throw new OrderRejectedError("consume-persist: NOTIONAL — order can never be placed");
    }, true);

    try {
      const runTick = makeRunTick(context);

      const tick1 = await runTick(new Date(t0));
      const tick2 = await runTick(new Date(t0 + 1 * MIN));
      if (tick1.action !== "idle" || tick2.action !== "idle") {
        fail(`ticks #1/#2 expected "idle" (terminal drop + consumed id), got "${tick1.action}"/"${tick2.action}"`);
        return;
      }
      if (gateEvents.length !== 1) {
        fail(`expected exactly 1 gate call before the crash, got ${gateEvents.length}`);
        return;
      }

      const snapshot = await PersistStrategyAdapter.readStrategyData("BTCUSDT", context.strategyName, context.exchangeName);
      if (snapshot?.lastPendingId !== "sched-consume-persist-id") {
        fail(`persisted snapshot must carry the consumed id, got lastPendingId=${snapshot?.lastPendingId}`);
        return;
      }

      // «Крэш» после терминального дропа — потребление должно пережить рестарт
      await lib.strategyConnectionService.clear({
        symbol: "BTCUSDT",
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        backtest: false,
      });

      const tick3 = await runTick(new Date(t0 + 2 * MIN));
      const tick4 = await runTick(new Date(t0 + 3 * MIN));
      if (tick3.action !== "idle" || tick4.action !== "idle") {
        fail(`ticks #3/#4 after crash expected "idle" (restored consumption), got "${tick3.action}"/"${tick4.action}"`);
        return;
      }
      if (gateEvents.length !== 1) {
        fail(`REGRESSION: restart must NOT replay the consumed id to the exchange, got ${gateEvents.length} gate calls: ${JSON.stringify(gateEvents)}`);
        return;
      }

      pass(`consumed id survived the crash: 1 gate call total, restored lastPendingId blocked the replay`);
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

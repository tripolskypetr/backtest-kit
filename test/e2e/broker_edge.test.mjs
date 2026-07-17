import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  setConfig,
  listenSync,
  listenError,
  listenExit,
  commitClosePending,
  commitCancelScheduled,
  getStrategyStatus,
  runInMockContext,
  Broker,
  OrderRejectedError,
  OrderTransientError,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Краевые случаи Broker-интеграции, вскрытые предыдущими находками:
// - idle-пинг стреляет и в окнах отказов (armed open-retry, отвергнутый
//   user-close drain при живой позиции) — «idle ≠ пустой движок»;
// - канонический sweep ОТКАЗЫВАЕТСЯ усыновлять на нечистом движке
//   (restored armed slot виден через getStrategyStatus в waitForInit);
// - armed retry-слот обходит троттлинг генерации (CC_MAX_SIGNAL_GENERATION_SECONDS);
// - протухшая retry-строка (цена ушла за TP) дропается на ревалидации;
// - терминальный дроп детерминированного id не отравляет повторную генерацию;
// - кидающий waitForInit деградирует все гейты в transient до фатального exit;
// - горячая замена адаптера маршрутизирует следующие события в новый инстанс;
// - user-cancel не дотягивается до armed-но-неразмещённого слота;
// - transient-отказ гейта доносит исходный message через listenError.

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

/** listenExit/listenError-хендлеры queued-асинхронные — даём такт перед ассертом */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const BASE_PRICE = 50000;

/**
 * EDGE IDLE: idle-пинг стреляет ВНУТРИ окна open-ретрая — отвергнутый open
 * возвращает idle с уже взведённым слотом, и onSignalIdlePing видит через
 * getStrategyStatus непустой retryOpenSignal («idle ≠ пустой движок»).
 */
test("EDGE IDLE: the idle ping fires inside the open-retry window with the slot armed", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-idle-open-strategy",
    exchangeName: "binance-edge-idle-open",
    frameName: "",
  };

  const gateIds = [];
  const pingStatuses = [];

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "edge idle open",
      priceTakeProfit: BASE_PRICE + 15000,
      priceStopLoss: BASE_PRICE - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      gateIds.push(payload.signalId);
      if (gateIds.length === 1) {
        throw new OrderTransientError("edge-idle-open: response lost");
      }
    },
    onSignalIdlePing: async (payload) => {
      const status = await inMock(() => getStrategyStatus("BTCUSDT"), payload.when.getTime(), context);
      pingStatuses.push({ retryId: status.retryOpenSignal?.id ?? null, retryCount: status.retryOpenCount });
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (open rejected), got "${tick1.action}"`);
      return;
    }
    // Пинг обязан был выстрелить ВНУТРИ tick1 — при взведённом слоте
    if (pingStatuses.length !== 1) {
      fail(`expected exactly 1 idle ping during the rejected-open tick, got ${pingStatuses.length}`);
      return;
    }
    if (pingStatuses[0].retryId !== gateIds[0] || pingStatuses[0].retryCount !== 1) {
      fail(`the idle ping must observe the ARMED slot (id=${gateIds[0]}, count=1), got ${JSON.stringify(pingStatuses[0])}`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (retry accepted), got "${tick2.action}"`);
      return;
    }

    pass(`idle ping fired inside the retry window and saw the armed slot (id=${gateIds[0]}, count=1)`);
  } finally {
    Broker.disable();
  }
});

/**
 * EDGE IDLE: idle-пинг стреляет и при отвергнутом user-close drain'е — позиция
 * ЖИВА (deferred closedSignal), а tick idle: слепое усыновление тут открыло бы
 * второй сигнал поверх реальной позиции.
 */
test("EDGE IDLE: the idle ping fires while a rejected user-close drain holds a live position", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-idle-close-strategy",
    exchangeName: "binance-edge-idle-close",
    frameName: "",
  };

  const pingStatuses = [];
  let closeCalls = 0;
  let issued = false;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "edge idle close",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 600,
      };
    },
  });

  Broker.useBrokerAdapter({
    onOrderCloseCommit: async () => {
      closeCalls += 1;
      if (closeCalls === 1) {
        throw new OrderTransientError("edge-idle-close: exit response lost");
      }
    },
    onSignalIdlePing: async (payload) => {
      const status = await inMock(() => getStrategyStatus("BTCUSDT"), payload.when.getTime(), context);
      pingStatuses.push({ closedId: status.closedSignal?.id ?? null });
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
    const openedId = tick1.signal.id;

    await inMock(() => commitClosePending("BTCUSDT"), t0 + 5000, context);

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "idle") {
      fail(`tick #2 expected "idle" (drain rejected), got "${tick2.action}"`);
      return;
    }
    // Пинг из tick2: позиция реально существует (deferred close держит её)
    if (pingStatuses.length !== 1 || pingStatuses[0].closedId !== openedId) {
      fail(`the idle ping must observe the LIVE deferred close (closedSignal.id=${openedId}), got ${JSON.stringify(pingStatuses)}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "closed") {
      fail(`tick #3 expected closed/"closed" on confirm, got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }

    pass(`idle ping fired during the rejected drain and saw the live deferred close of ${openedId}`);
  } finally {
    Broker.disable();
  }
});

/**
 * EDGE ADOPT: канонический sweep ОТКАЗЫВАЕТСЯ усыновлять на нечистом движке —
 * после рестарта с armed retry-слотом waitForInit видит restored retryOpenSignal
 * через getStrategyStatus, пропускает усыновление, и restored-ретрай доезжает
 * штатно (тот же id, клэмпнутый attempt 1).
 */
test("EDGE ADOPT: the sweep refuses adoption on a non-clean engine (restored armed slot)", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-adopt-guard-strategy",
    exchangeName: "binance-edge-adopt-guard",
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

    const gateEvents = [];
    let getSignalCalls = 0;

    makeExchange(context.exchangeName, () => BASE_PRICE);
    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => {
        getSignalCalls += 1;
        return {
          position: "long",
          note: "edge adopt guard",
          priceTakeProfit: BASE_PRICE + 15000,
          priceStopLoss: BASE_PRICE - 15000,
          minuteEstimatedTime: 120,
        };
      },
    });

    // === Фаза 1 (до «крэша»): гейт через listenSync отвергает дважды — слот взведён
    const rejectListener = listenSync((event) => {
      if (event.strategyName !== context.strategyName) return;
      if (event.action !== "signal-open" || event.type !== "active") return;
      gateEvents.push({ phase: 1, id: event.signalId, attempt: event.attempt });
      throw new Error("edge-adopt-guard: response lost before the crash");
    }, true);

    const runTick = makeRunTick(context);
    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    rejectListener();
    if (tick1.action !== "idle" || tick2.action !== "idle") {
      fail(`phase-1 ticks expected "idle"/"idle", got "${tick1.action}"/"${tick2.action}"`);
      return;
    }
    const armedId = gateEvents[0].id;

    // «Крэш» с взведённым слотом в снапшоте
    await lib.strategyConnectionService.clear({
      symbol: "BTCUSDT",
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest: false,
    });

    // === Фаза 2 (рестарт): sweep-адаптер с guard'ом по getStrategyStatus
    let sweepStatus = null;
    let adoptionAttempted = false;

    Broker.useBrokerAdapter({
      waitForInit: async () => {
        const status = await inMock(() => getStrategyStatus("BTCUSDT"), t0 + 2 * MIN, context);
        sweepStatus = { retryId: status.retryOpenSignal?.id ?? null, retryCount: status.retryOpenCount };
        const engineClean = !status.pendingSignalId && !status.retryOpenSignal && !status.closedSignal && !status.createdSignal;
        if (engineClean) {
          adoptionAttempted = true; // сюда попадать НЕЛЬЗЯ — движок нечист
        }
      },
      onOrderOpenCommit: async (payload) => {
        if (payload.type !== "active") return;
        gateEvents.push({ phase: 2, id: payload.signalId, attempt: payload.attempt });
      },
    });
    Broker.enable();

    try {
      const tick3 = await runTick(new Date(t0 + 2 * MIN));
      if (tick3.action !== "opened") {
        fail(`tick #3 after restart expected "opened" (restored retry confirmed), got "${tick3.action}"`);
        return;
      }
      if (tick3.signal.id !== armedId) {
        fail(`restored retry must open the ARMED id "${armedId}", got "${tick3.signal.id}"`);
        return;
      }
      // Sweep увидел нечистый движок: он бежит ВНУТРИ первого гейта, когда
      // pre-arm уже инкрементировал клэмпнутый счётчик (restore 2→1, arm 1→2)
      if (!sweepStatus || sweepStatus.retryId !== armedId || sweepStatus.retryCount !== 2) {
        fail(`the sweep must observe the restored armed slot (id=${armedId}, clamp 1 + in-flight arm = 2), got ${JSON.stringify(sweepStatus)}`);
        return;
      }
      if (adoptionAttempted) {
        fail(`REGRESSION: the sweep attempted adoption on a NON-clean engine`);
        return;
      }
      const phase2 = gateEvents.filter(({ phase }) => phase === 2);
      if (phase2.length !== 1 || phase2[0].attempt !== 1) {
        fail(`the restored retry must reach the adapter with clamped attempt 1, got ${JSON.stringify(phase2)}`);
        return;
      }
      if (getSignalCalls !== 1) {
        fail(`getSignal must not regenerate (restored slot wins), got ${getSignalCalls} calls`);
        return;
      }

      pass(`sweep saw the restored slot (id=${armedId}, count=1), refused adoption, retry opened with attempt 1`);
    } finally {
      Broker.disable();
    }
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});

/**
 * EDGE THROTTLE: armed retry-слот обходит троттлинг генерации — при
 * CC_MAX_SIGNAL_GENERATION_SECONDS=3600 повторная генерация через минуту
 * невозможна, но ретрай приходит из слота (getSignal НЕ вызывается) и открывается.
 */
test("EDGE THROTTLE: the armed retry slot bypasses the signal-generation throttle", async ({ pass, fail }) => {
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 3600 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-throttle-strategy",
    exchangeName: "binance-edge-throttle",
    frameName: "",
  };

  const gateIds = [];
  let getSignalCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      getSignalCalls += 1;
      return {
        position: "long",
        note: "edge throttle",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    gateIds.push(event.signalId);
    if (gateIds.length === 1) {
      throw new Error("edge-throttle: response lost");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (open rejected), got "${tick1.action}"`);
      return;
    }

    // Через минуту генерация задушена (окно 3600с), но слот обязан ретраить
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (slot bypasses the throttle), got "${tick2.action}"`);
      return;
    }
    if (gateIds.length !== 2 || gateIds[0] !== gateIds[1]) {
      fail(`retry must carry the same id through the throttle window, got [${gateIds.join(", ")}]`);
      return;
    }
    if (getSignalCalls !== 1) {
      fail(`getSignal must NOT run under the throttle (the slot feeds the retry), got ${getSignalCalls} calls`);
      return;
    }

    pass(`retry opened under a 3600s generation throttle: slot bypassed it (getSignal calls=1)`);
  } finally {
    unsubscribe();
  }
});

/**
 * EDGE STALE: ретрай сохраняет ЦЕНОВУЮ идентичность строки (открытие пином
 * фактического поведения): цена убежала выше входа заармленной строки — ретрай
 * НЕ чейзит рынок и НЕ дропает строку, а переразмещает её resting-ордером по
 * ИСХОДНОМУ priceOpen с тем же id (учёт слота продолжается: schedule:attempt 1);
 * откат цены к priceOpen филлит ордер по исходному базису.
 */
test("EDGE STALE: a retried row keeps its price identity — re-routed to a resting order and filled on the pullback", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-stale-strategy",
    exchangeName: "binance-edge-stale",
    frameName: "",
  };

  let px = BASE_PRICE;
  const gateEvents = [];
  let getSignalCalls = 0;

  makeExchange(context.exchangeName, () => px);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      getSignalCalls += 1;
      return {
        position: "long",
        note: "edge stale",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open") return;
    gateEvents.push({ type: event.type, id: event.signalId, attempt: event.attempt });
    if (gateEvents.length === 1) {
      throw new Error("edge-stale: response lost");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (open rejected, slot armed with priceOpen=50000), got "${tick1.action}"`);
      return;
    }

    // Цена убегает выше исходного входа — ретрай обязан удержать цену строки,
    // а не купить по рынку 56000: строка переразмещается resting-ордером
    px = 56000;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "scheduled") {
      fail(`tick #2 expected "scheduled" (price identity kept: resting order at the ORIGINAL priceOpen), got "${tick2.action}"`);
      return;
    }

    // Откат к исходному priceOpen — resting-ордер филлится по базису 50000
    px = BASE_PRICE - 500;
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "opened") {
      fail(`tick #3 expected "opened" (pullback filled the resting order), got "${tick3.action}"`);
      return;
    }
    if (Math.abs(tick3.signal.priceOpen - BASE_PRICE) > 1) {
      fail(`the fill basis must stay at the ORIGINAL priceOpen ~50000 (no market chasing), got ${tick3.signal.priceOpen}`);
      return;
    }

    const flat = gateEvents.map(({ type, attempt }) => `${type}:${attempt}`).join(",");
    // active:0 (отказ) → schedule:1 (переразмещение ТОГО ЖЕ слота) → active:0 (филл)
    if (flat !== "active:0,schedule:1,active:0") {
      fail(`expected gate chain "active:0,schedule:1,active:0", got "${flat}"`);
      return;
    }
    if (new Set(gateEvents.map(({ id }) => id)).size !== 1) {
      fail(`the id must stay stable across the active→schedule re-route, got ${JSON.stringify(gateEvents)}`);
      return;
    }
    if (getSignalCalls !== 1) {
      fail(`the slot must feed every step (no regeneration), got ${getSignalCalls} getSignal calls`);
      return;
    }

    pass(`price ran to 56000: the row re-placed as a resting order at 50000 (same id, schedule:1) and filled on the pullback`);
  } finally {
    unsubscribe();
  }
});

/**
 * EDGE DETERMINISTIC: терминальный дроп детерминированного id не отравляет
 * повторную генерацию — getSignal возвращает ТОТ ЖЕ id, и он открывается со
 * свежим счётчиком (attempt 0): учёт попыток живёт в слоте, а не в истории id.
 */
test("EDGE DETERMINISTIC: a terminally dropped deterministic id regenerates with fresh accounting", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-det-strategy",
    exchangeName: "binance-edge-det",
    frameName: "",
  };

  const gateEvents = [];

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      id: "edge-det-fixed-id",
      position: "long",
      note: "edge deterministic",
      priceTakeProfit: BASE_PRICE + 5000,
      priceStopLoss: BASE_PRICE - 5000,
      minuteEstimatedTime: 300,
    }),
  });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    gateEvents.push({ id: event.signalId, attempt: event.attempt });
    if (gateEvents.length === 1) {
      throw new OrderRejectedError("edge-det: rejected terminally once");
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
    if (tick2.action !== "opened" || tick2.signal.id !== "edge-det-fixed-id") {
      fail(`tick #2 expected the SAME deterministic id to open, got "${tick2.action}"/"${tick2.signal?.id}"`);
      return;
    }
    // Дроп не был открытием — whipsaw-гард не блокирует, а счётчик стартует заново
    if (gateEvents.length !== 2 || gateEvents[0].attempt !== 0 || gateEvents[1].attempt !== 0) {
      fail(`both gate calls must carry attempt 0 (per-slot accounting, not per-id history), got ${JSON.stringify(gateEvents)}`);
      return;
    }

    pass(`deterministic id dropped terminally and re-opened with fresh attempt 0 accounting`);
  } finally {
    unsubscribe();
  }
});

/**
 * EDGE INIT: кидающий waitForInit — каждый гейт-вызов падает ДО хука адаптера,
 * деградирует в transient и исчерпывается штатно (A,A,A,B + фатальный exit);
 * сами хуки адаптера не вызываются ни разу.
 */
test("EDGE INIT: a throwing waitForInit degrades gates to transient and exhausts fatally", async ({ pass, fail }) => {
  setConfig({ CC_ORDER_OPEN_RETRY_ATTEMPTS: 2 }, true);

  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-init-strategy",
    exchangeName: "binance-edge-init",
    frameName: "",
  };

  const listenEvents = [];
  let adapterOpenCalls = 0;
  let exitCount = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "edge init",
      priceTakeProfit: BASE_PRICE + 15000,
      priceStopLoss: BASE_PRICE - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  const unsubscribeExit = listenExit(() => { exitCount += 1; });
  // Подписка ДО enable(): listenSync-слушатель успевает записать событие до
  // того, как бросок из broker-подписчика оборвёт цепочку
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    listenEvents.push({ id: event.signalId, attempt: event.attempt });
  }, true);

  Broker.useBrokerAdapter({
    waitForInit: async () => {
      throw new Error("edge-init: exchange authentication is down");
    },
    onOrderOpenCommit: async () => {
      adapterOpenCalls += 1;
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    // tick1-3: id A (attempts 0,1,2), tick4: исчерпание → дроп + свежий B
    for (let i = 0; i < 4; i++) {
      const tick = await runTick(new Date(t0 + i * MIN));
      if (tick.action !== "idle") {
        fail(`tick #${i + 1} expected "idle" (init failure = transient), got "${tick.action}"`);
        return;
      }
    }

    if (listenEvents.length !== 4) {
      fail(`expected 4 gate events (3×A + 1×B), got ${listenEvents.length}`);
      return;
    }
    const ids = listenEvents.map(({ id }) => id);
    if (ids[0] !== ids[1] || ids[1] !== ids[2] || ids[3] === ids[0]) {
      fail(`expected ids A,A,A,fresh — got [${ids.join(", ")}]`);
      return;
    }
    if (listenEvents.map(({ attempt }) => attempt).join(",") !== "0,1,2,0") {
      fail(`expected attempts "0,1,2,0", got "${listenEvents.map(({ attempt }) => attempt).join(",")}"`);
      return;
    }
    if (adapterOpenCalls !== 0) {
      fail(`hooks must never run when waitForInit throws, got ${adapterOpenCalls} calls`);
      return;
    }

    await settle();
    if (exitCount !== 1) {
      fail(`transient exhaustion caused by the broken init must signal fatal exit exactly once, got ${exitCount}`);
      return;
    }

    pass(`broken waitForInit degraded every gate to transient: A×3 then fresh B, 0 hook calls, fatal exit`);
  } finally {
    Broker.disable();
    unsubscribe();
    unsubscribeExit();
  }
});

/**
 * EDGE HOTSWAP: useBrokerAdapter после enable() — getInstance-синглшот
 * сбрасывается, следующие события уходят в НОВЫЙ адаптер (со своим waitForInit),
 * контекст ретрая (id, attempt) при этом сохраняется.
 */
test("EDGE HOTSWAP: replacing the adapter after enable routes subsequent events to the new instance", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-swap-strategy",
    exchangeName: "binance-edge-swap",
    frameName: "",
  };

  const callsA = [];
  const callsB = [];
  let initB = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "edge swap",
      priceTakeProfit: BASE_PRICE + 15000,
      priceStopLoss: BASE_PRICE - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      callsA.push({ id: payload.signalId, attempt: payload.attempt });
      throw new OrderTransientError("edge-swap: adapter A is down");
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (adapter A rejected), got "${tick1.action}"`);
      return;
    }

    // Горячая замена: фабрика заменяется, getInstance-синглшот очищается
    Broker.useBrokerAdapter({
      waitForInit: async () => { initB += 1; },
      onOrderOpenCommit: async (payload) => {
        if (payload.type !== "active") return;
        callsB.push({ id: payload.signalId, attempt: payload.attempt });
      },
    });

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (adapter B confirms), got "${tick2.action}"`);
      return;
    }
    if (callsA.length !== 1 || callsB.length !== 1) {
      fail(`exactly one call per adapter expected, got A=${callsA.length} B=${callsB.length}`);
      return;
    }
    // Контекст ретрая пережил замену: тот же id, attempt 1
    if (callsB[0].id !== callsA[0].id || callsB[0].attempt !== 1) {
      fail(`adapter B must receive the SAME retry (id=${callsA[0].id}, attempt 1), got ${JSON.stringify(callsB)}`);
      return;
    }
    if (initB !== 1) {
      fail(`the new adapter's waitForInit must run once after the swap, got ${initB}`);
      return;
    }

    pass(`hot swap routed the retry to adapter B (same id, attempt 1) with B's waitForInit run`);
  } finally {
    Broker.disable();
  }
});

/**
 * EDGE CANCEL: commitCancelScheduled в окне ретраев РАЗМЕЩЕНИЯ — отменять
 * нечего (_scheduledSignal ещё null, ордер не размещён): no-op, слот выживает
 * и следующий tick размещает тот же id.
 */
test("EDGE CANCEL: cancelScheduled during the placement-retry window is a no-op — the slot survives", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const priceOpen = 40000;
  const context = {
    strategyName: "edge-cancel-strategy",
    exchangeName: "binance-edge-cancel",
    frameName: "",
  };

  const gateEvents = [];
  let issued = false;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "edge cancel",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "schedule") return;
    gateEvents.push({ id: event.signalId, attempt: event.attempt });
    if (gateEvents.length === 1) {
      throw new Error("edge-cancel: placement response lost");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (placement rejected, slot armed), got "${tick1.action}"`);
      return;
    }

    // Ордер НЕ размещён — user-cancel'у нечего отменять (no-op)
    const cancelResult = await inMock(() => commitCancelScheduled("BTCUSDT"), t0 + 5000, context);
    if (cancelResult) {
      fail(`cancelScheduled must be a no-op while nothing is placed (falsy result), got ${JSON.stringify(cancelResult)}`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "scheduled") {
      fail(`tick #2 expected "scheduled" (the armed slot survived the no-op cancel), got "${tick2.action}"`);
      return;
    }
    if (gateEvents.length !== 2 || gateEvents[0].id !== gateEvents[1].id || gateEvents[1].attempt !== 1) {
      fail(`the retry must place the SAME id with attempt 1, got ${JSON.stringify(gateEvents)}`);
      return;
    }

    pass(`cancelScheduled was a no-op mid-retry; the slot placed ${gateEvents[0].id} with attempt 1`);
  } finally {
    unsubscribe();
  }
});

/**
 * EDGE ERROR: transient-отказ гейта доносит ИСХОДНЫЙ message до errorEmitter —
 * listenError видит текст ошибки адаптера (наблюдаемость сетевых сбоев).
 */
test("EDGE ERROR: a transient gate rejection surfaces the original message via listenError", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "edge-error-strategy",
    exchangeName: "binance-edge-error",
    frameName: "",
  };

  const MARKER = "edge-error: binance 502 inside the rkn-defuse window";
  const errorMessages = [];
  let gateCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "edge error",
      priceTakeProfit: BASE_PRICE + 15000,
      priceStopLoss: BASE_PRICE - 15000,
      minuteEstimatedTime: 120,
    }),
  });

  const unsubscribeError = listenError((error) => {
    errorMessages.push(String(error?.message ?? error));
  });
  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    gateCalls += 1;
    if (gateCalls === 1) {
      throw new OrderTransientError(MARKER);
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (transient rejection), got "${tick1.action}"`);
      return;
    }

    await settle();
    if (!errorMessages.some((message) => message.includes(MARKER))) {
      fail(`listenError must surface the adapter's original message "${MARKER}", got [${errorMessages.join(" | ")}]`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (retry accepted), got "${tick2.action}"`);
      return;
    }

    pass(`the transient rejection surfaced its original message through listenError`);
  } finally {
    unsubscribe();
    unsubscribeError();
  }
});

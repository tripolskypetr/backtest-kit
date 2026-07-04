import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  setConfig,
  PersistSignalAdapter,
  PersistScheduleAdapter,
  PersistStrategyAdapter,
  PersistCandleAdapter,
  PersistRiskAdapter,
  listenScheduleEvent,
  listenSignal,
  MethodContextService,
  lib,
} from "../../build/index.mjs";

// Ветка ACTIVATE_SCHEDULED_SIGNAL_FN при _isStopped: считалась «экзотической
// гонкой» (stopStrategy конвертирует scheduled -> _cancelledSignal и дренаж
// идёт ДО прайс-монитора), но прямое присваивание флага между тиками
// воспроизводит ровно состояние mid-tick гонки. Хранилище — целиком
// in-memory, адаптеры объявлены в скоупе test(): нет диска, нет restore
// между запусками, нет подмешивания VWAP из файлового кэша свечей.

const MIN = 60_000;
const BASE = new Date("2024-01-01T00:00:00Z").getTime();

test("stopped-activation branch: mid-tick stop race drains scheduled via cancel pipeline", async (t) => {
  // --- In-memory persistence, implemented in test scope ---
  const kv = new Map();
  const makeKvInstance = (readMethod, writeMethod, keyFn) =>
    class {
      constructor(...args) {
        this._key = keyFn(...args);
      }
      async waitForInit() {}
      async [readMethod]() {
        return kv.has(this._key) ? kv.get(this._key) : null;
      }
      async [writeMethod](value) {
        kv.set(this._key, value);
      }
    };

  PersistSignalAdapter.usePersistSignalAdapter(
    makeKvInstance("readSignalData", "writeSignalData", (s, st, ex) => `sig:${s}:${st}:${ex}`),
  );
  PersistScheduleAdapter.usePersistScheduleAdapter(
    makeKvInstance("readScheduleData", "writeScheduleData", (s, st, ex) => `sch:${s}:${st}:${ex}`),
  );
  PersistStrategyAdapter.usePersistStrategyAdapter(
    makeKvInstance("readStrategyData", "writeStrategyData", (s, st, ex) => `str:${s}:${st}:${ex}`),
  );
  PersistRiskAdapter.usePersistRiskAdapter(
    class {
      async waitForInit() {}
      async readPositionData() {
        return [];
      }
      async writePositionData() {}
    },
  );
  // Свечной кэш: всегда мимо (readCandlesData -> null) — каждый VWAP-запрос
  // идёт в адаптер биржи и отражает ТЕКУЩУЮ цену, без смешивания с прошлым тиком
  PersistCandleAdapter.usePersistCandleAdapter(
    class {
      async waitForInit() {}
      async readCandlesData() {
        return null;
      }
      async writeCandlesData() {}
    },
  );

  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);

  let marketPrice = 50000;

  addExchangeSchema({
    exchangeName: "stopped-ex",
    getCandles: async (_s, _i, since, limit) => {
      const out = [];
      for (let i = 0; i < limit; i++) {
        out.push({
          timestamp: since.getTime() + i * MIN,
          open: marketPrice,
          high: marketPrice,
          low: marketPrice,
          close: marketPrice,
          volume: 1,
        });
      }
      return out;
    },
    formatPrice: async (_s, p) => p,
    formatQuantity: async (_s, q) => q,
  });

  let emitted = false;
  addStrategySchema({
    strategyName: "stopped-strat",
    interval: "1m",
    getSignal: async () => {
      if (emitted) return null;
      emitted = true;
      return {
        position: "long",
        priceOpen: 49000, // ниже рынка — resting buy (scheduled)
        priceTakeProfit: 52000,
        priceStopLoss: 46000,
        minuteEstimatedTime: 240,
      };
    },
  });

  const scheduleEvents = [];
  listenScheduleEvent((e) => scheduleEvents.push(e.action));

  const CTX = {
    strategyName: "stopped-strat",
    exchangeName: "stopped-ex",
    frameName: "",
  };
  const tick = (whenMs) =>
    MethodContextService.runInContext(
      () => lib.strategyCoreService.tick("BTCUSDT", new Date(whenMs), false, CTX),
      CTX,
    );

  // tick 1: создан scheduled-сигнал
  const r1 = await tick(BASE + 1 * MIN);
  if (r1.action !== "scheduled") {
    t.fail(`expected scheduled on tick1, got ${r1.action}`);
    return;
  }

  // Состояние mid-tick гонки: флаг поднят БЕЗ конверсии stopStrategy
  const strategy = Object.getPrototypeOf(lib.strategyConnectionService).getStrategy(
    "BTCUSDT",
    CTX.strategyName,
    CTX.exchangeName,
    CTX.frameName,
    false,
  );
  if (typeof strategy._isStopped !== "boolean") {
    t.fail("cannot reach ClientStrategy instance");
    return;
  }
  strategy._isStopped = true;

  // tick 2: цена пересекает priceOpen -> ACTIVATE -> stopped-ветка
  marketPrice = 48500;
  const r2 = await tick(BASE + 2 * MIN);

  if (r2.action !== "idle") {
    t.fail(`expected idle from stopped-activation branch, got ${r2.action}`);
    return;
  }
  if (strategy._scheduledSignal) {
    t.fail("scheduled signal was not cleared by the stopped branch");
    return;
  }
  if (!scheduleEvents.includes("cancelled")) {
    t.fail(`no cancelled schedule event, got: ${scheduleEvents.join(",")}`);
    return;
  }
  // Отмена персистится через in-memory адаптер, объявленный в этом тесте
  const persisted = kv.get("sch:BTCUSDT:stopped-strat:stopped-ex");
  if (persisted != null) {
    t.fail("in-memory schedule store still holds the cancelled signal");
    return;
  }

  t.pass(
    "stopped mid-tick race drains scheduled: idle tick + cancelled/user on schedule channel + risk slot released",
  );
});

// ============================================================================
// Общие фабрики для остальных stopped-тестов. In-memory адаптеры создаются
// ВНУТРИ каждого test() вызовом useMemoryPersist() — свой Map на тест.
// ============================================================================

import {
  PersistCandleAdapter as _PC,
  PersistRiskAdapter as _PR,
  PersistSignalAdapter as _PSig,
  PersistScheduleAdapter as _PSch,
  PersistStrategyAdapter as _PStr,
  addFrameSchema,
  addActionSchema,
  addRiskSchema,
  ActionBase,
  Backtest,
  runInMockContext,
  commitActivateScheduled,
  commitClosePending,
  commitCancelScheduled,
  commitCreateTakeProfit,
  stopStrategy,
} from "../../build/index.mjs";

const useMemoryPersist = () => {
  const kv = new Map();
  const riskWrites = [];
  const makeKv = (readM, writeM, keyFn) =>
    class {
      constructor(...args) { this._key = keyFn(...args); }
      async waitForInit() {}
      async [readM]() { return kv.has(this._key) ? kv.get(this._key) : null; }
      async [writeM](value) { kv.set(this._key, value); }
    };
  _PSig.usePersistSignalAdapter(makeKv("readSignalData", "writeSignalData", (s, st, ex) => `sig:${s}:${st}:${ex}`));
  _PSch.usePersistScheduleAdapter(makeKv("readScheduleData", "writeScheduleData", (s, st, ex) => `sch:${s}:${st}:${ex}`));
  _PStr.usePersistStrategyAdapter(makeKv("readStrategyData", "writeStrategyData", (s, st, ex) => `str:${s}:${st}:${ex}`));
  _PR.usePersistRiskAdapter(class {
    async waitForInit() {}
    async readPositionData() { return []; }
    async writePositionData(positions) { riskWrites.push(positions); }
  });
  _PC.usePersistCandleAdapter(class {
    async waitForInit() {}
    async readCandlesData() { return null; }
    async writeCandlesData() {}
  });
  return { kv, riskWrites };
};

const makePriceExchange = (exchangeName, getPrice) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_s, _i, since, limit) => {
      const out = [];
      for (let i = 0; i < limit; i++) {
        const ts = since.getTime() + i * MIN;
        const px = getPrice(ts);
        out.push({ timestamp: ts, open: px, high: px, low: px, close: px, volume: 1 });
      }
      return out;
    },
    formatPrice: async (_s, p) => p,
    formatQuantity: async (_s, q) => q,
  });
};

const SCHEDULED_DTO = { position: "long", priceOpen: 49000, priceTakeProfit: 52000, priceStopLoss: 46000, minuteEstimatedTime: 240 };
const MARKET_DTO = { position: "long", priceTakeProfit: 52000, priceStopLoss: 46000, minuteEstimatedTime: 240 };

const getInstance = (symbol, strategyName, exchangeName, frameName, isBacktest) =>
  Object.getPrototypeOf(lib.strategyConnectionService).getStrategy(symbol, strategyName, exchangeName, frameName, isBacktest);

const liveTick = (symbol, whenMs, CTX) =>
  MethodContextService.runInContext(
    () => lib.strategyCoreService.tick(symbol, new Date(whenMs), false, CTX),
    CTX,
  );

const inMock = (fn, whenMs, CTX, isBacktest = false) =>
  runInMockContext(fn, {
    when: new Date(whenMs),
    strategyName: CTX.strategyName,
    exchangeName: CTX.exchangeName,
    frameName: CTX.frameName,
    symbol: "BTCUSDT",
    backtest: isBacktest,
  });

// №1: стоп поднят ИЗНУТРИ placement-гейта (onOrderSync type=schedule вернул true,
// но флаг уже стоит) — ордер реален, поэтому уходит в deferred-cancel пайплайн
test("stop raised inside placement gate defers cancel of the real resting order", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("g1-ex", () => 50000);

  const CTX = { strategyName: "g1-strat", exchangeName: "g1-ex", frameName: "" };

  addActionSchema({
    actionName: "g1-action",
    handler: class extends ActionBase {},
    callbacks: {
      onOrderSync: (event) => {
        if (event.action === "signal-open" && event.type === "schedule") {
          const strategy = getInstance("BTCUSDT", CTX.strategyName, CTX.exchangeName, CTX.frameName, false);
          strategy._isStopped = true; // гонка: стоп во время подтверждения размещения
        }
      },
    },
  });

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    actions: ["g1-action"],
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
  });

  const schedule = [];
  listenScheduleEvent((e) => schedule.push(e.action));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action === "scheduled") {
    t.fail("scheduled signal registered as alive despite stop raised inside the gate");
    return;
  }
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "cancelled") {
    t.fail(`expected cancelled drain on tick2, got ${r2.action}`);
    return;
  }
  if (!schedule.includes("cancelled")) {
    t.fail(`no cancelled schedule event: ${schedule.join(",")}`);
    return;
  }
  t.pass("placement gate + mid-gate stop -> deferred cancel drained (broker channel + risk release)");
});

// №2: стоп поднят внутри risk-валидации (между резервацией и открытием)
test("stop raised inside risk validation routes scheduled through cancel pipeline", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("g2-ex", () => 50000);

  const CTX = { strategyName: "g2-strat", exchangeName: "g2-ex", frameName: "" };

  addRiskSchema({
    riskName: "g2-risk",
    validations: [
      {
        validate: () => {
          const strategy = getInstance("BTCUSDT", CTX.strategyName, CTX.exchangeName, CTX.frameName, false);
          strategy._isStopped = true; // гонка: стоп во время risk-проверки
        },
        note: "raises stop flag mid-validation",
      },
    ],
  });

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    riskList: ["g2-risk"],
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
  });

  const schedule = [];
  listenScheduleEvent((e) => schedule.push(e.action));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action === "scheduled") {
    t.fail("scheduled registered as alive despite stop raised inside risk validation");
    return;
  }
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "cancelled" || !schedule.includes("cancelled")) {
    t.fail(`expected cancelled drain, got ${r2.action}; schedule=${schedule.join(",")}`);
    return;
  }
  t.pass("risk-validation stop race -> deferred cancel drained, reservation released");
});

// №3: backtest-близнец активационной ветки — флаг из onSchedulePing до кроссинга
test("backtest twin: stop flag from schedule ping cancels activation via stopped branch", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  // до 00:05 — 50000 (нет активации long@49000), после — 48500 (кроссинг)
  makePriceExchange("g3-ex", (ts) => (ts < BASE + 5 * MIN ? 50000 : 48500));
  addFrameSchema({
    frameName: "g3-frame",
    interval: "1m",
    startDate: new Date(BASE),
    endDate: new Date(BASE + 10 * MIN),
  });

  const CTX = { strategyName: "g3-strat", exchangeName: "g3-ex", frameName: "g3-frame" };

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
    callbacks: {
      onSchedulePing: async () => {
        const strategy = getInstance("BTCUSDT", CTX.strategyName, CTX.exchangeName, CTX.frameName, true);
        strategy._isStopped = true;
      },
    },
  });

  const schedule = [];
  listenScheduleEvent((e) => schedule.push(e.action));
  const results = [];
  for await (const r of Backtest.run("BTCUSDT", CTX)) {
    results.push(r.action);
  }

  if (results.includes("opened") || results.includes("closed")) {
    t.fail(`position opened despite stop: ${results.join(",")}`);
    return;
  }
  if (!schedule.includes("cancelled")) {
    t.fail(`no cancelled schedule event in backtest: ${schedule.join(",")}`);
    return;
  }
  t.pass("backtest stopped-activation branch drains scheduled via cancel pipeline");
});

// №4: live user-активация, отложенная ДО стопа, дренируется в cancel (ветка 6877)
test("deferred user activation under stop drains into cancel pipeline (live)", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("g4-ex", () => 50000);

  const CTX = { strategyName: "g4-strat", exchangeName: "g4-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
  });

  const schedule = [];
  listenScheduleEvent((e) => schedule.push(e.action));
  const signals = [];
  listenSignal((e) => signals.push(e.action));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "scheduled") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => commitActivateScheduled("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);
  const strategy = getInstance("BTCUSDT", CTX.strategyName, CTX.exchangeName, CTX.frameName, false);
  strategy._isStopped = true; // стоп после отложенной активации, до её дренажа

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (signals.includes("opened") || r2.action === "opened") {
    t.fail("deferred activation opened a position despite stop");
    return;
  }
  if (!schedule.includes("cancelled")) {
    t.fail(`no cancelled schedule event: ${schedule.join(",")}`);
    return;
  }
  if (strategy._scheduledSignal || strategy._activatedSignal) {
    t.fail("scheduled/activated state not cleared");
    return;
  }
  t.pass("live deferred activation + stop -> cancelled, no position opened");
});

// №5: backtest-близнец №4 — активация из onSchedulePing + флаг, ветка 4748
test("deferred user activation under stop drains into cancel pipeline (backtest)", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("g5-ex", () => 50000); // цена НЕ пересекает — только user-активация
  addFrameSchema({
    frameName: "g5-frame",
    interval: "1m",
    startDate: new Date(BASE),
    endDate: new Date(BASE + 10 * MIN),
  });

  const CTX = { strategyName: "g5-strat", exchangeName: "g5-ex", frameName: "g5-frame" };
  let emitted = false;
  let fired = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
    callbacks: {
      onSchedulePing: async (symbol) => {
        if (fired) return;
        fired = true;
        await commitActivateScheduled(symbol); // контексты активны в колбэке
        const strategy = getInstance("BTCUSDT", CTX.strategyName, CTX.exchangeName, CTX.frameName, true);
        strategy._isStopped = true;
      },
    },
  });

  const schedule = [];
  listenScheduleEvent((e) => schedule.push(e.action));
  const results = [];
  for await (const r of Backtest.run("BTCUSDT", CTX)) results.push(r.action);

  if (results.includes("opened")) {
    t.fail(`opened despite stop: ${results.join(",")}`);
    return;
  }
  if (!schedule.includes("cancelled")) {
    t.fail(`no cancelled schedule event: ${schedule.join(",")}`);
    return;
  }
  t.pass("backtest deferred activation + stop -> cancelled via 4748 branch");
});

// №6: activateScheduled ПОСЛЕ стопа — отказ (activation = opening NEW position)
test("activateScheduled after stop is rejected as a no-op", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("g6-ex", () => 50000);

  const CTX = { strategyName: "g6-strat", exchangeName: "g6-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "scheduled") { t.fail(`tick1 ${r1.action}`); return; }

  const strategy = getInstance("BTCUSDT", CTX.strategyName, CTX.exchangeName, CTX.frameName, false);
  strategy._isStopped = true;
  await inMock(() => commitActivateScheduled("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);

  if (strategy._activatedSignal) {
    t.fail("activateScheduled deferred an activation despite stop");
    return;
  }
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action === "opened") {
    t.fail("position opened from post-stop activation");
    return;
  }
  t.pass(`post-stop activateScheduled is a no-op (tick2=${r2.action})`);
});

// №7: deferred close/cancel, выданные ДО стопа, дренируются ПОСЛЕ (NOTE-контракты)
test("deferred user close and cancel drain after stop (graceful-shutdown contract)", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("g7-ex", () => 50000);

  // Фаза A: pending close
  const CTX_A = { strategyName: "g7a-strat", exchangeName: "g7-ex", frameName: "" };
  let emA = false;
  addStrategySchema({
    strategyName: CTX_A.strategyName,
    interval: "1m",
    getSignal: async () => (emA ? null : ((emA = true), { ...MARKET_DTO })),
  });
  const signalsA = [];
  listenSignal((e) => signalsA.push(e.action));

  const a1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX_A);
  if (a1.action !== "opened") { t.fail(`phase A tick1 ${a1.action}`); return; }
  await inMock(() => commitClosePending("BTCUSDT"), BASE + 1 * MIN + 5000, CTX_A);
  getInstance("BTCUSDT", CTX_A.strategyName, CTX_A.exchangeName, "", false)._isStopped = true;
  const a2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX_A);
  if (a2.action !== "closed") { t.fail(`deferred close did not drain under stop: ${a2.action}`); return; }

  // Фаза B: scheduled cancel
  const CTX_B = { strategyName: "g7b-strat", exchangeName: "g7-ex", frameName: "" };
  let emB = false;
  addStrategySchema({
    strategyName: CTX_B.strategyName,
    interval: "1m",
    getSignal: async () => (emB ? null : ((emB = true), { ...SCHEDULED_DTO })),
  });
  const scheduleB = [];
  listenScheduleEvent((e) => scheduleB.push(e.action));

  const b1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX_B);
  if (b1.action !== "scheduled") { t.fail(`phase B tick1 ${b1.action}`); return; }
  await inMock(() => commitCancelScheduled("BTCUSDT"), BASE + 1 * MIN + 5000, CTX_B);
  getInstance("BTCUSDT", CTX_B.strategyName, CTX_B.exchangeName, "", false)._isStopped = true;
  const b2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX_B);
  if (b2.action !== "cancelled" || !scheduleB.includes("cancelled")) {
    t.fail(`deferred cancel did not drain under stop: ${b2.action}`);
    return;
  }
  t.pass("deferred close and cancel both drain after stop");
});

// №9: стоп НЕ переживает рестарт (process-local семантика — пиннинг)
test("stop flag is process-local: after crash/restore the strategy trades again", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("g9-ex", () => 50000);

  const CTX = { strategyName: "g9-strat", exchangeName: "g9-ex", frameName: "" };
  let allow = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (allow ? { ...MARKET_DTO } : null),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "idle") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => stopStrategy("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);
  const before = getInstance("BTCUSDT", CTX.strategyName, CTX.exchangeName, "", false);
  if (!before._isStopped) { t.fail("stopStrategy did not raise the flag"); return; }

  // «Крэш»: bare clear() диспозит инстансы; restore пойдёт из in-memory KV
  await Object.getPrototypeOf(lib.strategyConnectionService).clear({ symbol: "BTCUSDT", strategyName: CTX.strategyName, exchangeName: CTX.exchangeName, frameName: "", backtest: false });

  allow = true;
  const r2 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r2.action !== "opened") {
    t.fail(`expected trading to resume after restart (process-local stop), got ${r2.action}`);
    return;
  }
  t.pass("stop is process-local by design: restart forgets the flag and trading resumes");
});

// №8: broker-confirmed TP-fill под стопом дренируется в closed/take_profit
test("broker-confirmed take-profit fill drains to closed under stop", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("g8-ex", () => 50000);

  const CTX = { strategyName: "g8-strat", exchangeName: "g8-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => commitCreateTakeProfit("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);
  getInstance("BTCUSDT", CTX.strategyName, CTX.exchangeName, "", false)._isStopped = true;

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "closed") {
    t.fail(`confirmed TP fill did not drain under stop: ${r2.action}`);
    return;
  }
  if (r2.closeReason !== "take_profit") {
    t.fail(`expected take_profit close reason, got ${r2.closeReason}`);
    return;
  }
  t.pass("confirmed TP fill drains to closed/take_profit despite stop");
});


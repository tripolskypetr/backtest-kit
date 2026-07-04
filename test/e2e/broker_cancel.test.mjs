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
  Broker,
  lib,
} from "../../build/index.mjs";

// Отмена ордера в live через БРОКЕРСКИЕ хуки (useBrokerAdapter + enable):
// onOrderCheck как пинг-гейт (throw = ордера больше нет на бирже) и
// onOrderOpenCommit как sync-гейт (throw = биржа отвергла размещение/филл).
// Харнес герметичный: in-memory адаптеры в скоупе test(), live-тики в
// MethodContextService.runInContext, VWAP всегда от текущей цены.

const MIN = 60_000;
const BASE = new Date("2024-01-01T00:00:00Z").getTime();

const useMemoryPersist = () => {
  const kv = new Map();
  const makeKv = (readM, writeM, keyFn) =>
    class {
      constructor(...args) { this._key = keyFn(...args); }
      async waitForInit() {}
      async [readM]() { return kv.has(this._key) ? kv.get(this._key) : null; }
      async [writeM](value) { kv.set(this._key, value); }
    };
  PersistSignalAdapter.usePersistSignalAdapter(makeKv("readSignalData", "writeSignalData", (s, st, ex) => `sig:${s}:${st}:${ex}`));
  PersistScheduleAdapter.usePersistScheduleAdapter(makeKv("readScheduleData", "writeScheduleData", (s, st, ex) => `sch:${s}:${st}:${ex}`));
  PersistStrategyAdapter.usePersistStrategyAdapter(makeKv("readStrategyData", "writeStrategyData", (s, st, ex) => `str:${s}:${st}:${ex}`));
  PersistRiskAdapter.usePersistRiskAdapter(class {
    async waitForInit() {}
    async readPositionData() { return []; }
    async writePositionData() {}
  });
  PersistCandleAdapter.usePersistCandleAdapter(class {
    async waitForInit() {}
    async readCandlesData() { return null; }
    async writeCandlesData() {}
  });
  return { kv };
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

const liveTick = (symbol, whenMs, CTX) =>
  MethodContextService.runInContext(
    () => lib.strategyCoreService.tick(symbol, new Date(whenMs), false, CTX),
    CTX,
  );

const SCHEDULED_DTO = { position: "long", priceOpen: 49000, priceTakeProfit: 52000, priceStopLoss: 46000, minuteEstimatedTime: 240 };
const MARKET_DTO = { position: "long", priceTakeProfit: 52000, priceStopLoss: 46000, minuteEstimatedTime: 240 };

// 1. Broker.onOrderCheck (type=schedule) бросает: resting-ордер снят биржей ->
//    scheduled отменяется, адаптер получает onSignalScheduleCancelled
test("broker onOrderCheck throw (schedule) cancels resting order and notifies adapter", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("bc1-ex", () => 50000);

  const CTX = { strategyName: "bc1-strat", exchangeName: "bc1-ex", frameName: "" };
  let rejectPing = false;
  const calls = [];
  Broker.useBrokerAdapter(class {
    async onSignalScheduleOpen(p) { calls.push({ m: "scheduleOpen", id: p.signalId }); }
    async onOrderCheck(p) {
      calls.push({ m: "orderCheck", type: p.type });
      if (p.type === "schedule" && rejectPing) {
        throw new Error("exchange reports the resting order is gone");
      }
    }
    async onSignalScheduleCancelled(p) { calls.push({ m: "scheduleCancelled", reason: p.reason }); }
  });
  Broker.enable();

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
  });

  const schedule = [];
  listenScheduleEvent((e) => schedule.push(e.action));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "scheduled") { t.fail(`tick1 ${r1.action}`); return; }

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "waiting") { t.fail(`tick2 ${r2.action}`); return; }
  if (!calls.some((c) => c.m === "orderCheck" && c.type === "schedule")) {
    t.fail("schedule ping never reached the broker adapter");
    return;
  }

  rejectPing = true;
  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r3.action !== "cancelled") { t.fail(`expected cancelled, got ${r3.action}`); return; }
  if (!schedule.includes("cancelled")) { t.fail("no cancelled schedule event"); return; }
  if (!calls.some((c) => c.m === "scheduleCancelled")) {
    t.fail(`adapter was not told to cancel the resting order: ${JSON.stringify(calls)}`);
    return;
  }
  t.pass("broker check-throw cancels the scheduled order and notifies onSignalScheduleCancelled");
});

// 2. Broker.onOrderCheck (type=active) бросает: позиция закрыта извне ->
//    close "closed", адаптер получает onOrderCloseCommit
test("broker onOrderCheck throw (active) closes the position as externally closed", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("bc2-ex", () => 50000);

  const CTX = { strategyName: "bc2-strat", exchangeName: "bc2-ex", frameName: "" };
  let rejectPing = false;
  const calls = [];
  Broker.useBrokerAdapter(class {
    async onOrderOpenCommit(p) { calls.push({ m: "openCommit", type: p.type }); }
    async onOrderCheck(p) {
      calls.push({ m: "orderCheck", type: p.type });
      if (p.type === "active" && rejectPing) {
        throw new Error("position no longer exists on the exchange");
      }
    }
    async onOrderCloseCommit(p) { calls.push({ m: "closeCommit", id: p.signalId }); }
  });
  Broker.enable();

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const signals = [];
  listenSignal((e) => signals.push(e.action));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }
  if (!calls.some((c) => c.m === "openCommit" && c.type === "active")) {
    t.fail("open commit did not reach the adapter");
    return;
  }

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "active") { t.fail(`tick2 ${r2.action}`); return; }

  rejectPing = true;
  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r3.action !== "closed" || r3.closeReason !== "closed") {
    t.fail(`expected closed/closed, got ${r3.action}/${r3.closeReason}`);
    return;
  }
  // Контракт CLOSE_PENDING_SIGNAL_AS_CLOSED_FN: пинг уже установил, что ордера
  // нет на бирже — повторный close-commit брокеру был бы избыточен и вреден
  if (calls.some((c) => c.m === "closeCommit")) {
    t.fail("adapter must NOT receive a close commit for a position the exchange already closed");
    return;
  }
  t.pass("broker check-throw on active position closes it with reason=closed without redundant close commit");
});

// 3. Broker.onOrderOpenCommit (type=schedule) бросает: биржа отвергла
//    РАЗМЕЩЕНИЕ resting-ордера -> scheduled не регистрируется, ретрай на
//    следующем тике проходит после снятия отказа
test("broker openCommit throw (schedule) rejects placement and retries next tick", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("bc3-ex", () => 50000);

  const CTX = { strategyName: "bc3-strat", exchangeName: "bc3-ex", frameName: "" };
  let rejectPlacement = true;
  let placementAttempts = 0;
  Broker.useBrokerAdapter(class {
    async onOrderOpenCommit(p) {
      if (p.type === "schedule") {
        placementAttempts += 1;
        if (rejectPlacement) {
          throw new Error("exchange rejected the resting order placement");
        }
      }
    }
  });
  Broker.enable();

  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    // Генератор отдаёт сигнал на КАЖДЫЙ вызов: откат троттла после отказа
    // размещения должен приводить к повторной попытке на следующем тике
    getSignal: async () => ({ ...SCHEDULED_DTO }),
  });

  const schedule = [];
  listenScheduleEvent((e) => schedule.push(e.action));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action === "scheduled") { t.fail("placement must be rejected by the broker gate"); return; }
  if (placementAttempts !== 1) { t.fail(`expected 1 placement attempt, got ${placementAttempts}`); return; }
  if (schedule.includes("scheduled")) { t.fail("scheduled event must not fire on rejected placement"); return; }

  rejectPlacement = false;
  const r2 = await liveTick("BTCUSDT", BASE + 1 * MIN + 20_000, CTX); // тот же интервал: ретрай без ожидания границы
  if (r2.action !== "scheduled") { t.fail(`expected scheduled on retry, got ${r2.action}`); return; }
  if (placementAttempts !== 2) { t.fail(`expected 2nd placement attempt, got ${placementAttempts}`); return; }
  if (!schedule.includes("scheduled")) { t.fail("scheduled event missing after accepted placement"); return; }
  t.pass("rejected placement is not registered, throttle rolls back, next tick retries and succeeds");
});

// 4. Broker.onOrderOpenCommit (type=active) бросает при АКТИВАЦИИ scheduled:
//    терминальная отмена (não ретрай) — resting снят, адаптер уведомлён
test("broker openCommit throw (active) at scheduled activation terminally cancels", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("bc4-ex", () => px);

  const CTX = { strategyName: "bc4-strat", exchangeName: "bc4-ex", frameName: "" };
  const calls = [];
  Broker.useBrokerAdapter(class {
    async onOrderOpenCommit(p) {
      calls.push({ m: "openCommit", type: p.type });
      if (p.type === "active") {
        throw new Error("exchange reports our resting order was NOT filled");
      }
    }
    async onSignalScheduleCancelled(p) { calls.push({ m: "scheduleCancelled", reason: p.reason }); }
  });
  Broker.enable();

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

  px = 48500; // кроссинг priceOpen -> попытка активации -> sync-гейт бросает
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (signals.includes("opened")) { t.fail("position opened through a rejected activation fill"); return; }
  if (!schedule.includes("cancelled")) {
    t.fail(`terminal cancel missing on schedule channel: ${schedule.join(",")} (tick2=${r2.action})`);
    return;
  }
  if (!calls.some((c) => c.m === "openCommit" && c.type === "active")) {
    t.fail("activation fill confirm never reached the adapter");
    return;
  }
  if (!calls.some((c) => c.m === "scheduleCancelled")) {
    t.fail(`adapter was not told to cancel the resting order: ${JSON.stringify(calls)}`);
    return;
  }
  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r3.action === "waiting" || r3.action === "opened") {
    t.fail(`activation reject must be terminal, got ${r3.action} on the next tick`);
    return;
  }
  t.pass("rejected activation fill terminally cancels the scheduled order and notifies the adapter");
});

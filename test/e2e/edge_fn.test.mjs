import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  overrideStrategySchema,
  setConfig,
  PersistSignalAdapter,
  PersistScheduleAdapter,
  PersistStrategyAdapter,
  PersistCandleAdapter,
  PersistRiskAdapter,
  MethodContextService,
  runInMockContext,
  Broker,
  listenSignal,
  listenScheduleEvent,
  listenCheck,
  listenError,
  commitTrailingStopCost,
  commitPartialProfit,
  commitPartialLossCost,
  commitCreateSignal,
  commitCreateStopLoss,
  commitCreateTakeProfit,
  commitClosePending,
  commitCancelScheduled,
  commitActivateScheduled,
  getTotalCostClosed,
  getStrategyStatus,
  lib,
} from "../../build/index.mjs";

// Пункты 2/3/4/6/10: short-зеркала *Cost-канона, гонки deferred-команд,
// 100%-партиал, негативные аргументы, restore при смене схемы.

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

const inMock = (fn, whenMs, CTX) =>
  runInMockContext(fn, {
    when: new Date(whenMs),
    strategyName: CTX.strategyName,
    exchangeName: CTX.exchangeName,
    frameName: CTX.frameName,
    symbol: "BTCUSDT",
    backtest: false,
  });

const LONG_DTO = { position: "long", priceTakeProfit: 55000, priceStopLoss: 46000, minuteEstimatedTime: 600 };
const SHORT_DTO = { position: "short", priceTakeProfit: 45000, priceStopLoss: 54000, minuteEstimatedTime: 600 };
const SCHEDULED_DTO = { position: "long", priceOpen: 49000, priceTakeProfit: 55000, priceStopLoss: 46000, minuteEstimatedTime: 600 };

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ===== №2: SHORT-зеркала =====

// S1. short + commitTrailingStopCost: SL СВЕРХУ, тянем вниз к цене
test("short commitTrailingStopCost pulls the upper stop down and closes there", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("e1-ex", () => px);

  const CTX = { strategyName: "e1-strat", exchangeName: "e1-ex", frameName: "" };
  const brokerCalls = [];
  Broker.useBrokerAdapter(class {
    async onTrailingStopCommit(p) { brokerCalls.push(p); }
  });
  Broker.enable();

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SHORT_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  // entry 50000, original SL 54000 (dist 8%), новый SL 52000 (dist 4%) -> shift -4
  const ok = await inMock(() => commitTrailingStopCost("BTCUSDT", 52000), BASE + 1 * MIN + 5000, CTX);
  if (!ok) { t.fail("short trailingStopCost returned false"); return; }
  const bp = brokerCalls[0];
  if (!bp || !near(bp.newStopLossPrice, 52000) || !near(bp.percentShift, -4)) {
    t.fail(`broker payload mismatch: ${JSON.stringify(bp)}`);
    return;
  }

  px = 51500; // ниже нового SL — шорт жив
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "active") { t.fail(`tick2 expected active, got ${r2.action}`); return; }

  px = 52100; // выше нового SL 52000 (но ниже исходного 54000)
  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r3.action !== "closed" || r3.closeReason !== "stop_loss") {
    t.fail(`expected stop_loss at trailed 52000, got ${r3.action}/${r3.closeReason}`);
    return;
  }
  t.pass("short SL trailed 54000->52000 (shift -4), closed on the way UP at the new level");
});

// S2. short + commitPartialLossCost: убыток при РОСТЕ цены, доллары от остатка
test("short commitPartialLossCost cuts exact dollars while price rises", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("e2-ex", () => px);

  const CTX = { strategyName: "e2-strat", exchangeName: "e2-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SHORT_DTO, cost: 300 })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  px = 52000; // рост = убыток шорта (-4%)
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);

  const ok1 = await inMock(() => commitPartialLossCost("BTCUSDT", 150), BASE + 2 * MIN + 5000, CTX);
  if (!ok1) { t.fail("short partialLossCost(150) returned false"); return; }
  const rem1 = await inMock(() => getTotalCostClosed("BTCUSDT"), BASE + 2 * MIN + 6000, CTX);
  if (!near(rem1, 150)) { t.fail(`remaining expected 150, got ${rem1}`); return; }

  const ok2 = await inMock(() => commitPartialLossCost("BTCUSDT", 75), BASE + 2 * MIN + 10_000, CTX);
  if (!ok2) { t.fail("short partialLossCost(75) returned false"); return; }
  const rem2 = await inMock(() => getTotalCostClosed("BTCUSDT"), BASE + 2 * MIN + 11_000, CTX);
  if (!near(rem2, 75)) { t.fail(`remaining expected 75, got ${rem2}`); return; }
  t.pass("short: $300 - $150 - $75 -> $75 remaining while price is UP");
});

// S3. short + commitCreateStopLoss: подтверждённый SL-fill мимо VWAP
test("short confirmed SL fill closes stop_loss bypassing VWAP", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("e3-ex", () => 50000); // VWAP не доходит до SL 54000

  const CTX = { strategyName: "e3-strat", exchangeName: "e3-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SHORT_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => commitCreateStopLoss("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "closed" || r2.closeReason !== "stop_loss") {
    t.fail(`expected closed/stop_loss, got ${r2.action}/${r2.closeReason}`);
    return;
  }
  t.pass("short confirmed SL fill drains to stop_loss with VWAP at entry");
});

// ===== №3: гонки deferred-команд =====

// R1. Двойной closePending до дренажа: ровно одно закрытие, без дублей
test("double commitClosePending before drain yields exactly one close", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("e4-ex", () => 50000);

  const CTX = { strategyName: "e4-strat", exchangeName: "e4-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...LONG_DTO })),
  });

  const closes = [];
  listenSignal((e) => { if (e.action === "closed") closes.push(e); });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => commitClosePending("BTCUSDT", { note: "first" }), BASE + 1 * MIN + 5000, CTX);
  await inMock(() => commitClosePending("BTCUSDT", { note: "second" }), BASE + 1 * MIN + 6000, CTX);

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "closed") { t.fail(`tick2 ${r2.action}`); return; }
  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r3.action === "closed") { t.fail("second tick produced a duplicate close"); return; }
  await new Promise((r) => setTimeout(r, 100));
  if (closes.length !== 1) { t.fail(`expected exactly 1 closed event, got ${closes.length}`); return; }
  t.pass("double deferred close collapses into a single closed event");
});

// R2. cancelScheduled ПОСЛЕ activateScheduled: активация побеждает — activate
// уже переместил scheduled в _activatedSignal (филл случился на бирже),
// последующему cancel отменять нечего (no-op). Пиннинг фактического контракта.
test("queued activation wins over a later cancelScheduled (fill already happened)", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("e5-ex", () => 50000);

  const CTX = { strategyName: "e5-strat", exchangeName: "e5-ex", frameName: "" };
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
  await inMock(() => commitCancelScheduled("BTCUSDT"), BASE + 1 * MIN + 6000, CTX);

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  await new Promise((r) => setTimeout(r, 100));
  if (r2.action !== "opened" || !signals.includes("opened")) {
    t.fail(`activation must win (fill already happened): tick2=${r2.action}, signals=${signals.join(",")}`);
    return;
  }
  if (schedule.includes("cancelled")) {
    t.fail("later cancel must be a no-op once activation consumed the scheduled order");
    return;
  }
  // Позиция открыта по priceOpen scheduled-ордера (базис = цена нашего филла)
  if (!near(r2.signal.priceOpen, 49000)) {
    t.fail(`activation basis must be the scheduled priceOpen 49000, got ${r2.signal.priceOpen}`);
    return;
  }
  t.pass("activation consumed the scheduled order; the later cancel is a no-op; basis = scheduled priceOpen");
});

// R3. closePending без pending: no-op, ничего не ломает
test("commitClosePending without a pending position is a safe no-op", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("e6-ex", () => 50000);

  const CTX = { strategyName: "e6-strat", exchangeName: "e6-ex", frameName: "" };
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => null,
  });

  await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  await inMock(() => commitClosePending("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);
  const status = await inMock(() => getStrategyStatus("BTCUSDT"), BASE + 1 * MIN + 6000, CTX);
  if (status.closedSignal) { t.fail("no-op close must not defer anything"); return; }
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "idle") { t.fail(`tick after no-op close must stay idle, got ${r2.action}`); return; }
  t.pass("closePending on idle strategy defers nothing and the loop stays idle");
});

// R4. TP-fill и user-close в одном промежутке: одно закрытие, детерминированный reason
test("confirmed TP fill and user close queued together produce a single close", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("e7-ex", () => 50000);

  const CTX = { strategyName: "e7-strat", exchangeName: "e7-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...LONG_DTO })),
  });

  const closes = [];
  listenSignal((e) => { if (e.action === "closed") closes.push(e.closeReason); });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => commitCreateTakeProfit("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);
  await inMock(() => commitClosePending("BTCUSDT"), BASE + 1 * MIN + 6000, CTX);

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "closed") { t.fail(`tick2 ${r2.action}`); return; }
  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r3.action === "closed") { t.fail("duplicate close on the next tick"); return; }
  await new Promise((r) => setTimeout(r, 100));
  if (closes.length !== 1) { t.fail(`expected 1 close, got ${closes.length}: ${closes.join(",")}`); return; }
  if (closes[0] !== "take_profit") {
    t.fail(`broker-confirmed TP fill must win over user close, got ${closes[0]}`);
    return;
  }
  t.pass("TP fill + user close collapse into one closed/take_profit");
});

// ===== №4: 100%-партиал =====

test("100% partial profit empties the basis; position fate is pinned", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("e8-ex", () => px);

  const CTX = { strategyName: "e8-strat", exchangeName: "e8-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...LONG_DTO, cost: 300 })),
  });

  const closes = [];
  listenSignal((e) => { if (e.action === "closed") closes.push(e.closeReason); });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  px = 51000;
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);

  const ok = await inMock(() => commitPartialProfit("BTCUSDT", 100), BASE + 2 * MIN + 5000, CTX);
  if (!ok) { t.fail("partialProfit(100) rejected"); return; }
  const remaining = await inMock(() => getTotalCostClosed("BTCUSDT"), BASE + 2 * MIN + 6000, CTX);
  if (remaining !== null) { t.fail(`position must be auto-closed after 100% partial (getter null), got ${remaining}`); return; }

  const r2 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  await new Promise((r) => setTimeout(r, 100));
  // Пиннинг НОВОГО контракта: 100%-партиал закрывает позицию — нулевой остаток
  // маршрутизируется в deferred-close (note "full_partial_close"), следующий
  // tick дренит closed/"closed"; зомби с нулевым базисом больше не доживает до
  // TP и не попадает в статистику полноценной сделкой.
  if (r2.action !== "closed" || r2.closeReason !== "closed") {
    t.fail(`pinned contract: zero-basis position auto-closes (closed/"closed"), got ${r2.action}/${r2.closeReason}`);
    return;
  }
  if (closes.length !== 1 || closes[0] !== "closed") { t.fail(`exactly one closed/"closed" expected, got: ${closes.join(",")}`); return; }
  px = 55500; // рынок уходит к бывшему TP — дублей закрытия быть не должно
  const r3 = await liveTick("BTCUSDT", BASE + 4 * MIN, CTX);
  if (r3.action === "closed") {
    t.fail(`duplicate close after auto-close: ${r3.action}/${r3.closeReason}`);
    return;
  }
  t.pass("100% partial auto-closes the zero-basis position; no ghost, no duplicate close");
});

// ===== №6: негативные аргументы =====

test("invalid partial percents are rejected and do not mutate the position", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("e9-ex", () => px);

  const CTX = { strategyName: "e9-strat", exchangeName: "e9-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...LONG_DTO, cost: 300 })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }
  px = 51000;
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);

  const zero = await inMock(() => commitPartialProfit("BTCUSDT", 0), BASE + 2 * MIN + 5000, CTX);
  const negative = await inMock(() => commitPartialProfit("BTCUSDT", -5), BASE + 2 * MIN + 6000, CTX);
  const over = await inMock(() => commitPartialProfit("BTCUSDT", 150), BASE + 2 * MIN + 7000, CTX);
  if (zero !== false || negative !== false || over !== false) {
    t.fail(`invalid percents must be rejected: 0=${zero} -5=${negative} 150=${over}`);
    return;
  }
  const remaining = await inMock(() => getTotalCostClosed("BTCUSDT"), BASE + 2 * MIN + 8000, CTX);
  if (!near(remaining, 300)) { t.fail(`position mutated by rejected partials: ${remaining}`); return; }
  t.pass("0 / -5 / 150 percent all rejected, basis untouched at $300");
});

test("dollar amount above the remaining basis is rejected", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("e10-ex", () => px);

  const CTX = { strategyName: "e10-strat", exchangeName: "e10-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...LONG_DTO, cost: 300 })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }
  px = 48000;
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);

  const over = await inMock(() => commitPartialLossCost("BTCUSDT", 400), BASE + 2 * MIN + 5000, CTX);
  if (over !== false) { t.fail("$400 of $300 must be rejected"); return; }
  const remaining = await inMock(() => getTotalCostClosed("BTCUSDT"), BASE + 2 * MIN + 6000, CTX);
  if (!near(remaining, 300)) { t.fail(`basis mutated: ${remaining}`); return; }
  t.pass("$400 off a $300 basis rejected, basis untouched");
});

test("commitCreateSignal with an alien symbol never opens and surfaces the mismatch", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("e11-ex", () => 50000);

  const CTX = { strategyName: "e11-strat", exchangeName: "e11-ex", frameName: "" };
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => null,
  });

  const errors = [];
  listenError((e) => errors.push(String(e?.message ?? e)));
  const signals = [];
  listenSignal((e) => signals.push(e.action));

  await liveTick("BTCUSDT", BASE + 1 * MIN, CTX); // сеет цену
  await inMock(
    () => commitCreateSignal("BTCUSDT", { ...LONG_DTO, symbol: "ETHUSDT" }),
    BASE + 1 * MIN + 5000,
    CTX,
  );
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  await new Promise((r) => setTimeout(r, 100));

  if (signals.includes("opened") || r2.action === "opened") {
    t.fail("alien-symbol DTO must never open a position");
    return;
  }
  if (!errors.some((m) => m.toLowerCase().includes("symbol"))) {
    t.fail(`symbol mismatch must surface on the error channel: ${errors.join(" | ").slice(0, 200)}`);
    return;
  }
  t.pass("alien symbol in user DTO: no position, mismatch surfaced via listenError");
});

// ===== №10: restore при смене схемы =====

test("restored pending survives a schema interval change; new interval throttles after close", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("e12-ex", () => px);

  const CTX = { strategyName: "e12-strat", exchangeName: "e12-ex", frameName: "" };
  let calls = 0;
  let allow = true;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => {
      calls += 1;
      if (!allow) return null;
      allow = false;
      return { ...LONG_DTO };
    },
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }
  const openedId = r1.signal.id;
  const callsBeforeRestart = calls;

  // «Рестарт» с изменённой схемой: interval 1m -> 5m
  overrideStrategySchema({ strategyName: CTX.strategyName, interval: "5m" });
  await Object.getPrototypeOf(lib.strategyConnectionService).clear();

  // Restored pending жив под новой схемой и мониторится по СВОИМ уровням
  const r2 = await liveTick("BTCUSDT", BASE + 6 * MIN, CTX);
  if (r2.action !== "active" || r2.signal.id !== openedId) {
    t.fail(`restored pending must survive the schema change: ${r2.action}/${r2.signal?.id}`);
    return;
  }
  if (calls !== callsBeforeRestart) {
    t.fail("generator must stay silent while a restored pending exists");
    return;
  }

  // Закрываем по TP сигнала (уровни из ПЕРСИСТА, не из схемы)
  px = 55500;
  const r3 = await liveTick("BTCUSDT", BASE + 7 * MIN, CTX);
  if (r3.action !== "closed" || r3.closeReason !== "take_profit") {
    t.fail(`restored levels must close the position: ${r3.action}/${r3.closeReason}`);
    return;
  }

  // Новый interval 5m троттлит генератор: два тика в одном 5m-окне = 1 вызов
  px = 50000;
  const base10 = BASE + 10 * MIN;
  await liveTick("BTCUSDT", base10 + 10_000, CTX);
  await liveTick("BTCUSDT", base10 + 4 * MIN, CTX); // то же 5m-окно 10:00-15:00
  const afterWindow = calls;
  await liveTick("BTCUSDT", BASE + 15 * MIN + 10_000, CTX); // новое окно
  if (afterWindow !== callsBeforeRestart + 1 || calls !== callsBeforeRestart + 2) {
    t.fail(`5m throttle wrong: window=${afterWindow - callsBeforeRestart}, next=${calls - afterWindow}`);
    return;
  }
  t.pass("schema restart: pending restored intact, closed by persisted TP, generator obeys the NEW interval");
});

// ===== №7: гонка order-check пинга × deferred-команды =====

/**
 * Слушатель check-пинга (type "active") подтверждает TP-филл через
 * commitCreateTakeProfit, когда VWAP УЖЕ выше TP. До гарда tick падал с
 * TypeError: пинг зануляет _pendingSignal посреди тика, а completion-чек /
 * CLOSE_AS_CLOSED получали null. С гардом: tick → idle (филл в deferred-слоте),
 * следующий tick закрывает ОДИН раз по эффективному TP (не по VWAP), без
 * дубля VWAP-закрытия и без "closed" поверх подтверждённого филла.
 */
test("check-ping triggering createTakeProfit while VWAP is already at TP closes once by the fill", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("e9-ex", () => px);

  const CTX = { strategyName: "e9-strat", exchangeName: "e9-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...LONG_DTO })),
  });

  const closes = [];
  listenSignal((e) => { if (e.action === "closed") closes.push(`${e.closeReason}@${e.currentPrice}`); });
  const errors = [];
  listenError((e) => errors.push(String(e?.message ?? e)));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  // VWAP уходит ВЫШЕ TP (55000); на пинге адаптер подтверждает реальный филл
  px = 55500;
  let pings = 0;
  const unsubCheck = listenCheck(async (event) => {
    if (event.type !== "active" || event.strategyName !== CTX.strategyName) return;
    pings += 1;
    if (pings === 1) {
      await commitCreateTakeProfit("BTCUSDT");
    }
  }, true);

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "idle") {
    unsubCheck();
    t.fail(`tick2 expected "idle" (pending consumed by fill mid-ping), got ${r2.action}/${r2.closeReason}`);
    return;
  }

  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  unsubCheck();
  if (r3.action !== "closed" || r3.closeReason !== "take_profit") {
    t.fail(`tick3 expected closed/take_profit (deferred fill drained), got ${r3.action}/${r3.closeReason}`);
    return;
  }
  if (!near(r3.currentPrice, 55000)) {
    t.fail(`fill must close at the effective TP 55000 (not VWAP 55500), got ${r3.currentPrice}`);
    return;
  }
  await new Promise((r) => setTimeout(r, 100));
  if (closes.length !== 1 || !closes[0].startsWith("take_profit")) {
    t.fail(`exactly one take_profit close expected (no VWAP double-close), got: ${closes.join(",")}`);
    return;
  }
  if (errors.length !== 0) { t.fail(`no errors expected, got: ${errors.join(" | ")}`); return; }
  t.pass(`check-ping fill wins: single closed/take_profit@55000, tick survived (idle), pings=${pings}`);
});

/**
 * Зеркало для scheduled: слушатель check-пинга (type "schedule") активирует
 * resting-ордер через commitActivateScheduled. До гарда tick падал с TypeError
 * (timeout-чек на null). С гардом: idle, следующий tick дренит активацию —
 * opened по priceOpen.
 */
test("schedule-ping triggering activateScheduled defers the activation instead of crashing the tick", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("e10-ex", () => 50000);

  const CTX = { strategyName: "e10-strat", exchangeName: "e10-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
  });

  const errors = [];
  listenError((e) => errors.push(String(e?.message ?? e)));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "scheduled") { t.fail(`tick1 ${r1.action}`); return; }

  let pings = 0;
  const unsubCheck = listenCheck(async (event) => {
    if (event.type !== "schedule" || event.strategyName !== CTX.strategyName) return;
    pings += 1;
    if (pings === 1) {
      await commitActivateScheduled("BTCUSDT");
    }
  }, true);

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "idle") {
    unsubCheck();
    t.fail(`tick2 expected "idle" (scheduled consumed by activation mid-ping), got ${r2.action}`);
    return;
  }

  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  unsubCheck();
  if (r3.action !== "opened" || !near(r3.signal.priceOpen, 49000)) {
    t.fail(`tick3 expected opened@49000 (deferred activation drained), got ${r3.action}@${r3.signal?.priceOpen}`);
    return;
  }
  if (errors.length !== 0) { t.fail(`no errors expected, got: ${errors.join(" | ")}`); return; }
  t.pass(`schedule-ping activation deferred cleanly: idle → opened@49000, pings=${pings}`);
});

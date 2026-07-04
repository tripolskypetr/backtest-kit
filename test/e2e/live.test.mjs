import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addActionSchema,
  ActionBase,
  setConfig,
  PersistSignalAdapter,
  PersistScheduleAdapter,
  PersistStrategyAdapter,
  PersistCandleAdapter,
  PersistRiskAdapter,
  listenScheduleEvent,
  listenSignal,
  listenSignalLive,
  listenSignalBacktest,
  listenSync,
  MethodContextService,
  lib,
} from "../../build/index.mjs";

// Live-специфические ветки на герметичном live-тик харнесе:
// in-memory адаптеры в скоупе test(), тик через MethodContextService.runInContext,
// VWAP всегда отражает текущую цену (Candle-адаптер с постоянным miss).

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

// 1. Отказ schedule-пинга (onOrderCheck type=schedule -> false): resting-ордер
//    пропал с биржи -> scheduled отменяется через cancel-пайплайн
test("live schedule-ping rejection cancels the scheduled signal", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("l1-ex", () => 50000);

  const CTX = { strategyName: "l1-strat", exchangeName: "l1-ex", frameName: "" };
  let rejectPing = false;
  const checkTypes = [];
  addActionSchema({
    actionName: "l1-action",
    handler: class extends ActionBase {},
    callbacks: {
      onOrderCheck: (event) => {
        checkTypes.push(event.type);
        if (event.type === "schedule" && rejectPing) {
          throw new Error("resting order vanished on the exchange");
        }
      },
    },
  });

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    actions: ["l1-action"],
    getSignal: async () => (emitted ? null : ((emitted = true), { ...SCHEDULED_DTO })),
  });

  const schedule = [];
  listenScheduleEvent((e) => schedule.push(e.action));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "scheduled") { t.fail(`tick1 ${r1.action}`); return; }

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "waiting") { t.fail(`tick2 expected waiting, got ${r2.action}`); return; }
  if (!checkTypes.includes("schedule")) { t.fail("schedule ping never reached onOrderCheck"); return; }

  rejectPing = true;
  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r3.action !== "cancelled") { t.fail(`expected cancelled after ping rejection, got ${r3.action}`); return; }
  if (!schedule.includes("cancelled")) { t.fail(`no cancelled schedule event: ${schedule.join(",")}`); return; }
  t.pass("rejected schedule ping cancels the resting order through the pipeline");
});

// 2. Live time_expired: pending живёт minuteEstimatedTime и закрывается по VWAP
test("live pending expires by minuteEstimatedTime with time_expired close", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("l2-ex", () => 50000); // цена не трогает TP/SL

  const CTX = { strategyName: "l2-strat", exchangeName: "l2-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO, minuteEstimatedTime: 5 })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  const r2 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r2.action !== "active") { t.fail(`tick2 expected active, got ${r2.action}`); return; }

  const r3 = await liveTick("BTCUSDT", BASE + 8 * MIN, CTX);
  if (r3.action !== "closed" || r3.closeReason !== "time_expired") {
    t.fail(`expected closed/time_expired, got ${r3.action}/${r3.closeReason}`);
    return;
  }
  t.pass("live pending closed by time_expired exactly after its lifetime");
});

// 3. Live scheduled timeout: resting-ордер не активировался за CC_SCHEDULE_AWAIT_MINUTES
test("live scheduled signal cancels by schedule-await timeout", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60, CC_SCHEDULE_AWAIT_MINUTES: 3 }, true);
  makePriceExchange("l3-ex", () => 50000); // никогда не пересекает 49000

  const CTX = { strategyName: "l3-strat", exchangeName: "l3-ex", frameName: "" };
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

  const r3 = await liveTick("BTCUSDT", BASE + 6 * MIN, CTX);
  if (r3.action !== "cancelled") { t.fail(`expected timeout cancel, got ${r3.action}`); return; }
  if (!schedule.includes("cancelled")) { t.fail("no cancelled schedule event"); return; }
  t.pass("scheduled resting order cancelled by CC_SCHEDULE_AWAIT_MINUTES timeout in live");
});

// 4. Live TP по VWAP: цена дошла до TP между тиками -> closed/take_profit
test("live take-profit closes by VWAP crossing between ticks", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("l4-ex", () => px);

  const CTX = { strategyName: "l4-strat", exchangeName: "l4-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  px = 52500; // выше TP 52000
  const r2 = await liveTick("BTCUSDT", BASE + 7 * MIN, CTX);
  if (r2.action !== "closed" || r2.closeReason !== "take_profit") {
    t.fail(`expected closed/take_profit, got ${r2.action}/${r2.closeReason}`);
    return;
  }
  if (!(r2.pnl.pnlPercentage > 0)) { t.fail(`TP close must be profitable, pnl=${r2.pnl.pnlPercentage}`); return; }
  t.pass("VWAP TP crossing closes the live position with positive pnl");
});

// 5. Live SL по VWAP: цена упала ниже SL -> closed/stop_loss
test("live stop-loss closes by VWAP crossing between ticks", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("l5-ex", () => px);

  const CTX = { strategyName: "l5-strat", exchangeName: "l5-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  px = 45500; // ниже SL 46000
  const r2 = await liveTick("BTCUSDT", BASE + 7 * MIN, CTX);
  if (r2.action !== "closed" || r2.closeReason !== "stop_loss") {
    t.fail(`expected closed/stop_loss, got ${r2.action}/${r2.closeReason}`);
    return;
  }
  if (!(r2.pnl.pnlPercentage < 0)) { t.fail(`SL close must be negative, pnl=${r2.pnl.pnlPercentage}`); return; }
  t.pass("VWAP SL crossing closes the live position with negative pnl");
});

// 6. Live pre-activation SL-cancel: у scheduled цена пробила SL раньше активации
test("live scheduled cancels when price breaks stop-loss before activation", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("l6-ex", () => px);

  const CTX = { strategyName: "l6-strat", exchangeName: "l6-ex", frameName: "" };
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

  px = 45000; // сразу ниже SL 46000 — активация запрещена, отмена приоритетнее
  const r2 = await liveTick("BTCUSDT", BASE + 7 * MIN, CTX);
  if (r2.action !== "cancelled") { t.fail(`expected cancelled, got ${r2.action}`); return; }
  if (signals.includes("opened")) { t.fail("position must NOT open through the broken SL"); return; }
  if (!schedule.includes("cancelled")) { t.fail("no cancelled schedule event"); return; }
  t.pass("SL break before activation cancels the scheduled signal, never opening");
});

// 7. Interval-троттлинг getSignal в live: два тика внутри одного aligned-интервала
//    вызывают генератор один раз
test("live getSignal is throttled to one call per aligned interval", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("l7-ex", () => 50000);

  const CTX = { strategyName: "l7-strat", exchangeName: "l7-ex", frameName: "" };
  let calls = 0;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "5m",
    getSignal: async () => { calls += 1; return null; },
  });

  await liveTick("BTCUSDT", BASE + 5 * MIN + 10_000, CTX);
  await liveTick("BTCUSDT", BASE + 5 * MIN + 50_000, CTX); // тот же 5m-интервал
  await liveTick("BTCUSDT", BASE + 9 * MIN, CTX);          // всё ещё интервал 05:00-10:00
  if (calls !== 1) { t.fail(`expected 1 getSignal call within the interval, got ${calls}`); return; }

  await liveTick("BTCUSDT", BASE + 10 * MIN + 10_000, CTX); // новый интервал 10:00
  if (calls !== 2) { t.fail(`expected 2nd call on the next interval, got ${calls}`); return; }
  t.pass("getSignal fired once per aligned 5m interval across live ticks");
});

// 8. Канальность live: события идут в listenSignalLive и listenSignal,
//    listenSignalBacktest молчит; listenSync получает open И close с type=active
test("live events route to live channel and sync open/close pair", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("l8-ex", () => px);

  const CTX = { strategyName: "l8-strat", exchangeName: "l8-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const liveEvents = [];
  const backtestEvents = [];
  const anyEvents = [];
  const syncEvents = [];
  listenSignalLive((e) => liveEvents.push(e.action));
  listenSignalBacktest((e) => backtestEvents.push(e.action));
  listenSignal((e) => anyEvents.push(e.action));
  listenSync((e) => syncEvents.push({ action: e.action, type: e.type, backtest: e.backtest }));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }
  px = 52500;
  const r2 = await liveTick("BTCUSDT", BASE + 7 * MIN, CTX);
  if (r2.action !== "closed") { t.fail(`tick2 ${r2.action}`); return; }

  if (!liveEvents.includes("opened") || !liveEvents.includes("closed")) {
    t.fail(`live channel incomplete: ${liveEvents.join(",")}`);
    return;
  }
  if (backtestEvents.length !== 0) {
    t.fail(`backtest channel must stay silent in live: ${backtestEvents.join(",")}`);
    return;
  }
  if (!anyEvents.includes("opened") || !anyEvents.includes("closed")) {
    t.fail(`combined channel incomplete: ${anyEvents.join(",")}`);
    return;
  }
  const syncOpen = syncEvents.find((e) => e.action === "signal-open" && e.type === "active");
  const syncClose = syncEvents.find((e) => e.action === "signal-close" && e.type === "active");
  if (!syncOpen || !syncClose) {
    t.fail(`sync open/close pair missing: ${JSON.stringify(syncEvents)}`);
    return;
  }
  if (syncOpen.backtest !== false || syncClose.backtest !== false) {
    t.fail("sync events must be flagged backtest=false in live");
    return;
  }
  t.pass("live routing: live+combined channels emit, backtest channel silent, sync pair typed active");
});

// 9. Out-of-context доступ (frontend-style): Price/TimeMetaService отдают
//    последний тик по идентификаторам БЕЗ контекстов
test("live meta services expose last tick price/time outside contexts", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("l9-ex", () => px);

  const CTX = { strategyName: "l9-strat", exchangeName: "l9-ex", frameName: "" };
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => null,
  });

  await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  px = 51000;
  await liveTick("BTCUSDT", BASE + 7 * MIN, CTX);

  // ВНЕ каких-либо контекстов — как это делает web-дашборд
  const price = await lib.priceMetaService.getCurrentPrice("BTCUSDT", CTX, false);
  const ts = await lib.timeMetaService.getTimestamp("BTCUSDT", CTX, false);

  if (price !== 51000) { t.fail(`expected last tick VWAP 51000, got ${price}`); return; }
  if (ts !== BASE + 7 * MIN) { t.fail(`expected last tick time ${BASE + 7 * MIN}, got ${ts}`); return; }
  t.pass("meta services serve last live tick data by identifiers without contexts");
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  setConfig,
  PersistSignalAdapter,
  PersistScheduleAdapter,
  PersistStrategyAdapter,
  PersistCandleAdapter,
  PersistRiskAdapter,
  MethodContextService,
  runInMockContext,
  Broker,
  Backtest,
  listenSignal,
  listenSignalNotify,
  listenStrategyCommit,
  commitTrailingStopCost,
  commitTrailingTakeCost,
  commitPartialLossCost,
  commitPartialProfit,
  commitCreateSignal,
  commitCreateStopLoss,
  commitClosePending,
  commitCancelScheduled,
  commitSignalNotify,
  getPositionEntryOverlap,
  getPositionPartialOverlap,
  hasNoPendingSignal,
  hasNoScheduledSignal,
  getStrategyStatus,
  getTotalPercentClosed,
  getTotalCostClosed,
  getTotalPercentHeld,
  getRemainingCostBasis,
  lib,
} from "../../build/index.mjs";

// Непокрытые функции канона src/function/strategy.ts (по матрице покрытия):
// price-based трейлинг (*Cost), долларовый partial loss, createSignal/createStopLoss
// канона, ladder-overlap, hasNo*, getStrategyStatus, commitSignalNotify, алиасы.
// Герметичный харнес: in-memory адаптеры в скоупе test().

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

const MARKET_DTO = { position: "long", priceTakeProfit: 55000, priceStopLoss: 46000, minuteEstimatedTime: 600 };
const SCHEDULED_DTO = { position: "long", priceOpen: 49000, priceTakeProfit: 55000, priceStopLoss: 46000, minuteEstimatedTime: 600 };

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// 1. commitTrailingStopCost (live): подтяжка SL к цене, брокер-payload
//    согласован round-trip'ом, закрытие ровно по НОВОМУ уровню
test("commitTrailingStopCost trails SL to an absolute price and closes there (live)", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("sf1-ex", () => px);

  const CTX = { strategyName: "sf1-strat", exchangeName: "sf1-ex", frameName: "" };
  const brokerCalls = [];
  Broker.useBrokerAdapter(class {
    async onTrailingStopCommit(p) { brokerCalls.push(p); }
  });
  Broker.enable();

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  const ok = await inMock(() => commitTrailingStopCost("BTCUSDT", 48000), BASE + 1 * MIN + 5000, CTX);
  if (!ok) { t.fail("commitTrailingStopCost returned false"); return; }
  const bp = brokerCalls[0];
  if (!bp || !near(bp.newStopLossPrice, 48000)) {
    t.fail(`broker newStopLossPrice mismatch: ${JSON.stringify(bp)}`);
    return;
  }
  // round-trip: original SL 46000, entry 50000 -> origDist 8%, newDist 4% -> shift -4
  if (!near(bp.percentShift, -4)) { t.fail(`percentShift expected -4, got ${bp.percentShift}`); return; }

  px = 48500; // выше нового SL — позиция жива
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "active") { t.fail(`tick2 expected active above trailed SL, got ${r2.action}`); return; }

  px = 47900; // ниже нового SL 48000 (но выше исходного 46000)
  const r3 = await liveTick("BTCUSDT", BASE + 3 * MIN, CTX);
  if (r3.action !== "closed" || r3.closeReason !== "stop_loss") {
    t.fail(`expected closed/stop_loss at trailed level, got ${r3.action}/${r3.closeReason}`);
    return;
  }
  t.pass("SL trailed to 48000 (shift -4 from ORIGINAL), position closed at the new level");
});

// 2. Второй сдвиг считается от ОРИГИНАЛЬНОГО уровня (пиннинг фикса 4-го прохода)
test("second commitTrailingStopCost converts from the ORIGINAL stop, not the trailed one", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("sf2-ex", () => px);

  const CTX = { strategyName: "sf2-strat", exchangeName: "sf2-ex", frameName: "" };
  const brokerCalls = [];
  Broker.useBrokerAdapter(class {
    async onTrailingStopCommit(p) { brokerCalls.push(p); }
  });
  Broker.enable();

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => commitTrailingStopCost("BTCUSDT", 48000), BASE + 1 * MIN + 5000, CTX);
  const ok2 = await inMock(() => commitTrailingStopCost("BTCUSDT", 49000), BASE + 1 * MIN + 10_000, CTX);
  if (!ok2) { t.fail("second trailing returned false"); return; }
  const bp = brokerCalls[1];
  // от ОРИГИНАЛА: newDist 2%, origDist 8% -> shift -6 (а не -2 от эффективного 48000)
  if (!bp || !near(bp.percentShift, -6)) {
    t.fail(`second shift must be -6 from ORIGINAL, got ${bp?.percentShift}`);
    return;
  }
  px = 48900; // ниже эффективного SL 49000
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "closed" || r2.closeReason !== "stop_loss") {
    t.fail(`expected stop_loss at 49000, got ${r2.action}/${r2.closeReason}`);
    return;
  }
  t.pass("second absolute trail converted from ORIGINAL level (-6), effective SL 49000 honored");
});

// 3. commitTrailingTakeCost (live): подтяжка TP вниз, закрытие take_profit по новому уровню
test("commitTrailingTakeCost trails TP to an absolute price and closes there (live)", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("sf3-ex", () => px);

  const CTX = { strategyName: "sf3-strat", exchangeName: "sf3-ex", frameName: "" };
  const brokerCalls = [];
  Broker.useBrokerAdapter(class {
    async onTrailingTakeCommit(p) { brokerCalls.push(p); }
  });
  Broker.enable();

  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  const ok = await inMock(() => commitTrailingTakeCost("BTCUSDT", 51000), BASE + 1 * MIN + 5000, CTX);
  if (!ok) { t.fail("commitTrailingTakeCost returned false"); return; }
  const bp = brokerCalls[0];
  if (!bp || !near(bp.newTakeProfitPrice, 51000)) {
    t.fail(`broker newTakeProfitPrice mismatch: ${JSON.stringify(bp)}`);
    return;
  }
  // original TP 55000 (dist 10%), new 51000 (dist 2%) -> shift -8
  if (!near(bp.percentShift, -8)) { t.fail(`percentShift expected -8, got ${bp.percentShift}`); return; }

  px = 51200; // выше нового TP 51000, ниже исходного 55000
  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "closed" || r2.closeReason !== "take_profit") {
    t.fail(`expected take_profit at trailed level, got ${r2.action}/${r2.closeReason}`);
    return;
  }
  if (!(r2.pnl.pnlPercentage > 0)) { t.fail(`trailed TP close must be profitable, got ${r2.pnl.pnlPercentage}`); return; }
  t.pass("TP trailed to 51000 (shift -8 from ORIGINAL), position closed take_profit at the new level");
});

// 4. Backtest-близнец: commitTrailingStopCost из onActivePing -> stop_loss в бектесте
test("commitTrailingStopCost from onActivePing closes stop_loss in backtest", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  // 00:00-00:04 = 50000 (open + active), 00:05+ = 47900 (ниже нового SL 48000)
  makePriceExchange("sf4-ex", (ts) => (ts < BASE + 5 * MIN ? 50000 : 47900));
  addFrameSchema({
    frameName: "sf4-frame",
    interval: "1m",
    startDate: new Date(BASE),
    endDate: new Date(BASE + 15 * MIN),
  });

  const CTX = { strategyName: "sf4-strat", exchangeName: "sf4-ex", frameName: "sf4-frame" };
  let emitted = false;
  let trailed = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
    callbacks: {
      onActivePing: async (symbol) => {
        if (trailed) return;
        trailed = true;
        await commitTrailingStopCost(symbol, 48000); // контексты активны в колбэке
      },
    },
  });

  const results = [];
  for await (const r of Backtest.run("BTCUSDT", CTX)) results.push(r);

  const closed = results.find((r) => r.action === "closed");
  if (!closed || closed.closeReason !== "stop_loss") {
    t.fail(`expected stop_loss close in backtest, got ${results.map((r) => r.action).join(",")}`);
    return;
  }
  t.pass("backtest twin: absolute SL trail from onActivePing triggers stop_loss at 48000");
});

// 5. commitPartialLossCost (live): долларовая точность на ОСТАТОЧНОМ базисе
test("commitPartialLossCost closes exact dollars off the remaining basis (live)", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("sf5-ex", () => px);

  const CTX = { strategyName: "sf5-strat", exchangeName: "sf5-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO, cost: 300 })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  px = 48000; // убыточная зона для long
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);

  const ok1 = await inMock(() => commitPartialLossCost("BTCUSDT", 150), BASE + 2 * MIN + 5000, CTX);
  if (!ok1) { t.fail("first partialLossCost(150) returned false"); return; }
  const rem1 = await inMock(() => getTotalCostClosed("BTCUSDT"), BASE + 2 * MIN + 6000, CTX);
  if (!near(rem1, 150)) { t.fail(`remaining after $150: expected 150, got ${rem1}`); return; }

  const ok2 = await inMock(() => commitPartialLossCost("BTCUSDT", 75), BASE + 2 * MIN + 10_000, CTX);
  if (!ok2) { t.fail("second partialLossCost(75) returned false"); return; }
  const rem2 = await inMock(() => getTotalCostClosed("BTCUSDT"), BASE + 2 * MIN + 11_000, CTX);
  if (!near(rem2, 75)) { t.fail(`remaining after $75: expected 75 (not 112.5 from total-invested math), got ${rem2}`); return; }
  t.pass("$300 - $150 - $75 leaves exactly $75: dollar conversion uses the remaining basis");
});

// 6. Backtest-близнец partialLossCost из onActivePing (событие с точным процентом)
test("commitPartialLossCost from onActivePing emits 50% partial-loss in backtest", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("sf6-ex", (ts) => (ts < BASE + 2 * MIN ? 50000 : 48000));
  addFrameSchema({
    frameName: "sf6-frame",
    interval: "1m",
    startDate: new Date(BASE),
    endDate: new Date(BASE + 10 * MIN),
  });

  const CTX = { strategyName: "sf6-strat", exchangeName: "sf6-ex", frameName: "sf6-frame" };
  let emitted = false;
  let cut = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO, cost: 300 })),
    callbacks: {
      onActivePing: async (symbol, _data, currentPrice) => {
        // validatePartialLoss требует ощутимой глубины убытка — ждём дна (-4%),
        // а не первой красной свечи
        if (cut || currentPrice > 48000) return;
        cut = true;
        await commitPartialLossCost(symbol, 150);
      },
    },
  });

  const commits = [];
  listenStrategyCommit((e) => commits.push({ action: e.action, percent: e.percentToClose }));

  for await (const _r of Backtest.run("BTCUSDT", CTX)) { /* drain */ }
  await new Promise((r) => setTimeout(r, 150)); // queued-листенеру нужен тик на доставку

  const pl = commits.find((c) => c.action === "partial-loss");
  if (!pl) { t.fail(`no partial-loss commit: ${JSON.stringify(commits)}`); return; }
  if (!near(pl.percent, 50)) { t.fail(`$150 of $300 must be 50%, got ${pl.percent}`); return; }
  t.pass("backtest twin: $150 off $300 remaining converts to exactly 50%");
});

// 7. commitCreateStopLoss (live): подтверждённый SL-fill закрывает мимо VWAP
test("commitCreateStopLoss confirmed fill closes stop_loss bypassing VWAP", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("sf7-ex", () => 50000); // VWAP никогда не касается SL 46000

  const CTX = { strategyName: "sf7-strat", exchangeName: "sf7-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => commitCreateStopLoss("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "closed" || r2.closeReason !== "stop_loss") {
    t.fail(`expected closed/stop_loss from confirmed fill, got ${r2.action}/${r2.closeReason}`);
    return;
  }
  t.pass("confirmed SL fill drains to closed/stop_loss while VWAP stays at 50000");
});

// 8. commitCreateSignal — КАНОН из strategy.ts (класс-копии покрыты, канон не был)
test("commitCreateSignal canon defers a user signal that opens on the next tick", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("sf8-ex", () => 50000);

  const CTX = { strategyName: "sf8-strat", exchangeName: "sf8-ex", frameName: "" };
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => null, // стратегия сама не торгует
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX); // сеет цену
  if (r1.action !== "idle") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(() => commitCreateSignal("BTCUSDT", { ...MARKET_DTO }), BASE + 1 * MIN + 5000, CTX);

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  if (r2.action !== "opened") { t.fail(`expected opened from user-created signal, got ${r2.action}`); return; }
  t.pass("canon commitCreateSignal defers the DTO and the next tick opens the position");
});

// 9. Ladder-overlap: входные уровни и уровни партиалов, границы ±1.5%
test("getPositionEntryOverlap and getPositionPartialOverlap honor the ladder corridor", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("sf9-ex", () => px);

  const CTX = { strategyName: "sf9-strat", exchangeName: "sf9-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO, cost: 300 })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  // entry level = 50000, коридор ±1.5% => [49250, 50750]
  const inCorridor = await inMock(() => getPositionEntryOverlap("BTCUSDT", 50700), BASE + 1 * MIN + 5000, CTX);
  const onBoundary = await inMock(() => getPositionEntryOverlap("BTCUSDT", 50750), BASE + 1 * MIN + 5000, CTX);
  const outside = await inMock(() => getPositionEntryOverlap("BTCUSDT", 50800), BASE + 1 * MIN + 5000, CTX);
  if (inCorridor !== true || onBoundary !== true || outside !== false) {
    t.fail(`entry overlap wrong: in=${inCorridor} boundary=${onBoundary} out=${outside}`);
    return;
  }

  // партиал на 51000 -> partial level, коридор [50235, 51765]
  px = 51000;
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  const okPartial = await inMock(() => commitPartialProfit("BTCUSDT", 50), BASE + 2 * MIN + 5000, CTX);
  if (!okPartial) { t.fail("partialProfit(50) returned false"); return; }
  const nearPartial = await inMock(() => getPositionPartialOverlap("BTCUSDT", 51100), BASE + 2 * MIN + 6000, CTX);
  const farPartial = await inMock(() => getPositionPartialOverlap("BTCUSDT", 52000), BASE + 2 * MIN + 6000, CTX);
  if (nearPartial !== true || farPartial !== false) {
    t.fail(`partial overlap wrong: near=${nearPartial} far=${farPartial}`);
    return;
  }
  t.pass("ladder corridor: inside/boundary true, outside false for entries and partials");
});

// 10. hasNoPendingSignal / hasNoScheduledSignal по фазам
test("hasNoPendingSignal and hasNoScheduledSignal invert across lifecycle phases", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("sf10-ex", () => 50000);

  // Фаза scheduled
  const CTX_A = { strategyName: "sf10a-strat", exchangeName: "sf10-ex", frameName: "" };
  let emA = false;
  addStrategySchema({
    strategyName: CTX_A.strategyName,
    interval: "1m",
    getSignal: async () => (emA ? null : ((emA = true), { ...SCHEDULED_DTO })),
  });
  await liveTick("BTCUSDT", BASE + 1 * MIN, CTX_A);
  let noSch = await inMock(() => hasNoScheduledSignal("BTCUSDT"), BASE + 1 * MIN + 5000, CTX_A);
  let noPen = await inMock(() => hasNoPendingSignal("BTCUSDT"), BASE + 1 * MIN + 5000, CTX_A);
  if (noSch !== false || noPen !== true) { t.fail(`scheduled phase: noSch=${noSch} noPen=${noPen}`); return; }
  await inMock(() => commitCancelScheduled("BTCUSDT"), BASE + 1 * MIN + 6000, CTX_A);
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX_A); // дренаж отмены
  noSch = await inMock(() => hasNoScheduledSignal("BTCUSDT"), BASE + 2 * MIN + 5000, CTX_A);
  if (noSch !== true) { t.fail("after cancel drain hasNoScheduledSignal must be true"); return; }

  // Фаза pending
  const CTX_B = { strategyName: "sf10b-strat", exchangeName: "sf10-ex", frameName: "" };
  let emB = false;
  addStrategySchema({
    strategyName: CTX_B.strategyName,
    interval: "1m",
    getSignal: async () => (emB ? null : ((emB = true), { ...MARKET_DTO })),
  });
  await liveTick("BTCUSDT", BASE + 1 * MIN, CTX_B);
  noPen = await inMock(() => hasNoPendingSignal("BTCUSDT"), BASE + 1 * MIN + 5000, CTX_B);
  if (noPen !== false) { t.fail("pending phase: hasNoPendingSignal must be false"); return; }
  await inMock(() => commitClosePending("BTCUSDT"), BASE + 1 * MIN + 6000, CTX_B);
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX_B); // дренаж закрытия
  noPen = await inMock(() => hasNoPendingSignal("BTCUSDT"), BASE + 2 * MIN + 5000, CTX_B);
  if (noPen !== true) { t.fail("after close drain hasNoPendingSignal must be true"); return; }
  t.pass("hasNo* helpers track scheduled and pending phases through drains");
});

// 11. getStrategyStatus: снапшот отложенных операций
test("getStrategyStatus exposes deferred close snapshot bound to the pending id", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("sf11-ex", () => 50000);

  const CTX = { strategyName: "sf11-strat", exchangeName: "sf11-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const s0 = await inMock(() => getStrategyStatus("BTCUSDT"), BASE + 1 * MIN - 5000, CTX);
  if (s0.pendingSignalId !== null) { t.fail(`fresh status must have null pendingSignalId, got ${s0.pendingSignalId}`); return; }

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }
  const pendingId = r1.signal.id;

  await inMock(() => commitClosePending("BTCUSDT"), BASE + 1 * MIN + 5000, CTX);
  const s1 = await inMock(() => getStrategyStatus("BTCUSDT"), BASE + 1 * MIN + 6000, CTX);
  // Контракт live-closePending: pending очищается сразу (снапшот пишется уже
  // без него -> pendingSignalId null), отложенное закрытие живёт в closedSignal
  if (!s1.closedSignal) { t.fail("deferred close must appear in status.closedSignal before the drain"); return; }
  if (s1.pendingSignalId !== null) {
    t.fail(`snapshot after closePending must carry null pendingSignalId, got ${s1.pendingSignalId}`);
    return;
  }

  const r2 = await liveTick("BTCUSDT", BASE + 2 * MIN, CTX); // дренаж
  if (r2.action !== "closed" || r2.signal.id !== pendingId) {
    t.fail(`drain must close the SAME position: ${r2.action}/${r2.signal?.id} vs ${pendingId}`);
    return;
  }
  const s2 = await inMock(() => getStrategyStatus("BTCUSDT"), BASE + 2 * MIN + 5000, CTX);
  if (s2.closedSignal) { t.fail("closedSignal must clear after the drain"); return; }
  t.pass("status snapshot: null -> closedSignal (pending already detached) -> cleared after drain");
});

// 12. commitSignalNotify -> listenSignalNotify с пользовательским payload
test("commitSignalNotify delivers user payload to listenSignalNotify (live)", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  makePriceExchange("sf12-ex", () => 50000);

  const CTX = { strategyName: "sf12-strat", exchangeName: "sf12-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO })),
  });

  const notifications = [];
  listenSignalNotify((e) => notifications.push(e));

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }

  await inMock(
    () => commitSignalNotify("BTCUSDT", { notificationId: "tg-42", notificationNote: "manual heads-up" }),
    BASE + 1 * MIN + 5000,
    CTX,
  );
  // listener queued: даём микротику доставиться
  await new Promise((r) => setTimeout(r, 50));

  const evt = notifications.find((e) => JSON.stringify(e).includes("tg-42"));
  if (!evt) { t.fail(`notification not delivered: ${JSON.stringify(notifications).slice(0, 300)}`); return; }
  if (!JSON.stringify(evt).includes("manual heads-up")) { t.fail("notificationNote lost in transit"); return; }
  t.pass("signal notify carries notificationId and note to the listener");
});

// 13. Алиасы: Held == PercentClosed, RemainingCostBasis == CostClosed (после партиала)
test("alias getters equal their canonical counterparts after a partial", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);
  let px = 50000;
  makePriceExchange("sf13-ex", () => px);

  const CTX = { strategyName: "sf13-strat", exchangeName: "sf13-ex", frameName: "" };
  let emitted = false;
  addStrategySchema({
    strategyName: CTX.strategyName,
    interval: "1m",
    getSignal: async () => (emitted ? null : ((emitted = true), { ...MARKET_DTO, cost: 300 })),
  });

  const r1 = await liveTick("BTCUSDT", BASE + 1 * MIN, CTX);
  if (r1.action !== "opened") { t.fail(`tick1 ${r1.action}`); return; }
  px = 51000;
  await liveTick("BTCUSDT", BASE + 2 * MIN, CTX);
  await inMock(() => commitPartialProfit("BTCUSDT", 50), BASE + 2 * MIN + 5000, CTX);

  const when = BASE + 2 * MIN + 6000;
  const [held, closedPct, remaining, closedCost] = await inMock(
    async () => [
      await getTotalPercentHeld("BTCUSDT"),
      await getTotalPercentClosed("BTCUSDT"),
      await getRemainingCostBasis("BTCUSDT"),
      await getTotalCostClosed("BTCUSDT"),
    ],
    when,
    CTX,
  );
  if (held !== closedPct) { t.fail(`Held(${held}) != PercentClosed(${closedPct})`); return; }
  if (remaining !== closedCost) { t.fail(`RemainingCostBasis(${remaining}) != CostClosed(${closedCost})`); return; }
  if (!near(closedCost, 150)) { t.fail(`remaining after 50% of $300 must be $150, got ${closedCost}`); return; }
  t.pass(`aliases equal canon: held=${held}, remaining=$${closedCost} (semantics: 'Closed' returns the REMAINING share)`);
});

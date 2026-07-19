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
  listenPause,
  listenSignal,
  MethodContextService,
  Live,
  lib,
} from "../../build/index.mjs";

// Флаг _isPaused: пока true — GET_SIGNAL_FN не вызывает params.getSignal и не
// потребляет очередь createSignal (DTO держится до resume); открытая позиция
// мониторится и закрывается штатно. Флаг персистится в strategy-снапшот и
// восстанавливается на waitForInit БЕЗУСЛОВНО (не привязан к signalId).
// Хранилище — целиком in-memory в скоупе test(): нет диска, нет restore
// между запусками, нет подмешивания VWAP из файлового кэша свечей.

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
  // Свечной кэш: всегда мимо — каждый VWAP-запрос идёт в адаптер биржи и
  // отражает ТЕКУЩУЮ цену, без смешивания с прошлым тиком
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

const makeTick = (CTX) => (whenMs) =>
  MethodContextService.runInContext(
    () => lib.strategyCoreService.tick("BTCUSDT", new Date(whenMs), false, CTX),
    CTX,
  );

const flush = () => new Promise((res) => setTimeout(res, 50));

test("paused: getSignal is suppressed while paused and resumes on the next tick", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);

  makePriceExchange("paused-gen-ex", () => 50000);

  let getSignalCalls = 0;
  addStrategySchema({
    strategyName: "paused-gen-strat",
    interval: "1m",
    getSignal: async () => {
      getSignalCalls += 1;
      return null;
    },
  });

  const CTX = { strategyName: "paused-gen-strat", exchangeName: "paused-gen-ex", frameName: "" };
  const LIVE_CTX = { strategyName: CTX.strategyName, exchangeName: CTX.exchangeName };
  const tick = makeTick(CTX);

  // tick 1: обычная генерация (idle, но getSignal вызван)
  await tick(BASE + 1 * MIN);
  if (getSignalCalls !== 1) {
    t.fail(`expected 1 getSignal call after tick1, got ${getSignalCalls}`);
    return;
  }

  await Live.setPaused("BTCUSDT", true, LIVE_CTX);

  if (!(await Live.getPaused("BTCUSDT", LIVE_CTX))) {
    t.fail("getPaused must return true after setPaused(true)");
    return;
  }

  // Ticks 2-3: paused — getSignal НЕ вызывается, тики idle
  const r2 = await tick(BASE + 2 * MIN);
  const r3 = await tick(BASE + 3 * MIN);
  if (r2.action !== "idle" || r3.action !== "idle") {
    t.fail(`expected idle ticks while paused, got ${r2.action}/${r3.action}`);
    return;
  }
  if (getSignalCalls !== 1) {
    t.fail(`getSignal was called while paused: ${getSignalCalls} calls`);
    return;
  }

  await Live.setPaused("BTCUSDT", false, LIVE_CTX);

  // Resume: следующий же тик снова генерирует (троттл откатывается на паузе)
  await tick(BASE + 4 * MIN);
  if (getSignalCalls !== 2) {
    t.fail(`expected getSignal to resume after unpause, got ${getSignalCalls} calls`);
    return;
  }
  if (await Live.getPaused("BTCUSDT", LIVE_CTX)) {
    t.fail("getPaused must return false after setPaused(false)");
    return;
  }

  t.pass("pause suppresses getSignal; unpause resumes generation on the next tick");
});

test("paused: queued createSignal DTO is held while paused and drains after resume", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);

  makePriceExchange("paused-dto-ex", () => 50000);

  addStrategySchema({
    strategyName: "paused-dto-strat",
    interval: "1m",
    getSignal: async () => null,
  });

  const CTX = { strategyName: "paused-dto-strat", exchangeName: "paused-dto-ex", frameName: "" };
  const LIVE_CTX = { strategyName: CTX.strategyName, exchangeName: CTX.exchangeName };
  const tick = makeTick(CTX);

  // tick 1: сидируем time/price-мету для out-of-context команд
  await tick(BASE + 1 * MIN);

  // Очередь DTO (createSignal разрешён на паузе — пауза лишь придерживает потребление)
  await Live.setPaused("BTCUSDT", true, LIVE_CTX);
  await Live.commitCreateSignal("BTCUSDT", LIVE_CTX, {
    position: "long",
    priceTakeProfit: 52000,
    priceStopLoss: 46000,
    minuteEstimatedTime: 240,
  });

  // Ticks 2-3: DTO НЕ потребляется — тики idle, слот createdSignal занят
  const r2 = await tick(BASE + 2 * MIN);
  const r3 = await tick(BASE + 3 * MIN);
  if (r2.action !== "idle" || r3.action !== "idle") {
    t.fail(`expected idle ticks while paused, got ${r2.action}/${r3.action}`);
    return;
  }
  {
    const status = await Live.getStrategyStatus("BTCUSDT", LIVE_CTX);
    if (!status.createdSignal) {
      t.fail("queued createSignal DTO was consumed (or dropped) while paused");
      return;
    }
    if (status.isPaused !== true) {
      t.fail("getStrategyStatus().isPaused must be true while paused");
      return;
    }
  }

  await Live.setPaused("BTCUSDT", false, LIVE_CTX);

  // Resume: первый же тик потребляет DTO и открывает позицию по рынку
  const r4 = await tick(BASE + 4 * MIN);
  if (r4.action !== "opened") {
    t.fail(`expected opened after unpause, got ${r4.action}`);
    return;
  }
  {
    const status = await Live.getStrategyStatus("BTCUSDT", LIVE_CTX);
    if (status.createdSignal) {
      t.fail("createdSignal slot must be cleared after the DTO was consumed");
      return;
    }
  }

  t.pass("queued DTO is held while paused and opens the position on the first tick after resume");
});

test("paused: flag survives restart via strategy snapshot (unconditional restore)", async (t) => {
  const { kv } = useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);

  makePriceExchange("paused-restore-ex", () => 50000);

  let getSignalCalls = 0;
  addStrategySchema({
    strategyName: "paused-restore-strat",
    interval: "1m",
    getSignal: async () => {
      getSignalCalls += 1;
      return null;
    },
  });

  const CTX = { strategyName: "paused-restore-strat", exchangeName: "paused-restore-ex", frameName: "" };
  const LIVE_CTX = { strategyName: CTX.strategyName, exchangeName: CTX.exchangeName };
  const tick = makeTick(CTX);

  await tick(BASE + 1 * MIN);
  await Live.setPaused("BTCUSDT", true, LIVE_CTX);

  // Флаг попал в персист-снапшот стратегии
  const persisted = kv.get("str:BTCUSDT:paused-restore-strat:paused-restore-ex");
  if (!persisted || persisted.isPaused !== true) {
    t.fail(`persisted snapshot must carry isPaused=true, got ${JSON.stringify(persisted)}`);
    return;
  }

  // «Рестарт»: сбрасываем кэш инстансов — следующий тик делает waitForInit
  // и читает снапшот с диска (in-memory kv переживает сброс)
  await lib.strategyConnectionService.clear();

  const callsBeforeRestart = getSignalCalls;
  const r = await tick(BASE + 2 * MIN);
  if (r.action !== "idle") {
    t.fail(`expected idle after restart while paused, got ${r.action}`);
    return;
  }
  if (getSignalCalls !== callsBeforeRestart) {
    t.fail("getSignal was called after restart despite the restored pause flag");
    return;
  }
  if (!(await Live.getPaused("BTCUSDT", LIVE_CTX))) {
    t.fail("getPaused must return true after restart (unconditional restore)");
    return;
  }

  // Снятие паузы после рестарта возвращает генерацию
  await Live.setPaused("BTCUSDT", false, LIVE_CTX);
  await tick(BASE + 3 * MIN);
  if (getSignalCalls !== callsBeforeRestart + 1) {
    t.fail("getSignal did not resume after unpausing the restored strategy");
    return;
  }

  t.pass("pause flag survives restart through the strategy snapshot and unblocks after setPaused(false)");
});

test("paused: open position closes normally; onPause notifies once per actual flip", async (t) => {
  useMemoryPersist();
  setConfig({ CC_MAX_SIGNAL_GENERATION_SECONDS: 60 }, true);

  let marketPrice = 50000;
  makePriceExchange("paused-close-ex", () => marketPrice);

  let getSignalCalls = 0;
  let emitted = false;
  addStrategySchema({
    strategyName: "paused-close-strat",
    interval: "1m",
    getSignal: async () => {
      getSignalCalls += 1;
      if (emitted) return null;
      emitted = true;
      // Немедленное открытие по рынку
      return {
        position: "long",
        priceTakeProfit: 51000,
        priceStopLoss: 46000,
        minuteEstimatedTime: 240,
      };
    },
  });

  const pauseEvents = [];
  listenPause((e) => pauseEvents.push(e));

  const closedResults = [];
  listenSignal((e) => {
    if (e.action === "closed") closedResults.push(e);
  });

  const CTX = { strategyName: "paused-close-strat", exchangeName: "paused-close-ex", frameName: "" };
  const LIVE_CTX = { strategyName: CTX.strategyName, exchangeName: CTX.exchangeName };
  const tick = makeTick(CTX);

  // tick 1: позиция открыта
  const r1 = await tick(BASE + 1 * MIN);
  if (r1.action !== "opened") {
    t.fail(`expected opened on tick1, got ${r1.action}`);
    return;
  }

  await Live.setPaused("BTCUSDT", true, LIVE_CTX);
  // Повторный вызов с тем же значением — no-op: без второго уведомления
  await Live.setPaused("BTCUSDT", true, LIVE_CTX);
  await flush();

  if (pauseEvents.length !== 1 || pauseEvents[0].paused !== true) {
    t.fail(`expected exactly 1 pause event (paused=true), got ${JSON.stringify(pauseEvents.map((e) => e.paused))}`);
    return;
  }
  if (pauseEvents[0].symbol !== "BTCUSDT" || pauseEvents[0].strategyName !== "paused-close-strat") {
    t.fail("pause event carries wrong symbol/strategyName");
    return;
  }

  // tick 2: цена дошла до TP — позиция закрывается ШТАТНО несмотря на паузу
  marketPrice = 51500;
  const r2 = await tick(BASE + 2 * MIN);
  if (r2.action !== "closed" || r2.closeReason !== "take_profit") {
    t.fail(`expected take_profit close while paused, got ${r2.action}/${r2.closeReason ?? "-"}`);
    return;
  }

  // tick 3: новая генерация всё ещё заблокирована
  const callsAfterClose = getSignalCalls;
  const r3 = await tick(BASE + 3 * MIN);
  if (r3.action !== "idle") {
    t.fail(`expected idle after close while paused, got ${r3.action}`);
    return;
  }
  if (getSignalCalls !== callsAfterClose) {
    t.fail("getSignal was called while paused after the position closed");
    return;
  }

  await Live.setPaused("BTCUSDT", false, LIVE_CTX);
  await flush();

  if (pauseEvents.length !== 2 || pauseEvents[1].paused !== false) {
    t.fail(`expected 2nd pause event (paused=false), got ${JSON.stringify(pauseEvents.map((e) => e.paused))}`);
    return;
  }
  if (closedResults.length !== 1) {
    t.fail(`expected exactly 1 closed signal, got ${closedResults.length}`);
    return;
  }

  t.pass("position closes normally while paused; onPause fires once per actual flip (dedup works)");
});

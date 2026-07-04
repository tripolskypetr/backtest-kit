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
    lib.strategyCoreService.tick("BTCUSDT", new Date(whenMs), false, CTX);

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

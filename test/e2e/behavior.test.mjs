import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  listenSync,
  PersistStrategyAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Пиннинги поведения, ВЫЯВЛЕННОГО зондами (см. докстринги — каждый тест
// закрепляет фактический, ранее недокументированный контракт движка):
// - время жизни позиции/окно ожидания scheduled НЕ съедаются open-ретраями:
//   pendingAt/scheduledAt = момент ПОДТВЕРЖДЁННОГО открытия/размещения;
// - подписчики syncSubject зовутся в порядке подписки, бросок обрывает
//   доставку ПОСЛЕДУЮЩИМ подписчикам (механика вердикта = short-circuit);
// - упавшая запись pre-arm НЕ пускает гейт (ни одного неучтённого ордера),
//   тик пробрасывает ошибку наружу (Live-цикл ловит её и ретраит через свечу),
//   после починки диска ретрай продолжает с attempt=1 (консервативный инвариант).

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

const BASE_PRICE = 50000;

/**
 * BEHAVIOR: время жизни позиции НЕ съедается open-ретраями — pendingAt ставится
 * в момент ПОДТВЕРЖДЁННОГО открытия, не генерации. Сигнал с mET=2, рождённый в
 * t0 и открытый после двух отказов в t0+2min, живёт полные 2 минуты от
 * подтверждения (active на +3, time_expired ровно на +4), а не истекает
 * мгновенно от «старого» таймера.
 */
test("BEHAVIOR: open retries do not shorten the position's life — pendingAt is the confirmation time", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "bhv-lifetime-strategy",
    exchangeName: "binance-bhv-lifetime",
    frameName: "",
  };

  let gateCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "bhv lifetime",
      priceTakeProfit: BASE_PRICE + 15000,
      priceStopLoss: BASE_PRICE - 15000,
      minuteEstimatedTime: 2,
    }),
  });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    gateCalls += 1;
    if (gateCalls <= 2) {
      throw new Error("bhv-lifetime: response lost");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick1.action !== "idle" || tick2.action !== "idle" || tick3.action !== "opened") {
      fail(`expected idle, idle, opened — got ${tick1.action}, ${tick2.action}, ${tick3.action}`);
      return;
    }

    // КЛЮЧЕВОЕ: pendingAt = подтверждение (+2min), НЕ генерация (t0)
    if (tick3.signal.pendingAt !== t0 + 2 * MIN) {
      fail(`pendingAt must be the CONFIRMATION time (+2min), got offset ${(tick3.signal.pendingAt - t0) / MIN}min — retries ate the lifetime`);
      return;
    }

    // mET=2 от подтверждения: жив на +3 (elapsed 1min), истекает на +4 (elapsed 2min)
    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "active") {
      fail(`tick +3min expected "active" (only 1min of the 2min lifetime elapsed), got "${tick4.action}"`);
      return;
    }
    const tick5 = await runTick(new Date(t0 + 4 * MIN));
    if (tick5.action !== "closed" || tick5.closeReason !== "time_expired") {
      fail(`tick +4min expected closed/time_expired (full 2min lived), got "${tick5.action}"/"${tick5.closeReason}"`);
      return;
    }

    pass(`opened at +2min after 2 rejections, pendingAt=+2min, lived the FULL 2min (active at +3, expired at +4)`);
  } finally {
    unsubscribe();
  }
});

/**
 * BEHAVIOR: окно ожидания scheduled НЕ съедается ретраями размещения —
 * scheduledAt ставится в момент ПОДТВЕРЖДЁННОГО размещения resting-ордера
 * (CC_SCHEDULE_AWAIT_MINUTES отсчитывается от него, не от генерации).
 */
test("BEHAVIOR: placement retries do not shorten the schedule await window — scheduledAt is the confirmation time", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const priceOpen = 40000;
  const context = {
    strategyName: "bhv-schedwin-strategy",
    exchangeName: "binance-bhv-schedwin",
    frameName: "",
  };

  let gateCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      position: "long",
      note: "bhv schedwin",
      priceOpen,
      priceTakeProfit: priceOpen + 4000,
      priceStopLoss: priceOpen - 2000,
      minuteEstimatedTime: 120,
    }),
  });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "schedule") return;
    gateCalls += 1;
    if (gateCalls <= 2) {
      throw new Error("bhv-schedwin: placement response lost");
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick1.action !== "idle" || tick2.action !== "idle" || tick3.action !== "scheduled") {
      fail(`expected idle, idle, scheduled — got ${tick1.action}, ${tick2.action}, ${tick3.action}`);
      return;
    }

    // КЛЮЧЕВОЕ: scheduledAt = подтверждение размещения (+2min), НЕ генерация (t0)
    if (tick3.signal.scheduledAt !== t0 + 2 * MIN) {
      fail(`scheduledAt must be the CONFIRMATION time (+2min), got offset ${(tick3.signal.scheduledAt - t0) / MIN}min — retries ate the await window`);
      return;
    }

    pass(`resting order placed at +2min after 2 rejections with scheduledAt=+2min: the await window starts fresh`);
  } finally {
    unsubscribe();
  }
});

/**
 * BEHAVIOR: подписчики syncSubject зовутся в порядке подписки, и бросок
 * обрывает доставку ПОСЛЕДУЮЩИМ подписчикам (это и есть механика вердикта —
 * short-circuit цепочки). Следствие для интеграций: слушатель-статистика,
 * подписанный ПОСЛЕ кидающего «гейта», не увидит отвергнутых событий —
 * наблюдателей подписывать РАНЬШЕ вето-логики.
 */
test("BEHAVIOR: a throwing sync subscriber silences only LATER subscribers (subscription order = call order)", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const makeStrategy = (context) => {
    makeExchange(context.exchangeName, () => BASE_PRICE);
    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => ({
        position: "long",
        note: "bhv listeners",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 120,
      }),
    });
  };

  // === Фаза A: кидает ПЕРВЫЙ подписчик — второй события НЕ видит ===
  const contextA = { strategyName: "bhv-lstn-a-strategy", exchangeName: "binance-bhv-lstn-a", frameName: "" };
  makeStrategy(contextA);

  let laterSaw = 0;
  const unA1 = listenSync((event) => {
    if (event.strategyName !== contextA.strategyName) return;
    if (event.action !== "signal-open") return;
    throw new Error("bhv-lstn: the FIRST subscriber vetoes");
  }, true);
  const unA2 = listenSync((event) => {
    if (event.strategyName !== contextA.strategyName) return;
    if (event.action !== "signal-open") return;
    laterSaw += 1;
  }, true);

  try {
    const tickA = await makeRunTick(contextA)(new Date(t0));
    if (tickA.action !== "idle") {
      fail(`phase A tick expected "idle" (vetoed by the first subscriber), got "${tickA.action}"`);
      return;
    }
    if (laterSaw !== 0) {
      fail(`a subscriber AFTER the throwing one must NOT see the event (short-circuit), got ${laterSaw}`);
      return;
    }
  } finally {
    unA1();
    unA2();
  }

  // === Фаза B: кидает ВТОРОЙ — первый событие УЖЕ записал (порядок = подписка) ===
  const contextB = { strategyName: "bhv-lstn-b-strategy", exchangeName: "binance-bhv-lstn-b", frameName: "" };
  makeStrategy(contextB);

  let earlierSaw = 0;
  const unB1 = listenSync((event) => {
    if (event.strategyName !== contextB.strategyName) return;
    if (event.action !== "signal-open") return;
    earlierSaw += 1;
  }, true);
  const unB2 = listenSync((event) => {
    if (event.strategyName !== contextB.strategyName) return;
    if (event.action !== "signal-open") return;
    throw new Error("bhv-lstn: the SECOND subscriber vetoes");
  }, true);

  try {
    const tickB = await makeRunTick(contextB)(new Date(t0));
    if (tickB.action !== "idle") {
      fail(`phase B tick expected "idle" (vetoed by the second subscriber), got "${tickB.action}"`);
      return;
    }
    if (earlierSaw !== 1) {
      fail(`a subscriber BEFORE the throwing one must see the event exactly once, got ${earlierSaw}`);
      return;
    }
  } finally {
    unB1();
    unB2();
  }

  pass(`subscription order = call order: the veto silenced the later subscriber (0) but not the earlier one (1)`);
});

/**
 * BEHAVIOR: упавшая запись pre-arm — гейт НЕ вызывается (write-ahead строгий:
 * без записанной попытки ордер не уходит на биржу — неучтённых ордеров не
 * бывает), тик пробрасывает ошибку персиста наружу (Live-цикл ловит её,
 * логирует в errorEmitter и ретраит через свечу). После «починки диска»
 * ретрай продолжает тем же слотом с attempt=1 — консервативный инвариант
 * (лишний reconcile безвреден, пропущенный — нет).
 */
test("BEHAVIOR: a failing pre-arm write blocks the gate and the retry resumes with attempt 1 after recovery", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "bhv-disk-strategy",
    exchangeName: "binance-bhv-disk",
    frameName: "",
  };

  // Больной диск: чтение живо, запись снапшота кидает
  let diskBroken = true;
  let writeAttempts = 0;
  PersistStrategyAdapter.usePersistStrategyAdapter(class {
    async waitForInit() {}
    async readStrategyData() { return null; }
    async writeStrategyData() {
      writeAttempts += 1;
      if (diskBroken) throw new Error("bhv-disk: EIO — persist write failed");
    }
  });

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
        note: "bhv disk",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const unsubscribe = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open" || event.type !== "active") return;
    gateEvents.push({ id: event.signalId, attempt: event.attempt });
  }, true);

  try {
    const runTick = makeRunTick(context);

    // Тик с больным диском обязан КИНУТЬ (fail-fast для Live-цикла)…
    let tickError = null;
    try {
      await runTick(new Date(t0));
    } catch (error) {
      tickError = error;
    }
    if (!tickError || !String(tickError.message).includes("EIO")) {
      fail(`the tick must propagate the persist failure (fail-fast), got ${tickError ? `"${tickError.message}"` : "no error"}`);
      return;
    }
    // …и НЕ вызвать гейт: попытка без write-ahead записи не стартует
    if (gateEvents.length !== 0) {
      fail(`WRITE-AHEAD VIOLATION: the gate fired despite the failed pre-arm write, got ${JSON.stringify(gateEvents)}`);
      return;
    }
    if (writeAttempts !== 1) {
      fail(`expected exactly 1 write attempt on the broken disk, got ${writeAttempts}`);
      return;
    }

    // Диск починился: слот (взведённый в памяти ДО падения записи) доигрывает
    diskBroken = false;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 after recovery expected "opened", got "${tick2.action}"`);
      return;
    }
    // Консервативный инвариант: attempt=1, хотя РЕАЛЬНЫЙ гейт-вызов первый —
    // «ордер мог дойти» предполагается в безопасную сторону
    if (gateEvents.length !== 1 || gateEvents[0].attempt !== 1) {
      fail(`the recovered retry must carry attempt 1 (conservative invariant), got ${JSON.stringify(gateEvents)}`);
      return;
    }
    if (getSignalCalls !== 1) {
      fail(`the in-memory slot must feed the retry (no regeneration), got ${getSignalCalls} getSignal calls`);
      return;
    }

    pass(`broken disk: tick threw, gate never fired (0 unaccounted orders); recovery opened via the slot with attempt 1`);
  } finally {
    unsubscribe();
  }
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  listenActivePing,
  listenScheduleEvent,
  listenSync,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// SHORT-зеркало новой логики: почти все тесты сессии — long; здесь зеркальная
// математика short гоняется через те же пути: placement/activation-гейты,
// trailing (SL выше входа), breakeven вниз, DCA ВВЕРХ, партиалы.

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

const inCtx = (context, fn) => MethodContextService.runInContext(fn, context);

/**
 * SHORT: гейты жизненного цикла scheduled для короткой позиции.
 *
 * priceOpen 60000 ВЫШЕ рынка (short ждёт роста), SL 62000 выше входа,
 * TP 45000 ниже. Placement отвергнут → откат троттла → ретрай → scheduled →
 * waiting → цена растёт до priceOpen → активация (sync type "active") →
 * opened ровно по 60000.
 */
test("SHORT: scheduled lifecycle gates mirror correctly for a short position", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceOpen = 60000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();

  const context = {
    strategyName: "short-gates-strategy",
    exchangeName: "binance-short-gates",
    frameName: "",
  };

  let market = basePrice;
  let scheduleOpenCalls = 0;
  let activeOpenCalls = 0;
  const scheduleEvents = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => ({
      id: "short-gates-id",
      position: "short",
      note: "short gates",
      priceOpen,
      priceTakeProfit: 45000,
      priceStopLoss: 62000,
      minuteEstimatedTime: 300,
    }),
  });

  const unsubscribeSchedule = listenScheduleEvent((event) => {
    if (event.strategyName !== context.strategyName) return;
    scheduleEvents.push(event.action);
  });

  const unsubscribeSync = listenSync((event) => {
    if (event.strategyName !== context.strategyName) return;
    if (event.action !== "signal-open") return;
    if (event.type === "schedule") {
      scheduleOpenCalls += 1;
      if (scheduleOpenCalls === 1) {
        throw new Error("short: exchange rejected resting order placement");
      }
    }
    if (event.type === "active") {
      activeOpenCalls += 1;
    }
  }, true);

  try {
    const runTick = makeRunTick(context);

    // #1: размещение отвергнуто → откат троттла
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (placement rejected), got "${tick1.action}"`);
      return;
    }

    // #2: ретрай размещения принят
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "scheduled") {
      fail(`tick #2 expected "scheduled" (placement retry), got "${tick2.action}"`);
      return;
    }

    // #3: мониторинг (цена ниже priceOpen — short ждёт РОСТА)
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "waiting") {
      fail(`tick #3 expected "waiting", got "${tick3.action}"`);
      return;
    }

    // #4: цена выросла до priceOpen → активация
    market = priceOpen;
    const tick4 = await runTick(new Date(t0 + 3 * MIN));
    if (tick4.action !== "opened") {
      fail(`tick #4 expected "opened" (short activation on price rise), got "${tick4.action}"`);
      return;
    }
    // effective = 100/(100/60000) даёт fp-хвост — допуск
    if (Math.abs(tick4.signal.priceOpen - priceOpen) > 1e-6 || tick4.signal.position !== "short") {
      fail(`opened short expected @~${priceOpen}, got ${tick4.signal.position}@${tick4.signal.priceOpen}`);
      return;
    }

    if (scheduleOpenCalls !== 2 || activeOpenCalls !== 1) {
      fail(`sync calls mismatch: schedule=${scheduleOpenCalls} (expected 2), active=${activeOpenCalls} (expected 1)`);
      return;
    }
    if (JSON.stringify(scheduleEvents) !== JSON.stringify(["scheduled"])) {
      fail(`schedule events expected ["scheduled"], got ${JSON.stringify(scheduleEvents)}`);
      return;
    }

    pass(`short gates mirrored: placement reject/retry, activation on price RISE, opened @${priceOpen}`);
  } finally {
    unsubscribeSchedule();
    unsubscribeSync();
  }
});

/**
 * SHORT: trailingStop — SL ВЫШЕ входа подтягивается ВНИЗ.
 *
 * Вход 50000, SL 55000 (10% выше); shift −5пп → 5% → SL 52500. Рост цены до
 * 53000 закрывает stop_loss по ПОДТЯНУТОМУ 52500 (оригинальный 55000 не тронут).
 */
test("SHORT: trailingStop from listenActivePing tightens the above-entry SL downward", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "short-tstop-strategy",
    exchangeName: "binance-short-tstop",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  let applied = null;

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "short",
        note: "short tstop",
        priceTakeProfit: 40000,
        priceStopLoss: 55000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    if (pings === 1) {
      applied = await inCtx(context, () =>
        lib.strategyCoreService.trailingStop(false, "BTCUSDT", -5, event.currentPrice, context));
    }
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 49500; // профит-зона short → активный мониторинг → ping
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active" || applied !== true) {
      fail(`tick #2 expected "active" with trailingStop applied, got "${tick2.action}"/applied=${applied}`);
      return;
    }

    market = 53000; // выше trailing SL 52500, НИЖЕ оригинального 55000
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "stop_loss") {
      fail(`tick #3 expected closed/stop_loss, got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }
    if (Math.abs(tick3.currentPrice - 52500) > 1e-6) {
      fail(`REGRESSION: short close must land on trailed SL ~52500 (original 55000 untouched), got ${tick3.currentPrice}`);
      return;
    }

    pass(`short trailingStop(-5pp): closed at trailed 52500 on price rise`);
  } finally {
    unsubscribePing();
  }
});

/**
 * SHORT: DCA ВВЕРХ + партиалы в обе стороны + breakeven вниз.
 *
 * Вход 50000; DCA $100 @52000 (для short усреднение при росте — выше max entry):
 * effective = 200/(100/50000+100/52000) ≈ 50980.39. partialProfit 40% @47000
 * (профит short — цена НИЖЕ effective) → остаток $120. partialLoss 25% @53000
 * (цена выше effective, ниже SL) → остаток $90. breakeven @48500 (порог ВНИЗ
 * пройден) → SL = effective; рост до 51500 закрывает stop_loss ровно по
 * effective (zero-risk exit по гармонической цене).
 */
test("SHORT: DCA-up with partials and breakeven mirrors the dollar math", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "short-mix-strategy",
    exchangeName: "binance-short-mix",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  const ops = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "short",
        note: "short mix",
        priceTakeProfit: 35000,
        priceStopLoss: 65000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    const S = lib.strategyCoreService;
    if (pings === 1) ops.push(["dca@52000", await inCtx(context, () => S.averageBuy(false, "BTCUSDT", event.currentPrice, context, 100))]);
    if (pings === 2) ops.push(["profit40", await inCtx(context, () => S.partialProfit(false, "BTCUSDT", 40, event.currentPrice, context))]);
    if (pings === 3) ops.push(["loss25", await inCtx(context, () => S.partialLoss(false, "BTCUSDT", 25, event.currentPrice, context))]);
    if (pings === 4) ops.push(["breakeven", await inCtx(context, () => S.breakeven(false, "BTCUSDT", event.currentPrice, context))]);
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 52000; await runTick(new Date(t0 + 1 * MIN)); // ping1: DCA ВВЕРХ (выше max entry)
    market = 47000; await runTick(new Date(t0 + 2 * MIN)); // ping2: profit 40% (ниже effective)
    market = 53000; await runTick(new Date(t0 + 3 * MIN)); // ping3: loss 25% (выше effective)
    market = 48500; await runTick(new Date(t0 + 4 * MIN)); // ping4: breakeven (порог вниз)

    const failedOp = ops.find(([, r]) => r !== true);
    if (ops.length !== 4 || failedOp) {
      fail(`all 4 short ops must succeed, got ${JSON.stringify(ops)}`);
      return;
    }

    const S = lib.strategyCoreService;
    const effective = await inCtx(context, () => S.getPositionEffectivePrice(false, "BTCUSDT", context));
    const expectedEffective = 200 / (100 / 50000 + 100 / 52000);
    if (Math.abs(effective - expectedEffective) > 1e-6) {
      fail(`short effective expected ${expectedEffective} (harmonic), got ${effective}`);
      return;
    }
    const remaining = await inCtx(context, () => S.getTotalCostClosed(false, "BTCUSDT", context));
    if (remaining !== 90) {
      fail(`remaining after 40%+25% of remaining expected 90, got ${remaining}`);
      return;
    }
    const partials = await inCtx(context, () => S.getPositionPartials(false, "BTCUSDT", context));
    const snapshot = partials.map((p) => ({ t: p.type, basis: p.costBasisAtClose }));
    if (JSON.stringify(snapshot) !== JSON.stringify([{ t: "profit", basis: 200 }, { t: "loss", basis: 120 }])) {
      fail(`short partial snapshots mismatch: ${JSON.stringify(snapshot)}`);
      return;
    }

    // Рост выше breakeven-SL (= effective) закрывает short по нулевому риску
    market = 51500;
    const tick6 = await runTick(new Date(t0 + 5 * MIN));
    if (tick6.action !== "closed" || tick6.closeReason !== "stop_loss") {
      fail(`tick #6 expected closed/stop_loss (breakeven SL hit), got "${tick6.action}"/"${tick6.closeReason}"`);
      return;
    }
    if (Math.abs(tick6.currentPrice - expectedEffective) > 1e-6) {
      fail(`REGRESSION: short breakeven close must land on effective ${expectedEffective}, got ${tick6.currentPrice}`);
      return;
    }

    pass(`short mix exact: effective=${effective.toFixed(2)}, snapshots [200,120], remaining $90, breakeven exit at effective`);
  } finally {
    unsubscribePing();
  }
});

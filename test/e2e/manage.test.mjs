import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  listenActivePing,
  listenStrategyCommit,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Позиционные команды (trailing/breakeven/DCA/partial), управляемые ИЗ
// listenActivePing — продакшн-паттерн имперpoативного менеджмента позиции
// по каждому live-тику. Все тесты: tick #1 открывает позицию, ping тика #2
// подаёт команду, tick #3 показывает эффект (закрытие по новому уровню или
// дренаж commit-очереди).

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
 * MANAGE: trailingStop из listenActivePing.
 *
 * percentShift — сдвиг в процентных ПУНКТАХ дистанции: SL 45000 при входе
 * 50000 = 10% дистанции; shift −5 → 5% → SL 47500. Закрытие приходит по
 * ПОДТЯНУТОМУ уровню, хотя оригинальный SL не тронут ценой.
 */
test("MANAGE: trailingStop from listenActivePing tightens SL and the close lands on the trailed level", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "manage-tstop-strategy",
    exchangeName: "binance-manage-tstop",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  let applied = null;
  const commits = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "manage tstop",
        priceTakeProfit: 60000,
        priceStopLoss: 45000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push(event.action);
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

    market = 50500; // профит-зона → активный мониторинг → ping
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active" || applied !== true) {
      fail(`tick #2 expected "active" with trailingStop applied, got "${tick2.action}"/applied=${applied}`);
      return;
    }

    market = 47000; // ниже trailing SL 47500, ВЫШЕ оригинального 45000
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "stop_loss") {
      fail(`tick #3 expected closed/stop_loss, got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }
    if (tick3.currentPrice !== 47500) {
      fail(`REGRESSION: close must land on trailed SL 47500 (original 45000 untouched by price), got ${tick3.currentPrice}`);
      return;
    }
    if (!commits.includes("trailing-stop")) {
      fail(`trailing-stop commit expected in ${JSON.stringify(commits)}`);
      return;
    }

    pass(`trailingStop(-5pp) from active ping: closed at trailed 47500 (pings=${pings})`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

/**
 * MANAGE: trailingTake из listenActivePing.
 *
 * TP 60000 при входе 50000 = 20% дистанции; shift −10 → 10% → TP 55000.
 * Закрытие take_profit по подтянутому уровню при рынке 56000 (< оригинального TP).
 */
test("MANAGE: trailingTake from listenActivePing pulls TP closer and the close lands on it", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "manage-ttake-strategy",
    exchangeName: "binance-manage-ttake",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  let applied = null;
  const commits = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "manage ttake",
        priceTakeProfit: 60000,
        priceStopLoss: 40000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push(event.action);
  });

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    if (pings === 1) {
      applied = await inCtx(context, () =>
        lib.strategyCoreService.trailingTake(false, "BTCUSDT", -10, event.currentPrice, context));
    }
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 50500;
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active" || applied !== true) {
      fail(`tick #2 expected "active" with trailingTake applied, got "${tick2.action}"/applied=${applied}`);
      return;
    }

    market = 56000; // выше trailing TP 55000, НИЖЕ оригинального 60000
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "take_profit") {
      fail(`tick #3 expected closed/take_profit, got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }
    // Трейл-уровень считается через проценты — допускаем fp-хвост (~1e-11)
    if (Math.abs(tick3.currentPrice - 55000) > 1e-6) {
      fail(`REGRESSION: close must land on trailed TP ~55000 (original 60000 not reached), got ${tick3.currentPrice}`);
      return;
    }
    if (!commits.includes("trailing-take")) {
      fail(`trailing-take commit expected in ${JSON.stringify(commits)}`);
      return;
    }

    pass(`trailingTake(-10pp) from active ping: closed at trailed 55000 (pings=${pings})`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

/**
 * MANAGE: breakeven из listenActivePing.
 *
 * Порог (slippage+fee)*2+margin пройден на 51000 → SL переносится РОВНО на
 * эффективный вход 50000; откат цены под вход закрывает stop_loss по 50000.
 */
test("MANAGE: breakeven from listenActivePing moves SL to entry and the close lands exactly there", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "manage-breakeven-strategy",
    exchangeName: "binance-manage-breakeven",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  let applied = null;
  const commits = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "manage breakeven",
        priceTakeProfit: 60000,
        priceStopLoss: 45000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push(event.action);
  });

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    if (pings === 1) {
      applied = await inCtx(context, () =>
        lib.strategyCoreService.breakeven(false, "BTCUSDT", event.currentPrice, context));
    }
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 51000; // +2% — порог breakeven пройден
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active" || applied !== true) {
      fail(`tick #2 expected "active" with breakeven applied, got "${tick2.action}"/applied=${applied}`);
      return;
    }

    market = 49500; // под входом → SL на 50000 срабатывает
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "stop_loss") {
      fail(`tick #3 expected closed/stop_loss, got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }
    if (tick3.currentPrice !== 50000) {
      fail(`REGRESSION: breakeven close must land exactly on entry 50000, got ${tick3.currentPrice}`);
      return;
    }
    if (!commits.includes("breakeven")) {
      fail(`breakeven commit expected in ${JSON.stringify(commits)}`);
      return;
    }

    pass(`breakeven from active ping: closed at entry 50000 (zero-risk exit)`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

/**
 * MANAGE: averageBuy (DCA) из listenActivePing.
 *
 * Вторая закупка $100 на просадке 48000: эффективная цена — cost-weighted
 * harmonic mean 200/(100/50000 + 100/48000) ≈ 48979.59, инвестировано $200.
 */
test("MANAGE: averageBuy from listenActivePing averages down with harmonic effective price", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "manage-dca-strategy",
    exchangeName: "binance-manage-dca",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  let applied = null;
  const commits = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "manage dca",
        priceTakeProfit: 70000,
        priceStopLoss: 40000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push(event.action);
  });

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    if (pings === 1) {
      applied = await inCtx(context, () =>
        lib.strategyCoreService.averageBuy(false, "BTCUSDT", event.currentPrice, context, 100));
    }
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 48000; // просадка — DCA разрешён (ниже min entry)
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active" || applied !== true) {
      fail(`tick #2 expected "active" with averageBuy applied, got "${tick2.action}"/applied=${applied}`);
      return;
    }

    const effective = await inCtx(context, () => lib.strategyCoreService.getPositionEffectivePrice(false, "BTCUSDT", context));
    const count = await inCtx(context, () => lib.strategyCoreService.getPositionInvestedCount(false, "BTCUSDT", context));
    const invested = await inCtx(context, () => lib.strategyCoreService.getPositionInvestedCost(false, "BTCUSDT", context));

    const expected = 200 / (100 / 50000 + 100 / 48000);
    if (count !== 2 || invested !== 200) {
      fail(`after DCA expected count=2 invested=200, got count=${count} invested=${invested}`);
      return;
    }
    if (Math.abs(effective - expected) > 1e-6) {
      fail(`effective price expected ${expected} (harmonic), got ${effective}`);
      return;
    }

    // tick #3 дренит commit-очередь
    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "active" || !commits.includes("average-buy")) {
      fail(`tick #3 expected "active" with average-buy commit drained, got "${tick3.action}" commits=${JSON.stringify(commits)}`);
      return;
    }

    pass(`averageBuy from active ping: effective=${effective.toFixed(2)} (harmonic), invested=$200`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

/**
 * MANAGE: partialProfit из listenActivePing.
 *
 * Фиксация 40% на 52000: остаток cost basis $60, запись в _partial типа
 * "profit", commit "partial-profit" дренится следующим tick.
 */
test("MANAGE: partialProfit from listenActivePing closes 40% and drains the commit", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "manage-pprofit-strategy",
    exchangeName: "binance-manage-pprofit",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  let applied = null;
  const commits = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "manage pprofit",
        priceTakeProfit: 60000,
        priceStopLoss: 40000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push(event.action);
  });

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    if (pings === 1) {
      applied = await inCtx(context, () =>
        lib.strategyCoreService.partialProfit(false, "BTCUSDT", 40, event.currentPrice, context));
    }
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 52000; // профит-направление
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active" || applied !== true) {
      fail(`tick #2 expected "active" with partialProfit applied, got "${tick2.action}"/applied=${applied}`);
      return;
    }

    const remaining = await inCtx(context, () => lib.strategyCoreService.getTotalCostClosed(false, "BTCUSDT", context));
    if (remaining !== 60) {
      fail(`remaining cost basis after 40% partial expected 60, got ${remaining}`);
      return;
    }
    const partials = await inCtx(context, () => lib.strategyCoreService.getPositionPartials(false, "BTCUSDT", context));
    if (!partials || partials.length !== 1 || partials[0].type !== "profit" || partials[0].percent !== 40) {
      fail(`expected 1 profit partial of 40%, got ${JSON.stringify(partials)}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "active" || !commits.includes("partial-profit")) {
      fail(`tick #3 expected "active" with partial-profit commit drained, got "${tick3.action}" commits=${JSON.stringify(commits)}`);
      return;
    }

    pass(`partialProfit(40%) from active ping: remaining=$${remaining}, commit drained`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

/**
 * MANAGE: partialLoss из listenActivePing.
 *
 * Сброс 30% на просадке 48000: остаток $70, запись типа "loss",
 * commit "partial-loss" дренится следующим tick.
 */
test("MANAGE: partialLoss from listenActivePing sheds 30% on drawdown and drains the commit", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "manage-ploss-strategy",
    exchangeName: "binance-manage-ploss",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  let applied = null;
  const commits = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "manage ploss",
        priceTakeProfit: 60000,
        priceStopLoss: 40000,
        minuteEstimatedTime: 300,
      };
    },
  });

  const unsubscribeCommit = listenStrategyCommit((event) => {
    if (event.strategyName !== context.strategyName) return;
    commits.push(event.action);
  });

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    if (pings === 1) {
      applied = await inCtx(context, () =>
        lib.strategyCoreService.partialLoss(false, "BTCUSDT", 30, event.currentPrice, context));
    }
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 48000; // просадка — loss-направление
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active" || applied !== true) {
      fail(`tick #2 expected "active" with partialLoss applied, got "${tick2.action}"/applied=${applied}`);
      return;
    }

    const remaining = await inCtx(context, () => lib.strategyCoreService.getTotalCostClosed(false, "BTCUSDT", context));
    if (remaining !== 70) {
      fail(`remaining cost basis after 30% partial expected 70, got ${remaining}`);
      return;
    }
    const partials = await inCtx(context, () => lib.strategyCoreService.getPositionPartials(false, "BTCUSDT", context));
    if (!partials || partials.length !== 1 || partials[0].type !== "loss" || partials[0].percent !== 30) {
      fail(`expected 1 loss partial of 30%, got ${JSON.stringify(partials)}`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 2 * MIN));
    if (tick3.action !== "active" || !commits.includes("partial-loss")) {
      fail(`tick #3 expected "active" with partial-loss commit drained, got "${tick3.action}" commits=${JSON.stringify(commits)}`);
      return;
    }

    pass(`partialLoss(30%) from active ping: remaining=$${remaining}, commit drained`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

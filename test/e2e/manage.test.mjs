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

/**
 * MANAGE: переплетение DCA и частичных выходов — стресс cost-basis математики.
 *
 * @50000 open $100 → DCA $100 @48000 → partialProfit 50% (от базиса $200,
 * снапшот) → DCA $100 @47000 (вход ПОСЛЕ партиала добавляется к остатку) →
 * partialLoss 25% (от базиса $200 = остаток $100 + новый вход $100) →
 * partialProfit 100% остатка ($150; работает epsilon-кап после дрейфа
 * percent↔dollar цепочек).
 *
 * Итог: invested $300 / 3 входа, остаток $0, held 0%, снапшоты
 * costBasisAtClose = [200, 200, 150] с entryCountAtClose = [2, 3, 3].
 */
test("MANAGE: interleaved DCA and partial exits keep the dollar cost basis exact", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "manage-mix-strategy",
    exchangeName: "binance-manage-mix",
    frameName: "",
  };

  let market = 50000;
  let signalGenerated = false;
  let pings = 0;
  const ops = [];
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
        note: "manage mix",
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
    const S = lib.strategyCoreService;
    if (pings === 1) ops.push(["dca@48000", await inCtx(context, () => S.averageBuy(false, "BTCUSDT", event.currentPrice, context, 100))]);
    if (pings === 2) ops.push(["profit50", await inCtx(context, () => S.partialProfit(false, "BTCUSDT", 50, event.currentPrice, context))]);
    if (pings === 3) ops.push(["dca@47000", await inCtx(context, () => S.averageBuy(false, "BTCUSDT", event.currentPrice, context, 100))]);
    if (pings === 4) ops.push(["loss25", await inCtx(context, () => S.partialLoss(false, "BTCUSDT", 25, event.currentPrice, context))]);
    if (pings === 5) ops.push(["profit100", await inCtx(context, () => S.partialProfit(false, "BTCUSDT", 100, event.currentPrice, context))]);
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 48000; await runTick(new Date(t0 + 1 * MIN)); // ping1: DCA (просадка)
    market = 52000; await runTick(new Date(t0 + 2 * MIN)); // ping2: profit 50%
    market = 47000; await runTick(new Date(t0 + 3 * MIN)); // ping3: DCA (ниже min entry 48000)
    market = 46000; await runTick(new Date(t0 + 4 * MIN)); // ping4: loss 25%
    market = 53000; await runTick(new Date(t0 + 5 * MIN)); // ping5: profit 100% остатка
    const tick7 = await runTick(new Date(t0 + 6 * MIN));   // дренаж последнего коммита

    const failedOp = ops.find(([, r]) => r !== true);
    if (ops.length !== 5 || failedOp) {
      fail(`all 5 ops must succeed, got ${JSON.stringify(ops)}`);
      return;
    }

    // Авто-закрытие: profit100 (ping5) занулил остаток и маршрутизировал позицию
    // в deferred-close — tick7 дренит закрытие closed/"closed"; финансовые
    // снапшоты едут в самом закрытом сигнале (геттеры позиции уже пусты)
    if (tick7.action !== "closed" || tick7.closeReason !== "closed") {
      fail(`tick #7 expected closed/"closed" (auto-close after 100% partial), got "${tick7.action}"/"${tick7.closeReason}"`);
      return;
    }
    const closedSignal = tick7.signal;
    const invested = (closedSignal._entry ?? []).reduce((sum, e) => sum + e.cost, 0);
    const count = closedSignal.totalEntries;
    if (invested !== 300 || count !== 3) {
      fail(`invested/count expected 300/3, got ${invested}/${count}`);
      return;
    }
    if (Math.abs(closedSignal.partialExecuted - 100) > 1e-6) {
      fail(`REGRESSION: closed signal expected ~100% executed by partials, got ${closedSignal.partialExecuted}%`);
      return;
    }

    const S = lib.strategyCoreService;
    const remaining = await inCtx(context, () => S.getTotalCostClosed(false, "BTCUSDT", context));
    if (remaining !== null) {
      fail(`position getters must be empty after auto-close, got remaining=${remaining}`);
      return;
    }

    // Снапшоты: партиал #2 берёт базис $200 = остаток $100 (после 50%) + DCA $100,
    // добавленный ПОСЛЕ партиала; #3 — остаток $150
    const snapshot = (closedSignal._partial ?? []).map((p) => ({ t: p.type, pct: p.percent, basis: p.costBasisAtClose, entries: p.entryCountAtClose }));
    const expected = [
      { t: "profit", pct: 50, basis: 200, entries: 2 },
      { t: "loss", pct: 25, basis: 200, entries: 3 },
      { t: "profit", pct: 100, basis: 150, entries: 3 },
    ];
    if (JSON.stringify(snapshot) !== JSON.stringify(expected)) {
      fail(`partial snapshots mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(snapshot)}`);
      return;
    }

    // Финальный partial-profit коммит НЕ теряется: очередь атрибуцируется
    // снапшоту _closedSignal; плюс само закрытие даёт close-pending
    const byAction = commits.reduce((acc, a) => ((acc[a] = (acc[a] ?? 0) + 1), acc), {});
    if (byAction["average-buy"] !== 2 || byAction["partial-profit"] !== 2 || byAction["partial-loss"] !== 1 || byAction["close-pending"] !== 1) {
      fail(`commit counts expected average-buy×2/partial-profit×2/partial-loss×1/close-pending×1, got ${JSON.stringify(byAction)}`);
      return;
    }

    pass(`interleaved DCA+partials exact: $300/3 entries, basis snapshots [200,200,150], auto-closed (closed/"closed"), commits ${JSON.stringify(byAction)}`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

/**
 * MANAGE (интеграционный, LONG): полный жизненный цикл с ПЯТЬЮ механизмами
 * через общее состояние — DCA → partialLoss → partialProfit → trailingStop →
 * trailingTake → закрытие по ПОДТЯНУТОМУ TP. Все ожидания считаются от
 * effective price (harmonic после DCA; партиалы после DCA его не сдвигают —
 * пропорциональный replay), трейлинги — по формулам ORIGINAL-дистанций от
 * effective. Проверяются: точная цена закрытия, снапшоты партиалов
 * (базис/входы), original vs effective SL/TP в закрытом сигнале, полный
 * набор коммитов.
 */
test("MANAGE INTEGRATION LONG: DCA + partialLoss + partialProfit + trailingStop + trailingTake in one lifecycle", async ({ pass, fail }) => {
  const basePrice = 50000;
  const dcaPrice = 48000;
  const TP = 60000;
  const SL = 45000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const near = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

  const context = {
    strategyName: "manage-integration-long-strategy",
    exchangeName: "binance-manage-integration-long",
    frameName: "",
  };

  let market = basePrice;
  let signalGenerated = false;
  let pings = 0;
  const ops = [];
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
        note: "manage integration long",
        priceTakeProfit: TP,
        priceStopLoss: SL,
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
    const S = lib.strategyCoreService;
    if (pings === 1) ops.push(["dca@48000", await inCtx(context, () => S.averageBuy(false, "BTCUSDT", event.currentPrice, context, 100))]);
    if (pings === 2) ops.push(["loss25@47000", await inCtx(context, () => S.partialLoss(false, "BTCUSDT", 25, event.currentPrice, context))]);
    if (pings === 3) ops.push(["profit40@52000", await inCtx(context, () => S.partialProfit(false, "BTCUSDT", 40, event.currentPrice, context))]);
    if (pings === 4) ops.push(["tstop-5@53000", await inCtx(context, () => S.trailingStop(false, "BTCUSDT", -5, event.currentPrice, context))]);
    if (pings === 5) ops.push(["ttake-8@54000", await inCtx(context, () => S.trailingTake(false, "BTCUSDT", -8, event.currentPrice, context))]);
  });

  try {
    const runTick = makeRunTick(context);
    const S = lib.strategyCoreService;

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened" || tick1.signal.priceOpen !== basePrice) {
      fail(`tick #1 expected opened@${basePrice}, got "${tick1.action}"@${tick1.signal?.priceOpen}`);
      return;
    }

    market = dcaPrice; await runTick(new Date(t0 + 1 * MIN)); // ping1: DCA на просадке
    market = 47000;    await runTick(new Date(t0 + 2 * MIN)); // ping2: partialLoss 25%
    market = 52000;    await runTick(new Date(t0 + 3 * MIN)); // ping3: partialProfit 40%
    market = 53000;    await runTick(new Date(t0 + 4 * MIN)); // ping4: trailingStop −5пп
    market = 54000;    await runTick(new Date(t0 + 5 * MIN)); // ping5: trailingTake −8пп

    const failedOp = ops.find(([, r]) => r !== true);
    if (ops.length !== 5 || failedOp) {
      fail(`all 5 ops must succeed, got ${JSON.stringify(ops)}`);
      return;
    }

    // Effective price: harmonic после DCA (партиалы после DCA его не сдвигают)
    const eff = await inCtx(context, () => S.getPositionEffectivePrice(false, "BTCUSDT", context));
    const expectedEff = 200 / (100 / basePrice + 100 / dcaPrice);
    if (!near(eff, expectedEff)) {
      fail(`effective price expected ~${expectedEff}, got ${eff}`);
      return;
    }
    // Остаток базиса: 200 → loss25 → 150 → profit40 → 90
    const remaining = await inCtx(context, () => S.getTotalCostClosed(false, "BTCUSDT", context));
    if (!near(remaining, 90)) {
      fail(`remaining basis expected 90, got ${remaining}`);
      return;
    }

    // Ожидаемые трейлинг-уровни: формулы ORIGINAL-дистанций от effective
    const slDist = (eff - SL) / eff * 100;            // 8.125%
    const expectedSL = eff * (1 - (slDist - 5) / 100); // дистанция 3.125%
    const tpDist = (TP - eff) / eff * 100;             // 22.5%
    const expectedTP = eff * (1 + (tpDist - 8) / 100); // дистанция 14.5%

    // Рынок доходит до подтянутого TP (ниже оригинального 60000)
    market = expectedTP + 150;
    const tick7 = await runTick(new Date(t0 + 6 * MIN));
    if (tick7.action !== "closed" || tick7.closeReason !== "take_profit") {
      fail(`tick #7 expected closed/take_profit by TRAILED TP, got "${tick7.action}"/"${tick7.closeReason}"`);
      return;
    }
    if (!near(tick7.currentPrice, expectedTP)) {
      fail(`close must land exactly on the trailed TP ~${expectedTP}, got ${tick7.currentPrice}`);
      return;
    }

    const sig = tick7.signal;
    if (sig.originalPriceTakeProfit !== TP || sig.originalPriceStopLoss !== SL) {
      fail(`original TP/SL expected ${TP}/${SL}, got ${sig.originalPriceTakeProfit}/${sig.originalPriceStopLoss}`);
      return;
    }
    if (!near(sig.priceTakeProfit, expectedTP) || !near(sig.priceStopLoss, expectedSL)) {
      fail(`effective TP/SL expected ~${expectedTP}/~${expectedSL}, got ${sig.priceTakeProfit}/${sig.priceStopLoss}`);
      return;
    }
    const entries = (sig._entry ?? []).map((e) => e.price);
    const invested = (sig._entry ?? []).reduce((sum, e) => sum + e.cost, 0);
    if (JSON.stringify(entries) !== JSON.stringify([basePrice, dcaPrice]) || invested !== 200) {
      fail(`entries/invested expected [${basePrice},${dcaPrice}]/200, got ${JSON.stringify(entries)}/${invested}`);
      return;
    }
    const partials = (sig._partial ?? []).map((p) => ({ t: p.type, pct: p.percent, basis: p.costBasisAtClose, entries: p.entryCountAtClose }));
    const expectedPartials = [
      { t: "loss", pct: 25, basis: 200, entries: 2 },
      { t: "profit", pct: 40, basis: 150, entries: 2 },
    ];
    if (JSON.stringify(partials) !== JSON.stringify(expectedPartials)) {
      fail(`partial snapshots mismatch: expected ${JSON.stringify(expectedPartials)}, got ${JSON.stringify(partials)}`);
      return;
    }
    if (!near(sig.partialExecuted, 55)) { // $50 + $60 из $200 = 55%
      fail(`partialExecuted expected 55%, got ${sig.partialExecuted}`);
      return;
    }

    await new Promise((r) => setTimeout(r, 100));
    const byAction = commits.reduce((acc, a) => ((acc[a] = (acc[a] ?? 0) + 1), acc), {});
    if (byAction["average-buy"] !== 1 || byAction["partial-loss"] !== 1 || byAction["partial-profit"] !== 1 || byAction["trailing-stop"] !== 1 || byAction["trailing-take"] !== 1) {
      fail(`commit counts expected each ×1, got ${JSON.stringify(byAction)}`);
      return;
    }

    pass(`LONG lifecycle exact: eff~${eff.toFixed(2)}, remaining 90, closed@trailed TP ${tick7.currentPrice.toFixed(2)} (orig ${TP}), SL trailed ${sig.priceStopLoss.toFixed(2)} (orig ${SL}), commits ${JSON.stringify(byAction)}`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

/**
 * MANAGE (интеграционный, SHORT): зеркало — DCA на РОСТЕ (выше max entry),
 * partialLoss на росте, partialProfit на падении, trailingStop тянет SL ВНИЗ,
 * trailingTake поднимает TP ВВЕРХ, закрытие по подтянутому TP на падении.
 */
test("MANAGE INTEGRATION SHORT: DCA + partialLoss + partialProfit + trailingStop + trailingTake in one lifecycle", async ({ pass, fail }) => {
  const basePrice = 50000;
  const dcaPrice = 52000;
  const TP = 40000;
  const SL = 55000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const near = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

  const context = {
    strategyName: "manage-integration-short-strategy",
    exchangeName: "binance-manage-integration-short",
    frameName: "",
  };

  let market = basePrice;
  let signalGenerated = false;
  let pings = 0;
  const ops = [];
  const commits = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "short",
        note: "manage integration short",
        priceTakeProfit: TP,
        priceStopLoss: SL,
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
    const S = lib.strategyCoreService;
    if (pings === 1) ops.push(["dca@52000", await inCtx(context, () => S.averageBuy(false, "BTCUSDT", event.currentPrice, context, 100))]);
    if (pings === 2) ops.push(["loss25@53000", await inCtx(context, () => S.partialLoss(false, "BTCUSDT", 25, event.currentPrice, context))]);
    if (pings === 3) ops.push(["profit40@48000", await inCtx(context, () => S.partialProfit(false, "BTCUSDT", 40, event.currentPrice, context))]);
    if (pings === 4) ops.push(["tstop-4@47000", await inCtx(context, () => S.trailingStop(false, "BTCUSDT", -4, event.currentPrice, context))]);
    if (pings === 5) ops.push(["ttake-10@46000", await inCtx(context, () => S.trailingTake(false, "BTCUSDT", -10, event.currentPrice, context))]);
  });

  try {
    const runTick = makeRunTick(context);
    const S = lib.strategyCoreService;

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened" || tick1.signal.priceOpen !== basePrice) {
      fail(`tick #1 expected opened@${basePrice}, got "${tick1.action}"@${tick1.signal?.priceOpen}`);
      return;
    }

    market = dcaPrice; await runTick(new Date(t0 + 1 * MIN)); // ping1: DCA на росте (52000 > max entry 50000)
    market = 53000;    await runTick(new Date(t0 + 2 * MIN)); // ping2: partialLoss 25% (рост = убыток шорта)
    market = 48000;    await runTick(new Date(t0 + 3 * MIN)); // ping3: partialProfit 40% (падение = профит)
    market = 47000;    await runTick(new Date(t0 + 4 * MIN)); // ping4: trailingStop −4пп (SL тянется ВНИЗ)
    market = 46000;    await runTick(new Date(t0 + 5 * MIN)); // ping5: trailingTake −10пп (TP поднимается ВВЕРХ)

    const failedOp = ops.find(([, r]) => r !== true);
    if (ops.length !== 5 || failedOp) {
      fail(`all 5 ops must succeed, got ${JSON.stringify(ops)}`);
      return;
    }

    const eff = await inCtx(context, () => S.getPositionEffectivePrice(false, "BTCUSDT", context));
    const expectedEff = 200 / (100 / basePrice + 100 / dcaPrice);
    if (!near(eff, expectedEff)) {
      fail(`effective price expected ~${expectedEff}, got ${eff}`);
      return;
    }
    const remaining = await inCtx(context, () => S.getTotalCostClosed(false, "BTCUSDT", context));
    if (!near(remaining, 90)) {
      fail(`remaining basis expected 90, got ${remaining}`);
      return;
    }

    // SHORT: SL выше входа, TP ниже; трейлинг тянет оба К входу
    const slDist = (SL - eff) / eff * 100;
    const expectedSL = eff * (1 + (slDist - 4) / 100);
    const tpDist = (eff - TP) / eff * 100;
    const expectedTP = eff * (1 - (tpDist - 10) / 100);

    // Рынок падает до подтянутого TP (ВЫШЕ оригинального 40000)
    market = expectedTP - 150;
    const tick7 = await runTick(new Date(t0 + 6 * MIN));
    if (tick7.action !== "closed" || tick7.closeReason !== "take_profit") {
      fail(`tick #7 expected closed/take_profit by TRAILED TP, got "${tick7.action}"/"${tick7.closeReason}"`);
      return;
    }
    if (!near(tick7.currentPrice, expectedTP)) {
      fail(`close must land exactly on the trailed TP ~${expectedTP}, got ${tick7.currentPrice}`);
      return;
    }

    const sig = tick7.signal;
    if (sig.originalPriceTakeProfit !== TP || sig.originalPriceStopLoss !== SL) {
      fail(`original TP/SL expected ${TP}/${SL}, got ${sig.originalPriceTakeProfit}/${sig.originalPriceStopLoss}`);
      return;
    }
    if (!near(sig.priceTakeProfit, expectedTP) || !near(sig.priceStopLoss, expectedSL)) {
      fail(`effective TP/SL expected ~${expectedTP}/~${expectedSL}, got ${sig.priceTakeProfit}/${sig.priceStopLoss}`);
      return;
    }
    const entries = (sig._entry ?? []).map((e) => e.price);
    const invested = (sig._entry ?? []).reduce((sum, e) => sum + e.cost, 0);
    if (JSON.stringify(entries) !== JSON.stringify([basePrice, dcaPrice]) || invested !== 200) {
      fail(`entries/invested expected [${basePrice},${dcaPrice}]/200, got ${JSON.stringify(entries)}/${invested}`);
      return;
    }
    const partials = (sig._partial ?? []).map((p) => ({ t: p.type, pct: p.percent, basis: p.costBasisAtClose, entries: p.entryCountAtClose }));
    const expectedPartials = [
      { t: "loss", pct: 25, basis: 200, entries: 2 },
      { t: "profit", pct: 40, basis: 150, entries: 2 },
    ];
    if (JSON.stringify(partials) !== JSON.stringify(expectedPartials)) {
      fail(`partial snapshots mismatch: expected ${JSON.stringify(expectedPartials)}, got ${JSON.stringify(partials)}`);
      return;
    }
    if (!near(sig.partialExecuted, 55)) {
      fail(`partialExecuted expected 55%, got ${sig.partialExecuted}`);
      return;
    }

    await new Promise((r) => setTimeout(r, 100));
    const byAction = commits.reduce((acc, a) => ((acc[a] = (acc[a] ?? 0) + 1), acc), {});
    if (byAction["average-buy"] !== 1 || byAction["partial-loss"] !== 1 || byAction["partial-profit"] !== 1 || byAction["trailing-stop"] !== 1 || byAction["trailing-take"] !== 1) {
      fail(`commit counts expected each ×1, got ${JSON.stringify(byAction)}`);
      return;
    }

    pass(`SHORT lifecycle exact: eff~${eff.toFixed(2)}, remaining 90, closed@trailed TP ${tick7.currentPrice.toFixed(2)} (orig ${TP}), SL trailed ${sig.priceStopLoss.toFixed(2)} (orig ${SL}), commits ${JSON.stringify(byAction)}`);
  } finally {
    unsubscribePing();
    unsubscribeCommit();
  }
});

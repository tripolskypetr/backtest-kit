import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  Broker,
  commitPartialProfit,
  commitTrailingStop,
  commitBreakeven,
  commitAverageBuy,
  listenActivePing,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Императивный commit*-слой (function/strategy.ts): commitPartialProfit /
// commitTrailingStop / commitBreakeven / commitAverageBuy исполняют операцию
// И уведомляют Broker-адаптер напрямую (onPartialProfitCommit и т.д.) — это
// НЕ подписки на сабжекты. Вызываются из listenActivePing (оба контекста
// наследуются от tick). ВАЖНО: commitTrailingStop требует third-арг currentPrice.

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

/**
 * COMMIT: все четыре commit*-функции доезжают до СВОИХ методов адаптера
 * с одним signalId, а сами операции применяются (остаток $160 после
 * DCA $200 − 20%).
 */
test("COMMIT: imperative commit functions route to their broker adapter methods", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "commit-route-strategy",
    exchangeName: "binance-commit-route",
    frameName: "",
  };

  let market = basePrice;
  let signalGenerated = false;
  let pings = 0;
  const results = [];
  const adapter = [];

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "commit route",
        priceTakeProfit: 70000,
        priceStopLoss: 40000,
        minuteEstimatedTime: 300,
      };
    },
  });

  Broker.useBrokerAdapter({
    onPartialProfitCommit: async (p) => adapter.push({ m: "partialProfit", signalId: p.signalId }),
    onTrailingStopCommit: async (p) => adapter.push({ m: "trailingStop", signalId: p.signalId }),
    onBreakevenCommit: async (p) => adapter.push({ m: "breakeven", signalId: p.signalId }),
    onAverageBuyCommit: async (p) => adapter.push({ m: "averageBuy", signalId: p.signalId }),
  });
  Broker.enable();

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    // Контексты унаследованы от tick — commit* работают как в продакшене
    if (pings === 1) results.push(["ts", await commitTrailingStop("BTCUSDT", -5, event.currentPrice)]);
    if (pings === 2) results.push(["dca", await commitAverageBuy("BTCUSDT")]);
    if (pings === 3) results.push(["pp", await commitPartialProfit("BTCUSDT", 20)]);
    if (pings === 4) results.push(["be", await commitBreakeven("BTCUSDT")]);
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }
    const signalId = tick1.signal.id;

    market = 52000; await runTick(new Date(t0 + 1 * MIN)); // trailing stop (профит-зона)
    market = 48000; await runTick(new Date(t0 + 2 * MIN)); // DCA (ниже min entry, выше trailing SL)
    market = 52000; await runTick(new Date(t0 + 3 * MIN)); // partial profit
    market = 52000; await runTick(new Date(t0 + 4 * MIN)); // breakeven

    const failedOp = results.find(([, r]) => r !== true);
    if (results.length !== 4 || failedOp) {
      fail(`all commit* must return true, got ${JSON.stringify(results)}`);
      return;
    }

    const methods = adapter.map((a) => a.m).sort().join(",");
    if (methods !== "averageBuy,breakeven,partialProfit,trailingStop") {
      fail(`adapter must receive all 4 commit methods, got ${JSON.stringify(adapter)}`);
      return;
    }
    if (!adapter.every((a) => a.signalId === signalId)) {
      fail(`all adapter payloads must carry signalId ${signalId}, got ${JSON.stringify(adapter)}`);
      return;
    }

    // Операции реально применились: 20% от remaining $200 → $160
    const remaining = await MethodContextService.runInContext(
      () => lib.strategyCoreService.getTotalCostClosed(false, "BTCUSDT", context), context);
    if (remaining !== 160) {
      fail(`remaining after DCA($200) − 20% expected 160, got ${remaining}`);
      return;
    }

    pass(`4 commit functions executed and routed to the adapter (signalId=${signalId}, remaining=$${remaining})`);
  } finally {
    unsubscribePing();
    Broker.disable();
  }
});

/**
 * COMMIT: с ВЫКЛЮЧЕННЫМ брокером commit* работают молча (skip, не throw) —
 * операции применяются, адаптер не вызывается. Фиксирует skip-and-warn
 * семантику Broker.commit* без enable().
 */
test("COMMIT: commit functions execute silently when the broker is disabled", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "commit-silent-strategy",
    exchangeName: "binance-commit-silent",
    frameName: "",
  };

  let market = basePrice;
  let signalGenerated = false;
  let pings = 0;
  const results = [];
  let adapterCalls = 0;

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "commit silent",
        priceTakeProfit: 70000,
        priceStopLoss: 40000,
        minuteEstimatedTime: 300,
      };
    },
  });

  // Адаптер зарегистрирован, но enable() НЕ вызван
  const count = async () => { adapterCalls += 1; };
  Broker.useBrokerAdapter({
    onPartialProfitCommit: count,
    onTrailingStopCommit: count,
    onBreakevenCommit: count,
    onAverageBuyCommit: count,
  });

  const unsubscribePing = listenActivePing(async (event) => {
    if (event.strategyName !== context.strategyName) return;
    pings += 1;
    if (pings === 1) results.push(await commitTrailingStop("BTCUSDT", -5, event.currentPrice));
    if (pings === 2) results.push(await commitAverageBuy("BTCUSDT"));
    if (pings === 3) results.push(await commitPartialProfit("BTCUSDT", 20));
    if (pings === 4) results.push(await commitBreakeven("BTCUSDT"));
  });

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    market = 52000; await runTick(new Date(t0 + 1 * MIN));
    market = 48000; await runTick(new Date(t0 + 2 * MIN));
    market = 52000; await runTick(new Date(t0 + 3 * MIN));
    market = 52000; await runTick(new Date(t0 + 4 * MIN));

    if (results.length !== 4 || results.some((r) => r !== true)) {
      fail(`REGRESSION: commit* must succeed silently without broker, got ${JSON.stringify(results)}`);
      return;
    }
    if (adapterCalls !== 0) {
      fail(`REGRESSION: adapter must stay silent without enable(), got ${adapterCalls} calls`);
      return;
    }

    pass(`4 commit functions executed with disabled broker: operations applied, adapter silent`);
  } finally {
    unsubscribePing();
    Broker.disable();
  }
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  getLiquidationPrice,
  toProfitLossDto,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// ---------------------------------------------------------------------------
// isolated margin — e2e ликвидация:
//   1) live: isolated 100x LONG — пробой цены ликвидации закрывает позицию с
//      closeReason "liquidation" по ТОЧНОЙ liq-цене, pnl ровно -100%,
//      pnlCost = -cost (маржа сгорела);
//   2) live: cross (isolated опущен, дефолт false) на том же сценарии НЕ
//      ликвидируется — позиция остаётся active с pnl ниже -100%;
//   3) live: isolated при НИЗКОМ плече — обычный SL ближе ликвидации и
//      срабатывает первым (closeReason "stop_loss", не "liquidation");
//   4) backtest: свечной цикл ликвидирует isolated-позицию тем же образом.
// ---------------------------------------------------------------------------

const MIN = 60_000;
const EPS = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < EPS;

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
          open: price, high: price, low: price, close: price, volume: 100,
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

test("LIQUIDATION: isolated 100x LONG is force-closed at the exact liquidation price with pnl -100%", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-05-01T00:00:00Z").getTime();
  const context = {
    strategyName: "liquidation-isolated-strategy",
    exchangeName: "binance-liquidation-isolated",
    frameName: "",
  };

  let market = basePrice;
  let signalGenerated = false;

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "isolated 100x",
        // SL далеко (-10%): ликвидация (~-0.6% сырого хода при 100x) обязана
        // перехватить закрытие задолго до SL
        priceTakeProfit: basePrice * 1.1,
        priceStopLoss: basePrice * 0.9,
        minuteEstimatedTime: 60,
        multiplier: 100,
        isolated: true,
      };
    },
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`tick #1 expected "opened", got "${tick1.action}"`);
    return;
  }
  if (tick1.signal.isolated !== true) {
    fail(`opened signal must carry isolated: true, got ${tick1.signal.isolated}`);
    return;
  }

  // Эталонная цена ликвидации того же сигнала
  const expectedLiq = getLiquidationPrice({ position: "long", priceOpen: basePrice, cost: 100, multiplier: 100 });
  if (expectedLiq === null || expectedLiq >= basePrice) {
    fail(`sanity: expected a liquidation price below the entry, got ${expectedLiq}`);
    return;
  }

  // Чуть выше ликвидации — ещё живём
  market = expectedLiq * 1.0005;
  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "active") {
    fail(`tick #2 just above the liquidation price expected "active", got "${tick2.action}"`);
    return;
  }

  // Пробой ликвидации
  market = expectedLiq * 0.999;
  const tick3 = await runTick(new Date(t0 + 2 * MIN));
  if (tick3.action !== "closed") {
    fail(`tick #3 below the liquidation price expected "closed", got "${tick3.action}"`);
    return;
  }
  if (tick3.closeReason !== "liquidation") {
    fail(`closeReason must be "liquidation", got "${tick3.closeReason}"`);
    return;
  }
  if (!approxEqual(tick3.currentPrice, expectedLiq)) {
    fail(`liquidation must close at the exact liquidation price ${expectedLiq}, got ${tick3.currentPrice}`);
    return;
  }
  if (!approxEqual(tick3.pnl.pnlPercentage, -100)) {
    fail(`liquidation pnl must be exactly -100%, got ${tick3.pnl.pnlPercentage}`);
    return;
  }
  if (!approxEqual(tick3.pnl.pnlCost, -tick3.pnl.pnlEntries)) {
    fail(`liquidation pnlCost must equal -margin (-pnlEntries), got ${tick3.pnl.pnlCost} vs entries ${tick3.pnl.pnlEntries}`);
    return;
  }
  // Финальная точка экскурсии: maxDrawdown обязан ДОЙТИ до -100% (закрытие —
  // тоже точка кривой; без RECORD_CLOSE_FALL_FN он замирал на прошлом тике)
  if (!approxEqual(tick3.signal.maxDrawdown.pnlPercentage, -100)) {
    fail(`liquidated trade's maxDrawdown must reach exactly -100%, got ${tick3.signal.maxDrawdown.pnlPercentage}`);
    return;
  }

  pass(`isolated 100x liquidated at ${tick3.currentPrice.toFixed(4)} (closeReason "liquidation"), pnl ${tick3.pnl.pnlPercentage.toFixed(6)}%, maxDrawdown ${tick3.signal.maxDrawdown.pnlPercentage.toFixed(2)}%, pnlCost ${tick3.pnl.pnlCost.toFixed(2)} USD`);
});

test("LIQUIDATION: cross margin (default) survives the same drawdown with pnl below -100%", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-05-02T00:00:00Z").getTime();
  const context = {
    strategyName: "liquidation-cross-strategy",
    exchangeName: "binance-liquidation-cross",
    frameName: "",
  };

  let market = basePrice;
  let signalGenerated = false;

  makeExchange(context.exchangeName, () => market);

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    // isolated намеренно опущен — дефолт CC_SIGNAL_ISOLATED_MARGIN = false (cross)
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "cross 100x",
        priceTakeProfit: basePrice * 1.1,
        priceStopLoss: basePrice * 0.9,
        minuteEstimatedTime: 60,
        multiplier: 100,
      };
    },
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`tick #1 expected "opened", got "${tick1.action}"`);
    return;
  }
  if (tick1.signal.isolated !== false) {
    fail(`omitted isolated must default to false, got ${tick1.signal.isolated}`);
    return;
  }

  // Тот же пробой, что ликвидировал isolated-позицию (-1.2% сырого хода):
  // cross обязан пережить с pnl ниже -100%
  market = basePrice * 0.988;
  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "active") {
    fail(`cross position must stay active through the drawdown, got "${tick2.action}"`);
    return;
  }
  if (tick2.pnl.pnlPercentage >= -100) {
    fail(`sanity: cross leveraged pnl must be below -100% at this depth, got ${tick2.pnl.pnlPercentage}`);
    return;
  }

  pass(`cross margin survived at pnl ${tick2.pnl.pnlPercentage.toFixed(4)}% (< -100%), position still active`);
});

test("LIQUIDATION: at low leverage the ordinary stop loss stays closer and fires first", async ({ pass, fail }) => {
  const basePrice = 50000;
  const t0 = new Date("2024-05-03T00:00:00Z").getTime();
  const context = {
    strategyName: "liquidation-sl-first-strategy",
    exchangeName: "binance-liquidation-sl-first",
    frameName: "",
  };

  let market = basePrice;
  let signalGenerated = false;

  makeExchange(context.exchangeName, () => market);

  const priceStopLoss = basePrice * 0.99; // SL на -1%

  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "isolated low leverage",
        priceTakeProfit: basePrice * 1.1,
        priceStopLoss,
        minuteEstimatedTime: 60,
        // 2x: ликвидация ~-50% сырого хода — многократно дальше SL (-1%)
        multiplier: 2,
        isolated: true,
      };
    },
  });

  const runTick = makeRunTick(context);

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`tick #1 expected "opened", got "${tick1.action}"`);
    return;
  }

  market = basePrice * 0.985; // пробой SL, но далеко до ликвидации
  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "closed") {
    fail(`tick #2 below SL expected "closed", got "${tick2.action}"`);
    return;
  }
  if (tick2.closeReason !== "stop_loss") {
    fail(`the closer level must win: expected "stop_loss", got "${tick2.closeReason}"`);
    return;
  }
  if (!approxEqual(tick2.currentPrice, priceStopLoss)) {
    fail(`stop loss must close at the exact SL price ${priceStopLoss}, got ${tick2.currentPrice}`);
    return;
  }

  pass(`low-leverage isolated position closed by the ordinary stop_loss at ${tick2.currentPrice.toFixed(2)} (liquidation stayed far below)`);
});

test("LIQUIDATION: backtest candle loop liquidates an isolated position the same way", async ({ pass, fail }) => {
  const basePrice = 42000;
  const MULTIPLIER = 100;
  const context = {
    strategyName: "liquidation-backtest-strategy",
    exchangeName: "binance-liquidation-backtest",
    frameName: "liquidation-backtest-frame",
  };

  const expectedLiq = getLiquidationPrice({ position: "long", priceOpen: basePrice, cost: 100, multiplier: MULTIPLIER });
  if (expectedLiq === null) {
    fail("sanity: liquidation price must be computable");
    return;
  }

  const startTime = new Date("2024-05-04T00:00:00Z").getTime();
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MIN;
        const minute = Math.floor((timestamp - startTime) / MIN);
        // Первые 3 минуты — вход/удержание на basePrice, затем цена падает
        // ниже ликвидации (-1.2% сырого хода)
        const price = minute < 3 ? basePrice : basePrice * 0.988;
        candles.push({
          timestamp,
          open: price, high: price, low: price, close: price, volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return {
        position: "long",
        note: "backtest liquidation",
        priceTakeProfit: basePrice * 1.1,
        priceStopLoss: basePrice * 0.9,
        minuteEstimatedTime: 30,
        multiplier: MULTIPLIER,
        isolated: true,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-05-04T00:00:00Z"),
    endDate: new Date("2024-05-04T01:00:00Z"),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    if (result.action === "closed") closed.push(result);
  }

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  if (closed[0].closeReason !== "liquidation") {
    fail(`backtest closeReason must be "liquidation", got "${closed[0].closeReason}"`);
    return;
  }
  if (!approxEqual(closed[0].currentPrice, expectedLiq)) {
    fail(`backtest liquidation must close at the exact liquidation price ${expectedLiq}, got ${closed[0].currentPrice}`);
    return;
  }
  if (!approxEqual(closed[0].pnl.pnlPercentage, -100)) {
    fail(`backtest liquidation pnl must be exactly -100%, got ${closed[0].pnl.pnlPercentage}`);
    return;
  }
  // Финальная точка экскурсии (зеркало live-ассерта): maxDrawdown = -100%
  if (!approxEqual(closed[0].signal.maxDrawdown.pnlPercentage, -100)) {
    fail(`backtest liquidated trade's maxDrawdown must reach exactly -100%, got ${closed[0].signal.maxDrawdown.pnlPercentage}`);
    return;
  }

  pass(`backtest liquidated at ${closed[0].currentPrice.toFixed(4)} with pnl ${closed[0].pnl.pnlPercentage.toFixed(6)}%, maxDrawdown ${closed[0].signal.maxDrawdown.pnlPercentage.toFixed(2)}% (closeReason "liquidation")`);
});

import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  getLiquidationPrice,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// ---------------------------------------------------------------------------
// АСИММЕТРИЧНОЕ ИСПОЛНЕНИЕ (консервативная биржевая семантика):
// stop_loss/ликвидация срабатывают по КАСАНИЮ уровня внутрисвечными
// экстремумами (high/low — принудительные биржевые события), take_profit —
// по VWAP (на низком объёме тень не цена: профит по манипулятивной шпильке,
// которую рынок не удержал, не берём).
//
//   1) wick-TP ИГНОРИРУЕТСЯ: шпилька high через TP при VWAP ниже уровня НЕ
//      закрывает позицию; take_profit срабатывает позже, когда VWAP дойдёт;
//   2) tie-break: SL-касание побеждает даже когда та же свеча коснулась TP
//      (пессимизм: intrabar-путь неизвестен);
//   3) tie-break с ликвидацией: low пробивает и SL, и liq-уровень — побеждает
//      liquidation (ближний к цене уровень, для LONG liq выше SL при 100x);
//   4) wick-ликвидация: минутная шпилька low до liq-уровня при VWAP у входа —
//      позиция ликвидируется (ровно тот случай, который VWAP-сглаживание
//      систематически прятало);
//   5) live-паритет: тот же wick-детект по low/high последней закрытой свечи
//      в live-тике.
// ---------------------------------------------------------------------------

const MIN = 60_000;
const EPS = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < EPS;

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * Фабрика биржи со свечами из карты minute -> candle; минуты вне карты
 * получают плоскую свечу по basePrice.
 */
const makeWickExchange = (exchangeName, startTime, basePrice, candleByMinute) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MIN;
        const minute = Math.floor((timestamp - startTime) / MIN);
        const custom = candleByMinute[minute];
        candles.push(custom
          ? { timestamp, ...custom, volume: 100 }
          : { timestamp, open: basePrice, high: basePrice, low: basePrice, close: basePrice, volume: 100 });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });
};

const runBacktestScenario = async (name, { basePrice, signal, candleByMinute, frameMinutes = 60 }) => {
  const context = {
    strategyName: `touch-${name}-strategy`,
    exchangeName: `binance-touch-${name}`,
    frameName: `touch-${name}-frame`,
  };
  const startTime = new Date("2024-06-01T00:00:00Z").getTime();

  makeWickExchange(context.exchangeName, startTime, basePrice, candleByMinute);

  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return signal;
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date(startTime),
    endDate: new Date(startTime + frameMinutes * MIN),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    if (result.action === "closed") closed.push(result);
  }
  return closed;
};

test("TOUCH: a wick through TP is IGNORED — take_profit fires only when VWAP reaches the level", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceTakeProfit = basePrice + 1000;
  const startTime = new Date("2024-06-01T00:00:00Z").getTime();

  const candleByMinute = {
    // Минута 3: шпилька high через TP при VWAP у базы — НЕ должна закрыть
    3: { open: basePrice, high: priceTakeProfit + 200, low: basePrice - 50, close: basePrice + 50 },
  };
  // Минуты 6..14: цена устойчиво держится НА уровне TP — VWAP доходит до TP
  // примерно к 10-й минуте (5-свечное окно целиком на уровне)
  for (let m = 6; m <= 14; m++) {
    candleByMinute[m] = { open: priceTakeProfit, high: priceTakeProfit, low: priceTakeProfit, close: priceTakeProfit };
  }

  const closed = await runBacktestScenario("wick-tp", {
    basePrice,
    signal: {
      position: "long",
      note: "wick tp ignored",
      priceTakeProfit,
      priceStopLoss: basePrice - 2000,
      minuteEstimatedTime: 30,
      multiplier: 1,
    },
    candleByMinute,
  });

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  if (closed[0].closeReason !== "take_profit") {
    fail(`expected an eventual VWAP take_profit, got "${closed[0].closeReason}"`);
    return;
  }
  if (!approxEqual(closed[0].currentPrice, priceTakeProfit)) {
    fail(`TP close must use the exact TP price ${priceTakeProfit}, got ${closed[0].currentPrice}`);
    return;
  }
  // Ключевой ассерт: закрытие НЕ на свече шпильки (минута 3), а после того,
  // как VWAP реально дошёл до уровня (не раньше минуты 6)
  const closeMinute = (closed[0].closeTimestamp - startTime) / MIN;
  if (closeMinute <= 4) {
    fail(`the wick candle must NOT close the position: closed at minute ${closeMinute} (wick was at minute 3)`);
    return;
  }

  pass(`wick through TP ignored at minute 3; VWAP take_profit fired at minute ${closeMinute} @ ${closed[0].currentPrice}`);
});

test("TOUCH: same-candle TP+SL touch resolves pessimistically to stop_loss", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceTakeProfit = basePrice + 1000;
  const priceStopLoss = basePrice - 1000;

  const closed = await runBacktestScenario("tiebreak-sl", {
    basePrice,
    signal: {
      position: "long",
      note: "tie-break sl over tp",
      priceTakeProfit,
      priceStopLoss,
      minuteEstimatedTime: 30,
      multiplier: 1,
    },
    candleByMinute: {
      // Минута 3: flash-свеча касается И TP (high), И SL (low)
      3: { open: basePrice, high: priceTakeProfit + 500, low: priceStopLoss - 500, close: basePrice },
    },
  });

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  if (closed[0].closeReason !== "stop_loss") {
    fail(`pessimistic tie-break must pick stop_loss over take_profit, got "${closed[0].closeReason}"`);
    return;
  }
  if (!approxEqual(closed[0].currentPrice, priceStopLoss)) {
    fail(`tie-break close must use the exact SL price ${priceStopLoss}, got ${closed[0].currentPrice}`);
    return;
  }

  pass(`same-candle TP+SL touch closed stop_loss @ ${closed[0].currentPrice} (pessimistic intrabar assumption)`);
});

test("TOUCH: same-candle SL+liquidation touch resolves to liquidation (the closer level)", async ({ pass, fail }) => {
  const basePrice = 50000;
  const MULTIPLIER = 100;
  const expectedLiq = getLiquidationPrice({ position: "long", priceOpen: basePrice, cost: 100, multiplier: MULTIPLIER });
  if (expectedLiq === null) {
    fail("sanity: liquidation price must be computable");
    return;
  }

  const closed = await runBacktestScenario("tiebreak-liq", {
    basePrice,
    signal: {
      position: "long",
      note: "tie-break liq over sl",
      priceTakeProfit: basePrice * 1.1,
      priceStopLoss: basePrice * 0.9, // SL намного дальше liq (~-0.6%)
      minuteEstimatedTime: 30,
      multiplier: MULTIPLIER,
      isolated: true,
    },
    candleByMinute: {
      // Минута 3: провал ниже И SL, И liq-уровня одной свечой
      3: { open: basePrice, high: basePrice, low: basePrice * 0.85, close: basePrice * 0.9 },
    },
  });

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  if (closed[0].closeReason !== "liquidation") {
    fail(`liquidation (the closer stop level) must win over stop_loss, got "${closed[0].closeReason}"`);
    return;
  }
  if (!approxEqual(closed[0].currentPrice, expectedLiq)) {
    fail(`liquidation must close at the exact liq price ${expectedLiq}, got ${closed[0].currentPrice}`);
    return;
  }
  if (!approxEqual(closed[0].pnl.pnlPercentage, -100)) {
    fail(`liquidation pnl must be exactly -100%, got ${closed[0].pnl.pnlPercentage}`);
    return;
  }

  pass(`same-candle SL+liq touch liquidated @ ${closed[0].currentPrice.toFixed(4)} with pnl -100%`);
});

test("TOUCH: a one-minute wick to the liquidation level liquidates while VWAP sits at the entry", async ({ pass, fail }) => {
  const basePrice = 50000;
  const MULTIPLIER = 100;
  const expectedLiq = getLiquidationPrice({ position: "long", priceOpen: basePrice, cost: 100, multiplier: MULTIPLIER });
  if (expectedLiq === null) {
    fail("sanity: liquidation price must be computable");
    return;
  }

  const closed = await runBacktestScenario("wick-liq", {
    basePrice,
    signal: {
      position: "long",
      note: "wick liquidation",
      priceTakeProfit: basePrice * 1.1,
      priceStopLoss: basePrice * 0.9,
      minuteEstimatedTime: 30,
      multiplier: MULTIPLIER,
      isolated: true,
    },
    candleByMinute: {
      // Минута 3: шпилька low чуть ниже liq-уровня, open/close у базы —
      // VWAP остаётся у входа. Раньше (VWAP-детект) позиция «выживала».
      3: { open: basePrice, high: basePrice + 20, low: expectedLiq * 0.999, close: basePrice - 20 },
    },
  });

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  if (closed[0].closeReason !== "liquidation") {
    fail(`the wick must liquidate the position, got "${closed[0].closeReason}"`);
    return;
  }
  if (!approxEqual(closed[0].currentPrice, expectedLiq)) {
    fail(`liquidation must close at the exact liq price ${expectedLiq}, got ${closed[0].currentPrice}`);
    return;
  }
  if (!approxEqual(closed[0].pnl.pnlPercentage, -100)) {
    fail(`liquidation pnl must be exactly -100%, got ${closed[0].pnl.pnlPercentage}`);
    return;
  }
  if (!approxEqual(closed[0].signal.maxDrawdown.pnlPercentage, -100)) {
    fail(`liquidated trade's maxDrawdown must reach -100%, got ${closed[0].signal.maxDrawdown.pnlPercentage}`);
    return;
  }

  pass(`intra-candle wick liquidated the position @ ${closed[0].currentPrice.toFixed(4)} while VWAP stayed near the entry — the exact case VWAP smoothing used to hide`);
});

test("TOUCH: live tick mirrors the wick detection via the last closed candle's low", async ({ pass, fail }) => {
  const basePrice = 50000;
  const MULTIPLIER = 100;
  const t0 = new Date("2024-06-02T00:00:00Z").getTime();
  const context = {
    strategyName: "touch-live-wick-strategy",
    exchangeName: "binance-touch-live-wick",
    frameName: "",
  };
  const expectedLiq = getLiquidationPrice({ position: "long", priceOpen: basePrice, cost: 100, multiplier: MULTIPLIER });
  if (expectedLiq === null) {
    fail("sanity: liquidation price must be computable");
    return;
  }

  // wickActive управляет ПОСЛЕДНЕЙ свечой ответа: low-шпилька до liq-уровня
  // при open/close у базы — VWAP у входа, touch ловит шпильку
  let wickActive = false;
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const isLast = i === limit - 1;
        const low = wickActive && isLast ? expectedLiq * 0.999 : basePrice;
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: basePrice, high: basePrice, low, close: basePrice, volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "live wick liquidation",
        priceTakeProfit: basePrice * 1.1,
        priceStopLoss: basePrice * 0.9,
        minuteEstimatedTime: 60,
        multiplier: MULTIPLIER,
        isolated: true,
      };
    },
  });

  const runTick = (when) =>
    MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
      context,
    );

  const tick1 = await runTick(new Date(t0));
  if (tick1.action !== "opened") {
    fail(`tick #1 expected "opened", got "${tick1.action}"`);
    return;
  }

  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "active") {
    fail(`tick #2 (no wick yet) expected "active", got "${tick2.action}"`);
    return;
  }

  wickActive = true;
  const tick3 = await runTick(new Date(t0 + 2 * MIN));
  if (tick3.action !== "closed" || tick3.closeReason !== "liquidation") {
    fail(`tick #3 with the wick candle must liquidate, got "${tick3.action}"/"${tick3.closeReason}"`);
    return;
  }
  if (!approxEqual(tick3.currentPrice, expectedLiq)) {
    fail(`live liquidation must close at the exact liq price ${expectedLiq}, got ${tick3.currentPrice}`);
    return;
  }
  if (!approxEqual(tick3.pnl.pnlPercentage, -100)) {
    fail(`live liquidation pnl must be exactly -100%, got ${tick3.pnl.pnlPercentage}`);
    return;
  }

  pass(`live tick caught the intra-minute wick via the closed candle's low and liquidated @ ${tick3.currentPrice.toFixed(4)}`);
});

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

test("TOUCH: a wick to SL closes stop_loss IMMEDIATELY while VWAP stays above the level", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceStopLoss = basePrice - 1000;
  const startTime = new Date("2024-06-01T00:00:00Z").getTime();

  const closed = await runBacktestScenario("wick-sl", {
    basePrice,
    signal: {
      position: "long",
      note: "wick sl fires",
      priceTakeProfit: basePrice + 5000,
      priceStopLoss,
      minuteEstimatedTime: 30,
      multiplier: 1,
    },
    candleByMinute: {
      // Минута 3: шпилька low через SL при open/close у базы — VWAP далеко
      // выше уровня. Асимметрия: в отличие от TP, стоп обязан сработать
      // НЕМЕДЛЕННО на свече касания (принудительное биржевое событие)
      3: { open: basePrice, high: basePrice + 50, low: priceStopLoss - 100, close: basePrice - 50 },
    },
  });

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  if (closed[0].closeReason !== "stop_loss") {
    fail(`the wick must fire stop_loss, got "${closed[0].closeReason}"`);
    return;
  }
  if (!approxEqual(closed[0].currentPrice, priceStopLoss)) {
    fail(`stop must close at the exact SL price ${priceStopLoss}, got ${closed[0].currentPrice}`);
    return;
  }
  const closeMinute = (closed[0].closeTimestamp - startTime) / MIN;
  if (closeMinute !== 3) {
    fail(`stop must fire ON the wick candle (minute 3), got minute ${closeMinute}`);
    return;
  }

  pass(`wick to SL fired stop_loss immediately at minute 3 @ ${closed[0].currentPrice} (VWAP never reached the level — asymmetry vs the ignored TP wick)`);
});

test("TOUCH: SHORT mirror — a wick through TP is ignored, a later wick to SL closes stop_loss", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceTakeProfit = basePrice - 1000; // SHORT: TP ниже входа
  const priceStopLoss = basePrice + 1000;   // SHORT: SL выше входа
  const startTime = new Date("2024-06-01T00:00:00Z").getTime();

  const closed = await runBacktestScenario("short-mirror", {
    basePrice,
    signal: {
      position: "short",
      note: "short asymmetry",
      priceTakeProfit,
      priceStopLoss,
      minuteEstimatedTime: 30,
      multiplier: 1,
    },
    candleByMinute: {
      // Минута 3: шпилька LOW через SHORT-TP при VWAP у базы — игнорируется
      3: { open: basePrice, high: basePrice + 50, low: priceTakeProfit - 200, close: basePrice - 50 },
      // Минута 6: шпилька HIGH через SHORT-SL — стоп по касанию
      6: { open: basePrice, high: priceStopLoss + 200, low: basePrice - 50, close: basePrice + 50 },
    },
  });

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  if (closed[0].closeReason !== "stop_loss") {
    fail(`the SL wick must win (TP wick at minute 3 must be ignored), got "${closed[0].closeReason}"`);
    return;
  }
  if (!approxEqual(closed[0].currentPrice, priceStopLoss)) {
    fail(`stop must close at the exact SL price ${priceStopLoss}, got ${closed[0].currentPrice}`);
    return;
  }
  const closeMinute = (closed[0].closeTimestamp - startTime) / MIN;
  if (closeMinute !== 6) {
    fail(`close must land on the SL-wick candle (minute 6, TP wick at 3 ignored), got minute ${closeMinute}`);
    return;
  }

  pass(`SHORT mirror verified: TP wick at minute 3 ignored, SL wick fired stop_loss at minute 6 @ ${closed[0].currentPrice}`);
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

test("TOUCH: live tick mirrors the asymmetry — TP wick ignored, SL wick closes stop_loss", async ({ pass, fail }) => {
  const basePrice = 50000;
  const priceTakeProfit = basePrice + 1000;
  const priceStopLoss = basePrice - 1000;
  const t0 = new Date("2024-06-03T00:00:00Z").getTime();
  const context = {
    strategyName: "touch-live-asym-strategy",
    exchangeName: "binance-touch-live-asym",
    frameName: "",
  };

  // Управление ПОСЛЕДНЕЙ свечой ответа: "tp" — high-шпилька через TP,
  // "sl" — low-шпилька через SL, иначе плоская база (VWAP всегда у входа)
  let wickMode = "none";
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const isLast = i === limit - 1;
        const high = wickMode === "tp" && isLast ? priceTakeProfit + 200 : basePrice;
        const low = wickMode === "sl" && isLast ? priceStopLoss - 200 : basePrice;
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: basePrice, high, low, close: basePrice, volume: 100,
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
        note: "live asymmetry",
        priceTakeProfit,
        priceStopLoss,
        minuteEstimatedTime: 60,
        multiplier: 1,
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

  // TP-шпилька в последней свече: VWAP у входа — позиция обязана остаться active
  wickMode = "tp";
  const tick2 = await runTick(new Date(t0 + 1 * MIN));
  if (tick2.action !== "active") {
    fail(`live TP wick must be ignored (take_profit is VWAP-based), got "${tick2.action}"/"${tick2.closeReason}"`);
    return;
  }

  // SL-шпилька в последней свече: стоп по касанию — немедленное закрытие
  wickMode = "sl";
  const tick3 = await runTick(new Date(t0 + 2 * MIN));
  if (tick3.action !== "closed" || tick3.closeReason !== "stop_loss") {
    fail(`live SL wick must close stop_loss immediately, got "${tick3.action}"/"${tick3.closeReason}"`);
    return;
  }
  if (!approxEqual(tick3.currentPrice, priceStopLoss)) {
    fail(`live stop must close at the exact SL price ${priceStopLoss}, got ${tick3.currentPrice}`);
    return;
  }

  pass(`live asymmetry verified: TP wick ignored on tick #2, SL wick fired stop_loss @ ${tick3.currentPrice} on tick #3`);
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

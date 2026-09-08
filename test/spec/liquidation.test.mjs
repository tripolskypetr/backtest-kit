import { test } from "worker-testbed";
import { toProfitLossDto, getLiquidationPrice, setConfig, validateSignal } from "../../build/index.mjs";

const EPS = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < EPS;

// ---------------------------------------------------------------------------
// isolated margin / liquidation — инверсия PNL-калькулятора.
//
// getLiquidationPrice возвращает цену, на которой leveraged реализуемый PNL
// (toProfitLossDto: slippage + fees + multiplier + DCA + партиалы) равен
// РОВНО -100%. Инвариант проверяется подстановкой обратно в toProfitLossDto —
// формула по построению не может разойтись с продакшен-счётчиком.
// ---------------------------------------------------------------------------

test("liquidation: LONG 100x — pnl at the liquidation price is exactly -100%", ({ pass, fail }) => {
  const signal = { position: "long", priceOpen: 100, multiplier: 100 };
  const liq = getLiquidationPrice(signal);
  if (liq === null || liq <= 0 || liq >= 100) {
    fail(`LONG liquidation price must be positive and below the entry, got ${liq}`);
    return;
  }
  const { pnlPercentage } = toProfitLossDto(signal, liq);
  if (!approxEqual(pnlPercentage, -100)) {
    fail(`pnl at liquidation price must be exactly -100, got ${pnlPercentage}`);
    return;
  }
  pass(`LONG 100x liquidation @ ${liq.toFixed(6)} -> pnl ${pnlPercentage.toFixed(9)}%`);
});

test("liquidation: SHORT 100x — pnl at the liquidation price is exactly -100%", ({ pass, fail }) => {
  const signal = { position: "short", priceOpen: 100, multiplier: 100 };
  const liq = getLiquidationPrice(signal);
  if (liq === null || liq <= 100) {
    fail(`SHORT liquidation price must be above the entry, got ${liq}`);
    return;
  }
  const { pnlPercentage } = toProfitLossDto(signal, liq);
  if (!approxEqual(pnlPercentage, -100)) {
    fail(`pnl at liquidation price must be exactly -100, got ${pnlPercentage}`);
    return;
  }
  pass(`SHORT 100x liquidation @ ${liq.toFixed(6)} -> pnl ${pnlPercentage.toFixed(9)}%`);
});

test("liquidation: DCA entries — inversion stays exact (LONG 20x, entries [100, 80])", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    multiplier: 20,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
  };
  const liq = getLiquidationPrice(signal);
  if (liq === null || liq <= 0) {
    fail(`liquidation price must be positive, got ${liq}`);
    return;
  }
  const { pnlPercentage } = toProfitLossDto(signal, liq);
  if (!approxEqual(pnlPercentage, -100)) {
    fail(`pnl at liquidation price must be exactly -100 with DCA entries, got ${pnlPercentage}`);
    return;
  }
  pass(`DCA 20x liquidation @ ${liq.toFixed(6)} -> pnl ${pnlPercentage.toFixed(9)}%`);
});

test("liquidation: partial-close replay — inversion stays exact (S3-key scenario, 30x)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    multiplier: 30,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "profit", percent: 50, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
  };
  const liq = getLiquidationPrice(signal);
  if (liq === null || liq <= 0) {
    fail(`liquidation price must be positive, got ${liq}`);
    return;
  }
  const { pnlPercentage } = toProfitLossDto(signal, liq);
  if (!approxEqual(pnlPercentage, -100)) {
    fail(`pnl at liquidation price must be exactly -100 with partials, got ${pnlPercentage}`);
    return;
  }
  pass(`partials 30x liquidation @ ${liq.toFixed(6)} -> pnl ${pnlPercentage.toFixed(9)}%`);
});

test("liquidation: 1x needs a near-total price collapse; higher leverage pulls the level closer", ({ pass, fail }) => {
  const liq1 = getLiquidationPrice({ position: "long", priceOpen: 100, multiplier: 1 });
  const liq10 = getLiquidationPrice({ position: "long", priceOpen: 100, multiplier: 10 });
  const liq100 = getLiquidationPrice({ position: "long", priceOpen: 100, multiplier: 100 });
  if (liq1 === null || liq10 === null || liq100 === null) {
    fail(`all liquidation prices must be computable, got ${liq1}, ${liq10}, ${liq100}`);
    return;
  }
  // Монотонность: чем выше плечо, тем ближе ликвидация к входу
  if (!(liq1 < liq10 && liq10 < liq100 && liq100 < 100)) {
    fail(`liquidation must approach the entry as leverage grows: ${liq1} < ${liq10} < ${liq100} < 100 violated`);
    return;
  }
  // 1x: -100% достигается только у почти нулевой цены
  if (liq1 > 1) {
    fail(`1x liquidation must sit near a total price collapse (< 1% of entry), got ${liq1}`);
    return;
  }
  pass(`liquidation levels: 1x @ ${liq1.toFixed(4)}, 10x @ ${liq10.toFixed(4)}, 100x @ ${liq100.toFixed(4)}`);
});

test("liquidation: fully closed by partials -> null (nothing left to liquidate)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    multiplier: 10,
    _entry: [{ price: 100, cost: 100 }],
    _partial: [{ type: "profit", percent: 100, currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 }],
  };
  const liq = getLiquidationPrice(signal);
  if (liq !== null) {
    fail(`fully-closed position must have no liquidation price, got ${liq}`);
    return;
  }
  pass("fully-closed position -> liquidation price is null");
});

test("liquidation: validateSignal accepts booleans and rejects non-boolean isolated", ({ pass, fail }) => {
  const dto = {
    position: "long",
    priceOpen: 100,
    priceTakeProfit: 110,
    priceStopLoss: 90,
    minuteEstimatedTime: 60,
    multiplier: 1,
  };
  if (!validateSignal({ ...dto, isolated: true }, 100)) {
    fail("isolated: true must be valid");
    return;
  }
  if (!validateSignal({ ...dto, isolated: false }, 100)) {
    fail("isolated: false must be valid");
    return;
  }
  if (validateSignal({ ...dto, isolated: "yes" }, 100)) {
    fail("non-boolean isolated must be rejected");
    return;
  }
  pass("validateSignal: booleans accepted, non-boolean isolated rejected");
});

test("liquidation: setConfig rejects non-boolean CC_SIGNAL_ISOLATED_MARGIN", ({ pass, fail }) => {
  try {
    setConfig({ CC_SIGNAL_ISOLATED_MARGIN: "yes" });
    fail("Should have thrown for non-boolean CC_SIGNAL_ISOLATED_MARGIN");
  } catch (error) {
    if (error.message.includes("CC_SIGNAL_ISOLATED_MARGIN")) {
      pass("Correctly rejected non-boolean CC_SIGNAL_ISOLATED_MARGIN");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

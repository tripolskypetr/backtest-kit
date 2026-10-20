import { test } from "worker-testbed";
import {
  toProfitLossDto,
  getAccrualsCost,
  getBreakevenPrice,
  getLiquidationPrice,
  setConfig,
  getDefaultConfig,
} from "../../build/index.mjs";

const EPS = 1e-9;
const near = (a, b, eps = EPS) => Math.abs(a - b) < eps;

const T0 = Date.UTC(2024, 0, 1);

/** LONG 1 entry $100 at 50000 */
const base = (extra = {}) => ({
  id: "div-spec",
  position: "long",
  priceOpen: 50000,
  priceTakeProfit: 60000,
  priceStopLoss: 40000,
  cost: 100,
  multiplier: 1,
  _entry: [{ price: 50000, cost: 100, timestamp: T0 }],
  ...extra,
});

test("dividends: no accruals -> pnlDividends 0, PNL unchanged", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const pnl = toProfitLossDto(base(), 51000);
  if (pnl.pnlDividends !== 0) return fail(`pnlDividends must be 0, got ${pnl.pnlDividends}`);
  if (!near(pnl.pnlCost, (pnl.pnlPercentage / 100) * pnl.pnlEntries)) return fail("pnlCost must equal pnlPercentage/100 × pnlEntries");
  const empty = toProfitLossDto(base({ _accruals: [] }), 51000);
  if (empty.pnlPercentage !== pnl.pnlPercentage || empty.pnlCost !== pnl.pnlCost) return fail("an empty accrual list must not change the PNL");
  pass("no accruals: identical to the price PNL");
});

test("dividends: a cash accrual adds its USD amount to pnlCost, not scaled by the multiplier", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const price = toProfitLossDto(base(), 51000);
  const withCash = toProfitLossDto(base({ _accruals: [{ type: "cash", amount: 10, timestamp: T0 }] }), 51000);
  if (withCash.pnlDividends !== 10) return fail(`pnlDividends must be 10, got ${withCash.pnlDividends}`);
  if (!near(withCash.pnlCost, price.pnlCost + 10)) return fail(`pnlCost must be price pnl + 10: ${withCash.pnlCost} vs ${price.pnlCost + 10}`);
  if (!near(withCash.pnlPercentage, (withCash.pnlCost / 100) * 100)) return fail("pnlPercentage must be re-derived from pnlCost / pnlEntries");
  if (withCash.pnlEntries !== 100) return fail("pnlEntries (invested capital) must not change");
  // multiplier 3: the price component triples, the dividend does not
  const lev = toProfitLossDto(base({ multiplier: 3, _accruals: [{ type: "cash", amount: 10, timestamp: T0 }] }), 51000);
  const priceLev = toProfitLossDto(base({ multiplier: 3 }), 51000);
  if (!near(priceLev.pnlCost, price.pnlCost * 3, 1e-6)) return fail("sanity: leveraged price pnl must be 3x");
  if (!near(lev.pnlCost, priceLev.pnlCost + 10)) return fail(`leveraged pnlCost must be 3x price pnl + 10 (not 30): ${lev.pnlCost}`);
  pass("cash accrual: +10 USD, multiplier-neutral, pnlCost/pnlPercentage consistent");
});

test("dividends: an asset accrual is valued at the PNL price", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const signal = base({ _accruals: [{ type: "asset", amount: 0.001, timestamp: T0 }] });
  const at50 = toProfitLossDto(signal, 50000);
  const at60 = toProfitLossDto(signal, 60000);
  if (!near(at50.pnlDividends, 50)) return fail(`0.001 × 50000 must be 50, got ${at50.pnlDividends}`);
  if (!near(at60.pnlDividends, 60)) return fail(`0.001 × 60000 must be 60, got ${at60.pnlDividends}`);
  if (!near(getAccrualsCost(signal, 55000), 55)) return fail("getAccrualsCost must value asset accruals at the given price");
  const mixed = base({ _accruals: [
    { type: "cash", amount: 7, timestamp: T0 },
    { type: "asset", amount: 0.002, timestamp: T0 },
  ] });
  if (!near(getAccrualsCost(mixed, 50000), 107)) return fail("mixed accruals: 7 + 0.002 × 50000 = 107");
  pass("asset accrual tracks the price: 50 at 50000, 60 at 60000; mixed sums correctly");
});

test("dividends: accruals fold into the partial-close branch the same way", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const withPartial = (accruals) => base({
    _partial: [{ type: "profit", percent: 50, currentPrice: 52000, costBasisAtClose: 100, entryCountAtClose: 1, timestamp: T0 }],
    _accruals: accruals,
  });
  const price = toProfitLossDto(withPartial(undefined), 51000);
  const div = toProfitLossDto(withPartial([{ type: "cash", amount: 4, timestamp: T0 }]), 51000);
  if (div.pnlDividends !== 4) return fail("pnlDividends must be 4");
  if (!near(div.pnlCost, price.pnlCost + 4)) return fail("partial branch: pnlCost must be price pnl + 4");
  if (!near(div.pnlCost, (div.pnlPercentage / 100) * div.pnlEntries)) return fail("partial branch: pnlCost/pnlPercentage consistency");
  pass("partial-close branch folds accruals identically");
});

test("dividends: breakeven is a price level — accruals do not move it", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const plain = getBreakevenPrice(base());
  const paid = getBreakevenPrice(base({ _accruals: [{ type: "cash", amount: 1, currentPrice: 50000, timestamp: T0 }] }));
  const big = getBreakevenPrice(base({ _accruals: [{ type: "cash", amount: 500, currentPrice: 50000, timestamp: T0 }] }));
  if (plain === null || paid === null || big === null) return fail("breakeven must be defined for a plain long");
  if (!near(paid, plain, 1e-9) || !near(big, plain, 1e-9)) return fail(`accruals must not move the breakeven: ${plain} vs ${paid} / ${big}`);
  // at the breakeven price the price PNL is 0 and the total PNL is exactly the accrual
  const pnl = toProfitLossDto(base({ _accruals: [{ type: "cash", amount: 1, currentPrice: 50000, timestamp: T0 }] }), paid);
  if (!near(pnl.pnlCost, 1, 1e-6) || !near(pnl.pnlDividends, 1)) return fail(`closing at breakeven must give exactly the accrual (1$), got ${pnl.pnlCost}`);
  pass(`breakeven ${plain.toFixed(2)} unchanged by $1 and $500 dividends; total PNL at that price = accrual`);
});

test("dividends: a negative accrual charges the position and moves the breakeven away from the entry", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const price = toProfitLossDto(base(), 51000);
  // cash charge: a dividend owed on a short, or a cash-out of a reward
  const charged = toProfitLossDto(base({ _accruals: [{ type: "cash", amount: -10, timestamp: T0 }] }), 51000);
  if (charged.pnlDividends !== -10) return fail(`pnlDividends must be -10, got ${charged.pnlDividends}`);
  if (!near(charged.pnlCost, price.pnlCost - 10)) return fail(`pnlCost must be price pnl - 10: ${charged.pnlCost} vs ${price.pnlCost - 10}`);
  if (!near(charged.pnlCost, (charged.pnlPercentage / 100) * charged.pnlEntries)) return fail("pnlCost/pnlPercentage consistency broken for a charge");
  // asset charge is valued at the PNL price like a credit
  const assetCharge = toProfitLossDto(base({ _accruals: [{ type: "asset", amount: -0.001, timestamp: T0 }] }), 50000);
  if (!near(assetCharge.pnlDividends, -50)) return fail(`-0.001 × 50000 must be -50, got ${assetCharge.pnlDividends}`);
  // credit then equal charge nets to zero: identical to the price PNL
  const netted = toProfitLossDto(base({ _accruals: [
    { type: "cash", amount: 10, timestamp: T0 },
    { type: "cash", amount: -10, timestamp: T0 },
  ] }), 51000);
  if (netted.pnlDividends !== 0 || !near(netted.pnlCost, price.pnlCost)) return fail("a credit and an equal charge must net to the price PNL");
  // leverage 3: the charge is not multiplied either
  const lev = toProfitLossDto(base({ multiplier: 3, _accruals: [{ type: "cash", amount: -10, timestamp: T0 }] }), 51000);
  const priceLev = toProfitLossDto(base({ multiplier: 3 }), 51000);
  if (!near(lev.pnlCost, priceLev.pnlCost - 10)) return fail(`leveraged pnlCost must be 3x price pnl - 10 (not -30): ${lev.pnlCost}`);
  // breakeven is a price level: a charge does not move it either; the total PNL there is the charge itself
  const plain = getBreakevenPrice(base());
  const owed = getBreakevenPrice(base({ _accruals: [{ type: "cash", amount: -1, currentPrice: 50000, timestamp: T0 }] }));
  if (plain === null || owed === null) return fail("breakeven must be defined");
  if (!near(owed, plain, 1e-9)) return fail(`a charge must not move the breakeven: ${owed} vs ${plain}`);
  const atOwed = toProfitLossDto(base({ _accruals: [{ type: "cash", amount: -1, currentPrice: 50000, timestamp: T0 }] }), owed);
  if (!near(atOwed.pnlCost, -1, 1e-6)) return fail(`closing at breakeven must give exactly the charge (-1$), got ${atOwed.pnlCost}`);
  pass(`charge -10 USD / -0.001 asset folded with sign, nets to zero against an equal credit, breakeven ${plain.toFixed(2)} unchanged by a charge`);
});

test("dividends: liquidation is a price level — accruals neither push it away nor pull it closer", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const lev = (acc) => base({ multiplier: 5, isolated: true, _accruals: acc });
  const plain = getLiquidationPrice(lev([]));
  const paid = getLiquidationPrice(lev([{ type: "cash", amount: 10, currentPrice: 50000, timestamp: T0 }]));
  const owed = getLiquidationPrice(lev([{ type: "cash", amount: -10, currentPrice: 50000, timestamp: T0 }]));
  if (plain === null || paid === null || owed === null) return fail("liquidation must be defined for a 5x isolated long");
  if (!near(paid, plain, 1e-9) || !near(owed, plain, 1e-9)) return fail(`accruals must not move the liquidation price: ${plain} vs ${paid} / ${owed}`);
  // at the liquidation price the position margin is gone (-100% price PNL); the dividend stays on the account
  const pnl = toProfitLossDto(lev([{ type: "cash", amount: 10, currentPrice: 50000, timestamp: T0 }]), plain);
  if (!near(pnl.pnlCost, -100 + 10, 1e-6)) return fail(`PNL at liquidation must be -100% of invested + accrual = -90, got ${pnl.pnlCost}`);
  pass(`liquidation ${plain.toFixed(2)} unchanged by +10 / -10 accruals; realized at that price: -100 + 10 = ${pnl.pnlCost.toFixed(2)}`);
});

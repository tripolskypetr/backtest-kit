import { test } from "worker-testbed";
import {
  toProfitLossDto,
  getAccrualsCost,
  getBreakevenPrice,
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
  const withCash = toProfitLossDto(base({ _accruals: [{ id: "a", type: "cash", amount: 10, timestamp: T0 }] }), 51000);
  if (withCash.pnlDividends !== 10) return fail(`pnlDividends must be 10, got ${withCash.pnlDividends}`);
  if (!near(withCash.pnlCost, price.pnlCost + 10)) return fail(`pnlCost must be price pnl + 10: ${withCash.pnlCost} vs ${price.pnlCost + 10}`);
  if (!near(withCash.pnlPercentage, (withCash.pnlCost / 100) * 100)) return fail("pnlPercentage must be re-derived from pnlCost / pnlEntries");
  if (withCash.pnlEntries !== 100) return fail("pnlEntries (invested capital) must not change");
  // multiplier 3: the price component triples, the dividend does not
  const lev = toProfitLossDto(base({ multiplier: 3, _accruals: [{ id: "a", type: "cash", amount: 10, timestamp: T0 }] }), 51000);
  const priceLev = toProfitLossDto(base({ multiplier: 3 }), 51000);
  if (!near(priceLev.pnlCost, price.pnlCost * 3, 1e-6)) return fail("sanity: leveraged price pnl must be 3x");
  if (!near(lev.pnlCost, priceLev.pnlCost + 10)) return fail(`leveraged pnlCost must be 3x price pnl + 10 (not 30): ${lev.pnlCost}`);
  pass("cash accrual: +10 USD, multiplier-neutral, pnlCost/pnlPercentage consistent");
});

test("dividends: an asset accrual is valued at the PNL price", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const signal = base({ _accruals: [{ id: "stake", type: "asset", amount: 0.001, timestamp: T0 }] });
  const at50 = toProfitLossDto(signal, 50000);
  const at60 = toProfitLossDto(signal, 60000);
  if (!near(at50.pnlDividends, 50)) return fail(`0.001 × 50000 must be 50, got ${at50.pnlDividends}`);
  if (!near(at60.pnlDividends, 60)) return fail(`0.001 × 60000 must be 60, got ${at60.pnlDividends}`);
  if (!near(getAccrualsCost(signal, 55000), 55)) return fail("getAccrualsCost must value asset accruals at the given price");
  const mixed = base({ _accruals: [
    { id: "c", type: "cash", amount: 7, timestamp: T0 },
    { id: "s", type: "asset", amount: 0.002, timestamp: T0 },
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
  const div = toProfitLossDto(withPartial([{ id: "a", type: "cash", amount: 4, timestamp: T0 }]), 51000);
  if (div.pnlDividends !== 4) return fail("pnlDividends must be 4");
  if (!near(div.pnlCost, price.pnlCost + 4)) return fail("partial branch: pnlCost must be price pnl + 4");
  if (!near(div.pnlCost, (div.pnlPercentage / 100) * div.pnlEntries)) return fail("partial branch: pnlCost/pnlPercentage consistency");
  pass("partial-close branch folds accruals identically");
});

test("dividends: a cash accrual moves the breakeven price toward (and past) the entry", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const plain = getBreakevenPrice(base());
  const paid = getBreakevenPrice(base({ _accruals: [{ id: "a", type: "cash", amount: 1, timestamp: T0 }] }));
  if (plain === null || paid === null) return fail("breakeven must be defined for a plain long");
  if (!(paid < plain)) return fail(`a received dividend must lower the LONG breakeven: ${paid} vs ${plain}`);
  // the breakeven price still yields exactly 0% PNL with the accrual included
  const pnl = toProfitLossDto(base({ _accruals: [{ id: "a", type: "cash", amount: 1, timestamp: T0 }] }), paid);
  if (!near(pnl.pnlPercentage, 0, 1e-6)) return fail(`closing at breakeven must give 0%, got ${pnl.pnlPercentage}`);
  pass(`breakeven lowered from ${plain.toFixed(2)} to ${paid.toFixed(2)} by a $1 dividend, exact 0% at the new level`);
});

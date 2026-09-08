import { test } from "worker-testbed";
import { toProfitLossDto, setConfig, validateSignal } from "../../build/index.mjs";

const EPS = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < EPS;

// ---------------------------------------------------------------------------
// multiplier — PNL leverage semantics
//
// pnlPercentage is multiplied by signal.multiplier (default:
// GLOBAL_CONFIG.CC_SIGNAL_LEVERAGE_MULTIPLIER = 1); pnlCost follows automatically
// since pnlCost = pnlPercentage / 100 * pnlEntries. pnlEntries (invested
// capital) stays unscaled.
//
// Baseline literals below are the same values dca.test.mjs pins (they bake
// in CC_PERCENT_SLIPPAGE = 0.1 / CC_PERCENT_FEE = 0.1 from test/config/setup.mjs):
//   LONG  no partials, close@110              ->  9.570439560
//   SHORT no partials, close@90               ->  9.629639640
//   LONG  DCA [100, 80], close@100            -> 12.062949550
//   S3-key partial (50%@120 -> DCA@80 -> @90) ->  8.324184565
// ---------------------------------------------------------------------------

test("multiplier: LONG no partials, close@110, x2 doubles pnlPercentage", ({ pass, fail }) => {
  const { pnlPercentage } = toProfitLossDto({ position: "long", priceOpen: 100, multiplier: 2 }, 110);
  const expected = 2 * 9.570439560;
  if (!approxEqual(pnlPercentage, expected)) { fail(`Expected ${expected}, got ${pnlPercentage}`); return; }
  pass(`pnl = ${pnlPercentage.toFixed(9)}% (2x leverage)`);
});

test("multiplier: SHORT no partials, close@90, x2 doubles pnlPercentage", ({ pass, fail }) => {
  const { pnlPercentage } = toProfitLossDto({ position: "short", priceOpen: 100, multiplier: 2 }, 90);
  const expected = 2 * 9.629639640;
  if (!approxEqual(pnlPercentage, expected)) { fail(`Expected ${expected}, got ${pnlPercentage}`); return; }
  pass(`pnl = ${pnlPercentage.toFixed(9)}% (2x leverage)`);
});

test("multiplier: LONG DCA [100, 80] close@100, fractional x0.5 halves pnlPercentage", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    multiplier: 0.5,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 100);
  const expected = 0.5 * 12.062949550;
  if (!approxEqual(pnlPercentage, expected)) { fail(`Expected ${expected}, got ${pnlPercentage}`); return; }
  pass(`pnl = ${pnlPercentage.toFixed(9)}% (0.5x leverage)`);
});

test("multiplier: partials branch (S3-key), x3 triples pnlPercentage", ({ pass, fail }) => {
  // Same scenario dca.test.mjs pins at 8.324184565:
  // entry[100,80], partial 50%@120 (costBasisAtClose=100, cnt=1), close@90
  const signal = {
    position: "long",
    priceOpen: 100,
    multiplier: 3,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "profit", percent: 50, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 90);
  const expected = 3 * 8.324184565;
  if (!approxEqual(pnlPercentage, expected)) { fail(`Expected ${expected}, got ${pnlPercentage}`); return; }
  pass(`pnl = ${pnlPercentage.toFixed(9)}% (3x leverage, partials branch)`);
});

test("multiplier: explicit 1 is identical to the omitted field (no-op)", ({ pass, fail }) => {
  const base = toProfitLossDto({ position: "long", priceOpen: 100 }, 110);
  const explicit = toProfitLossDto({ position: "long", priceOpen: 100, multiplier: 1 }, 110);
  if (base.pnlPercentage !== explicit.pnlPercentage) {
    fail(`Expected identical pnlPercentage, got ${base.pnlPercentage} vs ${explicit.pnlPercentage}`);
    return;
  }
  if (base.pnlCost !== explicit.pnlCost) {
    fail(`Expected identical pnlCost, got ${base.pnlCost} vs ${explicit.pnlCost}`);
    return;
  }
  pass("multiplier: 1 is a strict no-op");
});

test("multiplier: pnlCost identity holds at x2, pnlEntries stays unscaled", ({ pass, fail }) => {
  const pnl = toProfitLossDto({ position: "long", priceOpen: 100, multiplier: 2 }, 110);
  if (pnl.pnlEntries !== 100) { fail(`Expected pnlEntries 100 (unscaled), got ${pnl.pnlEntries}`); return; }
  const expectedCost = (pnl.pnlPercentage / 100) * pnl.pnlEntries;
  if (!approxEqual(pnl.pnlCost, expectedCost)) {
    fail(`pnlCost identity failed: pnlCost=${pnl.pnlCost}, expected=${expectedCost}`);
    return;
  }
  pass(`pnlCost identity verified at 2x: ${pnl.pnlCost.toFixed(9)} USD`);
});

test("multiplier: CC_SIGNAL_LEVERAGE_MULTIPLIER config default applies when the field is omitted", ({ pass, fail }) => {
  // setConfig mutates global state and the whole suite runs in one process —
  // restore in finally so later test files see the default again.
  setConfig({ CC_SIGNAL_LEVERAGE_MULTIPLIER: 2 }, true);
  try {
    const { pnlPercentage } = toProfitLossDto({ position: "long", priceOpen: 100 }, 110);
    const expected = 2 * 9.570439560;
    if (!approxEqual(pnlPercentage, expected)) { fail(`Expected ${expected}, got ${pnlPercentage}`); return; }
    pass(`config default 2x applied: pnl = ${pnlPercentage.toFixed(9)}%`);
  } finally {
    setConfig({ CC_SIGNAL_LEVERAGE_MULTIPLIER: 1 }, true);
  }
});

test("multiplier: setConfig rejects non-positive CC_SIGNAL_LEVERAGE_MULTIPLIER", ({ pass, fail }) => {
  try {
    setConfig({ CC_SIGNAL_LEVERAGE_MULTIPLIER: -1 });
    fail("Should have thrown for negative CC_SIGNAL_LEVERAGE_MULTIPLIER");
  } catch (error) {
    // setConfig rolls the previous config back on validation failure
    if (error.message.includes("CC_SIGNAL_LEVERAGE_MULTIPLIER")) {
      pass("Correctly rejected negative CC_SIGNAL_LEVERAGE_MULTIPLIER");
    } else {
      fail(`Wrong error message: ${error.message}`);
    }
  }
});

test("multiplier: validateSignal rejects non-positive and Infinity multiplier", ({ pass, fail }) => {
  const dto = {
    position: "long",
    priceOpen: 100,
    priceTakeProfit: 110,
    priceStopLoss: 90,
    minuteEstimatedTime: 60,
    // validateCommonSignal получает задефолченные значения (контракт кол-сайтов);
    // isolated обязателен с появлением isolated-margin
    isolated: false,
  };
  if (!validateSignal({ ...dto, multiplier: 2.5 }, 100)) {
    fail("fractional multiplier 2.5 must be valid");
    return;
  }
  if (validateSignal({ ...dto, multiplier: 0 }, 100)) {
    fail("multiplier 0 must be rejected");
    return;
  }
  if (validateSignal({ ...dto, multiplier: -2 }, 100)) {
    fail("negative multiplier must be rejected");
    return;
  }
  if (validateSignal({ ...dto, multiplier: Infinity }, 100)) {
    fail("Infinity multiplier must be rejected");
    return;
  }
  pass("validateSignal: 2.5x accepted; 0, -2 and Infinity rejected");
});

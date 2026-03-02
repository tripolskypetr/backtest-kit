import { test } from "worker-testbed";
import { toProfitLossDto, getEffectivePriceOpen } from "../../build/index.mjs";

// Constants matching GLOBAL_CONFIG defaults
const SLIP = 0.1 / 100;
const FEE = 0.1;

// Tolerance for floating-point comparisons
const EPS = 1e-6;

const approxEqual = (a, b) => Math.abs(a - b) < EPS;

// ---------------------------------------------------------------------------
// getEffectivePriceOpen
// ---------------------------------------------------------------------------

test("getEffectivePriceOpen: returns priceOpen when no _entry", ({ pass, fail }) => {
  const signal = { priceOpen: 100 };
  const result = getEffectivePriceOpen(signal);
  if (result !== 100) {
    fail(`Expected 100, got ${result}`);
    return;
  }
  pass("returns priceOpen when _entry is absent");
});

test("getEffectivePriceOpen: returns priceOpen when _entry is empty", ({ pass, fail }) => {
  const signal = { priceOpen: 100, _entry: [] };
  const result = getEffectivePriceOpen(signal);
  if (result !== 100) {
    fail(`Expected 100, got ${result}`);
    return;
  }
  pass("returns priceOpen when _entry is empty array");
});

test("getEffectivePriceOpen: returns single entry price", ({ pass, fail }) => {
  const signal = { priceOpen: 100, _entry: [{ price: 100 }] };
  const result = getEffectivePriceOpen(signal);
  if (result !== 100) {
    fail(`Expected 100, got ${result}`);
    return;
  }
  pass("returns single entry price");
});

test("getEffectivePriceOpen: returns arithmetic mean of two entries", ({ pass, fail }) => {
  // open=100, DCA at 80 → mean = 90
  const signal = { priceOpen: 100, _entry: [{ price: 100 }, { price: 80 }] };
  const result = getEffectivePriceOpen(signal);
  if (result !== 90) {
    fail(`Expected 90, got ${result}`);
    return;
  }
  pass("returns mean of [100, 80] = 90");
});

test("getEffectivePriceOpen: returns arithmetic mean of three entries", ({ pass, fail }) => {
  // open=100, DCA at 80, DCA at 70 → mean = 83.333...
  const signal = { priceOpen: 100, _entry: [{ price: 100 }, { price: 80 }, { price: 70 }] };
  const result = getEffectivePriceOpen(signal);
  const expected = (100 + 80 + 70) / 3;
  if (!approxEqual(result, expected)) {
    fail(`Expected ${expected}, got ${result}`);
    return;
  }
  pass(`returns mean of [100, 80, 70] = ${expected.toFixed(6)}`);
});

// ---------------------------------------------------------------------------
// toProfitLossDto — baseline (no partials, no DCA)
// ---------------------------------------------------------------------------

test("toProfitLossDto: LONG no partials, profitable close", ({ pass, fail }) => {
  // open=100, close=110 → expected pnl ≈ 9.570440
  const signal = { position: "long", priceOpen: 100 };
  const { pnlPercentage, priceOpen, priceClose } = toProfitLossDto(signal, 110);

  if (!approxEqual(pnlPercentage, 9.570440)) {
    fail(`Expected ≈9.570440, got ${pnlPercentage}`);
    return;
  }
  if (priceOpen !== 100 || priceClose !== 110) {
    fail(`Expected priceOpen=100 priceClose=110, got ${priceOpen} / ${priceClose}`);
    return;
  }
  pass(`LONG pnl = ${pnlPercentage.toFixed(6)}%`);
});

test("toProfitLossDto: SHORT no partials, profitable close", ({ pass, fail }) => {
  // open=100, close=90 → expected pnl ≈ 9.629640
  const signal = { position: "short", priceOpen: 100 };
  const { pnlPercentage } = toProfitLossDto(signal, 90);

  if (!approxEqual(pnlPercentage, 9.629640)) {
    fail(`Expected ≈9.629640, got ${pnlPercentage}`);
    return;
  }
  pass(`SHORT pnl = ${pnlPercentage.toFixed(6)}%`);
});

test("toProfitLossDto: LONG no partials, losing close", ({ pass, fail }) => {
  // open=100, close=90 — loss trade
  const oSlip = 100 * (1 + SLIP);
  const cSlip = 90 * (1 - SLIP);
  const expected = ((cSlip - oSlip) / oSlip) * 100 - FEE * (1 + cSlip / oSlip);
  const signal = { position: "long", priceOpen: 100 };
  const { pnlPercentage } = toProfitLossDto(signal, 90);
  if (!approxEqual(pnlPercentage, expected)) {
    fail(`Expected ${expected.toFixed(6)}, got ${pnlPercentage}`);
    return;
  }
  pass(`LONG loss pnl = ${pnlPercentage.toFixed(6)}%`);
});

// ---------------------------------------------------------------------------
// toProfitLossDto — DCA only (no partials, with _entry)
// ---------------------------------------------------------------------------

test("toProfitLossDto: LONG with DCA, no partials", ({ pass, fail }) => {
  // _entry = [100, 80] → effectivePrice = 90; close at 100
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
  };
  const oSlip = 90 * (1 + SLIP);
  const cSlip = 100 * (1 - SLIP);
  const expected = ((cSlip - oSlip) / oSlip) * 100 - FEE * (1 + cSlip / oSlip);
  const { pnlPercentage } = toProfitLossDto(signal, 100);
  if (!approxEqual(pnlPercentage, expected)) {
    fail(`Expected ${expected.toFixed(6)}, got ${pnlPercentage}`);
    return;
  }
  pass(`LONG DCA pnl (effective open=90, close=100) = ${pnlPercentage.toFixed(6)}%`);
});

// ---------------------------------------------------------------------------
// Scenario 1: averageBuy → partialProfit (LONG)
//   open=100, DCA at 80 → effectivePrice=90
//   partial 50% at 110 (effectivePrice snapshot=90)
//   final close 50% at 120 (remainingEffective=90)
//   expected pnl ≈ 27.294955
// ---------------------------------------------------------------------------

test("toProfitLossDto: S1 averageBuy then partialProfit (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
    _partial: [
      { type: "profit", percent: 50, price: 110, effectivePrice: 90 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 120);
  if (!approxEqual(pnlPercentage, 27.294955)) {
    fail(`Expected ≈27.294955, got ${pnlPercentage}`);
    return;
  }
  pass(`S1 pnl = ${pnlPercentage.toFixed(6)}%`);
});

// ---------------------------------------------------------------------------
// Scenario 2: averageBuy → partialLoss (LONG)
//   open=100, DCA at 80 → effectivePrice=90
//   partial 30% at 75 (effectivePrice snapshot=90)
//   final close 70% at 100 (remainingEffective=90)
//   expected pnl ≈ 2.369855
// ---------------------------------------------------------------------------

test("toProfitLossDto: S2 averageBuy then partialLoss (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
    _partial: [
      { type: "loss", percent: 30, price: 75, effectivePrice: 90 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 100);
  if (!approxEqual(pnlPercentage, 2.369855)) {
    fail(`Expected ≈2.369855, got ${pnlPercentage}`);
    return;
  }
  pass(`S2 pnl = ${pnlPercentage.toFixed(6)}%`);
});

// ---------------------------------------------------------------------------
// Scenario 3: partialProfit → averageBuy (LONG)
//   open=100, partial 30% at 120 (effectivePrice snapshot=100, BEFORE DCA)
//   DCA at 80 → effectivePrice=90
//   final close 70% at 105 (remainingEffective=90)
//   expected pnl ≈ 17.214137
// ---------------------------------------------------------------------------

test("toProfitLossDto: S3 partialProfit then averageBuy (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],  // DCA already applied
    _partial: [
      { type: "profit", percent: 30, price: 120, effectivePrice: 100 },  // snapshot before DCA
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 105);
  if (!approxEqual(pnlPercentage, 17.214137)) {
    fail(`Expected ≈17.214137, got ${pnlPercentage}`);
    return;
  }
  pass(`S3 pnl = ${pnlPercentage.toFixed(6)}%`);
});

// ---------------------------------------------------------------------------
// Scenario 4: partialLoss → averageBuy (LONG)
//   open=100, partial 30% at 80 (effectivePrice snapshot=100, BEFORE DCA)
//   DCA at 60 → effectivePrice=80 (mean of 100, 60)
//   final close 70% at 90 (remainingEffective=80)
//   expected pnl ≈ 2.342161
// ---------------------------------------------------------------------------

test("toProfitLossDto: S4 partialLoss then averageBuy (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 60 }],  // DCA already applied → mean=80
    _partial: [
      { type: "loss", percent: 30, price: 80, effectivePrice: 100 },  // snapshot before DCA
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 90);
  if (!approxEqual(pnlPercentage, 2.342161)) {
    fail(`Expected ≈2.342161, got ${pnlPercentage}`);
    return;
  }
  pass(`S4 pnl = ${pnlPercentage.toFixed(6)}%`);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("toProfitLossDto: partial closes summing to 100% (no remaining)", ({ pass, fail }) => {
  // Two partials: 60% + 40% = 100%, no remaining position
  const signal = {
    position: "long",
    priceOpen: 100,
    _partial: [
      { type: "profit", percent: 60, price: 110, effectivePrice: 100 },
      { type: "profit", percent: 40, price: 115, effectivePrice: 100 },
    ],
  };
  const pOSlip = 100 * (1 + SLIP);
  const cSlip1 = 110 * (1 - SLIP);
  const cSlip2 = 115 * (1 - SLIP);
  const pnl1 = ((cSlip1 - pOSlip) / pOSlip) * 100;
  const pnl2 = ((cSlip2 - pOSlip) / pOSlip) * 100;
  const weighted = 0.6 * pnl1 + 0.4 * pnl2;
  const fees = FEE + FEE * 0.6 * (cSlip1 / pOSlip) + FEE * 0.4 * (cSlip2 / pOSlip);
  const expected = weighted - fees;

  const { pnlPercentage } = toProfitLossDto(signal, 999); // priceClose irrelevant (remainingPercent=0)
  if (!approxEqual(pnlPercentage, expected)) {
    fail(`Expected ${expected.toFixed(6)}, got ${pnlPercentage}`);
    return;
  }
  pass(`100% partial pnl = ${pnlPercentage.toFixed(6)}%`);
});

test("toProfitLossDto: throws when partial percents exceed 100%", ({ pass, fail }) => {
  const signal = {
    id: "test-signal",
    position: "long",
    priceOpen: 100,
    _partial: [
      { type: "profit", percent: 70, price: 110, effectivePrice: 100 },
      { type: "profit", percent: 40, price: 115, effectivePrice: 100 },
    ],
  };
  try {
    toProfitLossDto(signal, 120);
    fail("Expected an error but none was thrown");
  } catch (e) {
    if (e.message.includes("110%")) {
      pass("Throws with correct message when partials exceed 100%");
    } else {
      fail(`Unexpected error message: ${e.message}`);
    }
  }
});

test("toProfitLossDto: effectivePrice per-partial is independent of current _entry", ({ pass, fail }) => {
  // Verify that each partial's PNL uses its own effectivePrice, not the current mean of _entry.
  // partial.effectivePrice=100 (before DCA), current _entry gives mean=70
  // If the function incorrectly used getEffectivePriceOpen it would use 70 instead of 100.
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 40 }],  // mean=70, very different from 100
    _partial: [
      { type: "profit", percent: 50, price: 120, effectivePrice: 100 },  // snapshot=100
    ],
  };

  // Expected: partial uses effectivePrice=100
  const pOSlip = 100 * (1 + SLIP);
  const cSlip = 120 * (1 - SLIP);
  const partialPnl = ((cSlip - pOSlip) / pOSlip) * 100;

  // Remaining 50% uses current effective price (mean of _entry = 70)
  const rOSlip = 70 * (1 + SLIP);
  const rCSlip = 90 * (1 - SLIP);
  const remainingPnl = ((rCSlip - rOSlip) / rOSlip) * 100;

  const fees = FEE + FEE * 0.5 * (cSlip / pOSlip) + FEE * 0.5 * (rCSlip / rOSlip);
  const expected = 0.5 * partialPnl + 0.5 * remainingPnl - fees;

  const { pnlPercentage } = toProfitLossDto(signal, 90);
  if (!approxEqual(pnlPercentage, expected)) {
    fail(`Expected ${expected.toFixed(6)}, got ${pnlPercentage}. Partial may be using wrong effectivePrice.`);
    return;
  }
  pass(`effectivePrice isolation confirmed, pnl = ${pnlPercentage.toFixed(6)}%`);
});

// ---------------------------------------------------------------------------
// Interleaved sequences — alternating partial closes and DCA rounds
// ---------------------------------------------------------------------------

// S5: partial → DCA → partial → DCA → final close  (LONG)
//   open=100
//   partialProfit 25% at 115  (snap=100)
//   DCA at 80 → mean(100,80)=90
//   partialProfit 25% at 112  (snap=90)
//   DCA at 70 → mean(100,80,70)=83.333
//   final close 50% at 105   (remaining eff=83.333)
//   expected pnl ≈ 22.393019
test("toProfitLossDto: S5 partial→DCA→partial→DCA→close (LONG)", ({ pass, fail }) => {
  const snap2 = (100 + 80) / 2;           // 90
  const remEff = (100 + 80 + 70) / 3;     // 83.333...
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }, { price: 70 }],
    _partial: [
      { type: "profit", percent: 25, price: 115, effectivePrice: 100 },
      { type: "profit", percent: 25, price: 112, effectivePrice: snap2 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 105);
  if (!approxEqual(pnlPercentage, 22.393019)) {
    fail(`Expected ≈22.393019, got ${pnlPercentage}`);
    return;
  }
  pass(`S5 pnl = ${pnlPercentage.toFixed(6)}% (remEff=${remEff.toFixed(4)})`);
});

// S6: DCA → partial → DCA → partial → final close  (LONG)
//   open=100
//   DCA at 85 → mean(100,85)=92.5
//   partialProfit 30% at 110  (snap=92.5)
//   DCA at 75 → mean(100,85,75)=86.666
//   partialLoss   20% at 88   (snap=86.666)
//   final close   50% at 95   (remaining eff=86.666)
//   expected pnl ≈ 10.359130
test("toProfitLossDto: S6 DCA→partial→DCA→partial→close (LONG)", ({ pass, fail }) => {
  const snap1 = (100 + 85) / 2;           // 92.5
  const snap2 = (100 + 85 + 75) / 3;      // 86.666...
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 85 }, { price: 75 }],
    _partial: [
      { type: "profit", percent: 30, price: 110, effectivePrice: snap1 },
      { type: "loss",   percent: 20, price: 88,  effectivePrice: snap2 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 95);
  if (!approxEqual(pnlPercentage, 10.359130)) {
    fail(`Expected ≈10.359130, got ${pnlPercentage}`);
    return;
  }
  pass(`S6 pnl = ${pnlPercentage.toFixed(6)}%`);
});

// S7: partial → DCA → DCA → partial → final close  (LONG)
//   open=100
//   partialLoss   20% at 85   (snap=100)
//   DCA at 70 → mean(100,70)=85
//   DCA at 60 → mean(100,70,60)=76.666
//   partialProfit 30% at 95   (snap=76.666)
//   final close   50% at 80   (remaining eff=76.666)
//   expected pnl ≈ 5.929208
test("toProfitLossDto: S7 partial→DCA→DCA→partial→close (LONG)", ({ pass, fail }) => {
  const snap2 = (100 + 70 + 60) / 3;      // 76.666...
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 70 }, { price: 60 }],
    _partial: [
      { type: "loss",   percent: 20, price: 85, effectivePrice: 100 },
      { type: "profit", percent: 30, price: 95, effectivePrice: snap2 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 80);
  if (!approxEqual(pnlPercentage, 5.929208)) {
    fail(`Expected ≈5.929208, got ${pnlPercentage}`);
    return;
  }
  pass(`S7 pnl = ${pnlPercentage.toFixed(6)}%`);
});

// S8: DCA → partial → DCA → partial → final close  (LONG, each partial captures its own snap)
//   open=100
//   DCA at 80 → mean(100,80)=90
//   partialProfit 40% at 100  (snap=90)
//   DCA at 70 → mean(100,80,70)=83.333
//   partialProfit 30% at 110  (snap=83.333)
//   final close   30% at 95   (remaining eff=83.333)
//   expected pnl ≈ 17.790184
//   NOTE: buggy code (all partials use final effOpen=83.333) would give 21.335087 — different
test("toProfitLossDto: S8 DCA→partial→DCA→partial→close each snap distinct (LONG)", ({ pass, fail }) => {
  const snap1 = (100 + 80) / 2;           // 90
  const snap2 = (100 + 80 + 70) / 3;      // 83.333...
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }, { price: 70 }],
    _partial: [
      { type: "profit", percent: 40, price: 100, effectivePrice: snap1 },
      { type: "profit", percent: 30, price: 110, effectivePrice: snap2 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 95);
  if (!approxEqual(pnlPercentage, 17.790184)) {
    fail(`Expected ≈17.790184, got ${pnlPercentage}`);
    return;
  }
  pass(`S8 pnl = ${pnlPercentage.toFixed(6)}%`);
});

// S9: partial → partial → DCA → final close  (LONG, two partials before any DCA)
//   open=100
//   partialProfit 20% at 120  (snap=100)
//   partialLoss   20% at 90   (snap=100)
//   DCA at 70 → mean(100,70)=85
//   final close   60% at 95   (remaining eff=85)
//   expected pnl ≈ 8.632083
test("toProfitLossDto: S9 partial→partial→DCA→close (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 70 }],
    _partial: [
      { type: "profit", percent: 20, price: 120, effectivePrice: 100 },
      { type: "loss",   percent: 20, price: 90,  effectivePrice: 100 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 95);
  if (!approxEqual(pnlPercentage, 8.632083)) {
    fail(`Expected ≈8.632083, got ${pnlPercentage}`);
    return;
  }
  pass(`S9 pnl = ${pnlPercentage.toFixed(6)}%`);
});

// S10: DCA → partial → DCA → partial → final close  (SHORT)
//   open=100
//   DCA up at 110 → mean(100,110)=105
//   partialProfit 30% at 90   (snap=105)
//   DCA up at 120 → mean(100,110,120)=110
//   partialProfit 30% at 85   (snap=110)
//   final close   40% at 88   (remaining eff=110)
//   expected pnl ≈ 18.760884
test("toProfitLossDto: S10 SHORT DCA→partial→DCA→partial→close", ({ pass, fail }) => {
  const snap1 = (100 + 110) / 2;           // 105
  const snap2 = (100 + 110 + 120) / 3;     // 110
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 110 }, { price: 120 }],
    _partial: [
      { type: "profit", percent: 30, price: 90, effectivePrice: snap1 },
      { type: "profit", percent: 30, price: 85, effectivePrice: snap2 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 88);
  if (!approxEqual(pnlPercentage, 18.760884)) {
    fail(`Expected ≈18.760884, got ${pnlPercentage}`);
    return;
  }
  pass(`S10 SHORT pnl = ${pnlPercentage.toFixed(6)}%`);
});

// S11: partial → DCA → partial → final close  (SHORT, loss then profit)
//   open=100
//   partialLoss   25% at 105  (snap=100, price moved up = loss for SHORT)
//   DCA up at 115 → mean(100,115)=107.5
//   partialProfit 25% at 88   (snap=107.5)
//   final close   50% at 92   (remaining eff=107.5)
//   expected pnl ≈ 10.125310
test("toProfitLossDto: S11 SHORT partial(loss)→DCA→partial(profit)→close", ({ pass, fail }) => {
  const snap2 = (100 + 115) / 2;           // 107.5
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 115 }],
    _partial: [
      { type: "loss",   percent: 25, price: 105, effectivePrice: 100 },
      { type: "profit", percent: 25, price: 88,  effectivePrice: snap2 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 92);
  if (!approxEqual(pnlPercentage, 10.125310)) {
    fail(`Expected ≈10.125310, got ${pnlPercentage}`);
    return;
  }
  pass(`S11 SHORT pnl = ${pnlPercentage.toFixed(6)}%`);
});

// S12: four partials with three DCA rounds interleaved, position fully closed  (LONG)
//   open=100
//   partialProfit 20% at 115  (snap=100)
//   DCA at 80 → mean(100,80)=90
//   partialProfit 20% at 108  (snap=90)
//   DCA at 72 → mean(100,80,72)=84
//   partialLoss   20% at 83   (snap=84)
//   DCA at 65 → mean(100,80,72,65)=79.25
//   partialProfit 40% at 100  (snap=79.25)
//   total closed = 100%, priceClose is irrelevant
//   expected pnl ≈ 16.783854
test("toProfitLossDto: S12 four partials three DCA rounds 100% closed (LONG)", ({ pass, fail }) => {
  const snap1 = 100;
  const snap2 = (100 + 80) / 2;                    // 90
  const snap3 = (100 + 80 + 72) / 3;               // 84
  const snap4 = (100 + 80 + 72 + 65) / 4;          // 79.25
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }, { price: 72 }, { price: 65 }],
    _partial: [
      { type: "profit", percent: 20, price: 115, effectivePrice: snap1 },
      { type: "profit", percent: 20, price: 108, effectivePrice: snap2 },
      { type: "loss",   percent: 20, price: 83,  effectivePrice: snap3 },
      { type: "profit", percent: 40, price: 100, effectivePrice: snap4 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 999); // irrelevant, 100% closed
  if (!approxEqual(pnlPercentage, 16.783854)) {
    fail(`Expected ≈16.783854, got ${pnlPercentage}`);
    return;
  }
  pass(`S12 pnl = ${pnlPercentage.toFixed(6)}% (4 partials, 3 DCA rounds, 100% closed)`);
});

// ---------------------------------------------------------------------------

test("toProfitLossDto: SHORT S3 partialProfit then averageBuy", ({ pass, fail }) => {
  // SHORT: open=100, partial 30% at 80 (effectivePrice snapshot=100, before DCA)
  // SHORT DCA = averaging UP: DCA at 120 → mean of (100, 120) = 110
  // final close 70% at 85 (remainingEffective=110)
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 120 }],  // SHORT DCA → mean=110
    _partial: [
      { type: "profit", percent: 30, price: 80, effectivePrice: 100 },  // snapshot before DCA
    ],
  };

  // partial 30%: open SHORT at 100 (sell lower), close at 80 (buy higher)
  const pOSlip = 100 * (1 - SLIP);  // SHORT: sell lower
  const pCSlip = 80 * (1 + SLIP);   // SHORT: buy higher
  const partialPnl = ((pOSlip - pCSlip) / pOSlip) * 100;

  // remaining 70%: effectivePrice=110
  const rOSlip = 110 * (1 - SLIP);
  const rCSlip = 85 * (1 + SLIP);
  const remainingPnl = ((rOSlip - rCSlip) / rOSlip) * 100;

  const fees = FEE + FEE * 0.3 * (pCSlip / pOSlip) + FEE * 0.7 * (rCSlip / rOSlip);
  const expected = 0.3 * partialPnl + 0.7 * remainingPnl - fees;

  const { pnlPercentage } = toProfitLossDto(signal, 85);
  if (!approxEqual(pnlPercentage, expected)) {
    fail(`Expected ${expected.toFixed(6)}, got ${pnlPercentage}`);
    return;
  }
  pass(`SHORT S3 pnl = ${pnlPercentage.toFixed(6)}%`);
});

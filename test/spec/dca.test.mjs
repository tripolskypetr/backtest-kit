import { test } from "worker-testbed";
import { toProfitLossDto, getEffectivePriceOpen } from "../../build/index.mjs";

const EPS = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < EPS;
const hm = (...ps) => ps.length / ps.reduce((s, p) => s + 1 / p, 0);

// ---------------------------------------------------------------------------
// getEffectivePriceOpen — no partials (harmonic mean of _entry prices)
// Each DCA entry = fixed $100, so harmonic mean is the correct average price.
// hm([P1..Pn]) = n / Σ(1/Pi)
// ---------------------------------------------------------------------------

test("getEffectivePriceOpen: no _entry → returns priceOpen", ({ pass, fail }) => {
  const result = getEffectivePriceOpen({ priceOpen: 100 });
  if (result !== 100) { fail(`Expected 100, got ${result}`); return; }
  pass("ok");
});

test("getEffectivePriceOpen: empty _entry → returns priceOpen", ({ pass, fail }) => {
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [] });
  if (result !== 100) { fail(`Expected 100, got ${result}`); return; }
  pass("ok");
});

test("getEffectivePriceOpen: single entry → returns that price", ({ pass, fail }) => {
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100 }] });
  if (!approxEqual(result, 100)) { fail(`Expected 100, got ${result}`); return; }
  pass("ok");
});

test("getEffectivePriceOpen: two entries → harmonic mean", ({ pass, fail }) => {
  // $100@100 + $100@80 = 2.25 BTC for $200 → avg = 200/2.25 = 88.888...
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100 }, { price: 80 }] });
  if (!approxEqual(result, hm(100, 80))) { fail(`Expected ${hm(100,80).toFixed(9)}, got ${result}`); return; }
  pass(`hm([100,80]) = ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: three entries → harmonic mean", ({ pass, fail }) => {
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100 }, { price: 80 }, { price: 70 }] });
  if (!approxEqual(result, hm(100, 80, 70))) { fail(`Expected ${hm(100,80,70).toFixed(9)}, got ${result}`); return; }
  pass(`hm([100,80,70]) = ${result.toFixed(9)}`);
});

// ---------------------------------------------------------------------------
// getEffectivePriceOpen — single partial + new DCA after it
// New algorithm: remainingCostBasis = costBasis_before * (1 - percent/100)
//                oldCoins = remainingCostBasis / effectivePrice
// For first partial: costBasis_before = entryCountAtClose * 100 (same as old formula)
// ---------------------------------------------------------------------------

test("getEffectivePriceOpen: partial exit then DCA — correct weighted price", ({ pass, fail }) => {
  // entry[100], partial 30%@120 (eff=100, cnt=1), DCA@80
  // costBasis_before = 1*100 = 100
  // remainingCostBasis = 100*(1-0.3) = 70
  // oldCoins = 70/100 = 0.7
  // newCoins = 100/80 = 1.25, totalCost = 70+100 = 170
  // result = 170 / 1.95 = 87.179487179
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
    _partial: [{ type: "profit", percent: 30, price: 120, effectivePrice: 100, entryCountAtClose: 1 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, 87.179487179)) { fail(`Expected 87.179487179, got ${result}`); return; }
  pass(`remEff = ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: no new DCA after partial → effective price unchanged", ({ pass, fail }) => {
  // entry[100,80], partial 50%@110 (eff=hm[100,80], cnt=2), no new entries
  // remainingCostBasis = 200*(1-0.5)=100, oldCoins=100/eff, totalCost=100
  // result = 100/oldCoins = eff (unchanged)
  const snap = hm(100, 80);
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
    _partial: [{ type: "profit", percent: 50, price: 110, effectivePrice: snap, entryCountAtClose: 2 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, snap)) { fail(`Expected ${snap.toFixed(9)}, got ${result}`); return; }
  pass(`same eff after partial with no new DCA: ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: 100% closed single partial → returns lastPartial.effectivePrice", ({ pass, fail }) => {
  // totalCoins = 0 → returns effectivePrice from last partial
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100 }],
    _partial: [{ type: "profit", percent: 100, price: 120, effectivePrice: 100, entryCountAtClose: 1 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, 100)) { fail(`Expected 100, got ${result}`); return; }
  pass("ok");
});

test("getEffectivePriceOpen: two partials with same entryCountAtClose — cost basis chains correctly", ({ pass, fail }) => {
  // entry[100], p1=30%@110(cnt=1,eff=100), p2=50%@120(cnt=1,eff=70)
  // Replay: i=0: costBasis=100, reduce→70; i=1: prevCnt=1, newEntries=0, costBasis=70 (NOT reduced, last)
  // remainingCostBasis = 70*(1-0.50) = 35
  // oldCoins = 35/70 = 0.5, newEntries=[] (entries.slice(1)=empty), newCoins=0
  // totalCost = 35, result = 35/0.5 = 70
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100 }],
    _partial: [
      { type: "profit", percent: 30, price: 110, effectivePrice: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 50, price: 120, effectivePrice: 70,  entryCountAtClose: 1 },
    ],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, 70)) { fail(`Expected 70.000000000, got ${result}`); return; }
  pass(`getEff multi-partial chains: ${result.toFixed(9)}`);
});

// ---------------------------------------------------------------------------
// toProfitLossDto — baseline (no partials, no DCA)
// ---------------------------------------------------------------------------

test("toProfitLossDto: LONG no partials, close@110", ({ pass, fail }) => {
  const { pnlPercentage, priceOpen, priceClose } = toProfitLossDto({ position: "long", priceOpen: 100 }, 110);
  if (!approxEqual(pnlPercentage, 9.570439560)) { fail(`Expected 9.570439560, got ${pnlPercentage}`); return; }
  if (priceOpen !== 100 || priceClose !== 110) { fail("wrong priceOpen/priceClose"); return; }
  pass(`pnl = ${pnlPercentage.toFixed(9)}%`);
});

test("toProfitLossDto: SHORT no partials, close@90", ({ pass, fail }) => {
  const { pnlPercentage } = toProfitLossDto({ position: "short", priceOpen: 100 }, 90);
  if (!approxEqual(pnlPercentage, 9.629639640)) { fail(`Expected 9.629639640, got ${pnlPercentage}`); return; }
  pass(`pnl = ${pnlPercentage.toFixed(9)}%`);
});

test("toProfitLossDto: LONG with DCA[100,80], no partials, close@100", ({ pass, fail }) => {
  // eff = hm([100,80]) = 88.888...
  const signal = { position: "long", priceOpen: 100, _entry: [{ price: 100 }, { price: 80 }] };
  const { pnlPercentage } = toProfitLossDto(signal, 100);
  if (!approxEqual(pnlPercentage, 12.062949550)) { fail(`Expected 12.062949550, got ${pnlPercentage}`); return; }
  pass(`pnl = ${pnlPercentage.toFixed(9)}% (eff=hm[100,80]=${hm(100,80).toFixed(3)})`);
});

// ---------------------------------------------------------------------------
// toProfitLossDto — weight formula verification
//
// NEW weight formula (cost basis replay):
//   costBasis = 0
//   for each partial[i]:
//     costBasis += (cnt[i] - cnt[i-1]) * $100
//     dollarValue[i] = (percent[i]/100) * costBasis   ← running basis, not entryCount*100
//     weight[i] = dollarValue[i] / totalInvested
//     costBasis *= (1 - percent[i]/100)
//
// S3-key scenario (first partial, old==new since no prior partials):
//   $100@100 (cnt=1) → partial 50%@120 → DCA $100@80 → close@90
//   totalInvested=200, costBasis=100, dv=50, weight=0.25, remWeight=0.75
// ---------------------------------------------------------------------------

test("toProfitLossDto: S3-key weight=0.25/0.75 after partialExit→DCA (LONG)", ({ pass, fail }) => {
  // entry[100,80], partial 50%@120 (eff=100, cnt=1), close@90
  // weight=25/200=0.25, remWeight=0.75; pnl = 8.324184565
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
    _partial: [{ type: "profit", percent: 50, price: 120, effectivePrice: 100, entryCountAtClose: 1 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 90);
  if (!approxEqual(pnlPercentage, 8.324184565)) { fail(`Expected 8.324184565, got ${pnlPercentage}`); return; }
  pass(`pnl = ${pnlPercentage.toFixed(9)}% (weights 0.25/0.75 verified)`);
});

// ---------------------------------------------------------------------------
// S1: averageBuy → partialProfit (LONG)
//   entry[100,80], partial 50%@110 (eff=hm[100,80], cnt=2), close@120
//   costBasis=200, dv=100, weight=0.5, remWeight=0.5
// ---------------------------------------------------------------------------

test("toProfitLossDto: S1 averageBuy→partialProfit (LONG)", ({ pass, fail }) => {
  const snap = hm(100, 80);
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
    _partial: [{ type: "profit", percent: 50, price: 110, effectivePrice: snap, entryCountAtClose: 2 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 120);
  if (!approxEqual(pnlPercentage, 28.887391983)) { fail(`Expected 28.887391983, got ${pnlPercentage}`); return; }
  pass(`S1 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// S2: averageBuy → partialLoss (LONG)
//   entry[100,80], partial 30%@75 (eff=hm[100,80], cnt=2), close@100
//   costBasis=200, dv=60, weight=0.3, remWeight=0.7
// ---------------------------------------------------------------------------

test("toProfitLossDto: S2 averageBuy→partialLoss (LONG)", ({ pass, fail }) => {
  const snap = hm(100, 80);
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
    _partial: [{ type: "loss", percent: 30, price: 75, effectivePrice: snap, entryCountAtClose: 2 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 100);
  if (!approxEqual(pnlPercentage, 3.650728334)) { fail(`Expected 3.650728334, got ${pnlPercentage}`); return; }
  pass(`S2 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// S3: partialProfit → averageBuy (LONG)
//   entry[100,80], partial 30%@120 (eff=100, cnt=1), close@105
//   costBasis=100, dv=30, weight=0.15, remWeight=0.85
// ---------------------------------------------------------------------------

test("toProfitLossDto: S3 partialProfit→averageBuy (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }],
    _partial: [{ type: "profit", percent: 30, price: 120, effectivePrice: 100, entryCountAtClose: 1 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 105);
  if (!approxEqual(pnlPercentage, 19.914356019)) { fail(`Expected 19.914356019, got ${pnlPercentage}`); return; }
  pass(`S3 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// S4: partialLoss → averageBuy (LONG)
//   entry[100,60], partial 30%@80 (eff=100, cnt=1), close@90
//   costBasis=100, dv=30, weight=0.15, remWeight=0.85
// ---------------------------------------------------------------------------

test("toProfitLossDto: S4 partialLoss→averageBuy (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 60 }],
    _partial: [{ type: "loss", percent: 30, price: 80, effectivePrice: 100, entryCountAtClose: 1 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 90);
  if (!approxEqual(pnlPercentage, 18.044973526)) { fail(`Expected 18.044973526, got ${pnlPercentage}`); return; }
  pass(`S4 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// Interleaved multi-partial sequences
// For all these: NEW formula uses running costBasis, NOT entryCountAtClose*$100
// ---------------------------------------------------------------------------

// S5: partial(25%@115,eff=100,cnt=1) → DCA@80 → partial(25%@112,eff=snap2,cnt=2)
//     → DCA@70 → close@105
//   totalInvested=300
//   p1: costBasis=100, dv=25, weight=25/300=0.0833; after costBasis=75
//   p2: prevCnt=1, newEntries=1, costBasis=175, dv=43.75, weight=43.75/300=0.14583
//   closedDollar=68.75, remWeight=231.25/300=0.7708
//
//   snap2 = getEff([100,80],[p1]): remainingCostBasis=75, oldCoins=75/100=0.75, newCoins=100/80
//         = 175/(0.75+100/80) = 87.500000000  (NOT hm(100,80)=88.89 — ignores p1's sell)
test("toProfitLossDto: S5 partial→DCA→partial→DCA→close (LONG)", ({ pass, fail }) => {
  const snap1 = 100;
  // snap2 = effective price after p1 sold 25% and DCA@80 added:
  // remainingCostBasis=100*(1-0.25)=75, oldCoins=75/100=0.75, newCoins=100/80
  const snap2 = (75 + 100) / (0.75 + 100 / 80); // 87.500000000
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }, { price: 70 }],
    _partial: [
      { type: "profit", percent: 25, price: 115, effectivePrice: snap1, entryCountAtClose: 1 },
      { type: "profit", percent: 25, price: 112, effectivePrice: snap2, entryCountAtClose: 2 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 105);
  if (!approxEqual(pnlPercentage, 30.258272478)) { fail(`Expected 30.258272478, got ${pnlPercentage}`); return; }
  pass(`S5 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// S6: DCA@85 → partial(30%@110,eff=hm[100,85],cnt=2) → DCA@75
//     → partial(20%@88,eff=getEff([100,85,75],[p1]),cnt=3) → close@95
//   totalInvested=300
//   p1: costBasis=200, dv=60, weight=0.2; after costBasis=140
//   p2: prevCnt=2, newEntries=1, costBasis=240, dv=48, weight=0.16
//   closedDollar=108, remWeight=192/300=0.64
//
//   snap2 = getEff([100,85,75],[p1]): remainingCostBasis=140, oldCoins=140/snap1, newCoins=100/75
//         = 240/(140/snap1+100/75) = 84.008236102  (NOT hm(100,85,75)=81.55 — that ignores p1's sell)
test("toProfitLossDto: S6 DCA→partial→DCA→partial→close (LONG)", ({ pass, fail }) => {
  const snap1 = hm(100, 85);
  // snap2 = effective price of position just before second partial (after p1 sold 30% and DCA@75 added)
  // remainingCostBasis after p1 = 200*(1-0.3)=140, oldCoins=140/snap1, newCoins=100/75
  const snap2 = (140 + 100) / (140 / snap1 + 100 / 75); // 84.008236102
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 85 }, { price: 75 }],
    _partial: [
      { type: "profit", percent: 30, price: 110, effectivePrice: snap1, entryCountAtClose: 2 },
      { type: "loss",   percent: 20, price: 88,  effectivePrice: snap2, entryCountAtClose: 3 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 95);
  if (!approxEqual(pnlPercentage, 12.636520085)) { fail(`Expected 12.636520085, got ${pnlPercentage}`); return; }
  pass(`S6 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// S7: partial(20%@85,eff=100,cnt=1) → DCA@70 → DCA@60
//     → partial(30%@95,eff=getEff([100,70,60],[p1]),cnt=3) → close@80
//   totalInvested=300
//   p1: costBasis=100, dv=20, weight=0.0667; after costBasis=80
//   p2: prevCnt=1, newEntries=2, costBasis=280, dv=84, weight=0.28
//   closedDollar=104, remWeight=196/300=0.6533
//
//   snap2 = getEff([100,70,60],[p1]): remainingCostBasis=80, oldCoins=80/100=0.8, newCoins=100/70+100/60
//         = 280/(0.8+100/70+100/60) = 71.882640587  (NOT hm(100,70,60)=73.26 — that ignores p1's sell)
test("toProfitLossDto: S7 partial→DCA→DCA→partial→close (LONG)", ({ pass, fail }) => {
  // snap2 = effective price of position just before second partial (after p1 sold 20% and DCAs@70,@60 added)
  // remainingCostBasis after p1 = 100*(1-0.2)=80, oldCoins=80/100=0.8, newCoins=100/70+100/60
  const snap2 = (80 + 100 + 100) / (0.8 + 100 / 70 + 100 / 60); // 71.882640587
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 70 }, { price: 60 }],
    _partial: [
      { type: "loss",   percent: 20, price: 85, effectivePrice: 100,   entryCountAtClose: 1 },
      { type: "profit", percent: 30, price: 95, effectivePrice: snap2, entryCountAtClose: 3 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 80);
  if (!approxEqual(pnlPercentage, 14.936853133)) { fail(`Expected 14.936853133, got ${pnlPercentage}`); return; }
  pass(`S7 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// S8: DCA@80 → partial(40%@100,eff=hm[100,80],cnt=2) → DCA@70
//     → partial(30%@110,eff=snap2,cnt=3) → close@95
//   totalInvested=300
//   p1: costBasis=200, dv=80, weight=0.2667; after costBasis=120
//   p2: prevCnt=2, newEntries=1, costBasis=220, dv=66, weight=0.22
//   closedDollar=146, remWeight=154/300=0.5133
//
//   snap2 computed by getEffectivePriceOpen([100,80,70], [p1]):
//     remainingCostBasis = 200*(1-0.4)=120, oldCoins=120/snap1, newCoins=100/70
//     result = 220/(120/snap1 + 100/70)  [= 79.177377892]
test("toProfitLossDto: S8 DCA→partial→DCA→partial→close each snap distinct (LONG)", ({ pass, fail }) => {
  const snap1 = hm(100, 80);
  // snap2 = getEffectivePriceOpen of position just before second partial
  // remainingCostBasis after p1 = 200*(1-0.4)=120, oldCoins=120/snap1, newCoins=100/70
  const snap2 = (120 + 100) / (120 / snap1 + 100 / 70); // 79.177377892
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }, { price: 70 }],
    _partial: [
      { type: "profit", percent: 40, price: 100, effectivePrice: snap1, entryCountAtClose: 2 },
      { type: "profit", percent: 30, price: 110, effectivePrice: snap2, entryCountAtClose: 3 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 95);
  if (!approxEqual(pnlPercentage, 21.689972659)) { fail(`Expected 21.689972659, got ${pnlPercentage}`); return; }
  pass(`S8 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// S9: partial(20%@120,eff=100,cnt=1) → partial(20%@90,eff=100,cnt=1) → DCA@70 → close@95
//   totalInvested=200
//   p1: costBasis=100, dv=20, weight=0.1; after costBasis=80
//   p2: prevCnt=1, newEntries=0, costBasis=80, dv=16, weight=0.08
//   closedDollar=36, remWeight=164/200=0.82
//
//   getEff: 2 partials both cnt=1, entries=[100,70]
//     i=0: costBasis=100, reduce→80; i=1: newE=0, costBasis=80 (last, not reduced)
//     remainingCostBasis = 80*(1-0.2)=64, oldCoins=64/100=0.64
//     newEntries=entries.slice(1)=[{70}], newCoins=100/70
//     remEff = (64+100)/(0.64+100/70) = 79.281767956
test("toProfitLossDto: S9 partial→partial→DCA→close (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 70 }],
    _partial: [
      { type: "profit", percent: 20, price: 120, effectivePrice: 100, entryCountAtClose: 1 },
      { type: "loss",   percent: 20, price: 90,  effectivePrice: 100, entryCountAtClose: 1 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 95);
  if (!approxEqual(pnlPercentage, 17.005240788)) { fail(`Expected 17.005240788, got ${pnlPercentage}`); return; }
  pass(`S9 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// SHORT scenarios
// ---------------------------------------------------------------------------

// S10 SHORT: DCA@110 → partial(30%@90,eff=hm[100,110],cnt=2) → DCA@120
//            → partial(30%@85,eff=snap2,cnt=3) → close@88
//   totalInvested=300
//   p1: costBasis=200, dv=60, weight=0.2; after costBasis=140
//   p2: prevCnt=2, newEntries=1, costBasis=240, dv=72, weight=0.24
//   closedDollar=132, remWeight=168/300=0.56
//
//   snap2 = getEffectivePriceOpen([100,110,120],[p1]):
//     remainingCostBasis=200*(1-0.3)=140, oldCoins=140/snap1, newCoins=100/120
//     snap2 = (140+100)/(140/snap1+100/120)  [= 110.614525140]
test("toProfitLossDto: S10 SHORT DCA→partial→DCA→partial→close", ({ pass, fail }) => {
  const snap1 = hm(100, 110);
  const snap2 = (140 + 100) / (140 / snap1 + 100 / 120); // 110.614525140
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 110 }, { price: 120 }],
    _partial: [
      { type: "profit", percent: 30, price: 90, effectivePrice: snap1, entryCountAtClose: 2 },
      { type: "profit", percent: 30, price: 85, effectivePrice: snap2, entryCountAtClose: 3 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 88);
  if (!approxEqual(pnlPercentage, 19.483799382)) { fail(`Expected 19.483799382, got ${pnlPercentage}`); return; }
  pass(`S10 SHORT pnl = ${pnlPercentage.toFixed(9)}%`);
});

// S11 SHORT: partialLoss(25%@105,eff=100,cnt=1) → DCA@115
//            → partial(25%@88,eff=snap2,cnt=2) → close@92
//   totalInvested=200
//   p1: costBasis=100, dv=25, weight=0.125; after costBasis=75
//   p2: prevCnt=1, newEntries=1, costBasis=175, dv=43.75, weight=0.21875
//   closedDollar=68.75, remWeight=131.25/200=0.65625
//
//   snap2 = getEffectivePriceOpen([100,115],[p1]):
//     remainingCostBasis=100*(1-0.25)=75, oldCoins=75/100=0.75, newCoins=100/115
//     snap2 = (75+100)/(0.75+100/115)  [= 108.053691275]
test("toProfitLossDto: S11 SHORT partial(loss)→DCA→partial(profit)→close", ({ pass, fail }) => {
  const snap2 = (75 + 100) / (0.75 + 100 / 115); // 108.053691275
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 115 }],
    _partial: [
      { type: "loss",   percent: 25, price: 105, effectivePrice: 100,   entryCountAtClose: 1 },
      { type: "profit", percent: 25, price: 88,  effectivePrice: snap2, entryCountAtClose: 2 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 92);
  if (!approxEqual(pnlPercentage, 12.823989348)) { fail(`Expected 12.823989348, got ${pnlPercentage}`); return; }
  pass(`S11 SHORT pnl = ${pnlPercentage.toFixed(9)}%`);
});

// SHORT S3 (single partial): partial(30%@80,eff=100,cnt=1) → DCA@120 → close@85
//   totalInvested=200, costBasis=100, dv=30, weight=0.15, remWeight=0.85
test("toProfitLossDto: SHORT S3 partialProfit→averageBuy (SHORT)", ({ pass, fail }) => {
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 120 }],
    _partial: [{ type: "profit", percent: 30, price: 80, effectivePrice: 100, entryCountAtClose: 1 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 85);
  if (!approxEqual(pnlPercentage, 22.501524358)) { fail(`Expected 22.501524358, got ${pnlPercentage}`); return; }
  pass(`SHORT S3 pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// S13: 4 partials, 3 DCA rounds (LONG)
//   entries=[100,80,72,65], totalInvested=400
//   p1(cnt=1,20%): costBasis=100, dv=20, weight=0.05;  after=80
//   p2(cnt=2,20%): costBasis=180, dv=36, weight=0.09;  after=144
//   p3(cnt=3,20%): costBasis=244, dv=48.8, weight=0.122; after=195.2
//   p4(cnt=4,20%): costBasis=295.2, dv=59.04, weight=0.1476; after=236.16
//   closedDollar=163.84, remWeight=(400-163.84)/400=0.5904
//
//   snap2 = getEff([100,80],[p1]):    remainingCostBasis=80, oldCoins=80/100=0.8, newCoins=100/80
//         = 180/(0.8+100/80) = 87.804878049  (NOT hm(100,80)=88.89 — ignores p1's sell)
//   snap3 = getEff([100,80,72],[p1,p2]):  last=p2(cnt=2,pct=20)
//     replay: i=0:cb=100,red→80; i=1:newE=1,cb=180 (last)
//     remainingCostBasis=180*(1-0.2)=144, oldCoins=144/snap2, newCoins=100/72
//   snap4 = getEff([100,80,72,65],[p1,p2,p3]):  last=p3(cnt=3,pct=20)
//     replay: i=0:cb=100,red→80; i=1:cb=180,red→144; i=2:newE=1,cb=244 (last)
//     remainingCostBasis=244*(1-0.2)=195.2, oldCoins=195.2/snap3, newCoins=100/65
test("toProfitLossDto: S13 four partials three DCA rounds (LONG)", ({ pass, fail }) => {
  const snap1 = 100;
  // snap2 = getEff after p1 sold 20% then DCA@80: remainingCostBasis=80, oldCoins=80/100, newCoins=100/80
  const snap2 = (80 + 100) / (80 / 100 + 100 / 80); // 87.804878049
  // snap3: replay cb: 100→80 (p1 reduce), +100=180 (p2, last); rem=180*0.8=144; oldCoins=144/snap2, newCoins=100/72
  const snap3 = (144 + 100) / (144 / snap2 + 100 / 72); // 80.557593544
  // snap4: replay: 100→80, +100=180→144 (p2 reduce), +100=244 (p3, last); rem=244*0.8=195.2; oldCoins=195.2/snap3, newCoins=100/65
  const snap4 = (195.2 + 100) / (195.2 / snap3 + 100 / 65); // 74.515861783
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 80 }, { price: 72 }, { price: 65 }],
    _partial: [
      { type: "profit", percent: 20, price: 115, effectivePrice: snap1, entryCountAtClose: 1 },
      { type: "profit", percent: 20, price: 108, effectivePrice: snap2, entryCountAtClose: 2 },
      { type: "loss",   percent: 20, price: 83,  effectivePrice: snap3, entryCountAtClose: 3 },
      { type: "profit", percent: 20, price: 100, effectivePrice: snap4, entryCountAtClose: 4 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 100);
  if (!approxEqual(pnlPercentage, 27.944430716)) { fail(`Expected 27.944430716, got ${pnlPercentage}`); return; }
  pass(`S13 pnl = ${pnlPercentage.toFixed(9)}% (4 partials, 3 DCA, ~59% remaining)`);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("toProfitLossDto: 100% closed via two chained partials (no remaining)", ({ pass, fail }) => {
  // entry[100], p1=60%@110(cnt=1), p2=100%@115(cnt=1)
  // Replay: p1: costBasis=100, dv=60; after=40; p2: costBasis=40, dv=40
  // closedDollar=100=totalInvested → remWeight=0 ✓ (priceClose irrelevant)
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }],
    _partial: [
      { type: "profit", percent: 60,  price: 110, effectivePrice: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 100, price: 115, effectivePrice: 100, entryCountAtClose: 1 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 999);
  if (!approxEqual(pnlPercentage, 11.564447552)) { fail(`Expected 11.564447552, got ${pnlPercentage}`); return; }
  pass(`100% closed pnl = ${pnlPercentage.toFixed(9)}%`);
});

test("toProfitLossDto: throws when partial dollar value exceeds totalInvested", ({ pass, fail }) => {
  // entry[100] = totalInvested=$100
  // p1: cnt=1, 80%@110 → costBasis=100, dv=80; after costBasis=20
  // p2: cnt=2 (corrupted — 2nd entry doesn't exist in _entry), 60%@115
  //   → costBasis=20+100=120, dv=72; closedDollar=80+72=152 > 100 → throws ✓
  const signal = {
    id: "test",
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }],
    _partial: [
      { type: "profit", percent: 80, price: 110, effectivePrice: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 60, price: 115, effectivePrice: 100, entryCountAtClose: 2 },
    ],
  };
  try {
    toProfitLossDto(signal, 120);
    fail("Expected error but none thrown");
  } catch (e) {
    pass(`throws: ${e.message.slice(0, 60)}`);
  }
});

test("toProfitLossDto: effectivePrice per-partial independent of current _entry", ({ pass, fail }) => {
  // entry[100,40] → getEff without partials would give hm(100,40)~57
  // partial 50%@120 (eff=100, cnt=1) correctly uses eff=100 for that partial's PNL
  // remEff = (remainingCostBasis=50, oldCoins=50/100=0.5, newCoins=100/40=2.5)
  //        = (50+100)/(0.5+2.5) = 150/3 = 50
  // pnl = 64.405659341
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100 }, { price: 40 }],
    _partial: [{ type: "profit", percent: 50, price: 120, effectivePrice: 100, entryCountAtClose: 1 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 90);
  if (!approxEqual(pnlPercentage, 64.405659341)) { fail(`Expected 64.405659341, got ${pnlPercentage}`); return; }
  pass(`effectivePrice isolation confirmed, pnl = ${pnlPercentage.toFixed(9)}%`);
});

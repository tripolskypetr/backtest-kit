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
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100, cost: 100 }] });
  if (!approxEqual(result, 100)) { fail(`Expected 100, got ${result}`); return; }
  pass("ok");
});

test("getEffectivePriceOpen: two entries → harmonic mean", ({ pass, fail }) => {
  // $100@100 + $100@80 = 2.25 BTC for $200 → avg = 200/2.25 = 88.888...
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }] });
  if (!approxEqual(result, hm(100, 80))) { fail(`Expected ${hm(100,80).toFixed(9)}, got ${result}`); return; }
  pass(`hm([100,80]) = ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: three entries → harmonic mean", ({ pass, fail }) => {
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 70, cost: 100 }] });
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
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "profit", percent: 30, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
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
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "profit", percent: 50, currentPrice: 110, costBasisAtClose: 200, entryCountAtClose: 2 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, snap)) { fail(`Expected ${snap.toFixed(9)}, got ${result}`); return; }
  pass(`same eff after partial with no new DCA: ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: 100% closed single partial → returns lastPartial.effectivePrice", ({ pass, fail }) => {
  // totalCoins = 0 → returns effectivePrice from last partial
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }],
    _partial: [{ type: "profit", percent: 100, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, 100)) { fail(`Expected 100, got ${result}`); return; }
  pass("ok");
});

test("getEffectivePriceOpen: two partials with same entryCountAtClose — effective price unchanged", ({ pass, fail }) => {
  // entry[100], p1=30%@110(cnt=1,eff=100), p2=50%@120(cnt=1)
  // No new DCA between or after partials — single entry bought at 100.
  // Effective price of the remaining position is 100 (physical cost basis unchanged by sells).
  // remainingCostBasis = 100*(1-0.3)=70 → *(1-0.5)=35, oldCoins=35/100=0.35, result=35/0.35=100
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }],
    _partial: [
      { type: "profit", percent: 30, currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 50, currentPrice: 120, costBasisAtClose: 70,  entryCountAtClose: 1 },
    ],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, 100)) { fail(`Expected 100.000000000, got ${result}`); return; }
  pass(`getEff multi-partial same-cnt: ${result.toFixed(9)}`);
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
  const signal = { position: "long", priceOpen: 100, _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }] };
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
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "profit", percent: 50, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
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
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "profit", percent: 50, currentPrice: 110, costBasisAtClose: 200, entryCountAtClose: 2 }],
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
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "loss", percent: 30, currentPrice: 75, costBasisAtClose: 200, entryCountAtClose: 2 }],
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
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "profit", percent: 30, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
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
    _entry: [{ price: 100, cost: 100 }, { price: 60, cost: 100 }],
    _partial: [{ type: "loss", percent: 30, currentPrice: 80, costBasisAtClose: 100, entryCountAtClose: 1 }],
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
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 70, cost: 100 }],
    _partial: [
      { type: "profit", percent: 25, currentPrice: 115, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 25, currentPrice: 112, costBasisAtClose: 175, entryCountAtClose: 2 },
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
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 85, cost: 100 }, { price: 75, cost: 100 }],
    _partial: [
      { type: "profit", percent: 30, currentPrice: 110, costBasisAtClose: 200, entryCountAtClose: 2 },
      { type: "loss",   percent: 20, currentPrice: 88,  costBasisAtClose: 240, entryCountAtClose: 3 },
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
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 70, cost: 100 }, { price: 60, cost: 100 }],
    _partial: [
      { type: "loss",   percent: 20, currentPrice: 85, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 30, currentPrice: 95, costBasisAtClose: 280, entryCountAtClose: 3 },
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
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 70, cost: 100 }],
    _partial: [
      { type: "profit", percent: 40, currentPrice: 100, costBasisAtClose: 200, entryCountAtClose: 2 },
      { type: "profit", percent: 30, currentPrice: 110, costBasisAtClose: 220, entryCountAtClose: 3 },
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
//   Both partials closed with eff=100 (single entry@100, no DCA before them).
//   getEff final: last=p2(cnt=1), effAtLast=100
//     remainingCostBasis=80*(1-0.2)=64, oldCoins=64/100=0.64
//     newEntries=entries.slice(1)=[{70,100}], newCoins=100/70
//     priceOpen = (64+100)/(0.64+100/70) = 164/2.068... = 79.282...
test("toProfitLossDto: S9 partial→partial→DCA→close (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 70, cost: 100 }],
    _partial: [
      { type: "profit", percent: 20, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "loss",   percent: 20, currentPrice: 90,  costBasisAtClose: 80,  entryCountAtClose: 1 },
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
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 110, cost: 100 }, { price: 120, cost: 100 }],
    _partial: [
      { type: "profit", percent: 30, currentPrice: 90, costBasisAtClose: 200, entryCountAtClose: 2 },
      { type: "profit", percent: 30, currentPrice: 85, costBasisAtClose: 240, entryCountAtClose: 3 },
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
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 115, cost: 100 }],
    _partial: [
      { type: "loss",   percent: 25, currentPrice: 105, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 25, currentPrice: 88,  costBasisAtClose: 175, entryCountAtClose: 2 },
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
    _entry: [{ price: 100, cost: 100 }, { price: 120, cost: 100 }],
    _partial: [{ type: "profit", percent: 30, currentPrice: 80, costBasisAtClose: 100, entryCountAtClose: 1 }],
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
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 72, cost: 100 }, { price: 65, cost: 100 }],
    _partial: [
      { type: "profit", percent: 20, currentPrice: 115, costBasisAtClose: 100,   entryCountAtClose: 1 },
      { type: "profit", percent: 20, currentPrice: 108, costBasisAtClose: 180,   entryCountAtClose: 2 },
      { type: "loss",   percent: 20, currentPrice: 83,  costBasisAtClose: 244,   entryCountAtClose: 3 },
      { type: "profit", percent: 20, currentPrice: 100, costBasisAtClose: 295.2, entryCountAtClose: 4 },
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
    _entry: [{ price: 100, cost: 100 }],
    _partial: [
      { type: "profit", percent: 60,  currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 100, currentPrice: 115, costBasisAtClose: 40,  entryCountAtClose: 1 },
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
    _entry: [{ price: 100, cost: 100 }],
    _partial: [
      { type: "profit", percent: 80, currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 60, currentPrice: 115, costBasisAtClose: 120, entryCountAtClose: 2 },
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
  // partial 50%@120 (costBasisAtClose=100, cnt=1) correctly uses eff=100 for that partial's PNL
  // remEff = (remainingCostBasis=50, oldCoins=50/100=0.5, newCoins=100/40=2.5)
  //        = (50+100)/(0.5+2.5) = 150/3 = 50
  // pnl = 64.405659341
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 40, cost: 100 }],
    _partial: [{ type: "profit", percent: 50, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 90);
  if (!approxEqual(pnlPercentage, 64.405659341)) { fail(`Expected 64.405659341, got ${pnlPercentage}`); return; }
  pass(`effectivePrice isolation confirmed, pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// Weights sanity: closed + remaining must equal totalInvested
// ---------------------------------------------------------------------------

test("weights sanity S5: closedDollar + remainingDollar = totalInvested", ({ pass, fail }) => {
  // S5: entries=[100,80,70], partials cnt=[1,2] pct=[25,25], totalInvested=300
  // p1: costBasis=100, dv=25, cb→75
  // p2: costBasis=175, dv=43.75, cb→131.25
  // closedDollar=68.75, remainingDollar=231.25, sum=300 ✓
  const partials = [
    { percent: 25, entryCountAtClose: 1 },
    { percent: 25, entryCountAtClose: 2 },
  ];
  const totalInvested = 300;
  let costBasis = 0, closedDollar = 0;
  for (let i = 0; i < partials.length; i++) {
    const prevCount = i === 0 ? 0 : partials[i - 1].entryCountAtClose;
    costBasis += (partials[i].entryCountAtClose - prevCount) * 100;
    closedDollar += (partials[i].percent / 100) * costBasis;
    costBasis *= 1 - partials[i].percent / 100;
  }
  const sum = closedDollar + (totalInvested - closedDollar);
  if (!approxEqual(sum, totalInvested)) { fail(`sum=${sum}, expected ${totalInvested}`); return; }
  if (!approxEqual(closedDollar, 68.75)) { fail(`closedDollar=${closedDollar}, expected 68.75`); return; }
  pass(`S5: closedDollar=${closedDollar.toFixed(4)}, remaining=${(totalInvested-closedDollar).toFixed(4)}, sum=1.0 ✓`);
});

test("weights sanity S7: closedDollar + remainingDollar = totalInvested", ({ pass, fail }) => {
  // S7: entries=[100,70,60], partials cnt=[1,3] pct=[20,30], totalInvested=300
  // p1: costBasis=100, dv=20, cb→80
  // p2: costBasis=80+200=280, dv=84, cb→196
  // closedDollar=104, remainingDollar=196, sum=300 ✓
  const partials = [
    { percent: 20, entryCountAtClose: 1 },
    { percent: 30, entryCountAtClose: 3 },
  ];
  const totalInvested = 300;
  let costBasis = 0, closedDollar = 0;
  for (let i = 0; i < partials.length; i++) {
    const prevCount = i === 0 ? 0 : partials[i - 1].entryCountAtClose;
    costBasis += (partials[i].entryCountAtClose - prevCount) * 100;
    closedDollar += (partials[i].percent / 100) * costBasis;
    costBasis *= 1 - partials[i].percent / 100;
  }
  const sum = closedDollar + (totalInvested - closedDollar);
  if (!approxEqual(sum, totalInvested)) { fail(`sum=${sum}, expected ${totalInvested}`); return; }
  if (!approxEqual(closedDollar, 104)) { fail(`closedDollar=${closedDollar}, expected 104`); return; }
  pass(`S7: closedDollar=${closedDollar.toFixed(4)}, remaining=${(totalInvested-closedDollar).toFixed(4)}, sum=1.0 ✓`);
});

test("weights sanity S9: two partials same cnt, costBasis chains correctly", ({ pass, fail }) => {
  // S9: entries=[100,70], partials cnt=[1,1] pct=[20,20], totalInvested=200
  // p1: costBasis=100, dv=20, cb→80
  // p2: newEntries=0, costBasis=80, dv=16, cb→64
  // closedDollar=36, weights: 20/200=0.10 and 16/200=0.08, remaining=164/200=0.82
  const partials = [
    { percent: 20, entryCountAtClose: 1 },
    { percent: 20, entryCountAtClose: 1 },
  ];
  let costBasis = 0, closedDollar = 0;
  for (let i = 0; i < partials.length; i++) {
    const prevCount = i === 0 ? 0 : partials[i - 1].entryCountAtClose;
    costBasis += (partials[i].entryCountAtClose - prevCount) * 100;
    closedDollar += (partials[i].percent / 100) * costBasis;
    costBasis *= 1 - partials[i].percent / 100;
  }
  const weight1 = 20 / 200, weight2 = 16 / 200, weightRem = 164 / 200;
  if (!approxEqual(closedDollar, 36)) { fail(`closedDollar=${closedDollar}, expected 36`); return; }
  if (!approxEqual(weight1 + weight2 + weightRem, 1)) { fail("weights don't sum to 1"); return; }
  pass(`S9: weights ${weight1.toFixed(4)}+${weight2.toFixed(4)}+${weightRem.toFixed(4)}=1.0 ✓ (same-cnt chains correctly)`);
});

// ---------------------------------------------------------------------------
// Sequential cnt=1,2,3,... — entry-partial-entry-partial strictly interleaved
// ---------------------------------------------------------------------------

// SA: entry@100 → partial(30%@115,cnt=1) → DCA@80 → partial(25%@110,cnt=2) → DCA@70
//     → partial(20%@95,cnt=3) → close@105 (LONG)
//   totalInvested=300
//   p1: cb=100,   dv=30,   w=30/300=0.1000;  after=70
//   p2: cb=170,   dv=42.5, w=42.5/300=0.1417; after=127.5
//   p3: cb=227.5, dv=45.5, w=45.5/300=0.1517; after=182
//   closed=118, remWeight=182/300=0.6067
//
//   snap2=getEff([100,80],[p1]):  rem=70, oldCoins=70/100=0.7, newCoins=100/80
//   snap3=getEff([100,80,70],[p1,p2]): replay: cb=100→70, +100=170(last); rem=170*0.75=127.5; oldCoins=127.5/snap2, newCoins=100/70
test("toProfitLossDto: SA entry-partial-entry-partial-entry-partial, cnt=[1,2,3] (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 70, cost: 100 }],
    _partial: [
      { type: "profit", percent: 30, currentPrice: 115, costBasisAtClose: 100,   entryCountAtClose: 1 },
      { type: "profit", percent: 25, currentPrice: 110, costBasisAtClose: 170,   entryCountAtClose: 2 },
      { type: "profit", percent: 20, currentPrice: 95,  costBasisAtClose: 227.5, entryCountAtClose: 3 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 105);
  if (!approxEqual(pnlPercentage, 28.149727717)) { fail(`Expected 28.149727717, got ${pnlPercentage}`); return; }
  pass(`SA pnl = ${pnlPercentage.toFixed(9)}%`);
});

// SB: entry@100 → DCA@90 → partial(25%@110,cnt=2) → DCA@80 → partial(30%@105,cnt=3)
//     → DCA@70 → partial(20%@95,cnt=4) → close@100 (LONG)
//   totalInvested=400
//   p1: cb=200, dv=50,   w=50/400=0.1250;  after=150
//   p2: cb=250, dv=75,   w=75/400=0.1875;  after=175
//   p3: cb=275, dv=55,   w=55/400=0.1375;  after=220
//   closed=180, remWeight=220/400=0.5500
//
//   snap1=hm(100,90)=94.736842105 (no prior partials)
//   snap2=getEff([100,90,80],[p1]): rem=150, oldCoins=150/snap1, newCoins=100/80
//   snap3=getEff([100,90,80,70],[p1,p2]): replay: cb=200→150; +100=250(last); rem=175; oldCoins=175/snap2, newCoins=100/70
test("toProfitLossDto: SB entry-DCA-partial-DCA-partial-DCA-partial, cnt=[2,3,4] (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 90, cost: 100 }, { price: 80, cost: 100 }, { price: 70, cost: 100 }],
    _partial: [
      { type: "profit", percent: 25, currentPrice: 110, costBasisAtClose: 200, entryCountAtClose: 2 },
      { type: "profit", percent: 30, currentPrice: 105, costBasisAtClose: 250, entryCountAtClose: 3 },
      { type: "profit", percent: 20, currentPrice: 95,  costBasisAtClose: 275, entryCountAtClose: 4 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 100);
  if (!approxEqual(pnlPercentage, 20.807703250)) { fail(`Expected 20.807703250, got ${pnlPercentage}`); return; }
  pass(`SB pnl = ${pnlPercentage.toFixed(9)}%`);
});

// SD: entry@1000 → partial(30%@1150,cnt=1) → DCA@950 → DCA@880
//     → partial(20%@860,cnt=3) → DCA@920 → partial(40%@1050,cnt=4) → DCA@980 → close@1200
//   totalInvested=500
//   p1(cnt=1,pct=30): cb=100,  dv=30,   w=30/500=0.06;   after=70
//   p2(cnt=3,pct=20): cb=270,  dv=54,   w=54/500=0.108;  after=216
//   p3(cnt=4,pct=40): cb=316,  dv=126.4,w=126.4/500=0.2528; after=189.6
//   closedDollar=210.4, remWeight=289.6/500=0.5792
//
//   snap2=getEff([1000,950,880],[p1]): replay i=0:cb=100(last); rem=70; oldCoins=70/1000; newCoins=100/950+100/880
//         = 270/(0.07+100/950+100/880) = 934.580987082
//   snap3=getEff([1000,950,880,920],[p1,p2]): replay: i=0:cb=100→70; i=1:+200=270(last)
//         rem=216; oldCoins=216/snap2; newCoins=100/920
//         = 316/(216/snap2+100/920) = 929.917012143
test("toProfitLossDto: SD profit→DCA→DCA→loss→DCA→profit→DCA→close, cnt=[1,3,4] (LONG)", ({ pass, fail }) => {
  const signal = {
    position: "long",
    priceOpen: 1000,
    _entry: [{ price: 1000, cost: 100 }, { price: 950, cost: 100 }, { price: 880, cost: 100 }, { price: 920, cost: 100 }, { price: 980, cost: 100 }],
    _partial: [
      { type: "profit", percent: 30, currentPrice: 1150, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "loss",   percent: 20, currentPrice: 860,  costBasisAtClose: 270, entryCountAtClose: 3 },
      { type: "profit", percent: 40, currentPrice: 1050, costBasisAtClose: 316, entryCountAtClose: 4 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 1200);
  if (!approxEqual(pnlPercentage, 18.349878168)) { fail(`Expected 18.349878168, got ${pnlPercentage}`); return; }
  pass(`SD pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// getTotalClosed — unit tests
// Algorithm: cost-basis replay through _partial[], then add post-partial entries
//   for each i: costBasis += (cnt[i]-cnt[i-1])*100
//               closedDollar += (percent[i]/100) * costBasis
//               costBasis *= 1 - percent[i]/100
//   after loop: costBasis += (currentEntryCount - lastCnt) * 100
//   totalClosedPercent = closedDollar / totalInvested * 100
// ---------------------------------------------------------------------------

import { getTotalClosed } from "../../build/index.mjs";

test("getTotalClosed: no partials, no _entry → 0% closed, remainingCostBasis=100", ({ pass, fail }) => {
  // fallback: currentEntryCount=1, totalInvested=100
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({ priceOpen: 100 });
  if (totalClosedPercent !== 0) { fail(`totalClosedPercent expected 0, got ${totalClosedPercent}`); return; }
  if (remainingCostBasis !== 100) { fail(`remainingCostBasis expected 100, got ${remainingCostBasis}`); return; }
  pass("no partials: 0% closed, $100 remaining");
});

test("getTotalClosed: no partials, 3 entries → 0% closed, remainingCostBasis=300", ({ pass, fail }) => {
  // totalInvested = 3 * 100 = 300
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 70, cost: 100 }],
  });
  if (totalClosedPercent !== 0) { fail(`totalClosedPercent expected 0, got ${totalClosedPercent}`); return; }
  if (remainingCostBasis !== 300) { fail(`remainingCostBasis expected 300, got ${remainingCostBasis}`); return; }
  pass("no partials, 3 entries: 0% closed, $300 remaining");
});

test("getTotalClosed: single partial 30% of cnt=1 → 30% closed, remainingCostBasis=70", ({ pass, fail }) => {
  // p1: cb=100, dv=30, after=70; currentEntryCount=1=lastCnt → no post-partial entries
  // totalInvested=100, totalClosedPercent=30%, remainingCostBasis=70
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }],
    _partial: [{ type: "profit", percent: 30, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
  });
  if (!approxEqual(totalClosedPercent, 30)) { fail(`totalClosedPercent expected 30, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 70)) { fail(`remainingCostBasis expected 70, got ${remainingCostBasis}`); return; }
  pass(`30% closed, $70 remaining`);
});

test("getTotalClosed: single partial 40% of cnt=2 (both entries in position) → 40% closed, remainingCostBasis=120", ({ pass, fail }) => {
  // p1: cb=200 (2 entries), dv=80, after=120; currentEntryCount=2=lastCnt
  // totalInvested=200, totalClosedPercent=40%, remainingCostBasis=120
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ type: "profit", percent: 40, currentPrice: 110, costBasisAtClose: 200, entryCountAtClose: 2 }],
  });
  if (!approxEqual(totalClosedPercent, 40)) { fail(`totalClosedPercent expected 40, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 120)) { fail(`remainingCostBasis expected 120, got ${remainingCostBasis}`); return; }
  pass(`40% closed, $120 remaining`);
});

test("getTotalClosed: two partials same cnt=1 (sequential closes, no DCA between) → 18% closed, remainingCostBasis=164", ({ pass, fail }) => {
  // entries=[100,70], currentEntryCount=2, lastCnt=1
  // p1: cb=100, dv=20, after=80
  // p2: newE=0, cb=80, dv=16, after=64
  // post-partial: cb += (2-1)*100=100 → remainingCostBasis=164
  // totalInvested=200, closedDollar=36, totalClosedPercent=18%
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 70, cost: 100 }],
    _partial: [
      { type: "profit", percent: 20, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 20, currentPrice: 115, costBasisAtClose: 80,  entryCountAtClose: 1 },
    ],
  });
  if (!approxEqual(totalClosedPercent, 18)) { fail(`totalClosedPercent expected 18, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 164)) { fail(`remainingCostBasis expected 164, got ${remainingCostBasis}`); return; }
  pass(`same-cnt chaining: 18% closed ($36/$200), $164 remaining`);
});

test("getTotalClosed: two partials different cnt (DCA between) → 34.666% closed, remainingCostBasis=196", ({ pass, fail }) => {
  // S7-style: entries=[100,70,60], currentEntryCount=3
  // p1(cnt=1,20%): cb=100, dv=20, after=80
  // p2(cnt=3,30%): newE=2, cb=280, dv=84, after=196; lastCnt=3=currentEntryCount
  // totalInvested=300, closedDollar=104, totalClosedPercent=104/300*100=34.666...%
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 70, cost: 100 }, { price: 60, cost: 100 }],
    _partial: [
      { type: "loss",   percent: 20, currentPrice: 85, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 30, currentPrice: 95, costBasisAtClose: 280, entryCountAtClose: 3 },
    ],
  });
  const expectedPct = 104 / 300 * 100; // 34.666...
  if (!approxEqual(totalClosedPercent, expectedPct)) { fail(`totalClosedPercent expected ${expectedPct.toFixed(9)}, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 196)) { fail(`remainingCostBasis expected 196, got ${remainingCostBasis}`); return; }
  pass(`DCA-between partials: ${totalClosedPercent.toFixed(6)}% closed, $196 remaining`);
});

test("getTotalClosed: post-partial DCA entries added after last partial → 15% closed, remainingCostBasis=340", ({ pass, fail }) => {
  // entries=[100,80,70,60], currentEntryCount=4
  // p1(cnt=2,30%): cb=200, dv=60, after=140; lastCnt=2
  // post-partial: cb += (4-2)*100=200 → remainingCostBasis=340
  // totalInvested=400, closedDollar=60, totalClosedPercent=15%
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 70, cost: 100 }, { price: 60, cost: 100 }],
    _partial: [
      { type: "profit", percent: 30, currentPrice: 120, costBasisAtClose: 200, entryCountAtClose: 2 },
    ],
  });
  if (!approxEqual(totalClosedPercent, 15)) { fail(`totalClosedPercent expected 15, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 340)) { fail(`remainingCostBasis expected 340, got ${remainingCostBasis}`); return; }
  pass(`post-partial DCA: 15% closed ($60/$400), $340 remaining (includes 2 new entries)`);
});

test("getTotalClosed: 100% closed via chained partials (60% then 100% of remainder) → 100% closed, remainingCostBasis=0", ({ pass, fail }) => {
  // entry=[100], p1=60%@cnt=1, p2=100%@cnt=1
  // p1: cb=100, dv=60, after=40; p2: cb=40, dv=40, after=0
  // totalInvested=100, closedDollar=100, totalClosedPercent=100%, remainingCostBasis=0
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }],
    _partial: [
      { type: "profit", percent: 60,  currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 },
      { type: "profit", percent: 100, currentPrice: 115, costBasisAtClose: 40,  entryCountAtClose: 1 },
    ],
  });
  if (!approxEqual(totalClosedPercent, 100)) { fail(`totalClosedPercent expected 100, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 0)) { fail(`remainingCostBasis expected 0, got ${remainingCostBasis}`); return; }
  pass(`100% closed via chained partials, $0 remaining`);
});

test("getTotalClosed: S13 four partials three DCA rounds → 40.96% closed, remainingCostBasis=236.16", ({ pass, fail }) => {
  // entries=[100,80,72,65], totalInvested=400
  // p1(cnt=1,20%): cb=100,  dv=20,   after=80
  // p2(cnt=2,20%): cb=180,  dv=36,   after=144
  // p3(cnt=3,20%): cb=244,  dv=48.8, after=195.2
  // p4(cnt=4,20%): cb=295.2,dv=59.04,after=236.16
  // closedDollar=163.84, totalClosedPercent=40.96%, remainingCostBasis=236.16
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 72, cost: 100 }, { price: 65, cost: 100 }],
    _partial: [
      { type: "profit", percent: 20, currentPrice: 115, costBasisAtClose: 100,   entryCountAtClose: 1 },
      { type: "profit", percent: 20, currentPrice: 108, costBasisAtClose: 180,   entryCountAtClose: 2 },
      { type: "loss",   percent: 20, currentPrice: 83,  costBasisAtClose: 244,   entryCountAtClose: 3 },
      { type: "profit", percent: 20, currentPrice: 100, costBasisAtClose: 295.2, entryCountAtClose: 4 },
    ],
  });
  if (!approxEqual(totalClosedPercent, 40.96)) { fail(`totalClosedPercent expected 40.96, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 236.16)) { fail(`remainingCostBasis expected 236.16, got ${remainingCostBasis}`); return; }
  pass(`S13: ${totalClosedPercent.toFixed(4)}% closed, $${remainingCostBasis.toFixed(4)} remaining`);
});

// SC SHORT: entry@100 → DCA@110 → partial(30%@85,cnt=2) → DCA@120 → partial(25%@80,cnt=3)
//           → DCA@130 → partial(20%@75,cnt=4) → close@70 (SHORT, averaging up)
//   totalInvested=400
//   p1: cb=200, dv=60,   w=0.15;  after=140
//   p2: cb=260, dv=65,   w=0.1625; after=195
//   p3: cb=325, dv=65,   w=0.1625; after=260
//   closed=190, remWeight=260/400=0.65
//
//   snap1=hm(100,110)=104.761904762
//   snap2=getEff([100,110,120],[p1]): rem=140, oldCoins=140/snap1, newCoins=100/120
//   snap3=getEff([100,110,120,130],[p1,p2]): replay: cb=200→140, +100=240(last); rem=195; oldCoins=195/snap2, newCoins=100/130
test("toProfitLossDto: SC SHORT DCA-partial-DCA-partial-DCA-partial, cnt=[2,3,4] (SHORT)", ({ pass, fail }) => {
  const signal = {
    position: "short",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 110, cost: 100 }, { price: 120, cost: 100 }, { price: 130, cost: 100 }],
    _partial: [
      { type: "profit", percent: 30, currentPrice: 85, costBasisAtClose: 200, entryCountAtClose: 2 },
      { type: "profit", percent: 25, currentPrice: 80, costBasisAtClose: 240, entryCountAtClose: 3 },
      { type: "profit", percent: 20, currentPrice: 75, costBasisAtClose: 280, entryCountAtClose: 4 },
    ],
  };
  const { pnlPercentage } = toProfitLossDto(signal, 70);
  if (!approxEqual(pnlPercentage, 34.146190424)) { fail(`Expected 34.146190424, got ${pnlPercentage}`); return; }
  pass(`SC SHORT pnl = ${pnlPercentage.toFixed(9)}%`);
});

// ---------------------------------------------------------------------------
// weightedHarmonicMean — different entry costs (via getEffectivePriceOpen, no partials)
// Formula: Σcost / Σ(cost/price)
// ---------------------------------------------------------------------------

test("getEffectivePriceOpen: different costs [$100@100, $200@80] → 300/3.5 = 85.714", ({ pass, fail }) => {
  // Σcost=300, Σ(c/p)=100/100+200/80=1+2.5=3.5, result=300/3.5=85.714285714...
  // Interpretation: bought 1 coin @100 and 2.5 coins @80 = 3.5 coins for $300 → avg $85.71
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 200 }] });
  if (!approxEqual(result, 85.714285714)) { fail(`Expected 85.714285714, got ${result}`); return; }
  pass(`weightedHM [$100@100, $200@80] = ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: different costs [$200@100, $100@80] → 300/3.25 = 92.307", ({ pass, fail }) => {
  // Σcost=300, Σ(c/p)=200/100+100/80=2+1.25=3.25, result=300/3.25=92.307692308...
  // Interpretation: heavier weight on higher price → result closer to 100
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100, cost: 200 }, { price: 80, cost: 100 }] });
  if (!approxEqual(result, 92.307692308)) { fail(`Expected 92.307692308, got ${result}`); return; }
  pass(`weightedHM [$200@100, $100@80] = ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: three equal-cost entries [100,80,60] → 300/3.917 = 76.595", ({ pass, fail }) => {
  // Σcost=300, Σ(c/p)=1+1.25+100/60=3.91666..., result=300/3.91666...=76.595744681
  const result = getEffectivePriceOpen({ priceOpen: 100, _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 60, cost: 100 }] });
  if (!approxEqual(result, 76.595744681)) { fail(`Expected 76.595744681, got ${result}`); return; }
  pass(`weightedHM [100,80,60] equal costs = ${result.toFixed(9)}`);
});

// ---------------------------------------------------------------------------
// getEffectivePriceOpen with partial — user description scenarios
// ---------------------------------------------------------------------------

test("getEffectivePriceOpen: partial@cnt=2 no new DCA → effective price unchanged (hm of 2 entries)", ({ pass, fail }) => {
  // entries=[{100,$100},{80,$100}], p1(30%@cnt=2,cb=200), no new entries after
  // effAtP1=200/2.25=88.888; remCB=140; oldCoins=140/88.888=1.575; result=140/1.575=88.888... (unchanged)
  const snap = 200 / (100/100 + 100/80); // 88.888...
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ percent: 30, currentPrice: 110, costBasisAtClose: 200, entryCountAtClose: 2 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, snap)) { fail(`Expected ${snap.toFixed(9)}, got ${result}`); return; }
  pass(`partial then no DCA: eff unchanged = ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: partial@cnt=1 then DCA@60 → blended effective price 71.830", ({ pass, fail }) => {
  // entries=[{100,$100},{60,$100}], p1(30%@cnt=1,cb=100)
  // effAtP1=100/1=100; remCB=70; oldCoins=70/100=0.7; newEntries=[{60,$100}], nc=100/60, nv=100
  // result=(70+100)/(0.7+100/60)=170/2.36666...=71.830985915
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 60, cost: 100 }],
    _partial: [{ percent: 30, currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, 71.830985915)) { fail(`Expected 71.830985915, got ${result}`); return; }
  pass(`partial@1 then DCA@60: eff = ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: partial@cnt=2 then DCA@60 → blended effective price 74.035", ({ pass, fail }) => {
  // entries=[{100,$100},{80,$100},{60,$100}], p1(30%@cnt=2,cb=200)
  // effAtP1=200/2.25=88.888; remCB=140; oldCoins=140/88.888=1.575
  // newEntries=[{60,$100}], nc=100/60=1.6666, nv=100
  // result=(140+100)/(1.575+1.6666)=240/3.2416...=74.035989717
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 60, cost: 100 }],
    _partial: [{ percent: 30, currentPrice: 110, costBasisAtClose: 200, entryCountAtClose: 2 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, 74.035989717)) { fail(`Expected 74.035989717, got ${result}`); return; }
  pass(`partial@2 then DCA@60: eff = ${result.toFixed(9)}`);
});

test("getEffectivePriceOpen: different costs partial@cnt=2 no new DCA → eff unchanged", ({ pass, fail }) => {
  // entries=[{100,$100},{80,$200}], p1(40%@cnt=2,cb=300), no new entries
  // effAtP1=300/3.5=85.714; remCB=180; oldCoins=180/85.714=2.1; result=180/2.1=85.714 (unchanged)
  const snap = 300 / (100/100 + 200/80); // 85.714...
  const signal = {
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 200 }],
    _partial: [{ percent: 40, currentPrice: 110, costBasisAtClose: 300, entryCountAtClose: 2 }],
  };
  const result = getEffectivePriceOpen(signal);
  if (!approxEqual(result, snap)) { fail(`Expected ${snap.toFixed(9)}, got ${result}`); return; }
  pass(`different costs partial then no DCA: eff unchanged = ${result.toFixed(9)}`);
});

// ---------------------------------------------------------------------------
// getTotalClosed — additional mathematical scenarios
// ---------------------------------------------------------------------------

test("getTotalClosed: two sequential partials 30%→40% (no DCA) → 58% closed, remainingCostBasis=42", ({ pass, fail }) => {
  // p1: cb=100, dv=30, after=70; p2: cb=70, dv=28, after=42
  // totalInvested=100, closedDollar=58, totalClosedPercent=58%
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }],
    _partial: [
      { percent: 30, currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 },
      { percent: 40, currentPrice: 105, costBasisAtClose: 70,  entryCountAtClose: 1 },
    ],
  });
  if (!approxEqual(totalClosedPercent, 58)) { fail(`totalClosedPercent expected 58, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 42)) { fail(`remainingCostBasis expected 42, got ${remainingCostBasis}`); return; }
  pass(`sequential 30%→40%: 58% closed, $42 remaining`);
});

test("getTotalClosed: 60%→DCA($200)→80% → 84% closed, remainingCostBasis=48", ({ pass, fail }) => {
  // entry[$100], entry2(post-p1)[$200]
  // p1: cb=100, dv=60, after=40
  // p2: cb=40+200=240, dv=192, after=48; no post-partial entries
  // totalInvested=300, closedDollar=252, totalClosedPercent=84%
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 200 }],
    _partial: [
      { percent: 60, currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 },
      { percent: 80, currentPrice: 105, costBasisAtClose: 240, entryCountAtClose: 2 },
    ],
  });
  if (!approxEqual(totalClosedPercent, 84)) { fail(`totalClosedPercent expected 84, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 48)) { fail(`remainingCostBasis expected 48, got ${remainingCostBasis}`); return; }
  pass(`60%→DCA($200)→80%: 84% closed, $48 remaining`);
});

test("getTotalClosed: single 100% partial → 100% closed, remainingCostBasis=0", ({ pass, fail }) => {
  // p1: cb=100, dv=100, after=0; totalInvested=100, 100% closed
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }],
    _partial: [{ percent: 100, currentPrice: 120, costBasisAtClose: 100, entryCountAtClose: 1 }],
  });
  if (!approxEqual(totalClosedPercent, 100)) { fail(`totalClosedPercent expected 100, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 0)) { fail(`remainingCostBasis expected 0, got ${remainingCostBasis}`); return; }
  pass(`100% partial: 100% closed, $0 remaining`);
});

test("getTotalClosed: partial@cnt=1 then post-partial DCA $200 → 10% closed, remainingCostBasis=270", ({ pass, fail }) => {
  // p1(30%,cb=100): closedDollar=30, after=70; post-partial DCA $200 → remainingCostBasis=70+200=270
  // totalInvested=300, totalClosedPercent=30/300*100=10%
  const { totalClosedPercent, remainingCostBasis } = getTotalClosed({
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 200 }],
    _partial: [{ percent: 30, currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 }],
  });
  if (!approxEqual(totalClosedPercent, 10)) { fail(`totalClosedPercent expected 10, got ${totalClosedPercent}`); return; }
  if (!approxEqual(remainingCostBasis, 270)) { fail(`remainingCostBasis expected 270, got ${remainingCostBasis}`); return; }
  pass(`30% of $100, then DCA $200 post-partial: 10% of $300 closed, $270 remaining`);
});

// ---------------------------------------------------------------------------
// remainingDollarValue identity: toProfitLossDto(totalInvested - closedDollarValue) = getTotalClosed.remainingCostBasis
// Verifies the mathematical equivalence between the two implementations.
// ---------------------------------------------------------------------------

test("identity: toProfitLossDto remainingDollarValue == getTotalClosed.remainingCostBasis (single partial+DCA)", ({ pass, fail }) => {
  // entry[$100] → p1(30%@cnt=1) → DCA[$100] → close
  // closedDollarValue = (30/100)*100 = 30; remainingDollarValue = 200-30 = 170
  // getTotalClosed.remainingCostBasis = 100*0.7 + 100 = 170 ✓
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }],
    _partial: [{ percent: 30, currentPrice: 110, costBasisAtClose: 100, entryCountAtClose: 1 }],
  };
  const { remainingCostBasis } = getTotalClosed(signal);
  const totalInvested = signal._entry.reduce((s, e) => s + e.cost, 0);
  const closedDollarValue = signal._partial.reduce((s, p) => s + (p.percent / 100) * p.costBasisAtClose, 0);
  const remainingDollarValue = totalInvested - closedDollarValue;
  if (!approxEqual(remainingDollarValue, remainingCostBasis)) {
    fail(`remainingDollarValue=${remainingDollarValue} ≠ remainingCostBasis=${remainingCostBasis}`); return;
  }
  pass(`remainingDollarValue=${remainingDollarValue} == remainingCostBasis=${remainingCostBasis} ✓`);
});

test("identity: toProfitLossDto remainingDollarValue == getTotalClosed.remainingCostBasis (two partials+DCA)", ({ pass, fail }) => {
  // S5-style: entry[$100]→p1(25%@cb=100)→DCA[$100]→p2(25%@cb=175)→DCA[$100]
  // closedDollarValue=25+43.75=68.75; remainingDollarValue=300-68.75=231.25
  // getTotalClosed.remainingCostBasis=175*0.75+100=231.25 ✓
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 100 }, { price: 70, cost: 100 }],
    _partial: [
      { percent: 25, currentPrice: 115, costBasisAtClose: 100, entryCountAtClose: 1 },
      { percent: 25, currentPrice: 112, costBasisAtClose: 175, entryCountAtClose: 2 },
    ],
  };
  const { remainingCostBasis } = getTotalClosed(signal);
  const totalInvested = signal._entry.reduce((s, e) => s + e.cost, 0);
  const closedDollarValue = signal._partial.reduce((s, p) => s + (p.percent / 100) * p.costBasisAtClose, 0);
  const remainingDollarValue = totalInvested - closedDollarValue;
  if (!approxEqual(remainingDollarValue, remainingCostBasis)) {
    fail(`remainingDollarValue=${remainingDollarValue} ≠ remainingCostBasis=${remainingCostBasis}`); return;
  }
  pass(`S5 remainingDollarValue=${remainingDollarValue} == remainingCostBasis=${remainingCostBasis} ✓`);
});

// ---------------------------------------------------------------------------
// toProfitLossDto — different entry costs
// ---------------------------------------------------------------------------

test("toProfitLossDto: different costs [$100@100, $200@80] no partials close@95 (LONG)", ({ pass, fail }) => {
  // eff=300/3.5=85.714; totalInvested=300; pnlCost = pnlPct/100 * 300
  const signal = { position: "long", priceOpen: 100, _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 200 }] };
  const { pnlPercentage, pnlCost, pnlEntries } = toProfitLossDto(signal, 95);
  if (!approxEqual(pnlPercentage, 10.401276224)) { fail(`Expected 10.401276224, got ${pnlPercentage}`); return; }
  if (!approxEqual(pnlEntries, 300)) { fail(`Expected pnlEntries=300, got ${pnlEntries}`); return; }
  if (!approxEqual(pnlCost, pnlPercentage / 100 * 300)) { fail(`pnlCost mismatch`); return; }
  pass(`diff costs close@95: pnl=${pnlPercentage.toFixed(9)}%, pnlCost=${pnlCost.toFixed(4)}`);
});

test("toProfitLossDto: different costs [$100@100, $200@80] partial(40%@95,cb=300) close@110 (LONG)", ({ pass, fail }) => {
  // weight=120/300=0.4, remWeight=0.6; eff at p1=85.714; final eff=85.714 (no new DCA)
  // pnlEntries=300, pnlCost=pnlPct/100*300
  const signal = {
    position: "long",
    priceOpen: 100,
    _entry: [{ price: 100, cost: 100 }, { price: 80, cost: 200 }],
    _partial: [{ percent: 40, currentPrice: 95, costBasisAtClose: 300, entryCountAtClose: 2 }],
  };
  const { pnlPercentage, pnlCost, pnlEntries } = toProfitLossDto(signal, 110);
  if (!approxEqual(pnlPercentage, 20.869818182)) { fail(`Expected 20.869818182, got ${pnlPercentage}`); return; }
  if (!approxEqual(pnlEntries, 300)) { fail(`Expected pnlEntries=300, got ${pnlEntries}`); return; }
  if (!approxEqual(pnlCost, pnlPercentage / 100 * 300)) { fail(`pnlCost mismatch`); return; }
  pass(`diff costs partial(40%@95)+close@110: pnl=${pnlPercentage.toFixed(9)}%`);
});

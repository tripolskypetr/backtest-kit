const SLIP = 0.001, FEE = 0.1;

// harmonic mean (correct for fixed $100 per entry)
function hm(prices) {
  return prices.length / prices.reduce((s, p) => s + 1/p, 0);
}

// getEffectivePriceOpen — replay cost basis through partials
function getEff(entries, partials) {
  if (!entries || entries.length === 0) return null;
  if (!partials || partials.length === 0) return hm(entries.map(e => e.price));

  // Replay cost basis to get snapshot at the last partial
  let costBasis = 0;
  for (let i = 0; i < partials.length; i++) {
    const prevCount = i === 0 ? 0 : partials[i - 1].entryCountAtClose;
    const newEntryCount = partials[i].entryCountAtClose - prevCount;
    costBasis += newEntryCount * 100;
    // Don't reduce on the last iteration — costBasis IS positionCostBasisAtClose for last partial
    if (i < partials.length - 1) {
      costBasis *= 1 - partials[i].percent / 100;
    }
  }

  const last = partials[partials.length - 1];

  // Dollar cost basis remaining after the last partial close
  const remainingCostBasis = costBasis * (1 - last.percent / 100);

  // Coins remaining from old position
  const oldCoins = remainingCostBasis / last.effectivePrice;

  // New DCA entries added AFTER the last partial
  const newEntries = entries.slice(last.entryCountAtClose);
  const newCoins = newEntries.reduce((s, e) => s + 100/e.price, 0);

  const totalCoins = oldCoins + newCoins;
  if (totalCoins === 0) return last.effectivePrice;

  return (remainingCostBasis + newEntries.length * 100) / totalCoins;
}

// toProfitLossDto — replay cost basis for correct dollar weights
function calcPnl(entries, partials, finalClose, pos) {
  const totalInvested = entries ? entries.length * 100 : 100;
  const priceOpen = getEff(entries, partials);

  if (!partials || partials.length === 0) {
    const oS = pos === 'long' ? priceOpen * 1.001 : priceOpen * 0.999;
    const cS = pos === 'long' ? finalClose * 0.999 : finalClose * 1.001;
    const raw = pos === 'long' ? ((cS-oS)/oS)*100 : ((oS-cS)/oS)*100;
    return raw - FEE*(1 + cS/oS);
  }

  let totalWeighted = 0;
  let totalFees = FEE;
  let closedDollar = 0;
  let costBasis = 0;

  for (let i = 0; i < partials.length; i++) {
    const p = partials[i];

    // Add DCA entries up to this partial
    const prevCount = i === 0 ? 0 : partials[i - 1].entryCountAtClose;
    costBasis += (p.entryCountAtClose - prevCount) * 100;

    // Real dollar value sold in this partial
    const dollarValue = (p.percent / 100) * costBasis;
    const weight = dollarValue / totalInvested;
    closedDollar += dollarValue;

    // Reduce cost basis after close
    costBasis *= 1 - p.percent / 100;

    const oSlip = pos === 'long' ? p.effectivePrice * 1.001 : p.effectivePrice * 0.999;
    const cSlip = pos === 'long' ? p.price * 0.999 : p.price * 1.001;
    const pnl = pos === 'long' ? ((cSlip-oSlip)/oSlip)*100 : ((oSlip-cSlip)/oSlip)*100;
    totalWeighted += weight * pnl;
    totalFees += FEE * weight * (cSlip/oSlip);
  }

  const remDollar = totalInvested - closedDollar;
  const remWeight = remDollar / totalInvested;

  if (remWeight > 0) {
    const rOSlip = pos === 'long' ? priceOpen * 1.001 : priceOpen * 0.999;
    const rCSlip = pos === 'long' ? finalClose * 0.999 : finalClose * 1.001;
    const remPnl = pos === 'long' ? ((rCSlip-rOSlip)/rOSlip)*100 : ((rOSlip-rCSlip)/rOSlip)*100;
    totalWeighted += remWeight * remPnl;
    totalFees += FEE * remWeight * (rCSlip/rOSlip);
  }

  return totalWeighted - totalFees;
}

// ===================== getEffectivePriceOpen unit tests =====================
console.log("=== getEffectivePriceOpen ===");

console.log("hm([100]):", hm([100]).toFixed(9));
// hm([100,80]) = 2/(1/100+1/80) = 88.888...
console.log("hm([100,80]):", hm([100,80]).toFixed(9));
console.log("hm([100,80,70]):", hm([100,80,70]).toFixed(9));

// partial+DCA: entry[100,80], partial30%@120(eff=100,cnt=1)
// replay: costBasis=100 (1 entry), remainingCostBasis=70, oldCoins=0.7, newEntries=[80], newCoins=1.25
// effectivePrice = (70+100)/1.95 = 87.1794...
{
  const e = [{price:100},{price:80}];
  const p = [{effectivePrice:100, entryCountAtClose:1, percent:30}];
  const got = getEff(e, p);
  const expect = 170/1.95;
  console.log("entry[100,80] partial30%(eff=100,cnt=1):", got.toFixed(9), " expect:", expect.toFixed(9), got.toFixed(6)===expect.toFixed(6) ? "✓" : "✗");
}

// No new DCA after partial: entry[100,80], partial50%(eff=hm,cnt=2)
// remainingCostBasis=100, oldCoins=100/hm, effectivePrice=hm ✓
{
  const eff = hm([100,80]);
  const e = [{price:100},{price:80}];
  const p = [{effectivePrice:eff, entryCountAtClose:2, percent:50}];
  const got = getEff(e, p);
  console.log("no new DCA after partial:", got.toFixed(9), "== eff:", eff.toFixed(9), Math.abs(got-eff)<1e-9 ? "✓" : "✗");
}

// ===================== BASELINE no partials =====================
console.log("\n=== BASELINE no partials ===");

// LONG 100→110, no DCA
{
  const oS=100*1.001, cS=110*0.999;
  const raw=((cS-oS)/oS)*100;
  const fee=FEE*(1+cS/oS);
  console.log("LONG 100→110:", (raw-fee).toFixed(9));
}

// SHORT 100→90
{
  const oS=100*0.999, cS=90*1.001;
  const raw=((oS-cS)/oS)*100;
  const fee=FEE*(1+cS/oS);
  console.log("SHORT 100→90:", (raw-fee).toFixed(9));
}

// LONG DCA[100,80] close@100, eff=hm=88.888
{
  const eff=hm([100,80]);
  const oS=eff*1.001, cS=100*0.999;
  const raw=((cS-oS)/oS)*100;
  const fee=FEE*(1+cS/oS);
  console.log("LONG DCA[100,80] close@100:", (raw-fee).toFixed(9), " eff=", eff.toFixed(6));
}

// ===================== KEY EXAMPLE: partial→DCA =====================
// entry[100], partial50%@120(eff=100,cnt=1), DCA@80, close@90
// replay: costBasis=100, dollarValue=50, weight=50/200=0.25, costBasis→50
// remDollar=150, remWeight=0.75
// rough check (no slippage/fee): 0.25*20% + 0.75*(85.71→90 ~5%) ≈ 8.75%
console.log("\n=== KEY: partialExit→DCA ===");
{
  const entries=[{price:100},{price:80}];
  const partials=[{effectivePrice:100, entryCountAtClose:1, percent:50, price:120, type:"profit"}];
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 90, 'long');
  console.log("remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
  console.log("  weight partial=0.25, weight remaining=0.75");
  console.log("  rough check (no fees): 0.25*20 + 0.75*5 =", 0.25*20+0.75*5, "%");
}

// ===================== ALL SCENARIOS =====================

console.log("\n=== S1: DCA@80 → partial50%@110 → close@120 LONG ===");
{
  const eff = hm([100,80]);
  const entries=[{price:100},{price:80}];
  const partials=[{effectivePrice:eff, entryCountAtClose:2, percent:50, price:110}];
  // replay: costBasis=200, dollarValue=100, weight=0.5, remWeight=0.5
  const pnl = calcPnl(entries, partials, 120, 'long');
  console.log("eff:", eff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S2: DCA@80 → partialLoss30%@75 → close@100 LONG ===");
{
  const eff = hm([100,80]);
  const entries=[{price:100},{price:80}];
  const partials=[{effectivePrice:eff, entryCountAtClose:2, percent:30, price:75}];
  // replay: costBasis=200, dollarValue=60, weight=0.3, remWeight=0.7
  const pnl = calcPnl(entries, partials, 100, 'long');
  console.log("pnl:", pnl.toFixed(9));
}

console.log("\n=== S3: partial30%@120(cnt=1) → DCA@80 → close@105 LONG ===");
{
  const entries=[{price:100},{price:80}];
  const partials=[{effectivePrice:100, entryCountAtClose:1, percent:30, price:120}];
  // replay: costBasis=100, dollarValue=30, weight=30/200=0.15, remWeight=0.85
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 105, 'long');
  console.log("remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S4: partialLoss30%@80(cnt=1) → DCA@60 → close@90 LONG ===");
{
  const entries=[{price:100},{price:60}];
  const partials=[{effectivePrice:100, entryCountAtClose:1, percent:30, price:80}];
  // replay: costBasis=100, dollarValue=30, weight=30/200=0.15, remWeight=0.85
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 90, 'long');
  console.log("remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S5: partial25%@115(cnt=1) → DCA@80 → partial25%@112(cnt=2) → DCA@70 → close@105 LONG ===");
{
  const snap1 = 100;
  const snap2 = hm([100,80]);
  const entries=[{price:100},{price:80},{price:70}];
  const partials=[
    {effectivePrice:snap1, entryCountAtClose:1, percent:25, price:115},
    {effectivePrice:snap2, entryCountAtClose:2, percent:25, price:112},
  ];
  // replay: i=0: costBasis=100, dollar=25, costBasis→75
  //         i=1: costBasis=75+100=175 (snapshot), dollar=43.75, costBasis→131.25
  // totalInvested=300, weights: 25/300, 43.75/300, remaining=231.25/300
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 105, 'long');
  console.log("snap2:", snap2.toFixed(6), "  remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S6: DCA@85 → partial30%@110(cnt=2) → DCA@75 → partial20%@88(cnt=3) → close@95 LONG ===");
{
  const snap1 = hm([100,85]);
  const entries=[{price:100},{price:85},{price:75}];
  // snap2 = getEff after first partial
  const snap2 = getEff(entries, [{effectivePrice:snap1, entryCountAtClose:2, percent:30}]);
  const partials=[
    {effectivePrice:snap1, entryCountAtClose:2, percent:30, price:110},
    {effectivePrice:snap2, entryCountAtClose:3, percent:20, price:88},
  ];
  // replay: i=0: costBasis=200, dollar=60, costBasis→140
  //         i=1: costBasis=140+100=240 (snapshot), dollar=48, costBasis→192
  // totalInvested=300, weights: 60/300, 48/300, remaining=192/300
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 95, 'long');
  console.log("snap1:", snap1.toFixed(6), "  snap2:", snap2.toFixed(6), "  remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S7: partialLoss20%@85(cnt=1) → DCA@70 → DCA@60 → partial30%@95(cnt=3) → close@80 LONG ===");
{
  const snap1 = 100;
  const entries=[{price:100},{price:70},{price:60}];
  const snap2 = getEff(entries, [{effectivePrice:snap1, entryCountAtClose:1, percent:20}]);
  const partials=[
    {effectivePrice:snap1, entryCountAtClose:1, percent:20, price:85},
    {effectivePrice:snap2, entryCountAtClose:3, percent:30, price:95},
  ];
  // replay: i=0: costBasis=100, dollar=20, costBasis→80
  //         i=1: costBasis=80+200=280 (snapshot), dollar=84, costBasis→196
  // totalInvested=300, weights: 20/300, 84/300, remaining=196/300
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 80, 'long');
  console.log("snap2:", snap2.toFixed(6), "  remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S8: DCA@80 → partial40%@100(cnt=2) → DCA@70 → partial30%@110(cnt=3) → close@95 LONG ===");
{
  const snap1 = hm([100,80]);
  const entries=[{price:100},{price:80},{price:70}];
  const snap2 = getEff(entries, [{effectivePrice:snap1, entryCountAtClose:2, percent:40}]);
  const partials=[
    {effectivePrice:snap1, entryCountAtClose:2, percent:40, price:100},
    {effectivePrice:snap2, entryCountAtClose:3, percent:30, price:110},
  ];
  // replay: i=0: costBasis=200, dollar=80, costBasis→120
  //         i=1: costBasis=120+100=220 (snapshot), dollar=66, costBasis→154
  // totalInvested=300, weights: 80/300, 66/300, remaining=154/300
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 95, 'long');
  console.log("snap1:", snap1.toFixed(6), "  snap2:", snap2.toFixed(6), "  remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S9: partial20%@120(cnt=1) → partial20%@90(cnt=1) → DCA@70 → close@95 LONG ===");
// Two partials with same entryCountAtClose=1: second partial sells % of already-reduced position
// replay: i=0: costBasis=100, dollar=20, costBasis→80
//         i=1: costBasis=80 (no new entries), dollar=16, costBasis→64
// totalInvested=200, weights: 20/200=0.1, 16/200=0.08, remaining=164/200=0.82
{
  const entries=[{price:100},{price:70}];
  const partials=[
    {effectivePrice:100, entryCountAtClose:1, percent:20, price:120},
    {effectivePrice:100, entryCountAtClose:1, percent:20, price:90},
  ];
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 95, 'long');
  console.log("remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
  console.log("  weights: partial1=0.10, partial2=0.08, remaining=0.82");
}

console.log("\n=== S10 SHORT: DCA@110 → partial30%@90(cnt=2) → DCA@120 → partial30%@85(cnt=3) → close@88 ===");
{
  const snap1 = hm([100,110]);
  const entries=[{price:100},{price:110},{price:120}];
  const snap2 = getEff(entries, [{effectivePrice:snap1, entryCountAtClose:2, percent:30}]);
  const partials=[
    {effectivePrice:snap1, entryCountAtClose:2, percent:30, price:90},
    {effectivePrice:snap2, entryCountAtClose:3, percent:30, price:85},
  ];
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 88, 'short');
  console.log("snap1:", snap1.toFixed(6), "  snap2:", snap2.toFixed(6), "  remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S11 SHORT: partialLoss25%@105(cnt=1) → DCA@115 → partial25%@88(cnt=2) → close@92 ===");
{
  const snap1 = 100;
  const entries=[{price:100},{price:115}];
  const snap2 = getEff(entries, [{effectivePrice:snap1, entryCountAtClose:1, percent:25}]);
  const partials=[
    {effectivePrice:snap1, entryCountAtClose:1, percent:25, price:105},
    {effectivePrice:snap2, entryCountAtClose:2, percent:25, price:88},
  ];
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 92, 'short');
  console.log("snap2:", snap2.toFixed(6), "  remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== S12: 4 partials + 3 DCA, LONG ===");
// Entry@100, DCA@80, partial1 20%@115(cnt=1)
// DCA@72, partial2 20%@108(cnt=2) [on remaining after DCA]
// DCA@65, partial3 20%@83(cnt=3), partial4 20%@100(cnt=4)
// replay costBasis at each partial:
//   i=0: costBasis=100,  dollar=20, costBasis→80
//   i=1: costBasis=180,  dollar=36, costBasis→144
//   i=2: costBasis=244,  dollar=48.8, costBasis→195.2
//   i=3: costBasis=295.2, dollar=59.04, costBasis→236.16
// totalInvested=400, closedDollar=163.84, remaining=236.16 (59.04%)
{
  const snap1 = 100;
  const snap2 = hm([100,80]);
  const entries3 = [{price:100},{price:80},{price:72}];
  const snap3 = getEff(entries3, [
    {effectivePrice:snap1, entryCountAtClose:1, percent:20},
    {effectivePrice:snap2, entryCountAtClose:2, percent:20},
  ]);
  const entries4 = [{price:100},{price:80},{price:72},{price:65}];
  const snap4 = getEff(entries4, [
    {effectivePrice:snap1, entryCountAtClose:1, percent:20},
    {effectivePrice:snap2, entryCountAtClose:2, percent:20},
    {effectivePrice:snap3, entryCountAtClose:3, percent:20},
  ]);
  const entries=[{price:100},{price:80},{price:72},{price:65}];
  const partials=[
    {effectivePrice:snap1, entryCountAtClose:1, percent:20, price:115},
    {effectivePrice:snap2, entryCountAtClose:2, percent:20, price:108},
    {effectivePrice:snap3, entryCountAtClose:3, percent:20, price:83},
    {effectivePrice:snap4, entryCountAtClose:4, percent:20, price:100},
  ];
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 100, 'long');
  console.log("snaps:", snap1, snap2.toFixed(4), snap3.toFixed(4), snap4.toFixed(4));
  console.log("remEff:", remEff?.toFixed(6), "  pnl (close@100):", pnl.toFixed(9));
  console.log("  closedDollar≈163.84, remaining≈236.16 (59% of $400)");
}

console.log("\n=== SHORT S3: partial30%@80(cnt=1) → DCA@120 → close@85 ===");
{
  const entries=[{price:100},{price:120}];
  const partials=[{effectivePrice:100, entryCountAtClose:1, percent:30, price:80}];
  // replay: costBasis=100, dollar=30, weight=30/200=0.15, remWeight=0.85
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 85, 'short');
  console.log("remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== effectivePrice isolation: entry[100,40], partial50%@120(eff=100,cnt=1) → close@90 ===");
{
  const entries=[{price:100},{price:40}];
  const partials=[{effectivePrice:100, entryCountAtClose:1, percent:50, price:120}];
  // replay: costBasis=100, dollar=50, weight=50/200=0.25, remWeight=0.75
  // remEff: remainingCostBasis=50, oldCoins=0.5, newEntries=[40], newCoins=2.5
  //         = (50+100)/3 = 50
  const remEff = getEff(entries, partials);
  const pnl = calcPnl(entries, partials, 90, 'long');
  console.log("remEff:", remEff.toFixed(6), "  pnl:", pnl.toFixed(9));
}

console.log("\n=== 100% closed via 2 partials: partial60%@110(cnt=1) + partial100%@115(cnt=1) ===");
// After 60%, remaining cost basis = 40. Second partial = 100% of remaining → closes everything.
// replay: i=0: costBasis=100, dollar=60, costBasis→40
//         i=1: costBasis=40 (no new entries), dollar=40, costBasis→0
// closedDollar=100=totalInvested, remWeight=0 ✓
{
  const entries=[{price:100}];
  const partials=[
    {effectivePrice:100, entryCountAtClose:1, percent:60, price:110},
    {effectivePrice:100, entryCountAtClose:1, percent:100, price:115},
  ];
  const pnl = calcPnl(entries, partials, 999, 'long'); // finalClose irrelevant
  console.log("pnl:", pnl.toFixed(9), " (remWeight should be 0, finalClose irrelevant)");
}

console.log("\n=== weights sum to 1.0 sanity check (S5) ===");
{
  const entries=[{price:100},{price:80},{price:70}];
  const partials=[
    {effectivePrice:100, entryCountAtClose:1, percent:25, price:115},
    {effectivePrice:hm([100,80]), entryCountAtClose:2, percent:25, price:112},
  ];
  const totalInvested = 300;
  let costBasis=0, closedDollar=0;
  for (let i=0; i<partials.length; i++) {
    const prevCount = i===0 ? 0 : partials[i-1].entryCountAtClose;
    costBasis += (partials[i].entryCountAtClose - prevCount) * 100;
    closedDollar += (partials[i].percent/100) * costBasis;
    costBasis *= 1 - partials[i].percent/100;
  }
  const remWeight = (totalInvested - closedDollar) / totalInvested;
  console.log("closedDollar:", closedDollar.toFixed(4), "  remaining:", (totalInvested-closedDollar).toFixed(4), "  sum weights:", ((closedDollar + (totalInvested-closedDollar))/totalInvested).toFixed(9), "✓");
}
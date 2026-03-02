import { toProfitLossDto, getEffectivePriceOpen } from "./build/index.mjs";

const fmt = (v) => v.toFixed(9);
const hm = (...ps) => ps.length / ps.reduce((s, p) => s + 1/p, 0);

// ---- helpers ----
function eff(signal) { return getEffectivePriceOpen(signal); }
function pnl(signal, close) { return toProfitLossDto(signal, close).pnlPercentage; }

// S5: partial->DCA->partial->DCA->close (LONG)
// cnt=[1,2], percent=[25,25], entries=[100,80,70], totalInvested=300
// NEW costBasis: p1=100,dv=25; after=75; p2: cb=175,dv=43.75; closed=68.75; rem=231.25
{
  const snap1 = 100;
  const snap2 = hm(100, 80);
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:80},{price:70}],
    _partial: [
      {type:"profit", percent:25, price:115, effectivePrice:snap1, entryCountAtClose:1},
      {type:"profit", percent:25, price:112, effectivePrice:snap2, entryCountAtClose:2},
    ]
  };
  console.log("S5:", fmt(pnl(sig, 105)));
}

// S6: DCA->partial->DCA->partial->close (LONG)
// cnt=[2,3], percent=[30,20], entries=[100,85,75], totalInvested=300
{
  const snap1 = hm(100, 85);
  const snap2 = hm(100, 85, 75);
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:85},{price:75}],
    _partial: [
      {type:"profit", percent:30, price:110, effectivePrice:snap1, entryCountAtClose:2},
      {type:"loss",   percent:20, price:88,  effectivePrice:snap2, entryCountAtClose:3},
    ]
  };
  console.log("S6:", fmt(pnl(sig, 95)));
}

// S7: partial->DCA->DCA->partial->close (LONG)
// cnt=[1,3], percent=[20,30], entries=[100,70,60], totalInvested=300
{
  const snap2 = hm(100, 70, 60);
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:70},{price:60}],
    _partial: [
      {type:"loss",   percent:20, price:85, effectivePrice:100,   entryCountAtClose:1},
      {type:"profit", percent:30, price:95, effectivePrice:snap2, entryCountAtClose:3},
    ]
  };
  console.log("S7:", fmt(pnl(sig, 80)));
}

// S8: DCA->partial->DCA->partial->close (LONG)
// cnt=[2,3], percent=[40,30], entries=[100,80,70], totalInvested=300
// NEW getEff snap2: after p1 costBasis=200*(1-0.4)=120, oldCoins=120/snap1, newCoins=100/70
{
  const snap1 = hm(100, 80);
  // snap2 = effectivePrice at time of p2 (after DCA@70 added)
  // getEffectivePriceOpen([100,80,70], [p1]) where p1: cnt=2, pct=40, eff=snap1
  // replay: i=0 only, costBasis=200, NOT reduced (i<0? no, length=1 so i<0 false, so not reduced)
  // remainingCostBasis = 200*(1-0.4)=120, oldCoins=120/snap1, newCoins=100/70
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:80},{price:70}],
    _partial: [{type:"profit", percent:40, price:100, effectivePrice:snap1, entryCountAtClose:2}]
  });
  console.log("S8 snap2:", fmt(snap2));
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:80},{price:70}],
    _partial: [
      {type:"profit", percent:40, price:100, effectivePrice:snap1, entryCountAtClose:2},
      {type:"profit", percent:30, price:110, effectivePrice:snap2, entryCountAtClose:3},
    ]
  };
  console.log("S8:", fmt(pnl(sig, 95)));
}

// S9: partial->partial->DCA->close (LONG)
// cnt=[1,1], percent=[20,20], entries=[100,70], totalInvested=200
// NEW: after p1 costBasis=80, p2 costBasis=80 (same cnt), dv=16
// getEff: 2 partials, same cnt=1 → replay: i=0:cb=100,reduce→80; i=1:newE=0,cb=80;
//   remainingCostBasis=80*(1-0.2)=64, oldCoins=64/100=0.64, newCoins=100/70
{
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:70}],
    _partial: [
      {type:"profit", percent:20, price:120, effectivePrice:100, entryCountAtClose:1},
      {type:"loss",   percent:20, price:90,  effectivePrice:100, entryCountAtClose:1},
    ]
  };
  console.log("S9:", fmt(pnl(sig, 95)));
  // Also show remEff
  console.log("S9 remEff:", fmt(eff(sig)));
}

// S10 SHORT: DCA->partial->DCA->partial->close
// cnt=[2,3], percent=[30,30], entries=[100,110,120], totalInvested=300
{
  const snap1 = hm(100, 110);
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:110},{price:120}],
    _partial: [{type:"profit", percent:30, price:90, effectivePrice:snap1, entryCountAtClose:2}]
  });
  console.log("S10 snap2:", fmt(snap2));
  const sig = {
    position: "short", priceOpen: 100,
    _entry: [{price:100},{price:110},{price:120}],
    _partial: [
      {type:"profit", percent:30, price:90,  effectivePrice:snap1, entryCountAtClose:2},
      {type:"profit", percent:30, price:85,  effectivePrice:snap2, entryCountAtClose:3},
    ]
  };
  console.log("S10:", fmt(pnl(sig, 88)));
}

// S11 SHORT: partial(loss)->DCA->partial(profit)->close
// cnt=[1,2], percent=[25,25], entries=[100,115], totalInvested=200
{
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:115}],
    _partial: [{type:"loss", percent:25, price:105, effectivePrice:100, entryCountAtClose:1}]
  });
  console.log("S11 snap2:", fmt(snap2));
  const sig = {
    position: "short", priceOpen: 100,
    _entry: [{price:100},{price:115}],
    _partial: [
      {type:"loss",   percent:25, price:105, effectivePrice:100,   entryCountAtClose:1},
      {type:"profit", percent:25, price:88,  effectivePrice:snap2, entryCountAtClose:2},
    ]
  };
  console.log("S11:", fmt(pnl(sig, 92)));
}

// S13: 4 partials, 3 DCA rounds, entries=[100,80,72,65], totalInvested=400
// percent=20% each time, cnt=[1,2,3,4]
{
  const snap1 = 100;
  const snap2 = hm(100, 80);
  const snap3 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:80},{price:72}],
    _partial: [
      {type:"profit", percent:20, price:115, effectivePrice:snap1, entryCountAtClose:1},
      {type:"profit", percent:20, price:108, effectivePrice:snap2, entryCountAtClose:2},
    ]
  });
  console.log("S13 snap3:", fmt(snap3));
  const snap4 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:80},{price:72},{price:65}],
    _partial: [
      {type:"profit", percent:20, price:115, effectivePrice:snap1, entryCountAtClose:1},
      {type:"profit", percent:20, price:108, effectivePrice:snap2, entryCountAtClose:2},
      {type:"loss",   percent:20, price:83,  effectivePrice:snap3, entryCountAtClose:3},
    ]
  });
  console.log("S13 snap4:", fmt(snap4));
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:80},{price:72},{price:65}],
    _partial: [
      {type:"profit", percent:20, price:115, effectivePrice:snap1, entryCountAtClose:1},
      {type:"profit", percent:20, price:108, effectivePrice:snap2, entryCountAtClose:2},
      {type:"loss",   percent:20, price:83,  effectivePrice:snap3, entryCountAtClose:3},
      {type:"profit", percent:20, price:100, effectivePrice:snap4, entryCountAtClose:4},
    ]
  };
  console.log("S13:", fmt(pnl(sig, 100)));
}

// NEW "100% closed": entry[100], p1=60%@110(cnt=1), p2=100%@115(cnt=1)
// p1: costBasis=100, dv=60; after=40; p2: costBasis=40, dv=40; closed=100 → remWeight=0 ✓
{
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100}],
    _partial: [
      {type:"profit", percent:60, price:110, effectivePrice:100, entryCountAtClose:1},
      {type:"profit", percent:100, price:115, effectivePrice:100, entryCountAtClose:1},
    ]
  };
  console.log("100%_closed:", fmt(pnl(sig, 999)));
}

// NEW getEffectivePriceOpen multi-partial test:
// entry[100], p1=30%@110(cnt=1,eff=100), p2=50%@120(cnt=1,eff=70)
// replay getEff: i=0:cb=100, reduce: 70; i=1:prevCnt=1,newE=0,cb=70
// remainingCostBasis=70*(1-0.5)=35, oldCoins=35/70=0.5, newEntries=[], totalCoins=0.5
// result=35/0.5=70
{
  const sig = {
    priceOpen: 100,
    _entry: [{price:100}],
    _partial: [
      {type:"profit", percent:30, price:110, effectivePrice:100, entryCountAtClose:1},
      {type:"profit", percent:50, price:120, effectivePrice:70,  entryCountAtClose:1},
    ]
  };
  console.log("getEff_multi_partial:", fmt(eff(sig)));
}
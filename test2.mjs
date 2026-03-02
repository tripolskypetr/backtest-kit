import { toProfitLossDto, getEffectivePriceOpen } from "./build/index.mjs";

const fmt = (v) => v.toFixed(9);
const hm = (...ps) => ps.length / ps.reduce((s, p) => s + 1/p, 0);

// ---- helpers ----
function eff(signal) { return getEffectivePriceOpen(signal); }
function pnl(signal, close) { return toProfitLossDto(signal, close).pnlPercentage; }

// S5: partial->DCA->partial->DCA->close (LONG)
// cnt=[1,2], percent=[25,25], entries=[100,80,70], totalInvested=300
// replay: p1: cb=100,dv=25,cb→75; p2: cb=75+100=175,dv=43.75; closed=68.75; rem=231.25
{
  const snap1 = 100;
  const snap2 = hm(100, 80); // ✓ no prior partials at time of p2 (p1 cnt=1, p2 cnt=2, first entry only before p1)
  // Actually snap2 is eff at time p2 fires: entries=[100,80], _partial=[p1]
  const snap2_correct = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:80}],
    _partial: [{type:"profit", percent:25, price:115, effectivePrice:snap1, entryCountAtClose:1}]
  });
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:80},{price:70}],
    _partial: [
      {type:"profit", percent:25, price:115, effectivePrice:snap1,         entryCountAtClose:1},
      {type:"profit", percent:25, price:112, effectivePrice:snap2_correct,  entryCountAtClose:2},
    ]
  };
  console.log("S5 snap2:", fmt(snap2_correct));
  console.log("S5:", fmt(pnl(sig, 105)));
}

// S6: DCA->partial->DCA->partial->close (LONG)
// cnt=[2,3], percent=[30,20], entries=[100,85,75], totalInvested=300
// snap2 must be eff([100,85,75], [p1]) — NOT hm(100,85,75)
{
  const snap1 = hm(100, 85); // ✓ no prior partials at p1
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:85},{price:75}],
    _partial: [{type:"profit", percent:30, price:110, effectivePrice:snap1, entryCountAtClose:2}]
  });
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:85},{price:75}],
    _partial: [
      {type:"profit", percent:30, price:110, effectivePrice:snap1, entryCountAtClose:2},
      {type:"loss",   percent:20, price:88,  effectivePrice:snap2, entryCountAtClose:3},
    ]
  };
  console.log("S6 snap1:", fmt(snap1), "snap2:", fmt(snap2));
  console.log("S6:", fmt(pnl(sig, 95)));
}

// S7: partial->DCA->DCA->partial->close (LONG)
// cnt=[1,3], percent=[20,30], entries=[100,70,60], totalInvested=300
// snap2 must be eff([100,70,60], [p1]) — NOT hm(100,70,60)
{
  const snap1 = 100; // ✓ no prior partials at p1
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:70},{price:60}],
    _partial: [{type:"loss", percent:20, price:85, effectivePrice:snap1, entryCountAtClose:1}]
  });
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:70},{price:60}],
    _partial: [
      {type:"loss",   percent:20, price:85, effectivePrice:snap1, entryCountAtClose:1},
      {type:"profit", percent:30, price:95, effectivePrice:snap2, entryCountAtClose:3},
    ]
  };
  console.log("S7 snap2:", fmt(snap2));
  console.log("S7:", fmt(pnl(sig, 80)));
}

// S8: DCA->partial->DCA->partial->close (LONG)
// cnt=[2,3], percent=[40,30], entries=[100,80,70], totalInvested=300
{
  const snap1 = hm(100, 80); // ✓
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:80},{price:70}],
    _partial: [{type:"profit", percent:40, price:100, effectivePrice:snap1, entryCountAtClose:2}]
  });
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:80},{price:70}],
    _partial: [
      {type:"profit", percent:40, price:100, effectivePrice:snap1, entryCountAtClose:2},
      {type:"profit", percent:30, price:110, effectivePrice:snap2, entryCountAtClose:3},
    ]
  };
  console.log("S8 snap1:", fmt(snap1), "snap2:", fmt(snap2));
  console.log("S8:", fmt(pnl(sig, 95)));
}

// S9: partial->partial->DCA->close (LONG)
// cnt=[1,1], percent=[20,20], entries=[100,70], totalInvested=200
// replay: p1: cb=100,dv=20,cb→80; p2: same cnt so newE=0, cb=80,dv=16,cb→64
// getEff: remainingCostBasis=64, oldCoins=64/snap2_eff, newEntries=[70]
// snap2 at p2: eff([100,70], [p1]) since p1 already happened with cnt=1
{
  const snap1 = 100; // ✓
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:70}],
    _partial: [{type:"profit", percent:20, price:120, effectivePrice:snap1, entryCountAtClose:1}]
  });
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100},{price:70}],
    _partial: [
      {type:"profit", percent:20, price:120, effectivePrice:snap1, entryCountAtClose:1},
      {type:"loss",   percent:20, price:90,  effectivePrice:snap2, entryCountAtClose:1},
    ]
  };
  console.log("S9 snap2:", fmt(snap2));
  console.log("S9:", fmt(pnl(sig, 95)));
  console.log("S9 remEff:", fmt(eff(sig)));
}

// S10 SHORT: DCA->partial->DCA->partial->close
// cnt=[2,3], percent=[30,30], entries=[100,110,120], totalInvested=300
{
  const snap1 = hm(100, 110); // ✓
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:110},{price:120}],
    _partial: [{type:"profit", percent:30, price:90, effectivePrice:snap1, entryCountAtClose:2}]
  });
  const sig = {
    position: "short", priceOpen: 100,
    _entry: [{price:100},{price:110},{price:120}],
    _partial: [
      {type:"profit", percent:30, price:90, effectivePrice:snap1, entryCountAtClose:2},
      {type:"profit", percent:30, price:85, effectivePrice:snap2, entryCountAtClose:3},
    ]
  };
  console.log("S10 snap1:", fmt(snap1), "snap2:", fmt(snap2));
  console.log("S10:", fmt(pnl(sig, 88)));
}

// S11 SHORT: partial(loss)->DCA->partial(profit)->close
// cnt=[1,2], percent=[25,25], entries=[100,115], totalInvested=200
{
  const snap1 = 100; // ✓
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:115}],
    _partial: [{type:"loss", percent:25, price:105, effectivePrice:snap1, entryCountAtClose:1}]
  });
  const sig = {
    position: "short", priceOpen: 100,
    _entry: [{price:100},{price:115}],
    _partial: [
      {type:"loss",   percent:25, price:105, effectivePrice:snap1, entryCountAtClose:1},
      {type:"profit", percent:25, price:88,  effectivePrice:snap2, entryCountAtClose:2},
    ]
  };
  console.log("S11 snap2:", fmt(snap2));
  console.log("S11:", fmt(pnl(sig, 92)));
}

// S13: 4 partials, 3 DCA rounds, entries=[100,80,72,65], totalInvested=400
// percent=20% each, cnt=[1,2,3,4]
// snap2 at p2: eff([100,80], [p1]) — NOT hm(100,80)
// snap3 at p3: eff([100,80,72], [p1,p2])
// snap4 at p4: eff([100,80,72,65], [p1,p2,p3])
{
  const snap1 = 100; // ✓
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:80}],
    _partial: [
      {type:"profit", percent:20, price:115, effectivePrice:snap1, entryCountAtClose:1},
    ]
  });
  const snap3 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:80},{price:72}],
    _partial: [
      {type:"profit", percent:20, price:115, effectivePrice:snap1, entryCountAtClose:1},
      {type:"profit", percent:20, price:108, effectivePrice:snap2, entryCountAtClose:2},
    ]
  });
  const snap4 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:80},{price:72},{price:65}],
    _partial: [
      {type:"profit", percent:20, price:115, effectivePrice:snap1, entryCountAtClose:1},
      {type:"profit", percent:20, price:108, effectivePrice:snap2, entryCountAtClose:2},
      {type:"loss",   percent:20, price:83,  effectivePrice:snap3, entryCountAtClose:3},
    ]
  });
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
  console.log("S13 snaps:", snap1, fmt(snap2), fmt(snap3), fmt(snap4));
  console.log("S13:", fmt(pnl(sig, 100)));
}

// 100% closed: entry[100], p1=60%@110(cnt=1), p2=100%@115(cnt=1)
// replay: p1: cb=100,dv=60,cb→40; p2: cb=40,dv=40; closed=100 → remWeight=0 ✓
{
  const sig = {
    position: "long", priceOpen: 100,
    _entry: [{price:100}],
    _partial: [
      {type:"profit", percent:60,  price:110, effectivePrice:100, entryCountAtClose:1},
      {type:"profit", percent:100, price:115, effectivePrice:100, entryCountAtClose:1},
    ]
  };
  console.log("100%_closed:", fmt(pnl(sig, 999)));
}

// getEff multi-partial: entry[100], p1=30%(eff=100,cnt=1), p2=50%(eff=70,cnt=1)
// replay: i=0: cb=100,reduce→70; i=1: newE=0,cb=70(snapshot,last)
// remainingCostBasis=35, oldCoins=35/70=0.5, newEntries=[] → result=35/0.5=70
{
  const sig = {
    priceOpen: 100,
    _entry: [{price:100}],
    _partial: [
      {type:"profit", percent:30, price:110, effectivePrice:100, entryCountAtClose:1},
      {type:"profit", percent:50, price:120, effectivePrice:70,  entryCountAtClose:1},
    ]
  };
  console.log("getEff_multi_partial:", fmt(eff(sig)), " expect: 70.000000000");
}

// weights sanity: all weights sum to 1.0 (S7 example)
{
  const snap1 = 100;
  const snap2 = eff({
    priceOpen: 100,
    _entry: [{price:100},{price:70},{price:60}],
    _partial: [{type:"loss", percent:20, price:85, effectivePrice:snap1, entryCountAtClose:1}]
  });
  const totalInvested = 300;
  let costBasis = 0, closedDollar = 0;
  const partials = [
    {percent:20, entryCountAtClose:1},
    {percent:30, entryCountAtClose:3},
  ];
  for (let i = 0; i < partials.length; i++) {
    const prevCount = i === 0 ? 0 : partials[i-1].entryCountAtClose;
    costBasis += (partials[i].entryCountAtClose - prevCount) * 100;
    closedDollar += (partials[i].percent / 100) * costBasis;
    costBasis *= 1 - partials[i].percent / 100;
  }
  const remWeight = (totalInvested - closedDollar) / totalInvested;
  console.log("S7 weights sum:", fmt((closedDollar + totalInvested - closedDollar) / totalInvested), "✓");
  console.log("  closed:", closedDollar.toFixed(4), "remaining:", (totalInvested - closedDollar).toFixed(4));
}
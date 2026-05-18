import json

with open("/mnt/user-data/uploads/polymarket-backtest-result.json") as f:
    d = json.load(f)

all_sigs = [sig for r in d["results"] for sig in r["signals"] if abs(sig["returnPct"]) > 0.001]
all_sigs.sort(key=lambda x: x["t"])

# Equity month by month
from collections import defaultdict
by_month = defaultdict(list)
for sig in all_sigs:
    m = sig["dateISO"][:7]
    by_month[m].append(sig)

print("=== МЕСЯЧНЫЙ РАЗРЕЗ ===")
for m in sorted(by_month):
    sigs = by_month[m]
    wins = [s for s in sigs if s["win"]]
    cum = sum(s["returnPct"] for s in sigs)
    wr = len(wins)/len(sigs)*100
    gsum = sum(s["returnPct"] for s in wins)
    lsum = abs(sum(s["returnPct"] for s in sigs if not s["win"]))
    pf = gsum/lsum if lsum > 0 else float("inf")
    bar = "█"*int(abs(cum)) + ("+" if cum>0 else "-")
    print(f"  {m}  n={len(sigs):3d}  WR={wr:5.1f}%  PnL={cum:+6.2f}%  PF={pf:.3f}  {bar}")

# Фильтр: только высокий Δprob
print("\n=== ФИЛЬТР |Δprob| ПО ПОРОГАМ ===")
for thresh in [0.03, 0.05, 0.08, 0.10, 0.15]:
    sigs = [s for s in all_sigs if abs(s["dprob"]) >= thresh]
    if not sigs: continue
    wins = [s for s in sigs if s["win"]]
    cum = sum(s["returnPct"] for s in sigs)
    gsum = sum(s["returnPct"] for s in wins)
    lsum = abs(sum(s["returnPct"] for s in sigs if not s["win"]))
    pf = gsum/lsum if lsum > 0 else float("inf")
    mean = cum/len(sigs)
    var = sum((s["returnPct"]-mean)**2 for s in sigs)/len(sigs)
    sh = mean/var**0.5 if var > 0 else 0
    print(f"  Δprob≥{thresh:.0%}  n={len(sigs):3d}  WR={len(wins)/len(sigs)*100:5.1f}%  PnL={cum:+7.2f}%  PF={pf:.4f}  Sh={sh:+.3f}  edge/trade={mean:+.3f}%")

# Комиссионный breakeven
print("\n=== КОМИССИОННЫЙ АНАЛИЗ ===")
n = len(all_sigs)
cum = sum(s["returnPct"] for s in all_sigs)
edge_per_trade = cum / n
print(f"Edge per trade: {edge_per_trade:+.4f}%")
for fee_bps in [5, 10, 15, 20]:
    fee_rt = fee_bps/100  # round-trip %
    net = cum - n * fee_rt
    print(f"  {fee_bps}bps r/t fee: net PnL = {net:+.2f}%  (breakeven at {edge_per_trade/fee_rt*fee_bps:.1f}bps)")

# Market n=3,4,5 — слишком мало данных, убрать
print("\n=== БЕЗ МАЛЫХ РЫНКОВ (n<8) ===")
sigs_large = [sig for r in d["results"] if r["stats"]["n"] >= 8 
              for sig in r["signals"] if abs(sig["returnPct"]) > 0.001]
wins = [s for s in sigs_large if s["win"]]
cum = sum(s["returnPct"] for s in sigs_large)
gsum = sum(s["returnPct"] for s in wins)
lsum = abs(sum(s["returnPct"] for s in sigs_large if not s["win"]))
pf = gsum/lsum if lsum > 0 else float("inf")
mean = cum/len(sigs_large)
var = sum((s["returnPct"]-mean)**2 for s in sigs_large)/len(sigs_large)
print(f"n={len(sigs_large)}  WR={len(wins)/len(sigs_large)*100:.1f}%  PnL={cum:+.2f}%  PF={pf:.4f}  Sh={mean/var**0.5:.4f}")

"""
=== МЕСЯЧНЫЙ РАЗРЕЗ ===
  2024-04  n= 46  WR= 56.5%  PnL=+19.27%  PF=1.483  ███████████████████+
  2024-05  n= 39  WR= 48.7%  PnL= +3.77%  PF=1.108  ███+
  2024-06  n= 28  WR= 46.4%  PnL= -8.88%  PF=0.508  ████████-
  2024-07  n= 22  WR= 31.8%  PnL= -4.03%  PF=0.815  ████-
  2024-08  n= 12  WR= 66.7%  PnL= +9.48%  PF=1.968  █████████+

=== ФИЛЬТР |Δprob| ПО ПОРОГАМ ===
  Δprob≥3%  n=147  WR= 49.7%  PnL= +19.62%  PF=1.1576  Sh=+0.056  edge/trade=+0.133%
  Δprob≥5%  n=103  WR= 48.5%  PnL= +14.66%  PF=1.1653  Sh=+0.058  edge/trade=+0.142%
  Δprob≥8%  n= 64  WR= 48.4%  PnL= +17.78%  PF=1.3400  Sh=+0.109  edge/trade=+0.278%
  Δprob≥10%  n= 48  WR= 50.0%  PnL= +24.48%  PF=1.6587  Sh=+0.188  edge/trade=+0.510%
  Δprob≥15%  n= 21  WR= 38.1%  PnL=  -0.41%  PF=0.9769  Sh=-0.009  edge/trade=-0.019%

=== КОМИССИОННЫЙ АНАЛИЗ ===
Edge per trade: +0.1334%
  5bps r/t fee: net PnL = +12.27%  (breakeven at 13.3bps)
  10bps r/t fee: net PnL = +4.92%  (breakeven at 13.3bps)
  15bps r/t fee: net PnL = -2.43%  (breakeven at 13.3bps)
  20bps r/t fee: net PnL = -9.78%  (breakeven at 13.3bps)

=== БЕЗ МАЛЫХ РЫНКОВ (n<8) ===
n=109  WR=52.3%  PnL=+13.36%  PF=1.1442  Sh=0.0518
"""

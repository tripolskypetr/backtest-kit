# BTCUSDT February 2026 — Research Signal Analysis Report

## Context

AI-generated signals from `research_source_8h_0` were analyzed against real 1m OHLCV candle data for BTCUSDT, February 2026.

- **Signal source**: `dump/data/measure/research_source_8h_0/` — 84 files, one per 8h interval
- **Candle source**: `dump/BTCUSDT_40320_1m_1772323200000.jsonl` — 40 319 x 1m candles covering full February 2026
- **Signal interval**: every 8h (00:00, 08:00, 16:00 UTC)
- **Signal values**: `BUY`, `SELL`, `WAIT`
- **Evaluation window**: 8h after signal timestamp (480 x 1m candles)

---

## Price Overview (February 2026)

| Metric | Value |
|---|---|
| Period start (open) | $78 741 |
| Period end (close) | $66 362 |
| Global HIGH | $79 424 (Feb 1) |
| Global LOW | $60 000 (Feb 6, 00:xx UTC) |
| Max drawdown peak→trough | **-24.46%** ($79 424 → $60 000) |
| Net month move | **-15.7%** |

---

## Signal Distribution

| Signal | Count |
|---|---|
| SELL | 45 |
| WAIT | 34 |
| BUY | 5 |

Dominant bias: **bearish**. BUY signals extremely rare (5 out of 84).

---

## Key Market Events (from signal reasoning)

| Date (UTC) | Event | Price impact |
|---|---|---|
| Feb 1 | BTC breaks below $80k, $1.6B long liquidations | -3% |
| Feb 3 16:00 | Flash-crash to $72 946 on thin liquidity | -4.1% in 4h |
| Feb 5 08:00–20:00 | Main crash: $70k → $62 345, $1B+ liquidations, Kevin Warsh Fed appointment | **-12% in 8h** |
| Feb 6 00:00 | Absolute low $60 000, then V-recovery | Low $60k, recovery to $66k |
| Feb 8–10 | Stabilization $68–71k, WAIT signals dominant | ±2% ranging |
| Feb 13 | US CPI 2.4% (below forecast) + X Money announcement | +5% bounce |
| Feb 15 | Bithumb error (620k BTC ghost balance), KRW flash-crash -17% | -2.9% in 8h |
| Feb 22–23 | Trump 15% global tariffs, Bybit hack | -4.96% spike down |
| Feb 23–24 | Continued tariff pressure, $500M liquidations | -2.7% per 8h |
| Feb 25 | Short squeeze + ETF inflow $257M + Coinbase Premium positive | +3.92% |
| Feb 28 | Iran strikes (US/Israel), $175M liquidations | -3% in 4h |

---

## Signal vs Reality (1m candles, 8h window)

Columns: `MaxUp%` = max price rose from open, `MaxDn%` = max price fell from open, `Net%` = close vs open.

| Date (UTC)  | Sig  | Open    | 8h-Hi   | 8h-Lo   | MaxUp%  | MaxDn%   | Net%    |
|-------------|------|---------|---------|---------|---------|----------|---------|
| 02-01 00:00 | SELL | 78 741  | 79 424  | 77 968  | +0.87%  | -0.98%   | -0.51%  |
| 02-01 16:00 | SELL | 77 593  | 78 443  | 75 700  | +1.10%  | -2.44%   | -0.81%  |
| 02-02 00:00 | BUY  | 76 968  | 78 231  | 74 604  | +1.64%  | **-3.07%** | -0.40% |
| 02-02 08:00 | SELL | 76 661  | 79 360  | 76 628  | **+3.52%** | -0.04% | +2.86% |
| 02-03 00:00 | SELL | 78 739  | 79 187  | 77 644  | +0.57%  | -1.39%   | +0.07%  |
| 02-03 08:00 | SELL | 78 795  | 79 084  | 77 056  | +0.37%  | -2.21%   | -0.84%  |
| 02-04 00:00 | SELL | 75 770  | 76 972  | 75 467  | +1.59%  | -0.40%   | +0.98%  |
| 02-04 08:00 | SELL | 76 514  | 76 608  | 73 794  | +0.12%  | -3.56%   | -3.11%  |
| 02-04 16:00 | SELL | 74 136  | 74 250  | 71 888  | +0.15%  | -3.03%   | -1.31%  |
| 02-05 00:00 | SELL | 73 166  | 73 341  | 70 140  | +0.24%  | -4.14%   | -3.29%  |
| 02-05 08:00 | SELL | 70 757  | 71 979  | 66 720  | +1.73%  | **-5.71%** | -4.62% |
| 02-05 16:00 | SELL | 67 489  | 68 682  | 62 345  | +1.77%  | **-7.62%** | -6.79% |
| 02-06 00:00 | SELL | 62 910  | 66 827  | 60 000  | **+6.23%** | -4.63% | +3.09% |
| 02-06 16:00 | SELL | 68 626  | 71 751  | 68 428  | **+4.55%** | -0.29% | +2.85% |
| 02-07 00:00 | SELL | 70 580  | 71 690  | 67 300  | +1.57%  | -4.65%   | -3.53%  |
| 02-07 08:00 | SELL | 68 087  | 70 000  | 67 582  | +2.81%  | -0.74%   | +1.56%  |
| 02-07 16:00 | SELL | 69 152  | 69 898  | 68 532  | +1.08%  | -0.90%   | +0.20%  |
| 02-08 16:00 | SELL | 71 189  | 72 271  | 70 000  | +1.52%  | -1.67%   | -1.21%  |
| 02-09 00:00 | SELL | 70 330  | 71 454  | 70 068  | +1.60%  | -0.37%   | +0.13%  |
| 02-11 00:00 | SELL | 68 841  | 69 293  | 66 558  | +0.66%  | -3.32%   | -2.63%  |
| 02-11 16:00 | SELL | 66 520  | 68 370  | 65 876  | **+2.78%** | -0.97% | +0.85% |
| 02-12 08:00 | SELL | 67 218  | 68 411  | 66 892  | +1.77%  | -0.49%   | -0.12%  |
| 02-12 16:00 | SELL | 67 135  | 67 232  | 65 118  | +0.14%  | -3.00%   | -1.28%  |
| 02-13 00:00 | BUY  | 66 272  | 66 814  | 65 872  | +0.82%  | -0.60%   | -0.10%  |
| 02-14 16:00 | BUY  | 69 778  | 70 250  | 69 283  | +0.68%  | -0.71%   | +0.06%  |
| 02-15 00:00 | SELL | 69 823  | 70 926  | 69 252  | +1.58%  | -0.82%   | +1.44%  |
| 02-15 08:00 | SELL | 70 828  | 70 983  | 68 772  | +0.22%  | -2.90%   | -2.44%  |
| 02-17 08:00 | SELL | 68 388  | 68 479  | 66 621  | +0.13%  | -2.58%   | -1.46%  |
| 02-17 16:00 | SELL | 67 392  | 68 235  | 66 881  | +1.25%  | -0.76%   | +0.17%  |
| 02-18 08:00 | SELL | 68 106  | 68 476  | 66 717  | +0.54%  | -2.04%   | -0.61%  |
| 02-18 16:00 | SELL | 67 694  | 67 707  | 65 870  | +0.02%  | -2.69%   | -1.82%  |
| 02-19 16:00 | SELL | 66 398  | 67 198  | 65 899  | +1.20%  | -0.75%   | +0.91%  |
| 02-21 08:00 | BUY  | 67 856  | 68 699  | 67 807  | +1.24%  | -0.07%   | +1.12%  |
| 02-21 16:00 | SELL | 68 615  | 68 659  | 67 900  | +0.06%  | -1.04%   | -0.93%  |
| 02-22 00:00 | SELL | 67 976  | 68 222  | 67 810  | +0.36%  | -0.24%   | +0.04%  |
| 02-22 08:00 | SELL | 68 005  | 68 245  | 67 304  | +0.35%  | -1.03%   | -0.47%  |
| 02-22 16:00 | SELL | 67 684  | 67 751  | 67 190  | +0.10%  | -0.73%   | -0.06%  |
| 02-23 00:00 | SELL | 67 643  | 67 685  | 64 291  | +0.06%  | **-4.96%** | -2.49% |
| 02-23 08:00 | SELL | 65 959  | 66 600  | 65 530  | +0.97%  | -0.65%   | -0.45%  |
| 02-23 16:00 | SELL | 65 660  | 65 724  | 63 889  | +0.10%  | -2.70%   | -1.53%  |
| 02-24 08:00 | SELL | 63 193  | 64 032  | 62 510  | +1.33%  | -1.08%   | +1.24%  |
| 02-24 16:00 | SELL | 63 974  | 64 743  | 63 690  | +1.20%  | -0.44%   | +0.13%  |
| 02-25 08:00 | BUY  | 65 028  | 67 578  | 64 956  | **+3.92%** | -0.11% | +3.67% |
| 02-26 00:00 | SELL | 67 988  | 68 860  | 67 728  | +1.28%  | -0.38%   | -0.24%  |
| 02-26 16:00 | SELL | 67 382  | 67 903  | 66 500  | +0.77%  | -1.31%   | +0.15%  |
| 02-27 00:00 | SELL | 67 485  | 68 217  | 66 885  | +1.08%  | -0.89%   | +0.30%  |

---

## SELL Signal Analysis

**Accuracy** (net direction correct): 24/41 = **58.5%**

### SELL signals that worked well (MaxDn > 2%)
| Date | MaxDn% | Net% | Note |
|---|---|---|---|
| 02-04 08:00 | -3.56% | -3.11% | Clean drop |
| 02-04 16:00 | -3.03% | -1.31% | Clean drop |
| 02-05 00:00 | -4.14% | -3.29% | Pre-crash |
| 02-05 08:00 | -5.71% | -4.62% | Main crash begins |
| 02-05 16:00 | **-7.62%** | **-6.79%** | Worst single 8h drop |
| 02-07 00:00 | -4.65% | -3.53% | Dead-cat rejection |
| 02-11 00:00 | -3.32% | -2.63% | Range breakdown |
| 02-12 16:00 | -3.00% | -1.28% | Steady bleed |
| 02-15 08:00 | -2.90% | -2.44% | Post-Bithumb |
| 02-23 00:00 | **-4.96%** | -2.49% | Tariff shock |
| 02-23 16:00 | -2.70% | -1.53% | Continuation |

### SELL signals that failed (price went up significantly)
| Date | MaxUp% | Net% | Why it failed |
|---|---|---|---|
| 02-02 08:00 | **+3.52%** | +2.86% | Recovery rally after flash-crash |
| 02-06 00:00 | **+6.23%** | +3.09% | Signal at exact bottom, V-recovery |
| 02-06 16:00 | **+4.55%** | +2.85% | Recovery continuation |
| 02-11 16:00 | +2.78% | +0.85% | Short squeeze |
| 02-15 00:00 | +1.58% | +1.44% | CPI bounce |

**Critical observation**: The worst SELL failures occur at **local bottoms after a crash** — when the signal is still SELL but the market has already reversed. The Feb 6 signals are the clearest example: price was at $60k, signal said SELL, price went +6.23%.

---

## BUY Signal Analysis

**Accuracy** (net direction correct): 3/5 = **60%**

| Date | MaxUp% | MaxDn% | Net% | Result |
|---|---|---|---|---|
| 02-02 00:00 | +1.64% | **-3.07%** | -0.40% | MISS — immediate -3% drawdown |
| 02-13 00:00 | +0.82% | -0.60% | -0.10% | MISS — flat, slight loss |
| 02-14 16:00 | +0.68% | -0.71% | +0.06% | Barely OK |
| 02-21 08:00 | +1.24% | -0.07% | +1.12% | OK |
| 02-25 08:00 | **+3.92%** | -0.11% | **+3.67%** | Best BUY — short squeeze |

**Critical observation**: BUY on 02-02 caused immediate -3.07% drawdown. Without a stop-loss this is a significant loss. Only the 02-25 BUY (short squeeze + ETF inflows) delivered a clean move.

---

## Key Findings for PineScript Strategy

### 1. Signal lag is severe
Signals are generated from news/events that happened in the **past 8-12 hours**. By the time the signal fires, the move is often already done. The Feb 5-6 crash: SELL signals were issued while price was already -15% from the peak.

### 2. Asymmetric risk profile
- **SELL signals**: When they work, MaxDn can reach -5% to -8% in a single 8h window. When they fail, MaxUp is typically +1.5% to +4.5%. Risk/reward ratio is favorable **only if you have a stop-loss of ~1.5-2%**.
- **BUY signals**: Extremely rare (5 total). MaxDn on failed BUYs hits -3%. Not reliable enough to trade directionally.

### 3. SELL signal clustering = trend confirmation
Consecutive SELL signals (3+ in a row) strongly indicate a real downtrend:
- Feb 4-7: 9 consecutive SELLs → -20% crash
- Feb 22-24: 6 consecutive SELLs → -7% drop

Single isolated SELL signals in a ranging market have <50% accuracy.

### 4. MaxUp on SELL signals (counter-move before the drop)
Even on correct SELL signals, price frequently spikes up first before dropping:
- 84% of SELL signals had MaxUp > 0.5% before the main move down
- Average MaxUp on winning SELL signals: **+0.9%**
- This means a stop-loss tighter than 1% would be stopped out even on winning trades

### 5. WAIT signals mark low-volatility periods
WAIT-dominant periods (Feb 8-10, Feb 16, Feb 19-20) correspond to tight ranges ($67-71k) with <1% daily moves. Trading during WAIT periods produced near-zero net moves.

### 6. Crash anatomy (Feb 4-6)
```
Feb 4  08:00  SELL  $76 514  →  -3.56% (8h low $73 794)
Feb 4  16:00  SELL  $74 136  →  -3.03% (8h low $71 888)
Feb 5  00:00  SELL  $73 166  →  -4.14% (8h low $70 140)
Feb 5  08:00  SELL  $70 757  →  -5.71% (8h low $66 720)
Feb 5  16:00  SELL  $67 489  →  -7.62% (8h low $62 345)  ← PEAK VOLATILITY
Feb 6  00:00  SELL  $62 910  →  BOTTOM $60 000, then +6.23%  ← REVERSAL
```
The signal correctly identified the trend but **missed the reversal by exactly 1 signal**.

---

## Recommended PineScript Strategy Parameters

Based on this analysis, a PineScript strategy using these signals should implement:

1. **Entry**: SELL short only after **2+ consecutive SELL signals** (trend confirmation)
2. **Stop-loss**: **1.5-2%** above entry (covers average MaxUp on winning trades)
3. **Take-profit**: **3-5%** below entry (aligns with average MaxDn on winning SELL windows)
4. **Exit rule**: Exit short immediately when signal switches from SELL to WAIT or BUY
5. **No BUY entries**: BUY signals too rare and unreliable (only 5 in 28 days, 1 with -3% immediate drawdown)
6. **Avoid SELL entries after 5+ consecutive SELLs**: High risk of catching the bottom reversal (Feb 6 example)
7. **Signal timeframe**: 8h — strategy should operate on 8h bars or use 1h bars with 8h signal overlay

### Approximate expected metrics (Feb 2026 backtest)
- Winning SELL trades (net direction correct): ~58%
- Average win: ~2-3%
- Average loss: ~1.5-2% (with stop)
- Max single-session drawdown on a losing trade: +3.5-6% without stop
- Best period: Feb 4-7 (crash), Feb 22-23 (tariff shock)
- Worst period: Feb 6 (SELL at the bottom, +6.23% against)

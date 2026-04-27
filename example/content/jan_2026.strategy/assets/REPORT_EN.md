# How a Crypto Telegram Channel Extracts Money from Its Subscribers

> Analysis based on a full export of the Crypto Yoda Channel covering April 2025 – April 2026.  
> Total signals published: 416. Total results published: 191.  
> Raw data: `signals.jsonl`, `proof.jsonl`, `entry.jsonl`

---

## 1. The mechanism: short signals at range lows with mathematically guaranteed liquidation

The channel publishes trading signals in this format:

---

> **2026-01-06T10:16:16Z**
>
> ```
> SIGNAL #TRX/USDT
>
> Open SHORT in the zone $0.2898 – $0.2930 with 25x leverage.
>
> Take-profit targets:
> TP1: $0.2875
> TP2: $0.2864
> TP3: $0.2838
> TP4: $0.2809
> TP5: $0.2765
>
> STOP-LOSS: $0.3027
> ```

---

The math of this signal:

| Parameter | Value |
|---|---|
| Average entry price | $0.2914 |
| Stop-loss | $0.3027 |
| Spot risk | **+3.88%** |
| Target TP1 | $0.2875 (−1.34%) |
| Risk/Reward to TP1 | **0.345 : 1** |
| Risk at 25x leverage | **96.9% of deposit** |

To break even on this signal, price must drop 1.34%. If price rises 3.88% — the entire deposit is liquidated. Placed at the bottom of a trading range with thin liquidity above, this is not risk management. It is a programmed wipeout.

### This is not a one-off — it is a system

Across all 65 parsed SHORT signals in the dataset:

| Metric | Value |
|---|---|
| Average spot risk | **4.24%** |
| Average R:R to TP1 | **0.375 : 1** |
| Average risk at 25x leverage | **106% of deposit** |
| Minimum R:R | 0.333 |
| Maximum R:R | 0.833 |

Not a single one of the 65 signals has R:R above 1:1. An average of 0.375 means the expected value is negative regardless of how accurate the entry timing is.

Worst signals by R:R:

| Date (UTC) | Ticker | Spot risk | R:R | Risk at 25x |
|---|---|---|---|---|
| 2026-01-28T14:18:01Z | POL | 3.88% | 0.333 | 96.9% |
| 2025-12-15T13:05:04Z | SOL | 3.87% | 0.340 | 96.8% |
| 2026-03-04T08:40:41Z | POL | 3.84% | 0.342 | 96.0% |
| 2026-03-02T14:20:28Z | POL | 3.89% | 0.342 | 97.1% |
| 2026-01-09T14:10:57Z | NEAR | 3.84% | 0.344 | 96.0% |

---

## 2. Selective result reporting

After SHORT subscribers get stopped out, the channel only publishes outcome posts for winning trades.

### Coverage by direction

| Direction | Signals sent | Results published | Coverage |
|---|---|---|---|
| LONG | 226 | 113 | **50.0%** |
| SHORT | 188 | 70 | **37.2%** |

Only 3–4 out of every 10 short signals get a result post. For longs, every second one does.

Within a 5-day window after each signal:

| Direction | With a published result |
|---|---|
| LONG | 124 / 226 (**54.9%**) |
| SHORT | 29 / 65 (**44.6%**) |

### The published SHORT profit is anomalously high — and that proves cherry-picking

If SHORTs are only reported when they win, while LONGs are reported far more consistently, the average published profit for SHORTs should be inflated. It is:

| Metric | LONG | SHORT | Delta |
|---|---|---|---|
| Results published | 113 | 70 | — |
| Mean profit | 51.85% | **55.09%** | +3.24% |
| Median profit | 47.92% | **53.51%** | +5.59% |
| Avg take-profit targets hit | 2.93 | **3.17** | +0.24 |
| All targets hit | 20.4% | **35.7%** | +15.3% |

Profit distribution:

| Range | LONG | SHORT |
|---|---|---|
| 0–20% | 5 | 1 |
| 20–40% | 43 | 24 |
| 40–60% | 33 | 19 |
| **60–80%** | 18 | **22** |
| 80–100% | 6 | 1 |
| 100%+ | 8 | 3 |

SHORT results are heavily concentrated in the 60–80% bucket: 22 cases versus 18 for LONGs, despite LONGs having 1.6× more results published. This is the direct signature of cherry-picking: only trades where price moved a long distance get reported.

The per-ticker breakdown makes it undeniable:

| Ticker | LONG avg% | SHORT avg% | Delta |
|---|---|---|---|
| FARTCOIN | 14.3% | **116.6%** | +102.3% |
| ETH | 54.3% | **113.3%** | +59.0% |
| ADA | 45.1% | **57.3%** | +12.2% |
| SOL | 45.8% | **55.5%** | +9.7% |

FARTCOIN has 4 published SHORT results with a mean profit of 116.6%, while its single LONG result clocks in at 14.3%. This does not mean shorts on FARTCOIN performed better — it means only the extreme outliers were reported.

### What is shown and what is hidden

Several tickers have published LONG results but **zero published SHORT results**:

`DOGE`, `IOTA`, `LTC`, `PUMP`, `RIVER`, `TAO`, `TRUMP`, `XAUT`, `ZEC`

BTC has 1 published SHORT result at **7.6% profit** — the lowest of all tickers — against 9 LONG results averaging 43.4%.

### Example: back-to-back signal pair

> **2026-01-13T11:05:18Z** — SHORT TRX, R:R 0.348, 96.8% deposit at risk
> ```
> SIGNAL #TRX/USDT
> Open SHORT in zone $0.2991 – $0.3024 with 25x leverage.
> STOP-LOSS: $0.3124
> ```

> **2026-01-15T12:10:39Z** — LONG TRX, result published ✅
> ```
> SIGNAL #TRX/USDT
> Open LONG in zone $0.3027 – $0.3061 with 25x leverage.
> ```

The short was opened at the bottom of the range ($0.2991–$0.3024). Stop-loss at $0.3124. Two days later a long is published from $0.3027 — precisely where the short subscribers' stops had already triggered. The long result gets published. The short result does not.

---

## 3. The SHORT → LONG pattern: 17 documented cases

Signal pair analysis identified a recurring pattern: a SHORT signal is published near range lows; after the stop-loss level is reached, a LONG signal on the same ticker appears with an entry zone close to the short's stop price. All 17 pairs are stored in `proof.jsonl`.

Selection criteria: a LONG signal on the same ticker appears within 7 days of the SHORT, and the midpoint of the long entry zone is within 3% of the short's stop-loss level.

### All 17 pairs

| SHORT date (UTC) | Ticker | Short SL | Long entry | SL/entry gap | Hours later | Risk at 25x |
|---|---|---|---|---|---|---|
| 2025-12-25T03:01Z | NEAR | $1.560 | $1.572–$1.589 | 1.31% | 100.0 | 95.7% |
| 2025-12-25T14:06Z | SOL | $127.00 | $122.9–$124.2 | 2.72% | 95.0 | 97.1% |
| 2025-12-26T18:09Z | TRX | $0.2888 | $0.2811–$0.2842 | 2.13% | 62.9 | 96.2% |
| 2025-12-29T06:51Z | HYPE | $26.36 | $25.52–$25.80 | 2.66% | 30.3 | 96.5% |
| 2026-01-09T14:06Z | TRX | $0.3068 | $0.3027–$0.3061 | **0.78%** | 142.1 | 96.0% |
| 2026-01-12T13:08Z | TRX | $0.3099 | $0.3027–$0.3061 | 1.77% | 71.0 | 95.9% |
| 2026-01-13T11:05Z | TRX | $0.3124 | $0.3027–$0.3061 | 2.56% | 49.1 | 96.8% |
| 2026-02-19T22:59Z | HYPE | $30.31 | $29.34–$29.67 | 2.66% | 15.5 | 96.8% |
| 2026-02-20T18:25Z | POL | $0.1100 | $0.1107–$0.1119 | 1.18% | 96.7 | 95.6% |
| 2026-02-24T20:01Z | HYPE | $28.30 | $28.08–$28.39 | **0.23%** | 19.2 | 96.3% |
| 2026-02-26T12:06Z | POL | $0.1143 | $0.1148–$0.1161 | 1.01% | 22.8 | 95.4% |
| 2026-02-27T12:08Z | SOL | $86.94 | $88.15–$89.13 | 1.96% | 75.9 | 95.8% |
| 2026-03-19T16:05Z | TRX | $0.3120 | $0.3022–$0.3055 | 2.61% | 20.3 | 96.1% |
| 2026-03-23T14:03Z | HYPE | $40.48 | $39.11–$39.54 | 2.85% | 28.5 | 96.5% |
| 2026-03-24T12:34Z | TRX | $0.3229 | $0.3151–$0.3186 | 1.87% | 147.7 | 95.7% |
| 2026-04-09T16:03Z | PENGU | $0.006801 | $0.006859–$0.006935 | 1.41% | 122.0 | 96.2% |
| 2026-04-13T02:01Z | HYPE | $43.56 | $43.00–$44.60 | **0.55%** | 34.0 | 95.9% |

### Three most telling cases

---

**Case 1 — HYPE, February 2026 (gap 0.23%, 19 hours)**

> **2026-02-24T20:01:15Z** — SHORT HYPE
> ```
> SIGNAL #HYPE/USDT
>
> Open SHORT in zone $27.1 – $27.4 with 25x leverage.
>
> Targets:
> TP1: $26.88
> TP2: $26.77
> TP3: $26.54
> TP4: $26.26
> TP5: $25.85
>
> STOP-LOSS: $28.30
> ```
> R:R = 0.352 | Risk at 25x = **96.3% of deposit**

> **2026-02-25T15:10:54Z** — LONG HYPE (19 hours later)
> ```
> SIGNAL #HYPE/USDT
>
> Open LONG in zone $28.08 – $28.39 with 25x leverage.
>
> Targets:
> TP1: $28.62
> TP2: $28.73
> TP3: $28.98
> TP4: $29.26
> TP5: $29.69
>
> STOP-LOSS: $27.15
> ```
> Long entry midpoint ($28.24) is **0.23% away** from the short stop-loss ($28.30).

The long's stop-loss ($27.15) is set below the short's entry zone ($27.1–$27.4). The channel is implicitly acknowledging that short subscribers are already out and is opening the opposite position from their liquidation level. The short result is never published. The long result is.

---

**Case 2 — TRX, January 2026 (three consecutive shorts, one long)**

Three SHORT signals on TRX are published between January 9–13, all targeting the same stop level around $0.31. Then one LONG:

| Date (UTC) | Direction | Entry zone | Stop-loss | Result published |
|---|---|---|---|---|
| 2026-01-09T14:06Z | SHORT | $0.2938–$0.2971 | $0.3068 | No |
| 2026-01-12T13:08Z | SHORT | $0.2968–$0.3001 | $0.3099 | No |
| 2026-01-13T11:05Z | SHORT | $0.2991–$0.3024 | $0.3124 | No |
| 2026-01-15T12:10Z | **LONG** | **$0.3027–$0.3061** | $0.2927 | **Yes ✅** |

Three sequential shorts are stopped out as price climbs. The long is opened exactly where price arrived after all three stop-losses triggered. None of the short results are published. The long result is.

---

**Case 3 — HYPE, April 2026 (gap 0.55%, 34 hours)**

> **2026-04-13T02:01:31Z** — SHORT HYPE
> ```
> SIGNAL #HYPE/USDT
>
> Open SHORT in zone $41.72 – $42.18 with 25x leverage.
>
> Targets:
> TP1: $41.38
> TP2: $41.21
> TP3: $40.84
> TP4: $40.43
> TP5: $39.79
>
> STOP-LOSS: $43.56
> ```
> R:R = 0.354 | Risk at 25x = **95.9% of deposit**

> **2026-04-14T12:02:04Z** — LONG HYPE (34 hours later)
> ```
> SIGNAL #HYPE/USDT
>
> Signal risk: 6/10
>
> Open LONG in zone $43.00 – $44.60 — 5% of deposit, 10x leverage.
>
> Targets:
> TP1: $46
> TP2: $48
> TP3: $50
> TP4: $52
> TP5: $54
>
> STOP-LOSS: $39
> ```
> Long entry midpoint ($43.80) is **above** the short stop-loss ($43.56) by 0.55% — the long is opened only after short subscribers' stops have certainly been hit.

Note the `Signal risk: 6/10` label in the long — the channel has started adding risk ratings and reduced leverage to 10x for longs. The pattern is unchanged: the 25x short is wiped, the long is published from the same level.

---

## 4. Why this works as a business model

The scheme does not require the channel to move markets — its subscriber count is too small for that. It operates through three compounding mechanisms:

**Survivorship bias.** Subscribers see only profitable trades in their feed. Losing shorts disappear without a report. This creates the illusion that the channel has a high hit rate.

**Exchange referral commission.** Every subscriber liquidation generates a fee for the exchange. The channel operator receives a percentage of that fee as a referral partner — the referral link appears in every single signal post:
> `Trade here | Join VIP channel`

**VIP funnel.** A subscriber loses money on a short, sees that longs are working, concludes they "entered wrong," and pays for VIP access to get "more precise" signals. The cycle repeats.

---

## 5. Summary

| Finding | Data |
|---|---|
| Average R:R of SHORT signals | 0.375 — negative expected value at any win rate |
| Average risk per SHORT trade at 25x | 106% of deposit |
| SHORT signals without a result post | 44.6% vs 54.9% for LONGs |
| LONGs reported 1.35× more often | despite similar signal counts |
| Mean profit of published SHORTs | **55.09%** — higher than LONGs (51.85%) |
| SHORTs in the 60–80% profit bucket | 22 cases vs 18 for LONGs in a half-sized sample |
| SHORT → LONG pattern documented | 17 pairs, SL/entry gap ranging from 0.23% to 2.85% |

The channel systematically issues SHORT signals with a mathematically negative expected value at 25x leverage, suppresses their outcomes, and publicly reports only LONG results — constructing a false picture of strategy performance for its audience.

<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📊 BTCUSDT March 2026 — DCA Ladder Backtest

> Fixed-signal ladder strategy that opens a SHORT on every new pending signal, then dollar-cost-averages up to 10 steps while the position runs, closing at 0.5% portfolio profit.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

Each signal opens a $100 SHORT via `Position.moonbag` (25% hard stop). While the position is active, `commitAverageBuy` fires whenever price moves outside a ±1–5% band around the last entry, adding another $100 rung up to 10 rungs total. The position closes as soon as portfolio PNL crosses +0.5%.

**Strategy:** `mar_2026_strategy` | **Exchange:** `ccxt-exchange` | **Frame:** `mar_2026_frame`

## 📉 Price Context (March 2026)

| Metric | Value |
|---|---|
| Frame open | ~$66,974 (Mar 1) |
| Frame close | ~$66,750 (Mar 31) |
| Period high | ~$75,253 |
| Period low | ~$65,132 |
| Net move | **−0.3%** |

March 2026 was a volatile, mean-reverting month for BTC. Price opened in the mid-$60k range, spiked to ~$75,253 mid-month (triggered by macro sentiment and tariff news), then sold off aggressively back to ~$65,000 by late March. The overall net move was nearly flat (−0.3%), masking intra-month swings of ±15%. This is a **SHORT-biased, range-bound / downtrend** regime — ideal conditions for a short DCA ladder.

## ✨ Performance Summary

### Without DCA (single-entry, before.json)

| Metric | Value |
|---|---|
| Total trades | 64 |
| Entries per trade | 1 (fixed) |
| Total deployed capital | $6,400 |
| Net PNL ($) | **−$26.36** |
| Net PNL (%) | **−0.41%** |
| Win rate | 68.8% (44 / 64) |
| Avg PNL per trade | −$0.41 |
| Best trade | +$1.08 (Mar 26, +1.08%) |
| Worst trade | −$7.43 (Mar 3, −7.43%) |
| Worst drawdown (%) | **−7.35%** (single entry) |
| Worst drawdown ($) | **−$7.35** |

### With DCA (ladder up to 10 entries)

| Metric | Value |
|---|---|
| Total trades | 21 |
| Avg entries per trade | 3.1 |
| Max entries in one trade | 10 |
| Total deployed capital | $6,600 |
| Net PNL ($) | **+$37.83** |
| Net PNL (%) | **+37.83% on capital deployed** |
| Win rate | 95.2% (20 / 21) |
| Avg PNL per trade | +$1.80 |
| Best trade | +$6.36 (Mar 2, 8 entries, +0.79% blended) |
| Worst trade | −$3.24 (Mar 29, 5 entries, −0.65%) |
| Worst drawdown (%) | **−10.49%** (blended across entries) |
| Worst drawdown ($) | **−$104.93** |

## 📊 DCA vs No-DCA Comparison

| Metric | No DCA | With DCA | Delta |
|---|---|---|---|
| Trades | 64 | 21 | −43 |
| Total capital deployed ($) | $6,400 | $6,600 | +$200 |
| Net PNL ($) | −$26.36 | +$37.83 | **+$64.19** |
| Net PNL on capital (%) | −0.41% avg/trade | +0.61% avg/trade | **+1.02 pp** |
| Worst drawdown (% per-entry) | −7.35% | −10.49% | +3.14 pp |
| Worst drawdown ($) | −$7.35 | −$104.93 | +$97.58 in fiat |

The DCA ladder **flips a losing month into a profitable one** (+$37.83 vs −$26.36) by averaging up into rising price and consolidating 64 single-entry trades into 21 multi-entry positions. The trade-off: because March included sustained upside spikes before reverting, the ladder deployed up to 10 rungs in two positions — resulting in a maximum fiat drawdown of **−$104.93** on a single position.

## 📋 Trade Log — Without DCA

| # | Open date | Close date | Open price | Close price | PNL% | PNL$ | Max DD% | Max DD$ |
|---|---|---|---|---|---|---|---|---|
| 1 | Mar 1 | Mar 1 | $66,974 | $66,316 | +0.59% | +$0.59 | −0.46% | −$0.46 |
| 2 | Mar 1 | Mar 1 | $66,316 | $65,620 | +0.65% | +$0.65 | −3.07% | −$3.07 |
| 3 | Mar 1 | Mar 2 | $65,620 | $68,767 | −5.21% | −$5.21 | −7.03% | −$7.03 |
| 4 | Mar 2 | Mar 3 | $68,767 | $68,116 | +0.55% | +$0.55 | −1.44% | −$1.44 |
| 5 | Mar 3 | Mar 3 | $68,116 | $67,410 | +0.64% | +$0.64 | −0.98% | −$0.98 |
| 6 | Mar 3 | Mar 3 | $67,410 | $66,687 | +0.68% | +$0.68 | 0.00% | $0.00 |
| 7 | Mar 3 | Mar 4 | $66,687 | $71,358 | −7.43% | −$7.43 | −7.35% | −$7.35 |
| 8 | Mar 4 | Mar 4 | $71,358 | $70,693 | +0.53% | +$0.53 | −1.04% | −$1.04 |
| 9 | Mar 4 | Mar 5 | $70,693 | $72,809 | −3.40% | −$3.40 | −4.95% | −$4.95 |
| 10 | Mar 5 | Mar 5 | $72,809 | $72,091 | +0.59% | +$0.59 | −0.67% | −$0.67 |
| 11 | Mar 5 | Mar 5 | $72,091 | $71,318 | +0.67% | +$0.67 | −1.16% | −$1.16 |
| 12 | Mar 5 | Mar 6 | $71,318 | $70,516 | +0.73% | +$0.73 | −0.84% | −$0.84 |
| 13 | Mar 6 | Mar 6 | $70,516 | $69,863 | +0.53% | +$0.53 | −1.55% | −$1.55 |
| 14 | Mar 6 | Mar 6 | $69,863 | $69,105 | +0.69% | +$0.69 | −0.90% | −$0.90 |
| 15 | Mar 6 | Mar 6 | $69,105 | $68,428 | +0.58% | +$0.58 | −0.43% | −$0.43 |
| 16 | Mar 6 | Mar 6 | $68,428 | $67,833 | +0.47% | +$0.47 | −1.17% | −$1.17 |
| 17 | Mar 6 | Mar 7 | $67,833 | $67,880 | −0.47% | −$0.47 | −1.35% | −$1.35 |
| 18 | Mar 7 | Mar 7 | $67,880 | $67,242 | +0.54% | +$0.54 | −0.40% | −$0.40 |
| 19 | Mar 7 | Mar 8 | $67,242 | $66,652 | +0.48% | +$0.48 | −0.73% | −$0.73 |
| 20 | Mar 8 | Mar 8 | $66,652 | $66,063 | +0.49% | +$0.49 | −2.65% | −$2.65 |
| 21 | Mar 8 | Mar 9 | $66,063 | $68,754 | −4.49% | −$4.49 | −5.42% | −$5.42 |
| 22 | Mar 9 | Mar 10 | $68,754 | $69,541 | −1.55% | −$1.55 | −4.51% | −$4.51 |
| 23 | Mar 10 | Mar 11 | $69,541 | $70,802 | −2.22% | −$2.22 | −2.87% | −$2.87 |
| 24 | Mar 11 | Mar 12 | $70,802 | $70,034 | +0.69% | +$0.69 | −0.43% | −$0.43 |
| 25 | Mar 12 | Mar 12 | $70,034 | $69,306 | +0.64% | +$0.64 | 0.00% | $0.00 |
| 26 | Mar 12 | Mar 13 | $69,306 | $71,151 | −3.07% | −$3.07 | −4.17% | −$4.17 |
| 27 | Mar 13 | Mar 14 | $71,151 | $70,829 | +0.05% | +$0.05 | −4.18% | −$4.18 |
| 28 | Mar 14 | Mar 15 | $70,829 | $71,425 | −1.24% | −$1.24 | −1.42% | −$1.42 |
| 29 | Mar 15 | Mar 16 | $71,425 | $72,554 | −1.99% | −$1.99 | −2.66% | −$2.66 |
| 30 | Mar 16 | Mar 17 | $72,554 | $75,253 | −4.13% | −$4.13 | −5.06% | −$5.06 |
| 31 | Mar 17 | Mar 17 | $75,253 | $74,488 | +0.62% | +$0.62 | −0.41% | −$0.41 |
| 32 | Mar 17 | Mar 17 | $74,488 | $73,706 | +0.65% | +$0.65 | −0.62% | −$0.62 |
| 33 | Mar 17 | Mar 18 | $73,706 | $74,116 | −0.96% | −$0.96 | −1.86% | −$1.86 |
| 34 | Mar 18 | Mar 18 | $74,116 | $73,330 | +0.66% | +$0.66 | −0.58% | −$0.58 |
| 35 | Mar 18 | Mar 18 | $73,330 | $72,583 | +0.62% | +$0.62 | 0.00% | $0.00 |
| 36 | Mar 18 | Mar 18 | $72,583 | $71,915 | +0.52% | +$0.52 | 0.00% | $0.00 |
| 37 | Mar 18 | Mar 18 | $71,915 | $71,133 | +0.69% | +$0.69 | −0.47% | −$0.47 |
| 38 | Mar 18 | Mar 19 | $71,133 | $70,442 | +0.57% | +$0.57 | −1.50% | −$1.50 |
| 39 | Mar 19 | Mar 19 | $70,442 | $69,670 | +0.70% | +$0.70 | 0.00% | $0.00 |
| 40 | Mar 19 | Mar 19 | $69,670 | $68,923 | +0.67% | +$0.67 | −1.61% | −$1.61 |
| 41 | Mar 19 | Mar 20 | $68,923 | $69,905 | −1.83% | −$1.83 | −3.81% | −$3.81 |
| 42 | Mar 20 | Mar 21 | $69,905 | $70,635 | −1.45% | −$1.45 | −2.01% | −$2.01 |
| 43 | Mar 21 | Mar 21 | $70,635 | $69,776 | +0.82% | +$0.82 | −0.45% | −$0.45 |
| 44 | Mar 21 | Mar 21 | $69,776 | $68,880 | +0.89% | +$0.89 | 0.00% | $0.00 |
| 45 | Mar 21 | Mar 22 | $68,880 | $68,231 | +0.54% | +$0.54 | −1.28% | −$1.28 |
| 46 | Mar 22 | Mar 22 | $68,231 | $67,500 | +0.67% | +$0.67 | −1.42% | −$1.42 |
| 47 | Mar 22 | Mar 23 | $67,500 | $70,864 | −5.40% | −$5.40 | −6.59% | −$6.59 |
| 48 | Mar 23 | Mar 24 | $70,864 | $70,187 | +0.56% | +$0.56 | −0.60% | −$0.60 |
| 49 | Mar 24 | Mar 24 | $70,187 | $69,464 | +0.63% | +$0.63 | −2.02% | −$2.02 |
| 50 | Mar 24 | Mar 25 | $69,464 | $71,548 | −3.41% | −$3.41 | −3.99% | −$3.99 |
| 51 | Mar 25 | Mar 25 | $71,548 | $70,887 | +0.53% | +$0.53 | 0.00% | $0.00 |
| 52 | Mar 25 | Mar 26 | $70,887 | $70,188 | +0.59% | +$0.59 | −1.17% | −$1.17 |
| 53 | Mar 26 | Mar 26 | $70,188 | $69,511 | +0.57% | +$0.57 | 0.00% | $0.00 |
| 54 | Mar 26 | Mar 26 | $69,511 | $68,890 | +0.49% | +$0.49 | −0.80% | −$0.80 |
| 55 | Mar 26 | Mar 26 | $68,890 | $68,199 | +0.61% | +$0.61 | −0.82% | −$0.82 |
| 56 | Mar 26 | Mar 27 | $68,199 | $67,195 | +1.08% | +$1.08 | −1.92% | −$1.92 |
| 57 | Mar 27 | Mar 27 | $67,195 | $66,548 | +0.57% | +$0.57 | 0.00% | $0.00 |
| 58 | Mar 27 | Mar 27 | $66,548 | $65,874 | +0.61% | +$0.61 | −0.78% | −$0.78 |
| 59 | Mar 27 | Mar 28 | $65,874 | $66,817 | −1.84% | −$1.84 | −2.13% | −$2.13 |
| 60 | Mar 28 | Mar 29 | $66,817 | $66,567 | −0.02% | −$0.02 | −0.98% | −$0.98 |
| 61 | Mar 29 | Mar 29 | $66,567 | $65,894 | +0.61% | +$0.61 | −0.64% | −$0.64 |
| 62 | Mar 29 | Mar 29 | $65,894 | $65,132 | +0.76% | +$0.76 | 0.00% | $0.00 |
| 63 | Mar 29 | Mar 30 | $65,132 | $66,728 | −2.86% | −$2.86 | −4.92% | −$4.92 |
| 64 | Mar 30 | Mar 31 | $66,728 | $66,751 | −0.43% | −$0.43 | −0.48% | −$0.48 |
| **Σ** | | | | | | **−$26.36** | **−7.35%** | **−$7.35** |

## 📋 Trade Log — With DCA

| # | Open date | Close date | Entries | Blended open | Close price | PNL% (blended) | PNL$ | Max DD% | Max DD$ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Mar 1 | Mar 1 | 1 | $66,974 | $66,316 | +0.59% | +$0.59 | −0.46% | −$0.46 |
| 2 | Mar 1 | Mar 1 | 3 | $66,901 | $66,306 | +0.49% | +$1.47 | −2.17% | −$6.52 |
| 3 | Mar 1 | Mar 1 | 2 | $66,604 | $66,118 | +0.33% | +$0.66 | −1.31% | −$2.62 |
| 4 | Mar 1 | Mar 1 | 1 | $66,118 | $65,477 | +0.57% | +$0.57 | −1.01% | −$1.01 |
| 5 | Mar 1 | Mar 2 | 3 | $66,108 | $65,430 | +0.63% | +$1.88 | −1.68% | −$5.04 |
| 6 | Mar 2 | Mar 3 | 8 | $67,595 | $66,790 | +0.79% | +$6.36 | −3.90% | −$31.22 |
| 7 | Mar 3 | Mar 3 | 2 | $67,114 | $66,392 | +0.68% | +$1.36 | −1.38% | −$2.76 |
| 8 | Mar 3 | Mar 6 | 10 | $69,234 | $68,568 | +0.56% | +$5.64 | −7.16% | −$71.59 |
| 9 | Mar 6 | Mar 6 | 1 | $68,568 | $67,867 | +0.63% | +$0.63 | −0.97% | −$0.97 |
| 10 | Mar 6 | Mar 7 | 1 | $67,867 | $67,240 | +0.53% | +$0.53 | −1.30% | −$1.30 |
| 11 | Mar 7 | Mar 8 | 1 | $67,240 | $66,652 | +0.48% | +$0.48 | −0.73% | −$0.73 |
| 12 | Mar 8 | Mar 8 | 3 | $67,302 | $66,115 | +1.37% | +$4.10 | −1.66% | −$4.99 |
| 13 | Mar 8 | Mar 22 | 10 | $68,981 | $68,316 | +0.57% | +$5.66 | −10.49% | −$104.93 |
| 14 | Mar 22 | Mar 22 | 1 | $68,316 | $67,512 | +0.78% | +$0.78 | −1.30% | −$1.30 |
| 15 | Mar 22 | Mar 26 | 7 | $69,406 | $68,739 | +0.56% | +$3.94 | −4.08% | −$28.54 |
| 16 | Mar 26 | Mar 27 | 1 | $68,739 | $67,940 | +0.77% | +$0.77 | −1.12% | −$1.12 |
| 17 | Mar 27 | Mar 27 | 1 | $67,940 | $67,172 | +0.73% | +$0.73 | −0.47% | −$0.47 |
| 18 | Mar 27 | Mar 27 | 1 | $67,172 | $66,536 | +0.55% | +$0.55 | 0.00% | $0.00 |
| 19 | Mar 27 | Mar 27 | 1 | $66,536 | $65,860 | +0.62% | +$0.62 | −0.80% | −$0.80 |
| 20 | Mar 27 | Mar 29 | 3 | $66,495 | $65,400 | +1.25% | +$3.76 | −1.47% | −$4.41 |
| 21 | Mar 29 | Mar 31 | 5 | $66,586 | $66,751 | −0.65% | −$3.24 | −2.64% | −$13.18 |
| **Σ** | | | **66** | | | | **+$37.83** | **−10.49%** | **−$104.93** |

## ⚠️ Risk Analysis

### Market regime

March 2026 was a **high-volatility, directionless month** for BTC shorts. Intra-week spikes of 5–10% (Mar 3–4, Mar 8–9, Mar 22–23) punished single-entry short positions repeatedly. The DCA ladder absorbed these spikes by averaging up into the move, reducing blended cost basis and recovering when price reverted to the mean.

### Drawdown by percentage (per-position)

DCA **lowers** the percentage drawdown on most positions by spreading entry cost across multiple rungs:

- No DCA worst: **−7.35%** (Mar 3, single entry into a spike from $66,687 to $71,358)
- DCA worst: **−10.49%** (Mar 8–22, 10-rung position — price ran to $75,921 before reversing)

The worst-case DCA drawdown is higher in percentage because a full 10-rung position stayed open for 14 days through a macro-driven spike to $75,921.

### Drawdown in fiat (absolute dollar loss)

DCA **dramatically increases** the absolute dollar at risk because more capital is deployed per position:

- No DCA worst: **−$7.35** (1 × $100 entry)
- DCA worst: **−$104.93** (10 × $100 entries = $1,000 deployed in one position)

### Summary

| Risk metric | No DCA | With DCA |
|---|---|---|
| Max drawdown per position (%) | −7.35% | −10.49% |
| Max drawdown per position ($) | −$7.35 | −$104.93 |
| Capital at risk (worst position) | $100 | $1,000 |
| Hard stop distance | 25% | 25% |
| Max theoretical loss (worst, 10 rungs) | −$250 | −$2,500 |

In a trending market (March 2026 spike to $75k), the DCA ladder absorbs the spike at the cost of heavy fiat exposure. The strategy recovered because BTC ultimately reverted — but a non-reverting trend hitting the 25% hard stop with all 10 rungs filled would produce a **−$2,500 loss** on a single position.

## 🚀 How to Run

```bash
# With DCA ladder (current strategy)
npm start -- --backtest --symbol BTCUSDT \
  --strategy mar_2026_strategy \
  --exchange ccxt-exchange \
  --frame mar_2026_frame \
  ./content/mar_2026.strategy/mar_2026.strategy.ts

# Without DCA (single-entry variant)
npm start -- --backtest --symbol BTCUSDT \
  --strategy mar_2026_strategy \
  --exchange ccxt-exchange \
  --frame mar_2026_frame \
  ./content/mar_2026.strategy/mar_2026.test.ts
```

Add `--ui` to open the web dashboard at `http://localhost:60050`:

```bash
npm start -- --backtest --symbol BTCUSDT --ui \
  ./content/mar_2026.strategy/mar_2026.strategy.ts
```

## 🌍 Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
# Telegram notifications (optional)
CC_TELEGRAM_TOKEN=your_bot_token_here
CC_TELEGRAM_CHANNEL=-100123456789

# Web UI server (optional, defaults shown)
CC_WWWROOT_HOST=0.0.0.0
CC_WWWROOT_PORT=60050
```

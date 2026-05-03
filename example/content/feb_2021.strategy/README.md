<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📊 DOTUSDT February 2021 — Python EMA Crossover Strategy

> Python-based (WASI) strategy that uses EMA(9) and EMA(21) crossover signals executed via WebAssembly. Trades trigger when fast EMA crosses slow EMA, confirmed by 4h range midpoint.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

Each signal opens a $100 bracket position (±2% TP/SL) via `Position.bracket`. The Python indicator (`strategy.py`) runs on 8h candles, cached per 8h via `Cache.fn`. A signal fires based on EMA crossover: if EMA(9) > EMA(21), open LONG; otherwise SELL.

**Strategy:** `feb_2021_strategy` | **Exchange:** `ccxt-exchange` | **Frame:** `feb_2021_frame`

## 📉 Price Context (February 2021)

| Metric | Value |
|---|---|
| Frame open | ~$31.06 (Feb 8) |
| Frame close | ~$31.16 (Feb 19) |
| Period high | ~$32.52 |
| Period low | ~$19.39 |
| Net move | **+67.7%** (low to high) |

## ✨ Performance Summary

| Metric | Value |
|---|---|
| Total trades | 33 |
| Longs / Shorts | 33 / 0 |
| Total deployed capital | $3,300 |
| Net PNL ($) | **+$5.52** |
| Net PNL (%) | **+5.52%** avg per trade |
| Win rate | 63.6% (21 / 33) |
| Avg PNL per trade | +$0.17 |
| Best trade | +$1.59 (Feb 11, LONG, +1.59%) |
| Worst trade | −$2.39 (Feb 11, LONG, −2.39%) |
| Worst drawdown (%) | **−2.39%** |
| Worst drawdown ($) | **−$2.39** |
| Sharpe ratio | **0.09** |
| Avg hold time | ~141 min (~2h) |
| Max hold time | 480 min (~8h) |

## 📋 Trade Log

| # | Dir | Open date | Close date | Hold | Open price | Close price | PNL% | PNL$ | Max DD% | Max DD$ |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | LONG | Feb 18 | Feb 19 | 480 min | $31.06 | $31.16 | −0.07% | −$0.07 | −1.54% | −$1.54 |
| 2 | LONG | Feb 18 | Feb 18 | 213 min | $31.65 | $31.01 | −2.39% | −$2.39 | −2.23% | −$2.23 |
| 3 | LONG | Feb 18 | Feb 18 | 480 min | $32.00 | $31.65 | −1.49% | −$1.49 | −2.00% | −$2.00 |
| 4 | LONG | Feb 17 | Feb 17 | 91 min | $30.83 | $31.44 | +1.59% | +$1.59 | −1.16% | −$1.16 |
| 5 | LONG | Feb 17 | Feb 17 | 480 min | $30.62 | $30.83 | +0.29% | +$0.29 | −1.62% | −$1.62 |
| 6 | LONG | Feb 17 | Feb 17 | 51 min | $30.10 | $30.71 | +1.59% | +$1.59 | −0.89% | −$0.89 |
| 7 | LONG | Feb 16 | Feb 17 | 480 min | $29.85 | $30.10 | +0.44% | +$0.44 | −1.65% | −$1.65 |
| 8 | LONG | Feb 16 | Feb 16 | 25 min | $28.83 | $29.40 | +1.59% | +$1.59 | −0.51% | −$0.51 |
| 9 | LONG | Feb 16 | Feb 16 | 12 min | $27.76 | $27.20 | −2.39% | −$2.39 | −2.28% | −$2.28 |
| 10 | LONG | Feb 15 | Feb 15 | 19 min | $29.25 | $28.67 | −2.39% | −$2.39 | −2.39% | −$2.39 |
| 11 | LONG | Feb 15 | Feb 15 | 42 min | $26.26 | $26.78 | +1.59% | +$1.59 | −1.00% | −$1.00 |
| 12 | LONG | Feb 15 | Feb 15 | 45 min | $26.98 | $27.52 | +1.59% | +$1.59 | −0.40% | −$0.40 |
| 13 | LONG | Feb 14 | Feb 14 | 31 min | $26.76 | $27.29 | +1.59% | +$1.59 | −1.28% | −$1.28 |
| 14 | LONG | Feb 14 | Feb 14 | 352 min | $28.26 | $27.69 | −2.39% | −$2.39 | −2.28% | −$2.28 |
| 15 | LONG | Feb 14 | Feb 14 | 18 min | $27.97 | $28.52 | +1.59% | +$1.59 | 0.00% | $0.00 |
| **Σ** | | | | | | | | **+$5.52** | **−2.39%** | **−$50.50** |

## 🚀 How to Run

```bash
npm start -- --backtest --symbol DOTUSDT \
  --strategy feb_2021_strategy \
  --exchange ccxt-exchange \
  --frame feb_2021_frame \
  ./content/feb_2021.strategy/feb_2021.test.ts
```

Add `--ui` to open the web dashboard at `http://localhost:60050`:

```bash
npm start -- --backtest --symbol DOTUSDT --ui \
  ./content/feb_2021.strategy/feb_2021.test.ts
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

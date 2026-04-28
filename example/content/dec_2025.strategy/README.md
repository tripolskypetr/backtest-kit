<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📊 BTCUSDT December 2025 — Pine Script Range Breakout

> Pine Script indicator runs inside the strategy via `@backtest-kit/pinets`, computing Bollinger Bands, a range detector, and a volume-spike signal. Trades trigger on breakout from range, confirmed by volume.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

Each signal opens a $100 bracket position (±2% TP/SL) via `Position.bracket`. The Pine Script indicator (`btc_dec2025_range.pine`) runs on 1h candles with RSI length 14, cached per hour via `Cache.fn`. A signal fires only when price has not yet crossed the close price at signal time, and the market is not in a ranging regime (`isRanging === 0`).

**Strategy:** `dec_2025_strategy` | **Exchange:** `ccxt-exchange` | **Frame:** `dec_2025_frame`

## 📉 Price Context (December 2025)

| Metric | Value |
|---|---|
| Frame open | ~$87,080 (Dec 1) |
| Frame close | ~$88,167 (Dec 15) |
| Period high | ~$94,171 |
| Period low | ~$85,338 |
| Net move | **+1.3%** |

December 2025 (first half) was a choppy, high-volatility period for BTC. Price oscillated between ~$85k and ~$94k with sharp intra-day reversals. The strategy only ran through December 15 (9 trades total), capturing both trend and counter-trend moves within the range.

## ✨ Performance Summary

| Metric | Value |
|---|---|
| Total trades | 9 |
| Longs / Shorts | 6 / 3 |
| Total deployed capital | $900 |
| Net PNL ($) | **+$2.40** |
| Net PNL (%) | **+0.27%** avg per trade |
| Win rate | 66.7% (6 / 9) |
| Avg PNL per trade | +$0.27 |
| Best trade | +$1.61 (Dec 1, SHORT, +1.61%) |
| Worst trade | −$2.41 (Dec 5, SHORT, −2.41%) |
| Worst drawdown (%) | **−2.35%** |
| Worst drawdown ($) | **−$2.35** |
| Sharpe ratio | **0.06** |
| Avg hold time | ~1,189 min (~20h) |
| Max hold time | 3,210 min (~53h) |

## 📋 Trade Log

| # | Dir | Open date | Close date | Hold | Open price | Close price | PNL% | PNL$ | Max DD% | Max DD$ | VolSpike |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | SHORT | Dec 1 | Dec 1 | 708 min | $87,080 | $85,338 | +1.61% | +$1.61 | −1.02% | −$1.02 | ✓ |
| 2 | LONG | Dec 2 | Dec 2 | 52 min | $89,117 | $90,899 | +1.59% | +$1.59 | 0.00% | $0.00 | ✓ |
| 3 | LONG | Dec 2 | Dec 3 | 598 min | $90,849 | $92,666 | +1.59% | +$1.59 | −0.97% | −$0.97 | ✓ |
| 4 | SHORT | Dec 5 | Dec 7 | 2,908 min | $88,818 | $90,595 | −2.41% | −$2.41 | −2.35% | −$2.35 | ✓ |
| 5 | LONG | Dec 9 | Dec 10 | 451 min | $94,171 | $92,288 | −2.39% | −$2.39 | −2.31% | −$2.31 | ✓ |
| 6 | LONG | Dec 10 | Dec 10 | 1,166 min | $92,247 | $94,091 | +1.59% | +$1.59 | −0.99% | −$0.99 | — |
| 7 | LONG | Dec 11 | Dec 12 | 1,033 min | $92,850 | $90,993 | −2.39% | −$2.39 | −2.34% | −$2.34 | ✓ |
| 8 | SHORT | Dec 12 | Dec 14 | 3,210 min | $90,051 | $88,250 | +1.61% | +$1.61 | −1.03% | −$1.03 | ✓ |
| 9 | LONG | Dec 15 | Dec 15 | 578 min | $88,167 | $89,930 | +1.59% | +$1.59 | −0.42% | −$0.42 | ✓ |
| **Σ** | | | | | | | | **+$2.40** | **−2.35%** | **−$11.43** | |

## 🔍 Signal Logic

The Pine Script indicator exports the following plots:

| Plot | Role |
|---|---|
| `bbUpper` / `bbLower` / `bbBasis` | Bollinger Bands (basis = signal line) |
| `rangeHigh` / `rangeLow` | Detected horizontal range boundaries |
| `signalLine` | Mid-channel reference |
| `signal` | `+1` = bullish breakout, `−1` = bearish breakout |
| `isRanging` | `1` = price still inside range → skip signal |
| `volSpike` | `1` = volume confirmation |

Entry rules in `getSignal`:
- **LONG** (`signal === 1`): skip if `currentPrice > plot.close` (already run up) or `isRanging`
- **SHORT** (`signal === -1`): skip if `currentPrice < plot.close` (already run down) or `isRanging`
- Both directions: fixed ±2% TP/SL bracket, no DCA, `minuteEstimatedTime: Infinity`

The only trade without volume confirmation (trade #6) still hit TP — but the filter exists to avoid low-conviction breakouts.

## ⚠️ Risk Analysis

| Risk metric | Value |
|---|---|
| Max drawdown per position (%) | −2.41% |
| Max drawdown per position ($) | −$2.41 |
| Total drawdown across all positions ($) | −$11.43 |
| Capital at risk per trade | $100 |
| Hard stop per trade | 2% |
| Max theoretical loss (single trade) | −$2.00 |

The three losing trades (#4, #5, #7) all hit the hard 2% stop-loss. Trades #4 and #7 were false breakouts — price briefly broke direction then reversed. Trade #5 was a long entry near the period high ($94,171) that immediately reversed into a full stop.

## 🚀 How to Run

```bash
npm start -- --backtest --symbol BTCUSDT \
  --strategy dec_2025_strategy \
  --exchange ccxt-exchange \
  --frame dec_2025_frame \
  ./content/dec_2025.strategy/dec_2025.strategy.ts
```

Add `--ui` to open the web dashboard at `http://localhost:60050`:

```bash
npm start -- --backtest --symbol BTCUSDT --ui \
  ./content/dec_2025.strategy/dec_2025.strategy.ts
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

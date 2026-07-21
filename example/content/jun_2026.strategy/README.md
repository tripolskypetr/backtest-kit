<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📊 BTCUSDT June 2026 — Crowd Liquidity Backtest

> Backtest that turns TradingView crowd ideas into a tradable signal: an author whitelist trained on idea outcomes, entries on 2+ aligned authors, exits by a 1.5% trailing take. +19.55% on a month where BTC fell −20.4%.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

The strategy consumes a scrape of public TradingView ideas (author, direction, publish time) for June 2026. Authors whose track record is worse than a coin are banned by a trained filter; an entry fires when **2+ unique unbanned authors** post the same direction within a rolling 4h window. Positions close on a trailing take (1.5% pullback from peak PnL), a 7% insurance stop that never fired, or a 5-day hold cap. Parameters were found by the profile sweep that later became the `Simulator` entity of the framework.

**Strategy:** `jun_2026_strategy` | **Exchange:** `ccxt-exchange` | **Frame:** `jun_2026_frame`

## 🚀 Quick Start

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content/jun_2026.strategy)

```bash
npm start -- --backtest --symbol BTCUSDT ./content/jun_2026.strategy/jun_2026.strategy.ts
```

## 🔍 Methodology

The raw hypothesis — "follow the crowd" — loses badly: entering on every consensus window with tight exits gave **−24.23%** on this month. The edge appears only after filtering *who* is worth following. Every idea gets a 5-day forward candle profile (favorable/adverse excursions by wicks); an author with 3+ ideas and a hit rate below 50% goes to the ban list (13 of 167 authors — but they produced 90 of 343 directional ideas). The ban list is a **trained artifact** stored in [`assets/sweep.report.BTCUSDT.json`](./assets/sweep.report.BTCUSDT.json) and loaded by the strategy at startup.

Exit parameters (hard stop 7%, trailing take 1.5%, hold 5 days) were selected on a grid of idea profiles — one candle pass per idea, every grid point evaluated arithmetically, wick-based fills, fees and slippage included. Key findings baked into the numbers: a quarter of profitable ideas dip to −2.7% *before* running to their peak (tight stops kill winners at the shakeout), and with clean filtered entries a narrow 1.5% trailing stops catching noise.

Honest caveats, stated in the strategy header as well: metrics are **in-sample** (the author filter is trained on the same June it trades), the edge is confirmed on BTCUSDT only (the same parameters lose on ETHUSDT), and a pure time-exit baseline already earns +19.2% — the exit machinery is risk management, not the alpha. The alpha is in *whose* ideas you follow.

## 📉 Price Context (June 2026)

| Metric | Value |
|---|---|
| Period | Jun 1 – Jun 30, 2026 |
| Ticker | BTCUSDT |
| Frame open | ~$73,674 (Jun 1) |
| Frame close | ~$58,625 (Jun 30) |
| Period high / low | ~$74,092 / ~$58,115 |
| Net move | **−20.4%** |

June 2026 was the worst BTC month in two years: a grinding decline from $74k to $58k with brief relief rallies. The unfiltered crowd kept posting longs into the fall; the whitelisted authors leaned short. Nine of the ten trades landed profitable — mostly shorts riding the decline, with the whitelist flipping long only on local bottoms.

## ✨ Performance Summary

### Before (unfiltered crowd-following)

| Metric | Value |
|---|---|
| Total trades | 39 |
| Net PNL | **−24.23%** |
| Win rate | 59% (23 / 39) |
| Avg win / avg loss | +0.7% / −3.4% |
| Stop-outs | 11 × ≈−3.4% |

Following every consensus window with a 3% stop and 0.5% trailing take: decent win rate, catastrophic asymmetry — winners cut at half a percent, losers run to the stop.

### After (author whitelist + tuned exits)

| Metric | Value |
|---|---|
| Total trades | 10 |
| Net PNL | **+19.55%** |
| Win rate | **90%** (9 / 10) |
| Avg win / avg loss | +2.28% / −0.92% |
| Best trade | **+6.80%** (SHORT Jun 1) |
| Worst trade | −0.92% (LONG Jun 30, cut by frame end) |
| Closed by trailing take | 7 |
| Closed by hold timeout | 3 |
| Closed by stop-loss | **0** |

### Risk-Adjusted Metrics

Individual trade PNL values (after): `+6.80, +1.78, +0.79, +2.81, +1.06, +0.17, +3.46, +3.24, +0.36, −0.92`

| Metric | Before | After |
|---|---|---|
| Mean trade PNL | −0.62% | **+1.96%** |
| Sharpe Ratio (per-trade) | negative | **+2.94** |
| Profit factor | 0.35 | **22.2** |
| Max single-trade loss | −3.41% | −0.92% |
| Benchmark (buy & hold June) | −20.4% | −20.4% |

> **Sharpe Ratio** = mean(PNL) / std(PNL) × √n, computed per-trade without risk-free rate adjustment (annualisation is not meaningful for a 30-day, 10-trade sample).

> **Profit factor** = gross profit / gross loss. After: 20.47% won / 0.92% lost = 22.2.

## 📋 Trade Log (After)

| # | Entry | Dir | Aligned | Open | PNL% | Exit |
|---|---|---|---|---|---|---|
| 1 | Jun 1 08:57 | SHORT | 2 | $72,834 | **+6.80%** | trailing take |
| 2 | Jun 4 11:52 | SHORT | 2 | $62,447 | **+1.78%** | trailing take |
| 3 | Jun 8 08:24 | LONG | 2 | $63,040 | **+0.79%** | hold timeout |
| 4 | Jun 13 14:30 | LONG | 2 | $64,138 | **+2.81%** | trailing take |
| 5 | Jun 16 12:39 | SHORT | 2 | $66,719 | **+1.06%** | trailing take |
| 6 | Jun 18 12:39 | LONG | 2 | $64,208 | **+0.17%** | trailing take |
| 7 | Jun 23 06:58 | SHORT | 2 | $62,951 | **+3.46%** | trailing take |
| 8 | Jun 25 06:18 | SHORT | 2 | $61,752 | **+3.24%** | trailing take |
| 9 | Jun 25 14:16 | SHORT | 6 | $59,428 | **+0.36%** | hold timeout |
| 10 | Jun 30 14:19 | LONG | 3 | $58,968 | **−0.92%** | frame end |

> The 7% insurance stop never fired: whitelist-filtered entries did not dip even to −4% intratrade. Trade 10 was cut by the June frame boundary, not by its own exit logic.

## 📈 Equity Curve (After)

| After trade | Cumulative PNL% |
|---|---|
| 1 — Jun 1 | +6.80% |
| 2 — Jun 4 | +8.58% |
| 3 — Jun 8 | +9.37% |
| 4 — Jun 13 | +12.18% |
| 5 — Jun 16 | +13.24% |
| 6 — Jun 18 | +13.41% |
| 7 — Jun 23 | +16.87% |
| 8 — Jun 25 | +20.11% |
| 9 — Jun 25 | **+20.47%** ← peak |
| 10 — Jun 30 | **+19.55%** |

## 🚀 How to Run

```bash
npm start -- --backtest --symbol BTCUSDT \
  --strategy jun_2026_strategy \
  --exchange ccxt-exchange \
  --frame jun_2026_frame \
  ./content/jun_2026.strategy/jun_2026.strategy.ts
```

Add `--ui` to open the web dashboard at `http://localhost:60050`:

```bash
npm start -- --backtest --symbol BTCUSDT --ui \
  ./content/jun_2026.strategy/jun_2026.strategy.ts
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

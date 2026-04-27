<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📊 BTCUSDT February 2026 — AI News Sentiment Backtest

> AI-driven trading strategy that reads live news via Tavily, generates bullish/bearish forecasts with Ollama, and executes positions on BTCUSDT. [Link to the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/example)

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

An LLM reads live news from Tavily every few hours, produces a bullish / bearish / wait forecast via Ollama, and opens a LONG or SHORT position at the next candle open. Positions close on a trailing take-profit or stop-loss; an opposing forecast flips the position mid-trade.

**Strategy:** `feb_2026_strategy` | **Exchange:** `ccxt-exchange` | **Frame:** `feb_2026_frame`

## 📉 Price Context (February 2026)

| Metric | Value |
|---|---|
| Month open | $78,734 |
| Month close | $65,879 |
| Monthly high | ~$79,424 (Feb 1) |
| Monthly low | ~$60,000 (Feb 6) |
| Net move | **−16.4%** |

February 2026 was a sustained bear month. The Kevin Warsh Fed nomination shock, AI-sector re-pricing ("SaaSpocalypse"), record Bitcoin ETF outflows ($4 B over 5 weeks), and Trump's 15% global tariffs drove BTC from ~$79 k to ~$60 k before a partial recovery to ~$66 k.

## ✨ Performance Summary

| Metric | Value |
|---|---|
| Total trades | 16 |
| Net PNL | **+16.99%** |
| Win rate | **68.8%** (11 / 16) |
| Avg win | +2.78% |
| Avg loss | −2.72% |
| Profit factor | **2.25** |
| Best trade | **+14.28%** (SHORT Feb 4, $75,740 → $64,657) |
| Worst trade | −3.41% (stop-loss) |
| Direction | 14 × SHORT / 2 × LONG |
| Closed by trailing take | 9 |
| Closed by stop-loss | 4 |
| Closed by sentiment flip | 3 |

The strategy correctly held SHORT bias for nearly the entire month while BTC fell ~24% peak-to-trough, switched to LONG on Feb 19 during the recovery bounce (+6.3%), and reversed back to SHORT when geopolitical news (US–Iran escalation, tariffs) resumed.

## 📋 Trade Log

| # | Date | Dir | Open | Close | PNL% | Exit | Peak% | News Driver |
|---|------|-----|-----:|------:|-----:|------|------:|-------------|
| 1 | Feb 1 | SHORT | $78,733 | $78,022 | **+0.51%** | take | 3.04% | BTC breaks $80 k, Kevin Warsh Fed nomination, record ETF outflows |
| 2 | Feb 3 | SHORT | $78,756 | $75,140 | **+4.20%** | take | 6.82% | Galaxy forecasts $58 k, MSTR below cost basis, $3 B/month outflows |
| 3 | Feb 4 | SHORT | $75,740 | $64,657 | **+14.28%** | take | 16.72% | Institutional selloff, deleveraging, Kevin Warsh hawkish pivot |
| 4 | Feb 5 | SHORT | $64,657 | $62,488 | **+2.96%** | take | 6.06% | $467 B market cap erased, 74% of traders turned bearish |
| 5 | Feb 6 | SHORT | $71,098 | $69,597 | **+1.72%** | take | 4.45% | Hawkish Fed, BTC −3.1%, KBW banking index −1.5% |
| 6 | Feb 7 | SHORT | $69,054 | $71,126 | **−3.41%** | SL | −0.13% | Amazon $200 B AI capex fears, Nasdaq −4.5%, BTC flash to $60 k |
| 7 | Feb 8 | SHORT | $71,373 | $70,173 | **+1.29%** | take | 3.67% | WSJ "new crypto winter", Nasdaq worst 2-day drop since April |
| 8 | Feb 9 | SHORT | $70,446 | $70,168 | **−0.01%** | flip | 0.05% | Mixed signals — Dow 50,000 record vs Goldman record short book |
| 9 | Feb 12 | SHORT | $67,051 | $69,063 | **−3.41%** | SL | 2.34% | Kevin Warsh hawkish shift confirmed, BTC −3.1%, liquidations |
| 10 | Feb 13 | SHORT | $69,080 | $66,442 | **+3.43%** | flip | 4.12% | Coinbase −$667 M loss, Cisco weak outlook, AI selloff continues |
| 11 | Feb 19 | LONG | $66,442 | $66,982 | **+0.41%** | flip | 0.83% | US industrial output +0.7%, Meta–Nvidia deal, VIX −7.5% |
| 12 | Feb 20 | SHORT | $66,982 | $66,233 | **+0.72%** | take | 3.38% | US–Iran escalation, aircraft carrier deploy, VIX back to 20+ |
| 13 | Feb 24 | SHORT | $64,585 | $64,264 | **+0.10%** | take | 2.53% | Trump 15% global tariffs, Goldman record short positions, IBM −13% |
| 14 | Feb 25 | SHORT | $64,069 | $65,992 | **−3.41%** | SL | −0.21% | Fear & Greed 5/100, 5-week ETF outflow streak, BTC near $60 k |
| 15 | Feb 26 | LONG | $67,957 | $65,918 | **−3.39%** | SL | 0.80% | BTC +6.3% on Jane Street manipulation lawsuit, risk-on rally |
| 16 | Feb 28 | SHORT | $65,879 | $64,959 | **+1.00%** | take | 3.67% | Nvidia post-earnings drop, Nasdaq −0.92%, VIX 20–21 |

**Exit legend:** `take` — trailing take-profit · `SL` — stop-loss · `flip` — closed by opposing sentiment signal

## 📈 Equity Curve

Each trade allocates $100. PNL is additive (equal position sizing, no compounding).

| After trade | Cumulative PNL% |
|---|---|
| 1 — Feb 1 | +0.51% |
| 2 — Feb 3 | +4.71% |
| 3 — Feb 4 | +18.99% |
| 4 — Feb 5 | +21.95% ← peak |
| 5 — Feb 6 | +23.67% |
| 6 — Feb 7 | +20.26% |
| 7 — Feb 8 | +21.55% |
| 8 — Feb 9 | +21.54% |
| 9 — Feb 12 | +18.13% |
| 10 — Feb 13 | +21.56% |
| 11 — Feb 19 | +21.97% |
| 12 — Feb 20 | +22.69% |
| 13 — Feb 24 | +22.79% |
| 14 — Feb 25 | +19.38% |
| 15 — Feb 26 | +15.99% |
| 16 — Feb 28 | **+16.99%** |

Peak equity +23.67% reached after trade 5. Late-month stop-losses on trades 14–15 pulled the final result back to +16.99%.

## 🚀 How to Run

```bash
npm start -- --backtest --symbol BTCUSDT \
  --strategy feb_2026_strategy \
  --exchange ccxt-exchange \
  --frame feb_2026_frame \
  ./content/feb_2026.strategy/feb_2026.strategy.ts
```

Add `--ui` to open the web dashboard at `http://localhost:60050`:

```bash
npm start -- --backtest --symbol BTCUSDT --ui \
  ./content/feb_2026.strategy/feb_2026.strategy.ts
```

## 🌍 Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
# Tavily news search API key
TAVILY_API_KEY=your_key_here

# Ollama base URL (default: http://localhost:11434)
OLLAMA_BASE_URL=http://localhost:11434

# Telegram notifications (optional)
CC_TELEGRAM_TOKEN=your_bot_token_here
CC_TELEGRAM_CHANNEL=-100123456789

# Web UI server (optional, defaults shown)
CC_WWWROOT_HOST=0.0.0.0
CC_WWWROOT_PORT=60050
```

<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📊 backtest-kit — Strategy Examples

> A collection of production-quality backtests built with [backtest-kit](https://github.com/tripolskypetr/backtest-kit). Each example demonstrates a distinct signal source, entry logic, and position management approach.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

---

## 📂 Strategy Index

| Strategy | Ticker | Period | Signal source | Net PNL | Sharpe | Details |
|---|---|---|---|---|---|---|
| [TRXUSDT Jan 2026 — Liquidity Harvesting](#-trxusdt-january-2026--signal-inversion) | TRXUSDT | Jan 2026 | Telegram channel signals (inverted) | **+8.58%** | **1.14** | [README](content/jan_2026.strategy/README.md) |
| [BTCUSDT Feb 2026 — AI News Sentiment](#-btcusdt-february-2026--ai-news-sentiment) | BTCUSDT | Feb 2026 | LLM forecast on live news (Tavily + Ollama) | **+16.99%** | **0.25** | [README](content/feb_2026.strategy/README.md) |

---

## 📈 TRXUSDT January 2026 — Liquidity Harvesting

> **Hypothesis:** The channel publishes SHORT signals with average R:R of 0.375:1 and 106% deposit at risk at 25× leverage — mathematically guaranteed to lose. Fifteen minutes before each post a volume spike appears on the chart; the TP step multipliers and T5/SL ratio are identical across all signals, indicating an algorithm. If you reverse engineer the algorithm — liquidity is yours

### How it works

1. Signals are loaded from `assets/entry.jsonl` — 11 real posts from the Crypto Yoda channel, exported verbatim.
2. On each candle, `getSignal` checks if `publishedAt` matches the current minute and whether `closePrice` falls inside `entry.from..entry.to`.
3. Instead of using the original direction, the strategy reads the last two 4h candles and computes the range midpoint:

---

## 📈 BTCUSDT February 2026 — AI News Sentiment

> **Hypothesis:** an LLM reading live crypto/macro news every few hours can produce a directional bias (bullish / bearish / wait) that outperforms random on a sustained trending month.

### How it works

1. Every 4–8 hours, a Tavily search fetches the latest Bitcoin and macro headlines.
2. The raw news text is passed to a local Ollama model, which returns one of `bullish`, `bearish`, or `wait`.
3. `getSignal` opens a LONG on `bullish`, SHORT on `bearish`, and skips on `wait`. A conflicting forecast while a position is open triggers `commitClosePending` (sentiment flip).
4. Positions exit on trailing take-profit (1% drawdown from peak) or stop-loss (1% from entry). No fixed TP target.

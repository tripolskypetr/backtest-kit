<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📊 backtest-kit — Strategy Examples

> A collection of production-quality backtests built with [backtest-kit](https://github.com/tripolskypetr/backtest-kit). Each example demonstrates a distinct signal source, entry logic, and position management approach.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

---

## 📂 Strategy Index

| Strategy | Ticker | Period | Signal source | Net PNL | Sharpe |
|---|---|---|---|---|---|
| [TRXUSDT Jan 2026 — Liquidity Harvesting](./content//jan_2026.strategy/README.md) | TRXUSDT | Jan 2026 | Telegram channel signals (inverted) | **+8.58%** | **1.14** |
| [BTCUSDT Feb 2026 — AI News Sentiment](./content/feb_2026.strategy/README.md) | BTCUSDT | Feb 2026 | LLM forecast on live news (Tavily + Ollama) | **+16.99%** | **0.25** |
| [BTCUSDT Apr 2026 — DCA Ladder](./content/apr_2026.strategy/README.md) | BTCUSDT | Apr 2026 | Fixed LONG moonbag signal + DCA ladder down (up to 10 rungs) | **+67.85%** | **0.12** |

---

## 🔪 TRXUSDT January 2026 — Liquidity Harvesting

> **Hypothesis:** The Telegram channel publishes SHORT signals with average R:R of 0.375:1 and 106% deposit at risk at 25× leverage — mathematically guaranteed to lose. Fifteen minutes before each post a volume spike appears on the chart; the TP step multipliers and T5/SL ratio are identical across all signals, indicating an algorithm. If you reverse engineer the algorithm — liquidity is yours

### How it works

1. Signals are loaded from `assets/entry.jsonl` — 11 real posts from the Crypto Yoda channel, exported verbatim.
2. On each candle, `getSignal` checks if `publishedAt` matches the current minute and whether `closePrice` falls inside `entry.from..entry.to`.
3. Counter trend entry with trailing take and no fixed TP. SL is set to -0.5%

---

## 📰 BTCUSDT February 2026 — AI News Sentiment

> **Hypothesis:** an LLM reading live crypto/macro news every few hours can produce a directional bias (bullish / bearish / wait) that outperforms random on a sustained trending month.

### How it works

1. Every 4–8 hours, a Tavily search fetches the latest Bitcoin and macro headlines.
2. The raw news text is passed to a local Ollama model, which returns one of `bullish`, `bearish`, or `wait`.
3. `getSignal` opens a LONG on `bullish`, SHORT on `bearish`, and skips on `wait`. A conflicting forecast while a position is open triggers `commitClosePending` (sentiment flip).
4. Positions exit on trailing take-profit (1% drawdown from peak) or stop-loss (1% from entry). No fixed TP target.

---

## 🧗 BTCUSDT April 2026 — LONG DCA Ladder

> **Hypothesis:** in a trending bull month, dollar-cost averaging into every dip lowers the blended cost basis enough to hit a 3% profit target faster and more often than a single-entry approach.

### How it works

1. `getSignal` opens a LONG on every new pending signal via `Position.moonbag` with a 25% hard stop and $100 cost.
2. While active, `commitAverageBuy` fires on each ping if the current price falls outside a ±1–5% band around the last entry and fewer than 10 rungs have been added.
3. The position closes as soon as blended portfolio PNL reaches +3% via `commitClosePending`.

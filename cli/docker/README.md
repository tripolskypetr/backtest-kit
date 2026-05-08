<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 🧿 Backtest Kit Docker

> A TypeScript framework for backtesting and live trading strategies on multi-asset, crypto, forex or [DEX (peer-to-peer marketplace)](https://en.wikipedia.org/wiki/Decentralized_finance#Decentralized_exchanges), spot, futures with crash-safe persistence, signal validation, and AI optimization.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

A self-contained Docker workspace for running [backtest-kit](https://github.com/tripolskypetr/backtest-kit) strategies with automatic restarts and zero-downtime trading.

---

## 📂 Strategy Index

| Strategy | Ticker | Period | Signal source | Net PNL | Sharpe |
|---|---|---|---|---|---|
| [DOTUSDT Feb 2021 — Python EMA Crossover](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content/feb_2021.strategy) | DOTUSDT | Feb 2021 | Python EMA(9)/EMA(21) crossover via WebAssembly | **+5.52%** | **0.09** |
| [BTCUSDT Oct 2021 — TensorFlow Neural Network](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content/oct_2021.strategy) | BTCUSDT | Oct 2021 | TensorFlow NN predicting next candle close | **+18.26%** | **0.31** |
| [BTCUSDT Dec 2025 — Pine Script Range Breakout](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content/dec_2025.strategy) | BTCUSDT | Dec 2025 | Pine Script BB + range detector + volume spike | **+2.40%** | **0.06** |
| [TRXUSDT Jan 2026 — Liquidity Harvesting](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content//jan_2026.strategy) | TRXUSDT | Jan 2026 | Telegram channel signals (inverted) | **+8.58%** | **1.14** |
| [BTCUSDT Feb 2026 — AI News Sentiment](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content/feb_2026.strategy) | BTCUSDT | Feb 2026 | LLM forecast on live news (Tavily + Ollama) | **+16.99%** | **0.25** |
| [BTCUSDT Mar 2026 — SHORT DCA Ladder](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content/mar_2026.strategy) | BTCUSDT | Mar 2026 | Fixed SHORT gravebag signal + DCA ladder up (up to 10 rungs) | **+37.83%** | **0.35** |
| [BTCUSDT Apr 2026 — DCA Ladder](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content/apr_2026.strategy) | BTCUSDT | Apr 2026 | Fixed LONG moonbag signal + DCA ladder down (up to 10 rungs) | **+67.85%** | **0.12** |

---

## 🚀 Quick Start

```bash
MODE=backtest STRATEGY_FILE=./content/feb_2026/feb_2026.strategy.ts docker-compose up -d
docker-compose logs -f
```

---

## 🏃 Running Modes

The container entrypoint reads `MODE` and `STRATEGY_FILE` from environment variables. Pass them inline — no file edits needed.

### 🧪 Backtest

```bash
MODE=backtest \
STRATEGY_FILE=./content/feb_2026/feb_2026.strategy.ts \
SYMBOL=BTCUSDT \
STRATEGY=feb_2026_strategy \
EXCHANGE=ccxt-exchange \
UI=1 \
docker-compose up -d
```

### 📄 Paper Trading

```bash
MODE=paper \
STRATEGY_FILE=./content/feb_2026/feb_2026.strategy.ts \
SYMBOL=BTCUSDT \
docker-compose up -d
```

### 📈 Live Trading

```bash
MODE=live \
STRATEGY_FILE=./content/feb_2026/feb_2026.strategy.ts \
SYMBOL=BTCUSDT \
UI=1 \
docker-compose up -d
```

### ⚖️ Walker — A/B Comparison

```yaml
command:
  - --walker
  - --symbol
  - BTCUSDT
  - --noCache
  - ./content/feb_2026_v1.strategy.ts
  - ./content/feb_2026_v2.strategy.ts
```

---

## 🌍 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MODE` | yes | — | `backtest` \| `live` \| `paper` \| `walker` |
| `STRATEGY_FILE` | yes | — | Path to strategy entry point (relative to `working_dir`) |
| `SYMBOL` | no | `BTCUSDT` | Trading pair |
| `STRATEGY` | no | first registered | Strategy name from `addStrategySchema` |
| `EXCHANGE` | no | first registered | Exchange name from `addExchangeSchema` |
| `FRAME` | no | first registered | Frame name from `addFrameSchema` (backtest only) |
| `UI` | no | — | Any non-empty value enables `--ui` dashboard at `http://localhost:60050` |
| `TELEGRAM` | no | — | Any non-empty value enables `--telegram` notifications |
| `VERBOSE` | no | — | Any non-empty value enables `--verbose` candle logging |
| `NO_CACHE` | no | — | Any non-empty value enables `--noCache` (skip cache warming) |
| `NO_FLUSH` | no | — | Any non-empty value enables `--noFlush` (keep report folders) |

Connection strings, API keys, and other secrets go in `.env` — it is loaded automatically by `docker-compose.yaml`.

---

## 🗂️ Project Structure

```
├── docker-compose.yaml               # service definition — edit to pin command: or add resources
├── .env                              # secrets: DB connection strings, API keys, Telegram token
├── .env.example                      # reference copy of .env
├── package.json                      # dependencies for editing strategies locally
├── tsconfig.json                     # TypeScript config for content/
└── content/
    └── feb_2026/
        ├── feb_2026.strategy.ts      # strategy entry point
        └── modules/
            └── backtest.module.ts    # CCXT Binance exchange + frame schema
```

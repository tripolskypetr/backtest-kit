# 🧿 Backtest Kit Project

> A TypeScript framework for backtesting and live trading strategies on multi-asset, crypto, forex or [DEX (peer-to-peer marketplace)](https://en.wikipedia.org/wiki/Decentralized_finance#Decentralized_exchanges), spot, futures with crash-safe persistence, signal validation, and AI optimization.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Build](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml/badge.svg)](https://github.com/tripolskypetr/backtest-kit/actions/workflows/webpack.yml)

A minimal project scaffold for [backtest-kit](https://github.com/tripolskypetr/backtest-kit). All infrastructure (exchange registration, candle caching, runner, UI, Telegram) is handled by `@backtest-kit/cli` — this project contains only your strategy files.

## 📋 Quick Start

```bash
npm start         # Run the CLI (append flags below)
npm run sync:lib  # Refresh library docs in docs/lib/
```

## 🏃 Running Modes

All modes are invoked via `npm start -- <flags> <entry-point>`.

### 🧪 Backtest

Runs the strategy against historical candle data defined by a `FrameSchema`.

```bash
npm start -- --backtest --symbol BTCUSDT --strategy feb_2026_strategy --exchange ccxt-exchange --frame feb_2026_frame ./content/feb_2026.strategy.ts
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--backtest` | boolean | — | Enable backtest mode |
| `--symbol` | string | `BTCUSDT` | Trading pair |
| `--strategy` | string | first registered | Strategy name from `addStrategySchema` |
| `--exchange` | string | first registered | Exchange name from `addExchangeSchema` |
| `--frame` | string | first registered | Frame name from `addFrameSchema` |
| `--cacheInterval` | string | `1m, 15m, 30m, 1h, 4h` | Comma-separated intervals to pre-cache before the run |
| `--noCache` | boolean | `false` | Skip candle cache warming |
| `--verbose` | boolean | `false` | Log every candle fetch to stdout |
| `--ui` | boolean | `false` | Start web dashboard at `http://localhost:60050` |
| `--telegram` | boolean | `false` | Send trade notifications to Telegram |

Before the backtest starts, the CLI warms the candle cache for every interval in `--cacheInterval`. On subsequent runs the cache is used directly — no extra API calls. Pass `--noCache` to skip this step.

Module file `./modules/backtest.module.ts` (or `.mjs`) is loaded automatically if it exists.

### 📄 Paper Trading

Connects to the live exchange but places no real orders. Identical code path to `--live` — safe for strategy validation.

```bash
npm start -- --paper --symbol BTCUSDT --strategy feb_2026_strategy --exchange ccxt-exchange ./content/feb_2026.strategy.ts
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--paper` | boolean | — | Enable paper trading mode |
| `--symbol` | string | `BTCUSDT` | Trading pair |
| `--strategy` | string | first registered | Strategy name |
| `--exchange` | string | first registered | Exchange name |
| `--verbose` | boolean | `false` | Log every candle fetch to stdout |
| `--ui` | boolean | `false` | Start web dashboard |
| `--telegram` | boolean | `false` | Enable Telegram notifications |

Module file `./modules/paper.module.ts` is loaded automatically if it exists.

### 📈 Live Trading

Deploys a real trading bot. Requires exchange API keys in `.env`.

```bash
npm start -- --live --symbol BTCUSDT --ui --telegram ./content/feb_2026.strategy.ts
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--live` | boolean | — | Enable live trading mode |
| `--symbol` | string | `BTCUSDT` | Trading pair |
| `--strategy` | string | first registered | Strategy name |
| `--exchange` | string | first registered | Exchange name |
| `--verbose` | boolean | `false` | Log every candle fetch to stdout |
| `--ui` | boolean | `false` | Start web dashboard |
| `--telegram` | boolean | `false` | Enable Telegram notifications |

Module file `./modules/live.module.ts` is loaded automatically if it exists. Use it to register a `Broker` adapter that intercepts every trade mutation before internal state changes — exchange rejection rolls back the operation atomically.

## 🌲 Running PineScript Indicators (`--pine`)

Executes a local `.pine` file against a real exchange and prints the output as a Markdown table or saves it to a file.

```bash
npm start -- --pine ./math/feb_2026.pine --timeframe 15m --limit 500 --when "2026-02-28T00:00:00.000Z" --jsonl
```

Output file is created at `./math/dump/<name>.jsonl` (next to the `.pine` file).

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--pine` | boolean | — | Enable PineScript execution mode |
| `--symbol` | string | `BTCUSDT` | Trading pair |
| `--timeframe` | string | `15m` | Candle interval |
| `--limit` | string | `250` | Number of candles to fetch |
| `--when` | string | now | End date — ISO 8601 or Unix ms |
| `--exchange` | string | first registered | Exchange name |
| `--output` | string | `.pine` file name | Output file base name (no extension) |
| `--json` | boolean | `false` | Save output as JSON array |
| `--jsonl` | boolean | `false` | Save output as JSONL (one row per line) |
| `--markdown` | boolean | `false` | Save output as Markdown table |

Module file `./modules/pine.module.ts` is loaded automatically. The project includes it pre-configured with CCXT Binance. Override it to use a different exchange.

Only `plot()` calls with `display=display.data_window` produce output columns:

```pine
plot(close,    "Close",    display=display.data_window)
plot(position, "Position", display=display.data_window)
```

## 💾 Dumping Raw Candles (`--dump`)

Fetches raw OHLCV candles from an exchange and saves them to a file.

```bash
npm start -- --dump --timeframe 15m --limit 500 --when "2026-02-28T00:00:00.000Z" --jsonl
```

Output file is created at `./dump/<name>.jsonl`.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dump` | boolean | — | Enable candle dump mode |
| `--symbol` | string | `BTCUSDT` | Trading pair |
| `--timeframe` | string | `15m` | Candle interval |
| `--limit` | string | `250` | Number of candles |
| `--when` | string | now | End date — ISO 8601 or Unix ms |
| `--exchange` | string | first registered | Exchange name |
| `--output` | string | `{SYMBOL}_{LIMIT}_{TIMEFRAME}_{TIMESTAMP}` | Output file base name |
| `--json` | boolean | `false` | Save as JSON array |
| `--jsonl` | boolean | `false` | Save as JSONL |

Module file `./modules/dump.module.ts` is loaded automatically. The project includes it pre-configured with CCXT Binance.

## 🧩 Module Hooks

| File | Loaded by mode | Purpose |
|------|----------------|---------|
| `modules/backtest.module.ts` | `--backtest` | Register a `Broker` adapter for backtest |
| `modules/paper.module.ts` | `--paper` | Register a `Broker` adapter for paper trading |
| `modules/live.module.ts` | `--live` | Register a `Broker` adapter for live trading |
| `modules/pine.module.ts` | `--pine` | Register an exchange schema for PineScript runs |
| `modules/dump.module.ts` | `--dump` | Register an exchange schema for candle dumps |

All files are optional — a missing module is a soft warning, not an error. Extensions `.ts`, `.mjs`, `.cjs` are tried automatically.

## 🌍 Environment Variables

Create a `.env` file in the project root:

```env
# Telegram notifications (required for --telegram)
CC_TELEGRAM_TOKEN=your_bot_token_here
CC_TELEGRAM_CHANNEL=-100123456789

# Web UI server (optional, defaults shown)
CC_WWWROOT_HOST=0.0.0.0
CC_WWWROOT_PORT=60050
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_TELEGRAM_TOKEN` | — | Telegram bot token (from @BotFather) |
| `CC_TELEGRAM_CHANNEL` | — | Telegram channel or chat ID |
| `CC_WWWROOT_HOST` | `0.0.0.0` | UI server bind address |
| `CC_WWWROOT_PORT` | `60050` | UI server port |


## 🗂️ Project Structure

```
├── content/                  # Strategy entry points (.ts)
│   └── feb_2026.strategy.ts
├── docs/                     # Documentation
│   ├── lib/                  # Auto-fetched library READMEs (via sync:lib)
│   └── *.md                  # Backtest Kit how-to guides
├── math/                     # PineScript indicator files (.pine)
│   └── feb_2026.pine
├── modules/                  # Side-effect module hooks (loaded automatically)
│   ├── dump.module.ts        # Exchange schema for --dump mode
│   └── pine.module.ts        # Exchange schema for --pine mode
├── report/                   # Strategy research reports (.md)
│   └── feb_2026.md
├── scripts/
│   └── fetch_docs.mjs        # Downloads library READMEs into docs/lib/
├── CLAUDE.md                 # AI-agent guide for writing strategies
└── package.json
```

## 📚 Updating Library Documentation

```bash
npm run sync:lib
```

Downloads the latest README files for all bundled libraries into `docs/lib/`. Run this after updating package versions or when you want fresh documentation available to the AI agent.

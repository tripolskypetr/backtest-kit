<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/square_compasses.svg" height="45px" align="right">

# 📟 @backtest-kit/cli

> Zero-boilerplate CLI for launching backtests, paper trading, and live trading. Run any backtest-kit strategy from the command line — no setup code required.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/cli.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/cli)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Point the CLI at your strategy file, choose a mode, and it handles exchange connectivity, candle caching, UI dashboard, and Telegram notifications for you.

📚 **[Backtest Kit Docs](https://backtest-kit.github.io/documents/example_02_first_backtest.html)** | 🌟 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

## ✨ Features

- 🚀 **Zero Config**: Run `npx @backtest-kit/cli --backtest ./strategy.mjs` — no boilerplate needed
- 🔄 **Three Modes**: Backtest on historical data, paper trade on live prices, or deploy live bots
- 💾 **Auto Candle Cache**: Warms OHLCV cache for all required intervals before backtest starts
- 🌐 **Web Dashboard**: Launch `@backtest-kit/ui` with a single `--ui` flag
- 📬 **Telegram Alerts**: Send formatted trade notifications with charts via `--telegram`
- 🔌 **Default Binance**: CCXT Binance exchange schema registered automatically when none is provided
- 🧩 **Module Hooks**: Drop a `live.module.mjs`, `paper.module.mjs`, or `backtest.module.mjs` to register a `Broker` adapter. No manual wiring needed.
- 🗃️ **Transactional Live Orders**: Broker adapter intercepts every trade mutation before internal state changes — exchange rejection rolls back the operation atomically.
- 🔑 **Pluggable Logger**: Override the built-in logger with `setLogger()` from your strategy module
- 🛑 **Graceful Shutdown**: SIGINT stops the active run and cleans up all subscriptions safely

## 📋 What It Does

`@backtest-kit/cli` wraps the `backtest-kit` engine and resolves all scaffolding automatically:

| Mode             | Command Line Args          | Description                                  |
|------------------|----------------------------|----------------------------------------------|
| **Backtest**     | `--backtest`               | Run strategy on historical candle data       |
| **Paper**        | `--paper`                  | Live prices, no real orders                  |
| **Live**         | `--live`                   | Real trades via exchange API                 |
| **UI Dashboard** | `--ui`                     | Web dashboard at `http://localhost:60050`    |
| **Telegram**     | `--telegram`               | Trade notifications with price charts        |

## 🚀 Installation

Add `@backtest-kit/cli` to your project and wire it up in `package.json` scripts:

```bash
npm install @backtest-kit/cli
```

```json
{
  "scripts": {
    "backtest": "npx @backtest-kit/cli --backtest ./src/index.mjs",
    "paper":    "npx @backtest-kit/cli --paper    ./src/index.mjs",
    "start":    "npx @backtest-kit/cli --live     ./src/index.mjs"
  },
  "dependencies": {
    "@backtest-kit/cli": "latest",
    "backtest-kit": "latest",
    "ccxt": "latest"
  }
}
```

Or run once without installing:

```bash
npx @backtest-kit/cli --backtest ./src/index.mjs
```

## 📖 Quick Start

Create your strategy entry point (`src/index.mjs`). The file registers schemas via `backtest-kit` — `@backtest-kit/cli` is only the runner:

```javascript
// src/index.mjs
import { addStrategySchema, addExchangeSchema, addFrameSchema } from 'backtest-kit';
import ccxt from 'ccxt';

// Register exchange
addExchangeSchema({
  exchangeName: 'binance',
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  formatPrice: (symbol, price) => price.toFixed(2),
  formatQuantity: (symbol, quantity) => quantity.toFixed(8),
});

// Register frame (backtest only)
addFrameSchema({
  frameName: 'feb-2024',
  interval: '1m',
  startDate: new Date('2024-02-01'),
  endDate: new Date('2024-02-29'),
});

// Register strategy
addStrategySchema({
  strategyName: 'my-strategy',
  interval: '15m',
  getSignal: async (symbol) => {
    // return signal or null
    return null;
  },
});
```

Run a backtest:

```bash
npm run backtest -- --symbol BTCUSDT
```

Run with UI dashboard and Telegram:

```bash
npm run backtest -- --symbol BTCUSDT --ui --telegram
```

Run live trading:

```bash
npm start -- --symbol BTCUSDT --ui
```

## 🎛️ CLI Flags

|     Command Line Args     | Type    | Description                                                        |
|---------------------------|---------|--------------------------------------------------------------------|
| `--backtest`              | boolean | Run historical backtest (default: `false`)                         |
| `--paper`                 | boolean | Paper trading (live prices, no orders) (default: `false`)          |
| `--live`                  | boolean | Run live trading (default: `false`)                                |
| `--ui`                    | boolean | Start web UI dashboard (default: `false`)                          |
| `--telegram`              | boolean | Enable Telegram notifications (default: `false`)                   |
| `--verbose`               | boolean | Log each candle fetch (default: `false`)                           |
| `--noCache`               | boolean | Skip candle cache warming before backtest (default: `false`)       |
| `--symbol`                | string  | Trading pair (default: `"BTCUSDT"`)                                |
| `--strategy`              | string  | Strategy name (default: first registered)                          |
| `--exchange`              | string  | Exchange name (default: first registered)                          |
| `--frame`                 | string  | Backtest frame name (default: first registered)                    |
| `--cacheInterval`         | string  | Intervals to pre-cache before backtest (default: `"1m, 15m, 30m, 4h"`) |

**Positional argument (required):** path to your strategy entry point file (set once in `package.json` scripts).

```json
{
  "scripts": {
    "backtest": "npx @backtest-kit/cli --backtest ./src/index.mjs"
  }
}
```

## 🏃 Execution Modes

### Backtest

Runs the strategy against historical candle data using a registered `FrameSchema`.

```json
{
  "scripts": {
    "backtest": "npx @backtest-kit/cli --backtest --symbol ETHUSDT --strategy my-strategy --exchange binance --frame feb-2024 --cacheInterval \"1m, 15m, 1h, 4h\" ./src/index.mjs"
  }
}
```

```bash
npm run backtest
```

Before running, the CLI warms the candle cache for every interval in `--cacheInterval`. On the next run, cached data is used directly — no API calls needed. Pass `--noCache` to skip this step entirely.

### Paper Trading

Connects to the live exchange but does not place real orders. Identical code path to live — safe for strategy validation.

```json
{
  "scripts": {
    "paper": "npx @backtest-kit/cli --paper --symbol BTCUSDT ./src/index.mjs"
  }
}
```

```bash
npm run paper
```

### Live Trading

Deploys a real trading bot. Requires exchange API keys configured in your `.env` or environment.

```json
{
  "scripts": {
    "start": "npx @backtest-kit/cli --live --ui --telegram --symbol BTCUSDT ./src/index.mjs"
  }
}
```

```bash
npm start
```

## 🗂️ Monorepo Usage

`@backtest-kit/cli` works out of the box in a monorepo where each strategy lives in its own subdirectory. When the CLI loads your entry point file, it automatically changes the working directory to the file's location — so all relative paths (`dump/`, `modules/`, `template/`) resolve inside that strategy's folder, not the project root.

### How It Works

Internally, `ResolveService` does the following before executing your entry point:

```
process.chdir(path.dirname(entryPoint))  // cwd → strategy directory
dotenv.config({ path: rootDir + '/.env' })            // load root .env first
dotenv.config({ path: strategyDir + '/.env', override: true })  // strategy .env overrides
```

Everything that follows — candle cache warming, report generation, module loading, template resolution — uses the new cwd automatically.

### Project Structure

```
monorepo/
├── package.json              # root scripts (one per strategy)
├── .env                      # shared API keys (exchange, Telegram, etc.)
└── strategies/
    ├── oct_2025/
    │   ├── index.mjs             # entry point — registers exchange/frame/strategy schemas
    │   ├── .env                  # overrides root .env for this strategy 
    │   ├── modules (optional)
    │   |    ├── live.module.mjs       # broker adapter for --live mode (optional)
    │   |    ├── paper.module.mjs      # broker adapter for --paper mode (optional)
    │   |    ├── backtest.module.mjs   # broker adapter for --backtest mode (optional)
    │   ├── template/             # custom Mustache templates (optional)
    │   └── dump/                 # auto-created: candle cache + backtest reports
    └── dec_2025/
        ├── index.mjs
        ├── .env
        └── dump/
```

### Root `package.json`

```json
{
  "scripts": {
    "backtest:oct": "npx @backtest-kit/cli --backtest ./strategies/oct_2025/index.mjs",
    "backtest:dec": "npx @backtest-kit/cli --backtest ./strategies/dec_2025/index.mjs"
  },
  "dependencies": {
    "@backtest-kit/cli": "latest",
    "backtest-kit": "latest",
    "ccxt": "latest"
  }
}
```

```bash
npm run backtest:oct
npm run backtest:dec
```

### Isolated Resources Per Strategy

| Resource                 | Path (relative to strategy dir)   | Isolated         |
|--------------------------|-----------------------------------|------------------|
| Candle cache             | `./dump/data/candle/`             | ✅ per-strategy  |
| Backtest reports         | `./dump/`                         | ✅ per-strategy  |
| Broker module (live)     | `./modules/live.module.mjs`       | ✅ per-strategy  |
| Broker module (paper)    | `./modules/paper.module.mjs`      | ✅ per-strategy  |
| Broker module (backtest) | `./modules/backtest.module.mjs`   | ✅ per-strategy  |
| Telegram templates       | `./template/*.mustache`           | ✅ per-strategy  |
| Environment variables    | `./.env` (overrides root)         | ✅ per-strategy  |

Each strategy run produces its own `dump/` directory, making it straightforward to compare results across time periods — both by inspection and by pointing an AI agent at a specific strategy folder.

## 🔔 Integrations

### Web Dashboard (`--ui`)

Starts `@backtest-kit/ui` server. Access the interactive dashboard at:

```
http://localhost:60050
```

Customize host/port via environment variables `CC_WWWROOT_HOST` and `CC_WWWROOT_PORT`.

### Telegram Notifications (`--telegram`)

Sends formatted HTML messages with 1m / 15m / 1h price charts to your Telegram channel for every position event: opened, closed, scheduled, cancelled, risk rejection, partial profit/loss, trailing stop/take, and breakeven.

Requires `CC_TELEGRAM_TOKEN` and `CC_TELEGRAM_CHANNEL` in your environment.

## 🧩 Module Hooks (Broker Adapter)

The CLI supports **mode-specific module files** that are loaded as side-effect imports before the strategy starts. Each file is expected to call `Broker.useBrokerAdapter()` from `backtest-kit` to register a broker adapter.

| Command Line Args | Module file                     | Loaded before               |
|-------------------|---------------------------------|-----------------------------|
| `--live`          | `./modules/live.module.mjs`     | `Live.background()`         |
| `--paper`         | `./modules/paper.module.mjs`    | `Live.background()` (paper) |
| `--backtest`      | `./modules/backtest.module.mjs` | `Backtest.background()`     |

> File is resolved relative to `cwd` (the strategy directory). All of `.mjs`, `.cjs`, `.ts` extensions are tried automatically. Missing module is a soft warning — not an error.

### How It Works

The module file is a side-effect import. When the CLI loads it, your code runs and registers the adapter. From that point on, `backtest-kit` intercepts every trade-mutating call through the adapter **before** updating internal state — if the adapter throws, the position state is never changed.

```javascript
// live.module.mjs
import { Broker } from 'backtest-kit';
import { myExchange } from './exchange.mjs';

class MyBroker {
  async onSignalOpenCommit({ symbol, priceOpen, direction }) {
    await myExchange.openPosition(symbol, direction, priceOpen);
  }

  async onSignalCloseCommit({ symbol, priceClosed }) {
    await myExchange.closePosition(symbol, priceClosed);
  }

  async onPartialProfitCommit({ symbol, cost, currentPrice }) {
    await myExchange.createOrder({
      symbol,
      side: 'sell',
      quantity: cost / currentPrice,
    });
  }

  async onAverageBuyCommit({ symbol, cost, currentPrice }) {
    await myExchange.createOrder({
      symbol,
      side: 'buy',
      quantity: cost / currentPrice,
    });
  }
}

Broker.useBrokerAdapter(MyBroker);

Broker.enable();
```

### Available Broker Hooks

| Method                   | Payload type                 | Triggered on              |
|--------------------------|------------------------------|---------------------------|
| `onSignalOpenCommit`     | `BrokerSignalOpenPayload`    | Position activation       |
| `onSignalCloseCommit`    | `BrokerSignalClosePayload`   | SL / TP / manual close    |
| `onPartialProfitCommit`  | `BrokerPartialProfitPayload` | PP                        |
| `onPartialLossCommit`    | `BrokerPartialLossPayload`   | PL                        |
| `onTrailingStopCommit`   | `BrokerTrailingStopPayload`  | SL adjustment             |
| `onTrailingTakeCommit`   | `BrokerTrailingTakePayload`  | TP adjustment             |
| `onBreakevenCommit`      | `BrokerBreakevenPayload`     | SL moved to entry         |
| `onAverageBuyCommit`     | `BrokerAverageBuyPayload`    | DCA entry                 |

All methods are optional. Unimplemented hooks are silently skipped. In backtest mode all broker calls are skipped automatically — no adapter code runs during backtests.

### TypeScript

```typescript
import { Broker, IBroker, BrokerSignalOpenPayload, BrokerSignalClosePayload } from 'backtest-kit';

class MyBroker implements Partial<IBroker> {
  async onSignalOpenCommit(payload: BrokerSignalOpenPayload) {
    // place open order on exchange
  }

  async onSignalCloseCommit(payload: BrokerSignalClosePayload) {
    // place close order on exchange
  }
}

Broker.useBrokerAdapter(MyBroker);

Broker.enable();
```

## 📦 Supported Entry Point Formats

`@backtest-kit/cli` automatically detects the format of your strategy file and loads it with the appropriate runtime — no flags or configuration required.

| Format | Extension | Runtime | Use Case |
|--------|-----------|---------|----------|
| **TypeScript** | `.ts` | [`tsx`](https://tsx.is/) via `tsImport()` | TypeScript strategies with cross-imports (ESM ↔ CJS) |
| **ES Module** | `.mjs` | Native `import()` | Modern JavaScript with top-level `await` and ESM syntax |
| **CommonJS** | `.cjs` | Native `require()` | Legacy or dual-package strategies |

### TypeScript (`.ts`)

Run TypeScript strategy files directly — no `tsc` compilation step needed. Powered by `tsx`, which handles cross-format imports transparently:

```json
{
  "scripts": {
    "backtest": "npx @backtest-kit/cli --backtest ./src/index.ts"
  },
  "dependencies": {
    "@backtest-kit/cli": "latest",
    "backtest-kit": "latest",
    "tsx": "latest"
  }
}
```

### ES Module (`.mjs`)

Standard ESM format. Supports top-level `await`, named exports, and `import` syntax:

```json
{
  "scripts": {
    "backtest": "npx @backtest-kit/cli --backtest ./src/index.mjs"
  }
}
```

### CommonJS (`.cjs`)

For projects that compile to or use CommonJS. Loaded via `require()`:

```json
{
  "scripts": {
    "backtest": "npx @backtest-kit/cli --backtest ./dist/index.cjs"
  }
}
```

## 🌲 Running Local PineScript Indicators

`@backtest-kit/cli` can execute any local `.pine` file against a real exchange and print the results as a Markdown table — no TradingView account required.

### CLI Flags

| Flag | Type | Description |
|------|------|-------------|
| `--pine` | boolean | Enable PineScript execution mode |
| `--symbol` | string | Trading pair (default: `"BTCUSDT"`) |
| `--timeframe` | string | Candle interval (default: `"15m"`) |
| `--limit` | string | Number of candles to fetch (default: `250`) |
| `--when` | string | End date for candle window — ISO 8601 or Unix ms (default: now) |
| `--exchange` | string | Exchange name (default: first registered, falls back to CCXT Binance) |
| `--output` | string | Output file base name without extension (default: `.pine` file name) |
| `--json` | boolean | Write plots as a JSON array to `<pine-dir>/dump/{output}.json` |
| `--jsonl` | boolean | Write plots as JSONL (one row per line) to `<pine-dir>/dump/{output}.jsonl` |
| `--markdown` | boolean | Write Markdown table to `<pine-dir>/dump/{output}.md` |

**Important:** `limit` must cover indicator warmup bars — rows before warmup completes will show `N/A` 

**Positional argument:** path to the `.pine` file.

### Exchange via `pine.module`

By default the CLI registers CCXT Binance automatically. To use a different exchange — or to configure API keys, custom rate limits, or a non-spot market — create a `modules/pine.module.ts` file. The CLI loads it automatically before running the script.

The CLI looks for `modules/pine.module` in two locations (first match wins):

1. **Next to the `.pine` file** — `<pine-file-dir>/modules/pine.module.ts`
2. **Project root** — `<cwd>/modules/pine.module.ts`

```
my-project/
├── math/
│   ├── impulse_trend_15m.pine         ← indicator
│   └── modules/
│       └── pine.module.ts            ← loaded first (next to .pine file)
├── modules/
│   └── pine.module.ts                ← fallback (project root)
└── package.json
```

Inside `pine.module.ts` call `addExchangeSchema` from `backtest-kit` and give the exchange a name:

```typescript
// modules/pine.module.ts
import { addExchangeSchema } from "backtest-kit";
import ccxt from "ccxt";

addExchangeSchema({
  exchangeName: "my-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.bybit({ enableRateLimit: true });
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  formatPrice: (symbol, price) => price.toFixed(2),
  formatQuantity: (symbol, quantity) => quantity.toFixed(8),
});
```

### Environment variables (`.env`)

Before loading `pine.module`, the CLI loads `.env` files in the same order as for strategy modules — project root first, then the `.pine` file directory (overrides root):

```
my-project/
├── math/
│   ├── .env                          ← loaded second (overrides root)
│   └── impulse_trend_15m.pine
├── .env                              ← loaded first
└── package.json
```

Use this to store API keys without hardcoding them:

```env
# .env
BYBIT_API_KEY=xxx
BYBIT_API_SECRET=yyy
```

```typescript
// modules/pine.module.ts
addExchangeSchema({
  exchangeName: "my-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.bybit({
      apiKey: process.env.BYBIT_API_KEY,
      secret: process.env.BYBIT_API_SECRET,
      enableRateLimit: true,
    });
    // ...
  },
});
```

Then run:

```bash
npx @backtest-kit/cli --pine ./math/impulse_trend_15m.pine \
  --exchange my-exchange \
  --symbol BTCUSDT \
  --timeframe 15m \
  --limit 180 \
  --when "2025-09-24T12:00:00.000Z"
```

Or add it to `package.json`:

```json
{
  "scripts": {
    "pine": "npx @backtest-kit/cli --pine ./math/impulse_trend_15m.pine --symbol BTCUSDT --timeframe 15m --limit 180"
  }
}
```

```bash
npm run pine
```

### PineScript Requirements

The CLI reads all `plot()` calls that use `display=display.data_window` as output columns. Every other `plot()` is ignored. Name each output plot explicitly:

```pine
//@version=5
indicator("MyIndicator", overlay=true)

// ... computation ...

plot(close,    "Close",    display=display.data_window)
plot(position, "Position", display=display.data_window)
```

The column names in the output Markdown table are taken directly from those plot names — no manual schema definition needed.

### Output

The CLI prints a Markdown table to stdout:

```
# PineScript Technical Analysis Dump

**Signal ID**: CLI execution 2025-09-24T12:00:00.000Z

| Close | Position | timestamp |
| --- | --- | --- |
| 112871.28 | -1.0000 | 2025-09-22T15:00:00.000Z |
| 112666.69 | -1.0000 | 2025-09-22T15:15:00.000Z |
| 112736.00 |  0.0000 | 2025-09-22T18:30:00.000Z |
| 112653.90 |  1.0000 | 2025-09-22T22:15:00.000Z |
```

Save to `./math/dump/impulse_trend_15m.md` (uses `.pine` file name automatically, dump is created next to the `.pine` file):

```bash
npx @backtest-kit/cli --pine ./math/impulse_trend_15m.pine --markdown
```

Override the output name with `--output`:

```bash
npx @backtest-kit/cli --pine ./math/impulse_trend_15m.pine --jsonl --output feb2026_bb
# → ./math/dump/feb2026_bb.jsonl
```

Print to stdout (no flag):

```bash
npx @backtest-kit/cli --pine ./math/impulse_trend_15m.pine
```

## 🌍 Environment Variables

Create a `.env` file in your project root:

```env
# Telegram notifications (required for --telegram)
CC_TELEGRAM_TOKEN=your_bot_token_here
CC_TELEGRAM_CHANNEL=-100123456789

# Web UI server (optional, defaults shown)
CC_WWWROOT_HOST=0.0.0.0
CC_WWWROOT_PORT=60050

# Custom QuickChart service URL (optional)
CC_QUICKCHART_HOST=
```

| Variable               | Default     | Description                           |
|------------------------|-------------|---------------------------------------|
| `CC_TELEGRAM_TOKEN`    | —           | Telegram bot token (from @BotFather)  |
| `CC_TELEGRAM_CHANNEL`  | —           | Telegram channel or chat ID           |
| `CC_WWWROOT_HOST`      | `0.0.0.0`   | UI server bind address                |
| `CC_WWWROOT_PORT`      | `60050`     | UI server port                        |
| `CC_QUICKCHART_HOST`   | —           | Self-hosted QuickChart instance URL   |

## ⚙️ Default Behaviors

When your strategy module does not register an exchange, frame, or strategy name, the CLI falls back to built-in defaults and prints a console warning:

| Component    | Default                        | Warning                                                                   |
|--------------|--------------------------------|---------------------------------------------------------------------------|
| **Exchange** | CCXT Binance (`default_exchange`) | `Warning: The default exchange schema is set to CCXT Binance...`       |
| **Frame**    | February 2024 (`default_frame`)   | `Warning: The default frame schema is set to February 2024...`         |
| **Symbol**   | `BTCUSDT`                         | —                                                                      |
| **Cache intervals** | `1m, 15m, 30m, 4h`         | Used if `--cacheInterval` not provided; skip entirely with `--noCache` |

> **Note:** The default exchange schema **does not support order book fetching in backtest mode**. If your strategy calls `getOrderBook()` during backtest, you must register a custom exchange schema with your own snapshot storage.

## 🔧 Programmatic API

In addition to the CLI, `@backtest-kit/cli` can be used as a library — call `run()` directly from your own script without spawning a child process or parsing CLI flags.

### `run(mode, args)`

```typescript
import { run } from '@backtest-kit/cli';

await run(mode, args);
```

| Parameter | Description |
|-----------|-------------|
| `mode` | `"backtest" \| "paper" \| "live"` — Execution mode |
| `args` | Mode-specific options (all optional — same defaults as CLI) |

`run()` can be called **only once per process**. A second call throws `"Should be called only once"`.

### Payload fields

**Backtest** (`mode: "backtest"`):

| Field | Type | Description |
|-------|------|-------------|
| `entryPoint` | `string` | Path to strategy entry point file |
| `symbol` | `string` | Trading pair (default: `"BTCUSDT"`) |
| `strategy` | `string` | Strategy name (default: first registered) |
| `exchange` | `string` | Exchange name (default: first registered) |
| `frame` | `string` | Frame name (default: first registered) |
| `cacheInterval` | `CandleInterval[]` | Intervals to pre-cache (default: `["1m","15m","30m","1h","4h"]`) |
| `noCache` | `boolean` | Skip candle cache warming (default: `false`) |
| `verbose` | `boolean` | Log each candle fetch (default: `false`) |

**Paper** and **Live** (`mode: "paper"` / `mode: "live"`):

| Field | Type | Description |
|-------|------|-------------|
| `entryPoint` | `string` | Path to strategy entry point file |
| `symbol` | `string` | Trading pair (default: `"BTCUSDT"`) |
| `strategy` | `string` | Strategy name (default: first registered) |
| `exchange` | `string` | Exchange name (default: first registered) |
| `verbose` | `boolean` | Log each candle fetch (default: `false`) |

### Examples

**Backtest:**

```typescript
import { run } from '@backtest-kit/cli';

await run('backtest', {
  entryPoint: './src/index.mjs',
  symbol: 'ETHUSDT',
  frame: 'feb-2024',
  cacheInterval: ['1m', '15m', '1h'],
  verbose: true,
});
```

**Paper trading:**

```typescript
import { run } from '@backtest-kit/cli';

await run('paper', {
  entryPoint: './src/index.mjs',
  symbol: 'BTCUSDT',
});
```

**Live trading:**

```typescript
import { run } from '@backtest-kit/cli';

await run('live', {
  entryPoint: './src/index.mjs',
  symbol: 'BTCUSDT',
  verbose: true,
});
```

## 💡 Why Use @backtest-kit/cli?

Instead of writing infrastructure code for every project:

**❌ Without @backtest-kit/cli (manual setup)**

```typescript
// index.ts
import { setLogger, setConfig, Storage, Notification, Report, Markdown } from 'backtest-kit';
import { serve } from '@backtest-kit/ui';

setLogger({ log: console.log, ... });
Storage.enable();
Notification.enable();
Report.enable();
Markdown.disable();

// ... parse CLI args manually
// ... register exchange schema
// ... warm candle cache
// ... set up Telegram bot
// ... handle SIGINT gracefully
// ... load and run backtest
```

**✅ With @backtest-kit/cli (one script)**

```json
{ "scripts": { "backtest": "npx @backtest-kit/cli --backtest --ui --telegram ./src/index.mjs" } }
```

```bash
npm run backtest
```

**Benefits:**

- 🚀 From zero to running backtest in seconds
- 💾 Automatic candle cache warming with retry logic
- 🌐 Production-ready web dashboard out of the box
- 📬 Telegram notifications with price charts — no chart code needed
- 🛑 Graceful shutdown on SIGINT — no hanging processes
- 🔌 Works with any `backtest-kit` strategy file as-is
- 🧩 Broker adapter hooks via side-effect module files — no CLI internals to touch

## 🤝 Contribute

Fork/PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

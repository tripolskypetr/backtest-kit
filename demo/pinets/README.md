---
title: demo/pinets/readme
group: demo/pinets
---

# Pine Script Runner

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/pinets)

Pine Script execution and backtesting system using `@backtest-kit/pinets` and real market data via CCXT.

## Purpose

Demonstrates Pine Script integration capabilities for:
- Running Pine Script indicators against live market data
- Multi-symbol data via `request.security` calls
- Markdown report generation from plot outputs
- Exchange-agnostic candle data sourcing through CCXT

## Key Features

- **Pine Script Execution**: Run `.pine` indicator files directly from Node.js
- **request.security Support**: Fetch higher-timeframe or cross-symbol data inside Pine Script
- **CCXT Integration**: Fetch candles from any supported exchange (Binance spot by default)
- **Markdown Output**: Render plot results as a formatted markdown table
- **Candle Dump Cache**: Local JSON cache of historical candles for offline/repeated runs

## Technology Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: backtest-kit 6.4.0
- **Pine Runner**: @backtest-kit/pinets 6.4.0
- **Utilities**: functools-kit 1.0.95
- **Data Source**: ccxt 4.5.24 (Binance spot)

## Project Structure

```
demo/pinets/
├── math/
│   └── test_request_security.pine  # Example Pine Script indicator
├── src/
│   └── index.mjs                   # Main runner configuration
├── dump/                            # Cached candle data (auto-generated)
├── package.json                     # Dependencies and scripts
└── README.md                        # This file
```

## Installation and Setup

```bash
# Navigate to project directory
cd demo/pinets

# Install dependencies
npm install

# Run the Pine Script
npm start
```

## Configuration

### Runner Configuration

The runner is pre-configured in `src/index.mjs`:

- **Symbol**: ETHUSDT
- **Timeframe**: 15m
- **Limit**: 180 candles
- **Start Date**: 2025-09-24T12:00:00.000Z
- **Exchange**: Binance spot (via CCXT)

### Signal Schema

```javascript
const SIGNAL_SCHEMA = {
  position: "Position",
  close:    "Close",
  btcClose: "BTC Close",
};
```

Maps Pine Script plot names to markdown column headers.

## Usage Examples

### Basic Usage

Run the indicator and print markdown output:

```bash
npm start
```

Output:
```
| Time | Position | Close | BTC Close |
|------|----------|-------|-----------|
| ...  | 0        | ...   | ...       |
```

### Changing the Symbol or Timeframe

Edit `src/index.mjs`:

```javascript
const plots = await run(
  File.fromPath("test_request_security.pine", "./math"),
  {
    symbol: "BTCUSDT",   // Change symbol
    timeframe: "1h",     // Change timeframe
    limit: 100,          // Change candle count
  },
  "ccxt-exchange",
  new Date("2025-10-01T00:00:00.000Z"),
);
```

### Writing a Custom Pine Script

Create a new `.pine` file in `./math/` and reference it in `src/index.mjs`:

```javascript
const plots = await run(
  File.fromPath("my_indicator.pine", "./math"),
  { symbol: "SOLUSDT", timeframe: "5m", limit: 200 },
  "ccxt-exchange",
  new Date("2025-10-01T00:00:00.000Z"),
);
```

## How It Works

### Phase 1: Exchange Setup

`addExchangeSchema` registers a named exchange that fetches OHLCV candles via CCXT:

```javascript
addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => { ... },
});
```

### Phase 2: Pine Script Execution

`run()` loads the `.pine` file, feeds it candles from the registered exchange, and resolves all `request.security` calls using the same exchange.

### Phase 3: Output Rendering

`toMarkdown()` converts the returned plot arrays into a markdown table, keyed by `SIGNAL_SCHEMA`.

## Related Projects

- [backtest-kit](https://github.com/tripolskypetr/backtest-kit) - Trading framework
- [functools-kit](https://www.npmjs.com/package/functools-kit) - Utility functions

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

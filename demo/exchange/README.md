---
title: demo/exchange/readme
group: demo/exchange
---

# Exchange Schema Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/exchange)

Reference implementation of a full `addExchangeSchema` setup using CCXT and Binance spot.

## Purpose

Demonstrates how to wire a real exchange into backtest-kit for:
- OHLCV candle fetching with proper timestamp handling
- Price and quantity formatting via market tick/step size
- Order book fetching (live only)
- Aggregated trade history fetching

## Key Features

- **Candle Fetching**: `fetchOHLCV` mapped to backtest-kit candle format
- **Price Formatting**: Tick-size-aware rounding via `roundTicks`
- **Quantity Formatting**: Step-size-aware rounding via `roundTicks`
- **Order Book**: Live order book via `fetchOrderBook` (backtest mode throws)
- **Aggregated Trades**: Historical trade data via Binance `publicGetAggTrades`
- **Singleton Exchange**: One CCXT instance reused across all calls via `singleshot`

## Technology Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: backtest-kit 6.5.0
- **Utilities**: functools-kit 1.0.95
- **Data Source**: ccxt 4.5.24 (Binance spot)

## Project Structure

```
demo/exchange/
├── src/
│   └── index.mjs   # Exchange schema registration and smoke test
├── package.json    # Dependencies and scripts
└── README.md       # This file
```

## Installation and Setup

```bash
# Navigate to project directory
cd demo/exchange

# Install dependencies
npm install

# Run the demo
npm start
```

## Usage Examples

### Basic Usage

Registers the exchange schema and fetches 5 candles for BTCUSDT/1m:

```bash
npm start
```

Output:
```javascript
[
  { timestamp: ..., open: ..., high: ..., low: ..., close: ..., volume: ... },
  ...
]
```

### Reusing the Schema in Your Project

Copy `addExchangeSchema` block from `src/index.mjs` into your own strategy file and reference it by name:

```javascript
import { Exchange } from "backtest-kit";

const candles = await Exchange.getCandles("ETHUSDT", "15m", 100, {
  exchangeName: "ccxt-exchange",
});
```

### Customizing the Exchange

Replace `ccxt.binance` with any other CCXT-supported exchange:

```javascript
const exchange = new ccxt.bybit({
  enableRateLimit: true,
});
```

## How It Works

### Exchange Initialization

A single Binance spot instance is created lazily via `singleshot` and reused across all calls:

```javascript
const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({ ... });
  await exchange.loadMarkets();
  return exchange;
});
```

### Price / Quantity Formatting

Uses market `limits` (tick size / step size) with `roundTicks` fallback to CCXT precision methods:

```javascript
const tickSize = market.limits?.price?.min || market.precision?.price;
return tickSize !== undefined
  ? roundTicks(price, tickSize)
  : exchange.priceToPrecision(symbol, price);
```

### Order Book

Returns normalized `{ asks, bids }` arrays with string price/quantity. Throws in backtest mode — implement your own snapshot replay if needed.

### Aggregated Trades

Uses Binance-specific `publicGetAggTrades` endpoint with `startTime`/`endTime` window.

## Related Projects

- [backtest-kit](https://github.com/tripolskypetr/backtest-kit) - Trading framework
- [functools-kit](https://www.npmjs.com/package/functools-kit) - Utility functions

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

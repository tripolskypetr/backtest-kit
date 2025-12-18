---
title: design/37_exchange-configuration
group: design
---

# Exchange Configuration

## Purpose

This document describes how to configure exchange data sources in Backtest Kit using the `IExchangeSchema` interface. An exchange configuration defines how the framework fetches historical candle data, formats prices and quantities, and calculates VWAP for realistic trade execution.

For information about candle data structure and validation, see [Candle Data & Validation](./36_exchanges-data-sources.md). For CCXT-specific integration patterns, see [CCXT Integration](./36_exchanges-data-sources.md).

---

## Overview

The exchange system provides market data abstraction through three key components:

| Component | Purpose | Location |
|-----------|---------|----------|
| `IExchangeSchema` | User-defined configuration schema | `types.d.ts:122-155` |
| `addExchange()` | Registration function | `src/function/add.ts` |
| `ClientExchange` | Internal client implementation | `src/client/ClientExchange.ts` |

An exchange schema must implement methods for fetching candles (`getCandles`), formatting prices and quantities according to exchange precision rules, and optionally handling lifecycle callbacks.


---

## Configuration Flow

![Mermaid Diagram](./diagrams\37_exchange-configuration_0.svg)

**Diagram: Exchange Configuration and Usage Flow**

The user defines an `IExchangeSchema` and registers it via `addExchange()`. The system validates uniqueness, stores the schema in `ToolRegistry`, and creates a memoized `ClientExchange` instance during execution. Strategies access exchange methods through `getCandles()` and `getAveragePrice()` helper functions.


---

## IExchangeSchema Interface

![Mermaid Diagram](./diagrams\37_exchange-configuration_1.svg)

**Diagram: IExchangeSchema Structure**

The schema consists of four required methods and one optional callbacks object. All methods are async to support API calls or database queries.


---

## Required Methods

### getCandles()

Fetches historical OHLCV candle data from the exchange API or database.

**Signature:**
```typescript
getCandles: (
  symbol: string,      // Trading pair (e.g., "BTCUSDT")
  interval: CandleInterval,  // Time interval (e.g., "1m", "1h")
  since: Date,         // Start date for data fetching
  limit: number        // Maximum number of candles to return
) => Promise<ICandleData[]>
```

**Requirements:**
- Return candles sorted by timestamp ascending
- Each candle must have all OHLCV fields populated
- Timestamps should be in milliseconds (Unix epoch)
- Handle API rate limits and retry logic internally
- Return empty array if no data available

**Example Implementation:**
```typescript
// From README.md example
getCandles: async (symbol, interval, since, limit) => {
  const exchange = new ccxt.binance();
  const ohlcv = await exchange.fetchOHLCV(
    symbol, 
    interval, 
    since.getTime(), 
    limit
  );
  return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
    timestamp,
    open,
    high,
    low,
    close,
    volume
  }));
}
```


---

### formatPrice()

Formats price values according to exchange precision rules (e.g., 2 decimals for BTC pairs, 8 for altcoins).

**Signature:**
```typescript
formatPrice: (
  symbol: string,  // Trading pair
  price: number    // Raw price value
) => Promise<string>  // Formatted price string
```

**Purpose:**
- Ensure prices meet exchange precision requirements
- Prevent order rejection due to invalid price formatting
- Used when logging signals and calculating PNL

**Example Implementation:**
```typescript
formatPrice: async (symbol, price) => {
  // Simple fixed decimal approach
  return price.toFixed(2);
  
  // Or use exchange-specific precision
  const market = await exchange.loadMarkets();
  const precision = market[symbol].precision.price;
  return price.toFixed(precision);
}
```


---

### formatQuantity()

Formats quantity/size values according to exchange lot size rules.

**Signature:**
```typescript
formatQuantity: (
  symbol: string,    // Trading pair
  quantity: number   // Raw quantity value
) => Promise<string>  // Formatted quantity string
```

**Purpose:**
- Ensure quantities meet exchange minimum/maximum size requirements
- Apply lot size increments correctly
- Prevent order rejection due to invalid quantity formatting

**Example Implementation:**
```typescript
formatQuantity: async (symbol, quantity) => {
  // Fixed decimal approach
  return quantity.toFixed(8);
  
  // Or use exchange-specific precision
  const market = await exchange.loadMarkets();
  const precision = market[symbol].precision.amount;
  return quantity.toFixed(precision);
}
```


---

## Optional Callbacks

The `callbacks` field enables lifecycle event hooks for monitoring and debugging.

### IExchangeCallbacks

| Callback | Trigger | Parameters | Use Case |
|----------|---------|------------|----------|
| `onCandleData` | After `getCandles()` completes | `symbol`, `interval`, `since`, `limit`, `data` | Logging, debugging, cache invalidation |

**Example:**
```typescript
addExchange({
  exchangeName: 'binance',
  getCandles: async (symbol, interval, since, limit) => {
    // ... fetch implementation
  },
  callbacks: {
    onCandleData: (symbol, interval, since, limit, data) => {
      console.log(`Fetched ${data.length} candles for ${symbol} (${interval})`);
      console.log(`Date range: ${since} to ${data[data.length - 1]?.timestamp}`);
    }
  },
  // ... other methods
});
```


---

## Registration with addExchange()

![Mermaid Diagram](./diagrams\37_exchange-configuration_2.svg)

**Diagram: addExchange() Registration Flow**

The registration process validates uniqueness to prevent accidental overwrites, then stores the schema in `ToolRegistry` for retrieval during execution.

**Validation Rules:**
- `exchangeName` must be unique across all registered exchanges
- All required methods (`getCandles`, `formatPrice`, `formatQuantity`) must be provided
- Callbacks are optional


---

## ClientExchange Implementation

The framework instantiates `ClientExchange` using the provided schema. This client implements additional logic around the user-defined methods.

![Mermaid Diagram](./diagrams\37_exchange-configuration_3.svg)

**Diagram: ClientExchange Method Structure**

`ClientExchange` wraps the user-defined schema and adds execution context awareness. The `getCandles()` method automatically respects the temporal context to prevent look-ahead bias.

**Key Implementation Details:**
- **Temporal Context:** `getCandles()` uses `ExecutionContextService.context.when` to limit data to current backtest time
- **Memoization:** One `ClientExchange` instance per `exchangeName` (via `ExchangeConnectionService`)
- **VWAP Calculation:** Default uses 5 one-minute candles (configurable via `CC_AVG_PRICE_CANDLES_COUNT`)
- **Callback Invocation:** `onCandleData` triggered after successful `getCandles()` execution


---

## VWAP Pricing for Realistic Execution

The `getAveragePrice()` method calculates Volume Weighted Average Price to simulate realistic entry/exit prices.

### VWAP Formula

```
Typical Price (TP) = (High + Low + Close) / 3

VWAP = Σ(TP × Volume) / Σ(Volume)
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `CC_AVG_PRICE_CANDLES_COUNT` | 5 | Number of 1-minute candles to use for VWAP |

**Example:**
```typescript
import { setConfig } from 'backtest-kit';

setConfig({
  CC_AVG_PRICE_CANDLES_COUNT: 10  // Use 10 candles instead of 5
});
```

### When VWAP is Used

- **Signal Opening:** When `priceOpen` is not specified (immediate market entry)
- **Signal Monitoring:** Checking take profit and stop loss conditions
- **Scheduled Signal Activation:** Determining when `priceOpen` is reached


---

## Integration with Strategy Execution

Strategies access exchange functionality through helper functions that automatically resolve the correct exchange instance.

![Mermaid Diagram](./diagrams\37_exchange-configuration_4.svg)

**Diagram: Strategy to Exchange Data Flow**

The framework uses dependency injection to automatically route strategy calls to the correct exchange instance based on execution context.

**Helper Functions:**
- `getCandles(symbol, interval, limit)` - Fetch historical candles
- `getAveragePrice(symbol)` - Calculate current VWAP
- `formatPrice(symbol, price)` - Format price for logging
- `formatQuantity(symbol, quantity)` - Format quantity for logging


---

## Complete Configuration Example

### Basic CCXT Integration

```typescript
import ccxt from 'ccxt';
import { addExchange } from 'backtest-kit';

addExchange({
  exchangeName: 'binance',
  note: 'Binance exchange for BTC/USDT pairs',
  
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(
      symbol,
      interval,
      since.getTime(),
      limit
    );
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume
    }));
  },
  
  formatPrice: async (symbol, price) => {
    return price.toFixed(2);
  },
  
  formatQuantity: async (symbol, quantity) => {
    return quantity.toFixed(8);
  },
  
  callbacks: {
    onCandleData: (symbol, interval, since, limit, data) => {
      console.log(`[EXCHANGE] Fetched ${data.length}/${limit} candles for ${symbol}`);
    }
  }
});
```

### Custom Database Integration

```typescript
import { addExchange } from 'backtest-kit';
import { db } from './database';

addExchange({
  exchangeName: 'historical-db',
  note: 'Local database with historical OHLCV data',
  
  getCandles: async (symbol, interval, since, limit) => {
    // Query local database
    const candles = await db.query(
      `SELECT timestamp, open, high, low, close, volume
       FROM candles
       WHERE symbol = ? AND interval = ? AND timestamp >= ?
       ORDER BY timestamp ASC
       LIMIT ?`,
      [symbol, interval, since.getTime(), limit]
    );
    return candles;
  },
  
  formatPrice: async (symbol, price) => {
    // Lookup precision from database
    const precision = await db.getPricePrecision(symbol);
    return price.toFixed(precision);
  },
  
  formatQuantity: async (symbol, quantity) => {
    const precision = await db.getQuantityPrecision(symbol);
    return quantity.toFixed(precision);
  }
});
```


---

## Common Configuration Patterns

### Retry Logic for API Failures

```typescript
async function fetchWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

addExchange({
  exchangeName: 'robust-exchange',
  getCandles: async (symbol, interval, since, limit) => {
    return fetchWithRetry(async () => {
      const exchange = new ccxt.binance();
      const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
      // ... map to ICandleData
    });
  },
  // ... other methods
});
```

### Caching Candle Data

```typescript
const candleCache = new Map();

addExchange({
  exchangeName: 'cached-exchange',
  getCandles: async (symbol, interval, since, limit) => {
    const cacheKey = `${symbol}-${interval}-${since.getTime()}-${limit}`;
    
    if (candleCache.has(cacheKey)) {
      return candleCache.get(cacheKey);
    }
    
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    const candles = ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume
    }));
    
    candleCache.set(cacheKey, candles);
    return candles;
  },
  callbacks: {
    onCandleData: (symbol, interval, since, limit, data) => {
      // Clear cache on new data
      candleCache.clear();
    }
  },
  // ... other methods
});
```

### Multiple Exchange Support

```typescript
// Configure multiple exchanges for arbitrage or comparison
addExchange({ exchangeName: 'binance', /* ... */ });
addExchange({ exchangeName: 'coinbase', /* ... */ });
addExchange({ exchangeName: 'kraken', /* ... */ });

// Use different exchanges in strategies
addStrategy({
  strategyName: 'binance-strategy',
  interval: '5m',
  getSignal: async (symbol, when) => {
    const candles = await getCandles(symbol, '1h', 24);
    // Uses 'binance' exchange (from execution context)
  }
});
```


---

## Summary

The exchange configuration system provides flexible market data abstraction through:

1. **Schema-Based Configuration:** Define data sources via `IExchangeSchema` interface
2. **Required Methods:** Implement `getCandles()`, `formatPrice()`, `formatQuantity()`
3. **Optional Callbacks:** Monitor data fetching via `onCandleData` lifecycle hook
4. **Temporal Context:** Automatic look-ahead bias prevention through `ExecutionContextService`
5. **VWAP Pricing:** Realistic entry/exit simulation using volume-weighted prices
6. **Memoization:** Efficient instance caching per exchange name

For specific integration patterns with CCXT, see [CCXT Integration](./36_exchanges-data-sources.md). For details on candle data structure and validation, see [Candle Data & Validation](./36_exchanges-data-sources.md).


---
title: docs/class/ExchangeUtils
group: docs
---

# ExchangeUtils

Utility class for exchange operations.

Provides simplified access to exchange schema methods with validation.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### _getInstance

```ts
_getInstance: any
```

Memoized function to get or create ExchangeInstance for an exchange.
Each exchange gets its own isolated instance.

### getCandles

```ts
getCandles: (symbol: string, interval: CandleInterval, limit: number, context: { exchangeName: string; }) => Promise<ICandleData[]>
```

Fetch candles from data source (API or database).

Automatically calculates the start date based on Date.now() and the requested interval/limit.
Uses the same logic as ClientExchange to ensure backwards compatibility.

### getAveragePrice

```ts
getAveragePrice: (symbol: string, context: { exchangeName: string; }) => Promise<number>
```

Calculates VWAP (Volume Weighted Average Price) from last N 1m candles.

### formatQuantity

```ts
formatQuantity: (symbol: string, quantity: number, context: { exchangeName: string; }) => Promise<string>
```

Format quantity according to exchange precision rules.

### formatPrice

```ts
formatPrice: (symbol: string, price: number, context: { exchangeName: string; }) => Promise<string>
```

Format price according to exchange precision rules.

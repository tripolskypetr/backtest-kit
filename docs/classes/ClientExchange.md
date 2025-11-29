---
title: docs/api-reference/class/ClientExchange
group: docs
---

# ClientExchange

Implements `IExchange`

Client implementation for exchange data access.

Features:
- Historical candle fetching (backwards from execution context)
- Future candle fetching (forwards for backtest)
- VWAP calculation from last 5 1m candles
- Price/quantity formatting for exchange

All methods use prototype functions for memory efficiency.

## Constructor

```ts
constructor(params: IExchangeParams);
```

## Properties

### params

```ts
params: IExchangeParams
```

## Methods

### getCandles

```ts
getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
```

Fetches historical candles backwards from execution context time.

### getNextCandles

```ts
getNextCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
```

Fetches future candles forwards from execution context time.
Used in backtest mode to get candles for signal duration.

### getAveragePrice

```ts
getAveragePrice(symbol: string): Promise<number>;
```

Calculates VWAP (Volume Weighted Average Price) from last N 1m candles.
The number of candles is configurable via GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT.

Formula:
- Typical Price = (high + low + close) / 3
- VWAP = sum(typical_price * volume) / sum(volume)

If volume is zero, returns simple average of close prices.

### formatQuantity

```ts
formatQuantity(symbol: string, quantity: number): Promise<string>;
```

Format quantity for exchange precision.

### formatPrice

```ts
formatPrice(symbol: string, price: number): Promise<string>;
```

Format price for exchange precision.

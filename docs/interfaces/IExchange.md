---
title: docs/interface/IExchange
group: docs
---

# IExchange

Exchange interface implemented by ClientExchange.
Provides candle data access and VWAP calculation.

## Properties

### getCandles

```ts
getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>
```

Fetch historical candles backwards from execution context time.

### getNextCandles

```ts
getNextCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>
```

Fetch future candles forward from execution context time (for backtest).

### formatQuantity

```ts
formatQuantity: (symbol: string, quantity: number) => Promise<string>
```

Format quantity for exchange precision.

### formatPrice

```ts
formatPrice: (symbol: string, price: number) => Promise<string>
```

Format price for exchange precision.

### getAveragePrice

```ts
getAveragePrice: (symbol: string) => Promise<number>
```

Calculate VWAP from last 5 1-minute candles.

Formula: VWAP = Σ(Typical Price × Volume) / Σ(Volume)
where Typical Price = (High + Low + Close) / 3

### getOrderBook

```ts
getOrderBook: (symbol: string) => Promise<IOrderBookData>
```

Fetch order book for a trading pair.

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
getOrderBook: (symbol: string, depth?: number) => Promise<IOrderBookData>
```

Fetch order book for a trading pair.

### getRawCandles

```ts
getRawCandles: (symbol: string, interval: CandleInterval, limit?: number, sDate?: number, eDate?: number) => Promise<ICandleData[]>
```

Fetch raw candles with flexible date/limit parameters.

All modes respect execution context and prevent look-ahead bias.

Parameter combinations:
1. sDate + eDate + limit: fetches with explicit parameters, validates eDate &lt;= when
2. sDate + eDate: calculates limit from date range, validates eDate &lt;= when
3. eDate + limit: calculates sDate backward, validates eDate &lt;= when
4. sDate + limit: fetches forward, validates calculated endTimestamp <= when
5. Only limit: uses execution.context.when as reference (backward)

---
title: docs/class/ClientExchange
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

Formats quantity according to exchange-specific rules for the given symbol.
Applies proper decimal precision and rounding based on symbol's lot size filters.

### formatPrice

```ts
formatPrice(symbol: string, price: number): Promise<string>;
```

Formats price according to exchange-specific rules for the given symbol.
Applies proper decimal precision and rounding based on symbol's price filters.

### getRawCandles

```ts
getRawCandles(symbol: string, interval: CandleInterval, limit?: number, sDate?: number, eDate?: number): Promise<ICandleData[]>;
```

Fetches raw candles with flexible date/limit parameters.

All modes respect execution context and prevent look-ahead bias.

Parameter combinations:
1. sDate + eDate + limit: fetches with explicit parameters, validates eDate &lt;= when
2. sDate + eDate: calculates limit from date range, validates eDate &lt;= when
3. eDate + limit: calculates sDate backward, validates eDate &lt;= when
4. sDate + limit: fetches forward, validates calculated endTimestamp <= when
5. Only limit: uses execution.context.when as reference (backward)

Edge cases:
- If calculated limit is 0 or negative: throws error
- If sDate &gt;= eDate: throws error
- If eDate &gt; when: throws error to prevent look-ahead bias

### getOrderBook

```ts
getOrderBook(symbol: string, depth?: number): Promise<IOrderBookData>;
```

Fetches order book for a trading pair.

Calculates time range based on execution context time (when) and
CC_ORDER_BOOK_TIME_OFFSET_MINUTES, then delegates to the exchange
schema implementation which may use or ignore the time range.

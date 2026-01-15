---
title: docs/interface/IExchangeSchema
group: docs
---

# IExchangeSchema

Exchange schema registered via addExchange().
Defines candle data source and formatting logic.

## Properties

### exchangeName

```ts
exchangeName: string
```

Unique exchange identifier for registration

### note

```ts
note: string
```

Optional developer note for documentation

### getCandles

```ts
getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number, backtest: boolean) => Promise<ICandleData[]>
```

Fetch candles from data source (API or database).

### formatQuantity

```ts
formatQuantity: (symbol: string, quantity: number, backtest: boolean) => Promise<string>
```

Format quantity according to exchange precision rules.

Optional. If not provided, defaults to Bitcoin precision on Binance (8 decimal places).

### formatPrice

```ts
formatPrice: (symbol: string, price: number, backtest: boolean) => Promise<string>
```

Format price according to exchange precision rules.

Optional. If not provided, defaults to Bitcoin precision on Binance (2 decimal places).

### getOrderBook

```ts
getOrderBook: (symbol: string, depth: number, from: Date, to: Date, backtest: boolean) => Promise<IOrderBookData>
```

Fetch order book for a trading pair.

Optional. If not provided, throws an error when called.

### callbacks

```ts
callbacks: Partial<IExchangeCallbacks>
```

Optional lifecycle event callbacks (onCandleData)

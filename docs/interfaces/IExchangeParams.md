---
title: docs/interface/IExchangeParams
group: docs
---

# IExchangeParams

Exchange parameters passed to ClientExchange constructor.
Combines schema with runtime dependencies.
Note: All exchange methods are required in params (defaults are applied during initialization).

## Properties

### logger

```ts
logger: ILogger
```

Logger service for debug output

### execution

```ts
execution: { readonly context: IExecutionContext; }
```

Execution context service (symbol, when, backtest flag)

### getCandles

```ts
getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number, backtest: boolean) => Promise<ICandleData[]>
```

Fetch candles from data source (required, defaults applied)

### formatQuantity

```ts
formatQuantity: (symbol: string, quantity: number, backtest: boolean) => Promise<string>
```

Format quantity according to exchange precision rules (required, defaults applied)

### formatPrice

```ts
formatPrice: (symbol: string, price: number, backtest: boolean) => Promise<string>
```

Format price according to exchange precision rules (required, defaults applied)

### getOrderBook

```ts
getOrderBook: (symbol: string, depth: number, from: Date, to: Date, backtest: boolean) => Promise<IOrderBookData>
```

Fetch order book for a trading pair (required, defaults applied)

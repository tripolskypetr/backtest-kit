---
title: docs/class/ExchangeConnectionService
group: docs
---

# ExchangeConnectionService

Implements `IExchange`

Connection service routing exchange operations to correct ClientExchange instance.

Routes all IExchange method calls to the appropriate exchange implementation
based on methodContextService.context.exchangeName. Uses memoization to cache
ClientExchange instances for performance.

Key features:
- Automatic exchange routing via method context
- Memoized ClientExchange instances by exchangeName
- Implements full IExchange interface
- Logging for all operations

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### executionContextService

```ts
executionContextService: any
```

### exchangeSchemaService

```ts
exchangeSchemaService: any
```

### methodContextService

```ts
methodContextService: any
```

### getExchange

```ts
getExchange: ((exchangeName: string) => ClientExchange) & IClearableMemoize<string> & IControlMemoize<string, ClientExchange>
```

Retrieves memoized ClientExchange instance for given exchange name.

Creates ClientExchange on first call, returns cached instance on subsequent calls.
Cache key is exchangeName string.

### getCandles

```ts
getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>
```

Fetches historical candles for symbol using configured exchange.

Routes to exchange determined by methodContextService.context.exchangeName.

### getNextCandles

```ts
getNextCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>
```

Fetches next batch of candles relative to executionContext.when.

Returns candles that come after the current execution timestamp.
Used for backtest progression and live trading updates.

### getAveragePrice

```ts
getAveragePrice: (symbol: string) => Promise<number>
```

Retrieves current average price for symbol.

In live mode: fetches real-time average price from exchange API.
In backtest mode: calculates VWAP from candles in current timeframe.

### formatPrice

```ts
formatPrice: (symbol: string, price: number) => Promise<string>
```

Formats price according to exchange-specific precision rules.

Ensures price meets exchange requirements for decimal places and tick size.

### formatQuantity

```ts
formatQuantity: (symbol: string, quantity: number) => Promise<string>
```

Formats quantity according to exchange-specific precision rules.

Ensures quantity meets exchange requirements for decimal places and lot size.

### getOrderBook

```ts
getOrderBook: (symbol: string) => Promise<IOrderBookData>
```

Fetches order book for a trading pair using configured exchange.

Routes to exchange determined by methodContextService.context.exchangeName.

---
title: docs/class/ExchangeCoreService
group: docs
---

# ExchangeCoreService

Implements `TExchange`

Global service for exchange operations with execution context injection.

Wraps ExchangeConnectionService with ExecutionContextService to inject
symbol, when, and backtest parameters into the execution context.

Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### exchangeConnectionService

```ts
exchangeConnectionService: any
```

### methodContextService

```ts
methodContextService: any
```

### exchangeValidationService

```ts
exchangeValidationService: any
```

### validate

```ts
validate: any
```

Validates exchange configuration.
Memoized to avoid redundant validations for the same exchange.
Logs validation activity.

### getCandles

```ts
getCandles: (symbol: string, interval: CandleInterval, limit: number, when: Date, backtest: boolean) => Promise<ICandleData[]>
```

Fetches historical candles with execution context.

### getNextCandles

```ts
getNextCandles: (symbol: string, interval: CandleInterval, limit: number, when: Date, backtest: boolean) => Promise<ICandleData[]>
```

Fetches future candles (backtest mode only) with execution context.

### getAveragePrice

```ts
getAveragePrice: (symbol: string, when: Date, backtest: boolean) => Promise<number>
```

Calculates VWAP with execution context.

### formatPrice

```ts
formatPrice: (symbol: string, price: number, when: Date, backtest: boolean) => Promise<string>
```

Formats price with execution context.

### formatQuantity

```ts
formatQuantity: (symbol: string, quantity: number, when: Date, backtest: boolean) => Promise<string>
```

Formats quantity with execution context.

### getOrderBook

```ts
getOrderBook: (symbol: string, when: Date, backtest: boolean, depth?: number) => Promise<IOrderBookData>
```

Fetches order book with execution context.

Sets up execution context with the provided when/backtest parameters.
The exchange implementation will receive time range parameters but may
choose to use them (backtest) or ignore them (live).

### getRawCandles

```ts
getRawCandles: (symbol: string, interval: CandleInterval, when: Date, backtest: boolean, limit?: number, sDate?: number, eDate?: number) => Promise<ICandleData[]>
```

Fetches raw candles with flexible date/limit parameters and execution context.

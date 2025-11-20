---
title: docs/api-reference/class/ExchangeGlobalService
group: docs
---

# ExchangeGlobalService

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

---
title: docs/api-reference/class/StrategyGlobalService
group: docs
---

# StrategyGlobalService

Global service for strategy operations with execution context injection.

Wraps StrategyConnectionService with ExecutionContextService to inject
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

### strategyConnectionService

```ts
strategyConnectionService: any
```

### strategySchemaService

```ts
strategySchemaService: any
```

### riskValidationService

```ts
riskValidationService: any
```

### strategyValidationService

```ts
strategyValidationService: any
```

### methodContextService

```ts
methodContextService: any
```

### validate

```ts
validate: any
```

Validates strategy and associated risk configuration.

Memoized to avoid redundant validations for the same symbol-strategy pair.
Logs validation activity.

### getPendingSignal

```ts
getPendingSignal: (symbol: string, strategyName: string) => Promise<ISignalRow>
```

Retrieves the currently active pending signal for the symbol.
If no active signal exists, returns null.
Used internally for monitoring TP/SL and time expiration.

### getStopped

```ts
getStopped: (symbol: string, strategyName: string) => Promise<boolean>
```

Checks if the strategy has been stopped.

Validates strategy existence and delegates to connection service
to retrieve the stopped state from the strategy instance.

### tick

```ts
tick: (symbol: string, when: Date, backtest: boolean) => Promise<IStrategyTickResult>
```

Checks signal status at a specific timestamp.

Wraps strategy tick() with execution context containing symbol, timestamp,
and backtest mode flag.

### backtest

```ts
backtest: (symbol: string, candles: ICandleData[], when: Date, backtest: boolean) => Promise<IStrategyBacktestResult>
```

Runs fast backtest against candle array.

Wraps strategy backtest() with execution context containing symbol,
timestamp, and backtest mode flag.

### stop

```ts
stop: (ctx: { symbol: string; strategyName: string; }, backtest: boolean) => Promise<void>
```

Stops the strategy from generating new signals.

Delegates to StrategyConnectionService.stop() to set internal flag.
Does not require execution context.

### clear

```ts
clear: (ctx?: { symbol: string; strategyName: string; }) => Promise<void>
```

Clears the memoized ClientStrategy instance from cache.

Delegates to StrategyConnectionService.clear() to remove strategy from cache.
Forces re-initialization of strategy on next operation.

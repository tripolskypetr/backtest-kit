---
title: docs/class/StrategyCoreService
group: docs
---

# StrategyCoreService

Implements `TStrategy`

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

### validate

```ts
validate: any
```

Validates strategy and associated risk configuration.

Memoized to avoid redundant validations for the same symbol-strategy-exchange-frame combination.
Logs validation activity.

### getPendingSignal

```ts
getPendingSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<ISignalRow>
```

Retrieves the currently active pending signal for the symbol.
If no active signal exists, returns null.
Used internally for monitoring TP/SL and time expiration.

### getScheduledSignal

```ts
getScheduledSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IScheduledSignalRow>
```

Retrieves the currently active scheduled signal for the symbol.
If no scheduled signal exists, returns null.
Used internally for monitoring scheduled signal activation.

### getStopped

```ts
getStopped: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks if the strategy has been stopped.

Validates strategy existence and delegates to connection service
to retrieve the stopped state from the strategy instance.

### tick

```ts
tick: (symbol: string, when: Date, backtest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IStrategyTickResult>
```

Checks signal status at a specific timestamp.

Wraps strategy tick() with execution context containing symbol, timestamp,
and backtest mode flag.

### backtest

```ts
backtest: (symbol: string, candles: ICandleData[], when: Date, backtest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IStrategyBacktestResult>
```

Runs fast backtest against candle array.

Wraps strategy backtest() with execution context containing symbol,
timestamp, and backtest mode flag.

### stop

```ts
stop: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Stops the strategy from generating new signals.

Delegates to StrategyConnectionService.stop() to set internal flag.
Does not require execution context.

### cancel

```ts
cancel: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, cancelId?: string) => Promise<void>
```

Cancels the scheduled signal without stopping the strategy.

Delegates to StrategyConnectionService.cancel() to clear scheduled signal
and emit cancelled event through emitters.
Does not require execution context.

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears the memoized ClientStrategy instance from cache.

Delegates to StrategyConnectionService.clear() to remove strategy from cache.
Forces re-initialization of strategy on next operation.

### partialProfit

```ts
partialProfit: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Executes partial close at profit level (moving toward TP).

Validates strategy existence and delegates to connection service
to close a percentage of the pending position at profit.

Does not require execution context as this is a direct state mutation.

### partialLoss

```ts
partialLoss: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Executes partial close at loss level (moving toward SL).

Validates strategy existence and delegates to connection service
to close a percentage of the pending position at loss.

Does not require execution context as this is a direct state mutation.

### trailingStop

```ts
trailingStop: (backtest: boolean, symbol: string, percentShift: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Adjusts the trailing stop-loss distance for an active pending signal.

Validates strategy existence and delegates to connection service
to update the stop-loss distance by a percentage adjustment.

Does not require execution context as this is a direct state mutation.

### breakeven

```ts
breakeven: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Moves stop-loss to breakeven when price reaches threshold.
Validates context and delegates to StrategyConnectionService.

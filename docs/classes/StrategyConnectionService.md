---
title: docs/class/StrategyConnectionService
group: docs
---

# StrategyConnectionService

Connection service routing strategy operations to correct ClientStrategy instance.

Routes all IStrategy method calls to the appropriate strategy implementation
based on symbol-strategy pairs. Uses memoization to cache
ClientStrategy instances for performance.

Key features:
- Automatic strategy routing via symbol-strategy pairs
- Memoized ClientStrategy instances by symbol:strategyName
- Ensures initialization with waitForInit() before operations
- Handles both tick() (live) and backtest() operations

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: LoggerService
```

### executionContextService

```ts
executionContextService: { readonly context: IExecutionContext; }
```

### strategySchemaService

```ts
strategySchemaService: StrategySchemaService
```

### riskConnectionService

```ts
riskConnectionService: RiskConnectionService
```

### exchangeConnectionService

```ts
exchangeConnectionService: ExchangeConnectionService
```

### methodContextService

```ts
methodContextService: { readonly context: IMethodContext; }
```

### partialConnectionService

```ts
partialConnectionService: PartialConnectionService
```

### getStrategy

```ts
getStrategy: any
```

Retrieves memoized ClientStrategy instance for given symbol-strategy pair.

Creates ClientStrategy on first call, returns cached instance on subsequent calls.
Cache key is symbol:strategyName string.

### getPendingSignal

```ts
getPendingSignal: (backtest: boolean, symbol: string, strategyName: string) => Promise<ISignalRow>
```

Retrieves the currently active pending signal for the strategy.
If no active signal exists, returns null.
Used internally for monitoring TP/SL and time expiration.

### getStopped

```ts
getStopped: (backtest: boolean, symbol: string, strategyName: string) => Promise<boolean>
```

Retrieves the stopped state of the strategy.

Delegates to the underlying strategy instance to check if it has been
marked as stopped and should cease operation.

### tick

```ts
tick: (symbol: string, strategyName: string) => Promise<IStrategyTickResult>
```

Executes live trading tick for current strategy.

Waits for strategy initialization before processing tick.
Evaluates current market conditions and returns signal state.

### backtest

```ts
backtest: (symbol: string, strategyName: string, candles: ICandleData[]) => Promise<IStrategyBacktestResult>
```

Executes backtest for current strategy with provided candles.

Waits for strategy initialization before processing candles.
Evaluates strategy signals against historical data.

### stop

```ts
stop: (backtest: boolean, ctx: { symbol: string; strategyName: string; }) => Promise<void>
```

Stops the specified strategy from generating new signals.

Delegates to ClientStrategy.stop() which sets internal flag to prevent
getSignal from being called on subsequent ticks.

### clear

```ts
clear: (backtest: boolean, ctx?: { symbol: string; strategyName: string; }) => Promise<void>
```

Clears the memoized ClientStrategy instance from cache.

Forces re-initialization of strategy on next getStrategy call.
Useful for resetting strategy state or releasing resources.

---
title: docs/class/StrategyConnectionService
group: docs
---

# StrategyConnectionService

Implements `TStrategy$1`

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

### methodContextService

```ts
methodContextService: { readonly context: IMethodContext; }
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

### partialConnectionService

```ts
partialConnectionService: PartialConnectionService
```

### breakevenConnectionService

```ts
breakevenConnectionService: BreakevenConnectionService
```

### actionCoreService

```ts
actionCoreService: ActionCoreService
```

### getStrategy

```ts
getStrategy: any
```

Retrieves memoized ClientStrategy instance for given symbol-strategy pair with exchange and frame isolation.

Creates ClientStrategy on first call, returns cached instance on subsequent calls.
Cache key includes exchangeName and frameName for proper isolation.

### getPendingSignal

```ts
getPendingSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<ISignalRow>
```

Retrieves the currently active pending signal for the strategy.
If no active signal exists, returns null.
Used internally for monitoring TP/SL and time expiration.

### getScheduledSignal

```ts
getScheduledSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IScheduledSignalRow>
```

Retrieves the currently active scheduled signal for the strategy.
If no scheduled signal exists, returns null.
Used internally for monitoring scheduled signal activation.

### getBreakeven

```ts
getBreakeven: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks if breakeven threshold has been reached for the current pending signal.

Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
to cover transaction costs and allow breakeven to be set.

Delegates to ClientStrategy.getBreakeven() with current execution context.

### getStopped

```ts
getStopped: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Retrieves the stopped state of the strategy.

Delegates to the underlying strategy instance to check if it has been
marked as stopped and should cease operation.

### tick

```ts
tick: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IStrategyTickResult>
```

Executes live trading tick for current strategy.

Waits for strategy initialization before processing tick.
Evaluates current market conditions and returns signal state.

### backtest

```ts
backtest: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, candles: ICandleData[]) => Promise<IStrategyBacktestResult>
```

Executes backtest for current strategy with provided candles.

Waits for strategy initialization before processing candles.
Evaluates strategy signals against historical data.

### stop

```ts
stop: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Stops the specified strategy from generating new signals.

Delegates to ClientStrategy.stop() which sets internal flag to prevent
getSignal from being called on subsequent ticks.

### dispose

```ts
dispose: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Disposes the ClientStrategy instance for the given context.

Calls dispose callback, then removes strategy from cache.

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears the memoized ClientStrategy instance from cache.

If payload is provided, disposes the specific strategy instance.
If no payload is provided, clears all strategy instances.

### cancel

```ts
cancel: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, cancelId?: string) => Promise<void>
```

Cancels the scheduled signal for the specified strategy.

Delegates to ClientStrategy.cancel() which clears the scheduled signal
without stopping the strategy or affecting pending signals.

Note: Cancelled event will be emitted on next tick() call when strategy
detects the scheduled signal was cancelled.

### partialProfit

```ts
partialProfit: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Executes partial close at profit level (moving toward TP).

Closes a percentage of the pending position at the current price, recording it as a "profit" type partial.
The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.

Delegates to ClientStrategy.partialProfit() with current execution context.

### partialLoss

```ts
partialLoss: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Executes partial close at loss level (moving toward SL).

Closes a percentage of the pending position at the current price, recording it as a "loss" type partial.
The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.

Delegates to ClientStrategy.partialLoss() with current execution context.

### trailingStop

```ts
trailingStop: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Adjusts the trailing stop-loss distance for an active pending signal.

Updates the stop-loss distance by a percentage adjustment relative to the original SL distance.
Positive percentShift tightens the SL (reduces distance), negative percentShift loosens it.

Delegates to ClientStrategy.trailingStop() with current execution context.

### trailingTake

```ts
trailingTake: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Adjusts the trailing take-profit distance for an active pending signal.

Updates the take-profit distance by a percentage adjustment relative to the original TP distance.
Negative percentShift brings TP closer to entry, positive percentShift moves it further.

Delegates to ClientStrategy.trailingTake() with current execution context.

### breakeven

```ts
breakeven: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Delegates to ClientStrategy.breakeven() with current execution context.

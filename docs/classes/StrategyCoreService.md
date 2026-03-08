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

### exchangeValidationService

```ts
exchangeValidationService: any
```

### frameValidationService

```ts
frameValidationService: any
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
getPendingSignal: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IPublicSignalRow>
```

Retrieves the currently active pending signal for the symbol.
If no active signal exists, returns null.
Used internally for monitoring TP/SL and time expiration.

### getTotalPercentClosed

```ts
getTotalPercentClosed: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the percentage of the position currently held (not closed).
100 = nothing has been closed (full position), 0 = fully closed.
Correctly accounts for DCA entries between partial closes.

### getTotalCostClosed

```ts
getTotalCostClosed: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the cost basis in dollars of the position currently held (not closed).
Correctly accounts for DCA entries between partial closes.

### getPositionAveragePrice

```ts
getPositionAveragePrice: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the effective (DCA-averaged) entry price for the current pending signal.
Returns null if no pending signal exists.

### getPositionInvestedCount

```ts
getPositionInvestedCount: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the number of DCA entries for the current pending signal.
1 = original entry only. Returns null if no pending signal exists.

### getPositionInvestedCost

```ts
getPositionInvestedCost: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the total invested cost basis in dollars (entryCount × $100).
Returns null if no pending signal exists.

### getPositionPnlPercent

```ts
getPositionPnlPercent: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the unrealized PNL percentage at currentPrice.
Accounts for partial closes, DCA entries, slippage and fees.
Returns null if no pending signal exists.

### getPositionPnlCost

```ts
getPositionPnlCost: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the unrealized PNL in dollars at currentPrice.
Calculated as: pnlPercentage / 100 × totalInvestedCost.
Returns null if no pending signal exists.

### getPositionLevels

```ts
getPositionLevels: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number[]>
```

### getPositionPartials

```ts
getPositionPartials: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<{ type: "profit" | "loss"; percent: number; currentPrice: number; costBasisAtClose: number; entryCountAtClose: number; debugTimestamp?: number; }[]>
```

### getPositionEntries

```ts
getPositionEntries: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<{ price: number; cost: number; }[]>
```

Returns the list of DCA entry prices and costs for the current pending signal.

Each entry records the price and cost of a single position entry.
The first element is always the original priceOpen (initial entry).
Each subsequent element is an entry added by averageBuy().

Returns null if no pending signal exists.
Returns a single-element array [{ price: priceOpen, cost }] if no DCA entries were made.

### getScheduledSignal

```ts
getScheduledSignal: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IScheduledSignalRow>
```

Retrieves the currently active scheduled signal for the symbol.
If no scheduled signal exists, returns null.
Used internally for monitoring scheduled signal activation.

### getBreakeven

```ts
getBreakeven: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks if breakeven threshold has been reached for the current pending signal.

Validates strategy existence and delegates to connection service
to check if price has moved far enough to cover transaction costs.

Does not require execution context as this is a state query operation.

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
backtest: (symbol: string, candles: ICandleData[], when: Date, backtest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled>
```

Runs fast backtest against candle array.

Wraps strategy backtest() with execution context containing symbol,
timestamp, and backtest mode flag.

### stopStrategy

```ts
stopStrategy: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Stops the strategy from generating new signals.

Delegates to StrategyConnectionService.stop() to set internal flag.
Does not require execution context.

### cancelScheduled

```ts
cancelScheduled: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, cancelId?: string) => Promise<void>
```

Cancels the scheduled signal without stopping the strategy.

Delegates to StrategyConnectionService.cancelScheduled() to clear scheduled signal
and emit cancelled event through emitters.
Does not require execution context.

### closePending

```ts
closePending: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, closeId?: string) => Promise<void>
```

Closes the pending signal without stopping the strategy.

Clears the pending signal (active position).
Does NOT affect scheduled signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

Delegates to StrategyConnectionService.closePending() to clear pending signal
and emit closed event through emitters.
Does not require execution context.

### dispose

```ts
dispose: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Disposes the ClientStrategy instance for the given context.

Calls dispose on the strategy instance to clean up resources,
then removes it from cache.

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears the memoized ClientStrategy instance from cache.

Delegates to StrategyConnectionService.dispose() if payload provided,
otherwise clears all strategy instances.

### validatePartialProfit

```ts
validatePartialProfit: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `partialProfit` would succeed without executing it.
Validates context, then delegates to StrategyConnectionService.validatePartialProfit().

### partialProfit

```ts
partialProfit: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Executes partial close at profit level (moving toward TP).

Validates strategy existence and delegates to connection service
to close a percentage of the pending position at profit.

Does not require execution context as this is a direct state mutation.

### validatePartialLoss

```ts
validatePartialLoss: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `partialLoss` would succeed without executing it.
Validates context, then delegates to StrategyConnectionService.validatePartialLoss().

### partialLoss

```ts
partialLoss: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Executes partial close at loss level (moving toward SL).

Validates strategy existence and delegates to connection service
to close a percentage of the pending position at loss.

Does not require execution context as this is a direct state mutation.

### validateTrailingStop

```ts
validateTrailingStop: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Adjusts the trailing stop-loss distance for an active pending signal.

Validates strategy existence and delegates to connection service
to update the stop-loss distance by a percentage adjustment.

Does not require execution context as this is a direct state mutation.

### trailingStop

```ts
trailingStop: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `trailingStop` would succeed without executing it.
Validates context, then delegates to StrategyConnectionService.validateTrailingStop().

### validateTrailingTake

```ts
validateTrailingTake: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Adjusts the trailing take-profit distance for an active pending signal.
Validates context and delegates to StrategyConnectionService.

### trailingTake

```ts
trailingTake: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `trailingTake` would succeed without executing it.
Validates context, then delegates to StrategyConnectionService.validateTrailingTake().

### validateBreakeven

```ts
validateBreakeven: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Moves stop-loss to breakeven when price reaches threshold.
Validates context and delegates to StrategyConnectionService.

### breakeven

```ts
breakeven: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `breakeven` would succeed without executing it.
Validates context, then delegates to StrategyConnectionService.validateBreakeven().

### activateScheduled

```ts
activateScheduled: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, activateId?: string) => Promise<void>
```

Activates a scheduled signal early without waiting for price to reach priceOpen.

Validates strategy existence and delegates to connection service
to set the activation flag. The actual activation happens on next tick().

### validateAverageBuy

```ts
validateAverageBuy: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Adds a new DCA entry to the active pending signal.

Validates strategy existence and delegates to connection service
to add a new averaging entry to the position.

### averageBuy

```ts
averageBuy: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }, cost: number) => Promise<boolean>
```

Checks whether `averageBuy` would succeed without executing it.
Validates context, then delegates to StrategyConnectionService.validateAverageBuy().

### hasPendingSignal

```ts
hasPendingSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks if there is an active pending signal for the symbol.
Validates strategy existence and delegates to connection service
to check if a pending signal exists for the symbol.
Does not require execution context as this is a state query operation.

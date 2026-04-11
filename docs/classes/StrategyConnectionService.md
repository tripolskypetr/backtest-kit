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
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
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

### timeMetaService

```ts
timeMetaService: TimeMetaService
```

### priceMetaService

```ts
priceMetaService: PriceMetaService
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
getPendingSignal: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IPublicSignalRow>
```

Retrieves the currently active pending signal for the strategy.
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

### getPositionEffectivePrice

```ts
getPositionEffectivePrice: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the effective (DCA-averaged) entry price for the current pending signal.

This is the harmonic mean of all _entry prices, which is the correct
cost-basis price used in all PNL calculations.
With no DCA entries, equals the original priceOpen.

Returns null if no pending signal exists.

### getPositionInvestedCount

```ts
getPositionInvestedCount: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the number of DCA entries made for the current pending signal.

1 = original entry only (no DCA).
Increases by 1 with each successful commitAverageBuy().

Returns null if no pending signal exists.

### getPositionInvestedCost

```ts
getPositionInvestedCost: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the total invested cost basis in dollars for the current pending signal.

Equal to entryCount × $100 (COST_BASIS_PER_ENTRY).
1 entry = $100, 2 entries = $200, etc.

Returns null if no pending signal exists.

### getPositionPnlPercent

```ts
getPositionPnlPercent: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the unrealized PNL percentage for the current pending signal at currentPrice.

Accounts for partial closes, DCA entries, slippage and fees
(delegates to toProfitLossDto).

Returns null if no pending signal exists.

### getPositionPnlCost

```ts
getPositionPnlCost: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the unrealized PNL in dollars for the current pending signal at currentPrice.

Calculated as: pnlPercentage / 100 × totalInvestedCost
Accounts for partial closes, DCA entries, slippage and fees.

Returns null if no pending signal exists.

### getPositionLevels

```ts
getPositionLevels: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number[]>
```

Returns the list of DCA entry prices for the current pending signal.

The first element is always the original priceOpen (initial entry).
Each subsequent element is a price added by commitAverageBuy().

Returns null if no pending signal exists.
Returns a single-element array [priceOpen] if no DCA entries were made.

### getPositionPartials

```ts
getPositionPartials: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<{ type: "profit" | "loss"; percent: number; currentPrice: number; costBasisAtClose: number; entryCountAtClose: number; timestamp: number; }[]>
```

Returns the list of partial closes for the current pending signal.

Each entry records a partial profit or loss close event with its type,
percent closed, price at close, cost basis snapshot, and entry count at close.

Returns null if no pending signal exists.
Returns an empty array if no partial closes have been executed.

### getPositionEntries

```ts
getPositionEntries: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<{ price: number; cost: number; timestamp: number; }[]>
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
backtest: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, candles: ICandleData[], frameEndTime: number) => Promise<IStrategyTickResultActive | IStrategyTickResultClosed | IStrategyTickResultCancelled>
```

Executes backtest for current strategy with provided candles.

Waits for strategy initialization before processing candles.
Evaluates strategy signals against historical data.

### stopStrategy

```ts
stopStrategy: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Stops the specified strategy from generating new signals.

Delegates to ClientStrategy.stopStrategy() which sets internal flag to prevent
getSignal from being called on subsequent ticks.

### hasPendingSignal

```ts
hasPendingSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks if there is an active pending signal for the strategy.
Delegates to ClientStrategy.hasPendingSignal() which checks if there is an active position
that has not been fully closed.

### hasScheduledSignal

```ts
hasScheduledSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks if there is an active scheduled signal for the strategy.
Delegates to ClientStrategy.hasScheduledSignal() which checks if there is a waiting position signal

### getPositionEstimateMinutes

```ts
getPositionEstimateMinutes: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the original estimated duration for the current pending signal.

Delegates to ClientStrategy.getPositionEstimateMinutes().
Returns null if no pending signal exists.

### getPositionCountdownMinutes

```ts
getPositionCountdownMinutes: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the remaining time before the position expires, clamped to zero.

Resolves current timestamp via timeMetaService and delegates to
ClientStrategy.getPositionCountdownMinutes().
Returns null if no pending signal exists.

### getPositionHighestProfitPrice

```ts
getPositionHighestProfitPrice: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the best price reached in the profit direction during this position's life.

Delegates to ClientStrategy.getPositionHighestProfitPrice().
Returns null if no pending signal exists.

### getPositionHighestProfitTimestamp

```ts
getPositionHighestProfitTimestamp: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the timestamp when the best profit price was recorded during this position's life.

Delegates to ClientStrategy.getPositionHighestProfitTimestamp().
Returns null if no pending signal exists.

### getPositionHighestPnlPercentage

```ts
getPositionHighestPnlPercentage: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the PnL percentage at the moment the best profit price was recorded during this position's life.

Delegates to ClientStrategy.getPositionHighestPnlPercentage().
Returns null if no pending signal exists.

### getPositionHighestPnlCost

```ts
getPositionHighestPnlCost: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.

Delegates to ClientStrategy.getPositionHighestPnlCost().
Returns null if no pending signal exists.

### getPositionHighestProfitBreakeven

```ts
getPositionHighestProfitBreakeven: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Returns whether breakeven was mathematically reachable at the highest profit price.

Delegates to ClientStrategy.getPositionHighestProfitBreakeven().
Returns null if no pending signal exists.

### getPositionDrawdownMinutes

```ts
getPositionDrawdownMinutes: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Resolves current timestamp via timeMetaService and delegates to
ClientStrategy.getPositionDrawdownMinutes().
Returns null if no pending signal exists.

### getPositionHighestProfitMinutes

```ts
getPositionHighestProfitMinutes: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Alias for getPositionDrawdownMinutes — measures how long the position has been
pulling back from its peak profit level.

Resolves current timestamp via timeMetaService and delegates to
ClientStrategy.getPositionHighestProfitMinutes().
Returns null if no pending signal exists.

### getPositionMaxDrawdownMinutes

```ts
getPositionMaxDrawdownMinutes: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the number of minutes elapsed since the worst loss price was recorded.

Measures how long ago the deepest drawdown point occurred.
Zero when called at the exact moment the trough was set.

Resolves current timestamp via timeMetaService and delegates to
ClientStrategy.getPositionMaxDrawdownMinutes().
Returns null if no pending signal exists.

### getPositionMaxDrawdownPrice

```ts
getPositionMaxDrawdownPrice: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the worst price reached in the loss direction during this position's life.

Delegates to ClientStrategy.getPositionMaxDrawdownPrice().
Returns null if no pending signal exists.

### getPositionMaxDrawdownTimestamp

```ts
getPositionMaxDrawdownTimestamp: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the timestamp when the worst loss price was recorded during this position's life.

Delegates to ClientStrategy.getPositionMaxDrawdownTimestamp().
Returns null if no pending signal exists.

### getPositionMaxDrawdownPnlPercentage

```ts
getPositionMaxDrawdownPnlPercentage: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.

Delegates to ClientStrategy.getPositionMaxDrawdownPnlPercentage().
Returns null if no pending signal exists.

### getPositionMaxDrawdownPnlCost

```ts
getPositionMaxDrawdownPnlCost: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the PnL cost (in quote currency) at the moment the worst loss price was recorded during this position's life.

Delegates to ClientStrategy.getPositionMaxDrawdownPnlCost().
Returns null if no pending signal exists.

### getPositionHighestProfitDistancePnlPercentage

```ts
getPositionHighestProfitDistancePnlPercentage: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the distance in PnL percentage between the current price and the highest profit peak.

Resolves current price via priceMetaService and delegates to
ClientStrategy.getPositionHighestProfitDistancePnlPercentage().
Returns null if no pending signal exists.

### getPositionHighestProfitDistancePnlCost

```ts
getPositionHighestProfitDistancePnlCost: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the distance in PnL cost between the current price and the highest profit peak.

Resolves current price via priceMetaService and delegates to
ClientStrategy.getPositionHighestProfitDistancePnlCost().
Returns null if no pending signal exists.

### getPositionHighestMaxDrawdownPnlPercentage

```ts
getPositionHighestMaxDrawdownPnlPercentage: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the distance in PnL percentage between the current price and the worst drawdown trough.

Resolves current price via priceMetaService and delegates to
ClientStrategy.getPositionHighestMaxDrawdownPnlPercentage().
Returns null if no pending signal exists.

### getPositionHighestMaxDrawdownPnlCost

```ts
getPositionHighestMaxDrawdownPnlCost: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the distance in PnL cost between the current price and the worst drawdown trough.

Resolves current price via priceMetaService and delegates to
ClientStrategy.getPositionHighestMaxDrawdownPnlCost().
Returns null if no pending signal exists.

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

### cancelScheduled

```ts
cancelScheduled: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, cancelId?: string) => Promise<void>
```

Cancels the scheduled signal for the specified strategy.

Delegates to ClientStrategy.cancelScheduled() which clears the scheduled signal
without stopping the strategy or affecting pending signals.

Note: Cancelled event will be emitted on next tick() call when strategy
detects the scheduled signal was cancelled.

### closePending

```ts
closePending: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, closeId?: string) => Promise<void>
```

Closes the pending signal without stopping the strategy.

Clears the pending signal (active position).
Does NOT affect scheduled signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

Note: Closed event will be emitted on next tick() call when strategy
detects the pending signal was closed.

### validatePartialProfit

```ts
validatePartialProfit: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `partialProfit` would succeed without executing it.
Delegates to `ClientStrategy.validatePartialProfit()` — no throws, pure boolean result.

### partialProfit

```ts
partialProfit: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Executes partial close at profit level (moving toward TP).

Closes a percentage of the pending position at the current price, recording it as a "profit" type partial.
The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.

Delegates to ClientStrategy.partialProfit() with current execution context.

### validatePartialLoss

```ts
validatePartialLoss: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `partialLoss` would succeed without executing it.
Delegates to `ClientStrategy.validatePartialLoss()` — no throws, pure boolean result.

### partialLoss

```ts
partialLoss: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Executes partial close at loss level (moving toward SL).

Closes a percentage of the pending position at the current price, recording it as a "loss" type partial.
The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.

Delegates to ClientStrategy.partialLoss() with current execution context.

### validateTrailingStop

```ts
validateTrailingStop: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `trailingStop` would succeed without executing it.
Delegates to `ClientStrategy.validateTrailingStop()` — no throws, pure boolean result.

### trailingStop

```ts
trailingStop: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Adjusts the trailing stop-loss distance for an active pending signal.

Updates the stop-loss distance by a percentage adjustment relative to the original SL distance.
Positive percentShift tightens the SL (reduces distance), negative percentShift loosens it.

Delegates to ClientStrategy.trailingStop() with current execution context.

### validateTrailingTake

```ts
validateTrailingTake: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `trailingTake` would succeed without executing it.
Delegates to `ClientStrategy.validateTrailingTake()` — no throws, pure boolean result.

### trailingTake

```ts
trailingTake: (backtest: boolean, symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Adjusts the trailing take-profit distance for an active pending signal.

Updates the take-profit distance by a percentage adjustment relative to the original TP distance.
Negative percentShift brings TP closer to entry, positive percentShift moves it further.

Delegates to ClientStrategy.trailingTake() with current execution context.

### validateBreakeven

```ts
validateBreakeven: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `breakeven` would succeed without executing it.
Delegates to `ClientStrategy.validateBreakeven()` — no throws, pure boolean result.

### breakeven

```ts
breakeven: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Delegates to ClientStrategy.breakeven() with current execution context.

### activateScheduled

```ts
activateScheduled: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, activateId?: string) => Promise<void>
```

Activates a scheduled signal early without waiting for price to reach priceOpen.

Delegates to ClientStrategy.activateScheduled() which sets _activatedSignal flag.
The actual activation happens on next tick() when strategy detects the flag.

### validateAverageBuy

```ts
validateAverageBuy: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks whether `averageBuy` would succeed without executing it.
Delegates to `ClientStrategy.validateAverageBuy()` — no throws, pure boolean result.

### averageBuy

```ts
averageBuy: (backtest: boolean, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }, cost: number) => Promise<boolean>
```

Adds a new DCA entry to the active pending signal.

Delegates to ClientStrategy.averageBuy() with current execution context.

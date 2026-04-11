---
title: docs/class/LiveUtils
group: docs
---

# LiveUtils

Utility class for live trading operations.

Provides simplified access to liveCommandService.run() with logging.
Exported as singleton instance for convenient usage.

Features:
- Infinite async generator (never completes)
- Crash recovery via persisted state
- Real-time progression with Date.now()

## Constructor

```ts
constructor();
```

## Properties

### _getInstance

```ts
_getInstance: any
```

Memoized function to get or create LiveInstance for a symbol-strategy pair.
Each symbol-strategy combination gets its own isolated instance.

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed | IStrategyTickResultCancelled, void, unknown>
```

Runs live trading for a symbol with context propagation.

Infinite async generator with crash recovery support.
Process can crash and restart - state will be recovered from disk.

### background

```ts
background: (symbol: string, context: { strategyName: string; exchangeName: string; }) => () => void
```

Runs live trading in background without yielding results.

Consumes all live trading results internally without exposing them.
Infinite loop - will run until process is stopped or crashes.
Useful for running live trading for side effects only (callbacks, persistence).

### getPendingSignal

```ts
getPendingSignal: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<IPublicSignalRow>
```

Retrieves the currently active pending signal for the strategy.
If no active signal exists, returns null.

### getTotalPercentClosed

```ts
getTotalPercentClosed: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the percentage of the position currently held (not closed).
100 = nothing has been closed (full position), 0 = fully closed.
Correctly accounts for DCA entries between partial closes.

### getTotalCostClosed

```ts
getTotalCostClosed: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the cost basis in dollars of the position currently held (not closed).
Correctly accounts for DCA entries between partial closes.

### getScheduledSignal

```ts
getScheduledSignal: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<IScheduledSignalRow>
```

Retrieves the currently active scheduled signal for the strategy.
If no scheduled signal exists, returns null.

### hasNoPendingSignal

```ts
hasNoPendingSignal: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Returns true if there is NO active pending signal for the given symbol.

Inverse of strategyCoreService.hasPendingSignal. Use to guard signal generation logic.

### hasNoScheduledSignal

```ts
hasNoScheduledSignal: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Returns true if there is NO active scheduled signal for the given symbol.

Inverse of strategyCoreService.hasScheduledSignal. Use to guard signal generation logic.

### getBreakeven

```ts
getBreakeven: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Checks if breakeven threshold has been reached for the current pending signal.

Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
to cover transaction costs (slippage + fees) and allow breakeven to be set.

### getPositionEffectivePrice

```ts
getPositionEffectivePrice: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the effective (weighted average) entry price for the current pending signal.

Accounts for all DCA entries via commitAverageBuy.
Returns null if no pending signal exists.

### getPositionInvestedCount

```ts
getPositionInvestedCount: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the total number of base-asset units currently held in the position.

Includes units from all DCA entries. Returns null if no pending signal exists.

### getPositionInvestedCost

```ts
getPositionInvestedCost: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the total dollar cost invested in the current position.

Sum of all entry costs across DCA entries. Returns null if no pending signal exists.

### getPositionPnlPercent

```ts
getPositionPnlPercent: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the current unrealized PnL as a percentage of the invested cost.

Calculated relative to the effective (weighted average) entry price.
Positive for profit, negative for loss. Returns null if no pending signal exists.

### getPositionPnlCost

```ts
getPositionPnlCost: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the current unrealized PnL in quote currency (dollar amount).

Calculated as (currentPrice - effectiveEntry) * units for LONG,
reversed for SHORT. Returns null if no pending signal exists.

### getPositionLevels

```ts
getPositionLevels: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number[]>
```

Returns the list of DCA entry prices for the current pending signal.

The first element is always the original priceOpen (initial entry).
Each subsequent element is a price added by commitAverageBuy().
Returns null if no pending signal exists.
Returns a single-element array [priceOpen] if no DCA entries were made.

### getPositionPartials

```ts
getPositionPartials: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<{ type: "profit" | "loss"; percent: number; currentPrice: number; costBasisAtClose: number; entryCountAtClose: number; timestamp: number; }[]>
```

Returns the list of partial close events for the current pending signal.

Each element represents a partial profit or loss close executed via
commitPartialProfit / commitPartialLoss (or their Cost variants).
Returns null if no pending signal exists.
Returns an empty array if no partials were executed yet.

Each entry contains:
- `type` — "profit" or "loss"
- `percent` — percentage of position closed at this partial
- `currentPrice` — execution price of the partial close
- `costBasisAtClose` — accounting cost basis at the moment of this partial
- `entryCountAtClose` — number of DCA entries accumulated at this partial

### getPositionEntries

```ts
getPositionEntries: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<{ price: number; cost: number; timestamp: number; }[]>
```

Returns the list of DCA entry prices and costs for the current pending signal.

Each element represents a single position entry — the initial open or a subsequent
DCA entry added via commitAverageBuy.

Returns null if no pending signal exists.
Returns a single-element array if no DCA entries were made.

Each entry contains:
- `price` — execution price of this entry
- `cost` — dollar cost allocated to this entry (e.g. 100 for $100)

### getPositionEstimateMinutes

```ts
getPositionEstimateMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the original estimated duration for the current pending signal.

Reflects `minuteEstimatedTime` as set in the signal DTO — the maximum
number of minutes the position is expected to be active before `time_expired`.

Returns null if no pending signal exists.

### getPositionCountdownMinutes

```ts
getPositionCountdownMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the remaining time before the position expires, clamped to zero.

Computes elapsed minutes since `pendingAt` and subtracts from `minuteEstimatedTime`.
Returns 0 once the estimate is exceeded (never negative).

Returns null if no pending signal exists.

### getPositionHighestProfitPrice

```ts
getPositionHighestProfitPrice: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the best price reached in the profit direction during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitTimestamp

```ts
getPositionHighestProfitTimestamp: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the timestamp when the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestPnlPercentage

```ts
getPositionHighestPnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the PnL percentage at the moment the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestPnlCost

```ts
getPositionHighestPnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitBreakeven

```ts
getPositionHighestProfitBreakeven: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Returns whether breakeven was mathematically reachable at the highest profit price.

### getPositionDrawdownMinutes

```ts
getPositionDrawdownMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Measures how long the position has been pulling back from its peak profit level.
Zero when called at the exact moment the peak was set.
Grows continuously as price moves away from the peak without setting a new record.

Returns null if no pending signal exists.

### getPositionHighestProfitMinutes

```ts
getPositionHighestProfitMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Alias for getPositionDrawdownMinutes — measures how long the position has been
pulling back from its peak profit level.
Zero when called at the exact moment the peak was set.

Returns null if no pending signal exists.

### getPositionMaxDrawdownMinutes

```ts
getPositionMaxDrawdownMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the number of minutes elapsed since the worst loss price was recorded.

Measures how long ago the deepest drawdown point occurred.
Zero when called at the exact moment the trough was set.

Returns null if no pending signal exists.

### getPositionMaxDrawdownPrice

```ts
getPositionMaxDrawdownPrice: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the worst price reached in the loss direction during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownTimestamp

```ts
getPositionMaxDrawdownTimestamp: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the timestamp when the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownPnlPercentage

```ts
getPositionMaxDrawdownPnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownPnlCost

```ts
getPositionMaxDrawdownPnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the PnL cost (in quote currency) at the moment the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitDistancePnlPercentage

```ts
getPositionHighestProfitDistancePnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the distance in PnL percentage between the current price and the highest profit peak.

Computed as: max(0, peakPnlPercentage - currentPnlPercentage).
Returns null if no pending signal exists.

### getPositionHighestProfitDistancePnlCost

```ts
getPositionHighestProfitDistancePnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the distance in PnL cost between the current price and the highest profit peak.

Computed as: max(0, peakPnlCost - currentPnlCost).
Returns null if no pending signal exists.

### getPositionHighestMaxDrawdownPnlPercentage

```ts
getPositionHighestMaxDrawdownPnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the distance in PnL percentage between the current price and the worst drawdown trough.

Computed as: max(0, currentPnlPercentage - fallPnlPercentage).
Returns null if no pending signal exists.

### getPositionHighestMaxDrawdownPnlCost

```ts
getPositionHighestMaxDrawdownPnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<number>
```

Returns the distance in PnL cost between the current price and the worst drawdown trough.

Computed as: max(0, currentPnlCost - fallPnlCost).
Returns null if no pending signal exists.

### getPositionEntryOverlap

```ts
getPositionEntryOverlap: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }, ladder?: IPositionOverlapLadder) => Promise<boolean>
```

Checks whether the current price falls within the tolerance zone of any existing DCA entry level.
Use this to prevent duplicate DCA entries at the same price area.

Returns true if currentPrice is within [level - lowerStep, level + upperStep] for any level,
where step = level * percent / 100.
Returns false if no pending signal exists.

### getPositionPartialOverlap

```ts
getPositionPartialOverlap: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }, ladder?: IPositionOverlapLadder) => Promise<boolean>
```

Checks whether the current price falls within the tolerance zone of any existing partial close price.
Use this to prevent duplicate partial closes at the same price area.

Returns true if currentPrice is within [partial.currentPrice - lowerStep, partial.currentPrice + upperStep]
for any partial, where step = partial.currentPrice * percent / 100.
Returns false if no pending signal exists or no partials have been executed yet.

### stop

```ts
stop: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<void>
```

Stops the strategy from generating new signals.

Sets internal flag to prevent strategy from opening new signals.
Current active signal (if any) will complete normally.
Live trading will stop at the next safe point (idle/closed state).

### commitCancelScheduled

```ts
commitCancelScheduled: (symbol: string, context: { strategyName: string; exchangeName: string; }, cancelId?: string) => Promise<void>
```

Cancels the scheduled signal without stopping the strategy.

Clears the scheduled signal (waiting for priceOpen activation).
Does NOT affect active pending signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

### commitClosePending

```ts
commitClosePending: (symbol: string, context: { strategyName: string; exchangeName: string; }, closeId?: string) => Promise<void>
```

Closes the pending signal without stopping the strategy.

Clears the pending signal (active position).
Does NOT affect scheduled signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

### commitPartialProfit

```ts
commitPartialProfit: (symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Executes partial close at profit level (moving toward TP).

Closes a percentage of the active pending position at profit.
Price must be moving toward take profit (in profit direction).

### commitPartialLoss

```ts
commitPartialLoss: (symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Executes partial close at loss level (moving toward SL).

Closes a percentage of the active pending position at loss.
Price must be moving toward stop loss (in loss direction).

### commitPartialProfitCost

```ts
commitPartialProfitCost: (symbol: string, dollarAmount: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Executes partial close at profit level by absolute dollar amount (moving toward TP).

Convenience wrapper around commitPartialProfit that converts a dollar amount
to a percentage of the invested position cost automatically.
Price must be moving toward take profit (in profit direction).

### commitPartialLossCost

```ts
commitPartialLossCost: (symbol: string, dollarAmount: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Executes partial close at loss level by absolute dollar amount (moving toward SL).

Convenience wrapper around commitPartialLoss that converts a dollar amount
to a percentage of the invested position cost automatically.
Price must be moving toward stop loss (in loss direction).

### commitTrailingStop

```ts
commitTrailingStop: (symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Adjusts the trailing stop-loss distance for an active pending signal.

CRITICAL: Always calculates from ORIGINAL SL, not from current trailing SL.
This prevents error accumulation on repeated calls.
Larger percentShift ABSORBS smaller one (updates only towards better protection).

Updates the stop-loss distance by a percentage adjustment relative to the ORIGINAL SL distance.
Negative percentShift tightens the SL (reduces distance, moves closer to entry).
Positive percentShift loosens the SL (increases distance, moves away from entry).

Absorption behavior:
- First call: sets trailing SL unconditionally
- Subsequent calls: updates only if new SL is BETTER (protects more profit)
- For LONG: only accepts HIGHER SL (never moves down, closer to entry wins)
- For SHORT: only accepts LOWER SL (never moves up, closer to entry wins)

### commitTrailingTake

```ts
commitTrailingTake: (symbol: string, percentShift: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Adjusts the trailing take-profit distance for an active pending signal.

CRITICAL: Always calculates from ORIGINAL TP, not from current trailing TP.
This prevents error accumulation on repeated calls.
Larger percentShift ABSORBS smaller one (updates only towards more conservative TP).

Updates the take-profit distance by a percentage adjustment relative to the ORIGINAL TP distance.
Negative percentShift brings TP closer to entry (more conservative).
Positive percentShift moves TP further from entry (more aggressive).

Absorption behavior:
- First call: sets trailing TP unconditionally
- Subsequent calls: updates only if new TP is MORE CONSERVATIVE (closer to entry)
- For LONG: only accepts LOWER TP (never moves up, closer to entry wins)
- For SHORT: only accepts HIGHER TP (never moves down, closer to entry wins)

### commitTrailingStopCost

```ts
commitTrailingStopCost: (symbol: string, newStopLossPrice: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Adjusts the trailing stop-loss to an absolute price level.

Convenience wrapper around commitTrailingStop that converts an absolute
stop-loss price to a percentShift relative to the ORIGINAL SL distance.

### commitTrailingTakeCost

```ts
commitTrailingTakeCost: (symbol: string, newTakeProfitPrice: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Adjusts the trailing take-profit to an absolute price level.

Convenience wrapper around commitTrailingTake that converts an absolute
take-profit price to a percentShift relative to the ORIGINAL TP distance.

### commitBreakeven

```ts
commitBreakeven: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Moves stop-loss to breakeven when price reaches threshold.

Moves SL to entry price (zero-risk position) when current price has moved
far enough in profit direction. Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2

### commitActivateScheduled

```ts
commitActivateScheduled: (symbol: string, context: { strategyName: string; exchangeName: string; }, activateId?: string) => Promise<void>
```

Activates a scheduled signal early without waiting for price to reach priceOpen.

Sets the activation flag on the scheduled signal. The actual activation
happens on the next tick() when strategy detects the flag.

### commitAverageBuy

```ts
commitAverageBuy: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }, cost?: number) => Promise<boolean>
```

Adds a new DCA entry to the active pending signal.

Adds a new averaging entry at currentPrice to the position's entry history.
Updates effectivePriceOpen (mean of all entries) and emits average-buy commit event.

### getData

```ts
getData: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<LiveStatisticsModel>
```

Gets statistical data from all live trading events for a symbol-strategy pair.

### getReport

```ts
getReport: (symbol: string, context: { strategyName: string; exchangeName: string; }, columns?: Columns$a[]) => Promise<string>
```

Generates markdown report with all events for a symbol-strategy pair.

### dump

```ts
dump: (symbol: string, context: { strategyName: string; exchangeName: string; }, path?: string, columns?: Columns$a[]) => Promise<void>
```

Saves strategy report to disk.

### list

```ts
list: () => Promise<{ id: string; symbol: string; strategyName: string; exchangeName: string; status: "pending" | "fulfilled" | "rejected" | "ready"; }[]>
```

Lists all active live trading instances with their current status.

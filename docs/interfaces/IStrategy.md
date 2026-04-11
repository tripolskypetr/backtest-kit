---
title: docs/interface/IStrategy
group: docs
---

# IStrategy

Strategy interface implemented by ClientStrategy.
Defines core strategy execution methods.

## Properties

### tick

```ts
tick: (symbol: string, strategyName: string) => Promise<IStrategyTickResult>
```

Single tick of strategy execution with VWAP monitoring.
Checks for signal generation (throttled) and TP/SL conditions.

### getPendingSignal

```ts
getPendingSignal: (symbol: string, currentPrice: number) => Promise<IPublicSignalRow>
```

Retrieves the currently active pending signal for the symbol.
If no active signal exists, returns null.
Used internally for monitoring TP/SL and time expiration.

### getScheduledSignal

```ts
getScheduledSignal: (symbol: string, currentPrice: number) => Promise<IPublicSignalRow>
```

Retrieves the currently active scheduled signal for the symbol.
If no scheduled signal exists, returns null.
Used internally for monitoring scheduled signal activation.

### getBreakeven

```ts
getBreakeven: (symbol: string, currentPrice: number) => Promise<boolean>
```

Checks if breakeven threshold has been reached for the current pending signal.

Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
to cover transaction costs (slippage + fees) and allow breakeven to be set.
Threshold: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2 transactions

For LONG position:
- Returns true when: currentPrice &gt;= priceOpen * (1 + threshold%)
- Example: entry=100, threshold=0.4% → true when price &gt;= 100.4

For SHORT position:
- Returns true when: currentPrice &lt;= priceOpen * (1 - threshold%)
- Example: entry=100, threshold=0.4% → true when price &lt;= 99.6

Special cases:
- Returns false if no pending signal exists
- Returns true if trailing stop is already in profit zone (breakeven already achieved)
- Returns false if threshold not reached yet

### getStopped

```ts
getStopped: (symbol: string) => Promise<boolean>
```

Checks if the strategy has been stopped.

Returns the stopped state indicating whether the strategy should
cease processing new ticks or signals.

### getTotalPercentClosed

```ts
getTotalPercentClosed: (symbol: string) => Promise<number>
```

Returns how much of the position is still held, as a percentage of totalInvested.

Uses dollar-basis cost-basis replay (DCA-aware).
100% means nothing was closed yet. Decreases with each partial close.

Returns 100 if no pending signal or no partial closes.

### getTotalCostClosed

```ts
getTotalCostClosed: (symbol: string) => Promise<number>
```

Returns how many dollars of cost basis are still held (not yet closed by partials).

Full position open: equals totalInvested (entries × $100).
Decreases with each partial close, increases with each averageBuy().

Returns totalInvested if no pending signal or no partial closes.

### getPositionEffectivePrice

```ts
getPositionEffectivePrice: (symbol: string) => Promise<number>
```

Returns the effective (DCA-averaged) entry price for the current pending signal.
Returns null if no pending signal exists.

### getPositionInvestedCount

```ts
getPositionInvestedCount: (symbol: string) => Promise<number>
```

Returns the number of DCA entries for the current pending signal.
1 = original entry only. Returns null if no pending signal exists.

### getPositionInvestedCost

```ts
getPositionInvestedCost: (symbol: string) => Promise<number>
```

Returns the total invested cost basis in dollars (entryCount × $100).
Returns null if no pending signal exists.

### getPositionPnlPercent

```ts
getPositionPnlPercent: (symbol: string, currentPrice: number) => Promise<number>
```

Returns the unrealized PNL percentage at currentPrice.
Accounts for partial closes, DCA entries, slippage and fees.
Returns null if no pending signal exists.

### getPositionPnlCost

```ts
getPositionPnlCost: (symbol: string, currentPrice: number) => Promise<number>
```

Returns the unrealized PNL in dollars at currentPrice.
Calculated as: pnlPercentage / 100 × totalInvestedCost.
Returns null if no pending signal exists.

### getPositionEntries

```ts
getPositionEntries: (symbol: string, timestamp: number) => Promise<{ price: number; cost: number; timestamp: number; }[]>
```

Returns the list of DCA entry prices and costs for the current pending signal.

Each entry records the price and cost of a single position entry.
The first element is always the original priceOpen (initial entry).
Each subsequent element is an entry added by averageBuy().

Returns null if no pending signal exists.
Returns a single-element array [{ price: priceOpen, cost }] if no DCA entries were made.

### getPositionPartials

```ts
getPositionPartials: (symbol: string) => Promise<{ type: "profit" | "loss"; percent: number; currentPrice: number; costBasisAtClose: number; entryCountAtClose: number; timestamp: number; }[]>
```

Returns the history of partial closes for the current pending signal.

Each record includes the type (profit or loss), percentage closed, price, cost basis at close, and timestamp.
Used for tracking how the position was partially closed over time.

Returns null if no pending signal exists or no partial closes were executed.

### backtest

```ts
backtest: (symbol: string, strategyName: string, candles: ICandleData[], frameEndTime: number) => Promise<IStrategyBacktestResult>
```

Fast backtest using historical candles.
Iterates through candles, calculates VWAP, checks TP/SL on each candle.

For scheduled signals: first monitors activation/cancellation,
then if activated continues with TP/SL monitoring.

### stopStrategy

```ts
stopStrategy: (symbol: string, backtest: boolean) => Promise<void>
```

Stops the strategy from generating new signals.

Sets internal flag to prevent getSignal from being called on subsequent ticks.
Does NOT force-close active pending signals - they continue monitoring until natural closure (TP/SL/time_expired).

Use case: Graceful shutdown in live trading mode without abandoning open positions.

### cancelScheduled

```ts
cancelScheduled: (symbol: string, backtest: boolean, cancelId?: string) => Promise<void>
```

Cancels the scheduled signal without stopping the strategy.

Clears the scheduled signal (waiting for priceOpen activation).
Does NOT affect active pending signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

Use case: Cancel a scheduled entry that is no longer desired without stopping the entire strategy.

### activateScheduled

```ts
activateScheduled: (symbol: string, backtest: boolean, activateId?: string) => Promise<void>
```

Activates the scheduled signal without waiting for price to reach priceOpen.

Forces immediate activation of the scheduled signal at the current price.
Does NOT affect active pending signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

Use case: User-initiated early activation of a scheduled entry.

### closePending

```ts
closePending: (symbol: string, backtest: boolean, closeId?: string) => Promise<void>
```

Closes the pending signal without stopping the strategy.

Clears the pending signal (active position).
Does NOT affect scheduled signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

Use case: Close an active position that is no longer desired without stopping the entire strategy.

### partialProfit

```ts
partialProfit: (symbol: string, percentToClose: number, currentPrice: number, backtest: boolean, timestamp: number) => Promise<boolean>
```

Executes partial close at profit level (moving toward TP).

Closes specified percentage of position at current price.
Updates _tpClosed, _totalClosed, and _partialHistory state.
Persists updated signal state for crash recovery.

Validations:
- Throws if no pending signal exists
- Throws if called on scheduled signal (not yet activated)
- Throws if percentToClose &lt;= 0 or &gt; 100
- Returns false if _totalClosed + percentToClose &gt; 100 (prevents over-closing)

Use case: User-controlled partial close triggered from onPartialProfit callback.

### validatePartialProfit

```ts
validatePartialProfit: (symbol: string, percentToClose: number, currentPrice: number) => Promise<boolean>
```

Checks whether `partialProfit` would succeed without executing it.

Returns `true` if all preconditions for a profitable partial close are met:
- Active pending signal exists
- `percentToClose` is a finite number in range (0, 100]
- `currentPrice` is a positive finite number
- Price is moving toward TP (not toward SL) relative to effective entry
- Price has not already crossed the TP level
- Closing the given percentage would not exceed 100% total closed

Never throws. Safe to call at any time as a pre-flight check.

### partialLoss

```ts
partialLoss: (symbol: string, percentToClose: number, currentPrice: number, backtest: boolean, timestamp: number) => Promise<boolean>
```

Executes partial close at loss level (moving toward SL).

Closes specified percentage of position at current price.
Updates _slClosed, _totalClosed, and _partialHistory state.
Persists updated signal state for crash recovery.

Validations:
- Throws if no pending signal exists
- Throws if called on scheduled signal (not yet activated)
- Throws if percentToClose &lt;= 0 or &gt; 100
- Returns false if _totalClosed + percentToClose &gt; 100 (prevents over-closing)

Use case: User-controlled partial close triggered from onPartialLoss callback.

### validatePartialLoss

```ts
validatePartialLoss: (symbol: string, percentToClose: number, currentPrice: number) => Promise<boolean>
```

Checks whether `partialLoss` would succeed without executing it.

Returns `true` if all preconditions for a loss-side partial close are met:
- Active pending signal exists
- `percentToClose` is a finite number in range (0, 100]
- `currentPrice` is a positive finite number
- Price is moving toward SL (not toward TP) relative to effective entry
- Price has not already crossed the SL level
- Closing the given percentage would not exceed 100% total closed

Never throws. Safe to call at any time as a pre-flight check.

### trailingStop

```ts
trailingStop: (symbol: string, percentShift: number, currentPrice: number, backtest: boolean) => Promise<boolean>
```

Adjusts trailing stop-loss by shifting distance between entry and original SL.

CRITICAL: Always calculates from ORIGINAL SL, not from current trailing SL.
This prevents error accumulation on repeated calls.
Larger percentShift ABSORBS smaller one (updates only towards better protection).

Calculates new SL based on percentage shift of the ORIGINAL distance (entry - originalSL):
- Negative %: tightens stop (moves SL closer to entry, reduces risk)
- Positive %: loosens stop (moves SL away from entry, allows more drawdown)

For LONG position (entry=100, originalSL=90, distance=10%):
- percentShift = -50: newSL = 100 - 10%*(1-0.5) = 95 (5% distance, tighter)
- percentShift = +20: newSL = 100 - 10%*(1+0.2) = 88 (12% distance, looser)

For SHORT position (entry=100, originalSL=110, distance=10%):
- percentShift = -50: newSL = 100 + 10%*(1-0.5) = 105 (5% distance, tighter)
- percentShift = +20: newSL = 100 + 10%*(1+0.2) = 112 (12% distance, looser)

Absorption behavior:
- First call: sets trailing SL unconditionally
- Subsequent calls: updates only if new SL is BETTER (protects more profit)
- For LONG: only accepts HIGHER SL (never moves down, closer to entry wins)
- For SHORT: only accepts LOWER SL (never moves up, closer to entry wins)
- Stores in _trailingPriceStopLoss, original priceStopLoss always preserved

Validations:
- Throws if no pending signal exists
- Throws if percentShift &lt; -100 or &gt; 100
- Throws if percentShift === 0
- Skips if new SL would cross entry price
- Skips if currentPrice already crossed new SL level (price intrusion protection)

Use case: User-controlled trailing stop triggered from onPartialProfit callback.

### validateTrailingStop

```ts
validateTrailingStop: (symbol: string, percentShift: number, currentPrice: number) => Promise<boolean>
```

Checks whether `trailingStop` would succeed without executing it.

Returns `true` if all preconditions for a trailing SL update are met:
- Active pending signal exists
- `percentShift` is a finite number in [-100, 100], non-zero
- `currentPrice` is a positive finite number
- Computed new SL does not intrude current price (price hasn't crossed it)
- New SL does not conflict with effective TP (SL must remain on the safe side)
- If a trailing SL already exists, new SL offers better protection (absorption rule)

Never throws. Safe to call at any time as a pre-flight check.

### trailingTake

```ts
trailingTake: (symbol: string, percentShift: number, currentPrice: number, backtest: boolean) => Promise<boolean>
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
- Stores in _trailingPriceTakeProfit, original priceTakeProfit always preserved

Price intrusion protection: If current price has already crossed the new TP level,
the update is skipped to prevent immediate TP triggering.

### validateTrailingTake

```ts
validateTrailingTake: (symbol: string, percentShift: number, currentPrice: number) => Promise<boolean>
```

Checks whether `trailingTake` would succeed without executing it.

Returns `true` if all preconditions for a trailing TP update are met:
- Active pending signal exists
- `percentShift` is a finite number in [-100, 100], non-zero
- `currentPrice` is a positive finite number
- Computed new TP does not intrude current price (price hasn't crossed it)
- New TP does not conflict with effective SL (TP must remain on the profit side)
- If a trailing TP already exists, new TP is more conservative (absorption rule:
  LONG accepts only lower TP, SHORT accepts only higher TP)

Never throws. Safe to call at any time as a pre-flight check.

### breakeven

```ts
breakeven: (symbol: string, currentPrice: number, backtest: boolean) => Promise<boolean>
```

Moves stop-loss to breakeven (entry price) when price reaches threshold.

Moves SL to entry price (zero-risk position) when current price has moved
far enough in profit direction to cover transaction costs (slippage + fees).
Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2

Behavior:
- Returns true if SL was moved to breakeven
- Returns false if conditions not met (threshold not reached or already at breakeven)
- Uses _trailingPriceStopLoss to store breakeven SL (preserves original priceStopLoss)
- Only moves SL once per position (idempotent - safe to call multiple times)

For LONG position (entry=100, slippage=0.1%, fee=0.1%):
- Threshold: (0.1 + 0.1) * 2 = 0.4%
- Breakeven available when price &gt;= 100.4 (entry + 0.4%)
- Moves SL from original (e.g. 95) to 100 (breakeven)
- Returns true on first successful move, false on subsequent calls

For SHORT position (entry=100, slippage=0.1%, fee=0.1%):
- Threshold: (0.1 + 0.1) * 2 = 0.4%
- Breakeven available when price &lt;= 99.6 (entry - 0.4%)
- Moves SL from original (e.g. 105) to 100 (breakeven)
- Returns true on first successful move, false on subsequent calls

Validations:
- Throws if no pending signal exists
- Throws if currentPrice is not a positive finite number

Use case: User-controlled breakeven protection triggered from onPartialProfit callback.

### validateBreakeven

```ts
validateBreakeven: (symbol: string, currentPrice: number) => Promise<boolean>
```

Checks whether `breakeven` would succeed without executing it.

Returns `true` if all preconditions for moving SL to breakeven are met:
- Active pending signal exists
- `currentPrice` is a positive finite number
- Price has moved far enough in profit direction to cover costs
  (threshold: `(CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2`)
- Breakeven SL would not conflict with effective TP
- Breakeven has not already been set (idempotent — returns `false` on repeat)

Never throws. Safe to call at any time as a pre-flight check.

### averageBuy

```ts
averageBuy: (symbol: string, currentPrice: number, backtest: boolean, timestamp: number, cost?: number) => Promise<boolean>
```

Adds a new averaging entry to an open position (DCA — Dollar Cost Averaging).

Appends currentPrice to the _entry array. The effective entry price used in all
distance and PNL calculations becomes the simple arithmetic mean of all _entry prices.
Original priceOpen is preserved unchanged for identity/audit purposes.

Rejection rules (returns false without throwing):
- LONG: currentPrice &gt;= last entry price (must average down, not up or equal)
- SHORT: currentPrice &lt;= last entry price (must average down, not up or equal)

Validations (throws):
- No pending signal exists
- currentPrice is not a positive finite number

### validateAverageBuy

```ts
validateAverageBuy: (symbol: string, currentPrice: number) => Promise<boolean>
```

Checks whether `averageBuy` would succeed without executing it.

Returns `true` if all preconditions for a DCA entry are met:
- Active pending signal exists
- `currentPrice` is a positive finite number
- LONG: `currentPrice` is below the all-time lowest entry price
  (or `CC_ENABLE_DCA_EVERYWHERE` is set)
- SHORT: `currentPrice` is above the all-time highest entry price
  (or `CC_ENABLE_DCA_EVERYWHERE` is set)

Never throws. Safe to call at any time as a pre-flight check.

### hasPendingSignal

```ts
hasPendingSignal: (symbol: string) => Promise<boolean>
```

Checks if there is an active pending signal for the symbol.

Used internally to determine if TP/SL monitoring should occur on tick.

### hasScheduledSignal

```ts
hasScheduledSignal: (symbol: string) => Promise<boolean>
```

Checks if there is an active scheduled signal for the symbol.

Used internally to determine if TP/SL monitoring should occur on tick.

### getPositionEstimateMinutes

```ts
getPositionEstimateMinutes: (symbol: string) => Promise<number>
```

Returns the original estimated duration for the current pending signal.

Reflects `minuteEstimatedTime` as set in the signal DTO — the maximum
number of minutes the position is expected to be active before `time_expired`.

Returns null if no pending signal exists.

### getPositionCountdownMinutes

```ts
getPositionCountdownMinutes: (symbol: string, timestamp: number) => Promise<number>
```

Returns the remaining time before the position expires, clamped to zero.

Computes elapsed minutes since `pendingAt` and subtracts from `minuteEstimatedTime`.
Returns 0 once the estimate is exceeded (never negative).

Returns null if no pending signal exists.

### getPositionHighestProfitPrice

```ts
getPositionHighestProfitPrice: (symbol: string) => Promise<number>
```

Returns the best price reached in the profit direction during this position's life.

Returns null if no pending signal exists.

### getPositionHighestPnlPercentage

```ts
getPositionHighestPnlPercentage: (symbol: string) => Promise<number>
```

Returns the PnL percentage at the moment the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestPnlCost

```ts
getPositionHighestPnlCost: (symbol: string) => Promise<number>
```

Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitTimestamp

```ts
getPositionHighestProfitTimestamp: (symbol: string) => Promise<number>
```

Returns the timestamp when the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitBreakeven

```ts
getPositionHighestProfitBreakeven: (symbol: string) => Promise<boolean>
```

Returns whether breakeven was mathematically reachable at the highest profit price.

Uses the same threshold formula as getBreakeven with the recorded peak price.
Returns null if no pending signal exists.

### getPositionDrawdownMinutes

```ts
getPositionDrawdownMinutes: (symbol: string, timestamp: number) => Promise<number>
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Measures how long the position has been pulling back from its peak profit level.
Zero when called at the exact moment the peak was set.
Grows continuously as price moves away from the peak without setting a new record.

Returns null if no pending signal exists.

### getPositionHighestProfitMinutes

```ts
getPositionHighestProfitMinutes: (symbol: string, timestamp: number) => Promise<number>
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Alias for getPositionDrawdownMinutes — measures how long the position has been
pulling back from its peak profit level.

Returns null if no pending signal exists.

### getPositionMaxDrawdownMinutes

```ts
getPositionMaxDrawdownMinutes: (symbol: string, timestamp: number) => Promise<number>
```

Returns the number of minutes elapsed since the worst loss price was recorded.

Measures how long ago the deepest drawdown point occurred.
Zero when called at the exact moment the trough was set.

Returns null if no pending signal exists.

### getPositionMaxDrawdownPrice

```ts
getPositionMaxDrawdownPrice: (symbol: string) => Promise<number>
```

Returns the worst price reached in the loss direction during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownTimestamp

```ts
getPositionMaxDrawdownTimestamp: (symbol: string) => Promise<number>
```

Returns the timestamp when the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownPnlPercentage

```ts
getPositionMaxDrawdownPnlPercentage: (symbol: string) => Promise<number>
```

Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownPnlCost

```ts
getPositionMaxDrawdownPnlCost: (symbol: string) => Promise<number>
```

Returns the PnL cost (in quote currency) at the moment the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitDistancePnlPercentage

```ts
getPositionHighestProfitDistancePnlPercentage: (symbol: string, currentPrice: number) => Promise<number>
```

Returns the distance in PnL percentage between the current price and the highest profit peak.

Computed as: max(0, peakPnlPercentage - currentPnlPercentage).

### getPositionHighestProfitDistancePnlCost

```ts
getPositionHighestProfitDistancePnlCost: (symbol: string, currentPrice: number) => Promise<number>
```

Returns the distance in PnL cost between the current price and the highest profit peak.

Computed as: max(0, peakPnlCost - currentPnlCost).

### getPositionHighestMaxDrawdownPnlPercentage

```ts
getPositionHighestMaxDrawdownPnlPercentage: (symbol: string, currentPrice: number) => Promise<number>
```

Returns the distance in PnL percentage between the current price and the worst drawdown trough.

Computed as: max(0, currentPnlPercentage - fallPnlPercentage).

### getPositionHighestMaxDrawdownPnlCost

```ts
getPositionHighestMaxDrawdownPnlCost: (symbol: string, currentPrice: number) => Promise<number>
```

Returns the distance in PnL cost between the current price and the worst drawdown trough.

Computed as: max(0, currentPnlCost - fallPnlCost).

### dispose

```ts
dispose: () => Promise<void>
```

Disposes the strategy instance and cleans up resources.

Called when the strategy is being removed from cache or shut down.
Invokes the onDispose callback to notify external systems.

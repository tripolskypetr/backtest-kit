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
getPendingSignal: (symbol: string) => Promise<IPublicSignalRow>
```

Retrieves the currently active pending signal for the symbol.
If no active signal exists, returns null.
Used internally for monitoring TP/SL and time expiration.

### getScheduledSignal

```ts
getScheduledSignal: (symbol: string) => Promise<IPublicSignalRow>
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

### backtest

```ts
backtest: (symbol: string, strategyName: string, candles: ICandleData[]) => Promise<IStrategyBacktestResult>
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
partialProfit: (symbol: string, percentToClose: number, currentPrice: number, backtest: boolean) => Promise<boolean>
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

### partialLoss

```ts
partialLoss: (symbol: string, percentToClose: number, currentPrice: number, backtest: boolean) => Promise<boolean>
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

### dispose

```ts
dispose: () => Promise<void>
```

Disposes the strategy instance and cleans up resources.

Called when the strategy is being removed from cache or shut down.
Invokes the onDispose callback to notify external systems.

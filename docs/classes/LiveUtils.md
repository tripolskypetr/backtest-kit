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
getPendingSignal: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<ISignalRow>
```

Retrieves the currently active pending signal for the strategy.
If no active signal exists, returns null.

### getScheduledSignal

```ts
getScheduledSignal: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<IScheduledSignalRow>
```

Retrieves the currently active scheduled signal for the strategy.
If no scheduled signal exists, returns null.

### getBreakeven

```ts
getBreakeven: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Checks if breakeven threshold has been reached for the current pending signal.

Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
to cover transaction costs (slippage + fees) and allow breakeven to be set.

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

### commitBreakeven

```ts
commitBreakeven: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<boolean>
```

Moves stop-loss to breakeven when price reaches threshold.

Moves SL to entry price (zero-risk position) when current price has moved
far enough in profit direction. Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2

### getData

```ts
getData: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<LiveStatisticsModel>
```

Gets statistical data from all live trading events for a symbol-strategy pair.

### getReport

```ts
getReport: (symbol: string, context: { strategyName: string; exchangeName: string; }, columns?: Columns$6[]) => Promise<string>
```

Generates markdown report with all events for a symbol-strategy pair.

### dump

```ts
dump: (symbol: string, context: { strategyName: string; exchangeName: string; }, path?: string, columns?: Columns$6[]) => Promise<void>
```

Saves strategy report to disk.

### list

```ts
list: () => Promise<{ id: string; symbol: string; strategyName: string; exchangeName: string; status: "pending" | "fulfilled" | "rejected" | "ready"; }[]>
```

Lists all active live trading instances with their current status.

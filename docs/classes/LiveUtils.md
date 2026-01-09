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
run: (symbol: string, context: { strategyName: string; exchangeName: string; }) => AsyncGenerator<IStrategyTickResultClosed | IStrategyTickResultOpened, void, unknown>
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

### stop

```ts
stop: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<void>
```

Stops the strategy from generating new signals.

Sets internal flag to prevent strategy from opening new signals.
Current active signal (if any) will complete normally.
Live trading will stop at the next safe point (idle/closed state).

### cancel

```ts
cancel: (symbol: string, context: { strategyName: string; exchangeName: string; }, cancelId?: string) => Promise<void>
```

Cancels the scheduled signal without stopping the strategy.

Clears the scheduled signal (waiting for priceOpen activation).
Does NOT affect active pending signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

### partialProfit

```ts
partialProfit: (symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<void>
```

Executes partial close at profit level (moving toward TP).

Closes a percentage of the active pending position at profit.
Price must be moving toward take profit (in profit direction).

### partialLoss

```ts
partialLoss: (symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; }) => Promise<void>
```

Executes partial close at loss level (moving toward SL).

Closes a percentage of the active pending position at loss.
Price must be moving toward stop loss (in loss direction).

### trailingStop

```ts
trailingStop: (symbol: string, percentShift: number, context: { strategyName: string; exchangeName: string; }) => Promise<void>
```

Adjusts the trailing stop-loss distance for an active pending signal.

Updates the stop-loss distance by a percentage adjustment relative to the original SL distance.
Positive percentShift tightens the SL (reduces distance), negative percentShift loosens it.

### getData

```ts
getData: (symbol: string, context: { strategyName: string; exchangeName: string; }) => Promise<LiveStatisticsModel>
```

Gets statistical data from all live trading events for a symbol-strategy pair.

### getReport

```ts
getReport: (symbol: string, context: { strategyName: string; exchangeName: string; }, columns?: Columns$5[]) => Promise<string>
```

Generates markdown report with all events for a symbol-strategy pair.

### dump

```ts
dump: (symbol: string, context: { strategyName: string; exchangeName: string; }, path?: string, columns?: Columns$5[]) => Promise<void>
```

Saves strategy report to disk.

### list

```ts
list: () => Promise<{ id: string; symbol: string; strategyName: string; exchangeName: string; status: "pending" | "fulfilled" | "rejected" | "ready"; }[]>
```

Lists all active live trading instances with their current status.

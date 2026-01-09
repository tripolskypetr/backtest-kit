---
title: docs/class/BacktestUtils
group: docs
---

# BacktestUtils

Utility class for backtest operations.

Provides simplified access to backtestCommandService.run() with logging.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### _getInstance

```ts
_getInstance: any
```

Memoized function to get or create BacktestInstance for a symbol-strategy pair.
Each symbol-strategy combination gets its own isolated instance.

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyBacktestResult, void, unknown>
```

Runs backtest for a symbol with context propagation.

### background

```ts
background: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => () => void
```

Runs backtest in background without yielding results.

Consumes all backtest results internally without exposing them.
Useful for running backtests for side effects only (callbacks, logging).

### getPendingSignal

```ts
getPendingSignal: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<ISignalRow>
```

Retrieves the currently active pending signal for the strategy.
If no active signal exists, returns null.

### getScheduledSignal

```ts
getScheduledSignal: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IScheduledSignalRow>
```

Retrieves the currently active scheduled signal for the strategy.
If no scheduled signal exists, returns null.

### stop

```ts
stop: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Stops the strategy from generating new signals.

Sets internal flag to prevent strategy from opening new signals.
Current active signal (if any) will complete normally.
Backtest will stop at the next safe point (idle state or after signal closes).

### cancel

```ts
cancel: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, cancelId?: string) => Promise<void>
```

Cancels the scheduled signal without stopping the strategy.

Clears the scheduled signal (waiting for priceOpen activation).
Does NOT affect active pending signals or strategy operation.
Does NOT set stop flag - strategy can continue generating new signals.

### partialProfit

```ts
partialProfit: (symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Executes partial close at profit level (moving toward TP).

Closes a percentage of the active pending position at profit.
Price must be moving toward take profit (in profit direction).

### partialLoss

```ts
partialLoss: (symbol: string, percentToClose: number, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Executes partial close at loss level (moving toward SL).

Closes a percentage of the active pending position at loss.
Price must be moving toward stop loss (in loss direction).

### trailingStop

```ts
trailingStop: (symbol: string, percentShift: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Adjusts the trailing stop-loss distance for an active pending signal.

Updates the stop-loss distance by a percentage adjustment relative to the original SL distance.
Positive percentShift tightens the SL (reduces distance), negative percentShift loosens it.

### getData

```ts
getData: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<BacktestStatisticsModel>
```

Gets statistical data from all closed signals for a symbol-strategy pair.

### getReport

```ts
getReport: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, columns?: Columns$6[]) => Promise<string>
```

Generates markdown report with all closed signals for a symbol-strategy pair.

### dump

```ts
dump: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, path?: string, columns?: Columns$6[]) => Promise<void>
```

Saves strategy report to disk.

### list

```ts
list: () => Promise<{ id: string; symbol: string; strategyName: string; exchangeName: string; frameName: string; status: "pending" | "fulfilled" | "rejected" | "ready"; }[]>
```

Lists all active backtest instances with their current status.

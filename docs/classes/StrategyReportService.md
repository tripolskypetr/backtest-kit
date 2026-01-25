---
title: docs/class/StrategyReportService
group: docs
---

# StrategyReportService

Service for persisting strategy management events to JSON report files.

Handles logging of strategy actions (cancel-scheduled, close-pending, partial-profit,
partial-loss, trailing-stop, trailing-take, breakeven) to persistent storage via
the Report class. Each event is written as a separate JSON record.

Unlike StrategyMarkdownService which accumulates events in memory for markdown reports,
this service writes each event immediately to disk for audit trail purposes.

Lifecycle:
- Call subscribe() to enable event logging
- Events are written via Report.writeData() with "strategy" category
- Call unsubscribe() to disable event logging

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

### strategyCoreService

```ts
strategyCoreService: StrategyCoreService
```

### cancelScheduled

```ts
cancelScheduled: (symbol: string, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, cancelId?: string) => Promise<void>
```

Logs a cancel-scheduled event when a scheduled signal is cancelled.

Retrieves the scheduled signal from StrategyCoreService and writes
the cancellation event to the report file.

### closePending

```ts
closePending: (symbol: string, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, closeId?: string) => Promise<void>
```

Logs a close-pending event when a pending signal is closed.

Retrieves the pending signal from StrategyCoreService and writes
the close event to the report file.

### partialProfit

```ts
partialProfit: (symbol: string, percentToClose: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Logs a partial-profit event when a portion of the position is closed at profit.

Records the percentage closed and current price when partial profit-taking occurs.

### partialLoss

```ts
partialLoss: (symbol: string, percentToClose: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Logs a partial-loss event when a portion of the position is closed at loss.

Records the percentage closed and current price when partial loss-cutting occurs.

### trailingStop

```ts
trailingStop: (symbol: string, percentShift: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Logs a trailing-stop event when the stop-loss is adjusted.

Records the percentage shift and current price when trailing stop moves.

### trailingTake

```ts
trailingTake: (symbol: string, percentShift: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Logs a trailing-take event when the take-profit is adjusted.

Records the percentage shift and current price when trailing take-profit moves.

### breakeven

```ts
breakeven: (symbol: string, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Logs a breakeven event when the stop-loss is moved to entry price.

Records the current price when breakeven protection is activated.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Initializes the service for event logging.

Must be called before any events can be logged. Uses singleshot pattern
to ensure only one subscription exists at a time.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Stops event logging and cleans up the subscription.

Safe to call multiple times - only clears if subscription exists.

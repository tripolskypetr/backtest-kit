---
title: docs/class/StrategyMarkdownService
group: docs
---

# StrategyMarkdownService

Service for accumulating strategy management events and generating markdown reports.

Collects strategy actions (cancel-scheduled, close-pending, partial-profit,
partial-loss, trailing-stop, trailing-take, breakeven) in memory and provides
methods to retrieve statistics, generate reports, and export to files.

Unlike StrategyReportService which writes each event to disk immediately,
this service accumulates events in ReportStorage instances (max 250 per
symbol-strategy pair) for batch reporting.

Features:
- In-memory event accumulation with memoized storage per symbol-strategy pair
- Statistical data extraction (event counts by action type)
- Markdown report generation with configurable columns
- File export with timestamped filenames
- Selective or full cache clearing

Lifecycle:
- Call subscribe() to enable event collection
- Events are collected automatically via cancelScheduled, closePending, etc.
- Use getData(), getReport(), or dump() to retrieve accumulated data
- Call unsubscribe() to disable collection and clear all data

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

### getStorage

```ts
getStorage: any
```

Memoized factory for ReportStorage instances.

Creates and caches ReportStorage per unique symbol-strategy-exchange-frame-backtest combination.
Uses CREATE_KEY_FN for cache key generation.

### cancelScheduled

```ts
cancelScheduled: (symbol: string, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, cancelId?: string) => Promise<void>
```

Records a cancel-scheduled event when a scheduled signal is cancelled.

Retrieves the scheduled signal from StrategyCoreService and stores
the cancellation event in the appropriate ReportStorage.

### closePending

```ts
closePending: (symbol: string, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, closeId?: string) => Promise<void>
```

Records a close-pending event when a pending signal is closed.

Retrieves the pending signal from StrategyCoreService and stores
the close event in the appropriate ReportStorage.

### partialProfit

```ts
partialProfit: (symbol: string, percentToClose: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Records a partial-profit event when a portion of the position is closed at profit.

Stores the percentage closed and current price when partial profit-taking occurs.

### partialLoss

```ts
partialLoss: (symbol: string, percentToClose: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Records a partial-loss event when a portion of the position is closed at loss.

Stores the percentage closed and current price when partial loss-cutting occurs.

### trailingStop

```ts
trailingStop: (symbol: string, percentShift: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Records a trailing-stop event when the stop-loss is adjusted.

Stores the percentage shift and current price when trailing stop moves.

### trailingTake

```ts
trailingTake: (symbol: string, percentShift: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Records a trailing-take event when the take-profit is adjusted.

Stores the percentage shift and current price when trailing take-profit moves.

### breakeven

```ts
breakeven: (symbol: string, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Records a breakeven event when the stop-loss is moved to entry price.

Stores the current price when breakeven protection is activated.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<StrategyStatisticsModel>
```

Retrieves aggregated statistics from accumulated strategy events.

Returns counts for each action type and the full event list from the
ReportStorage for the specified symbol-strategy pair.

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns[]) => Promise<string>
```

Generates a markdown report from accumulated strategy events.

Creates a formatted markdown document containing:
- Header with symbol and strategy name
- Table of all events with configurable columns
- Summary statistics with counts by action type

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns[]) => Promise<void>
```

Generates and saves a markdown report to disk.

Creates the output directory if it doesn't exist and writes
the report with a timestamped filename via Markdown.writeData().

Filename format: `{symbol}_{strategyName}_{exchangeName}[_{frameName}_backtest&vert;_live]-{timestamp}.md`

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears accumulated events from storage.

Can clear either a specific symbol-strategy pair or all stored data.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Initializes the service for event collection.

Must be called before any events can be collected or reports generated.
Uses singleshot pattern to ensure only one subscription exists at a time.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Stops event collection and clears all accumulated data.

Invokes the cleanup function returned by subscribe(), which clears
both the subscription and all ReportStorage instances.
Safe to call multiple times - only acts if subscription exists.

---
title: docs/class/ScheduleMarkdownService
group: docs
---

# ScheduleMarkdownService

Service for generating and saving scheduled signals markdown reports.

Features:
- Listens to scheduled and cancelled signal events via signalLiveEmitter
- Accumulates all events (scheduled, cancelled) per strategy
- Generates markdown tables with detailed event information
- Provides statistics (cancellation rate, average wait time)
- Saves reports to disk in logs/schedule/{strategyName}.md

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

Logger service for debug output

### getStorage

```ts
getStorage: any
```

Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
Each combination gets its own isolated storage instance.

### tick

```ts
tick: any
```

Processes tick events and accumulates scheduled/opened/cancelled events.
Should be called from signalEmitter subscription.

Processes only scheduled, opened and cancelled event types.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<ScheduleStatisticsModel>
```

Gets statistical data from all scheduled signal events for a symbol-strategy pair.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$4[]) => Promise<string>
```

Generates markdown report with all scheduled events for a symbol-strategy pair.
Delegates to ReportStorage.getReport().

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$4[]) => Promise<void>
```

Saves symbol-strategy report to disk.
Creates directory if it doesn't exist.
Delegates to ReportStorage.dump().

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears accumulated event data from storage.
If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
If nothing is provided, clears all data.

### init

```ts
init: (() => Promise<void>) & ISingleshotClearable
```

Initializes the service by subscribing to live signal events.
Uses singleshot to ensure initialization happens only once.
Automatically called on first use.

### unsubscribe

```ts
unsubscribe: Function
```

Function to unsubscribe from partial profit/loss events.
Assigned during init().

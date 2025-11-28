---
title: docs/api-reference/class/ScheduleMarkdownService
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

Memoized function to get or create ReportStorage for a strategy.
Each strategy gets its own isolated storage instance.

### tick

```ts
tick: any
```

Processes tick events and accumulates scheduled/cancelled events.
Should be called from signalLiveEmitter subscription.

Processes only scheduled and cancelled event types.

### getData

```ts
getData: (strategyName: string) => Promise<ScheduleStatistics>
```

Gets statistical data from all scheduled signal events for a strategy.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (strategyName: string) => Promise<string>
```

Generates markdown report with all scheduled events for a strategy.
Delegates to ReportStorage.getReport().

### dump

```ts
dump: (strategyName: string, path?: string) => Promise<void>
```

Saves strategy report to disk.
Creates directory if it doesn't exist.
Delegates to ReportStorage.dump().

### clear

```ts
clear: (strategyName?: string) => Promise<void>
```

Clears accumulated event data from storage.
If strategyName is provided, clears only that strategy's data.
If strategyName is omitted, clears all strategies' data.

### init

```ts
init: (() => Promise<void>) & ISingleshotClearable
```

Initializes the service by subscribing to live signal events.
Uses singleshot to ensure initialization happens only once.
Automatically called on first use.

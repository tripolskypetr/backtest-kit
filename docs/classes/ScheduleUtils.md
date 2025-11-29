---
title: docs/api-reference/class/ScheduleUtils
group: docs
---

# ScheduleUtils

Utility class for scheduled signals reporting operations.

Provides simplified access to scheduleMarkdownService with logging.
Exported as singleton instance for convenient usage.

Features:
- Track scheduled signals in queue
- Track cancelled signals
- Calculate cancellation rate and average wait time
- Generate markdown reports

## Constructor

```ts
constructor();
```

## Properties

### getData

```ts
getData: (strategyName: string) => Promise<ScheduleStatistics>
```

Gets statistical data from all scheduled signal events for a strategy.

### getReport

```ts
getReport: (strategyName: string) => Promise<string>
```

Generates markdown report with all scheduled events for a strategy.

### dump

```ts
dump: (strategyName: string, path?: string) => Promise<void>
```

Saves strategy report to disk.

### clear

```ts
clear: (strategyName?: string) => Promise<void>
```

Clears accumulated scheduled signal data from storage.
If strategyName is provided, clears only that strategy's data.
If strategyName is omitted, clears all strategies' data.

---
title: docs/class/PerformanceMarkdownService
group: docs
---

# PerformanceMarkdownService

Service for collecting and analyzing performance metrics.

Features:
- Listens to performance events via performanceEmitter
- Accumulates metrics per strategy
- Calculates aggregated statistics (avg, min, max, percentiles)
- Generates markdown reports with bottleneck analysis
- Saves reports to disk in logs/performance/{strategyName}.md

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

Memoized function to get or create PerformanceStorage for a symbol-strategy-exchange-frame-backtest combination.
Each combination gets its own isolated storage instance.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to performance emitter to receive performance events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from performance emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

### track

```ts
track: any
```

Processes performance events and accumulates metrics.
Should be called from performance tracking code.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<PerformanceStatisticsModel>
```

Gets aggregated performance statistics for a symbol-strategy pair.

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$5[]) => Promise<string>
```

Generates markdown report with performance analysis.

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$5[]) => Promise<void>
```

Saves performance report to disk.

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears accumulated performance data from storage.

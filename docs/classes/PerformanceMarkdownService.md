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
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$3[]) => Promise<string>
```

Generates markdown report with performance analysis.

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$3[]) => Promise<void>
```

Saves performance report to disk.

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears accumulated performance data from storage.

### init

```ts
init: (() => Promise<void>) & ISingleshotClearable
```

Initializes the service by subscribing to performance events.
Uses singleshot to ensure initialization happens only once.

### unsubscribe

```ts
unsubscribe: Function
```

Function to unsubscribe from partial profit/loss events.
Assigned during init().

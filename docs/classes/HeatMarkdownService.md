---
title: docs/api-reference/class/HeatMarkdownService
group: docs
---

# HeatMarkdownService

Portfolio Heatmap Markdown Service.

Subscribes to signalEmitter and aggregates statistics across all symbols per strategy.
Provides portfolio-wide metrics and per-symbol breakdowns.

Features:
- Real-time aggregation of closed signals
- Per-symbol statistics (Total PNL, Sharpe Ratio, Max Drawdown, Trades)
- Portfolio-wide aggregated metrics per strategy
- Markdown table report generation
- Safe math (handles NaN/Infinity gracefully)
- Strategy-based navigation using memoized storage

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

Memoized function to get or create HeatmapStorage for a strategy.
Each strategy gets its own isolated heatmap storage instance.

### tick

```ts
tick: any
```

Processes tick events and accumulates closed signals.
Should be called from signal emitter subscription.

Only processes closed signals - opened signals are ignored.

### getData

```ts
getData: (strategyName: string) => Promise<HeatmapStatisticsModel>
```

Gets aggregated portfolio heatmap statistics for a strategy.

### getReport

```ts
getReport: (strategyName: string, columns?: Columns$2[]) => Promise<string>
```

Generates markdown report with portfolio heatmap table for a strategy.

### dump

```ts
dump: (strategyName: string, path?: string, columns?: Columns$2[]) => Promise<void>
```

Saves heatmap report to disk for a strategy.

Creates directory if it doesn't exist.
Default filename: {strategyName}.md

### clear

```ts
clear: (strategyName?: string) => Promise<void>
```

Clears accumulated heatmap data from storage.
If strategyName is provided, clears only that strategy's data.
If strategyName is omitted, clears all strategies' data.

### init

```ts
init: (() => Promise<void>) & ISingleshotClearable
```

Initializes the service by subscribing to signal events.
Uses singleshot to ensure initialization happens only once.
Automatically called on first use.

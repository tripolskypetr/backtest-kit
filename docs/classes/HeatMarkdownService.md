---
title: docs/class/HeatMarkdownService
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

Memoized function to get or create HeatmapStorage for exchange, frame and backtest mode.
Each exchangeName + frameName + backtest mode combination gets its own isolated heatmap storage instance.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to signal emitter to receive tick events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from signal emitter to stop receiving tick events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

### tick

```ts
tick: any
```

Processes tick events and accumulates closed signals.
Should be called from signal emitter subscription.

Only processes closed signals - opened signals are ignored.

### getData

```ts
getData: (exchangeName: string, frameName: string, backtest: boolean) => Promise<HeatmapStatisticsModel>
```

Gets aggregated portfolio heatmap statistics.

### getReport

```ts
getReport: (strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$4[]) => Promise<string>
```

Generates markdown report with portfolio heatmap table.

### dump

```ts
dump: (strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$4[]) => Promise<void>
```

Saves heatmap report to disk.

Creates directory if it doesn't exist.
Default filename: {strategyName}.md

### clear

```ts
clear: (payload?: { exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears accumulated heatmap data from storage.
If payload is provided, clears only that exchangeName+frameName+backtest combination's data.
If payload is omitted, clears all data.

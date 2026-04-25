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
subscribe: (() => () => void) & ISingleshotClearable<() => () => void>
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

Handles a single tick event emitted by `signalEmitter`.

Filters out every action except `"closed"` — idle, scheduled, waiting,
opened, active, and cancelled ticks are silently ignored.
For closed signals, routes the payload to the appropriate `HeatmapStorage`
via `getStorage(exchangeName, frameName, backtest)` and calls `addSignal`.

### getData

```ts
getData: (exchangeName: string, frameName: string, backtest: boolean) => Promise<HeatmapStatisticsModel>
```

Returns aggregated portfolio heatmap statistics for the given context.

Delegates to the `HeatmapStorage` instance identified by
`(exchangeName, frameName, backtest)`. If no signals have been accumulated
yet for that combination, the returned `symbols` array will be empty and
portfolio-level fields will be `null` / `0`.

### getReport

```ts
getReport: (strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$7[]) => Promise<string>
```

Generates a markdown heatmap report for the given context.

Delegates to `HeatmapStorage.getReport`. The resulting string includes a
portfolio summary line followed by a markdown table with one row per
symbol, ordered by `sharpeRatio` descending.

### dump

```ts
dump: (strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$7[]) => Promise<void>
```

Generates the heatmap report and writes it to disk.

Delegates to `HeatmapStorage.dump`. The filename follows the pattern:
- Backtest: `{strategyName}_{exchangeName}_{frameName}_backtest-{timestamp}.md`
- Live:     `{strategyName}_{exchangeName}_live-{timestamp}.md`

### clear

```ts
clear: (payload?: { exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Evicts memoized `HeatmapStorage` instances, releasing all accumulated signal data.

- With `payload` — clears only the storage bucket identified by
  `(payload.exchangeName, payload.frameName, payload.backtest)`;
  subsequent calls to `getData` / `getReport` / `dump` for that combination
  will start from an empty state.
- Without `payload` — clears **all** storage buckets across every
  exchange / frame / mode combination.

Also called internally by the unsubscribe closure returned from `subscribe()`.

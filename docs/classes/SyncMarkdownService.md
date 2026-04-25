---
title: docs/class/SyncMarkdownService
group: docs
---

# SyncMarkdownService

Service for generating and saving signal sync markdown reports.

Features:
- Listens to signal sync events via syncSubject (signal-open and signal-close)
- Accumulates all sync events per symbol-strategy-exchange-frame-backtest combination
- Generates markdown tables with detailed signal lifecycle information
- Provides statistics (total events, opens, closes)
- Saves reports to disk in dump/sync/

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### getStorage

```ts
getStorage: any
```

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable<() => () => void>
```

Subscribes to `syncSubject` to start receiving `SignalSyncContract` events.
Protected against multiple subscriptions via `singleshot` — subsequent calls
return the same unsubscribe function without re-subscribing.

The returned unsubscribe function clears the `singleshot` state, evicts all
memoized `ReportStorage` instances, and detaches from `syncSubject`.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Detaches from `syncSubject` and clears all accumulated data.

Calls the unsubscribe closure returned by `subscribe()`.
If `subscribe()` was never called, does nothing.

### tick

```ts
tick: any
```

Handles a single `SignalSyncContract` event emitted by `syncSubject`.

Maps the contract fields to a `SyncEvent`, enriching it with a
`createdAt` ISO timestamp from `getContextTimestamp()` (backtest clock
or real clock aligned to the nearest minute).
For `"signal-close"` events, `closeReason` is preserved; for
`"signal-open"` events it is set to `undefined`.

Routes the constructed event to the appropriate `ReportStorage` bucket
via `getStorage(symbol, strategyName, exchangeName, frameName, backtest)`.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<SyncStatisticsModel>
```

Returns accumulated sync statistics for the given context.

Delegates to the `ReportStorage` bucket identified by
`(symbol, strategyName, exchangeName, frameName, backtest)`.
If no events have been recorded yet for that combination, the returned
model has an empty `eventList` and all counters set to `0`.

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$2[]) => Promise<string>
```

Generates a markdown sync report for the given context.

Delegates to `ReportStorage.getReport`. The resulting string includes a
markdown table (newest events first) followed by total / open / close
counters.

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$2[]) => Promise<void>
```

Generates the sync report and writes it to disk.

Delegates to `ReportStorage.dump`. The filename follows the pattern:
- Backtest: `{symbol}_{strategyName}_{exchangeName}_{frameName}_backtest-{timestamp}.md`
- Live:     `{symbol}_{strategyName}_{exchangeName}_live-{timestamp}.md`

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Evicts memoized `ReportStorage` instances, releasing all accumulated event data.

- With `payload` — clears only the storage bucket identified by
  `(symbol, strategyName, exchangeName, frameName, backtest)`;
  subsequent calls for that combination start from an empty state.
- Without `payload` — clears **all** storage buckets.

Also called internally by the unsubscribe closure returned from `subscribe()`.

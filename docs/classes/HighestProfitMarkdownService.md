---
title: docs/class/HighestProfitMarkdownService
group: docs
---

# HighestProfitMarkdownService

Service for generating and saving highest profit markdown reports.

Listens to highestProfitSubject and accumulates events per
symbol-strategy-exchange-frame combination. Provides getData(),
getReport(), and dump() methods matching the Partial pattern.

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

Subscribes to `highestProfitSubject` to start receiving `HighestProfitContract`
events. Protected against multiple subscriptions via `singleshot` — subsequent
calls return the same unsubscribe function without re-subscribing.

The returned unsubscribe function clears the `singleshot` state, evicts all
memoized `ReportStorage` instances, and detaches from `highestProfitSubject`.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Detaches from `highestProfitSubject` and clears all accumulated data.

Calls the unsubscribe closure returned by `subscribe()`.
If `subscribe()` was never called, does nothing.

### tick

```ts
tick: any
```

Handles a single `HighestProfitContract` event emitted by `highestProfitSubject`.

Routes the payload to the appropriate `ReportStorage` bucket via
`getStorage(symbol, strategyName, exchangeName, frameName, backtest)` —
where `strategyName` is taken from `data.signal.strategyName` — and
delegates event construction to `ReportStorage.addEvent`.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<HighestProfitStatisticsModel>
```

Returns accumulated highest profit statistics for the given context.

Delegates to the `ReportStorage` bucket identified by
`(symbol, strategyName, exchangeName, frameName, backtest)`.
If no events have been recorded yet for that combination, the returned
model has an empty `eventList` and `totalEvents` of `0`.

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$5[]) => Promise<string>
```

Generates a markdown highest profit report for the given context.

Delegates to `ReportStorage.getReport`. The resulting string includes a
markdown table (newest events first) followed by the total event count.

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$5[]) => Promise<void>
```

Generates the highest profit report and writes it to disk.

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

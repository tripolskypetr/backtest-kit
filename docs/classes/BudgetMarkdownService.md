---
title: docs/class/BudgetMarkdownService
group: docs
---

# BudgetMarkdownService

Service for generating and saving budget markdown reports.

Listens to budgetSubject and accumulates journal rows per
strategy-exchange-frame-backtest-name combination (one bucket per budget
record, shared by every symbol of the run). Provides getData(),
getReport(), and dump() methods matching the HighestProfit pattern.

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

Subscribes to `budgetSubject` to start receiving `BudgetContract`
events. Protected against multiple subscriptions via `singleshot` — subsequent
calls return the same unsubscribe function without re-subscribing.

The returned unsubscribe function clears the `singleshot` state, evicts all
memoized `ReportStorage` instances, and detaches from `budgetSubject`.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Detaches from `budgetSubject` and clears all accumulated data.

Calls the unsubscribe closure returned by `subscribe()`.
If `subscribe()` was never called, does nothing.

### tick

```ts
tick: any
```

Handles a single `BudgetContract` event emitted by `budgetSubject`.

Routes the payload to the appropriate `ReportStorage` bucket via
`getStorage(strategyName, exchangeName, frameName, backtest, name)` and
delegates event construction to `ReportStorage.addEvent`.

### getData

```ts
getData: (strategyName: string, exchangeName: string, frameName: string, backtest: boolean, name: string) => Promise<BudgetStatisticsModel>
```

Returns accumulated budget statistics for the given record.

Delegates to the `ReportStorage` bucket identified by
`(strategyName, exchangeName, frameName, backtest, name)`.
If no rows have been recorded yet for that combination, the returned
model has an empty `eventList` and zero totals.

### getReport

```ts
getReport: (strategyName: string, exchangeName: string, frameName: string, backtest: boolean, name: string, columns?: Columns$c[]) => Promise<string>
```

Generates a markdown budget report for the given record.

Delegates to `ReportStorage.getReport`. The resulting string includes a
markdown table (newest rows first) followed by the totals.

### dump

```ts
dump: (strategyName: string, exchangeName: string, frameName: string, backtest: boolean, name: string, path?: string, columns?: Columns$c[]) => Promise<void>
```

Generates the budget report and writes it to disk.

Delegates to `ReportStorage.dump`. The filename follows the pattern:
- Backtest: `{strategyName}_{exchangeName}_{frameName}_backtest_{name}-{timestamp}.md`
- Live:     `{strategyName}_{exchangeName}_live_{name}-{timestamp}.md`

### clear

```ts
clear: (payload?: { strategyName: string; exchangeName: string; frameName: string; backtest: boolean; name: string; }) => Promise<void>
```

Evicts memoized `ReportStorage` instances, releasing all accumulated rows.

- With `payload` — clears only the storage bucket identified by
  `(strategyName, exchangeName, frameName, backtest, name)`;
  subsequent calls for that combination start from an empty state.
- Without `payload` — clears **all** storage buckets.

Also called internally by the unsubscribe closure returned from `subscribe()`.

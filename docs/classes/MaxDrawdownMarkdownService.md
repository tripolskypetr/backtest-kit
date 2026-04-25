---
title: docs/class/MaxDrawdownMarkdownService
group: docs
---

# MaxDrawdownMarkdownService

Service for generating and saving max drawdown markdown reports.

Listens to maxDrawdownSubject and accumulates events per
symbol-strategy-exchange-frame combination. Provides getData(),
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

Subscribes to `maxDrawdownSubject` to start receiving `MaxDrawdownContract`
events. Protected against multiple subscriptions via `singleshot`.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Detaches from `maxDrawdownSubject` and clears all accumulated data.

If `subscribe()` was never called, does nothing.

### tick

```ts
tick: any
```

Handles a single `MaxDrawdownContract` event emitted by `maxDrawdownSubject`.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<MaxDrawdownStatisticsModel>
```

Returns accumulated max drawdown statistics for the given context.

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$4[]) => Promise<string>
```

Generates a markdown max drawdown report for the given context.

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$4[]) => Promise<void>
```

Generates the max drawdown report and writes it to disk.

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Evicts memoized `ReportStorage` instances, releasing all accumulated event data.

- With `payload` — clears only the storage bucket for that combination.
- Without `payload` — clears **all** storage buckets.

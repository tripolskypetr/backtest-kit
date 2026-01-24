---
title: docs/class/BreakevenMarkdownService
group: docs
---

# BreakevenMarkdownService

Service for generating and saving breakeven markdown reports.

Features:
- Listens to breakeven events via breakevenSubject
- Accumulates all events per symbol-strategy pair
- Generates markdown tables with detailed event information
- Provides statistics (total breakeven events)
- Saves reports to disk in dump/breakeven/{symbol}_{strategyName}.md

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

Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
Each combination gets its own isolated storage instance.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to breakeven signal emitter to receive events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from breakeven signal emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

### tickBreakeven

```ts
tickBreakeven: any
```

Processes breakeven events and accumulates them.
Should be called from breakevenSubject subscription.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<BreakevenStatisticsModel>
```

Gets statistical data from all breakeven events for a symbol-strategy pair.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$1[]) => Promise<string>
```

Generates markdown report with all breakeven events for a symbol-strategy pair.
Delegates to ReportStorage.getReport().

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$1[]) => Promise<void>
```

Saves symbol-strategy report to disk.
Creates directory if it doesn't exist.
Delegates to ReportStorage.dump().

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears accumulated event data from storage.
If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
If nothing is provided, clears all data.

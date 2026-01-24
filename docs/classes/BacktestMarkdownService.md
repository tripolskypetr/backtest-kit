---
title: docs/class/BacktestMarkdownService
group: docs
---

# BacktestMarkdownService

Service for generating and saving backtest markdown reports.

Features:
- Listens to signal events via onTick callback
- Accumulates closed signals per strategy using memoized storage
- Generates markdown tables with detailed signal information
- Saves reports to disk in logs/backtest/{strategyName}.md

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

### tick

```ts
tick: any
```

Processes tick events and accumulates closed signals.
Should be called from IStrategyCallbacks.onTick.

Only processes closed signals - opened signals are ignored.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<BacktestStatisticsModel>
```

Gets statistical data from all closed signals for a symbol-strategy pair.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$8[]) => Promise<string>
```

Generates markdown report with all closed signals for a symbol-strategy pair.
Delegates to ReportStorage.generateReport().

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$8[]) => Promise<void>
```

Saves symbol-strategy report to disk.
Creates directory if it doesn't exist.
Delegates to ReportStorage.dump().

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => Promise<void>
```

Clears accumulated signal data from storage.
If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
If nothing is provided, clears all data.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to backtest signal emitter to receive tick events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from backtest signal emitter to stop receiving tick events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

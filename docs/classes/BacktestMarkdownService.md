---
title: docs/api-reference/class/BacktestMarkdownService
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

Memoized function to get or create ReportStorage for a symbol-strategy pair.
Each symbol-strategy combination gets its own isolated storage instance.

### tick

```ts
tick: any
```

Processes tick events and accumulates closed signals.
Should be called from IStrategyCallbacks.onTick.

Only processes closed signals - opened signals are ignored.

### getData

```ts
getData: (symbol: string, strategyName: string) => Promise<BacktestStatisticsModel>
```

Gets statistical data from all closed signals for a symbol-strategy pair.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (symbol: string, strategyName: string, columns?: Columns$6[]) => Promise<string>
```

Generates markdown report with all closed signals for a symbol-strategy pair.
Delegates to ReportStorage.generateReport().

### dump

```ts
dump: (symbol: string, strategyName: string, path?: string, columns?: Columns$6[]) => Promise<void>
```

Saves symbol-strategy report to disk.
Creates directory if it doesn't exist.
Delegates to ReportStorage.dump().

### clear

```ts
clear: (ctx?: { symbol: string; strategyName: string; }) => Promise<void>
```

Clears accumulated signal data from storage.
If ctx is provided, clears only that specific symbol-strategy pair's data.
If nothing is provided, clears all data.

### init

```ts
init: (() => Promise<void>) & ISingleshotClearable
```

Initializes the service by subscribing to backtest signal events.
Uses singleshot to ensure initialization happens only once.
Automatically called on first use.

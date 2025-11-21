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

Memoized function to get or create ReportStorage for a strategy.
Each strategy gets its own isolated storage instance.

### tick

```ts
tick: (data: IStrategyTickResult) => Promise<void>
```

Processes tick events and accumulates closed signals.
Should be called from IStrategyCallbacks.onTick.

Only processes closed signals - opened signals are ignored.

### getReport

```ts
getReport: (strategyName: string) => Promise<string>
```

Generates markdown report with all closed signals for a strategy.
Delegates to ReportStorage.generateReport().

### dump

```ts
dump: (strategyName: string, path?: string) => Promise<void>
```

Saves strategy report to disk.
Creates directory if it doesn't exist.
Delegates to ReportStorage.dump().

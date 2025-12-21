---
title: docs/class/LiveMarkdownService
group: docs
---

# LiveMarkdownService

Service for generating and saving live trading markdown reports.

Features:
- Listens to all signal events via onTick callback
- Accumulates all events (idle, opened, active, closed) per strategy
- Generates markdown tables with detailed event information
- Provides trading statistics (win rate, average PNL)
- Saves reports to disk in logs/live/{strategyName}.md

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

Memoized function to get or create ReportStorage for a symbol-strategy-backtest triple.
Each symbol-strategy-backtest combination gets its own isolated storage instance.

### tick

```ts
tick: any
```

Processes tick events and accumulates all event types.
Should be called from IStrategyCallbacks.onTick.

Processes all event types: idle, opened, active, closed.

### getData

```ts
getData: (symbol: string, strategyName: string, backtest: boolean) => Promise<LiveStatisticsModel>
```

Gets statistical data from all live trading events for a symbol-strategy pair.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (symbol: string, strategyName: string, backtest: boolean, columns?: Columns$5[]) => Promise<string>
```

Generates markdown report with all events for a symbol-strategy pair.
Delegates to ReportStorage.getReport().

### dump

```ts
dump: (symbol: string, strategyName: string, backtest: boolean, path?: string, columns?: Columns$5[]) => Promise<void>
```

Saves symbol-strategy report to disk.
Creates directory if it doesn't exist.
Delegates to ReportStorage.dump().

### clear

```ts
clear: (backtest: boolean, ctx?: { symbol: string; strategyName: string; }) => Promise<void>
```

Clears accumulated event data from storage.
If ctx is provided, clears only that specific symbol-strategy-backtest triple's data.
If nothing is provided, clears all data.

### init

```ts
init: (() => Promise<void>) & ISingleshotClearable
```

Initializes the service by subscribing to live signal events.
Uses singleshot to ensure initialization happens only once.
Automatically called on first use.

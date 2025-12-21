---
title: docs/class/RiskMarkdownService
group: docs
---

# RiskMarkdownService

Service for generating and saving risk rejection markdown reports.

Features:
- Listens to risk rejection events via riskSubject
- Accumulates all rejection events per symbol-strategy pair
- Generates markdown tables with detailed rejection information
- Provides statistics (total rejections, by symbol, by strategy)
- Saves reports to disk in dump/risk/{symbol}_{strategyName}.md

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

### tickRejection

```ts
tickRejection: any
```

Processes risk rejection events and accumulates them.
Should be called from riskSubject subscription.

### getData

```ts
getData: (symbol: string, strategyName: string, backtest: boolean) => Promise<RiskStatisticsModel>
```

Gets statistical data from all risk rejection events for a symbol-strategy pair.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (symbol: string, strategyName: string, backtest: boolean, columns?: Columns[]) => Promise<string>
```

Generates markdown report with all risk rejection events for a symbol-strategy pair.
Delegates to ReportStorage.getReport().

### dump

```ts
dump: (symbol: string, strategyName: string, backtest: boolean, path?: string, columns?: Columns[]) => Promise<void>
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

Initializes the service by subscribing to risk rejection events.
Uses singleshot to ensure initialization happens only once.
Automatically called on first use.

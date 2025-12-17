---
title: docs/api-reference/class/WalkerMarkdownService
group: docs
---

# WalkerMarkdownService

Service for generating and saving walker markdown reports.

Features:
- Listens to walker events via tick callback
- Accumulates strategy results per walker using memoized storage
- Generates markdown tables with detailed strategy comparison
- Saves reports to disk in logs/walker/{walkerName}.md

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

Memoized function to get or create ReportStorage for a walker.
Each walker gets its own isolated storage instance.

### tick

```ts
tick: any
```

Processes walker progress events and accumulates strategy results.
Should be called from walkerEmitter.

### getData

```ts
getData: (walkerName: string, symbol: string, metric: WalkerMetric, context: { exchangeName: string; frameName: string; }) => Promise<WalkerCompleteContract>
```

Gets walker results data from all strategy results.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (walkerName: string, symbol: string, metric: WalkerMetric, context: { exchangeName: string; frameName: string; }, strategyColumns?: StrategyColumn[], pnlColumns?: PnlColumn[]) => Promise<...>
```

Generates markdown report with all strategy results for a walker.
Delegates to ReportStorage.getReport().

### dump

```ts
dump: (walkerName: string, symbol: string, metric: WalkerMetric, context: { exchangeName: string; frameName: string; }, path?: string, strategyColumns?: StrategyColumn[], pnlColumns?: PnlColumn[]) => Promise<...>
```

Saves walker report to disk.
Creates directory if it doesn't exist.
Delegates to ReportStorage.dump().

### clear

```ts
clear: (walkerName?: string) => Promise<void>
```

Clears accumulated result data from storage.
If walkerName is provided, clears only that walker's data.
If walkerName is omitted, clears all walkers' data.

### init

```ts
init: (() => Promise<void>) & ISingleshotClearable
```

Initializes the service by subscribing to walker events.
Uses singleshot to ensure initialization happens only once.
Automatically called on first use.

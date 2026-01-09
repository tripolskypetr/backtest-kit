---
title: docs/class/PartialMarkdownService
group: docs
---

# PartialMarkdownService

Service for generating and saving partial profit/loss markdown reports.

Features:
- Listens to partial profit and loss events via partialProfitSubject/partialLossSubject
- Accumulates all events (profit, loss) per symbol-strategy pair
- Generates markdown tables with detailed event information
- Provides statistics (total profit/loss events)
- Saves reports to disk in dump/partial/{symbol}_{strategyName}.md

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

### tickProfit

```ts
tickProfit: any
```

Processes profit events and accumulates them.
Should be called from partialProfitSubject subscription.

### tickLoss

```ts
tickLoss: any
```

Processes loss events and accumulates them.
Should be called from partialLossSubject subscription.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<PartialStatisticsModel>
```

Gets statistical data from all partial profit/loss events for a symbol-strategy pair.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$1[]) => Promise<string>
```

Generates markdown report with all partial events for a symbol-strategy pair.
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

### init

```ts
init: (() => Promise<void>) & ISingleshotClearable
```

Initializes the service by subscribing to partial profit/loss events.
Uses singleshot to ensure initialization happens only once.
Automatically called on first use.

### unsubscribe

```ts
unsubscribe: Function
```

Function to unsubscribe from partial profit/loss events.
Assigned during init().

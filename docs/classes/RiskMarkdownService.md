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

Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
Each combination gets its own isolated storage instance.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to risk rejection emitter to receive rejection events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from risk rejection emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

### tickRejection

```ts
tickRejection: any
```

Processes risk rejection events and accumulates them.
Should be called from riskSubject subscription.

### getData

```ts
getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<RiskStatisticsModel>
```

Gets statistical data from all risk rejection events for a symbol-strategy pair.
Delegates to ReportStorage.getData().

### getReport

```ts
getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$2[]) => Promise<string>
```

Generates markdown report with all risk rejection events for a symbol-strategy pair.
Delegates to ReportStorage.getReport().

### dump

```ts
dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$2[]) => Promise<void>
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

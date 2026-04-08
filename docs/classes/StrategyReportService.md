---
title: docs/class/StrategyReportService
group: docs
---

# StrategyReportService

Service for persisting strategy management events to JSON report files.

Handles logging of strategy actions (cancel-scheduled, close-pending, partial-profit,
partial-loss, trailing-stop, trailing-take, breakeven) to persistent storage via
the Report class. Each event is written as a separate JSON record.

Unlike StrategyMarkdownService which accumulates events in memory for markdown reports,
this service writes each event immediately to disk for audit trail purposes.

Lifecycle:
- Call subscribe() to enable event logging
- Events are written via ReportWriter.writeData() with "strategy" category
- Call unsubscribe() to disable event logging

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### cancelScheduled

```ts
cancelScheduled: (symbol: string, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, cancelId?: string) => Promise<...>
```

Logs a cancel-scheduled event when a scheduled signal is cancelled.

### closePending

```ts
closePending: (symbol: string, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, closeId?: string) => Promise<...>
```

Logs a close-pending event when a pending signal is closed.

### partialProfit

```ts
partialProfit: (symbol: string, percentToClose: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, position: "long" | "short", priceOpen: number, priceTakeProfit: number, price...
```

Logs a partial-profit event when a portion of the position is closed at profit.

### partialLoss

```ts
partialLoss: (symbol: string, percentToClose: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, position: "long" | "short", priceOpen: number, priceTakeProfit: number, price...
```

Logs a partial-loss event when a portion of the position is closed at loss.

### trailingStop

```ts
trailingStop: (symbol: string, percentShift: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, position: "long" | "short", priceOpen: number, priceTakeProfit: number, priceSt...
```

Logs a trailing-stop event when the stop-loss is adjusted.

### trailingTake

```ts
trailingTake: (symbol: string, percentShift: number, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, position: "long" | "short", priceOpen: number, priceTakeProfit: number, priceSt...
```

Logs a trailing-take event when the take-profit is adjusted.

### breakeven

```ts
breakeven: (symbol: string, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, position: "long" | "short", priceOpen: number, priceTakeProfit: number, priceStopLoss: number, origin...
```

Logs a breakeven event when the stop-loss is moved to entry price.

### activateScheduled

```ts
activateScheduled: (symbol: string, currentPrice: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, position: "long" | "short", priceOpen: number, priceTakeProfit: number, priceStopLoss: number, origin...
```

Logs an activate-scheduled event when a scheduled signal is activated early.

### averageBuy

```ts
averageBuy: (symbol: string, currentPrice: number, effectivePriceOpen: number, totalEntries: number, isBacktest: boolean, context: { strategyName: string; exchangeName: string; frameName: string; }, timestamp: number, signalId: string, pnl: IStrategyPnL, totalPartials: number, cost: number, position: "long" | "short", priceOpen...
```

Logs an average-buy (DCA) event when a new averaging entry is added to an open position.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Initializes the service for event logging.

Must be called before any events can be logged. Uses singleshot pattern
to ensure only one subscription exists at a time.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Stops event logging and cleans up the subscription.

Safe to call multiple times - only clears if subscription exists.

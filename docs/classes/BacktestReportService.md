---
title: docs/class/BacktestReportService
group: docs
---

# BacktestReportService

Service for logging backtest strategy tick events to SQLite database.

Captures all backtest signal lifecycle events (idle, opened, active, closed)
and stores them in the Report database for analysis and debugging.

Features:
- Listens to backtest signal events via signalBacktestEmitter
- Logs all tick event types with full signal details
- Stores events in Report.writeData() for persistence
- Protected against multiple subscriptions using singleshot

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

### tick

```ts
tick: any
```

Processes backtest tick events and logs them to the database.
Handles all event types: idle, opened, active, closed.

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

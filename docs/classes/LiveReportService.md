---
title: docs/class/LiveReportService
group: docs
---

# LiveReportService

Service for logging live trading strategy tick events to SQLite database.

Captures all live trading signal lifecycle events (idle, opened, active, closed)
and stores them in the Report database for real-time monitoring and analysis.

Features:
- Listens to live signal events via signalLiveEmitter
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

Processes live trading tick events and logs them to the database.
Handles all event types: idle, opened, active, closed.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to live signal emitter to receive tick events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from live signal emitter to stop receiving tick events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

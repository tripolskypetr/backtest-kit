---
title: docs/class/ScheduleReportService
group: docs
---

# ScheduleReportService

Service for logging scheduled signal events to SQLite database.

Captures all scheduled signal lifecycle events (scheduled, opened, cancelled)
and stores them in the Report database for tracking delayed order execution.

Features:
- Listens to signal events via signalEmitter
- Logs scheduled, opened (from scheduled), and cancelled events
- Calculates duration between scheduling and execution/cancellation
- Stores events in Report.writeData() for schedule tracking
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

Processes signal tick events and logs scheduled signal lifecycle to the database.
Handles scheduled, opened (from scheduled), and cancelled event types.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to signal emitter to receive scheduled signal events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from signal emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

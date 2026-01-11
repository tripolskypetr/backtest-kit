---
title: docs/class/HeatReportService
group: docs
---

# HeatReportService

Service for logging heatmap (closed signals) events to SQLite database.

Captures closed signal events across all symbols for portfolio-wide
heatmap analysis and stores them in the Report database.

Features:
- Listens to signal events via signalEmitter
- Logs only closed signals with PNL data
- Stores events in Report.writeData() for heatmap generation
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

Processes signal tick events and logs closed signals to the database.
Only processes closed signals - other actions are ignored.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to signal emitter to receive closed signal events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from signal emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

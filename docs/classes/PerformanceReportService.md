---
title: docs/class/PerformanceReportService
group: docs
---

# PerformanceReportService

Service for logging performance metrics to SQLite database.

Captures all performance timing events from strategy execution
and stores them in the Report database for bottleneck analysis and optimization.

Features:
- Listens to performance events via performanceEmitter
- Logs all timing metrics with duration and metadata
- Stores events in Report.writeData() for performance analysis
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

### track

```ts
track: any
```

Processes performance tracking events and logs them to the database.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to performance emitter to receive timing events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from performance emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

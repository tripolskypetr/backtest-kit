---
title: docs/class/WalkerReportService
group: docs
---

# WalkerReportService

Service for logging walker optimization progress to SQLite database.

Captures walker strategy optimization results and stores them in the Report database
for tracking parameter optimization and comparing strategy performance.

Features:
- Listens to walker events via walkerEmitter
- Logs each strategy test result with metrics and statistics
- Tracks best strategy and optimization progress
- Stores events in Report.writeData() for optimization analysis
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

Processes walker optimization events and logs them to the database.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to walker emitter to receive optimization progress events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from walker emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

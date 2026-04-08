---
title: docs/class/SyncReportService
group: docs
---

# SyncReportService

Service for logging signal synchronization events to JSONL report files.

Captures all signal lifecycle sync events (signal-open, signal-close)
emitted by syncSubject and stores them in the Report database for
external order management audit trails.

Features:
- Listens to sync events via syncSubject
- Logs signal-open events (scheduled limit order filled) with full signal details
- Logs signal-close events (position exited) with PNL and close reason
- Stores events in ReportWriter.writeData() for persistence
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

Processes signal sync events and logs them to the database.
Handles both signal-open and signal-close action types.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to syncSubject to receive signal sync events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from syncSubject to stop receiving sync events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

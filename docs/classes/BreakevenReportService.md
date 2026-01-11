---
title: docs/class/BreakevenReportService
group: docs
---

# BreakevenReportService

Service for logging breakeven events to SQLite database.

Captures all breakeven events (when signal reaches breakeven point)
and stores them in the Report database for analysis and tracking.

Features:
- Listens to breakeven events via breakevenSubject
- Logs all breakeven achievements with full signal details
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

### tickBreakeven

```ts
tickBreakeven: any
```

Processes breakeven events and logs them to the database.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to breakeven signal emitter to receive breakeven events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from breakeven signal emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

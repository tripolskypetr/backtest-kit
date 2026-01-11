---
title: docs/class/RiskReportService
group: docs
---

# RiskReportService

Service for logging risk rejection events to SQLite database.

Captures all signal rejection events from the risk management system
and stores them in the Report database for risk analysis and auditing.

Features:
- Listens to risk rejection events via riskSubject
- Logs all rejected signals with reason and pending signal details
- Stores events in Report.writeData() for risk tracking
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

### tickRejection

```ts
tickRejection: any
```

Processes risk rejection events and logs them to the database.

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

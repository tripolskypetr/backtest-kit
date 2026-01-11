---
title: docs/class/PartialReportService
group: docs
---

# PartialReportService

Service for logging partial profit/loss events to SQLite database.

Captures all partial position exit events (profit and loss levels)
and stores them in the Report database for tracking partial closures.

Features:
- Listens to partial profit events via partialProfitSubject
- Listens to partial loss events via partialLossSubject
- Logs all partial exit events with level and price information
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

### tickProfit

```ts
tickProfit: any
```

Processes partial profit events and logs them to the database.

### tickLoss

```ts
tickLoss: any
```

Processes partial loss events and logs them to the database.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to partial profit/loss emitters to receive partial exit events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from partial profit/loss emitters to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.

---
title: docs/class/BudgetReportService
group: docs
---

# BudgetReportService

Service for logging budget journal rows to the JSONL report database.

Listens to budgetSubject and writes every inserted row (reserve / release /
reject / deposit / withdraw) to ReportWriter.writeData("budget") for
persistence and analytics (`./dump/report/budget.jsonl`).

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### tick

```ts
tick: any
```

Handles a single `BudgetContract` event emitted by `budgetSubject`.

Writes a JSONL record to the `"budget"` report database via
`ReportWriter.writeData`: the record key (`strategyName`, `exchangeName`,
`frameName`, `backtest`), the budget `name`, the authoring `symbol`, and
the journal row fields spread flat (`type`, `timestamp`, `seq`, `id` /
`asset`, `amount`, `pnl`, `requested`, `available`, `overdraft`, `note`,
`balance` after the row).

The search keys use the authoring symbol (empty string when the call had
none); `signalId` is empty — a budget record is not bound to a signal.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable<() => () => void>
```

Subscribes to `budgetSubject` to start persisting journal rows.
Protected against multiple subscriptions via `singleshot` — subsequent
calls return the same unsubscribe function without re-subscribing.

The returned unsubscribe function clears the `singleshot` state and
detaches from `budgetSubject`.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Detaches from `budgetSubject`, stopping further JSONL writes.

Calls the unsubscribe closure returned by `subscribe()`.
If `subscribe()` was never called, does nothing.

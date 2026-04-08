---
title: docs/class/HighestProfitReportService
group: docs
---

# HighestProfitReportService

Service for logging highest profit events to the JSONL report database.

Listens to highestProfitSubject and writes each new price record to
ReportWriter.writeData() for persistence and analytics.

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

Handles a single `HighestProfitContract` event emitted by `highestProfitSubject`.

Writes a JSONL record to the `"highest_profit"` report database via
`ReportWriter.writeData`, capturing the full signal snapshot at the moment
the new profit record was set:
- `timestamp`, `symbol`, `strategyName`, `exchangeName`, `frameName`, `backtest`
- `signalId`, `position`, `currentPrice`
- `priceOpen`, `priceTakeProfit`, `priceStopLoss` (effective values from the signal)

`strategyName` and signal-level fields are sourced from `data.signal`
rather than the contract root.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable
```

Subscribes to `highestProfitSubject` to start persisting profit records.
Protected against multiple subscriptions via `singleshot` — subsequent
calls return the same unsubscribe function without re-subscribing.

The returned unsubscribe function clears the `singleshot` state and
detaches from `highestProfitSubject`.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Detaches from `highestProfitSubject`, stopping further JSONL writes.

Calls the unsubscribe closure returned by `subscribe()`.
If `subscribe()` was never called, does nothing.

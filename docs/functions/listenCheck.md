---
title: docs/function/listenCheck
group: docs
---

# listenCheck

```ts
declare function listenCheck(fn: (event: OrderCheckContract) => void, warned?: boolean): () => void;
```

Subscribes to order-check ping events with queued async processing.
This is the order CHECK channel: it decides whether the order behind the monitored
signal is still open on the exchange.

Emits on every live tick while a signal is monitored, BEFORE completion evaluation,
discriminated by `event.type`: "active" — pending signal (open position), "schedule" —
scheduled signal (resting entry order). Backtest never emits this event.

Throw semantics (resolved into IBrokerOrderVerdict, identical to the Broker
`onOrderActiveCheck` / `onOrderScheduleCheck` channel):
- plain Error or {@link OrderTransientError} → "transient": the failed check is
  TOLERATED (order assumed still open, monitoring continues, `event.attempt`
  increments) up to CC_ORDER_CHECK_RETRY_ATTEMPTS CONSECUTIVE failures — a network
  blip no longer kills a live position; a successful check resets the streak.
  Exhaustion acts terminally (close "closed" / cancel "user") and signals a fatal
  exit (exitEmitter).
- {@link OrderDeletedError} → "deleted", TERMINAL at once, bypassing the tolerance:
  the CONFIRMED "order not found by `event.signalId`". A FILLED resting order is
  NOT a deleted order — confirm fills via commitActivateScheduled /
  commitCreateTakeProfit / commitCreateStopLoss instead.
- {@link OrderRejectedError} here is a userspace protocol violation (it belongs to
  the GATE channel) and intentionally degrades to "transient".

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle check events. If the function returns a promise, signal processing will wait until it resolves. |
| `warned` | |

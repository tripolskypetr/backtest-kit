---
title: docs/function/listenCheck
group: docs
---

# listenCheck

```ts
declare function listenCheck(fn: (event: OrderCheckContract) => void, warned?: boolean): () => void;
```

Subscribes to order-check ping events with queued async processing.
If throws, the order behind the monitored signal is treated as no longer open on the
exchange until the async function completes. Useful for synchronizing with external systems.

Emits on every live tick while a signal is monitored, BEFORE completion evaluation,
discriminated by `event.type`: "active" — pending signal (open position), "schedule" —
scheduled signal (resting entry order). Backtest never emits this event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle check events. If the function returns a promise, signal processing will wait until it resolves. |
| `warned` | |

---
title: docs/function/listenCheckOnce
group: docs
---

# listenCheckOnce

```ts
declare function listenCheckOnce(filterFn: (event: OrderCheckContract) => boolean, fn: (event: OrderCheckContract) => void, warned?: boolean): () => void;
```

Subscribes to filtered order-check ping events with one-time execution.
If throws, the order behind the monitored signal is treated as no longer open on the
exchange until the async function completes. Useful for synchronizing with external systems.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once). If the function returns a promise, signal processing will wait until it resolves. |
| `warned` | |

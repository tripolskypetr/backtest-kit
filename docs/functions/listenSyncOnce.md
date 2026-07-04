---
title: docs/function/listenSyncOnce
group: docs
---

# listenSyncOnce

```ts
declare function listenSyncOnce(filterFn: (event: OrderSyncContract) => boolean, fn: (event: OrderSyncContract) => void, warned?: boolean): () => void;
```

Subscribes to filtered signal synchronization events with one-time execution.
If throws position is not being opened/closed until the async function completes. Useful for synchronizing with external systems.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once). If the function returns a promise, signal processing will wait until it resolves. |
| `warned` | |

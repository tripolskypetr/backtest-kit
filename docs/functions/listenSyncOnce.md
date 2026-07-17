---
title: docs/function/listenSyncOnce
group: docs
---

# listenSyncOnce

```ts
declare function listenSyncOnce(filterFn: (event: OrderSyncContract) => boolean, fn: (event: OrderSyncContract) => void, warned?: boolean): () => void;
```

Subscribes to filtered signal synchronization events with one-time execution.
This is an order GATE: a throw from the listener rejects the open/close — see
{@link listenSync} for the full throw semantics (plain Error /
{@link OrderTransientError} = bounded "transient" retry, {@link OrderRejectedError}
= terminal at once, {@link OrderDeletedError} = protocol violation → transient).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once). If the function returns a promise, signal processing will wait until it resolves. |
| `warned` | |

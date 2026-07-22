---
title: docs/function/listenOrderStopOnce
group: docs
---

# listenOrderStopOnce

```ts
declare function listenOrderStopOnce(filterFn: (event: OrderStopContract) => boolean, fn: (event: OrderStopContract) => void): () => void;
```

Subscribes to filtered post-verdict order-check STOP events with one-time execution.
See {@link listenOrderStop} for the emission semantics.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once). If the function returns a promise, processing waits until it resolves. |

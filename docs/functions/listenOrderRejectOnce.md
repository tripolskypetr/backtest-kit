---
title: docs/function/listenOrderRejectOnce
group: docs
---

# listenOrderRejectOnce

```ts
declare function listenOrderRejectOnce(filterFn: (event: OrderRejectContract) => boolean, fn: (event: OrderRejectContract) => void): () => void;
```

Subscribes to filtered terminal order rejection events with one-time execution.
See {@link listenOrderReject} for the emission semantics (terminal "rejected"
verdicts only, live-only, listener throws swallowed).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once). If the function returns a promise, processing waits until it resolves. |

---
title: docs/function/listenOrderContinueOnce
group: docs
---

# listenOrderContinueOnce

```ts
declare function listenOrderContinueOnce(filterFn: (event: OrderContinueContract) => boolean, fn: (event: OrderContinueContract) => void): () => void;
```

Subscribes to filtered post-verdict order-check CONTINUE events with one-time execution.
See {@link listenOrderContinue} for the emission semantics.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once). If the function returns a promise, processing waits until it resolves. |

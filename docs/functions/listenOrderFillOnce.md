---
title: docs/function/listenOrderFillOnce
group: docs
---

# listenOrderFillOnce

```ts
declare function listenOrderFillOnce(filterFn: (event: OrderFillContract) => boolean, fn: (event: OrderFillContract) => void): () => void;
```

Subscribes to filtered broker-confirmed order fill events with one-time execution.
See {@link listenOrderFill} for the emission semantics (confirmed verdicts only,
live-only, listener throws swallowed).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once). If the function returns a promise, processing waits until it resolves. |

---
title: docs/function/listenCheckOnce
group: docs
---

# listenCheckOnce

```ts
declare function listenCheckOnce(filterFn: (event: OrderCheckContract) => boolean, fn: (event: OrderCheckContract) => void, warned?: boolean): () => void;
```

Subscribes to filtered order-check ping events with one-time execution.
This is the order CHECK channel — see {@link listenCheck} for the full throw
semantics (plain Error / {@link OrderTransientError} = tolerated "transient"
failure bounded by CC_ORDER_CHECK_RETRY_ATTEMPTS, {@link OrderDeletedError} =
confirmed not-found terminal at once, {@link OrderRejectedError} = protocol
violation → transient).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once). If the function returns a promise, signal processing will wait until it resolves. |
| `warned` | |

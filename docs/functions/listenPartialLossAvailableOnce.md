---
title: docs/function/listenPartialLossAvailableOnce
group: docs
---

# listenPartialLossAvailableOnce

```ts
declare function listenPartialLossAvailableOnce(filterFn: (event: PartialLossContract) => boolean, fn: (event: PartialLossContract) => void): () => void;
```

Subscribes to filtered partial loss level events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific loss conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

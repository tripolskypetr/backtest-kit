---
title: docs/function/listenSchedulePingOnce
group: docs
---

# listenSchedulePingOnce

```ts
declare function listenSchedulePingOnce(filterFn: (event: SchedulePingContract) => boolean, fn: (event: SchedulePingContract) => void): () => void;
```

Subscribes to filtered ping events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific ping conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

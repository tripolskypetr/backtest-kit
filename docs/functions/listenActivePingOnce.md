---
title: docs/function/listenActivePingOnce
group: docs
---

# listenActivePingOnce

```ts
declare function listenActivePingOnce(filterFn: (event: ActivePingContract) => boolean, fn: (event: ActivePingContract) => void): () => void;
```

Subscribes to filtered active ping events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific active ping conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

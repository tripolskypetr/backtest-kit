---
title: docs/function/listenBreakevenOnce
group: docs
---

# listenBreakevenOnce

```ts
declare function listenBreakevenOnce(filterFn: (event: BreakevenContract) => boolean, fn: (event: BreakevenContract) => void): () => void;
```

Subscribes to filtered breakeven protection events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific breakeven conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

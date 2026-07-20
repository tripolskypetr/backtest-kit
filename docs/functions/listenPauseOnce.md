---
title: docs/function/listenPauseOnce
group: docs
---

# listenPauseOnce

```ts
declare function listenPauseOnce(filterFn: (event: PauseContract) => boolean, fn: (event: PauseContract) => void): () => void;
```

Subscribes to filtered pause state change events with one-time execution.
Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

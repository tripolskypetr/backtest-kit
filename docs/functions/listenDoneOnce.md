---
title: docs/api-reference/function/listenDoneOnce
group: docs
---

# listenDoneOnce

```ts
declare function listenDoneOnce(filterFn: (event: DoneContract) => boolean, fn: (event: DoneContract) => void): () => void;
```

Subscribes to filtered background execution completion events with one-time execution.

Emits when Live.background() or Backtest.background() completes execution.
Executes callback once and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

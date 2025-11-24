---
title: docs/api-reference/function/listenDoneBacktestOnce
group: docs
---

# listenDoneBacktestOnce

```ts
declare function listenDoneBacktestOnce(filterFn: (event: DoneContract) => boolean, fn: (event: DoneContract) => void): () => void;
```

Subscribes to filtered backtest background execution completion events with one-time execution.

Emits when Backtest.background() completes execution.
Executes callback once and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

---
title: docs/api-reference/function/listenDoneBacktest
group: docs
---

# listenDoneBacktest

```ts
declare function listenDoneBacktest(fn: (event: DoneContract) => void): () => void;
```

Subscribes to backtest background execution completion events with queued async processing.

Emits when Backtest.background() completes execution.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle completion events |

---
title: docs/function/listenBreakeven
group: docs
---

# listenBreakeven

```ts
declare function listenBreakeven(fn: (event: BreakevenContract) => void): () => void;
```

Subscribes to breakeven protection events with queued async processing.

Emits when a signal's stop-loss is moved to breakeven (entry price).
This happens when price moves far enough in profit direction to cover transaction costs.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle breakeven events |

---
title: docs/api-reference/function/listenDoneWalker
group: docs
---

# listenDoneWalker

```ts
declare function listenDoneWalker(fn: (event: DoneContract) => void): () => void;
```

Subscribes to walker background execution completion events with queued async processing.

Emits when Walker.background() completes execution.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle completion events |

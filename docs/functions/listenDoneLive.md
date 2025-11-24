---
title: docs/api-reference/function/listenDoneLive
group: docs
---

# listenDoneLive

```ts
declare function listenDoneLive(fn: (event: DoneContract) => void): () => void;
```

Subscribes to live background execution completion events with queued async processing.

Emits when Live.background() completes execution.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle completion events |

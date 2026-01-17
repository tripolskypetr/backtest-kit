---
title: docs/function/listenPartialLossAvailable
group: docs
---

# listenPartialLossAvailable

```ts
declare function listenPartialLossAvailable(fn: (event: PartialLossContract) => void): () => void;
```

Subscribes to partial loss level events with queued async processing.

Emits when a signal reaches a loss level milestone (10%, 20%, 30%, etc).
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle partial loss events |

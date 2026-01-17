---
title: docs/function/listenPartialProfitAvailable
group: docs
---

# listenPartialProfitAvailable

```ts
declare function listenPartialProfitAvailable(fn: (event: PartialProfitContract) => void): () => void;
```

Subscribes to partial profit level events with queued async processing.

Emits when a signal reaches a profit level milestone (10%, 20%, 30%, etc).
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle partial profit events |

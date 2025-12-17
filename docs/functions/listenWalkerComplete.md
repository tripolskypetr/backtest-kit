---
title: docs/api-reference/function/listenWalkerComplete
group: docs
---

# listenWalkerComplete

```ts
declare function listenWalkerComplete(fn: (event: WalkerCompleteContract) => void): () => void;
```

Subscribes to walker completion events with queued async processing.

Emits when Walker.run() completes testing all strategies.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle walker completion event |

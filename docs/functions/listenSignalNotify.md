---
title: docs/function/listenSignalNotify
group: docs
---

# listenSignalNotify

```ts
declare function listenSignalNotify(fn: (event: SignalInfoContract) => void): () => void;
```

Subscribes to signal info events with queued async processing.
Emits when a strategy calls commitSignalInfo() to broadcast a user-defined note for an open position.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle signal info events |

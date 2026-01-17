---
title: docs/function/listenActivePing
group: docs
---

# listenActivePing

```ts
declare function listenActivePing(fn: (event: ActivePingContract) => void): () => void;
```

Subscribes to active ping events with queued async processing.

Listens for active pending signal monitoring events emitted every minute.
Useful for tracking active signal lifecycle and implementing dynamic management logic.

Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle active ping events |

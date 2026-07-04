---
title: docs/function/listenSync
group: docs
---

# listenSync

```ts
declare function listenSync(fn: (event: OrderSyncContract) => void, warned?: boolean): () => void;
```

Subscribes to signal synchronization events with queued async processing.
If throws position is not being opened/closed until the async function completes. Useful for synchronizing with external systems.

Emits when signals are being synchronized (e.g. pending signal being opened/closed).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle sync events. If the function returns a promise, signal processing will wait until it resolves. |
| `warned` | |

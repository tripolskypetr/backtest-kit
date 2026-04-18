---
title: docs/function/listenIdlePing
group: docs
---

# listenIdlePing

```ts
declare function listenIdlePing(fn: (event: IdlePingContract) => void): () => void;
```

Subscribes to idle ping events with queued async processing.

Emits every tick when there is no pending or scheduled signal being monitored.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle idle ping events |

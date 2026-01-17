---
title: docs/function/listenSchedulePing
group: docs
---

# listenSchedulePing

```ts
declare function listenSchedulePing(fn: (event: SchedulePingContract) => void): () => void;
```

Subscribes to ping events during scheduled signal monitoring with queued async processing.

Events are emitted every minute when a scheduled signal is being monitored (waiting for activation).
Allows tracking of scheduled signal lifecycle and custom monitoring logic.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle ping events |

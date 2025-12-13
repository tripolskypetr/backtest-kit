---
title: docs/api-reference/function/listenRisk
group: docs
---

# listenRisk

```ts
declare function listenRisk(fn: (event: RiskContract) => void): () => void;
```

Subscribes to risk rejection events with queued async processing.

Emits ONLY when a signal is rejected due to risk validation failure.
Does not emit for allowed signals (prevents spam).
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle risk rejection events |

---
title: docs/function/listenIdlePingOnce
group: docs
---

# listenIdlePingOnce

```ts
declare function listenIdlePingOnce(filterFn: (event: IdlePingContract) => boolean, fn: (event: IdlePingContract) => void): () => void;
```

Subscribes to filtered idle ping events with one-time execution.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter events |
| `fn` | Callback function to handle the matching event |

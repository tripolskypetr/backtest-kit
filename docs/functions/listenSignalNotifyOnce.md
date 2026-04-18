---
title: docs/function/listenSignalNotifyOnce
group: docs
---

# listenSignalNotifyOnce

```ts
declare function listenSignalNotifyOnce(filterFn: (event: SignalInfoContract) => boolean, fn: (event: SignalInfoContract) => void): () => void;
```

Subscribes to filtered signal info events with one-time execution.
Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

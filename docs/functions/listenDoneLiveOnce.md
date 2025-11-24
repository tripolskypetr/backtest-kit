---
title: docs/api-reference/function/listenDoneLiveOnce
group: docs
---

# listenDoneLiveOnce

```ts
declare function listenDoneLiveOnce(filterFn: (event: DoneContract) => boolean, fn: (event: DoneContract) => void): () => void;
```

Subscribes to filtered live background execution completion events with one-time execution.

Emits when Live.background() completes execution.
Executes callback once and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

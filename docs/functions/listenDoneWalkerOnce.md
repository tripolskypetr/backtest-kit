---
title: docs/api-reference/function/listenDoneWalkerOnce
group: docs
---

# listenDoneWalkerOnce

```ts
declare function listenDoneWalkerOnce(filterFn: (event: DoneContract) => boolean, fn: (event: DoneContract) => void): () => void;
```

Subscribes to filtered walker background execution completion events with one-time execution.

Emits when Walker.background() completes execution.
Executes callback once and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

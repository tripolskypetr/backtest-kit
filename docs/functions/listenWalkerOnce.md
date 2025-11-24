---
title: docs/api-reference/function/listenWalkerOnce
group: docs
---

# listenWalkerOnce

```ts
declare function listenWalkerOnce(filterFn: (event: WalkerContract) => boolean, fn: (event: WalkerContract) => void): () => void;
```

Subscribes to filtered walker progress events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific walker conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

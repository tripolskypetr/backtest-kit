---
title: docs/api-reference/function/listenRiskOnce
group: docs
---

# listenRiskOnce

```ts
declare function listenRiskOnce(filterFn: (event: RiskContract) => boolean, fn: (event: RiskContract) => void): () => void;
```

Subscribes to filtered risk rejection events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific risk rejection conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |

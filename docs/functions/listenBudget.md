---
title: docs/function/listenBudget
group: docs
---

# listenBudget

```ts
declare function listenBudget(fn: (event: BudgetContract) => void): () => void;
```

Subscribes to budget journal events with queued async processing.
Emits one event per row inserted into a budget record (reserve / release /
reject / deposit / withdraw) by `Budget`, with the record key, the budget
name and the row (balance after it included). No pending-signal gate: a
budget record is not bound to a signal.
Events are processed sequentially in order received, even if callback is async.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle budget events |

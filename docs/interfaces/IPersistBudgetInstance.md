---
title: docs/interface/IPersistBudgetInstance
group: docs
---

# IPersistBudgetInstance

Per-context budget persistence instance interface.
Scoped to a budget record key and a budget name (bucket inside the record).

Used by BudgetPersistInstance for crash-safe budget journal storage.
Custom adapters should implement this interface to override the default
file-based budget behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this budget context.

### readBudgetData

```ts
readBudgetData: () => Promise<BudgetData>
```

Read the persisted budget record for this context.

### writeBudgetData

```ts
writeBudgetData: (data: BudgetData, when: Date) => Promise<void>
```

Write the budget record for this context.

### dispose

```ts
dispose: () => void
```

Release any resources held by this instance.
Default implementations may treat this as a no-op.

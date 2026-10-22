---
title: docs/type/TBudgetAdapter
group: docs
---

# TBudgetAdapter

```ts
type TBudgetAdapter = {
    [key in Exclude<keyof IBudgetInstance, "waitForInit" | "dispose">]: any;
};
```

Public surface of BudgetBacktestAdapter / BudgetLiveAdapter — IBudgetInstance minus waitForInit and dispose.
waitForInit and dispose are managed internally by the adapter.

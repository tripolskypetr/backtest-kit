---
title: docs/type/TPersistBudgetInstanceCtor
group: docs
---

# TPersistBudgetInstanceCtor

```ts
type TPersistBudgetInstanceCtor = new (key: BudgetRecordKey, name: string) => IPersistBudgetInstance;
```

Constructor type for IPersistBudgetInstance.
Used by PersistBudgetUtils.usePersistBudgetAdapter() to register custom adapters.

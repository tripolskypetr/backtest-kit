---
title: docs/type/TBudgetAdapterDto
group: docs
---

# TBudgetAdapterDto

```ts
type TBudgetAdapterDto = BudgetRecordKey & {
    name: BudgetName;
    initialValue: IBudgetInitial;
    when: Date;
};
```

Dto of the adapter methods: the record key, the budget name, the initial value and the logical time

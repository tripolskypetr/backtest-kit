---
title: docs/type/BudgetData
group: docs
---

# BudgetData

```ts
type BudgetData = {
    id: string;
    data: object;
    when: number;
};
```

Type for persisted budget entry data.
Wraps the whole budget record (initial capital + ordered journal) with a
unique id; `when` is the logical timestamp of the last write.

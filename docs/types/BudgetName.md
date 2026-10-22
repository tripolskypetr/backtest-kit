---
title: docs/type/BudgetName
group: docs
---

# BudgetName

```ts
type BudgetName = string;
```

Logical name of a budget inside a strategy run, e.g. "fund" — the bucket of
the record, like `BucketName` for `State`. Two budgets of one run with
different names are two independent journals.

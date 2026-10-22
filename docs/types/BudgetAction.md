---
title: docs/type/BudgetAction
group: docs
---

# BudgetAction

```ts
type BudgetAction = Omit<IBudgetReserveRow, "timestamp" | "seq" | "balance" | "overdraft"> | Omit<IBudgetReleaseRow, "timestamp" | "seq" | "balance"> | Omit<IBudgetRejectRow, "timestamp" | "seq" | "balance"> | Omit<IBudgetDepositRow, "timestamp" | "seq" | "balance"> | Omit<IBudgetWithdrawRow, "timestamp" | "seq" | "balance">;
```

An action to insert into the journal: a history row minus the fields the
instance computes (`timestamp`, `seq`, `balance`). Returned by a dispatch.

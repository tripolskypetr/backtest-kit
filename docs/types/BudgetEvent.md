---
title: docs/type/BudgetEvent
group: docs
---

# BudgetEvent

```ts
type BudgetEvent = IBudgetHistoryRow & {
    strategyName: string;
    exchangeName: string;
    frameName: string;
    backtest: boolean;
    name: BudgetName;
};
```

Single budget journal row recorded by the markdown report, with the record
key it belongs to. The row is the journal entry as it was at insertion
(type, amount, ids, balance after the row); a later insert at an earlier
logical time recomputes balances in the journal, not in this event list.

---
title: docs/type/BudgetRecordKey
group: docs
---

# BudgetRecordKey

```ts
type BudgetRecordKey = {
    strategyName: string;
    exchangeName: string;
    frameName: string;
    backtest: boolean;
};
```

Record key of a budget: one record per strategy run
(strategyName, exchangeName, frameName, backtest) — shared by every symbol of
that run, never branched by signalId.

---
title: docs/type/TBudgetInstanceCtor
group: docs
---

# TBudgetInstanceCtor

```ts
type TBudgetInstanceCtor = new (initialValue: IBudgetInitial, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean, name: BudgetName) => IBudgetInstance;
```

Constructor type for budget instance implementations.
Used for swapping backends via BudgetBacktestAdapter / BudgetLiveAdapter.

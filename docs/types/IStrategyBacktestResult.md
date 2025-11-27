---
title: docs/api-reference/type/IStrategyBacktestResult
group: docs
---

# IStrategyBacktestResult

```ts
type IStrategyBacktestResult = IStrategyTickResultClosed | IStrategyTickResultCancelled;
```

Backtest returns closed result (TP/SL or time_expired) or cancelled result (scheduled signal never activated).

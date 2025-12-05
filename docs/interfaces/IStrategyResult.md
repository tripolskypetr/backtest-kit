---
title: docs/api-reference/interface/IStrategyResult
group: docs
---

# IStrategyResult

Strategy result entry for comparison table.
Contains strategy name, full statistics, and metric value for ranking.

## Properties

### strategyName

```ts
strategyName: string
```

Strategy name

### stats

```ts
stats: BacktestStatistics
```

Complete backtest statistics for this strategy

### metricValue

```ts
metricValue: number
```

Value of the optimization metric (null if invalid)

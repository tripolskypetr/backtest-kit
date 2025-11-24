---
title: docs/api-reference/interface/IWalkerStrategyResult
group: docs
---

# IWalkerStrategyResult

Result for a single strategy in the comparison.

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

Backtest statistics for this strategy

### metric

```ts
metric: number
```

Metric value used for comparison (null if invalid)

### rank

```ts
rank: number
```

Rank position (1 = best, 2 = second best, etc.)

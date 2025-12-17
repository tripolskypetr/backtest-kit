---
title: docs/api-reference/interface/WalkerContract
group: docs
---

# WalkerContract

Contract for walker progress events during strategy comparison.
Emitted each time a strategy completes testing with its current ranking.

## Properties

### walkerName

```ts
walkerName: string
```

Walker name

### exchangeName

```ts
exchangeName: string
```

Exchange name

### frameName

```ts
frameName: string
```

Frame name

### symbol

```ts
symbol: string
```

Symbol being tested

### strategyName

```ts
strategyName: string
```

Strategy that just completed

### stats

```ts
stats: BacktestStatisticsModel
```

Backtest statistics for this strategy

### metricValue

```ts
metricValue: number
```

Metric value for this strategy (null if invalid)

### metric

```ts
metric: WalkerMetric
```

Metric being optimized

### bestMetric

```ts
bestMetric: number
```

Current best metric value across all tested strategies so far

### bestStrategy

```ts
bestStrategy: string
```

Current best strategy name

### strategiesTested

```ts
strategiesTested: number
```

Number of strategies tested so far

### totalStrategies

```ts
totalStrategies: number
```

Total number of strategies to test

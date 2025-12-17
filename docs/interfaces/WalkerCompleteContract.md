---
title: docs/api-reference/interface/WalkerCompleteContract
group: docs
---

# WalkerCompleteContract

Contract for walker completion events.

Emitted when all strategies have been tested and final results are available.
Contains complete results of the walker comparison including the best strategy.

## Properties

### walkerName

```ts
walkerName: string
```

walkerName - Walker name

### symbol

```ts
symbol: string
```

symbol - Symbol tested

### exchangeName

```ts
exchangeName: string
```

exchangeName - Exchange used

### frameName

```ts
frameName: string
```

frameName - Frame used

### metric

```ts
metric: WalkerMetric
```

metric - Metric used for optimization

### totalStrategies

```ts
totalStrategies: number
```

totalStrategies - Total number of strategies tested

### bestStrategy

```ts
bestStrategy: string
```

bestStrategy - Best performing strategy name

### bestMetric

```ts
bestMetric: number
```

bestMetric - Best metric value achieved

### bestStats

```ts
bestStats: BacktestStatisticsModel
```

bestStats - Best strategy statistics

---
title: docs/api-reference/interface/IWalkerResults
group: docs
---

# IWalkerResults

Complete walker results after comparing all strategies.

## Properties

### walkerName

```ts
walkerName: string
```

Walker name

### symbol

```ts
symbol: string
```

Symbol tested

### exchangeName

```ts
exchangeName: string
```

Exchange used

### frameName

```ts
frameName: string
```

Frame used

### metric

```ts
metric: WalkerMetric
```

Metric used for optimization

### totalStrategies

```ts
totalStrategies: number
```

Total number of strategies tested

### bestStrategy

```ts
bestStrategy: string
```

Best performing strategy name

### bestMetric

```ts
bestMetric: number
```

Best metric value achieved

### bestStats

```ts
bestStats: BacktestStatistics
```

Best strategy statistics

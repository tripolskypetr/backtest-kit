---
title: docs/api-reference/interface/PerformanceStatisticsModel
group: docs
---

# PerformanceStatisticsModel

Performance statistics aggregated by strategy.

## Properties

### strategyName

```ts
strategyName: string
```

Strategy name

### totalEvents

```ts
totalEvents: number
```

Total number of performance events recorded

### totalDuration

```ts
totalDuration: number
```

Total execution time across all metrics (ms)

### metricStats

```ts
metricStats: Record<string, MetricStats>
```

Statistics grouped by metric type

### events

```ts
events: PerformanceContract[]
```

All raw performance events

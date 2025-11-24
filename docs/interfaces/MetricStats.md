---
title: docs/api-reference/interface/MetricStats
group: docs
---

# MetricStats

Aggregated statistics for a specific metric type.

## Properties

### metricType

```ts
metricType: PerformanceMetricType
```

Type of metric

### count

```ts
count: number
```

Number of recorded samples

### totalDuration

```ts
totalDuration: number
```

Total duration across all samples (ms)

### avgDuration

```ts
avgDuration: number
```

Average duration (ms)

### minDuration

```ts
minDuration: number
```

Minimum duration (ms)

### maxDuration

```ts
maxDuration: number
```

Maximum duration (ms)

### stdDev

```ts
stdDev: number
```

Standard deviation of duration (ms)

### median

```ts
median: number
```

Median duration (ms)

### p95

```ts
p95: number
```

95th percentile duration (ms)

### p99

```ts
p99: number
```

99th percentile duration (ms)

### avgWaitTime

```ts
avgWaitTime: number
```

Average wait time between events (ms)

### minWaitTime

```ts
minWaitTime: number
```

Minimum wait time between events (ms)

### maxWaitTime

```ts
maxWaitTime: number
```

Maximum wait time between events (ms)

---
title: docs/interface/PerformanceContract
group: docs
---

# PerformanceContract

Contract for performance tracking events.

Emitted during execution to track performance metrics for various operations.
Useful for profiling and identifying bottlenecks.

## Properties

### timestamp

```ts
timestamp: number
```

Timestamp when the metric was recorded (milliseconds since epoch)

### when

```ts
when: Date
```

Event time as a `Date` instance. Backtest mode: virtual execution time —
the timeframe/signal close time being processed (NOT wall-clock, unlike
`timestamp` which records real profiling time). Live mode: tick time.

### previousTimestamp

```ts
previousTimestamp: number
```

Timestamp of the previous event (milliseconds since epoch, null for first event)

### metricType

```ts
metricType: PerformanceMetricType
```

Type of operation being measured

### duration

```ts
duration: number
```

Duration of the operation in milliseconds

### strategyName

```ts
strategyName: string
```

Strategy name associated with this metric

### exchangeName

```ts
exchangeName: string
```

Exchange name associated with this metric

### frameName

```ts
frameName: string
```

Frame name associated with this metric (empty string for live mode)

### symbol

```ts
symbol: string
```

Trading symbol associated with this metric

### backtest

```ts
backtest: boolean
```

Whether this metric is from backtest mode (true) or live mode (false)

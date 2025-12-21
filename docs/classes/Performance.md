---
title: docs/class/Performance
group: docs
---

# Performance

Performance class provides static methods for performance metrics analysis.

Features:
- Get aggregated performance statistics by strategy
- Generate markdown reports with bottleneck analysis
- Save reports to disk
- Clear accumulated metrics

## Constructor

```ts
constructor();
```

## Methods

### getData

```ts
static getData(symbol: string, strategyName: string, backtest: boolean): Promise<PerformanceStatisticsModel>;
```

Gets aggregated performance statistics for a symbol-strategy pair.

Returns detailed metrics grouped by operation type:
- Count, total duration, average, min, max
- Standard deviation for volatility
- Percentiles (median, P95, P99) for outlier detection

### getReport

```ts
static getReport(symbol: string, strategyName: string, backtest: boolean, columns?: Columns$3[]): Promise<string>;
```

Generates markdown report with performance analysis.

Report includes:
- Time distribution across operation types
- Detailed metrics table with statistics
- Percentile analysis for bottleneck detection

### dump

```ts
static dump(symbol: string, strategyName: string, backtest: boolean, path?: string, columns?: Columns$3[]): Promise<void>;
```

Saves performance report to disk.

Creates directory if it doesn't exist.
Default path: ./dump/performance/{strategyName}.md

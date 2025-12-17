---
title: design/44_performance-tracking
group: design
---

# Performance Tracking

## Purpose and Scope

Performance tracking provides execution timing metrics for profiling strategy operations and identifying bottlenecks. The framework emits performance events during strategy execution, accumulates them per symbol-strategy pair, and calculates statistical metrics including average duration, percentiles, and wait times between operations.

This page covers performance event emission, event listening, statistics calculation, and report generation. For general event system architecture, see [9.1 Event Listeners](./40_reporting-monitoring.md). For other monitoring capabilities, see [9.2 Markdown Reports](./40_reporting-monitoring.md) and [9.3 Statistics Models](./40_reporting-monitoring.md).


---

## Performance Event Flow

The following diagram illustrates how performance events flow from emission through the event system to storage and report generation.

![Mermaid Diagram](./diagrams\44_performance-tracking_0.svg)


---

## PerformanceContract Structure

Performance events use the `PerformanceContract` type to capture timing information and context.

| Field | Type | Description |
|-------|------|-------------|
| `metricType` | `PerformanceMetricType` | Category of operation being measured (e.g., "tick", "getSignal", "getCandles") |
| `duration` | `number` | Execution time in milliseconds |
| `timestamp` | `number` | Unix timestamp when operation completed |
| `previousTimestamp` | `number \| null` | Timestamp of previous event of same metricType (for wait time calculation) |
| `symbol` | `string \| null` | Trading pair symbol if operation is symbol-specific |
| `strategyName` | `string \| null` | Strategy name if operation is strategy-specific |

**PerformanceMetricType** is a string union representing operation categories:
- Framework typically uses values like: `"tick"`, `"backtest"`, `"getSignal"`, `"getCandles"`, `"getAveragePrice"`
- Custom strategies can emit custom metric types


---

## Emitting Performance Events

Performance events are emitted by calling `emit()` on the `performanceEmitter` Subject. The framework automatically emits events during strategy execution, but custom code can also emit events.

```typescript
import { performanceEmitter } from "backtest-kit";

// Emit a performance event
const startTime = Date.now();
// ... perform operation ...
const duration = Date.now() - startTime;

performanceEmitter.emit({
  metricType: "custom_operation",
  duration,
  timestamp: Date.now(),
  previousTimestamp: null, // Set if tracking wait times
  symbol: "BTCUSDT",
  strategyName: "my-strategy"
});
```

The framework automatically emits events for:
- **tick operations**: Each strategy tick execution
- **backtest operations**: Fast backtest processing
- **getSignal calls**: Signal generation timing
- **getCandles calls**: Data fetching timing
- **getAveragePrice calls**: VWAP calculation timing


---

## Listening to Performance Events

The `listenPerformance()` function subscribes to performance events with queued async processing to ensure sequential execution.

```typescript
import { listenPerformance } from "backtest-kit";

// Subscribe to all performance events
const unsubscribe = listenPerformance((event) => {
  console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
  
  if (event.duration > 1000) {
    console.warn(`Slow operation detected: ${event.metricType}`);
  }
});

// Later: stop listening
unsubscribe();
```

The callback receives a `PerformanceContract` object for each event. Events are processed sequentially even if the callback is async, preventing race conditions.


---

## PerformanceMarkdownService Architecture

The following diagram shows the internal structure of `PerformanceMarkdownService` and how it manages storage.

![Mermaid Diagram](./diagrams\44_performance-tracking_1.svg)

**Key characteristics:**

1. **Memoization**: Storage instances are cached per `symbol:strategyName` key using `functools-kit` `memoize`
2. **FIFO Queue**: Events are stored in reverse chronological order (newest first) with a 10,000 event limit
3. **Automatic Trimming**: When capacity is exceeded, oldest events are removed
4. **Singleshot Init**: Service initializes once and subscribes to `performanceEmitter`


---

## Statistics Calculation

The `getData()` method calculates comprehensive statistics grouped by `metricType`. The following table describes each metric:

| Metric | Calculation | Purpose |
|--------|-------------|---------|
| `count` | Number of events of this type | Volume of operations |
| `totalDuration` | Sum of all durations | Total time spent |
| `avgDuration` | Mean of durations | Average operation time |
| `minDuration` | Minimum duration | Best case performance |
| `maxDuration` | Maximum duration | Worst case performance |
| `stdDev` | Standard deviation of durations | Consistency measure |
| `median` | 50th percentile | Typical performance |
| `p95` | 95th percentile | High-load threshold |
| `p99` | 99th percentile | Outlier threshold |
| `avgWaitTime` | Mean time between consecutive events | Operation frequency |
| `minWaitTime` | Minimum inter-event time | Peak frequency |
| `maxWaitTime` | Maximum inter-event time | Idle periods |

**Percentile Calculation:**

```typescript
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((sortedArray.length * p) / 100) - 1;
  return sortedArray[Math.max(0, index)];
}
```

**Wait Time Calculation:**

Wait times are computed using the `previousTimestamp` field:
```typescript
const waitTime = event.timestamp - event.previousTimestamp;
```

This measures the interval between consecutive events of the same `metricType`, helping identify:
- Operation frequency patterns
- Idle periods where no operations occur
- Bottlenecks causing delays between operations


---

## PerformanceStatisticsModel Structure

The `getData()` method returns a `PerformanceStatisticsModel` object:

![Mermaid Diagram](./diagrams\44_performance-tracking_2.svg)


---

## Using the Performance Class

The framework provides a `Performance` class as the public API for accessing performance data. This class internally uses `PerformanceMarkdownService`.

```typescript
import { Performance } from "backtest-kit";

// Get statistics for a symbol-strategy pair
const stats = await Performance.getData("BTCUSDT", "my-strategy");

console.log(`Total events: ${stats.totalEvents}`);
console.log(`Total time: ${stats.totalDuration.toFixed(2)}ms`);

// Analyze each metric type
for (const [metricType, metricStats] of Object.entries(stats.metricStats)) {
  console.log(`\n${metricType}:`);
  console.log(`  Count: ${metricStats.count}`);
  console.log(`  Avg: ${metricStats.avgDuration.toFixed(2)}ms`);
  console.log(`  P95: ${metricStats.p95.toFixed(2)}ms`);
  console.log(`  P99: ${metricStats.p99.toFixed(2)}ms`);
}

// Identify bottlenecks
const bottlenecks = Object.values(stats.metricStats)
  .sort((a, b) => b.totalDuration - a.totalDuration)
  .slice(0, 3);

console.log("\nTop 3 bottlenecks:");
bottlenecks.forEach((metric, i) => {
  const pct = (metric.totalDuration / stats.totalDuration) * 100;
  console.log(`${i+1}. ${metric.metricType}: ${pct.toFixed(1)}%`);
});
```


---

## Generating Performance Reports

The `getReport()` method generates a formatted markdown report with statistics tables.

```typescript
import { Performance } from "backtest-kit";

// Generate markdown report
const markdown = await Performance.getReport("BTCUSDT", "my-strategy");
console.log(markdown);

// Save report to filesystem
await Performance.dump("BTCUSDT", "my-strategy", "./custom/path");
// Saves to: ./custom/path/my-strategy.md
```

**Report Structure:**

The generated markdown includes:

1. **Header**: Strategy name and summary statistics
2. **Time Distribution**: Percentage breakdown by metric type
3. **Detailed Metrics Table**: Comprehensive statistics for each operation
4. **Notes**: Explanation of metrics (P95/P99, wait times)

**Example Report Output:**

```markdown
# Performance Report: my-strategy

**Total events:** 1,234
**Total execution time:** 45,678.92ms
**Number of metric types:** 5

## Time Distribution

- **tick**: 45.2% (20,642.13ms total)
- **getCandles**: 32.1% (14,652.84ms total)
- **getSignal**: 18.3% (8,359.21ms total)

## Detailed Metrics

| Metric | Count | Avg (ms) | Min (ms) | Max (ms) | Median (ms) | P95 (ms) | P99 (ms) | Std Dev |
|--------|-------|----------|----------|----------|-------------|----------|----------|---------|
| tick | 500 | 41.28 | 12.34 | 156.78 | 38.45 | 87.21 | 124.56 | 18.92 |
| getCandles | 150 | 97.69 | 45.12 | 234.56 | 89.23 | 178.34 | 212.45 | 42.18 |
| getSignal | 500 | 16.72 | 5.67 | 89.34 | 14.23 | 34.56 | 56.78 | 12.45 |

**Note:** All durations are in milliseconds. P95/P99 represent 95th and 99th percentile response times. Wait times show the interval between consecutive events of the same type.
```


---

## Column Configuration

Performance report tables use the `ColumnModel` interface for customizable column formatting. Default columns are defined in `COLUMN_CONFIG.performance_columns`.

```typescript
import { COLUMN_CONFIG } from "backtest-kit";

// Use custom columns
const customColumns = [
  {
    key: "metric",
    label: "Operation",
    format: (stats: MetricStats) => stats.metricType,
    isVisible: () => true
  },
  {
    key: "count",
    label: "Count",
    format: (stats: MetricStats) => stats.count.toString(),
    isVisible: () => true
  },
  {
    key: "avgDuration",
    label: "Avg (ms)",
    format: (stats: MetricStats) => stats.avgDuration.toFixed(2),
    isVisible: () => true
  }
];

const report = await Performance.getReport(
  "BTCUSDT",
  "my-strategy",
  customColumns
);
```


---

## Clearing Performance Data

The `clear()` method removes accumulated performance data from memoized storage.

```typescript
import { Performance } from "backtest-kit";

// Clear specific symbol-strategy pair
await Performance.clear({
  symbol: "BTCUSDT",
  strategyName: "my-strategy"
});

// Clear all performance data
await Performance.clear();
```

Clearing is useful when:
- Starting a new backtest run with fresh metrics
- Managing memory in long-running processes
- Resetting data after configuration changes


---

## Integration with Strategy Execution

Performance tracking integrates seamlessly with the strategy execution pipeline. The framework automatically emits events at key execution points.

![Mermaid Diagram](./diagrams\44_performance-tracking_3.svg)

**Typical metricType values emitted during execution:**

| metricType | Emitted By | Measures |
|------------|-----------|----------|
| `tick` | `ClientStrategy.tick()` | Complete tick cycle duration |
| `backtest` | `ClientStrategy.backtest()` | Fast backtest processing time |
| `getSignal` | Strategy execution | User's `getSignal()` function time |
| `getCandles` | `ClientExchange.getCandles()` | Candle data fetching time |
| `getAveragePrice` | `ClientExchange.getAveragePrice()` | VWAP calculation time |

Custom strategies can emit additional metric types by calling `performanceEmitter.emit()` directly.


---

## Safe Math and Error Handling

Performance statistics use safe math checks to handle edge cases:

```typescript
function isUnsafe(value: number): boolean {
  if (typeof value !== "number") return true;
  if (isNaN(value)) return true;
  if (!isFinite(value)) return true;
  return false;
}
```

When calculations produce `NaN` or `Infinity` values:
- The unsafe values are preserved (not converted to null)
- Report formatting handles these gracefully
- Percentile calculations return 0 for empty arrays

This ensures that performance reports remain stable even with:
- Zero-duration operations
- Empty event lists
- Division by zero scenarios


---

## Storage Limits and Memory Management

`PerformanceStorage` implements a fixed-size FIFO queue with a 10,000 event limit per symbol-strategy pair.

```typescript
const MAX_EVENTS = 10000;

public addEvent(event: PerformanceContract) {
  this._events.unshift(event);  // Add to front
  
  if (this._events.length > MAX_EVENTS) {
    this._events.pop();  // Remove oldest
  }
}
```

**Memory characteristics:**

- **Per-pair isolation**: Each `symbol:strategyName` combination has independent storage
- **Automatic trimming**: Oldest events are discarded when capacity is reached
- **Most recent first**: Events are stored newest-first for efficient access
- **Memoization**: Storage instances are cached and reused

For long-running live trading or extensive backtests, the 10,000 event limit prevents unbounded memory growth while retaining sufficient recent history for analysis.


---

## Example: Bottleneck Detection Workflow

The following example demonstrates a complete workflow for detecting and analyzing performance bottlenecks:

```typescript
import { 
  Backtest, 
  Performance, 
  listenPerformance 
} from "backtest-kit";

// 1. Monitor real-time performance
listenPerformance((event) => {
  if (event.duration > 100) {
    console.warn(`Slow operation: ${event.metricType} took ${event.duration}ms`);
  }
});

// 2. Run backtest
const results = await Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// 3. Analyze performance statistics
const stats = await Performance.getData("BTCUSDT", "my-strategy");

// 4. Identify bottlenecks
const sortedMetrics = Object.values(stats.metricStats)
  .sort((a, b) => b.totalDuration - a.totalDuration);

console.log("\nPerformance Analysis:");
console.log(`Total execution time: ${stats.totalDuration.toFixed(2)}ms`);
console.log(`Total operations: ${stats.totalEvents}`);

console.log("\nBottlenecks (by total time):");
sortedMetrics.forEach((metric, index) => {
  const percentage = (metric.totalDuration / stats.totalDuration) * 100;
  console.log(
    `${index + 1}. ${metric.metricType}: ${percentage.toFixed(1)}% ` +
    `(${metric.count} calls, ${metric.avgDuration.toFixed(2)}ms avg)`
  );
});

// 5. Check outliers (P99)
console.log("\nP99 Response Times:");
sortedMetrics.forEach((metric) => {
  if (metric.p99 > 200) {
    console.warn(
      `${metric.metricType}: P99=${metric.p99.toFixed(2)}ms (high outlier)`
    );
  }
});

// 6. Generate report
await Performance.dump("BTCUSDT", "my-strategy");
console.log("\nReport saved to: ./dump/performance/my-strategy.md");
```


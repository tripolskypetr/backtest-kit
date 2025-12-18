---
title: design/40_reporting-monitoring
group: design
---

# Reporting & Monitoring

## Purpose and Scope

This page documents the reporting and monitoring capabilities of Backtest Kit. The system provides real-time event streaming, statistical analysis, and markdown report generation for all execution modes (Backtest, Live, Walker). 

**Core capabilities covered:**
- Event-driven architecture with 13+ specialized emitters
- 8 markdown report services with automatic data aggregation
- Statistics calculation (Sharpe ratio, win rate, PNL, performance metrics)
- Public API for programmatic access to reports and data
- Column configuration for customizable report formatting
- File system persistence with organized directory structure

**Related pages:**
- For strategy lifecycle callbacks, see [Strategy Development](./25_strategy-development.md)
- For execution modes that generate events, see [Execution Modes](./20_execution-modes.md)
- For risk validation that triggers risk events, see [Risk Management](./31_risk-management.md)

---

## Event-Driven Architecture

The framework implements a comprehensive event system using `functools-kit` `Subject` pattern. All execution activities emit events that can be subscribed to via listener functions or consumed internally by markdown services.

### Event Emitters

![Mermaid Diagram](./diagrams\40_reporting-monitoring_0.svg)

**Event Emitter Catalog**

| Emitter | Type | Payload | Emission Trigger |
|---------|------|---------|------------------|
| `signalEmitter` | `Subject<IStrategyTickResult>` | All tick results | Every strategy tick (all modes) |
| `signalBacktestEmitter` | `Subject<IStrategyTickResult>` | Backtest-only results | Strategy tick in backtest mode |
| `signalLiveEmitter` | `Subject<IStrategyTickResult>` | Live-only results | Strategy tick in live mode |
| `progressBacktestEmitter` | `Subject<ProgressBacktestContract>` | Frame progress | Each timeframe processed |
| `progressWalkerEmitter` | `Subject<ProgressWalkerContract>` | Strategy progress | Walker iteration progress |
| `progressOptimizerEmitter` | `Subject<ProgressOptimizerContract>` | Optimization progress | Optimizer generation steps |
| `doneBacktestSubject` | `Subject<DoneContract>` | Completion context | Backtest completes |
| `doneLiveSubject` | `Subject<DoneContract>` | Completion context | Live trading stops |
| `doneWalkerSubject` | `Subject<DoneContract>` | Completion context | Walker completes |
| `performanceEmitter` | `Subject<PerformanceContract>` | Timing metrics | Operation completes |
| `partialProfitSubject` | `Subject<PartialProfitContract>` | Profit milestone | 10%/20%/30%... profit reached |
| `partialLossSubject` | `Subject<PartialLossContract>` | Loss milestone | -10%/-20%/-30%... loss reached |
| `riskSubject` | `Subject<RiskContract>` | Rejection details | Risk validation fails |
| `walkerEmitter` | `Subject<WalkerContract>` | Strategy result | Strategy backtest completes |
| `walkerCompleteSubject` | `Subject<WalkerCompleteContract>` | Final results | All strategies tested |
| `walkerStopSubject` | `Subject<WalkerStopContract>` | Stop event | Walker cancelled |
| `errorEmitter` | `Subject<Error>` | Error object | Recoverable error occurs |
| `exitEmitter` | `Subject<Error>` | Error object | Fatal error occurs |
| `validationSubject` | `Subject<Error>` | Error object | Validation throws |


### Event Listeners

Public API provides typed listener functions with `queued` wrapper from `functools-kit`. The wrapper ensures sequential async processing even during high-frequency emissions.

![Mermaid Diagram](./diagrams\40_reporting-monitoring_1.svg)

**Listener Pattern Example:**

```typescript
import { listenSignal, listenPerformance } from "backtest-kit";

// Subscribe to all signal events
const unsubSignal = listenSignal(async (result) => {
  if (result.action === "closed") {
    console.log(`PNL: ${result.pnl.pnlPercentage}%`);
    await saveToDatabase(result); // Async operations are queued
  }
});

// Subscribe to performance metrics
const unsubPerf = listenPerformance((event) => {
  if (event.duration > 1000) {
    console.warn(`Slow operation: ${event.metricType} took ${event.duration}ms`);
  }
});

// Cleanup
unsubSignal();
unsubPerf();
```


---

## Markdown Report Services

Eight specialized markdown services subscribe to event emitters and accumulate data in memory. Each service provides `getData()`, `getReport()`, and `dump()` methods following a consistent Controller-View pattern.

### Service Architecture

![Mermaid Diagram](./diagrams\40_reporting-monitoring_2.svg)


### Service Responsibilities

#### BacktestMarkdownService

**Purpose:** Accumulates closed signals from backtest execution and generates performance reports.

**Event Source:** `signalBacktestEmitter`

**Storage Key:** `${symbol}:${strategyName}`

**Data Model:** `BacktestStatisticsModel`

**Key Features:**
- Only processes signals with `action === "closed"` or `action === "cancelled"`
- Calculates Sharpe Ratio, win rate, total PNL, certainty ratio
- Safe math: all metrics return `null` if unsafe (NaN, Infinity)
- Expected yearly returns based on average trade duration
- Max 250 signals per symbol-strategy pair


#### LiveMarkdownService

**Purpose:** Tracks all tick events (idle, opened, active, closed) during live trading.

**Event Source:** `signalLiveEmitter`

**Storage Key:** `${symbol}:${strategyName}`

**Data Model:** `LiveStatisticsModel`

**Key Features:**
- Processes all tick actions: `idle`, `opened`, `active`, `closed`
- Replaces last idle event if no opened/active events follow (deduplication)
- Replaces last active event with same `signalId` (update pattern)
- Calculates live trading statistics including real-time PNL tracking
- Max 250 events per symbol-strategy pair


#### WalkerMarkdownService

**Purpose:** Aggregates strategy comparison results and ranks strategies by optimization metric.

**Event Source:** `walkerEmitter`

**Storage Key:** `${walkerName}`

**Data Model:** `WalkerStatisticsModel`

**Key Features:**
- Accumulates results from each strategy backtest
- Tracks best strategy and best metric value
- Generates comparison table sorted by metric
- Generates consolidated PNL table across all strategies
- No event limit (unlimited strategies)


#### ScheduleMarkdownService

**Purpose:** Monitors scheduled signals and tracks activation vs cancellation rates.

**Event Source:** `signalEmitter`

**Storage Key:** `${symbol}:${strategyName}`

**Data Model:** `ScheduleStatisticsModel`

**Key Features:**
- Processes `scheduled`, `opened`, `cancelled` actions
- Only tracks opened signals if `scheduledAt !== pendingAt` (was actually scheduled)
- Calculates cancellation rate and activation rate
- Measures average wait time before activation or cancellation
- Max 250 events per symbol-strategy pair


#### HeatMarkdownService

**Purpose:** Generates portfolio-wide heatmap showing per-symbol performance aggregated across all strategies.

**Event Source:** `signalEmitter`

**Storage Key:** `${strategyName}` (single storage per strategy)

**Data Model:** `HeatmapStatisticsModel`

**Key Features:**
- Aggregates closed signals by symbol
- Calculates per-symbol: Total PNL, Sharpe Ratio, Max Drawdown, Profit Factor
- Calculates portfolio-wide: Total PNL, weighted Sharpe Ratio
- Advanced metrics: Win/Loss streaks, Expectancy, Average Win/Loss
- Max 250 signals per symbol (within strategy)


#### PerformanceMarkdownService

**Purpose:** Profiles execution performance by collecting timing metrics for bottleneck analysis.

**Event Source:** `performanceEmitter`

**Storage Key:** `${symbol}:${strategyName}`

**Data Model:** `PerformanceStatisticsModel`

**Key Features:**
- Groups events by `metricType` (operation category)
- Calculates avg/min/max duration per metric
- Calculates percentiles (P50, P95, P99) for outlier detection
- Tracks wait times between consecutive events of same type
- Max 10000 events per symbol-strategy pair (higher limit for profiling)


#### PartialMarkdownService

**Purpose:** Tracks partial profit/loss milestones (10%, 20%, 30%...) for unrealized PNL monitoring.

**Event Source:** `partialProfitSubject`, `partialLossSubject`

**Storage Key:** `${symbol}:${strategyName}`

**Data Model:** `PartialStatisticsModel`

**Key Features:**
- Processes profit and loss milestone events
- Tracks which levels (10-100%) have been reached per signal
- Enables real-time unrealized PNL alerts
- Max 250 events per symbol-strategy pair


#### RiskMarkdownService

**Purpose:** Records risk validation failures to analyze rejection patterns.

**Event Source:** `riskSubject`

**Storage Key:** `${symbol}:${strategyName}`

**Data Model:** `RiskStatisticsModel`

**Key Features:**
- Captures all signal rejections due to risk limits
- Aggregates rejections by symbol and by strategy
- Includes rejection reason from validation comment
- Max 250 events per symbol-strategy pair


---

## Statistics Models

Each markdown service produces a statistics model containing aggregated metrics and raw event data. All numeric fields use safe math: `null` is returned for NaN, Infinity, or unsafe values.

### Common Metrics Across Models

![Mermaid Diagram](./diagrams\40_reporting-monitoring_3.svg)

### BacktestStatisticsModel

```typescript
interface BacktestStatisticsModel {
  signalList: IStrategyTickResultClosed[];      // All closed signals
  totalSignals: number;                         // Count of closed signals
  winCount: number;                             // Signals with PNL > 0
  lossCount: number;                            // Signals with PNL < 0
  winRate: number | null;                       // (winCount / totalSignals) * 100
  avgPnl: number | null;                        // Average PNL percentage
  totalPnl: number | null;                      // Sum of all PNL percentages
  stdDev: number | null;                        // Standard deviation of returns
  sharpeRatio: number | null;                   // avgPnl / stdDev
  annualizedSharpeRatio: number | null;         // sharpeRatio * sqrt(365)
  certaintyRatio: number | null;                // avgWin / abs(avgLoss)
  expectedYearlyReturns: number | null;         // avgPnl * (365 / avgDurationDays)
}
```

**Calculation Details:**

**Sharpe Ratio:** Risk-adjusted return assuming zero risk-free rate. Formula: `avgPnl / stdDev`. Higher is better.

**Annualized Sharpe Ratio:** Scales Sharpe Ratio to yearly timeframe. Formula: `sharpeRatio * Math.sqrt(365)`. Industry-standard metric.

**Certainty Ratio:** Measures average win size relative to average loss size. Formula: `avgWin / Math.abs(avgLoss)`. Values > 1.0 indicate wins larger than losses.

**Expected Yearly Returns:** Projects annual returns based on average trade duration. Formula: `avgPnl * (365 / avgDurationDays)`. Assumes consistent trading frequency.


### LiveStatisticsModel

```typescript
interface LiveStatisticsModel {
  eventList: TickEvent[];                       // All tick events (idle, opened, active, closed)
  totalEvents: number;                          // Total event count
  totalClosed: number;                          // Count of closed signals
  winCount: number;                             // Closed with PNL > 0
  lossCount: number;                            // Closed with PNL < 0
  winRate: number | null;                       // (winCount / totalClosed) * 100
  avgPnl: number | null;                        // Average PNL of closed signals
  totalPnl: number | null;                      // Sum of PNL from closed signals
  stdDev: number | null;                        // Standard deviation
  sharpeRatio: number | null;                   // avgPnl / stdDev
  annualizedSharpeRatio: number | null;         // sharpeRatio * sqrt(365)
  certaintyRatio: number | null;                // avgWin / abs(avgLoss)
  expectedYearlyReturns: number | null;         // Projected annual returns
}
```

**Differences from Backtest:**
- Includes `totalEvents` (all tick types) vs `totalSignals` (closed only)
- `eventList` contains all actions: `idle`, `opened`, `active`, `closed`
- Statistics calculated only from closed events for consistency


### WalkerStatisticsModel

```typescript
interface WalkerStatisticsModel {
  walkerName: WalkerName;                       // Walker identifier
  symbol: string;                               // Trading pair
  exchangeName: string;                         // Exchange used
  frameName: string;                            // Timeframe used
  metric: WalkerMetric;                         // Optimization metric
  totalStrategies: number;                      // Number of strategies tested
  bestStrategy: StrategyName | null;            // Strategy with highest metric
  bestMetric: number | null;                    // Highest metric value
  bestStats: BacktestStatisticsModel | null;    // Full stats for best strategy
  strategyResults: IStrategyResult[];           // Results for all strategies
}
```

**IStrategyResult:**
```typescript
interface IStrategyResult {
  strategyName: StrategyName;                   // Strategy identifier
  stats: BacktestStatisticsModel;               // Full backtest statistics
  metricValue: number | null;                   // Value of optimization metric
}
```


### HeatmapStatisticsModel

```typescript
interface HeatmapStatisticsModel {
  symbols: IHeatmapRow[];                       // Per-symbol statistics
  totalSymbols: number;                         // Count of symbols
  portfolioTotalPnl: number | null;             // Sum of all symbol PNL
  portfolioSharpeRatio: number | null;          // Weighted Sharpe Ratio
  portfolioTotalTrades: number;                 // Total trades across all symbols
}

interface IHeatmapRow {
  symbol: string;                               // Trading pair
  totalPnl: number | null;                      // Total PNL for this symbol
  sharpeRatio: number | null;                   // Sharpe Ratio for this symbol
  maxDrawdown: number | null;                   // Maximum drawdown
  totalTrades: number;                          // Trade count
  winCount: number;                             // Winning trades
  lossCount: number;                            // Losing trades
  winRate: number | null;                       // Win percentage
  avgPnl: number | null;                        // Average PNL
  stdDev: number | null;                        // Standard deviation
  profitFactor: number | null;                  // sumWins / sumLosses
  avgWin: number | null;                        // Average winning trade
  avgLoss: number | null;                       // Average losing trade
  maxWinStreak: number;                         // Longest winning streak
  maxLossStreak: number;                        // Longest losing streak
  expectancy: number | null;                    // Expected value per trade
}
```

**Advanced Metrics:**

**Max Drawdown:** Largest peak-to-trough decline. Calculated by tracking cumulative PNL and measuring largest drop from peak.

**Profit Factor:** Ratio of gross profit to gross loss. Formula: `sumWins / sumLosses`. Values > 1.0 indicate profitability.

**Expectancy:** Expected value per trade. Formula: `(winRate * avgWin) + (lossRate * avgLoss)`. Positive values indicate edge.


### PerformanceStatisticsModel

```typescript
interface PerformanceStatisticsModel {
  strategyName: string;                         // Strategy identifier
  totalEvents: number;                          // Total performance events
  totalDuration: number;                        // Sum of all durations (ms)
  metricStats: Record<string, MetricStats>;     // Stats grouped by metricType
  events: PerformanceContract[];                // Raw performance events
}

interface MetricStats {
  metricType: PerformanceMetricType;            // Operation category
  count: number;                                // Event count
  totalDuration: number;                        // Sum of durations (ms)
  avgDuration: number;                          // Average duration (ms)
  minDuration: number;                          // Fastest execution (ms)
  maxDuration: number;                          // Slowest execution (ms)
  stdDev: number;                               // Duration volatility
  median: number;                               // 50th percentile (ms)
  p95: number;                                  // 95th percentile (ms)
  p99: number;                                  // 99th percentile (ms)
  avgWaitTime: number;                          // Time between events (ms)
  minWaitTime: number;                          // Shortest gap (ms)
  maxWaitTime: number;                          // Longest gap (ms)
}
```

**Percentile Metrics:**
- **Median (P50):** Half of operations complete faster, half slower
- **P95:** 95% of operations complete within this time
- **P99:** 99% of operations complete within this time

Used for identifying outliers and tail latency problems.


---

## Public API for Reports

The framework provides two access patterns: instance methods on execution classes (Backtest, Live, Walker) and static utility classes (Performance, Heat, Schedule, Partial, Risk).

### Execution Class Methods

![Mermaid Diagram](./diagrams\40_reporting-monitoring_4.svg)

**Example Usage:**

```typescript
import { Backtest } from "backtest-kit";

// Run backtest (execution generates events)
for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
})) {
  // Events are accumulated by BacktestMarkdownService
}

// Access statistics programmatically
const stats = await Backtest.getData("BTCUSDT", "my-strategy");
console.log(`Sharpe Ratio: ${stats.sharpeRatio}`);
console.log(`Win Rate: ${stats.winRate}%`);

// Generate markdown report
const markdown = await Backtest.getReport("BTCUSDT", "my-strategy");
console.log(markdown);

// Save to file system
await Backtest.dump("BTCUSDT", "my-strategy"); // ./dump/backtest/my-strategy.md
await Backtest.dump("BTCUSDT", "my-strategy", "./custom/path"); // Custom directory
```


### Utility Classes

![Mermaid Diagram](./diagrams\40_reporting-monitoring_5.svg)

**Example Usage:**

```typescript
import { Performance, Heat, Schedule } from "backtest-kit";

// Performance profiling
const perfStats = await Performance.getData("BTCUSDT", "my-strategy");
console.log(`Total execution time: ${perfStats.totalDuration}ms`);
for (const [metricType, metric] of Object.entries(perfStats.metricStats)) {
  if (metric.p99 > 1000) {
    console.warn(`Slow operation: ${metricType} P99=${metric.p99}ms`);
  }
}

// Portfolio heatmap (aggregated across all symbols)
const heatStats = await Heat.getData("my-strategy");
console.log(`Portfolio PNL: ${heatStats.portfolioTotalPnl}%`);
heatStats.symbols.forEach(row => {
  console.log(`${row.symbol}: Sharpe=${row.sharpeRatio}, Trades=${row.totalTrades}`);
});

// Scheduled signals report
const schedStats = await Schedule.getData("BTCUSDT", "my-strategy");
console.log(`Activation rate: ${schedStats.activationRate}%`);
console.log(`Average wait time: ${schedStats.avgActivationTime} minutes`);

// Dump all reports
await Performance.dump("BTCUSDT", "my-strategy", "./reports/performance");
await Heat.dump("my-strategy", "./reports/heatmap");
await Schedule.dump("BTCUSDT", "my-strategy", "./reports/schedule");
```


---

## Column Configuration

Markdown reports use the `ColumnModel<T>` interface for customizable table formatting. Each markdown service has default columns defined in `COLUMN_CONFIG`, which can be overridden via method parameters.

### ColumnModel Interface

```typescript
interface ColumnModel<T extends object = any> {
  key: string;                                  // Unique column identifier
  label: string;                                // Display header text
  format: (data: T, index: number) => string | Promise<string>;
  isVisible: () => boolean | Promise<boolean>;  // Dynamic visibility control
}
```


### Column Configuration System

![Mermaid Diagram](./diagrams\40_reporting-monitoring_6.svg)

### Custom Column Example

```typescript
import { Backtest } from "backtest-kit";
import { ColumnModel } from "backtest-kit";
import { IStrategyTickResultClosed } from "backtest-kit";

// Define custom columns for backtest report
const customColumns: ColumnModel<IStrategyTickResultClosed>[] = [
  {
    key: "timestamp",
    label: "Close Time",
    format: (signal) => new Date(signal.closeTimestamp).toISOString(),
    isVisible: () => true
  },
  {
    key: "pnl",
    label: "PNL %",
    format: (signal) => {
      const pnl = signal.pnl.pnlPercentage;
      const sign = pnl > 0 ? "+" : "";
      return `${sign}${pnl.toFixed(2)}%`;
    },
    isVisible: () => true
  },
  {
    key: "reason",
    label: "Close Reason",
    format: (signal) => signal.closeReason,
    isVisible: () => true
  },
  {
    key: "duration",
    label: "Duration (min)",
    format: (signal) => {
      const durationMs = signal.closeTimestamp - signal.signal.pendingAt;
      return Math.round(durationMs / 60000).toString();
    },
    isVisible: () => true
  },
  {
    key: "note",
    label: "Signal Note",
    format: (signal) => signal.signal.note || "N/A",
    isVisible: async () => {
      // Dynamic visibility: show only if any signal has a note
      return true; // Could check database, environment variable, etc.
    }
  }
];

// Generate report with custom columns
const markdown = await Backtest.getReport("BTCUSDT", "my-strategy", customColumns);

// Save report with custom columns
await Backtest.dump("BTCUSDT", "my-strategy", "./reports", customColumns);
```

### Global Column Configuration

Default columns can be customized globally via `setColumns()`:

```typescript
import { setColumns, getColumns, getDefaultColumns } from "backtest-kit";
import { ColumnConfig } from "backtest-kit";

// Get current configuration
const currentConfig = getColumns();

// Get framework defaults
const defaultConfig = getDefaultColumns();

// Set custom configuration
const customConfig: Partial<ColumnConfig> = {
  backtest_columns: [
    // Custom backtest columns
  ],
  live_columns: [
    // Custom live columns
  ]
};

setColumns(customConfig);

// Reset to defaults
setColumns(getDefaultColumns());
```


---

## Report Storage and Persistence

### In-Memory Storage

Each markdown service uses a memoized `ReportStorage` instance per unique key. Storage is bounded by `MAX_EVENTS` constant (typically 250, except `PerformanceMarkdownService` which uses 10000).

![Mermaid Diagram](./diagrams\40_reporting-monitoring_7.svg)

**Storage Key Patterns:**

| Service | Key Pattern | Max Events |
|---------|-------------|------------|
| BacktestMarkdownService | `${symbol}:${strategyName}` | 250 |
| LiveMarkdownService | `${symbol}:${strategyName}` | 250 |
| WalkerMarkdownService | `${walkerName}` | Unlimited |
| ScheduleMarkdownService | `${symbol}:${strategyName}` | 250 |
| HeatMarkdownService | `${strategyName}` (single storage) | 250 per symbol |
| PerformanceMarkdownService | `${symbol}:${strategyName}` | 10000 |
| PartialMarkdownService | `${symbol}:${strategyName}` | 250 |
| RiskMarkdownService | `${symbol}:${strategyName}` | 250 |


### File System Persistence

The `dump()` method on each service writes markdown reports to organized directories:

**Default Paths:**

| Report Type | Default Path | Filename Pattern |
|-------------|--------------|------------------|
| Backtest | `./dump/backtest/` | `${strategyName}.md` |
| Live | `./dump/live/` | `${strategyName}.md` |
| Walker | `./dump/walker/` | `${walkerName}.md` |
| Schedule | `./dump/schedule/` | `${strategyName}.md` |
| Heat | `./dump/heat/` | `${strategyName}.md` |
| Performance | `./dump/performance/` | `${strategyName}.md` |
| Partial | `./dump/partial/` | `${symbol}_${strategyName}.md` |
| Risk | `./dump/risk/` | `${symbol}_${strategyName}.md` |

**Dump Implementation Pattern:**

```typescript
public async dump(
  symbol: string,
  strategyName: StrategyName,
  path = "./dump/backtest",
  columns: Columns[] = COLUMN_CONFIG.backtest_columns
): Promise<void> {
  const markdown = await this.getReport(strategyName, columns);
  
  try {
    const dir = join(process.cwd(), path);
    await mkdir(dir, { recursive: true });  // Create directory if not exists
    
    const filename = `${strategyName}.md`;
    const filepath = join(dir, filename);
    
    await writeFile(filepath, markdown, "utf-8");
    console.log(`Backtest report saved: ${filepath}`);
  } catch (error) {
    console.error(`Failed to save markdown report:`, error);
  }
}
```


### Clearing Accumulated Data

Services provide `clear()` methods to remove accumulated data from memory:

```typescript
// Clear specific symbol-strategy pair
await backtest.backtestMarkdownService.clear({
  symbol: "BTCUSDT",
  strategyName: "my-strategy"
});

// Clear all data for a service
await backtest.backtestMarkdownService.clear();

// Clear walker data
await backtest.walkerMarkdownService.clear("my-walker");

// Clear all walkers
await backtest.walkerMarkdownService.clear();
```

Clearing is automatically invoked at the start of `Backtest.run()`, `Live.run()`, and `Walker.run()` to ensure fresh data accumulation.


---

## Report Format Examples

### Backtest Report Structure

```markdown
# Backtest Report: my-strategy

| # | Signal ID | Symbol | Position | Open | TP | SL | Close | PNL % | Reason | Duration |
|---|-----------|--------|----------|------|----|----|-------|-------|--------|----------|
| 1 | abc-123   | BTCUSDT | LONG    | 50000 | 51000 | 49500 | 51000 | +1.80% | take_profit | 45 min |
| 2 | abc-124   | BTCUSDT | SHORT   | 51000 | 50500 | 51500 | 50500 | +0.78% | take_profit | 30 min |

**Total signals:** 2
**Closed signals:** 2
**Win rate:** 100.00% (2W / 0L) (higher is better)
**Average PNL:** +1.29% (higher is better)
**Total PNL:** +2.58% (higher is better)
**Standard Deviation:** 0.510% (lower is better)
**Sharpe Ratio:** 2.529 (higher is better)
**Annualized Sharpe Ratio:** 48.320 (higher is better)
**Certainty Ratio:** N/A (higher is better)
**Expected Yearly Returns:** +12501.60% (higher is better)
```

### Live Report Structure

```markdown
# Live Trading Report: my-strategy

| Timestamp | Action | Signal ID | Position | Price | TP | SL | PNL % | TP Progress | SL Risk |
|-----------|--------|-----------|----------|-------|----|----|-------|-------------|---------|
| 2024-01-15T10:30:00Z | opened | xyz-789 | LONG | 50000 | 51000 | 49500 | - | - | - |
| 2024-01-15T10:45:00Z | active | xyz-789 | LONG | 50500 | 51000 | 49500 | - | 50% | 0% |
| 2024-01-15T11:00:00Z | active | xyz-789 | LONG | 50800 | 51000 | 49500 | - | 80% | 0% |
| 2024-01-15T11:15:00Z | closed | xyz-789 | LONG | 51000 | 51000 | 49500 | +1.80% | 100% | 0% |
| 2024-01-15T11:30:00Z | idle | - | - | 51000 | - | - | - | - | - |

**Total events:** 5
**Closed signals:** 1
**Win rate:** 100.00% (1W / 0L) (higher is better)
**Average PNL:** +1.80% (higher is better)
**Total PNL:** +1.80% (higher is better)
...
```

### Walker Report Structure

```markdown
# Walker Comparison Report: my-walker

**Symbol:** BTCUSDT
**Exchange:** binance
**Frame:** 1d-backtest
**Optimization Metric:** sharpeRatio
**Strategies Tested:** 5

## Best Strategy: strategy-a

**Best sharpeRatio:** 2.53
**Total Signals:** 100

## Top Strategies Comparison

| Rank | Strategy | Sharpe Ratio | Win Rate | Total PNL | Trades |
|------|----------|--------------|----------|-----------|--------|
| 1 | strategy-a | 2.53 | 65.0% | +125.5% | 100 |
| 2 | strategy-b | 2.01 | 60.0% | +98.2% | 120 |
| 3 | strategy-c | 1.85 | 58.5% | +87.3% | 95 |

## All Signals (PNL Table)

| Strategy | Signal ID | Symbol | Position | PNL % | Reason | Open Time | Close Time |
|----------|-----------|--------|----------|-------|--------|-----------|------------|
| strategy-a | abc-123 | BTCUSDT | LONG | +1.80% | take_profit | ... | ... |
...
```

### Performance Report Structure

```markdown
# Performance Report: my-strategy

**Total events:** 1000
**Total execution time:** 5432.12ms
**Number of metric types:** 5

## Time Distribution

- **getCandles**: 45.2% (2455.32ms total)
- **tick**: 30.1% (1635.05ms total)
- **getSignal**: 15.6% (847.41ms total)
- **checkRisk**: 5.8% (315.12ms total)
- **getAveragePrice**: 3.3% (179.22ms total)

## Detailed Metrics

| Metric Type | Count | Avg (ms) | Min (ms) | Max (ms) | P95 (ms) | P99 (ms) | Std Dev |
|-------------|-------|----------|----------|----------|----------|----------|---------|
| getCandles | 100 | 24.55 | 10.23 | 150.45 | 45.32 | 98.12 | 18.45 |
| tick | 1000 | 1.64 | 0.12 | 25.34 | 3.21 | 8.45 | 2.12 |
...
```


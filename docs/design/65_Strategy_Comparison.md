---
title: design/65_strategy_comparison
group: design
---

# Strategy Comparison

This page details the technical implementation of strategy comparison in Walker mode, including metric extraction, sequential backtest orchestration, and best strategy selection. For Walker API reference, see page 4.5. For individual backtest mechanics, see page 9.1.

---

## Metric Selection and Extraction

Walker compares strategies using a single `WalkerMetric` specified in `IWalkerSchema.metric`. The metric value is extracted from `BacktestStatistics` after each strategy completes its backtest.

### WalkerMetric Type Definition

The `WalkerMetric` type defines seven comparison criteria:

```typescript
type WalkerMetric =
  | "sharpeRatio"
  | "annualizedSharpeRatio"
  | "winRate"
  | "avgPnl"
  | "totalPnl"
  | "certaintyRatio"
  | "expectedYearlyReturns";
```

### Metric Extraction Logic

Metric extraction occurs in `WalkerLogicPrivateService.run()` after calling `BacktestMarkdownService.getData()`:

```typescript
const stats = await this.backtestMarkdownService.getData(symbol, strategyName);

// Extract metric value with null safety
const value = stats[metric];
const metricValue =
  value !== null &&
  value !== undefined &&
  typeof value === "number" &&
  !isNaN(value) &&
  isFinite(value)
    ? value
    : null;
```

The extraction performs five safety checks to prevent invalid comparisons. If any check fails, `metricValue` is set to `null` and the strategy is excluded from best strategy consideration.

### Metric Calculation Reference

| Metric | BacktestStatistics Field | Calculation Method | Higher is Better |
|--------|--------------------------|-------------------|------------------|
| `sharpeRatio` | `stats.sharpeRatio` | `avgPnl / stdDev` | Yes |
| `annualizedSharpeRatio` | `stats.annualizedSharpeRatio` | `sharpeRatio × √365` | Yes |
| `winRate` | `stats.winRate` | `(winCount / totalSignals) × 100` | Yes |
| `avgPnl` | `stats.avgPnl` | `sum(pnlPercentage) / totalSignals` | Yes |
| `totalPnl` | `stats.totalPnl` | `sum(pnlPercentage)` | Yes |
| `certaintyRatio` | `stats.certaintyRatio` | `avgWin / abs(avgLoss)` | Yes |
| `expectedYearlyReturns` | `stats.expectedYearlyReturns` | Based on avg trade duration and PNL | Yes |

All metrics assume higher values indicate better performance. No metrics use ascending comparison order.


---

## Sequential Backtest Orchestration

`WalkerLogicPrivateService.run()` executes strategies sequentially using `BacktestLogicPublicService.run()` for each strategy. The method yields `WalkerContract` after each strategy completes.

### WalkerLogicPrivateService.run() Flow

![Mermaid Diagram](./diagrams/65_Strategy_Comparison_0.svg)

### Key Implementation Details

**Sequential Execution:**
Strategies are not parallelized. Each strategy's backtest completes before the next begins. This occurs at [src/lib/services/logic/private/WalkerLogicPrivateService.ts:106-228]().

**resolveDocuments() Pattern:**
The `resolveDocuments(iterator)` utility consumes the async generator returned by `BacktestLogicPublicService.run()` and returns an array of all yielded results. This pattern allows walker to consume all backtest signals without manually iterating.

**Error Handling:**
If `resolveDocuments()` throws, the error is caught, logged, emitted to `errorEmitter`, and the strategy is skipped via `continue`. The walker proceeds to the next strategy without terminating.

**Callback Invocation:**
Four optional callbacks are invoked during execution:
1. `onStrategyStart(strategyName, symbol)` - Before backtest begins
2. `onStrategyError(strategyName, symbol, error)` - If backtest throws
3. `onStrategyComplete(strategyName, symbol, stats, metricValue)` - After backtest succeeds
4. `onComplete(finalResults)` - After all strategies finish


## Best Strategy Selection Logic

The best strategy is determined by comparing `metricValue` against `bestMetric` after each strategy completes.

### Comparison Logic

```typescript
// Update best strategy if needed
const isBetter =
  bestMetric === null ||
  (metricValue !== null && metricValue > bestMetric);

if (isBetter && metricValue !== null) {
  bestMetric = metricValue;
  bestStrategy = strategyName;
}
```

### Selection Rules

1. **Initial Selection:** If `bestMetric === null` (first strategy or no valid metrics yet), any strategy with non-null `metricValue` becomes best
2. **Comparison:** If `metricValue > bestMetric`, the current strategy becomes best
3. **Null Handling:** Strategies with `null` metricValue are never selected as best
4. **Tie Behavior:** If two strategies have identical metric values, the first one encountered wins (iteration order determines ties)

### Ascending vs Descending Metrics

All supported metrics use **descending** comparison (higher is better). There are no metrics where lower values are preferable. This simplifies the comparison logic to a single `>` operator.


---

## WalkerContract Data Structure

Each iteration of `WalkerLogicPrivateService.run()` yields a `WalkerContract` containing the current strategy's results and updated best strategy tracking.

### WalkerContract Interface

```typescript
interface WalkerContract {
  walkerName: string;
  exchangeName: string;
  frameName: string;
  symbol: string;
  strategyName: string;           // Current strategy just tested
  stats: BacktestStatistics;      // Full statistics for current strategy
  metricValue: number | null;     // Extracted metric for current strategy
  metric: WalkerMetric;           // Comparison metric being used
  bestMetric: number | null;      // Best metric seen so far
  bestStrategy: string | null;    // Strategy with best metric
  strategiesTested: number;       // Count of strategies completed
  totalStrategies: number;        // Total strategies to test
}
```

### Contract Building Code

```typescript
const walkerContract: WalkerContract = {
  walkerName: context.walkerName,
  exchangeName: context.exchangeName,
  frameName: context.frameName,
  symbol,
  strategyName,
  stats,
  metricValue,
  metric,
  bestMetric,
  bestStrategy,
  strategiesTested,
  totalStrategies: strategies.length,
};
```

The contract is constructed at [src/lib/services/logic/private/WalkerLogicPrivateService.ts:190-203]() after updating `bestMetric`/`bestStrategy` and before emitting progress events.

### Contract Emission Flow

![Mermaid Diagram](./diagrams/65_Strategy_Comparison_1.svg)

Three emissions occur per strategy:
1. **progressWalkerEmitter** - Numeric progress (count, percentage)
2. **walkerEmitter** - Full contract for external listeners
3. **yield** - Contract to the async generator consumer


---

## Final Results Structure

After all strategies complete, `WalkerLogicPrivateService.run()` emits final results to `walkerCompleteSubject`.

### Final Results Interface

```typescript
interface IWalkerResults {
  walkerName: string;
  symbol: string;
  exchangeName: string;
  frameName: string;
  metric: WalkerMetric;
  totalStrategies: number;
  bestStrategy: string | null;
  bestMetric: number | null;
  bestStats: BacktestStatistics | null;  // Statistics for best strategy
}
```

### Final Results Construction

```typescript
const finalResults = {
  walkerName: context.walkerName,
  symbol,
  exchangeName: context.exchangeName,
  frameName: context.frameName,
  metric,
  totalStrategies: strategies.length,
  bestStrategy,
  bestMetric,
  bestStats:
    bestStrategy !== null
      ? await this.backtestMarkdownService.getData(symbol, bestStrategy)
      : null,
};

// Call onComplete callback if provided with final best results
if (walkerSchema.callbacks?.onComplete) {
  walkerSchema.callbacks.onComplete(finalResults);
}

await walkerCompleteSubject.next(finalResults);
```

The final results are constructed at [src/lib/services/logic/private/WalkerLogicPrivateService.ts:230-250](). Unlike `WalkerContract`, the final results include `bestStats` which contains the full `BacktestStatistics` for the winning strategy.


---

## Progress Tracking Events

Walker emits three distinct progress events during execution: numeric progress, walker contracts, and completion.

### Progress Event Types

**progressWalkerEmitter (Numeric Progress):**

Emitted after each strategy completes. Provides percentage and count information.

```typescript
interface ProgressWalkerContract {
  walkerName: string;
  exchangeName: string;
  frameName: string;
  symbol: string;
  totalStrategies: number;
  processedStrategies: number;
  progress: number;  // 0.0 to 1.0
}
```

**walkerEmitter (Strategy Results):**

Emitted after each strategy completes. Contains full `WalkerContract` with strategy statistics and best tracking.

```typescript
interface WalkerContract {
  walkerName: string;
  exchangeName: string;
  frameName: string;
  symbol: string;
  strategyName: string;
  stats: BacktestStatistics;
  metricValue: number | null;
  metric: WalkerMetric;
  bestMetric: number | null;
  bestStrategy: string | null;
  strategiesTested: number;
  totalStrategies: number;
}
```

**walkerCompleteSubject (Final Results):**

Emitted once after all strategies finish. Contains final best strategy determination.

```typescript
interface IWalkerResults {
  walkerName: string;
  symbol: string;
  exchangeName: string;
  frameName: string;
  metric: WalkerMetric;
  totalStrategies: number;
  bestStrategy: string | null;
  bestMetric: number | null;
  bestStats: BacktestStatistics | null;
}
```

### Event Emission Sequence

![Mermaid Diagram](./diagrams/65_Strategy_Comparison_2.svg)

### Listener Functions

**listenWalkerProgress(callback):**
Subscribes to `progressWalkerEmitter`. Receives numeric progress after each strategy.

**listenWalker(callback):**
Subscribes to `walkerEmitter`. Receives full `WalkerContract` with statistics after each strategy.

**listenWalkerComplete(callback):**
Subscribes to `walkerCompleteSubject`. Receives `IWalkerResults` once at completion.

All three listeners support filtering by `symbol`, `walkerName`, `exchangeName`, or `frameName` properties.


---

## Statistics Retrieval from BacktestMarkdownService

Walker retrieves statistics for each strategy by calling `BacktestMarkdownService.getData(symbol, strategyName)` after the backtest completes.

### Statistics Retrieval Flow

![Mermaid Diagram](./diagrams/65_Strategy_Comparison_3.svg)

### BacktestStatistics Interface

The statistics object returned by `BacktestMarkdownService.getData()` contains:

```typescript
interface BacktestStatistics {
  totalSignals: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  avgPnl: number | null;
  totalPnl: number | null;
  stdDev: number | null;
  sharpeRatio: number | null;
  annualizedSharpeRatio: number | null;
  certaintyRatio: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  // ... additional fields
}
```

Each metric field may be `null` if calculation is unsafe (e.g., NaN, Infinity, insufficient data). Walker's metric extraction checks for null values before comparison.


---

## Validation and Data Clearing

Before walker execution begins, extensive validation and data clearing occurs to ensure clean results.

### Validation Steps

1. **Walker Schema Validation** - Confirms `walkerName` is registered
2. **Exchange Validation** - Confirms `exchangeName` exists and is valid
3. **Frame Validation** - Confirms `frameName` exists and has valid timeframe
4. **Strategy Validation** - Each strategy in `walkerSchema.strategies` is validated
5. **Risk Validation** - If any strategy has `riskName`, that risk profile is validated

All validation occurs at [src/classes/Walker.ts:50-59]() and [src/lib/services/global/WalkerGlobalService.ts:64-84]()

### Data Clearing

Before walker starts, all accumulated data is cleared for each strategy:

```typescript
for (const strategyName of walkerSchema.strategies) {
  // Clear backtest results
  backtest.backtestMarkdownService.clear(strategyName);
  
  // Clear scheduled signal tracking
  backtest.scheduleMarkdownService.clear(strategyName);
  
  // Clear strategy internal state
  backtest.strategyGlobalService.clear(strategyName);
  
  // Clear risk profile active positions
  const { riskName } = backtest.strategySchemaService.get(strategyName);
  riskName && backtest.riskGlobalService.clear(riskName);
}
```

This ensures each strategy starts with clean state and no leftover data from previous runs.


---

## Markdown Report Generation

`WalkerMarkdownService` accumulates strategy results via `walkerEmitter` subscription and generates markdown comparison reports.

### Service Architecture

**WalkerMarkdownService Component Diagram:**

![Mermaid Diagram](./diagrams/65_Strategy_Comparison_4.svg)


### ReportStorage Accumulation

`ReportStorage.addResult()` is called for each `WalkerContract` emitted during walker execution:

```typescript
// From WalkerMarkdownService.tick()
private tick = async (data: WalkerContract) => {
  const storage = this.getStorage(data.walkerName);
  storage.addResult(data);
};
```

The storage maintains:
- `_strategyResults: IStrategyResult[]` - All strategy results for comparison
- `_bestStrategy: StrategyName | null` - Best strategy name
- `_bestMetric: number | null` - Best metric value
- `_bestStats: BacktestStatistics | null` - Full statistics for best strategy


### Comparison Table Generation

`ReportStorage.getComparisonTable()` sorts strategies by metric value descending and formats the top N:

```typescript
// Sort strategies by metric value (descending)
const sortedResults = [...this._strategyResults].sort((a, b) => {
  const aValue = a.metricValue ?? -Infinity;
  const bValue = b.metricValue ?? -Infinity;
  return bValue - aValue;
});

// Take top N strategies
const topStrategies = sortedResults.slice(0, topN);
```

The comparison table includes columns configured in `createStrategyColumns()`:
- Rank (1-indexed position)
- Strategy (strategyName)
- Metric (selected metric value)
- Total Signals
- Win Rate
- Avg PNL
- Total PNL
- Sharpe Ratio
- Std Dev


### PNL Table Generation

`ReportStorage.getPnlTable()` collects all closed signals from all strategies and formats them as a unified table:

```typescript
// Collect all closed signals from all strategies
const allSignals: SignalData[] = [];

for (const result of this._strategyResults) {
  for (const signal of result.stats.signalList) {
    allSignals.push({
      strategyName: result.strategyName,
      signalId: signal.signal.id,
      symbol: signal.signal.symbol,
      position: signal.signal.position,
      pnl: signal.pnl.pnlPercentage,
      closeReason: signal.closeReason,
      openTime: signal.signal.pendingAt,
      closeTime: signal.closeTimestamp,
    });
  }
}
```

The PNL table provides granular signal-level analysis across all compared strategies.


### Report API

```typescript
// Get structured data
const data = await Walker.getData("BTCUSDT", "my-walker");
// Returns: WalkerStatistics with strategyResults[], bestStrategy, bestMetric

// Generate markdown string
const markdown = await Walker.getReport("BTCUSDT", "my-walker");
// Returns: Full markdown report with comparison and PNL tables

// Save to disk (default: ./dump/walker/{walkerName}.md)
await Walker.dump("BTCUSDT", "my-walker");

// Save to custom path
await Walker.dump("BTCUSDT", "my-walker", "./custom/reports");
```


---

## Background Execution

Walker supports background execution mode for non-blocking operation.

### Background Mode

```typescript
const stop = Walker.background("BTCUSDT", {
  walkerName: "my-walker"
});

// Listen to progress without blocking
listenWalker((event) => {
  console.log(`Testing ${event.strategyName}...`);
});

// Listen to completion
listenDoneWalker((event) => {
  console.log("Walker completed!");
  Walker.dump(event.symbol, event.strategyName);
});

// Later: stop execution early if needed
stop();
```

**Background Execution Details:**

1. `Walker.background()` consumes the async generator internally
2. Returns a cancellation function that stops execution
3. Emits `doneWalkerSubject` event when complete
4. Errors are caught and emitted to `errorEmitter`

The cancellation function calls `strategyGlobalService.stop()` for each strategy to gracefully terminate any ongoing backtests.


---

## Metric Selection Best Practices

### Choosing the Right Metric

| Use Case | Recommended Metric | Rationale |
|----------|-------------------|-----------|
| Risk-adjusted performance | `sharpeRatio` or `annualizedSharpeRatio` | Balances returns with volatility |
| Maximum profitability | `totalPnl` | Ignores risk, focuses on absolute returns |
| Consistency | `winRate` | Prioritizes trade success frequency |
| Average trade quality | `avgPnl` | Good for comparing per-trade efficiency |
| Win/loss ratio | `certaintyRatio` | Shows if wins outweigh losses in magnitude |
| Long-term projections | `expectedYearlyReturns` | Estimates annual returns based on average trade duration |

### Multi-Metric Analysis

While walker compares strategies using a single metric, you can perform multi-metric analysis manually:

```typescript
const results = await Walker.getData("BTCUSDT", "my-walker");

// Rank by different metrics
const bySharpe = [...results.strategies].sort((a, b) => 
  (b.stats.sharpeRatio || 0) - (a.stats.sharpeRatio || 0)
);

const byWinRate = [...results.strategies].sort((a, b) => 
  (b.stats.winRate || 0) - (a.stats.winRate || 0)
);

const byTotalPnl = [...results.strategies].sort((a, b) => 
  (b.stats.totalPnl || 0) - (a.stats.totalPnl || 0)
);

// Find consensus winner
const rankings = new Map();
[bySharpe, byWinRate, byTotalPnl].forEach((ranking, metricIndex) => {
  ranking.forEach((strategy, rank) => {
    const current = rankings.get(strategy.strategyName) || 0;
    rankings.set(strategy.strategyName, current + rank);
  });
});

const consensusWinner = Array.from(rankings.entries())
  .sort((a, b) => a[1] - b[1])[0][0];
```


---

## Comparison with Manual Testing

### Walker vs Manual Backtest Loop

**Manual approach:**

```typescript
const strategies = ["strategy-a", "strategy-b", "strategy-c"];
const results = [];

for (const strategyName of strategies) {
  for await (const _ of Backtest.run("BTCUSDT", {
    strategyName,
    exchangeName: "binance",
    frameName: "1d-backtest"
  })) {}
  
  const stats = await Backtest.getData(strategyName);
  results.push({ strategyName, stats });
}

// Manually compare results
const best = results.reduce((best, current) => 
  current.stats.sharpeRatio > best.stats.sharpeRatio ? current : best
);
```

**Walker approach:**

```typescript
addWalker({
  walkerName: "my-walker",
  exchangeName: "binance",
  frameName: "1d-backtest",
  strategies: ["strategy-a", "strategy-b", "strategy-c"],
  metric: "sharpeRatio"
});

for await (const progress of Walker.run("BTCUSDT", {
  walkerName: "my-walker"
})) {
  console.log(`Best: ${progress.bestStrategy}`);
}

const results = await Walker.getData("BTCUSDT", "my-walker");
```

**Walker advantages:**

1. **Automatic metric extraction** - No manual calculation needed
2. **Progress tracking** - Built-in events for monitoring
3. **Report generation** - Automatic markdown reports
4. **Data isolation** - Automatic clearing between runs
5. **Validation** - Upfront validation of all dependencies

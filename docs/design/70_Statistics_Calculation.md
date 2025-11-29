# Statistics Calculation


This page documents the statistical calculation system in backtest-kit, which computes performance metrics from signal data. For report generation and markdown formatting, see [Markdown Report Generation](./68_Markdown_Report_Generation.md). For performance timing metrics, see [Performance Metrics](./69_Performance_Metrics.md).

## Overview

The statistics calculation system transforms raw signal events into actionable performance metrics. Three specialized services handle different execution modes:

- **BacktestStatistics** - Metrics for historical simulation ([BacktestMarkdownService.ts:66-102]())
- **LiveStatistics** - Metrics for real-time trading ([LiveMarkdownService.ts:91-130]())
- **ScheduleStatistics** - Metrics for scheduled signal tracking ([ScheduleMarkdownService.ts:68-86]())

All metrics include safe math checks to handle edge cases (NaN, Infinity) and return `null` for unsafe calculations.

**Sources:** [types.d.ts:846-871](), [src/lib/services/markdown/BacktestMarkdownService.ts:66-102](), [src/lib/services/markdown/LiveMarkdownService.ts:91-130](), [src/lib/services/markdown/ScheduleMarkdownService.ts:68-86]()

## Statistics Calculation Architecture

![Mermaid Diagram](./diagrams/70_Statistics_Calculation_0.svg)

**Calculation Flow:**

1. **Event Emission** - Signals emitted via Subject-based emitters
2. **Event Subscription** - Markdown services subscribe in `init()` via singleshot
3. **Event Accumulation** - ReportStorage classes maintain event lists (max 250 for live/schedule)
4. **Statistics Calculation** - `getData()` computes metrics from accumulated data
5. **Safe Math Validation** - `isUnsafe()` checks prevent NaN/Infinity in results

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:343-369](), [src/lib/services/markdown/LiveMarkdownService.ts:567-618](), [src/lib/services/markdown/ScheduleMarkdownService.ts:374-413]()

## BacktestStatistics Structure

**Purpose:** Comprehensive metrics for historical backtesting with closed signals only.

### Interface Definition

```typescript
interface BacktestStatistics {
  signalList: IStrategyTickResultClosed[];
  totalSignals: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;              // 0-100%, higher is better
  avgPnl: number | null;               // Average PNL %, higher is better
  totalPnl: number | null;             // Cumulative PNL %, higher is better
  stdDev: number | null;               // Volatility, lower is better
  sharpeRatio: number | null;          // Risk-adjusted return, higher is better
  annualizedSharpeRatio: number | null; // Sharpe × √365, higher is better
  certaintyRatio: number | null;       // avgWin / |avgLoss|, higher is better
  expectedYearlyReturns: number | null; // Projected annual return, higher is better
}
```

### Calculation Location

Statistics computed in [BacktestMarkdownService.ts:183-194]() by `ReportStorage.getData()`:

```typescript
public async getData(): Promise<BacktestStatistics> {
  if (this._signalList.length === 0) {
    return { /* null values */ };
  }
  
  const totalSignals = this._signalList.length;
  const winCount = this._signalList.filter(s => s.pnl.pnlPercentage > 0).length;
  const lossCount = this._signalList.filter(s => s.pnl.pnlPercentage < 0).length;
  
  // Calculate metrics with safe math checks...
}
```

**Sources:** [types.d.ts:846-871](), [src/lib/services/markdown/BacktestMarkdownService.ts:66-102](), [src/lib/services/markdown/BacktestMarkdownService.ts:183-270]()

## LiveStatistics Structure

**Purpose:** Real-time trading metrics including idle, opened, active, and closed events.

### Interface Definition

```typescript
interface LiveStatistics {
  eventList: TickEvent[];              // All events (idle/opened/active/closed)
  totalEvents: number;                 // All event types
  totalClosed: number;                 // Closed signals only
  winCount: number;
  lossCount: number;
  winRate: number | null;
  avgPnl: number | null;
  totalPnl: number | null;
  stdDev: number | null;
  sharpeRatio: number | null;
  annualizedSharpeRatio: number | null;
  certaintyRatio: number | null;
  expectedYearlyReturns: number | null;
}
```

### Key Differences from Backtest

1. **Event List Scope** - Includes idle/active events, not just closed
2. **Dual Totals** - `totalEvents` (all) vs `totalClosed` (metrics basis)
3. **Event Replacement** - Active events replace previous with same signalId ([LiveMarkdownService.ts:299-329]())
4. **Max Queue Size** - Limited to 250 events ([LiveMarkdownService.ts:223]())

**Sources:** [src/lib/services/markdown/LiveMarkdownService.ts:91-130](), [src/lib/services/markdown/LiveMarkdownService.ts:229-373](), [src/lib/services/markdown/LiveMarkdownService.ts:381-464]()

## ScheduleStatistics Structure

**Purpose:** Track scheduled signal behavior and cancellation patterns.

### Interface Definition

```typescript
interface ScheduleStatistics {
  eventList: ScheduledEvent[];         // Scheduled + cancelled events
  totalEvents: number;
  totalScheduled: number;
  totalCancelled: number;
  cancellationRate: number | null;     // %, lower is better
  avgWaitTime: number | null;          // Minutes for cancelled signals
}
```

### Unique Metrics

| Metric | Formula | Purpose |
|--------|---------|---------|
| `cancellationRate` | `(totalCancelled / totalScheduled) × 100` | Measures limit order fill rate |
| `avgWaitTime` | `Σ(duration) / totalCancelled` | Average time before cancellation |

**Sources:** [src/lib/services/markdown/ScheduleMarkdownService.ts:68-86](), [src/lib/services/markdown/ScheduleMarkdownService.ts:244-285]()

## Safe Math Implementation

### isUnsafe Function

Prevents invalid numeric values from appearing in statistics:

```typescript
function isUnsafe(value: number | null): boolean {
  if (typeof value !== "number") return true;
  if (isNaN(value)) return true;
  if (!isFinite(value)) return true;
  return false;
}
```

**Validation Flow:**

![Mermaid Diagram](./diagrams/70_Statistics_Calculation_1.svg)

### Application Examples

All calculated metrics pass through safe math checks:

```typescript
// From BacktestMarkdownService.ts
return {
  winRate: isUnsafe(winRate) ? null : winRate,
  avgPnl: isUnsafe(avgPnl) ? null : avgPnl,
  totalPnl: isUnsafe(totalPnl) ? null : totalPnl,
  stdDev: isUnsafe(stdDev) ? null : stdDev,
  sharpeRatio: isUnsafe(sharpeRatio) ? null : sharpeRatio,
  // ... all other metrics
};
```

**Edge Cases Handled:**

- Division by zero (returns `null`)
- Empty signal list (returns `null`)
- Square root of negative variance (returns `null`)
- Infinite trade duration (returns `null`)

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:28-44](), [src/lib/services/markdown/LiveMarkdownService.ts:22-33](), [src/lib/services/markdown/BacktestMarkdownService.ts:261-268]()

## Basic Metrics Calculation

### Win Rate

**Formula:** `(winCount / totalSignals) × 100`

**Code Location:** [BacktestMarkdownService.ts:227]()

```typescript
const winCount = this._signalList.filter(s => s.pnl.pnlPercentage > 0).length;
const lossCount = this._signalList.filter(s => s.pnl.pnlPercentage < 0).length;
const winRate = (winCount / totalSignals) * 100;
```

**Interpretation:** Percentage of profitable trades. Higher is better.

### Average PNL

**Formula:** `Σ(pnlPercentage) / totalSignals`

**Code Location:** [BacktestMarkdownService.ts:225]()

```typescript
const avgPnl = this._signalList.reduce(
  (sum, s) => sum + s.pnl.pnlPercentage, 
  0
) / totalSignals;
```

**Interpretation:** Mean profit/loss per trade. Higher is better.

### Total PNL

**Formula:** `Σ(pnlPercentage)`

**Code Location:** [BacktestMarkdownService.ts:226]()

```typescript
const totalPnl = this._signalList.reduce(
  (sum, s) => sum + s.pnl.pnlPercentage, 
  0
);
```

**Interpretation:** Cumulative profit/loss across all trades. Higher is better.

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:220-227](), [src/lib/services/markdown/LiveMarkdownService.ts:402-410]()

## Risk-Adjusted Metrics

### Standard Deviation Calculation

**Purpose:** Measures volatility of returns (risk).

**Formula:**

```
variance = Σ((return - avgPnl)²) / totalSignals
stdDev = √variance
```

**Code Location:** [BacktestMarkdownService.ts:229-232]()

```typescript
const returns = this._signalList.map(s => s.pnl.pnlPercentage);
const variance = returns.reduce(
  (sum, r) => sum + Math.pow(r - avgPnl, 2), 
  0
) / totalSignals;
const stdDev = Math.sqrt(variance);
```

**Interpretation:** Lower is better (less volatile).

### Sharpe Ratio

**Purpose:** Risk-adjusted return (assuming risk-free rate = 0).

**Formula:** `avgPnl / stdDev`

**Code Location:** [BacktestMarkdownService.ts:233]()

```typescript
const sharpeRatio = stdDev > 0 ? avgPnl / stdDev : 0;
```

**Interpretation:** Higher is better. Measures excess return per unit of risk.

**Typical Values:**
- `< 0` - Losing strategy
- `0-1` - Sub-optimal
- `1-2` - Good
- `> 2` - Excellent

### Annualized Sharpe Ratio

**Purpose:** Standardize Sharpe ratio to annual timeframe.

**Formula:** `sharpeRatio × √365`

**Code Location:** [BacktestMarkdownService.ts:234]()

```typescript
const annualizedSharpeRatio = sharpeRatio * Math.sqrt(365);
```

**Interpretation:** Higher is better. Accounts for trade frequency.

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:229-235](), [src/lib/services/markdown/LiveMarkdownService.ts:413-421]()

## Advanced Metrics

### Certainty Ratio (Win/Loss Ratio)

**Purpose:** Measures quality of wins vs losses.

**Formula:** `avgWin / |avgLoss|`

**Code Location:** [BacktestMarkdownService.ts:236-245]()

```typescript
const wins = this._signalList.filter(s => s.pnl.pnlPercentage > 0);
const losses = this._signalList.filter(s => s.pnl.pnlPercentage < 0);

const avgWin = wins.length > 0
  ? wins.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / wins.length
  : 0;

const avgLoss = losses.length > 0
  ? losses.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / losses.length
  : 0;

const certaintyRatio = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : 0;
```

**Interpretation:**
- `> 1.0` - Average win exceeds average loss (good)
- `< 1.0` - Average loss exceeds average win (requires high win rate)

### Expected Yearly Returns

**Purpose:** Project annual returns based on average trade duration.

**Formula:**

```
avgDurationDays = avgDurationMs / (1000 × 60 × 60 × 24)
tradesPerYear = 365 / avgDurationDays
expectedYearlyReturns = avgPnl × tradesPerYear
```

**Code Location:** [BacktestMarkdownService.ts:247-254]()

```typescript
const avgDurationMs = this._signalList.reduce(
  (sum, s) => sum + (s.closeTimestamp - s.signal.pendingAt),
  0
) / totalSignals;

const avgDurationDays = avgDurationMs / (1000 * 60 * 60 * 24);
const tradesPerYear = avgDurationDays > 0 ? 365 / avgDurationDays : 0;
const expectedYearlyReturns = avgPnl * tradesPerYear;
```

**Assumptions:**
- Consistent trade frequency
- Consistent position sizing
- No compounding effects

**Interpretation:** Projected annual return percentage. Higher is better.

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:236-254](), [src/lib/services/markdown/LiveMarkdownService.ts:424-447]()

## Schedule-Specific Metrics

### Cancellation Rate

**Purpose:** Measure effectiveness of scheduled (limit) orders.

**Formula:** `(totalCancelled / totalScheduled) × 100`

**Code Location:** [ScheduleMarkdownService.ts:267-268]()

```typescript
const cancellationRate = totalScheduled > 0 
  ? (totalCancelled / totalScheduled) * 100 
  : null;
```

**Interpretation:**
- Low rate (< 30%) - Good entry price selection
- Medium rate (30-60%) - Average fill rate
- High rate (> 60%) - Poor entry price selection

### Average Wait Time

**Purpose:** Measure time spent waiting before cancellation.

**Formula:** `Σ(durationMinutes) / totalCancelled`

**Code Location:** [ScheduleMarkdownService.ts:271-275]()

```typescript
const avgWaitTime = totalCancelled > 0
  ? cancelledEvents.reduce((sum, e) => sum + (e.duration || 0), 0) / totalCancelled
  : null;
```

**Interpretation:** Average minutes before scheduled signal cancels. Indicates patience threshold.

**Sources:** [src/lib/services/markdown/ScheduleMarkdownService.ts:244-285]()

## Metrics Calculation Flow

![Mermaid Diagram](./diagrams/70_Statistics_Calculation_2.svg)

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:202-270](), [src/lib/services/markdown/LiveMarkdownService.ts:381-464]()

## Usage Examples

### Accessing Backtest Statistics

```typescript
import { Backtest } from "backtest-kit";

// After backtest completion
const stats = await Backtest.getData("my-strategy");

console.log(`Total Signals: ${stats.totalSignals}`);
console.log(`Win Rate: ${stats.winRate?.toFixed(2)}%`);
console.log(`Sharpe Ratio: ${stats.sharpeRatio?.toFixed(3)}`);
console.log(`Expected Yearly Returns: ${stats.expectedYearlyReturns?.toFixed(2)}%`);

// Check for null values (safe math)
if (stats.sharpeRatio === null) {
  console.warn("Sharpe Ratio calculation resulted in unsafe value");
}
```

### Accessing Live Statistics

```typescript
import { Live } from "backtest-kit";

// During or after live trading
const stats = await Live.getData("my-strategy");

console.log(`Total Events: ${stats.totalEvents}`);
console.log(`Closed Signals: ${stats.totalClosed}`);
console.log(`Win Rate: ${stats.winRate?.toFixed(2)}%`);
console.log(`Certainty Ratio: ${stats.certaintyRatio?.toFixed(3)}`);

// Access raw event data
stats.eventList.forEach(event => {
  if (event.action === "closed") {
    console.log(`Signal ${event.signalId}: ${event.pnl}%`);
  }
});
```

### Accessing Schedule Statistics

```typescript
import { Schedule } from "backtest-kit";

const stats = await Schedule.getData("my-strategy");

console.log(`Scheduled: ${stats.totalScheduled}`);
console.log(`Cancelled: ${stats.totalCancelled}`);
console.log(`Cancellation Rate: ${stats.cancellationRate?.toFixed(2)}%`);
console.log(`Avg Wait Time: ${stats.avgWaitTime?.toFixed(2)} minutes`);
```

**Sources:** [types.d.ts:846-871](), [src/index.ts:97-99]()

## Metrics Interpretation Guide

| Metric | Optimal Range | Red Flag |
|--------|---------------|----------|
| `winRate` | 55-70% | < 45% or > 80% |
| `sharpeRatio` | 1.5-3.0 | < 0.5 |
| `annualizedSharpeRatio` | 2.0-4.0 | < 1.0 |
| `certaintyRatio` | > 1.5 | < 0.8 |
| `expectedYearlyReturns` | > 20% | < 5% |
| `cancellationRate` | < 40% | > 70% |

**Warning Signs:**
- `winRate > 80%` - Possible over-fitting or unrealistic strategy
- `sharpeRatio < 0.5` - High risk relative to returns
- `certaintyRatio < 1.0` - Average losses exceed average wins
- `cancellationRate > 70%` - Poor entry price selection

**Sources:** [README.md:489-509](), [src/lib/services/markdown/BacktestMarkdownService.ts:66-102]()
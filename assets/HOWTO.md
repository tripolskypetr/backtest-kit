# JSONL Report Files Documentation

This document describes the structure and purpose of JSONL files used for real-time trading strategy debugging and analysis.

## File Locations

All JSONL files are stored in `./dump/report/` directory:

```
dump/report/
├── backtest.jsonl
├── live.jsonl
├── heat.jsonl
├── partial.jsonl
├── breakeven.jsonl
├── schedule.jsonl
├── performance.jsonl
└── walker.jsonl
```

## File Format

Each file contains newline-delimited JSON objects (JSONL format). Each line is a valid JSON object representing a single event.

## Report Types

### 1. backtest.jsonl

**Purpose**: Complete lifecycle tracking of all signals during backtesting.

**Source**: `BacktestReportService` listening to `signalBacktestEmitter`

**Event Types**:
- `idle`: No active positions
- `opened`: Position opened at entry price
- `active`: Position being monitored (includes unrealized PNL)
- `closed`: Position closed with final PNL

**Fields**:
```typescript
{
  timestamp: number;           // Event timestamp (ms)
  action: "idle" | "opened" | "active" | "closed";
  symbol: string;              // Trading pair (e.g., "BTCUSDT")
  strategyName: string;        // Strategy identifier
  exchangeName: string;        // Exchange identifier
  frameName: string;           // Timeframe identifier
  backtest: true;              // Always true for this file
  currentPrice: number;        // Current market price

  // Fields present when action != "idle":
  signalId?: string;           // UUID of signal
  position?: string;           // "LONG" | "SHORT"
  note?: string;               // Strategy notes
  priceOpen?: number;          // Entry price
  priceTakeProfit?: number;    // Current take profit target
  priceStopLoss?: number;      // Current stop loss target
  originalPriceTakeProfit?: number;  // Initial TP (before trailing)
  originalPriceStopLoss?: number;    // Initial SL (before trailing)
  totalExecuted?: number;      // Cumulative % from partial exits
  openTime?: number;           // Position open timestamp (ms)
  scheduledAt?: number;        // Signal creation timestamp (ms)
  minuteEstimatedTime?: number; // Expected duration (minutes)

  // Fields present when action == "active":
  _partial?: Array<{           // Partial exit history
    type: "profit" | "loss";
    percent: number;
    price: number;
  }>;
  percentTp?: number;          // Progress toward TP (0-100)
  percentSl?: number;          // Progress toward SL (0-100)
  pnl?: number;                // Unrealized PNL (%)
  pnlPriceOpen?: number;       // Entry price for PNL calc
  pnlPriceClose?: number;      // Current price for PNL calc

  // Fields present when action == "closed":
  closeReason?: string;        // "take_profit" | "stop_loss" | "time_expired" | "user"
  closeTime?: number;          // Close timestamp (ms)
  duration?: number;           // Position duration (minutes)
}
```

**Use Cases**:
- Debugging signal lifecycle transitions
- Analyzing entry/exit timing
- Validating PNL calculations
- Tracking partial exit sequences
- Monitoring trailing stop/take profit adjustments

---

### 2. live.jsonl

**Purpose**: Real-time tracking of live trading signal lifecycle.

**Source**: `LiveReportService` listening to `signalLiveEmitter`

**Event Types**: Same as backtest (idle, opened, active, closed)

**Fields**: Identical structure to `backtest.jsonl`, except `backtest: false`

**Use Cases**:
- Real-time position monitoring
- Live PNL tracking
- Production debugging
- Comparing live vs backtest behavior

---

### 3. heat.jsonl

**Purpose**: Portfolio-wide closed signal aggregation for heatmap analysis.

**Source**: `HeatReportService` listening to `signalEmitter` (both live and backtest)

**Event Types**: Only `closed` events

**Fields**:
```typescript
{
  timestamp: number;
  action: "closed";
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  signalId: string;
  position: string;
  note?: string;
  pnl: number;                 // Realized PNL (%)
  closeReason: string;
  openTime: number;
  closeTime: number;
}
```

**Use Cases**:
- Multi-symbol performance comparison
- Cross-strategy PNL heatmaps
- Identifying best/worst performing symbols
- Portfolio risk analysis

---

### 4. partial.jsonl

**Purpose**: Tracking partial position exits (both profit-taking and loss-cutting).

**Source**: `PartialReportService` listening to `partialProfitSubject` and `partialLossSubject`

**Event Types**:
- `profit`: Partial exit toward take profit
- `loss`: Partial exit toward stop loss

**Fields**:
```typescript
{
  timestamp: number;
  action: "profit" | "loss";
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  signalId: string;
  position: string;
  currentPrice: number;        // Exit price for this partial
  level: number;               // Partial level (1-5)
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  originalPriceTakeProfit: number;
  originalPriceStopLoss: number;
  totalExecuted: number;       // Cumulative % executed
  _partial?: Array<{           // Full partial history
    type: "profit" | "loss";
    percent: number;
    price: number;
  }>;
  note?: string;
  pendingAt: number;
  scheduledAt: number;
  minuteEstimatedTime: number;
}
```

**Use Cases**:
- Analyzing partial exit effectiveness
- Debugging partial close logic
- Calculating weighted PNL for partial positions
- Tracking incremental profit/loss realization

---

### 5. breakeven.jsonl

**Purpose**: Tracking stop-loss moves to breakeven (entry price).

**Source**: `BreakevenReportService` listening to `breakevenSubject`

**Fields**:
```typescript
{
  timestamp: number;
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  signalId: string;
  position: string;
  currentPrice: number;        // Price when SL moved to breakeven
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;       // Updated to breakeven price
  originalPriceTakeProfit: number;
  originalPriceStopLoss: number;  // Original SL before breakeven
  totalExecuted: number;
  note?: string;
  pendingAt: number;
  scheduledAt: number;
  minuteEstimatedTime: number;
}
```

**Use Cases**:
- Monitoring risk reduction via breakeven
- Analyzing conditions that trigger breakeven moves
- Comparing original SL vs breakeven SL
- Validating breakeven strategy logic

---

### 6. schedule.jsonl

**Purpose**: Tracking scheduled signal lifecycle (delayed order execution).

**Source**: `ScheduleReportService` listening to `signalEmitter` (scheduled/opened/cancelled actions only)

**Event Types**:
- `scheduled`: Signal created with scheduled execution
- `opened`: Scheduled signal activated at entry price
- `cancelled`: Scheduled signal cancelled before execution

**Fields**:
```typescript
{
  timestamp: number;           // scheduledAt for scheduled/cancelled, pendingAt for opened
  action: "scheduled" | "opened" | "cancelled";
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  signalId: string;
  position: string;
  note?: string;
  currentPrice: number;
  priceOpen: number;           // Scheduled entry price
  priceTakeProfit: number;
  priceStopLoss: number;
  originalPriceTakeProfit: number;
  originalPriceStopLoss: number;
  totalExecuted: number;

  // Fields present when action == "opened":
  scheduledAt?: number;
  pendingAt?: number;
  minuteEstimatedTime?: number;
  duration?: number;           // Wait time from scheduled to opened (minutes)

  // Fields present when action == "cancelled":
  closeReason?: string;        // "timeout" | "price_reject" | "user"
  closeTime?: number;
}
```

**Use Cases**:
- Analyzing scheduled order fill rates
- Debugging order scheduling logic
- Calculating average activation time
- Identifying price rejection patterns

---

### 7. performance.jsonl

**Purpose**: Execution performance profiling and bottleneck analysis.

**Source**: `PerformanceReportService` listening to `performanceEmitter`

**Fields**:
```typescript
{
  timestamp: number;
  metricType: string;          // Metric identifier (e.g., "strategy_tick", "indicator_calc")
  duration: number;            // Execution time (ms)
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  previousTimestamp: number;   // Timestamp of previous measurement
}
```

**Use Cases**:
- Identifying performance bottlenecks
- Profiling strategy execution time
- Comparing backtest vs live performance
- Optimizing slow indicator calculations

---

### 8. walker.jsonl

**Purpose**: Strategy parameter optimization tracking (walker algorithm progress).

**Source**: `WalkerReportService` listening to `walkerEmitter`

**Fields**:
```typescript
{
  timestamp: number;
  walkerName: string;          // Optimizer identifier
  symbol: string;
  exchangeName: string;
  frameName: string;
  strategyName: string;        // Current strategy being tested
  metric: string;              // Optimization metric (e.g., "sharpe_ratio", "total_pnl")
  metricValue: number;         // Value of metric for this strategy
  strategiesTested: number;    // Count of strategies tested so far
  totalStrategies: number;     // Total strategies to test
  bestStrategy: string;        // Best strategy name so far
  bestMetric: number;          // Best metric value so far

  // Performance statistics for current strategy:
  totalSignals: number;
  winCount: number;
  lossCount: number;
  winRate: number;             // Percentage (0-100)
  avgPnl: number;              // Average PNL per trade (%)
  totalPnl: number;            // Cumulative PNL (%)
  stdDev: number;              // Standard deviation of returns
  sharpeRatio: number;         // Risk-adjusted return
  annualizedSharpeRatio: number;
  certaintyRatio: number;      // avgWin / |avgLoss|
  expectedYearlyReturns: number; // Projected annual returns (%)
}
```

**Use Cases**:
- Monitoring parameter optimization progress
- Comparing strategy variants
- Identifying optimal parameter combinations
- Analyzing trade-offs between metrics
- Debugging optimizer convergence

---

## Data Persistence

All files use append-only writes. Each service writes events in real-time as they occur.

**Implementation Details**:
- Files are written via `Report.writeData(reportType, data, searchOptions)`
- Each line is a complete JSON object terminated by newline
- No transaction support (atomic line writes only)
- Files grow unbounded (no automatic rotation)

## Reading JSONL Files

Standard JSONL parsing:

```typescript
import fs from 'fs';
import readline from 'readline';

async function readJSONL(filepath: string) {
  const fileStream = fs.createReadStream(filepath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const events = [];
  for await (const line of rl) {
    if (line.trim()) {
      events.push(JSON.parse(line));
    }
  }
  return events;
}
```

## Field Naming Conventions

All price fields follow consistent naming:
- `priceOpen`: Entry price
- `priceTakeProfit`: Take profit target
- `priceStopLoss`: Stop loss target
- `originalPriceTakeProfit`: Initial TP (before trailing modifications)
- `originalPriceStopLoss`: Initial SL (before trailing modifications)

All timestamp fields are Unix timestamps in milliseconds.

## Integration with IPublicSignalRow

Fields in these reports map directly to `IPublicSignalRow` interface:

```typescript
interface IPublicSignalRow extends ISignalRow {
  originalPriceStopLoss: number;
  originalPriceTakeProfit: number;
  totalExecuted: number;
}

interface ISignalRow extends ISignalDto {
  id: string;                  // Maps to signalId in reports
  priceOpen: number;
  exchangeName: string;
  strategyName: string;
  frameName: string;
  scheduledAt: number;
  pendingAt: number;
  symbol: string;
  _partial?: Array<{
    type: "profit" | "loss";
    percent: number;
    price: number;
  }>;
  note?: string;               // Inherited from ISignalDto
  priceTakeProfit: number;     // Inherited from ISignalDto
  priceStopLoss: number;       // Inherited from ISignalDto
}
```

## Common Query Patterns

### Find all closed trades for a symbol
```bash
grep '"action":"closed"' dump/report/heat.jsonl | grep '"symbol":"BTCUSDT"'
```

### Calculate total PNL from partial exits
```bash
grep '"action":"profit"' dump/report/partial.jsonl | jq -s 'map(.currentPrice) | add'
```

### Identify performance bottlenecks
```bash
cat dump/report/performance.jsonl | jq -s 'group_by(.metricType) | map({metric: .[0].metricType, avg_duration: (map(.duration) | add / length)})'
```

### Track optimization progress
```bash
tail -f dump/report/walker.jsonl | jq '{tested: .strategiesTested, total: .totalStrategies, best: .bestStrategy, metric: .bestMetric}'
```

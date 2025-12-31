---
title: design/06_execution_modes
group: design
---

# Execution Modes

This page describes the three execution modes available in backtest-kit: **Backtest**, **Live**, and **Walker**. Each mode provides distinct behavior for data handling, state persistence, and execution flow. Understanding these modes is essential for choosing the correct execution strategy for different use cases.

For information about signal lifecycle states within these modes, see [Signal Lifecycle Overview](./07_Signal_Lifecycle_Overview.md). For details on preventing look-ahead bias during backtesting, see [Temporal Isolation and Look-Ahead Prevention](./09_Temporal_Isolation_and_Look-Ahead_Prevention.md).

---

## Overview

backtest-kit supports three execution modes that determine how strategies process market data and manage state:

| Mode | Data Source | Time Progression | Persistence | Primary Use Case |
|------|-------------|------------------|-------------|------------------|
| **Backtest** | Historical candles from `IFrameSchema` | Fast-forward through timeframes | None (in-memory only) | Strategy validation, parameter optimization |
| **Live** | Real-time market data via `Date.now()` | Natural clock progression | Full crash recovery | Production trading with fault tolerance |
| **Walker** | Historical candles (delegates to Backtest) | Fast-forward through timeframes | None (in-memory only) | A/B testing multiple strategies |

The execution mode is determined by the `backtest` boolean flag in `IExecutionContext`, which propagates throughout the system via `ExecutionContextService`.


---

## Backtest Mode

### Purpose

Backtest mode simulates strategy execution against historical market data to evaluate performance without risking capital. This mode processes a predefined timeframe at maximum speed, yielding closed signals with calculated PnL for analysis.

### Execution Flow

![Mermaid Diagram](./diagrams/06_Execution_Modes_0.svg)

**Diagram: Backtest Mode Execution Flow**

### Key Characteristics

1. **Timeframe-Driven Iteration**: `FrameCoreService.getTimeframe()` generates an array of timestamps based on `IFrameSchema` configuration (start date, end date, interval). Backtest logic iterates through this array sequentially.

2. **Fast-Forward Simulation**: Unlike live mode which waits for real time to pass, backtest processes all timeframes immediately. The `ClientStrategy.backtest()` method simulates signal lifecycle through candle-level processing.

3. **No Persistence**: State is not written to disk. All signal data exists only in memory for the duration of the backtest. This eliminates I/O overhead and maximizes simulation speed.

4. **Context Propagation**: `ExecutionContextService` sets `backtest: true` in `IExecutionContext`. This flag affects:
   - Strategy instance selection in `StrategyConnectionService.getStrategy()` (memoized separately for backtest vs live)
   - Risk instance selection in `RiskConnectionService.getRisk()` (separate instances for mode isolation)
   - Persistence adapter behavior (no-op in backtest mode)

5. **Event Emission**: Signals emit to both `signalEmitter` (all modes) and `signalBacktestEmitter` (backtest-only). Progress updates emit to `progressBacktestEmitter`.

### Code Entry Points

| Class/Function | Location | Purpose |
|----------------|----------|---------|
| `BacktestUtils` | [src/classes/Backtest.ts:359-600]() | Public API singleton |
| `BacktestInstance` | [src/classes/Backtest.ts:74-338]() | Per-symbol-strategy instance |
| `BacktestCommandService.run()` | Service layer | Orchestrates backtest execution |
| `BacktestLogicPrivateService` | Service layer | Core backtest algorithm |
| `ClientStrategy.backtest()` | Client layer | Signal simulation per timestamp |

### Usage Example

```typescript
import { Backtest } from "backtest-kit";

// Synchronous iteration - consumes results
for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "2024-jan"
})) {
  if (result.action === "closed") {
    console.log(`PNL: ${result.pnl.pnlPercentage}%`);
  }
}

// Background execution - non-blocking
const cancel = Backtest.background("ETHUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "2024-jan"
});

// Stop execution
cancel();
```


---

## Live Mode

### Purpose

Live mode executes strategies against real-time market data with full crash recovery capabilities. This mode is designed for production trading environments where process reliability is critical.

### Execution Flow

![Mermaid Diagram](./diagrams/06_Execution_Modes_1.svg)

**Diagram: Live Mode Execution Flow with Crash Recovery**

### Key Characteristics

1. **Infinite Loop Execution**: `LiveLogicPrivateService` runs an infinite `while(true)` loop that calls `ClientStrategy.tick()` at regular intervals (controlled by `TICK_TTL` constant). Loop continues until explicitly stopped via `Live.stop()`.

2. **Real-Time Timestamps**: Uses `Date.now()` to generate current timestamps for `ExecutionContext.when`. Exchange queries fetch most recent candle data relative to current time.

3. **Crash Recovery System**: State is persisted to disk after every tick using atomic file writes:
   - **Signal State**: `PersistSignalAdapter` writes to `./dump/data/signal/{strategy}/{symbol}.json`
   - **Risk State**: `PersistRiskAdapter` writes to `./dump/data/risk/{riskName}.json`
   - **Schedule State**: `PersistScheduleAdapter` writes to `./dump/data/schedule/{strategy}/{symbol}.json`
   - **Partial State**: `PersistPartialAdapter` writes to `./dump/data/partial/{strategy}/{symbol}.json`

4. **Initialization Recovery**: On startup, `ClientStrategy.waitForInit()` loads persisted state from disk before processing first tick. This ensures seamless continuation after crashes or restarts.

5. **Atomic Write Pattern**: All persistence uses `PersistBase.writeFileAtomic()` which writes to temporary file then renames atomically. This guarantees either old state or new state is visible, never partial/corrupted data.

6. **Context Propagation**: `ExecutionContextService` sets `backtest: false` in `IExecutionContext`. This activates persistence layer and uses separate strategy/risk instances from backtest mode.

7. **Event Emission**: Signals emit to both `signalEmitter` (all modes) and `signalLiveEmitter` (live-only). Completion emits to `doneLiveSubject`.

### Code Entry Points

| Class/Function | Location | Purpose |
|----------------|----------|---------|
| `LiveUtils` | [src/classes/Live.ts:376-613]() | Public API singleton |
| `LiveInstance` | [src/classes/Live.ts:79-345]() | Per-symbol-strategy instance |
| `LiveCommandService.run()` | Service layer | Orchestrates infinite loop |
| `LiveLogicPrivateService` | Service layer | Core live trading algorithm |
| `ClientStrategy.tick()` | Client layer | Process single market tick |
| `ClientStrategy.waitForInit()` | Client layer | Load state from disk |
| `PersistSignalAdapter` | [src/classes/Persist.ts]() | Signal persistence |
| `PersistRiskAdapter` | [src/classes/Persist.ts]() | Risk persistence |

### Crash Recovery Example

```typescript
import { Live } from "backtest-kit";

// Start live trading - state saved to disk after each tick
const cancel = Live.background("BTCUSDT", {
  strategyName: "production-v1",
  exchangeName: "binance"
});

// Process crashes (power loss, SIGKILL, OOM)
// ... time passes ...

// Restart process - state automatically recovered
Live.background("BTCUSDT", {
  strategyName: "production-v1",
  exchangeName: "binance"
});
// Active signals continue monitoring TP/SL exactly where they left off
// Scheduled signals wait for price activation
// Risk limits reflect actual portfolio state
```

### Persistence File Structure

```
./dump/data/
├── signal/
│   └── production-v1/
│       └── BTCUSDT.json          # Active pending signal
├── risk/
│   └── default-risk.json         # Active positions across all strategies
├── schedule/
│   └── production-v1/
│       └── BTCUSDT.json          # Scheduled signals awaiting activation
└── partial/
    └── production-v1/
        └── BTCUSDT.json          # Profit/loss milestone tracking
```


---

## Walker Mode

### Purpose

Walker mode enables A/B testing of multiple strategies on the same symbol and timeframe. It executes each strategy sequentially as a backtest, collects performance metrics, and ranks strategies by a specified metric (default: `sharpeRatio`).

### Execution Flow

![Mermaid Diagram](./diagrams/06_Execution_Modes_2.svg)

**Diagram: Walker Mode Strategy Comparison Flow**

### Key Characteristics

1. **Sequential Strategy Execution**: Walker iterates through `IWalkerSchema.strategies` array, running a full backtest for each strategy before moving to the next. This ensures fair comparison under identical market conditions.

2. **Metric-Based Ranking**: After each strategy completes, Walker extracts the configured metric (e.g., `sharpeRatio`, `totalPnl`, `winRate`) from `BacktestMarkdownService.getData()`. Strategies are ranked in descending order (higher is better for all metrics).

3. **Shared Timeframe**: All strategies use the same `exchangeName` and `frameName` from `IWalkerSchema`. This guarantees identical market data and time periods for comparison.

4. **Backtest Mode Delegation**: Walker internally uses backtest mode (`backtest: true`) for all strategy executions. No persistence occurs - all state is in-memory.

5. **Progress Tracking**: Walker emits progress after each strategy completes via `walkerEmitter` and `progressWalkerEmitter`. Events include current best strategy and metric value.

6. **State Isolation**: Each strategy execution clears previous state via `StrategyCoreService.clear()` and `RiskGlobalService.clear()` to prevent data contamination between runs.

7. **Multiple Walker Support**: `walkerStopSubject` includes `walkerName` field to support stopping specific walkers when multiple run on the same symbol simultaneously.

### Code Entry Points

| Class/Function | Location | Purpose |
|----------------|----------|---------|
| `WalkerUtils` | [src/classes/Walker.ts:460-855]() | Public API singleton |
| `WalkerInstance` | [src/classes/Walker.ts:84-439]() | Per-symbol-walker instance |
| `WalkerCommandService.run()` | Service layer | Orchestrates walker execution |
| `WalkerLogicPrivateService` | Service layer | Core walker algorithm |
| `WalkerMarkdownService` | Service layer | Comparison report generation |
| `IWalkerSchema` | [types.d.ts:956-971]() | Walker configuration interface |
| `WalkerMetric` | [types.d.ts:951]() | Available ranking metrics |

### Usage Example

```typescript
import { Walker } from "backtest-kit";

// Configure walker to compare 3 strategies
addWalker({
  walkerName: "strategy-comparison",
  exchangeName: "binance",
  frameName: "2024-q1",
  strategies: ["conservative", "aggressive", "hybrid"],
  metric: "sharpeRatio" // Default, optional
});

// Run comparison
for await (const progress of Walker.run("BTCUSDT", {
  walkerName: "strategy-comparison"
})) {
  console.log(`Tested: ${progress.strategiesTested}/${progress.totalStrategies}`);
  console.log(`Best: ${progress.bestStrategy} (${progress.bestMetric})`);
}

// Get final results
const results = await Walker.getData("BTCUSDT", "strategy-comparison");
console.log(`Winner: ${results.bestStrategy}`);
console.log(`Sharpe Ratio: ${results.bestMetric}`);
```

### Comparison Report

Walker generates markdown reports showing:
- Strategy ranking table with all metrics
- Best performer highlighted
- Individual strategy PNL details
- Statistical comparison


---

## Mode Selection and Context Propagation

### Execution Context Service

The `backtest` flag in `IExecutionContext` determines execution mode throughout the system. This flag propagates via `ExecutionContextService` using `AsyncLocalStorage` for implicit context passing.

![Mermaid Diagram](./diagrams/06_Execution_Modes_3.svg)

**Diagram: Context Propagation and Mode Selection**

### Memoization Strategy

`StrategyConnectionService.getStrategy()` and `RiskConnectionService.getRisk()` use memoized factories with composite keys including the `backtest` flag:

```typescript
// Strategy instances memoized by: symbol:strategyName:backtest
"BTCUSDT:my-strategy:backtest" // Backtest mode instance
"BTCUSDT:my-strategy:live"     // Live mode instance

// Risk instances memoized by: riskName:backtest
"default-risk:backtest"        // Backtest mode instance
"default-risk:live"            // Live mode instance
```

This ensures complete isolation between modes - they never share state or interfere with each other.

### Mode Determination Flow

| API Call | `backtest` Flag | Persistence | Timeframe Source |
|----------|----------------|-------------|------------------|
| `Backtest.run()` | `true` | Disabled | `IFrameSchema` via `FrameCoreService` |
| `Live.run()` | `false` | Enabled | `Date.now()` real-time |
| `Walker.run()` | `true` (delegates to backtest) | Disabled | `IFrameSchema` via `FrameCoreService` |


---

## Comparison Table

| Feature | Backtest Mode | Live Mode | Walker Mode |
|---------|---------------|-----------|-------------|
| **Data Source** | Historical candles from `IFrameSchema` | Real-time via `Date.now()` | Historical candles (delegates to backtest) |
| **Time Progression** | Fast-forward through timeframe array | Natural clock progression with sleep intervals | Fast-forward per strategy |
| **Execution Pattern** | Finite loop (start to end date) | Infinite loop (`while(true)`) | Sequential strategy backtests |
| **Persistence** | None (in-memory only) | Full atomic writes after each tick | None (in-memory only) |
| **Crash Recovery** | N/A (no persistence) | Full recovery via `waitForInit()` | N/A (no persistence) |
| **Signal Emission** | `signalBacktestEmitter` + `signalEmitter` | `signalLiveEmitter` + `signalEmitter` | `signalBacktestEmitter` + `signalEmitter` |
| **Progress Events** | `progressBacktestEmitter` | None (continuous) | `progressWalkerEmitter` + `walkerEmitter` |
| **Primary Output** | `IStrategyBacktestResult[]` (closed signals) | `IStrategyTickResult` stream (opened + closed) | `WalkerCompleteContract` (strategy rankings) |
| **Instance Memoization** | `symbol:strategy:backtest` | `symbol:strategy:live` | `symbol:walker` |
| **Risk Instance** | `riskName:backtest` | `riskName:live` | `riskName:backtest` |
| **State Lifetime** | Duration of backtest execution | Until process stops or crashes | Duration of walker execution |
| **Typical Duration** | Seconds to minutes | Hours to days (continuous) | Minutes to hours (multiple backtests) |
| **Use Case** | Strategy validation, parameter tuning | Production trading | A/B testing, optimization |


---

## Choosing the Right Mode

### Decision Matrix

![Mermaid Diagram](./diagrams/06_Execution_Modes_4.svg)

**Diagram: Execution Mode Selection Guide**

### Mode-Specific Considerations

**Use Backtest Mode when:**
- Validating strategy logic against historical data
- Optimizing strategy parameters (take profit, stop loss, entry conditions)
- Running rapid iterations during development
- Persistence and crash recovery are not required
- Speed is prioritized over real-time execution

**Use Live Mode when:**
- Executing strategies with real capital in production
- Crash recovery is essential (prevent losing track of open positions)
- Real-time market data is required
- System must survive process restarts without manual intervention
- Audit trail of all state changes is needed

**Use Walker Mode when:**
- Comparing multiple strategy variants on identical data
- Performing A/B testing across different approaches
- Ranking strategies by specific metrics (Sharpe ratio, win rate, total PnL)
- Testing sensitivity to market conditions across multiple timeframes
- Need automated best-performer selection

### Common Patterns

**Development → Production Workflow:**
```typescript
// 1. Development: Backtest on historical data
await Backtest.run("BTCUSDT", {
  strategyName: "v1",
  exchangeName: "binance",
  frameName: "2024-q1"
});

// 2. Optimization: Compare variants with Walker
await Walker.run("BTCUSDT", {
  walkerName: "v1-variants"
});

// 3. Production: Deploy best performer in Live mode
Live.background("BTCUSDT", {
  strategyName: "v1-optimized",
  exchangeName: "binance"
});
```

**Multi-Symbol Live Trading:**
```typescript
// Run multiple Live instances simultaneously (each with own state)
const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];

symbols.forEach(symbol => {
  Live.background(symbol, {
    strategyName: "universal-v2",
    exchangeName: "binance"
  });
});
// Each symbol maintains separate persistence files
// Crash recovery works independently per symbol
```

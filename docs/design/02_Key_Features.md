---
title: design/02_key_features
group: design
---

# Key Features

This page provides a comprehensive technical reference of backtest-kit's core capabilities. These features enable production-grade backtesting and live trading with enterprise-level reliability, performance, and extensibility.

For installation and setup instructions, see [Installation and Setup](./03_Installation_and_Setup.md). For hands-on examples, see [Quick Start Guide](./04_Quick_Start_Guide.md). For detailed architecture documentation, see [Architecture](./10_Architecture.md).

---

## Execution System Features

### Multi-Mode Execution Architecture

The framework supports three distinct execution modes that share identical strategy code through context propagation:

![Mermaid Diagram](./diagrams/02_Key_Features_0.svg)


**Backtest Mode** processes historical data deterministically using async generators. It fast-forwards through active signals for performance optimization, yielding only closed/cancelled results.

**Live Mode** operates in real-time with crash recovery, polling at 1-minute intervals (`TICK_TTL`). It persists state atomically to disk after every signal change.

**Walker Mode** orchestrates sequential backtests for multiple strategies, enabling A/B testing and metric-based ranking.

Implementation:
- [src/services/logic/BacktestLogicPrivateService.ts]()
- [src/services/logic/LiveLogicPrivateService.ts]()
- [src/services/logic/WalkerLogicPrivateService.ts]()

### Async Generator Streaming

All execution modes use async generators (`async function*`) to stream results without memory accumulation:

| Mode | Generator Type | Memory Profile |
|------|---------------|----------------|
| Backtest | `AsyncGenerator<IStrategyBacktestResult>` | O(1) per timeframe |
| Live | `AsyncGenerator<IStrategyTickResult>` | O(1) per tick |
| Walker | `AsyncGenerator<WalkerContract>` | O(n) where n = strategies |

This architecture enables processing years of historical data without loading everything into memory, and allows early termination via `break` statements in consumer code.


### Graceful Shutdown

All execution modes support programmatic stopping with graceful cleanup:

```typescript
// Stop methods wait for active signals to complete
await Backtest.stop("BTCUSDT", "strategy-name");
await Live.stop("BTCUSDT", "strategy-name");
await Walker.stop("BTCUSDT", "walker-name");
```

**Shutdown behavior:**
- Current signal completes execution (callbacks fire normally)
- No new signals generated after stop
- Completion events (`listenDoneBacktest`, `listenDoneLive`) fire when complete
- Persisted state remains intact for resume on restart


---

## Data Integrity & Persistence

### Crash-Safe State Persistence

Live trading mode uses atomic file writes with automatic recovery to ensure no duplicate signals or lost state after process crashes:

![Mermaid Diagram](./diagrams/02_Key_Features_1.svg)


The persistence layer uses a base class (`PersistBase`) that can be extended for custom backends:

| Default | Custom Options |
|---------|----------------|
| File-based atomic writes | Redis (high-performance distributed) |
| JSON serialization | MongoDB (complex queries, analytics) |
| `./logs/data/` directory | PostgreSQL (relational, ACID) |
| No external dependencies | Any storage implementing `PersistBase` interface |

Implementation details:
- [src/base/Persist.base.ts]() - Base class for persistence operations
- [src/adapters/PersistSignalAdapter.ts]() - Signal state persistence
- [src/adapters/PersistRiskAdapter.ts]() - Risk management persistence
- [src/adapters/PersistScheduleAdapter.ts]() - Scheduled signal persistence


### Pluggable Persistence Adapters

The framework allows replacing default file-based persistence with custom backends:

```typescript
// Register custom adapter BEFORE running strategies
PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);
```

Custom adapters must implement the `PersistBase` interface:

| Method | Purpose |
|--------|---------|
| `waitForInit(initial: boolean)` | Initialize connection/storage |
| `readValue<T>(entityId)` | Read entity by ID |
| `hasValue(entityId)` | Check entity existence |
| `writeValue<T>(entityId, entity)` | Write/update entity |
| `removeValue(entityId)` | Delete entity |
| `removeAll()` | Clear all entities |
| `values<T>()` | Async iterator over all values |
| `keys()` | Async iterator over all IDs |


### Comprehensive Signal Validation

Signals are validated before execution to prevent invalid trades:

![Mermaid Diagram](./diagrams/02_Key_Features_2.svg)


Validation implementation in [src/client/Strategy.client.ts]() uses the `VALIDATE_SIGNAL_FN` constant with configurable parameters from `GLOBAL_CONFIG`.

---

## Signal Lifecycle Management

### Type-Safe State Machine

The signal lifecycle is implemented as a discriminated union with compile-time type safety:

![Mermaid Diagram](./diagrams/02_Key_Features_3.svg)


TypeScript discriminated union types ensure type safety at compile time:

```typescript
type IStrategyTickResult = 
  | IStrategyTickResultIdle
  | IStrategyTickResultScheduled
  | IStrategyTickResultOpened
  | IStrategyTickResultActive
  | IStrategyTickResultClosed
  | IStrategyTickResultCancelled;
```

Each variant has a unique `action` field used for type narrowing in consumer code.

Implementation: [src/interfaces/StrategyTickResult.interface.ts]()


### Interval Throttling

Strategies define a minimum interval between `getSignal()` calls to prevent signal spam:

| Interval | Minutes | Use Case |
|----------|---------|----------|
| `"1m"` | 1 | High-frequency scalping |
| `"3m"` | 3 | Short-term signals |
| `"5m"` | 5 | Standard intraday |
| `"15m"` | 15 | Medium-term swing |
| `"30m"` | 30 | Position trading |
| `"1h"` | 60 | Long-term strategies |

The throttling is enforced by comparing the last signal timestamp with the configured interval. Implementation in [src/client/Strategy.client.ts]().


### Scheduled Signal Activation

Signals with `priceOpen` defined become scheduled (limit orders) waiting for price activation:

**Scheduled signal behavior:**
- Monitors market price every tick/candle
- Activates when price reaches `priceOpen`
- Cancels if `priceStopLoss` hit before activation
- Cancels after timeout (`CC_SCHEDULE_AWAIT_MINUTES`, default 120 minutes)

**Edge case handling:**
- If price passes through both `priceOpen` and `priceStopLoss` on same candle, activation takes priority (signal opens then immediately closes by SL)
- Backtest mode checks candle high/low for intra-candle price movements
- Live mode uses VWAP at configured intervals


---

## Performance & Memory Optimization

### VWAP Pricing Model

All entry/exit decisions use Volume-Weighted Average Price from the last 5 one-minute candles for realistic simulation:

![Mermaid Diagram](./diagrams/02_Key_Features_4.svg)


The VWAP calculation ensures backtest results match live execution behavior. Configured via:
- `CC_AVERAGE_PRICE_CANDLE_COUNT` - Number of candles (default: 5)
- `CC_AVERAGE_PRICE_CANDLE_INTERVAL` - Candle interval (default: "1m")

Implementation: [src/helpers/getAveragePrice.ts]()

### Memory-Efficient Streaming

The async generator architecture processes data without accumulation:

| Operation | Memory Usage | Scaling |
|-----------|--------------|---------|
| Backtest 1 year of 1m data | O(1) | Constant per timeframe |
| Live trading 24/7 | O(1) | Constant per tick |
| Walker with 100 strategies | O(n) | Linear in strategy count |
| Heatmap across 50 symbols | O(n) | Linear in symbol count |

**Backtest fast-forward optimization:**
When a signal opens, the backtest skips ahead to the estimated close time rather than processing every timeframe. This reduces execution time by ~10-100x for strategies with long signal durations.


### Memoized Service Instances

The dependency injection system memoizes service instances by configuration key:

![Mermaid Diagram](./diagrams/02_Key_Features_5.svg)


This ensures one instance per unique combination of:
- Symbol + Strategy name
- Symbol + Exchange name
- Symbol + Frame name

Implementation: [src/services/connection/]()

### Bounded Event Queue

The `LiveMarkdownService` uses a bounded queue (`MAX_EVENTS = 25`) to prevent memory leaks during long-running live sessions:

**Queue behavior:**
- Stores last 25 events maximum
- Drops oldest events when full
- Preserves recent history for reporting
- Prevents unbounded growth


---

## Analytics & Reporting

### Comprehensive Statistics

The framework calculates extensive performance metrics for backtests and live trading:

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Win Rate** | `(wins / total) × 100` | Percentage of profitable trades |
| **Average PNL** | `Σ(pnl) / count` | Expected return per trade |
| **Total PNL** | `Σ(pnl)` | Cumulative return |
| **Standard Deviation** | `√(Σ(pnl - avg)² / (n-1))` | Volatility measure |
| **Sharpe Ratio** | `avgPnl / stdDev` | Risk-adjusted return |
| **Annualized Sharpe** | `sharpe × √365` | Yearly risk-adjusted return |
| **Certainty Ratio** | `avgWin / |avgLoss|` | Win/loss magnitude ratio |
| **Expected Yearly Returns** | Based on avg duration & PNL | Projected annual performance |

**Safe math:** All calculations return `null` for invalid results (NaN, Infinity) rather than propagating unsafe values.


Implementation: [src/services/markdown/]()

### Auto-Generated Markdown Reports

Nine types of markdown reports are automatically generated:

![Mermaid Diagram](./diagrams/02_Key_Features_6.svg)


Reports include:
- Summary statistics tables
- Detailed signal logs
- Trade-by-trade breakdown
- Performance metrics
- Configuration snapshots

Access via:
- `Backtest.dump(strategyName)` - [README.md:188]()
- `Live.dump(strategyName)` - [README.md:413]()
- `Walker.dump(symbol, walkerName)` - [README.md:467]()
- `Heat.dump(strategyName)` - [README.md:559]()

### Portfolio Heatmap Analytics

Multi-symbol performance analysis with extended metrics:

```typescript
interface IHeatmapRow {
  symbol: string;
  totalPnl: number | null;
  sharpeRatio: number | null;
  profitFactor: number | null;    // wins / losses ratio
  expectancy: number | null;       // (winRate × avgWin) - (lossRate × avgLoss)
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  maxDrawdown: number | null;
  maxWinStreak: number;           // consecutive wins
  maxLossStreak: number;          // consecutive losses
  totalTrades: number;
}
```

**Sorting:** Symbols sorted by Sharpe Ratio descending (best performers first)

**Portfolio metrics:** Aggregated statistics across all symbols


### Partial Profit/Loss Tracking

The framework tracks milestone events as price moves toward TP or SL:

| Milestone Type | Thresholds |
|----------------|------------|
| **Partial Profit** | 10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90% toward TP |
| **Partial Loss** | -40%, -80% toward SL |

These events fire callbacks and emit to listeners, enabling:
- Risk management alerts
- Position adjustment
- Performance analysis
- Real-time monitoring


### Performance Profiling

Built-in execution time tracking with aggregated statistics:

| Statistic | Description |
|-----------|-------------|
| **Average** | Mean execution time |
| **Minimum** | Fastest execution |
| **Maximum** | Slowest execution |
| **StdDev** | Execution time variance |
| **P95** | 95th percentile |
| **P99** | 99th percentile |

Helps identify bottlenecks in:
- Exchange API calls
- Signal generation logic
- Validation functions
- Persistence operations


---

## Risk & Position Management

### Portfolio-Level Risk Controls

The risk management system coordinates across strategies and symbols:

![Mermaid Diagram](./diagrams/02_Key_Features_7.svg)


**Validation context provided to each function:**

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Trading pair |
| `strategyName` | string | Strategy identifier |
| `exchangeName` | string | Exchange identifier |
| `currentPrice` | number | Current market price |
| `timestamp` | number | Current timestamp |
| `activePositionCount` | number | Total open positions |
| `activePositions` | IActivePosition[] | Array of all active positions |

**Fail-fast pattern:** Validations execute sequentially; first failure stops execution and rejects signal.

Implementation: [src/client/Risk.client.ts]()


### Position Sizing Calculator

Three position sizing methods with configurable constraints:

![Mermaid Diagram](./diagrams/02_Key_Features_8.svg)


**When to use each method:**

1. **Fixed Percentage** - Simple, consistent risk per trade. Best for beginners and conservative strategies.

2. **Kelly Criterion** - Optimal sizing based on edge (win rate × win/loss ratio). Best for strategies with proven statistical advantage. Use fractional Kelly (0.25-0.5) to reduce volatility.

3. **ATR-Based** - Volatility-adjusted sizing. Position size scales inversely with market volatility. Best for swing trading and volatile markets.

Implementation: [src/utils/PositionSize.utils.ts]()

### Active Position Tracking

Risk profiles can inspect all active positions for cross-strategy coordination:

```typescript
addRisk({
  riskName: "coordinator",
  validations: [
    ({ activePositions, strategyName, symbol }) => {
      // Count positions for specific strategy
      const strategyPositions = activePositions.filter(
        pos => pos.strategyName === strategyName
      );
      
      // Check for symbol conflicts
      const symbolPositions = activePositions.filter(
        pos => pos.symbol === symbol
      );
      
      // Custom validation logic
      if (strategyPositions.length >= 2) {
        throw new Error("Max 2 positions per strategy");
      }
    }
  ]
});
```


---

## Extensibility & Integration

### Pluggable Exchange Integration

Exchange adapters provide market data without requiring pre-downloaded datasets:

| Method | Purpose | Return Type |
|--------|---------|-------------|
| `getCandles()` | Fetch OHLCV data | `Promise<ICandle[]>` |
| `formatPrice()` | Format price for exchange | `Promise<string>` |
| `formatQuantity()` | Format quantity for exchange | `Promise<string>` |

**Zero data download:** Unlike Freqtrade and similar frameworks, backtest-kit doesn't require downloading gigabytes of historical data. You can plug any data source: CCXT for live data, databases for fast backtesting, or custom APIs.


Example integrations:
- CCXT for real-time exchange data
- PostgreSQL for pre-loaded historical data
- Custom REST APIs
- CSV file readers
- Mock data generators for testing

Implementation: [src/client/Exchange.client.ts]()

### Dependency Inversion & Lazy Loading

Components are registered by name and lazily instantiated at runtime:

![Mermaid Diagram](./diagrams/02_Key_Features_9.svg)


**Benefits:**
- Modular design: Components in separate modules
- String-based coupling: Type-safe enums for names
- Runtime flexibility: Register/unregister dynamically
- Testability: Mock components easily
- Memory efficiency: Only instantiate what's used

**Schema reflection:** Use `listExchanges()`, `listStrategies()`, `listFrames()` for runtime introspection.


### Context Propagation

Async context propagation eliminates need for explicit parameter passing:

![Mermaid Diagram](./diagrams/02_Key_Features_10.svg)


This "time-travel context" enables the same strategy code to:
- Run in backtest with historical `when` timestamp
- Run in live with `new Date()` timestamp
- Access correct exchange/frame without explicit passing

Implementation:
- [src/services/context/ExecutionContextService.ts]()
- [src/services/context/MethodContextService.ts]()

Based on `di-scoped` package with async_hooks-style scoping.

---

## Testing & Reliability

### Comprehensive Test Suite

The framework includes extensive test coverage across multiple dimensions:

| Test Category | File | Coverage |
|---------------|------|----------|
| **Exchange Functions** | [test/spec/exchange.test.mjs]() | VWAP calculation, candle fetching, price formatting |
| **Event System** | [test/spec/event.test.mjs]() | Listener coordination, async event handling |
| **Signal Validation** | [test/spec/validation.test.mjs]() | Price logic, timestamp validation, position validation |
| **PNL Calculation** | [test/spec/pnl.test.mjs]() | Fees, slippage, realistic simulations |
| **Backtest Mode** | [test/spec/backtest.test.mjs]() | Lifecycle, early termination, close reasons |
| **Callbacks** | [test/spec/callbacks.test.mjs]() | Parameter passing, backtest flag verification |
| **Reports** | [test/spec/report.test.mjs]() | Statistics, markdown formatting |
| **Live Mode** | [test/spec/live.test.mjs]() | Real-time execution, crash recovery |
| **Scheduled Signals** | [test/spec/scheduled.test.mjs]() | Activation, cancellation, timeout |
| **Risk Management** | [test/spec/risk.test.mjs]() | Validation chain, position tracking |
| **Position Sizing** | [test/spec/sizing.test.mjs]() | Fixed %, Kelly, ATR methods |
| **Walker Mode** | [test/spec/walker.test.mjs]() | Strategy comparison, ranking |
| **Heatmap** | [test/spec/heat.test.mjs]() | Portfolio metrics, cross-symbol analysis |
| **Performance** | [test/spec/performance.test.mjs]() | Execution timing, bottleneck detection |
| **Optimizer** | [test/spec/optimizer.test.mjs]() | AI strategy generation, LLM integration |


### Edge Case Defense Tests

Critical defensive tests ensure correct behavior in complex scenarios:

![Mermaid Diagram](./diagrams/02_Key_Features_11.svg)


These tests prove that the framework handles edge cases correctly and prevents financial loss from logic bugs.

### Safe Math & Robustness

All statistical calculations are protected against unsafe numeric values:

**Unsafe value detection:**
- `NaN` (invalid calculations)
- `Infinity` / `-Infinity` (division by zero)
- Invalid inputs (negative counts, empty arrays)

**Handling:** Return `null` instead of propagating unsafe values through calculations.

**Benefits:**
- Reports show "N/A" for invalid metrics instead of crashing
- Partial data still useful (e.g., total PNL valid even if Sharpe ratio invalid)
- No silent errors from mathematical edge cases


Implementation in statistics calculation functions: [src/services/markdown/]()

---

## AI-Powered Features

### Strategy Optimizer

LLM-powered strategy generation from historical data:

![Mermaid Diagram](./diagrams/02_Key_Features_12.svg)


**Optimizer workflow:**
1. Configure training date ranges and data sources
2. Iterate through ranges, fetching multi-timeframe data
3. Format data as conversation history for LLM
4. Generate strategy logic using JSON schema constraints
5. Assemble complete executable code from templates
6. Test via Walker for automatic comparison

**Output structure:**
- Imports and helper functions
- Exchange configuration
- Frame definitions
- Generated strategy logic
- Walker configuration for testing

**Debug artifacts:** JSON conversation history saved to `./dump/strategy/` for analysis.

Implementation: [src/client/Optimizer.client.ts](), [src/services/template/OptimizerTemplateService.ts]()

---

## Summary Table

| Feature | Key Component | Wiki Reference |
|---------|---------------|----------------|
| Multi-mode execution | BacktestLogicPrivateService, LiveLogicPrivateService, WalkerLogicPrivateService | [Execution Modes](./06_Execution_Modes.md) |
| Crash-safe persistence | PersistSignalAdapter, PersistBase | [Signal Persistence](./52_Signal_Persistence.md) |
| Signal validation | VALIDATE_SIGNAL_FN, Risk validation chain | [Signal Generation and Validation](./50_Signal_Generation_and_Validation.md) |
| State machine | IStrategyTickResult discriminated union | [Signal States](./49_Signal_States.md) |
| VWAP pricing | getAveragePrice(), CC_AVERAGE_PRICE_* config | [Backtesting](./54_Backtesting.md) |
| Interval throttling | Strategy.interval, last signal timestamp check | [Signal Lifecycle Overview](./07_Signal_Lifecycle_Overview.md) |
| PNL calculation | calculatePnl(), CC_TRADE_FEE, CC_SLIPPAGE | [PnL Calculation](./53_PnL_Calculation.md) |
| Context propagation | ExecutionContextService, MethodContextService | [Context Propagation](./13_Context_Propagation.md) |
| Markdown reports | BacktestMarkdownService, LiveMarkdownService, etc. | [Markdown Report Generation](./72_Markdown_Report_Generation.md) |
| Performance profiling | PerformanceMarkdownService, PerformanceEmitter | [Performance Metrics](./73_Performance_Metrics.md) |
| Strategy comparison | WalkerLogicPrivateService | [Walker Mode](./63_Walker_Mode.md) |
| Portfolio heatmap | HeatMarkdownService | [Heatmap Analytics](./76_Heatmap_Analytics.md) |
| Position sizing | PositionSize utils (fixed/kelly/atr) | [Component Types](./24_Component_Schemas.md) |
| Risk management | ClientRisk, IRiskSchema validations | [Risk Management](./67_Risk_Management.md) |
| Pluggable exchanges | ClientExchange, IExchangeSchema | [Exchange Schemas](./26_Exchange_Schemas.md) |
| Pluggable persistence | PersistBase, custom adapters | [Custom Persistence Backends](./87_Custom_Persistence_Backends.md) |
| AI optimizer | ClientOptimizer, Ollama integration | [AI-Powered Strategy Optimization](./90_AI-Powered_Strategy_Optimization.md) |

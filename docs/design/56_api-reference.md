---
title: design/56_api-reference
group: design
---

# API Reference

This document provides a comprehensive reference to all public APIs exposed by Backtest Kit. It organizes functions, classes, interfaces, and types by functional area to help you navigate the framework's capabilities.

For detailed documentation on specific API categories, see:
- **[Global Functions](./56_api-reference.md)** - Configuration and registration functions (`addExchange`, `addStrategy`, etc.)
- **[Execution Classes API](./56_api-reference.md)** - Classes for running backtests, live trading, and strategy comparison
- **[Reporting Classes API](./56_api-reference.md)** - Classes for generating reports and accessing statistics
- **[Core Interfaces](./56_api-reference.md)** - Schema interfaces for defining strategies, exchanges, and other components
- **[Signal & Result Types](./56_api-reference.md)** - Types for trading signals and execution results
- **[Statistics & Contract Types](./56_api-reference.md)** - Types for performance metrics and event payloads
- **[Service Layer Interfaces](./56_api-reference.md)** - Internal service interfaces for advanced usage


---

## API Organization

The Backtest Kit API is organized into three layers:

| Layer | Purpose | Main Exports |
|-------|---------|--------------|
| **Configuration Layer** | System setup and component registration | `setConfig()`, `setLogger()`, `addExchange()`, `addStrategy()`, `addFrame()`, `addRisk()`, `addWalker()`, `addSizing()`, `addOptimizer()` |
| **Execution Layer** | Running backtests and live trading | `Backtest`, `Live`, `Walker`, `Optimizer` classes with `run()` and `background()` methods |
| **Monitoring Layer** | Event listeners and report generation | `listenSignal*()`, `listenDone*()`, `listenPartialProfit()`, `listenRisk()`, report classes (`Performance`, `Heat`, `Schedule`, `Partial`, `Risk`) |


---

## Public API Surface

The following diagram maps the public API to the main functional areas:

![Mermaid Diagram](./diagrams\56_api-reference_0.svg)


---

## Type Hierarchy

The following diagram shows how core types relate to each other:

![Mermaid Diagram](./diagrams\56_api-reference_1.svg)


---

## API Entry Points by Category

### Configuration & Setup

| Function | Purpose | Returns |
|----------|---------|---------|
| `setLogger(logger: ILogger)` | Configure custom logger implementation | `void` |
| `setConfig(config: Partial<GlobalConfig>)` | Set global configuration parameters | `void` |
| `getConfig()` | Retrieve current global configuration | `GlobalConfig` |
| `setColumns(columns: Partial<ColumnConfig>)` | Customize report column visibility | `void` |
| `getColumns()` | Retrieve current column configuration | `ColumnConfig` |


### Component Registration

| Function | Schema Type | Purpose |
|----------|-------------|---------|
| `addExchange(schema: IExchangeSchema)` | `IExchangeSchema` | Register data source for candles and pricing |
| `addStrategy(schema: IStrategySchema)` | `IStrategySchema` | Register trading strategy with signal generation logic |
| `addFrame(schema: IFrameSchema)` | `IFrameSchema` | Register timeframe for backtest period definition |
| `addRisk(schema: IRiskSchema)` | `IRiskSchema` | Register risk management validation rules |
| `addWalker(schema: IWalkerSchema)` | `IWalkerSchema` | Register strategy comparison configuration |
| `addSizing(schema: ISizingSchema)` | `ISizingSchema` | Register position sizing calculator |
| `addOptimizer(schema: IOptimizerSchema)` | `IOptimizerSchema` | Register LLM-powered strategy generator |


### Execution Classes

| Class | Methods | Purpose |
|-------|---------|---------|
| `Backtest` | `run()`, `background()`, `stop()`, `getData()`, `getReport()`, `dump()` | Historical simulation on defined timeframe |
| `Live` | `run()`, `background()`, `stop()`, `getData()`, `getReport()`, `dump()` | Real-time trading with crash recovery |
| `Walker` | `run()`, `background()`, `stop()`, `getData()`, `getReport()`, `dump()` | Multi-strategy comparison and ranking |
| `Optimizer` | `getData()`, `getCode()`, `dump()` | LLM-powered strategy generation |


### Event Listeners

| Function | Event Type | Purpose |
|----------|------------|---------|
| `listenSignal(fn)` | `IStrategyTickResult` | All signals (backtest + live) |
| `listenSignalBacktest(fn)` | `IStrategyTickResult` | Backtest signals only |
| `listenSignalLive(fn)` | `IStrategyTickResult` | Live trading signals only |
| `listenSignalOnce(filter, fn)` | `IStrategyTickResult` | Single filtered event |
| `listenDoneBacktest(fn)` | `DoneContract` | Backtest completion |
| `listenDoneLive(fn)` | `DoneContract` | Live trading completion |
| `listenDoneWalker(fn)` | `DoneContract` | Walker comparison completion |
| `listenBacktestProgress(fn)` | `ProgressBacktestContract` | Backtest progress percentage |
| `listenWalkerProgress(fn)` | `ProgressWalkerContract` | Walker strategy iteration progress |
| `listenPartialProfit(fn)` | `PartialProfitContract` | Profit milestone reached (10%, 20%, etc.) |
| `listenPartialLoss(fn)` | `PartialLossContract` | Loss milestone reached (-10%, -20%, etc.) |
| `listenRisk(fn)` | `RiskContract` | Signal rejected by risk validation |
| `listenPerformance(fn)` | `PerformanceContract` | Execution timing metrics |
| `listenError(fn)` | `Error` | Recoverable errors |
| `listenExit(fn)` | `Error` | Fatal errors |


---

## Event System Architecture

The following diagram shows how events flow through the system:

![Mermaid Diagram](./diagrams\56_api-reference_2.svg)


---

## Core Interface Relationships

The following diagram shows how schema interfaces relate to their runtime implementations:

![Mermaid Diagram](./diagrams\56_api-reference_3.svg)


---

## Method Signatures Summary

### Backtest Class

```typescript
class Backtest {
  // Async iterator (pull-based)
  static run(
    symbol: string,
    params: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): AsyncGenerator<IStrategyTickResult | ProgressBacktestContract>;

  // Background execution (push-based)
  static background(
    symbol: string,
    params: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): void;

  // Stop backtest (if not yet complete)
  static stop(symbol: string, strategyName: StrategyName): Promise<void>;

  // Get statistics model
  static getData(
    symbol: string,
    strategyName: StrategyName
  ): Promise<BacktestStatisticsModel>;

  // Get formatted markdown report
  static getReport(
    symbol: string,
    strategyName: StrategyName
  ): Promise<string>;

  // Write report to file system
  static dump(symbol: string, strategyName: StrategyName): Promise<void>;
}
```


### Live Class

```typescript
class Live {
  // Async iterator (infinite, until stopped)
  static run(
    symbol: string,
    params: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ): AsyncGenerator<IStrategyTickResult>;

  // Background execution (infinite loop)
  static background(
    symbol: string,
    params: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ): void;

  // Stop live trading gracefully
  static stop(symbol: string, strategyName: StrategyName): Promise<void>;

  // Get statistics model (includes active signals)
  static getData(
    symbol: string,
    strategyName: StrategyName
  ): Promise<LiveStatisticsModel>;

  // Get formatted markdown report
  static getReport(
    symbol: string,
    strategyName: StrategyName
  ): Promise<string>;

  // Write report to file system
  static dump(symbol: string, strategyName: StrategyName): Promise<void>;
}
```


### Walker Class

```typescript
class Walker {
  // Async iterator (yields progress per strategy)
  static run(
    symbol: string,
    params: {
      walkerName: WalkerName;
    }
  ): AsyncGenerator<WalkerContract | ProgressWalkerContract>;

  // Background execution
  static background(
    symbol: string,
    params: {
      walkerName: WalkerName;
    }
  ): void;

  // Stop walker comparison
  static stop(symbol: string, walkerName: WalkerName): Promise<void>;

  // Get comparison results
  static getData(
    symbol: string,
    walkerName: WalkerName
  ): Promise<WalkerStatisticsModel>;

  // Get formatted markdown report
  static getReport(symbol: string, walkerName: WalkerName): Promise<string>;

  // Write report to file system
  static dump(symbol: string, walkerName: WalkerName): Promise<void>;
}
```


---

## Discriminated Union Pattern for Results

All strategy execution methods return `IStrategyTickResult`, a discriminated union with `action` as the discriminator:

```typescript
type IStrategyTickResult =
  | IStrategyTickResultIdle        // action: "idle"
  | IStrategyTickResultScheduled   // action: "scheduled"
  | IStrategyTickResultOpened      // action: "opened"
  | IStrategyTickResultActive      // action: "active"
  | IStrategyTickResultClosed      // action: "closed"
  | IStrategyTickResultCancelled;  // action: "cancelled"
```

### Type Guards Example

```typescript
listenSignal((event) => {
  if (event.action === "closed") {
    // TypeScript knows: event is IStrategyTickResultClosed
    console.log(event.pnl.pnlPercentage);
    console.log(event.closeReason); // "take_profit" | "stop_loss" | "time_expired"
  } else if (event.action === "active") {
    // TypeScript knows: event is IStrategyTickResultActive
    console.log(event.percentTp); // Progress towards TP
    console.log(event.percentSl); // Progress towards SL
  } else if (event.action === "scheduled") {
    // TypeScript knows: event is IStrategyTickResultScheduled
    console.log(event.signal.priceOpen); // Entry price waiting for activation
  }
});
```


---

## Statistics Models

Each execution mode provides a statistics model with performance metrics:

### BacktestStatisticsModel

```typescript
interface BacktestStatisticsModel {
  signalList: IStrategyTickResultClosed[];  // All closed signals
  totalSignals: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;              // Percentage (0-100)
  avgPnl: number | null;               // Average PNL per signal
  totalPnl: number | null;             // Cumulative PNL
  stdDev: number | null;               // Standard deviation of returns
  sharpeRatio: number | null;          // avgPnl / stdDev
  annualizedSharpeRatio: number | null; // sharpeRatio × √365
  certaintyRatio: number | null;        // avgWin / |avgLoss|
  expectedYearlyReturns: number | null; // Extrapolated annual returns
}
```


### LiveStatisticsModel

Extends `BacktestStatisticsModel` with additional fields:

```typescript
interface LiveStatisticsModel extends BacktestStatisticsModel {
  activeSignals: ISignalRow[];        // Currently open positions
  idleCount: number;                  // Number of idle ticks
}
```


### WalkerStatisticsModel

```typescript
interface WalkerStatisticsModel {
  strategies: IWalkerStrategyResult[];  // Results for each tested strategy
  bestStrategy: StrategyName;           // Highest metric value
  metric: WalkerMetric;                 // Comparison metric used
}

interface IWalkerStrategyResult {
  strategyName: StrategyName;
  statistics: BacktestStatisticsModel;
  metricValue: number | null;           // Value of comparison metric
}
```


---

## Context Services

Backtest Kit uses `di-scoped` for ambient context propagation. Two context services provide implicit parameters:

### ExecutionContextService

Propagates runtime execution state:

```typescript
interface IExecutionContext {
  symbol: string;        // Trading pair (e.g., "BTCUSDT")
  when: Date;           // Current timestamp
  backtest: boolean;    // true = backtest, false = live
}
```

Functions like `getCandles()` automatically access this context without explicit parameters.


### MethodContextService

Propagates schema identifiers:

```typescript
interface IMethodContext {
  exchangeName: ExchangeName;
  strategyName: StrategyName;
  frameName: FrameName;
}
```

Connection services use this to route operations to correct schema instances.


---

## Persistence Adapters

Backtest Kit provides crash-safe persistence through abstract base class `PersistBase`:

```typescript
abstract class PersistBase<T> {
  abstract waitForInit(entityId: EntityId): Promise<void>;
  abstract persist(entityId: EntityId, data: T | null): Promise<void>;
  abstract load(entityId: EntityId): Promise<T | null>;
}
```

### Concrete Implementations

| Adapter | Purpose | Storage Format |
|---------|---------|----------------|
| `PersistSignalAdapter` | Active signals | `Record<signalId, SignalData>` |
| `PersistRiskAdapter` | Risk tracking state | `Record<riskKey, RiskData>` |
| `PersistScheduleAdapter` | Scheduled signals | `Record<signalId, ScheduleData>` |
| `PersistPartialAdapter` | Profit/loss milestones | `Record<signalId, PartialData>` |

All adapters use atomic file writes to `./persist/{entityId}.json` by default.


---

## Custom Implementations

### Custom Logger

Implement `ILogger` interface:

```typescript
import { setLogger, ILogger } from 'backtest-kit';

const myLogger: ILogger = {
  log: (topic, ...args) => console.log(`[LOG] ${topic}`, ...args),
  debug: (topic, ...args) => console.debug(`[DEBUG] ${topic}`, ...args),
  info: (topic, ...args) => console.info(`[INFO] ${topic}`, ...args),
  warn: (topic, ...args) => console.warn(`[WARN] ${topic}`, ...args),
};

setLogger(myLogger);
```


### Custom Persistence

Extend `PersistBase` for custom storage backends:

```typescript
import { PersistBase, EntityId } from 'backtest-kit';

class RedisPersistAdapter<T> extends PersistBase<T> {
  async waitForInit(entityId: EntityId): Promise<void> {
    // Connect to Redis
  }

  async persist(entityId: EntityId, data: T | null): Promise<void> {
    // Write to Redis
  }

  async load(entityId: EntityId): Promise<T | null> {
    // Read from Redis
  }
}
```


---

## Global Configuration

Configure framework defaults via `setConfig()`:

```typescript
import { setConfig, GlobalConfig } from 'backtest-kit';

setConfig({
  // Trading fees and slippage
  CC_PERCENT_FEE: 0.1,              // 0.1% per trade
  CC_PERCENT_SLIPPAGE: 0.1,         // 0.1% price impact

  // Signal validation
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3,  // TP must cover 2×fees + slippage
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 10.0,   // SL max 10% away
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 1440,     // 24 hours max

  // VWAP calculation
  CC_AVG_PRICE_CANDLES_COUNT: 5,    // Last 5 1-minute candles

  // Scheduled signal timeout
  CC_SCHEDULE_AWAIT_MINUTES: 120,   // 2 hours to activate

  // Candle data validation
  CC_DETECT_ANOMALY_PERCENT: 10.0,  // 10% price jump = anomaly
  CC_CHECK_LAST_N_MEDIAN_ANOMALIES: 5, // Check last 5 candles

  // Retry logic
  CC_GET_CANDLES_RETRY_COUNT: 3,
  CC_GET_CANDLES_RETRY_DELAY_MS: 1000,

  // Live trading
  CC_TICK_TTL_MS: 60_001,           // 1 minute + 1ms sleep
});
```


---

## Report Column Configuration

Customize markdown report columns:

```typescript
import { setColumns, ColumnConfig } from 'backtest-kit';

setColumns({
  backtest: {
    id: true,
    strategyName: true,
    symbol: true,
    position: true,
    priceOpen: true,
    priceTakeProfit: true,
    priceStopLoss: true,
    priceClose: true,
    closeReason: true,
    pnlPercentage: true,
    scheduledAt: false,      // Hide scheduled timestamp
    pendingAt: false,        // Hide pending timestamp
    closeTimestamp: true,
    minuteEstimatedTime: true,
  },
  // Similar configuration for live, walker, schedule, performance, etc.
});
```


---

## Advanced: Service Layer Access

For advanced use cases, the internal service layer is exposed via `lib` export:

```typescript
import { lib } from 'backtest-kit';

// Access service instances
lib.loggerService;
lib.strategyConnectionService;
lib.exchangeConnectionService;
lib.strategyCoreService;
lib.backtestLogicPrivateService;
// ... etc.
```

See **[Service Layer Interfaces](./56_api-reference.md)** for detailed service documentation.


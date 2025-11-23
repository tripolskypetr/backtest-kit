# Architecture

## Overview

Backtest-kit is a production-ready TypeScript framework for backtesting and live trading strategies. The architecture follows clean architecture principles with dependency injection, separation of concerns, crash-safe state persistence, and type-safe discriminated unions.

## Core Concepts

### 1. Signal Lifecycle

Signals have a strict lifecycle managed through discriminated union types:

- **idle** - No active signal
- **opened** - Signal just created with TP/SL/ETA parameters
- **active** - Signal is monitoring for TP/SL conditions
- **closed** - Signal completed with reason (time_expired | take_profit | stop_loss)

### 2. Execution Modes

The framework supports two execution modes:

- **Backtest Mode** (`backtest: true`) - Simulates trading with historical data
- **Live Mode** (`backtest: false`) - Real-time strategy execution with crash recovery

### 3. Price Calculation

All price calculations use **VWAP (Volume Weighted Average Price)**:
```typescript
const typicalPrice = (high + low + close) / 3;
const vwap = sumPriceVolume / totalVolume;
```

Uses last 5 1-minute candles for all entry/exit decisions.

### 4. Signal Validation

All signals are validated before execution in `GET_SIGNAL_FN`:

```typescript
const VALIDATE_SIGNAL_FN = (signal: ISignalRow): void => {
  // Validates:
  // 1. All prices must be positive (priceOpen, priceTakeProfit, priceStopLoss)
  // 2. Long position: priceTakeProfit > priceOpen AND priceStopLoss < priceOpen
  // 3. Short position: priceTakeProfit < priceOpen AND priceStopLoss > priceOpen
  // 4. Time parameters must be positive (minuteEstimatedTime, timestamp)

  // Throws error with detailed validation messages if invalid
};
```

Validation is wrapped in `trycatch` with `defaultValue: null`, so invalid signals are gracefully rejected without crashing.

### 5. Interval Throttling

Signal generation is throttled at the strategy level in `ClientStrategy.GET_SIGNAL_FN`:

```typescript
const INTERVAL_MINUTES: Record<SignalInterval, number> = {
  "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60
};

// Enforces minimum interval between getSignal calls
if (currentTime - self._lastSignalTimestamp < intervalMs) {
  return null;
}
self._lastSignalTimestamp = currentTime;
```

This guarantees that `getSignal` cannot be called more frequently than the strategy's configured interval, preventing signal spam.

## Architecture Layers

### Facade Layer (`src/classes/`)

Simplified API wrappers for convenient usage:
- **Backtest** - Singleton facade for backtest operations
  - `run(symbol, context)` - Stream backtest results
  - `background(symbol, context)` - Run without yielding, returns stop function
  - `getData(strategyName)` - Get backtest statistics
  - `getReport(strategyName)` - Get markdown report
  - `dump(strategyName, path?)` - Save report to disk
  - `clear(strategyName?)` - Clear accumulated data
- **Live** - Singleton facade for live trading
  - `run(symbol, context)` - Stream live results (infinite)
  - `background(symbol, context)` - Run without yielding, returns stop function
  - `getData(strategyName)` - Get live statistics
  - `getReport(strategyName)` - Get markdown report
  - `dump(strategyName, path?)` - Save report to disk
  - `clear(strategyName?)` - Clear accumulated data
- **Performance** - Singleton facade for performance profiling
  - `getData(strategyName)` - Get performance statistics with aggregated metrics
  - `getReport(strategyName)` - Get markdown report with bottleneck analysis
  - `dump(strategyName, path?)` - Save report to disk (default: ./logs/performance)
  - `clear(strategyName?)` - Clear accumulated performance data

### Client Layer (`src/client/`)

Client classes implement business logic without DI dependencies. All methods use **prototype functions** (not arrow functions) for memory efficiency - prototype methods are shared across all instances.

- **ClientStrategy** - Signal lifecycle management
  - `waitForInit()` - One-time initialization using `singleshot`, loads persisted state
  - `setPendingSignal(signal)` - Centralized signal updates with persistence
  - `tick()` - Real-time monitoring with VWAP checks
  - `backtest(candles)` - Fast backtest using candle array

- **ClientExchange** - Candle data access
  - `getCandles()` - Historical candles (backward from `when`)
  - `getNextCandles()` - Future candles (forward from `when`)
  - `getAveragePrice()` - VWAP from last 5 candles

- **ClientFrame** - Timeframe generation
  - `getTimeframe()` - Generate Date[] array for iteration

### Service Layer (`src/lib/services/`)

Services use DI and are organized by responsibility:

#### Connection Services (`connection/`)
Create and memoize client instances:
- `StrategyConnectionService` - ClientStrategy instances
- `ExchangeConnectionService` - ClientExchange instances
- `FrameConnectionService` - ClientFrame instances

#### Global Services (`global/`)
Wrap connection services with MethodContext:
- `StrategyGlobalService` - tick(symbol, when, backtest), backtest(symbol, candles, when, backtest)
- `ExchangeGlobalService` - getCandles(), getNextCandles(), getAveragePrice()
- `FrameGlobalService` - getTimeframe(symbol)

#### Schema Services (`schema/`)
Registry pattern for configuration using `ToolRegistry`:
- `StrategySchemaService` - Strategy schemas (strategyName → IStrategySchema)
- `ExchangeSchemaService` - Exchange schemas (exchangeName → IExchangeSchema)
- `FrameSchemaService` - Frame schemas (frameName → IFrameSchema)

Methods: `register(key, value)`, `override(key, partial)`, `get(key)`

#### Markdown Services (`markdown/`)
Generate and persist trading reports:
- `BacktestMarkdownService` - Backtest reports with closed signals
  - Subscribes to `signalBacktestEmitter` via `init()` (singleshot)
  - Accumulates only `closed` events per strategy
  - Generates markdown tables with signal details
- `LiveMarkdownService` - Live trading reports with all events
  - Subscribes to `signalLiveEmitter` via `init()` (singleshot)
  - Accumulates all events: `idle`, `opened`, `active`, `closed`
  - Replaces events with same `signalId` (keeps one entry per signal)
  - Calculates statistics: win rate, average PNL
- `PerformanceMarkdownService` - Performance tracking and profiling
  - Subscribes to `performanceEmitter` via `init()` (singleshot)
  - Accumulates performance metrics per strategy
  - Tracks execution time for: backtest_total, backtest_timeframe, backtest_signal, live_tick
  - Calculates statistics: count, avg, min, max, stdDev, median, P95, P99
  - Generates markdown reports with bottleneck analysis

Methods: `getReport(strategyName)`, `dump(strategyName, path?)`, `clear(strategyName?)`

#### Logic Services (`logic/private/`)
High-level orchestration using **async generators** for streaming results:

- **BacktestLogicPrivateService** - Smart backtest execution
  - `async *run(symbol)` - Returns `AsyncIterableIterator<IStrategyTickResultClosed>`
  - Iterates timeframes with `while` loop
  - Calls `tick()` to detect signal open
  - When opened: fetches `minuteEstimatedTime` candles and calls `backtest()`
  - Skips timeframes until `closeTimestamp` after signal closes
  - Uses `yield` to stream results without memory accumulation
  - **Built-in performance tracking**:
    - Tracks `backtest_total` - total backtest duration
    - Tracks `backtest_timeframe` - each timeframe processing
    - Tracks `backtest_signal` - signal processing (tick + getNextCandles + backtest)
    - Emits metrics via `performanceEmitter.next()`

- **LiveLogicPrivateService** - Real-time execution
  - `async *run(symbol)` - Returns `AsyncIterableIterator<IStrategyTickResult>`
  - Infinite `while(true)` loop with `sleep(TICK_TTL)` between ticks
  - Uses `new Date()` for real-time progression
  - Yields all result types: `opened` and `closed` (skips `idle` and `active`)
  - Integrated with crash recovery through `ClientStrategy.waitForInit()`
  - **Built-in performance tracking**:
    - Tracks `live_tick` - each tick iteration duration
    - Emits metrics via `performanceEmitter.next()`

#### Context Services (`context/`)

Two scoped context providers using `di-scoped`:

**ExecutionContextService** - Trading context:
```typescript
interface IExecutionContext {
  symbol: string;
  when: Date;
  backtest: boolean;
}
```

**MethodContextService** - Schema selection context:
```typescript
interface IMethodContext {
  exchangeName: ExchangeName;
  strategyName: StrategyName;
  frameName: FrameName;
}
```

## Error Recovery and Persistence

### Crash-Safe Design

The system uses a **persist-and-restart** pattern for fault tolerance:

1. **State Persistence** (`src/classes/Persist.ts`):
   - `PersistSignalAdaper` - Manages signal state on disk
   - Atomic file writes using `writeFileAtomic` prevent corruption
   - Each signal saved as `{strategyName}/{symbol}.json`

2. **Stateless Process**:
   - On startup, `ClientStrategy.waitForInit()` loads last signal state
   - If process crashes, restart reads state and continues monitoring
   - Uses `singleshot` to ensure initialization happens exactly once

3. **Centralized Updates**:
   - All signal changes go through `setPendingSignal(signal)`
   - Automatically persists to disk in live mode (skips in backtest)
   - Pattern: `await this.setPendingSignal(null)` instead of `this._pendingSignal = null`

4. **Recovery Flow**:
```typescript
// Initialization
public waitForInit = singleshot(async () => {
  if (!this.params.execution.context.backtest) {
    this._pendingSignal = await PersistSignalAdaper.readSignalData(
      this.params.strategyName,
      this.params.execution.context.symbol
    );
  }
});

// All updates persist automatically
public async setPendingSignal(pendingSignal: ISignalRow | null) {
  this._pendingSignal = pendingSignal;
  if (!this.params.execution.context.backtest) {
    await PersistSignalAdaper.writeSignalData(
      this._pendingSignal,
      this.params.strategyName,
      this.params.execution.context.symbol
    );
  }
}
```

**Result**: System can crash at any moment and resume monitoring from last saved state. No trades are lost, no duplicate signals.

## Data Flow

### Backtest Flow (Async Iterator)

```
User
  → BacktestLogicPrivateService.run(symbol)
    → async generator with yield
    → MethodContextService.runInContext (set strategyName, exchangeName)
      → Loop: timeframes[i]
        → StrategyGlobalService.tick(symbol, when, true)
          → ExecutionContextService.runInContext (set symbol, when, backtest)
            → StrategyConnectionService.tick()
              → ClientStrategy.tick()
                → ExchangeConnectionService.getAveragePrice() (VWAP)
                → Check TP/SL conditions
                → Return: opened | active | closed

        → If opened:
          → ExchangeGlobalService.getNextCandles(symbol, "1m", signal.minuteEstimatedTime, when, true)
            → ClientExchange.getNextCandles()

          → StrategyGlobalService.backtest(symbol, candles, when, true)
            → ClientStrategy.backtest(candles)
              → For each candle: calculate VWAP from last 5 candles
              → Check TP/SL on each VWAP
              → Return: closed (always)

          → yield closed result
          → Skip timeframes until closeTimestamp

      → Async generator completes when all timeframes processed
```

### Live Flow (Async Iterator)

```
User
  → LiveLogicPrivateService.run(symbol)
    → async generator with infinite while loop
    → MethodContextService.runInContext (set strategyName, exchangeName)
      → Loop: while(true)
        → Create: when = new Date()
        → StrategyGlobalService.tick(symbol, when, false)
          → ExecutionContextService.runInContext (set symbol, when, backtest)
            → StrategyConnectionService.tick()
              → ClientStrategy.waitForInit() (loads persisted signal)
              → ClientStrategy.tick()
                → GET_SIGNAL_FN with interval throttling and validation
                → Check pending signal for TP/SL with VWAP
                → setPendingSignal(signal) (persists to disk)
                → Return: idle | opened | active | closed

        → If idle or active: sleep(TICK_TTL) and continue
        → If opened or closed: yield result, then sleep(TICK_TTL)

      → Async generator never completes (infinite loop)
```

## Event System

### Event Emitters (`src/config/emitters.ts`)

Event emitters for signal lifecycle and performance tracking:
- `signalEmitter` - All signals (backtest + live)
- `signalBacktestEmitter` - Backtest signals only
- `signalLiveEmitter` - Live signals only
- `performanceEmitter` - Performance metrics (backtest + live)
- `progressEmitter` - Backtest progress tracking
- `doneEmitter` - Backtest completion events

**Usage**:
```typescript
signalLiveEmitter.subscribe(async (data: IStrategyTickResult) => {
  // Process live events
});

performanceEmitter.subscribe(async (data: PerformanceContract) => {
  console.log(`${data.metricType}: ${data.duration.toFixed(2)}ms`);
});
```

**Event Listeners** (`src/function/event.ts`):
- `listenSignal(callback)` - Subscribe to all signal events
- `listenSignalOnce(filter, callback)` - Subscribe once with filter
- `listenSignalBacktest(callback)` - Backtest signals only
- `listenSignalBacktestOnce(filter, callback)` - Backtest once with filter
- `listenSignalLive(callback)` - Live signals only
- `listenSignalLiveOnce(filter, callback)` - Live once with filter
- `listenPerformance(callback)` - Subscribe to performance metrics
- `listenProgress(callback)` - Subscribe to backtest progress
- `listenDone(callback)` - Subscribe to backtest completion
- `listenDoneOnce(callback)` - Subscribe once to backtest completion

All callbacks are wrapped with `queued` for sequential async execution.

## Key Design Patterns

### 1. Discriminated Unions

All results use discriminated unions for type safety:

```typescript
type IStrategyTickResult =
  | IStrategyTickResultIdle
  | IStrategyTickResultOpened
  | IStrategyTickResultActive
  | IStrategyTickResultClosed;

type IStrategyBacktestResult = IStrategyTickResultClosed;
```

No optional fields (`?:`), all fields are required.

### 2. Async Generators for Streaming

Both logic services use async generators to stream results:

```typescript
// Backtest
public async *run(symbol: string): AsyncIterableIterator<IStrategyTickResultClosed> {
  while (i < timeframes.length) {
    // ... process tick
    if (shouldYield) {
      yield result;
    }
    i++;
  }
}

// Live
public async *run(symbol: string): AsyncIterableIterator<IStrategyTickResult> {
  while (true) {
    // ... process tick
    if (shouldYield) {
      yield result;
    }
    await sleep(TICK_TTL);
  }
}
```

**Benefits**:
- Memory efficient (no array accumulation)
- Early termination possible
- Real-time processing in consumers

### 3. Dependency Injection

Uses custom DI container with:
- `provide(symbol, factory)` - Register service
- `inject<T>(symbol)` - Resolve service
- `TYPES` object with Symbol keys

### 4. Memoization

Client instances are memoized by key:
```typescript
getStrategy = memoize(
  (strategyName) => `${strategyName}`,
  (strategyName) => new ClientStrategy(...)
);
```

### 5. Context Propagation

Nested contexts using `di-scoped`:
```typescript
ExecutionContextService.runInContext(
  async () => {
    return await MethodContextService.runInContext(
      async () => { /* logic */ },
      { exchangeName, strategyName, frameName }
    );
  },
  { symbol, when, backtest }
);
```

Global services handle ExecutionContext automatically, so users don't need to wrap calls manually.

### 6. Registry Pattern

Schema services use `ToolRegistry` from functools-kit:
```typescript
strategySchemaService.register("my-strategy", schema);
const schema = strategySchemaService.get("my-strategy");
```

### 7. Singleshot Initialization

One-time operations use `singleshot` from functools-kit:
```typescript
public waitForInit = singleshot(async () => {
  // Only runs once, subsequent calls return cached promise
  this._pendingSignal = await PersistSignalAdaper.readSignalData(...);
});
```

## Signal Closing Logic

### In `tick()` mode:
- Checks if `when >= signal.timestamp + minuteEstimatedTime * 60 * 1000`
- Checks VWAP against TP/SL every tick
- Returns `closeTimestamp` from `execution.context.when`

### In `backtest()` mode:
- Receives `candles[]` for `minuteEstimatedTime` minutes
- Iterates from index 4 (needs 5 candles for VWAP)
- Calculates VWAP from last 5 candles on each iteration
- Returns `closeTimestamp` from candle timestamp
- Always returns `closed` (either TP/SL or time_expired)

## PNL Calculation

Located in `src/helpers/toProfitLossDto.ts`:

```typescript
// Constants
PERCENT_SLIPPAGE = 0.1%
PERCENT_FEE = 0.1%

// LONG position
priceOpenWithCosts = priceOpen * (1 + slippage + fee)
priceCloseWithCosts = priceClose * (1 - slippage - fee)
pnl% = (priceCloseWithCosts - priceOpenWithCosts) / priceOpenWithCosts * 100

// SHORT position
priceOpenWithCosts = priceOpen * (1 - slippage + fee)
priceCloseWithCosts = priceClose * (1 + slippage + fee)
pnl% = (priceOpenWithCosts - priceCloseWithCosts) / priceOpenWithCosts * 100
```

## File Structure

```
src/
├── client/           # Pure business logic (no DI)
│   ├── ClientStrategy.ts    # Signal lifecycle + validation + persistence
│   ├── ClientExchange.ts    # Candle data access
│   └── ClientFrame.ts        # Timeframe generation
├── classes/
│   ├── Backtest.ts          # Backtest facade (singleton)
│   ├── Live.ts              # Live facade (singleton)
│   └── Persist.ts           # Atomic file persistence with PersistSignalAdaper
├── config/
│   └── emitters.ts          # Event emitters for signal events
├── lib/
│   ├── core/        # DI container
│   │   ├── di.ts
│   │   ├── provide.ts
│   │   └── types.ts
│   ├── services/
│   │   ├── base/         # LoggerService
│   │   ├── context/      # ExecutionContext, MethodContext
│   │   ├── connection/   # Client instance creators
│   │   ├── global/       # Context wrappers
│   │   ├── schema/       # Registry services
│   │   ├── markdown/     # Report generation services
│   │   │   ├── BacktestMarkdownService.ts
│   │   │   └── LiveMarkdownService.ts
│   │   └── logic/
│   │       └── private/  # Async generator orchestration
│   │           ├── BacktestLogicPrivateService.ts
│   │           └── LiveLogicPrivateService.ts
│   └── index.ts     # Public API
├── interfaces/      # TypeScript interfaces
│   ├── Strategy.interface.ts
│   ├── Exchange.interface.ts
│   └── Frame.interface.ts
├── function/        # High-level functions
│   ├── backtest.ts  # runBacktest, runBacktestGUI
│   ├── run.ts       # DEPRECATED API - use logic services directly
│   ├── reduce.ts    # Accumulator pattern
│   ├── add.ts       # addStrategy, addExchange, addFrame
│   ├── event.ts     # Event listener utilities
│   └── exchange.ts  # getCandles, getAveragePrice, getDate, getMode
└── helpers/         # Utilities
    └── toProfitLossDto.ts
```

## Naming Conventions

- **Candle** → **Exchange** (historical rename, preserved `ICandleData`)
- Services: `<Name>Service` (e.g., `StrategyGlobalService`)
- Interfaces: `I<Name>` (e.g., `IStrategySchema`)
- Types: `<Name>` (e.g., `StrategyName`, `ExchangeName`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `PERCENT_FEE`, `VALIDATE_SIGNAL_FN`)
- Functions: `<verb><Noun>` (e.g., `addStrategy`, `getCandles`)
- Log method names: `<SERVICE>_<ACTION>_METHOD_NAME` (e.g., `GET_CANDLES_METHOD_NAME`)

## Type Safety Rules

1. **No optional fields** - Use discriminated unions instead
2. **Required closeTimestamp** - All closed signals include timestamp
3. **Union types for states** - Never use nullable patterns
4. **Constants over strings** - Use `StrategyCloseReason` type
5. **Type guards in logic** - Use `result.action === "closed"` checks
6. **Validation before execution** - `VALIDATE_SIGNAL_FN` throws on invalid signals

## Performance Optimizations

1. **Memoization** - Client instances cached by schema name
2. **Prototype methods** - All client methods use prototype (not arrow functions) for memory efficiency
3. **Fast backtest** - `backtest()` method skips individual ticks
4. **Timeframe skipping** - Jump to `closeTimestamp` after signal closes
5. **VWAP caching** - Calculated once per tick/candle
6. **Async generators** - Stream results without array accumulation
7. **Interval throttling** - Prevents excessive signal generation
8. **Singleshot initialization** - `waitForInit` runs exactly once per instance

## Production Readiness Assessment

1. **Robust Error Recovery** - Persist-and-restart pattern with atomic file writes
2. **Signal Validation** - Comprehensive validation prevents invalid trades
3. **Type Safety** - Discriminated unions eliminate runtime type errors
4. **Memory Efficiency** - Prototype methods + async generators + memoization
5. **Crash-Safe Persistence** - State survives process crashes
6. **Interval Throttling** - Prevents signal spam at strategy level
7. **Live Trading Ready** - Full implementation with infinite loop + real-time progression

## Extension Points

Users can extend the framework by:

1. **Registering schemas**:
   ```typescript
   import { addStrategy, addExchange, addFrame } from "backtest-kit";

   addStrategy(strategySchema);
   addExchange(exchangeSchema);
   addFrame(frameSchema);
   ```

2. **Implementing callbacks**:
   ```typescript
   callbacks: {
     onOpen: (backtest, symbol, signal) => {},
     onClose: (backtest, symbol, priceClose, signal) => {},
     onTick: (symbol, result, backtest) => {}
   }
   ```

3. **Custom persistence adapter**:
   ```typescript
   import { PersistSignalAdaper, PersistBase } from "backtest-kit";

   class CustomPersist extends PersistBase {
     async readValue(entityId) { /* ... */ }
     async writeValue(entityId, entity) { /* ... */ }
   }

   PersistSignalAdaper.usePersistSignalAdapter(CustomPersist);
   ```

4. **Consuming async generators**:
   ```typescript
   import { Backtest } from "backtest-kit";

   for await (const result of Backtest.run("BTCUSDT", {
     strategyName: "my-strategy",
     exchangeName: "binance",
     frameName: "1d-backtest"
   })) {
     console.log(result.action, result.pnl);
     if (shouldStop) break; // Early termination
   }
   ```

5. **Event listeners**:
   ```typescript
   import { listenSignalLive, listenSignalLiveOnce } from "backtest-kit";

   // Listen to all live events
   const unsubscribe = listenSignalLive((event) => {
     console.log("Event:", event.action);
   });

   // Listen once with filter
   listenSignalLiveOnce(
     (event) => event.action === "closed" && event.closeReason === "stop_loss",
     (event) => console.log("Stop loss hit!")
   );
   ```

6. **Background execution**:
   ```typescript
   import { Live } from "backtest-kit";

   // Run in background, returns stop function
   const stop = await Live.background("BTCUSDT", {
     strategyName: "my-strategy",
     exchangeName: "binance"
   });

   // Stop when needed
   stop();
   ```

7. **Markdown reports**:
   ```typescript
   import { Live, Performance } from "backtest-kit";

   // Generate live trading report
   const markdown = await Live.getReport("my-strategy");

   // Save to disk
   await Live.dump("my-strategy", "./reports");

   // Clear data
   await Live.clear("my-strategy");

   // Performance profiling
   const perfStats = await Performance.getData("my-strategy");
   console.log("Total events:", perfStats.totalEvents);
   console.log("Total duration:", perfStats.totalDuration);
   console.log("Metrics:", Object.keys(perfStats.metricStats));

   // Generate performance report
   const perfMarkdown = await Performance.getReport("my-strategy");

   // Save performance report
   await Performance.dump("my-strategy", "./logs/performance");
   ```

## Testing Strategy

The architecture separates concerns for testability:

- **Client classes** - Pure functions with prototype methods, easy to unit test
- **Connection services** - Memoization can be tested
- **Global services** - Context injection can be mocked
- **Logic services** - Integration tests with mock schemas and async generator consumption
- **Persistence** - Can be mocked with `PersistSignalAdaper.usePersistSignalAdapter()`

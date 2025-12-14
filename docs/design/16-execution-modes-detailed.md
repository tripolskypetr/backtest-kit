---
title: design/16_execution-modes-detailed
group: design
---

# Execution Modes (Detailed)

## Purpose and Scope

This page provides comprehensive documentation of the four execution modes implemented in backtest-kit: **Backtest**, **Live**, **Walker**, and **Optimizer**. Each mode orchestrates trading strategy execution with distinct architectural patterns, data flows, and performance characteristics. This document details the internal implementation of each mode, including the service layer architecture, async generator patterns, and state management.

For a high-level comparison of when to use each mode, see [Execution Modes Overview](./04-execution-modes-overview.md). For strategy definition and signal lifecycle concepts, see [Signal Lifecycle and State Machine](./03-signal-lifecycle-and-state-machine.md).

## Execution Mode Architecture

All four execution modes follow a consistent architectural pattern with three primary layers:

| Layer | Components | Responsibilities |
|-------|-----------|------------------|
| **Public API** | `Backtest`, `Live`, `Walker`, `Optimizer` classes | User-facing singleton instances with validation |
| **Instance Management** | `BacktestInstance`, `LiveInstance`, `WalkerInstance` | Memoized per-symbol execution contexts |
| **Command Services** | `BacktestCommandService`, `LiveCommandService`, `WalkerCommandService` | Dependency injection and context propagation |
| **Logic Services** | `BacktestLogicPublicService/Private`, `LiveLogicPublicService/Private`, `WalkerLogicPublicService/Private` | Core execution logic with async generators |
| **Core Services** | `StrategyCoreService`, `ExchangeCoreService`, `FrameCoreService` | Domain business logic |

---

## Backtest Mode

### Architecture Overview

```mermaid
graph TB
    subgraph "Public API Layer"
        BT["Backtest (singleton)"]
        BTI["BacktestInstance (memoized)"]
    end
    
    subgraph "Service Layer"
        CMD["BacktestCommandService"]
        PUB["BacktestLogicPublicService"]
        PRIV["BacktestLogicPrivateService"]
    end
    
    subgraph "Core Services"
        STRAT["StrategyCoreService"]
        EXCH["ExchangeCoreService"]
        FRAME["FrameCoreService"]
    end
    
    subgraph "Context Services"
        MCTX["MethodContextService"]
        ECTX["ExecutionContextService"]
    end
    
    BT -->|"run(symbol, context)"| BTI
    BTI -->|"validate + run()"| CMD
    CMD -->|"context propagation"| MCTX
    CMD -->|"async generator"| PUB
    PUB -->|"async generator"| PRIV
    
    PRIV -->|"getTimeframe()"| FRAME
    PRIV -->|"tick(symbol, when, true)"| STRAT
    PRIV -->|"backtest(symbol, candles)"| STRAT
    PRIV -->|"getNextCandles()"| EXCH
    
    MCTX -->|"strategyName, exchangeName, frameName"| PRIV
    ECTX -->|"symbol, when, backtest=true"| STRAT
```

**Diagram: Backtest Mode Service Dependencies**

### Public API Entry Points

The `Backtest` singleton provides the primary interface for backtest operations:

```typescript
// From Backtest.ts
Backtest.run(symbol: string, context: {
  strategyName: string,
  exchangeName: string,
  frameName: string
}) -> AsyncGenerator<IStrategyBacktestResult>

Backtest.background(symbol, context) -> CancellationFunction
Backtest.stop(symbol, strategyName) -> Promise<void>
Backtest.getData(symbol, strategyName) -> Promise<BacktestStatistics>
```

Each symbol-strategy pair is managed by a memoized `BacktestInstance` (keyed by `"${symbol}:${strategyName}"`), ensuring isolated state and preventing duplicate executions.

### Execution Flow

```mermaid
graph TD
    START["Backtest.run()"]
    VALIDATE["Validate strategy, exchange, frame, risk"]
    INSTANCE["Get/Create BacktestInstance"]
    CLEAR["Clear markdown services & strategy state & risk state"]
    COMMAND["BacktestCommandService.run()"]
    
    FRAME["FrameCoreService.getTimeframe()"]
    LOOP["For each timeframe"]
    PROGRESS["Emit progressBacktestEmitter"]
    
    TICK["StrategyCoreService.tick(when, backtest=true)"]
    CHECK_RESULT{"result.action?"}
    
    IDLE["action: idle"]
    SCHEDULED["action: scheduled"]
    OPENED["action: opened"]
    
    FETCH_SCHED["getNextCandles(CC_SCHEDULE_AWAIT_MINUTES + minuteEstimatedTime + buffer)"]
    BACKTEST_SCHED["StrategyCoreService.backtest() - handle activation/cancellation"]
    
    FETCH_OPEN["getNextCandles(minuteEstimatedTime + buffer)"]
    BACKTEST["StrategyCoreService.backtest() - TP/SL monitoring"]
    
    SKIP["Skip timeframes until closeTimestamp"]
    YIELD["Yield closed result"]
    
    CHECK_STOP{"getStopped()?"}
    BREAK["Break loop"]
    NEXT["i++"]
    
    DONE["Emit doneBacktestSubject"]
    END["End generator"]
    
    START --> VALIDATE
    VALIDATE --> INSTANCE
    INSTANCE --> CLEAR
    CLEAR --> COMMAND
    COMMAND --> FRAME
    FRAME --> LOOP
    
    LOOP --> PROGRESS
    PROGRESS --> CHECK_STOP
    CHECK_STOP -->|"Yes & Idle"| BREAK
    CHECK_STOP -->|"No"| TICK
    
    TICK --> CHECK_RESULT
    CHECK_RESULT -->|"idle"| IDLE
    CHECK_RESULT -->|"scheduled"| SCHEDULED
    CHECK_RESULT -->|"opened"| OPENED
    
    SCHEDULED --> FETCH_SCHED
    FETCH_SCHED --> BACKTEST_SCHED
    BACKTEST_SCHED --> SKIP
    
    OPENED --> FETCH_OPEN
    FETCH_OPEN --> BACKTEST
    BACKTEST --> SKIP
    
    SKIP --> YIELD
    YIELD --> CHECK_STOP
    
    IDLE --> NEXT
    NEXT --> LOOP
    
    BREAK --> DONE
    DONE --> END
```

**Diagram: Backtest Execution Flow with Signal Type Handling**

### Timeframe Iteration and Skip Optimization

The backtest mode uses pre-generated timeframes from `FrameCoreService.getTimeframe()`, which returns an array of `Date` objects based on the frame configuration. The main optimization technique is **skip-to-close**:

1. **Initial tick:** Call `StrategyCoreService.tick(when, backtest=true)` at each timeframe
2. **Signal opened/scheduled:** When a signal opens, fetch all required candles at once:
   - For scheduled signals: `CC_SCHEDULE_AWAIT_MINUTES + minuteEstimatedTime + buffer` candles
   - For opened signals: `minuteEstimatedTime + buffer` candles
   - Buffer = `CC_AVG_PRICE_CANDLES_COUNT - 1` for VWAP calculation
3. **Fast processing:** Call `backtest(candles)` which processes all candles in memory without individual ticks
4. **Skip timeframes:** Advance loop counter `i` to skip all timeframes before `closeTimestamp`
5. **Yield result:** Emit closed signal result immediately

This pattern eliminates redundant tick calls during active signal monitoring, reducing execution time by orders of magnitude for strategies with long signal lifetimes.

### BacktestLogicPrivateService Implementation

The core logic is implemented as an async generator in `BacktestLogicPrivateService.run()`:

```typescript
// From BacktestLogicPrivateService.ts:62-477
public async *run(symbol: string) {
  const timeframes = await this.frameCoreService.getTimeframe(symbol, frameName);
  let i = 0;
  
  while (i < timeframes.length) {
    const when = timeframes[i];
    
    // Emit progress event
    await progressBacktestEmitter.next({...});
    
    // Check stop flag before processing
    if (await this.strategyCoreService.getStopped(symbol, strategyName)) {
      break;
    }
    
    const result = await this.strategyCoreService.tick(symbol, when, true);
    
    // Handle scheduled signals
    if (result.action === "scheduled") {
      const candles = await this.exchangeCoreService.getNextCandles(...);
      const backtestResult = await this.strategyCoreService.backtest(symbol, candles, when, true);
      
      // Skip to close timestamp
      while (i < timeframes.length && timeframes[i].getTime() < backtestResult.closeTimestamp) {
        i++;
      }
      
      yield backtestResult;
    }
    
    // Handle opened signals (similar pattern)
    if (result.action === "opened") { ... }
    
    i++;
  }
}
```

Key implementation details:

- **Error handling:** Tick and backtest failures emit to `errorEmitter` and skip the timeframe
- **Performance tracking:** Emits to `performanceEmitter` for signal and timeframe durations
- **Stop checks:** Multiple stop points (before tick, after idle, after closed) for graceful shutdown
- **Progress reporting:** Emits `progressBacktestEmitter` with `processedFrames / totalFrames`

### Scheduled Signal Handling

Scheduled signals (delayed entry orders) require special handling in backtest mode:

```typescript
// From BacktestLogicPrivateService.ts:154-301
if (result.action === "scheduled") {
  const signal = result.signal;
  
  // Calculate candles needed:
  // - Buffer for VWAP (CC_AVG_PRICE_CANDLES_COUNT - 1)
  // - Await period (CC_SCHEDULE_AWAIT_MINUTES)
  // - Signal lifetime (minuteEstimatedTime)
  const bufferMinutes = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - 1;
  const bufferStartTime = new Date(when.getTime() - bufferMinutes * 60 * 1000);
  const candlesNeeded = bufferMinutes + GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES + signal.minuteEstimatedTime + 1;
  
  const candles = await this.exchangeCoreService.getNextCandles(
    symbol, "1m", candlesNeeded, bufferStartTime, true
  );
  
  // backtest() handles activation/cancellation monitoring internally
  const backtestResult = await this.strategyCoreService.backtest(symbol, candles, when, true);
}
```

The `backtest()` method internally monitors for:
1. **Activation conditions:** Price reaches `priceOpen` within `CC_SCHEDULE_AWAIT_MINUTES`
2. **Cancellation conditions:** Time expires without activation
3. **Post-activation:** Normal TP/SL/time monitoring if activated

### State Management and Memory Efficiency

Backtest mode is stateless by design:
- **No persistence:** Signals are not written to disk
- **Streaming results:** Async generator yields results without accumulation
- **Clear on start:** Each `run()` clears previous markdown service data and strategy state
- **Early termination:** Consumer can `break` from the async generator at any point
- **Memoized instances:** Each symbol-strategy pair reuses the same `BacktestInstance`

The clear operations ensure isolation between runs:

```typescript
// From Backtest.ts:161-174
backtest.backtestMarkdownService.clear({ symbol, strategyName });
backtest.scheduleMarkdownService.clear({ symbol, strategyName });
backtest.strategyCoreService.clear({ symbol, strategyName });

const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
riskName && backtest.riskGlobalService.clear(riskName);
riskList?.forEach((riskName) => backtest.riskGlobalService.clear(riskName));
```

---

## Live Trading Mode

### Architecture Overview

```mermaid
graph TB
    subgraph "Public API Layer"
        LV["Live (singleton)"]
        LVI["LiveInstance (memoized)"]
    end
    
    subgraph "Service Layer"
        CMD["LiveCommandService"]
        PUB["LiveLogicPublicService"]
        PRIV["LiveLogicPrivateService"]
    end
    
    subgraph "Core Services"
        STRAT["StrategyCoreService"]
    end
    
    subgraph "Persistence Layer"
        PSA["PersistSignalAdapter"]
        JSON["JSON files (atomic writes)"]
    end
    
    subgraph "Context Services"
        MCTX["MethodContextService"]
        ECTX["ExecutionContextService"]
    end
    
    LV -->|"run(symbol, context)"| LVI
    LVI -->|"validate + run()"| CMD
    CMD -->|"context propagation"| MCTX
    CMD -->|"async generator"| PUB
    PUB -->|"async generator"| PRIV
    
    PRIV -->|"while(true)"| PRIV
    PRIV -->|"when = new Date()"| PRIV
    PRIV -->|"tick(symbol, when, false)"| STRAT
    PRIV -->|"sleep(TICK_TTL)"| PRIV
    
    STRAT -->|"waitForInit()"| PSA
    STRAT -->|"setPendingSignal()"| PSA
    PSA -->|"writeSignalData()"| JSON
    PSA -->|"readSignalData()"| JSON
    
    MCTX -->|"strategyName, exchangeName"| PRIV
    ECTX -->|"symbol, when, backtest=false"| STRAT
```

**Diagram: Live Mode Service Dependencies with Persistence**

### Public API Entry Points

The `Live` singleton provides crash-safe real-time trading:

```typescript
// From Live.ts
Live.run(symbol: string, context: {
  strategyName: string,
  exchangeName: string
}) -> AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed>

Live.background(symbol, context) -> CancellationFunction
Live.stop(symbol, strategyName) -> Promise<void>
Live.getData(symbol, strategyName) -> Promise<LiveStatistics>
```

Key differences from Backtest:
- **No frameName:** Live mode uses real-time progression (`new Date()`)
- **Filtered output:** Generator only yields `opened` and `closed` results (not `idle`/`active`)
- **Infinite loop:** Generator never completes unless explicitly stopped
- **Crash recovery:** State restored from disk on restart

### Execution Flow

```mermaid
graph TD
    START["Live.run()"]
    VALIDATE["Validate strategy, exchange, risk"]
    INSTANCE["Get/Create LiveInstance"]
    CLEAR["Clear markdown services & strategy state & risk state"]
    COMMAND["LiveCommandService.run()"]
    
    INFINITE["while(true) - Infinite Loop"]
    WHEN["when = new Date()"]
    
    TICK["StrategyCoreService.tick(when, backtest=false)"]
    WAIT_INIT["First tick: waitForInit() - load persisted state"]
    CHECK_RESULT{"result.action?"}
    
    IDLE["action: idle"]
    ACTIVE["action: active"]
    SCHEDULED["action: scheduled"]
    OPENED["action: opened"]
    CLOSED["action: closed"]
    
    CHECK_STOP_IDLE{"getStopped() && idle?"}
    BREAK["Break loop"]
    
    PERSIST["setPendingSignal() - write to disk"]
    YIELD["Yield result"]
    
    CHECK_STOP_CLOSED{"getStopped() && closed?"}
    
    SLEEP["sleep(TICK_TTL) - 61 seconds"]
    
    DONE["Emit doneLiveSubject"]
    END["End generator"]
    
    START --> VALIDATE
    VALIDATE --> INSTANCE
    INSTANCE --> CLEAR
    CLEAR --> COMMAND
    COMMAND --> INFINITE
    
    INFINITE --> WHEN
    WHEN --> TICK
    TICK --> WAIT_INIT
    WAIT_INIT --> CHECK_RESULT
    
    CHECK_RESULT -->|"idle"| IDLE
    CHECK_RESULT -->|"active"| ACTIVE
    CHECK_RESULT -->|"scheduled"| SCHEDULED
    CHECK_RESULT -->|"opened"| OPENED
    CHECK_RESULT -->|"closed"| CLOSED
    
    IDLE --> CHECK_STOP_IDLE
    CHECK_STOP_IDLE -->|"Yes"| BREAK
    CHECK_STOP_IDLE -->|"No"| SLEEP
    
    ACTIVE --> SLEEP
    SCHEDULED --> SLEEP
    
    OPENED --> PERSIST
    PERSIST --> YIELD
    YIELD --> SLEEP
    
    CLOSED --> PERSIST
    PERSIST --> YIELD
    YIELD --> CHECK_STOP_CLOSED
    CHECK_STOP_CLOSED -->|"Yes"| BREAK
    CHECK_STOP_CLOSED -->|"No"| SLEEP
    
    SLEEP --> INFINITE
    BREAK --> DONE
    DONE --> END
```

**Diagram: Live Mode Infinite Loop with Crash-Safe Persistence**

### Infinite Loop Architecture

The core difference between live and backtest is the infinite loop structure:

```typescript
// From LiveLogicPrivateService.ts:63-175
public async *run(symbol: string) {
  let previousEventTimestamp: number | null = null;
  
  while (true) {  // Infinite loop
    const tickStartTime = performance.now();
    const when = new Date();  // Real-time date
    
    const result = await this.strategyCoreService.tick(symbol, when, false);
    
    // Track performance
    await performanceEmitter.next({
      timestamp: Date.now(),
      previousTimestamp: previousEventTimestamp,
      metricType: "live_tick",
      duration: performance.now() - tickStartTime,
      strategyName, exchangeName, symbol,
      backtest: false
    });
    
    // Check stop conditions
    if (result.action === "idle") {
      if (await this.strategyCoreService.getStopped(symbol, strategyName)) {
        break;  // Exit when idle
      }
      await sleep(TICK_TTL);
      continue;
    }
    
    if (result.action === "active" || result.action === "scheduled") {
      await sleep(TICK_TTL);
      continue;  // Skip yielding, just continue loop
    }
    
    // Yield opened/closed only
    yield result as IStrategyTickResultOpened | IStrategyTickResultClosed;
    
    // Check stop after closed
    if (result.action === "closed") {
      if (await this.strategyCoreService.getStopped(symbol, strategyName)) {
        break;
      }
    }
    
    await sleep(TICK_TTL);  // 61 seconds between ticks
  }
}
```

Key characteristics:
- **`TICK_TTL = 61000ms`:** Slightly over 1 minute to ensure fresh candle data
- **Real-time dates:** `new Date()` called each iteration
- **No frame skipping:** Every tick is processed (no optimization like backtest)
- **Filtered yield:** Only `opened` and `closed` emitted to consumer

### Crash-Safe Persistence

Live mode achieves crash safety through atomic file writes and state recovery:

#### Write Path (Persistence)

```typescript
// StrategyCoreService calls PersistSignalAdapter
// From StrategyCoreService (not shown in files, but documented)
await this.persistSignalAdapter.writeSignalData(symbol, strategyName, signal);
```

The `PersistSignalAdapter` writes JSON atomically:
1. Serialize signal object to JSON
2. Write to temporary file
3. Atomic rename to final path: `./persist/${symbol}_${strategyName}.json`

#### Read Path (Recovery)

```typescript
// From ClientStrategy (referenced but not in provided files)
async waitForInit() {
  if (this._initialized) return;
  const persistedSignal = await this.persistSignalAdapter.readSignalData(
    this.symbol, 
    this.strategyName
  );
  if (persistedSignal) {
    this._pendingSignal = persistedSignal;
  }
  this._initialized = true;
}
```

The `waitForInit()` is called on first tick:
- Loads persisted signal from disk
- Restores `_pendingSignal` state
- Continues monitoring from last known position
- If file doesn't exist, starts fresh

### Graceful Shutdown

Live mode implements graceful shutdown to avoid interrupting active positions:

```typescript
// From Live.ts:221-240
return () => {  // Cancellation function returned by background()
  // Set stop flag
  backtest.strategyCoreService.stop({symbol, strategyName}, false);
  
  // Wait for position to close
  backtest.strategyCoreService
    .getPendingSignal(symbol, strategyName)
    .then(async (pendingSignal) => {
      if (pendingSignal) {
        return;  // Position still open, don't emit done
      }
      if (!this._isDone) {
        await doneLiveSubject.next({
          exchangeName, strategyName,
          backtest: false, symbol
        });
      }
      this._isDone = true;
    });
  
  this._isStopped = true;
};
```

Stop flow:
1. **User calls** `Live.stop()` or cancellation function
2. **Stop flag set:** `strategyCoreService.stop(symbol, strategyName, false)` where `false` means "don't force immediate stop"
3. **Loop checks:**
   - If idle: breaks immediately
   - If active: continues monitoring until closed
4. **Position closes:** Loop breaks after `action === "closed"` and `getStopped()` returns true
5. **Done event:** Emits `doneLiveSubject` only when no pending signal

This prevents orphaned positions by waiting for natural close (TP/SL/time).

### State Management and Persistence Lifecycle

```mermaid
graph LR
    subgraph "Process Lifecycle"
        START["Process Start"]
        RUN["Live.run()"]
        INIT["waitForInit()"]
        LOAD["Load from disk"]
        TICK["tick() loop"]
        OPEN["Signal opened"]
        PERSIST["Write to disk"]
        MONITOR["Monitor active"]
        CLOSE["Signal closed"]
        PERSIST2["Write closed to disk"]
        CRASH["Process Crash"]
    end
    
    subgraph "State Recovery"
        RESTART["Process Restart"]
        RUN2["Live.run()"]
        INIT2["waitForInit()"]
        LOAD2["Restore from disk"]
        CONTINUE["Continue monitoring"]
    end
    
    START --> RUN
    RUN --> INIT
    INIT --> LOAD
    LOAD -->|"No file: null"| TICK
    LOAD -->|"File exists: restore"| TICK
    TICK --> OPEN
    OPEN --> PERSIST
    PERSIST --> MONITOR
    MONITOR --> CLOSE
    CLOSE --> PERSIST2
    PERSIST2 --> TICK
    
    TICK -.->|"Crash"| CRASH
    CRASH -.-> RESTART
    RESTART --> RUN2
    RUN2 --> INIT2
    INIT2 --> LOAD2
    LOAD2 --> CONTINUE
    CONTINUE --> MONITOR
```

**Diagram: Live Mode Crash Recovery Lifecycle**

The persistence layer ensures:
- **Atomic writes:** No corrupted state files
- **Singleshot initialization:** `waitForInit()` called once per instance
- **Stateless process:** All state in JSON files, not in-memory
- **Crash recovery:** Process can restart anytime and resume monitoring

---

## Walker Mode

### Architecture Overview

```mermaid
graph TB
    subgraph "Public API Layer"
        WK["Walker (singleton)"]
        WKI["WalkerInstance (memoized)"]
    end
    
    subgraph "Service Layer"
        CMD["WalkerCommandService"]
        PUB["WalkerLogicPublicService"]
        PRIV["WalkerLogicPrivateService"]
    end
    
    subgraph "Backtest Delegation"
        BT_PUB["BacktestLogicPublicService"]
        BT_PRIV["BacktestLogicPrivateService"]
    end
    
    subgraph "Results Collection"
        BT_MD["BacktestMarkdownService"]
        WK_MD["WalkerMarkdownService"]
    end
    
    subgraph "Stop Signal System"
        STOP_SUB["walkerStopSubject"]
        STOP_SET["Set<StrategyName>"]
    end
    
    WK -->|"run(symbol, {walkerName})"| WKI
    WKI -->|"validate all strategies"| CMD
    CMD -->|"async generator"| PUB
    PUB -->|"async generator"| PRIV
    
    PRIV -->|"for each strategy"| BT_PUB
    BT_PUB --> BT_PRIV
    BT_PRIV -->|"yields closed signals"| PRIV
    
    PRIV -->|"getData(symbol, strategyName)"| BT_MD
    BT_MD -->|"statistics"| PRIV
    
    PRIV -->|"compare metric"| PRIV
    PRIV -->|"track bestStrategy"| PRIV
    PRIV -->|"yield WalkerContract"| WK_MD
    
    STOP_SUB -->|"filter by symbol+walkerName"| STOP_SET
    PRIV -->|"check stoppedStrategies.has()"| STOP_SET
```

**Diagram: Walker Mode Architecture with Sequential Backtest Delegation**

### Public API Entry Points

The `Walker` singleton orchestrates strategy comparison:

```typescript
// From Walker.ts
Walker.run(symbol: string, context: {
  walkerName: string
}) -> AsyncGenerator<WalkerContract>

Walker.background(symbol, context) -> CancellationFunction
Walker.stop(symbol, walkerName) -> Promise<void>
Walker.getData(symbol, walkerName) -> Promise<WalkerData>
```

Configuration is pulled from `WalkerSchemaService`:

```typescript
interface IWalkerSchema {
  walkerName: string;
  strategies: StrategyName[];  // List of strategies to compare
  exchangeName: string;
  frameName: string;
  metric?: WalkerMetric;  // Default: "sharpeRatio"
  callbacks?: {
    onStrategyStart?: (strategyName, symbol) => void;
    onStrategyComplete?: (strategyName, symbol, stats, metricValue) => Promise<void>;
    onStrategyError?: (strategyName, symbol, error) => void;
    onComplete?: (finalResults) => void;
  };
}
```

### Sequential Backtest Execution

Walker mode runs one backtest per strategy sequentially:

```mermaid
graph TD
    START["Walker.run()"]
    SCHEMA["Get WalkerSchema"]
    VALIDATE["Validate all strategies, exchange, frame"]
    CLEAR["Clear markdown & strategy state for all"]
    
    INIT["strategiesTested = 0"]
    INIT2["bestMetric = null"]
    INIT3["bestStrategy = null"]
    INIT4["stoppedStrategies = Set()"]
    
    SUBSCRIBE["Subscribe to walkerStopSubject"]
    
    LOOP["for strategy in strategies"]
    CHECK_STOP{"stoppedStrategies.has(strategy)?"}
    SKIP["Skip & break"]
    
    CALLBACK_START["onStrategyStart(strategyName)"]
    BACKTEST["BacktestLogicPublicService.run()"]
    CONSUME["await resolveDocuments(iterator)"]
    
    GET_STATS["BacktestMarkdownService.getData()"]
    EXTRACT["Extract metric value"]
    
    COMPARE{"metricValue > bestMetric?"}
    UPDATE["Update bestMetric, bestStrategy"]
    
    INCREMENT["strategiesTested++"]
    
    CONTRACT["Create WalkerContract"]
    EMIT_PROGRESS["Emit progressWalkerEmitter"]
    CALLBACK_COMPLETE["onStrategyComplete(stats)"]
    EMIT_WALKER["Emit walkerEmitter"]
    YIELD["Yield WalkerContract"]
    
    NEXT["Next strategy"]
    
    FINAL["Create final results"]
    CALLBACK_FINAL["onComplete(finalResults)"]
    EMIT_COMPLETE["Emit walkerCompleteSubject"]
    
    START --> SCHEMA
    SCHEMA --> VALIDATE
    VALIDATE --> CLEAR
    CLEAR --> INIT
    INIT --> INIT2
    INIT2 --> INIT3
    INIT3 --> INIT4
    INIT4 --> SUBSCRIBE
    SUBSCRIBE --> LOOP
    
    LOOP --> CHECK_STOP
    CHECK_STOP -->|"Yes"| SKIP
    CHECK_STOP -->|"No"| CALLBACK_START
    
    CALLBACK_START --> BACKTEST
    BACKTEST --> CONSUME
    CONSUME --> GET_STATS
    GET_STATS --> EXTRACT
    
    EXTRACT --> COMPARE
    COMPARE -->|"Yes"| UPDATE
    COMPARE -->|"No"| INCREMENT
    UPDATE --> INCREMENT
    
    INCREMENT --> CONTRACT
    CONTRACT --> EMIT_PROGRESS
    EMIT_PROGRESS --> CALLBACK_COMPLETE
    CALLBACK_COMPLETE --> EMIT_WALKER
    EMIT_WALKER --> YIELD
    YIELD --> NEXT
    
    NEXT --> LOOP
    SKIP --> FINAL
    LOOP -->|"All done"| FINAL
    FINAL --> CALLBACK_FINAL
    CALLBACK_FINAL --> EMIT_COMPLETE
```

**Diagram: Walker Sequential Execution Flow**

### WalkerLogicPrivateService Implementation

The core logic runs backtests sequentially and compares results:

```typescript
// From WalkerLogicPrivateService.ts:68-259
public async *run(
  symbol: string,
  strategies: StrategyName[],
  metric: WalkerMetric,
  context: {
    exchangeName: string,
    frameName: string,
    walkerName: string
  }
): AsyncGenerator<WalkerContract> {
  
  let strategiesTested = 0;
  let bestMetric: number | null = null;
  let bestStrategy: StrategyName | null = null;
  
  // Track stopped strategies
  const stoppedStrategies = new Set<StrategyName>();
  
  // Subscribe to stop signals (filtered by symbol AND walkerName)
  const unsubscribe = walkerStopSubject
    .filter((data) => data.symbol === symbol && data.walkerName === context.walkerName)
    .connect((data) => {
      stoppedStrategies.add(data.strategyName);
    });
  
  try {
    // Sequential backtest for each strategy
    for (const strategyName of strategies) {
      // Check if stopped
      if (stoppedStrategies.has(strategyName)) {
        break;
      }
      
      // Run backtest
      const iterator = this.backtestLogicPublicService.run(symbol, {
        strategyName, exchangeName, frameName
      });
      
      await resolveDocuments(iterator);  // Consume all results
      
      // Get statistics
      const stats = await this.backtestMarkdownService.getData(symbol, strategyName);
      
      // Extract metric value
      const value = stats[metric];
      const metricValue = (
        value !== null && 
        value !== undefined && 
        typeof value === "number" &&
        !isNaN(value) &&
        isFinite(value)
      ) ? value : null;
      
      // Update best if better
      if (bestMetric === null || (metricValue !== null && metricValue > bestMetric)) {
        bestMetric = metricValue;
        bestStrategy = strategyName;
      }
      
      strategiesTested++;
      
      // Create progress contract
      const walkerContract: WalkerContract = {
        walkerName, exchangeName, frameName, symbol,
        strategyName, stats, metricValue, metric,
        bestMetric, bestStrategy,
        strategiesTested, totalStrategies: strategies.length
      };
      
      await walkerEmitter.next(walkerContract);
      yield walkerContract;
    }
  } finally {
    unsubscribe();  // Clean up subscription
  }
  
  // Emit final results
  await walkerCompleteSubject.next({ bestStrategy, bestMetric, ... });
}
```

### Metric Evaluation System

Walker supports multiple comparison metrics:

| Metric | Type | Formula | Interpretation |
|--------|------|---------|----------------|
| `sharpeRatio` | Risk-adjusted return | `avgPnl / stdDev` | Higher is better - reward per unit risk |
| `annualizedSharpeRatio` | Annualized risk-adj. | `sharpeRatio × √365` | Higher is better - yearly normalized |
| `winRate` | Win probability | `winCount / totalSignals × 100` | Higher is better - % winning trades |
| `avgPnl` | Average return | `sum(pnl) / count` | Higher is better - expected profit per trade |
| `totalPnl` | Cumulative return | `sum(pnl)` | Higher is better - total profit |
| `certaintyRatio` | Win/loss ratio | `avgWin / |avgLoss|` | Higher is better - reward/risk asymmetry |
| `expectedYearlyReturns` | Annualized profit | Based on avg duration | Higher is better - yearly expected gain |

Metric comparison logic:

```typescript
// From WalkerLogicPrivateService.ts:182-190
const isBetter = 
  bestMetric === null ||
  (metricValue !== null && metricValue > bestMetric);

if (isBetter && metricValue !== null) {
  bestMetric = metricValue;
  bestStrategy = strategyName;
}
```

All metrics follow "higher is better" convention (including `stdDev` as inverse in Sharpe).

### Stop Signal System and Multiple Walkers

Walker mode supports concurrent walker instances on the same symbol through filtered stop signals:

```typescript
// From WalkerLogicPrivateService.ts:98-111
const unsubscribe = walkerStopSubject
  .filter((data) => 
    data.symbol === symbol && 
    data.walkerName === context.walkerName  // Filter by walker name
  )
  .connect((data) => {
    stoppedStrategies.add(data.strategyName);
    this.loggerService.info(
      "walkerLogicPrivateService received stop signal for strategy",
      { symbol, walkerName, strategyName: data.strategyName }
    );
  });
```

Stop flow:
1. **User calls** `Walker.stop(symbol, walkerName)`
2. **Iterate strategies:** For each strategy in walker schema
3. **Emit stop signal:** `walkerStopSubject.next({ symbol, strategyName, walkerName })`
4. **Set internal flag:** `strategyCoreService.stop({ symbol, strategyName }, true)`
5. **Filter in loop:** `WalkerLogicPrivateService` checks `stoppedStrategies.has()`
6. **Break loop:** Current strategy finishes, next is skipped

The `walkerName` filter enables multiple walker instances on the same symbol without interference.

### Lifecycle Callbacks

Walker schema supports callback hooks for progress monitoring:

```typescript
callbacks: {
  // Called before each strategy backtest
  onStrategyStart(strategyName: string, symbol: string): void
  
  // Called after each strategy completes successfully
  onStrategyComplete(
    strategyName: string, 
    symbol: string, 
    stats: BacktestStatistics, 
    metricValue: number | null
  ): Promise<void>
  
  // Called if strategy backtest fails
  onStrategyError(
    strategyName: string, 
    symbol: string, 
    error: Error
  ): void
  
  // Called once at end with final best results
  onComplete(finalResults: {
    walkerName, symbol, exchangeName, frameName,
    metric, totalStrategies, bestStrategy, bestMetric, bestStats
  }): void
}
```

Callback execution points:

```typescript
// From WalkerLogicPrivateService.ts:129-160
if (walkerSchema.callbacks?.onStrategyStart) {
  walkerSchema.callbacks.onStrategyStart(strategyName, symbol);
}

// ... run backtest ...

if (walkerSchema.callbacks?.onStrategyComplete) {
  await walkerSchema.callbacks.onStrategyComplete(
    strategyName, symbol, stats, metricValue
  );
}
```

---

## Optimizer Mode

### Architecture Overview

Optimizer mode is distinct from the other execution modes - it does not execute strategies but generates them using LLM technology. The architecture is documented in the high-level diagrams but implementation files are not included in the provided sources.

```mermaid
graph TB
    subgraph "Public API Layer"
        OPT["Optimizer (singleton)"]
    end
    
    subgraph "Service Layer"
        OPT_GLOBAL["OptimizerGlobalService"]
        OPT_CONN["OptimizerConnectionService"]
        OPT_SCHEMA["OptimizerSchemaService"]
    end
    
    subgraph "Client Layer"
        OPT_CLIENT["ClientOptimizer"]
    end
    
    subgraph "Template System"
        TMPL["OptimizerTemplateService"]
    end
    
    subgraph "Data Sources"
        CCXT_DUMP["CCXT_DUMPER_URL"]
        EXCH_API["Exchange API (getCandles)"]
    end
    
    subgraph "LLM Integration"
        OLLAMA["Ollama API"]
        MODEL["deepseek-v3.1:671b"]
    end
    
    subgraph "Output"
        CODE[".mjs file with strategy"]
        DUMP["./dump/{optimizerName}_{symbol}.mjs"]
    end
    
    OPT -->|"run(symbol, optimizerName)"| OPT_GLOBAL
    OPT_GLOBAL --> OPT_CONN
    OPT_CONN --> OPT_CLIENT
    OPT_CLIENT -->|"fetch multi-timeframe data"| CCXT_DUMP
    OPT_CLIENT -->|"fallback"| EXCH_API
    
    OPT_CLIENT -->|"format data for LLM"| OPT_CLIENT
    OPT_CLIENT -->|"getPrompt() callback"| OPT_CLIENT
    OPT_CLIENT -->|"generate strategy code"| OLLAMA
    OLLAMA -->|"use model"| MODEL
    
    MODEL -->|"generated code"| OPT_CLIENT
    OPT_CLIENT -->|"merge with template"| TMPL
    TMPL --> CODE
    OPT -->|"dump()"| DUMP
```

**Diagram: Optimizer Mode Architecture (High-Level)**

Based on the provided diagrams, the Optimizer mode follows this pattern:
1. **Data Source Iteration:** Fetches historical data at multiple timeframes (1h, 30m, 15m, 1m)
2. **Data Formatting:** Converts candles to markdown tables for LLM consumption
3. **Prompt Construction:** Calls user-provided `getPrompt()` callback with formatted data
4. **LLM Generation:** Sends prompt to Ollama API with deepseek model
5. **Template Merging:** Combines generated strategy logic with framework boilerplate
6. **Code Export:** Outputs executable `.mjs` file with complete strategy

(Diagram 2 section on Optimizer)

### Key Differences from Other Modes

| Aspect | Backtest/Live/Walker | Optimizer |
|--------|---------------------|-----------|
| **Purpose** | Execute strategies | Generate strategies |
| **Output** | Signal results | Source code |
| **Execution** | Async generator loop | Single-shot code generation |
| **Data usage** | Real-time tick/candles | Historical multi-timeframe batch |
| **State** | Signal lifecycle | Stateless |
| **Duration** | Long-running | Completes after generation |

The Optimizer mode is not an execution mode in the traditional sense - it's a **code generation tool** that produces strategies which can then be executed via Backtest/Live/Walker modes.

(Diagram 1 and 2 sections)

---

## Execution Mode Comparison

### Feature Matrix

| Feature | Backtest | Live | Walker | Optimizer |
|---------|----------|------|--------|-----------|
| **Loop Type** | Finite (timeframes) | Infinite (while true) | Sequential (strategies) | Single-shot |
| **Date Source** | Frame-generated | `new Date()` | Frame-delegated | Historical batch |
| **Persistence** | None | JSON atomic writes | None | File output |
| **Output Type** | `IStrategyBacktestResult` | `IStrategyTickResultOpened\|Closed` | `WalkerContract` | Code string |
| **Crash Recovery** | Not needed | `waitForInit()` | Not needed | N/A |
| **Stop Behavior** | Graceful at idle/closed | Graceful at idle/closed | Filtered by walkerName | N/A |
| **Performance Optimization** | Skip-to-close | None (real-time) | Parallel not supported | Data fetching |
| **State Management** | Cleared on start | Persisted to disk | Cleared per strategy | Stateless |
| **Primary Use Case** | Historical validation | Production trading | Strategy comparison | Strategy generation |

(Data Flow sections)

### Performance Characteristics

| Mode | Execution Speed | Memory Usage | Disk I/O |
|------|----------------|--------------|----------|
| **Backtest** | Very fast (skip-to-close) | Low (streaming) | None |
| **Live** | Real-time (61s ticks) | Low (streaming) | Atomic writes per tick |
| **Walker** | Slow (sequential backtests) | Moderate (accumulated stats) | None |
| **Optimizer** | Depends on LLM latency | Moderate (multi-timeframe data) | File output |

### Service Layer Dependencies

All modes share core services but use them differently:

```mermaid
graph LR
    subgraph "Shared Core Services"
        STRAT["StrategyCoreService"]
        EXCH["ExchangeCoreService"]
        FRAME["FrameCoreService"]
    end
    
    subgraph "Mode-Specific Logic"
        BT_LOGIC["BacktestLogicPrivateService"]
        LV_LOGIC["LiveLogicPrivateService"]
        WK_LOGIC["WalkerLogicPrivateService"]
        OPT_CLIENT["ClientOptimizer"]
    end
    
    BT_LOGIC -->|"tick(), backtest()"| STRAT
    BT_LOGIC -->|"getNextCandles()"| EXCH
    BT_LOGIC -->|"getTimeframe()"| FRAME
    
    LV_LOGIC -->|"tick() only"| STRAT
    LV_LOGIC -->|"No frame needed"| FRAME
    
    WK_LOGIC -->|"Delegates to"| BT_LOGIC
    
    OPT_CLIENT -->|"getCandles() batch"| EXCH
    OPT_CLIENT -->|"No tick/backtest"| STRAT
```

**Diagram: Execution Mode Service Dependencies**

---

## Summary

The four execution modes provide complementary capabilities:

- **Backtest:** Optimized historical validation with skip-to-close for fast signal processing
- **Live:** Crash-safe real-time trading with atomic persistence and graceful shutdown
- **Walker:** Sequential strategy comparison with metric-based ranking and progress callbacks
- **Optimizer:** LLM-powered strategy code generation using multi-timeframe historical data

All modes leverage the same core service architecture (Strategy, Exchange, Frame) but implement distinct orchestration patterns via Logic services. The async generator pattern enables memory-efficient streaming, early termination, and consistent error handling across all execution modes.


# Execution Modes

## Purpose and Scope

This document describes the three execution modes available in backtest-kit: **Backtest** (historical simulation), **Live** (real-time trading), and **Walker** (strategy comparison). Each mode implements a distinct temporal progression model and completion semantic while sharing the same core strategy execution framework.

For information about strategy lifecycle within these modes, see [Signal Lifecycle Overview](#2.2). For component registration patterns used across all modes, see [Component Registration](#2.3). For detailed API documentation of each mode's methods, see sections [4.3](#4.3), [4.4](#4.4), and [4.5](#4.5).

---

## Mode Overview

The framework provides three orthogonal execution modes that differ in temporal progression, completion semantics, and result aggregation patterns:

| Aspect | Backtest Mode | Live Mode | Walker Mode |
|--------|---------------|-----------|-------------|
| **Purpose** | Historical simulation | Real-time trading | Strategy comparison |
| **Temporal Model** | Sequential timeframe iteration | Real-time Date.now() | Multiple sequential backtests |
| **Completion** | Finite (when timeframes exhausted) | Infinite (never completes) | Finite (when all strategies tested) |
| **Primary Service** | `BacktestLogicPrivateService` | `LiveLogicPrivateService` | `WalkerLogicPrivateService` |
| **Result Type** | `IStrategyBacktestResult` | `IStrategyTickResultOpened \| IStrategyTickResultClosed` | `WalkerContract` |
| **Data Source** | Historical via `getNextCandles()` | Current via `getCandles()` | Historical via backtest delegation |
| **Crash Recovery** | Not applicable | Yes (via persistence layer) | Not applicable |
| **Progress Tracking** | `progressBacktestEmitter` | Not applicable | `progressWalkerEmitter` |

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:1-387](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:1-133](), [src/lib/services/logic/private/WalkerLogicPrivateService.ts:1-254]()

---

## Mode Selection and Entry Points

```mermaid
graph TB
    subgraph "Public API Layer"
        BacktestUtils["BacktestUtils<br/>Backtest.run()<br/>Backtest.background()"]
        LiveUtils["LiveUtils<br/>Live.run()<br/>Live.background()"]
        WalkerUtils["WalkerUtils<br/>Walker.run()<br/>Walker.background()"]
    end
    
    subgraph "Command Services"
        BacktestCmd["BacktestCommandService<br/>run(symbol, context)"]
        LiveCmd["LiveCommandService<br/>run(symbol, context)"]
        WalkerCmd["WalkerCommandService<br/>run(symbol, context)"]
    end
    
    subgraph "Public Logic Services"
        BacktestPublic["BacktestLogicPublicService<br/>Validation + context setup"]
        LivePublic["LiveLogicPublicService<br/>Validation + context setup"]
        WalkerPublic["WalkerLogicPublicService<br/>Validation + context setup"]
    end
    
    subgraph "Private Logic Services"
        BacktestPrivate["BacktestLogicPrivateService<br/>Core execution loop"]
        LivePrivate["LiveLogicPrivateService<br/>Core execution loop"]
        WalkerPrivate["WalkerLogicPrivateService<br/>Core execution loop"]
    end
    
    BacktestUtils -->|"delegates"| BacktestCmd
    LiveUtils -->|"delegates"| LiveCmd
    WalkerUtils -->|"delegates"| WalkerCmd
    
    BacktestCmd -->|"validates + delegates"| BacktestPublic
    LiveCmd -->|"validates + delegates"| LivePublic
    WalkerCmd -->|"validates + delegates"| WalkerPublic
    
    BacktestPublic -->|"sets context + delegates"| BacktestPrivate
    LivePublic -->|"sets context + delegates"| LivePrivate
    WalkerPublic -->|"sets context + delegates"| WalkerPrivate
    
    BacktestPrivate -->|"yields"| BacktestPublic
    LivePrivate -->|"yields"| LivePublic
    WalkerPrivate -->|"yields"| WalkerPublic
```

**Service Layering Pattern**

Each mode implements a four-tier architecture separating user-facing utilities, command validation, public contracts, and private implementation:

1. **Utils Layer**: User-facing singleton exports (`Backtest`, `Live`, `Walker`) providing simplified method access with logging
2. **Command Layer**: Validation services ensuring schema registration and parameter correctness before execution
3. **Public Layer**: Context setup and AsyncGenerator type contracts for external consumption
4. **Private Layer**: Core execution logic implementing temporal progression and result streaming

**Sources:** [docs/classes/BacktestUtils.md:1-62](), [docs/classes/LiveUtils.md:1-72](), [docs/classes/BacktestCommandService.md:1-70](), [docs/classes/LiveCommandService.md:1-66]()

---

## Backtest Mode

### Characteristics

Backtest mode performs historical simulation by iterating through predefined timeframes and evaluating strategy signals against past market data. The execution model implements an optimized skip-ahead pattern where timeframes are bypassed during active signal periods to minimize redundant tick() calls.

**Temporal Progression:**
- Iterates through `Date[]` array generated by `FrameGlobalService`
- Each timeframe represents a specific historical moment
- Progression is deterministic and repeatable
- No real-time constraints or timing dependencies

**Completion Semantics:**
- Finite execution: completes when all timeframes are processed
- AsyncGenerator yields each closed signal result
- Consumer can terminate early via `break` in for-await loop

**Data Requirements:**
- Historical candles fetched via `ClientExchange.getNextCandles()`
- Requires future data relative to signal open time
- Candle availability validated before backtest proceeds

### Execution Flow

```mermaid
flowchart TB
    Start["BacktestLogicPrivateService.run(symbol)"]
    GetFrames["FrameGlobalService.getTimeframe()<br/>returns Date[]"]
    InitLoop["i = 0<br/>while i < timeframes.length"]
    
    GetTime["when = timeframes[i]"]
    EmitProgress["progressBacktestEmitter.next()<br/>processedFrames: i, totalFrames"]
    
    Tick["StrategyGlobalService.tick(symbol, when, backtest=true)"]
    CheckAction{"result.action?"}
    
    ScheduledPath["action === 'scheduled'"]
    GetCandlesScheduled["ExchangeGlobalService.getNextCandles()<br/>interval='1m'<br/>count=CC_SCHEDULE_AWAIT_MINUTES + minuteEstimatedTime"]
    BacktestScheduled["StrategyGlobalService.backtest(symbol, candles, when, backtest=true)"]
    SkipScheduled["Skip timeframes until closeTimestamp<br/>while timeframes[i] < closeTimestamp: i++"]
    YieldScheduled["yield backtestResult"]
    
    OpenedPath["action === 'opened'"]
    GetCandlesOpened["ExchangeGlobalService.getNextCandles()<br/>interval='1m'<br/>count=minuteEstimatedTime"]
    BacktestOpened["StrategyGlobalService.backtest(symbol, candles, when, backtest=true)"]
    SkipOpened["Skip timeframes until closeTimestamp<br/>while timeframes[i] < closeTimestamp: i++"]
    YieldOpened["yield backtestResult"]
    
    IdlePath["action === 'idle' | 'active'"]
    Increment["i++"]
    
    CheckDone{"i < timeframes.length?"}
    FinalProgress["progressBacktestEmitter.next()<br/>progress=1.0"]
    End["Complete"]
    
    Start --> GetFrames
    GetFrames --> InitLoop
    InitLoop --> GetTime
    GetTime --> EmitProgress
    EmitProgress --> Tick
    Tick --> CheckAction
    
    CheckAction -->|"scheduled"| ScheduledPath
    ScheduledPath --> GetCandlesScheduled
    GetCandlesScheduled --> BacktestScheduled
    BacktestScheduled --> SkipScheduled
    SkipScheduled --> YieldScheduled
    YieldScheduled --> CheckDone
    
    CheckAction -->|"opened"| OpenedPath
    OpenedPath --> GetCandlesOpened
    GetCandlesOpened --> BacktestOpened
    BacktestOpened --> SkipOpened
    SkipOpened --> YieldOpened
    YieldOpened --> CheckDone
    
    CheckAction -->|"idle/active"| IdlePath
    IdlePath --> Increment
    Increment --> CheckDone
    
    CheckDone -->|"Yes"| GetTime
    CheckDone -->|"No"| FinalProgress
    FinalProgress --> End
```

**Skip-Ahead Optimization**

When a signal opens, the execution loop skips all timeframes until the signal closes. This optimization eliminates redundant tick() calls during the signal's active period since the strategy's state is deterministic once a position is opened.

```typescript
// Skip timeframes until closeTimestamp
while (
  i < timeframes.length &&
  timeframes[i].getTime() < backtestResult.closeTimestamp
) {
  i++;
}
```

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:62-384](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts:227-235](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts:329-335]()

### Key Service Classes

| Class | Responsibility | Key Methods |
|-------|---------------|-------------|
| `BacktestLogicPrivateService` | Core execution loop with timeframe iteration | `run(symbol): AsyncGenerator<IStrategyBacktestResult>` |
| `BacktestLogicPublicService` | Context setup and validation | `run(symbol, context)` |
| `BacktestCommandService` | Schema validation and delegation | `run(symbol, context)` |
| `FrameGlobalService` | Timeframe generation from frame schema | `getTimeframe(symbol, frameName): Promise<Date[]>` |
| `StrategyGlobalService` | Strategy method invocation with context injection | `tick()`, `backtest()` |
| `ExchangeGlobalService` | Data fetching with execution context | `getNextCandles()` |

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:33-47]()

---

## Live Mode

### Characteristics

Live mode performs real-time trading by continuously polling the strategy with current timestamps in an infinite loop. The execution model implements crash recovery through persistent storage, allowing processes to restart and resume active positions without data loss.

**Temporal Progression:**
- Infinite `while(true)` loop creating new `Date()` each iteration
- Each tick represents the current real-time moment
- Progression is non-deterministic and time-dependent
- Sleep interval (`TICK_TTL = 61 seconds`) controls polling frequency

**Completion Semantics:**
- Infinite execution: never completes naturally
- AsyncGenerator continues yielding results indefinitely
- Process termination via external signal (SIGTERM, SIGINT) or error

**Crash Recovery:**
- State persisted via `PersistSignalAdapter`, `PersistScheduleAdapter`, `PersistRiskAdapter`
- Strategy initialization calls `waitForInit()` to restore state
- Active positions and scheduled signals recovered from disk on restart

### Execution Flow

```mermaid
flowchart TB
    Start["LiveLogicPrivateService.run(symbol)"]
    InitLoop["previousEventTimestamp = null<br/>while (true)"]
    
    CreateDate["when = new Date()"]
    RecordStart["tickStartTime = performance.now()"]
    
    Tick["StrategyGlobalService.tick(symbol, when, backtest=false)"]
    CheckError{"tick() throws?"}
    ErrorPath["Log error<br/>errorEmitter.next(error)<br/>sleep(TICK_TTL)"]
    
    LogResult["Log action type"]
    EmitPerformance["performanceEmitter.next()<br/>metricType='live_tick'<br/>duration"]
    
    CheckAction{"result.action?"}
    ActivePath["action === 'active'"]
    IdlePath["action === 'idle'"]
    ScheduledPath["action === 'scheduled'"]
    OpenedClosedPath["action === 'opened' | 'closed'"]
    
    Sleep["sleep(TICK_TTL)"]
    Yield["yield result"]
    
    LoopBack["Continue to next iteration"]
    
    Start --> InitLoop
    InitLoop --> CreateDate
    CreateDate --> RecordStart
    RecordStart --> Tick
    
    Tick --> CheckError
    CheckError -->|"Yes"| ErrorPath
    CheckError -->|"No"| LogResult
    ErrorPath --> LoopBack
    
    LogResult --> EmitPerformance
    EmitPerformance --> CheckAction
    
    CheckAction -->|"active"| ActivePath
    CheckAction -->|"idle"| IdlePath
    CheckAction -->|"scheduled"| ScheduledPath
    CheckAction -->|"opened/closed"| OpenedClosedPath
    
    ActivePath --> Sleep
    IdlePath --> Sleep
    ScheduledPath --> Sleep
    
    OpenedClosedPath --> Yield
    Yield --> Sleep
    
    Sleep --> LoopBack
    LoopBack --> CreateDate
```

**Tick Throttling and Sleep Pattern**

The `TICK_TTL` constant (61 seconds) controls the polling interval between strategy evaluations. This value exceeds one minute to ensure each tick represents a new 1-minute candle boundary when fetching data.

```typescript
const TICK_TTL = 1 * 60 * 1_000 + 1; // 61 seconds
```

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:12](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:61-130]()

### Crash Recovery Architecture

```mermaid
graph TB
    subgraph "Process Lifecycle"
        Start["Process Start"]
        Crash["Process Crash/Restart"]
        Resume["Resume Execution"]
    end
    
    subgraph "ClientStrategy"
        WaitInit["waitForInit()<br/>Blocks until state loaded"]
        Tick["tick()<br/>Check signal status"]
        RestoreSignal["Restore active signal<br/>from _signal field"]
    end
    
    subgraph "Persistence Adapters"
        PersistSignal["PersistSignalAdapter<br/>Active signal state"]
        PersistSchedule["PersistScheduleAdapter<br/>Scheduled signals"]
        PersistRisk["PersistRiskAdapter<br/>Active positions"]
    end
    
    subgraph "Storage Backend"
        FileSystem["File System<br/>JSON files in .backtest-kit/"]
    end
    
    Start -->|"First run"| Tick
    Crash --> Resume
    Resume -->|"Restart"| WaitInit
    
    WaitInit -->|"readValue()"| PersistSignal
    WaitInit -->|"readValue()"| PersistSchedule
    WaitInit -->|"readValue()"| PersistRisk
    
    PersistSignal -->|"load from"| FileSystem
    PersistSchedule -->|"load from"| FileSystem
    PersistRisk -->|"load from"| FileSystem
    
    PersistSignal -->|"restore"| RestoreSignal
    RestoreSignal --> Tick
    
    Tick -->|"writeValue()"| PersistSignal
    Tick -->|"writeValue()"| PersistSchedule
    Tick -->|"writeValue()"| PersistRisk
```

**State Restoration Process**

1. On process start, `ClientStrategy` checks for persisted state via `PersistSignalAdapter.hasValue()`
2. If state exists, `readValue()` loads the serialized signal object
3. Strategy reconstructs internal state including signal, scheduled signals, and risk positions
4. Execution resumes from the restored state as if no crash occurred

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:1-133]()

### Key Service Classes

| Class | Responsibility | Key Methods |
|-------|---------------|-------------|
| `LiveLogicPrivateService` | Core execution loop with infinite polling | `run(symbol): AsyncGenerator<IStrategyTickResultOpened \| IStrategyTickResultClosed>` |
| `LiveLogicPublicService` | Context setup and validation | `run(symbol, context)` |
| `LiveCommandService` | Schema validation and delegation | `run(symbol, context)` |
| `StrategyGlobalService` | Strategy method invocation with context injection | `tick()` |
| `PersistSignalAdapter` | Signal state persistence | `readValue()`, `writeValue()`, `hasValue()`, `removeValue()` |

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:30-37]()

---

## Walker Mode

### Characteristics

Walker mode performs strategy comparison by executing multiple backtests sequentially and ranking results by a configurable performance metric. The execution model implements real-time progress tracking, allowing consumers to monitor strategy evaluation as it progresses.

**Temporal Progression:**
- Sequential iteration through strategy array
- Each iteration runs a complete backtest via `BacktestLogicPublicService`
- Progression depends on backtest execution time per strategy
- No parallel execution (strategies tested serially)

**Completion Semantics:**
- Finite execution: completes when all strategies tested
- AsyncGenerator yields `WalkerContract` after each strategy
- Final result includes best strategy and comparative statistics

**Metric Selection:**
- Default: `sharpeRatio`
- Alternatives: `winRate`, `avgPnl`, `totalPnl`, `certaintyRatio`, `annualizedSharpe`
- Higher values considered better for all metrics

### Execution Flow

```mermaid
flowchart TB
    Start["WalkerLogicPrivateService.run(symbol, strategies[], metric, context)"]
    GetSchema["WalkerSchemaService.get(walkerName)"]
    InitVars["strategiesTested = 0<br/>bestMetric = null<br/>bestStrategy = null"]
    
    LoopStart["for strategyName of strategies"]
    CallbackStart["walkerSchema.callbacks?.onStrategyStart()"]
    
    RunBacktest["BacktestLogicPublicService.run(symbol, {<br/>  strategyName,<br/>  exchangeName,<br/>  frameName<br/>})"]
    
    ResolveResults["await resolveDocuments(iterator)<br/>Collect all IStrategyBacktestResult[]"]
    
    CheckError{"backtest throws?"}
    ErrorPath["Log error<br/>errorEmitter.next(error)<br/>walkerSchema.callbacks?.onStrategyError()<br/>continue to next strategy"]
    
    GetStats["BacktestMarkdownService.getData(symbol, strategyName)"]
    ExtractMetric["metricValue = stats[metric]<br/>Validate not NaN/null/undefined"]
    
    CompareBest{"metricValue > bestMetric?"}
    UpdateBest["bestMetric = metricValue<br/>bestStrategy = strategyName"]
    
    IncrementCount["strategiesTested++"]
    
    CreateContract["WalkerContract {<br/>  strategyName,<br/>  stats,<br/>  metricValue,<br/>  bestMetric,<br/>  bestStrategy,<br/>  strategiesTested,<br/>  totalStrategies<br/>}"]
    
    EmitProgress["progressWalkerEmitter.next()<br/>processedStrategies, progress"]
    CallbackComplete["walkerSchema.callbacks?.onStrategyComplete()"]
    
    EmitWalker["walkerEmitter.next(walkerContract)"]
    Yield["yield walkerContract"]
    
    CheckMoreStrategies{"More strategies?"}
    
    FinalResults["Build final results {<br/>  bestStrategy,<br/>  bestMetric,<br/>  bestStats<br/>}"]
    CallbackDone["walkerSchema.callbacks?.onComplete()"]
    EmitComplete["walkerCompleteSubject.next(finalResults)"]
    End["Complete"]
    
    Start --> GetSchema
    GetSchema --> InitVars
    InitVars --> LoopStart
    
    LoopStart --> CallbackStart
    CallbackStart --> RunBacktest
    RunBacktest --> ResolveResults
    
    ResolveResults --> CheckError
    CheckError -->|"Yes"| ErrorPath
    CheckError -->|"No"| GetStats
    ErrorPath --> CheckMoreStrategies
    
    GetStats --> ExtractMetric
    ExtractMetric --> CompareBest
    
    CompareBest -->|"Yes"| UpdateBest
    CompareBest -->|"No"| IncrementCount
    UpdateBest --> IncrementCount
    
    IncrementCount --> CreateContract
    CreateContract --> EmitProgress
    EmitProgress --> CallbackComplete
    CallbackComplete --> EmitWalker
    EmitWalker --> Yield
    
    Yield --> CheckMoreStrategies
    CheckMoreStrategies -->|"Yes"| LoopStart
    CheckMoreStrategies -->|"No"| FinalResults
    
    FinalResults --> CallbackDone
    CallbackDone --> EmitComplete
    EmitComplete --> End
```

**Metric Extraction and Comparison**

Walker extracts the specified metric from `BacktestMarkdownService.getData()` results, which provides comprehensive statistics including Sharpe ratio, win rate, PNL, and other performance measures. The comparison logic treats higher values as better for all metrics.

```typescript
// Extract metric value
const value = stats[metric];
const metricValue =
  value !== null &&
  value !== undefined &&
  typeof value === "number" &&
  !isNaN(value) &&
  isFinite(value)
    ? value
    : null;

// Update best strategy if needed
const isBetter =
  bestMetric === null ||
  (metricValue !== null && metricValue > bestMetric);
```

**Sources:** [src/lib/services/logic/private/WalkerLogicPrivateService.ts:168-186]()

### Key Service Classes

| Class | Responsibility | Key Methods |
|-------|---------------|-------------|
| `WalkerLogicPrivateService` | Core execution loop iterating strategies | `run(symbol, strategies, metric, context): AsyncGenerator<WalkerContract>` |
| `WalkerLogicPublicService` | Context setup and validation | `run(symbol, context)` |
| `WalkerCommandService` | Schema validation and delegation | `run(symbol, context)` |
| `BacktestLogicPublicService` | Backtest execution for each strategy | `run(symbol, context)` |
| `BacktestMarkdownService` | Statistics calculation and retrieval | `getData(symbol, strategyName)` |
| `WalkerSchemaService` | Walker schema storage and retrieval | `get(walkerName)` |

**Sources:** [src/lib/services/logic/private/WalkerLogicPrivateService.ts:31-40]()

---

## Mode Comparison: Shared Components

All three execution modes share the same core strategy execution framework, differing only in temporal progression and result aggregation:

```mermaid
graph TB
    subgraph "Execution Modes"
        BacktestMode["Backtest Mode<br/>BacktestLogicPrivateService"]
        LiveMode["Live Mode<br/>LiveLogicPrivateService"]
        WalkerMode["Walker Mode<br/>WalkerLogicPrivateService"]
    end
    
    subgraph "Shared Strategy Framework"
        StrategyGlobal["StrategyGlobalService<br/>Context injection wrapper"]
        StrategyConn["StrategyConnectionService<br/>Memoized ClientStrategy instances"]
        ClientStrategy["ClientStrategy<br/>tick(), backtest(), stop()"]
    end
    
    subgraph "Shared Data Access"
        ExchangeGlobal["ExchangeGlobalService<br/>Context injection wrapper"]
        ExchangeConn["ExchangeConnectionService<br/>Memoized ClientExchange instances"]
        ClientExchange["ClientExchange<br/>getCandles(), getNextCandles()"]
    end
    
    subgraph "Shared Risk Management"
        RiskGlobal["RiskGlobalService<br/>Context injection wrapper"]
        RiskConn["RiskConnectionService<br/>Memoized ClientRisk instances"]
        ClientRisk["ClientRisk<br/>checkSignal(), addSignal()"]
    end
    
    subgraph "Mode-Specific Features"
        FrameGen["FrameGlobalService<br/>Timeframe generation<br/>(Backtest only)"]
        Persist["PersistSignalAdapter<br/>PersistScheduleAdapter<br/>PersistRiskAdapter<br/>(Live only)"]
        Metrics["BacktestMarkdownService<br/>Statistics calculation<br/>(Walker only)"]
    end
    
    BacktestMode -->|"uses"| StrategyGlobal
    LiveMode -->|"uses"| StrategyGlobal
    WalkerMode -->|"delegates to"| BacktestMode
    
    StrategyGlobal -->|"manages"| StrategyConn
    StrategyConn -->|"creates"| ClientStrategy
    
    ClientStrategy -->|"fetches data from"| ExchangeGlobal
    ExchangeGlobal -->|"manages"| ExchangeConn
    ExchangeConn -->|"creates"| ClientExchange
    
    ClientStrategy -->|"validates with"| RiskGlobal
    RiskGlobal -->|"manages"| RiskConn
    RiskConn -->|"creates"| ClientRisk
    
    BacktestMode -->|"uses"| FrameGen
    BacktestMode -->|"uses"| ExchangeGlobal
    
    LiveMode -->|"uses"| Persist
    LiveMode -->|"uses"| ExchangeGlobal
    
    WalkerMode -->|"uses"| Metrics
```

**Polymorphic Design Pattern**

The framework implements a polymorphic architecture where execution mode is orthogonal to strategy logic. All three modes invoke the same `ClientStrategy.tick()` method with different temporal contexts:

- **Backtest**: Historical `Date` from timeframe array
- **Live**: Real-time `Date` from `new Date()`
- **Walker**: Historical `Date` from timeframe array (via Backtest delegation)

The `backtest` boolean parameter in execution context distinguishes between backtest simulation and live execution, enabling mode-specific behaviors like persistence and progress tracking.

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:96](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:74]()

---

## Data Access Patterns by Mode

```mermaid
graph LR
    subgraph "Backtest Mode Data Flow"
        BT_Tick["tick(when=timeframe[i])"]
        BT_GetCandles["getCandles()<br/>Fetch historical backwards"]
        BT_GetNext["getNextCandles()<br/>Fetch historical forwards"]
        BT_Signal["Signal generation"]
        BT_Backtest["backtest(candles)<br/>Fast simulation"]
        
        BT_Tick -->|"ExecutionContext.when"| BT_GetCandles
        BT_Signal -->|"Signal opened"| BT_GetNext
        BT_GetNext -->|"Future candles"| BT_Backtest
    end
    
    subgraph "Live Mode Data Flow"
        Live_Tick["tick(when=new Date())"]
        Live_GetCandles["getCandles()<br/>Fetch recent backwards"]
        Live_Signal["Signal generation"]
        Live_Monitor["Real-time monitoring"]
        
        Live_Tick -->|"ExecutionContext.when"| Live_GetCandles
        Live_Signal -->|"Signal opened"| Live_Monitor
        Live_Monitor -->|"Continuous"| Live_GetCandles
    end
    
    subgraph "Walker Mode Data Flow"
        Walker_Loop["Strategy iteration"]
        Walker_Backtest["BacktestLogicPublicService.run()"]
        Walker_Stats["BacktestMarkdownService.getData()"]
        Walker_Compare["Metric comparison"]
        
        Walker_Loop -->|"Each strategy"| Walker_Backtest
        Walker_Backtest -->|"Complete results"| Walker_Stats
        Walker_Stats -->|"Extract metric"| Walker_Compare
    end
```

**getCandles() vs getNextCandles()**

The `ClientExchange` class provides two distinct methods for candle retrieval with different temporal semantics:

| Method | Direction | Use Case | Mode |
|--------|-----------|----------|------|
| `getCandles()` | Backwards from `ExecutionContext.when` | Fetch historical data for indicator calculation | Both Backtest and Live |
| `getNextCandles()` | Forwards from `ExecutionContext.when` | Fetch future data for signal simulation | Backtest only |

The `getNextCandles()` method validates that requested data does not exceed `Date.now()`, returning empty array if future data is requested. This prevents time-travel paradoxes in live mode.

**Sources:** [src/client/ClientExchange.ts:190-242](), [src/client/ClientExchange.ts:254-304]()

---

## Performance and Event Emission

Each mode emits distinct performance metrics and progress events through the event system:

| Event Type | Backtest | Live | Walker |
|------------|----------|------|--------|
| **Progress** | `progressBacktestEmitter` (frames processed) | Not applicable | `progressWalkerEmitter` (strategies tested) |
| **Performance** | `performanceEmitter` (timeframe duration, signal duration) | `performanceEmitter` (tick duration) | Not applicable (delegates to Backtest) |
| **Signal** | `signalBacktestEmitter` | `signalLiveEmitter` | `signalBacktestEmitter` (via delegation) |
| **Completion** | `doneBacktestSubject` | `doneLiveSubject` (never fires) | `doneWalkerSubject` |
| **Error** | `errorEmitter` (recoverable errors) | `errorEmitter` (recoverable errors) | `errorEmitter` (recoverable errors) |

**Performance Monitoring**

All modes track execution timing via `performanceEmitter` with mode-specific metric types:

- Backtest: `backtest_timeframe`, `backtest_signal`, `backtest_total`
- Live: `live_tick`
- Walker: Inherits backtest metrics for each strategy run

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:83-92](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:96-108](), [src/lib/services/logic/private/WalkerLogicPrivateService.ts:206-214]()
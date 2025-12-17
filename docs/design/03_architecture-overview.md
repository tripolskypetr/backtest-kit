---
title: design/03_architecture-overview
group: design
---

# Architecture Overview

This page describes the high-level system architecture of Backtest Kit, focusing on the layered design and how components interact. It covers the dependency injection system, service organization, client layer structure, and data flow patterns.

For details on execution modes (Backtest, Live, Walker), see [Execution Modes](./20_execution-modes.md). For the signal lifecycle state machine, see [Signals & Signal Lifecycle](./08_core-concepts.md). For the event system details, see [Event System Architecture](./14_architecture-deep-dive.md).

## System Layers

Backtest Kit follows a clean architecture pattern with five distinct layers that separate concerns and enable testability. The layers enforce unidirectional dependencies from top to bottom.

```mermaid
graph TB
    subgraph "Layer 1: Public API"
        API["Global Functions<br/>(src/function/add.ts,<br/>src/function/list.ts)"]
        Classes["Execution Classes<br/>(Backtest, Live, Walker,<br/>Optimizer, Performance)"]
    end
    
    subgraph "Layer 2: Command Services"
        BacktestCmd["BacktestCommandService"]
        LiveCmd["LiveCommandService"]
        WalkerCmd["WalkerCommandService"]
    end
    
    subgraph "Layer 3: Service Layer"
        Logic["Logic Services<br/>(Public & Private)"]
        Core["Core Services<br/>(Strategy, Exchange, Frame)"]
        Global["Global Services<br/>(Risk, Sizing, Optimizer, Partial)"]
        Schema["Schema Services<br/>(Registry Pattern)"]
        Validation["Validation Services<br/>(Memoized)"]
        Connection["Connection Services<br/>(Memoized Factories)"]
        Context["Context Services<br/>(Execution & Method)"]
        Markdown["Markdown Services<br/>(Report Generation)"]
        Template["Template Services<br/>(Code Generation)"]
    end
    
    subgraph "Layer 4: Client Layer"
        ClientStrategy["ClientStrategy<br/>(src/lib/client/ClientStrategy.ts)"]
        ClientExchange["ClientExchange<br/>(src/lib/client/ClientExchange.ts)"]
        ClientRisk["ClientRisk/MergeRisk<br/>(src/lib/client/ClientRisk.ts)"]
        ClientFrame["ClientFrame<br/>(src/lib/client/ClientFrame.ts)"]
        ClientPartial["ClientPartial<br/>(src/lib/client/ClientPartial.ts)"]
    end
    
    subgraph "Layer 5: Persistence & External"
        Persist["PersistSignalAdapter<br/>(src/lib/adapter/PersistSignalAdapter.ts)"]
        Emitters["Event Emitters<br/>(src/lib/subject/*.ts)"]
        CCXT["CCXT Exchange API"]
        LLM["Ollama LLM"]
    end
    
    API --> BacktestCmd
    API --> LiveCmd
    API --> WalkerCmd
    Classes --> BacktestCmd
    Classes --> LiveCmd
    Classes --> WalkerCmd
    
    BacktestCmd --> Logic
    LiveCmd --> Logic
    WalkerCmd --> Logic
    
    Logic --> Core
    Logic --> Context
    Core --> Connection
    Core --> Schema
    Core --> Validation
    Connection --> ClientStrategy
    Connection --> ClientExchange
    Connection --> ClientRisk
    Connection --> ClientFrame
    Connection --> ClientPartial
    Global --> Connection
    Markdown --> Emitters
    Template --> Schema
    
    ClientStrategy --> Persist
    ClientStrategy --> Emitters
    ClientExchange --> CCXT
    Core --> Emitters
```


## Dependency Injection System

The framework uses a custom dependency injection container built on `di-kit` that manages service instantiation and lifecycle. All services are registered via Symbol tokens defined in `TYPES`.

### TYPES Symbol Registry

```mermaid
graph LR
    TYPES["TYPES Object<br/>(src/lib/core/types.ts)"]
    
    Base["baseServices<br/>• loggerService"]
    Ctx["contextServices<br/>• executionContextService<br/>• methodContextService"]
    Conn["connectionServices<br/>• exchangeConnectionService<br/>• strategyConnectionService<br/>• frameConnectionService<br/>• sizingConnectionService<br/>• riskConnectionService<br/>• optimizerConnectionService<br/>• partialConnectionService"]
    Sch["schemaServices<br/>• exchangeSchemaService<br/>• strategySchemaService<br/>• frameSchemaService<br/>• walkerSchemaService<br/>• sizingSchemaService<br/>• riskSchemaService<br/>• optimizerSchemaService"]
    
    TYPES --> Base
    TYPES --> Ctx
    TYPES --> Conn
    TYPES --> Sch
```

| Service Category | Symbol Examples | Lifecycle | Purpose |
|-----------------|----------------|-----------|---------|
| **Base Services** | `loggerService` | Singleton | Centralized logging with context propagation |
| **Context Services** | `executionContextService`, `methodContextService` | Singleton | Ambient context using `di-scoped` AsyncLocalStorage |
| **Schema Services** | `strategySchemaService`, `exchangeSchemaService` | Singleton | Immutable configuration storage via `ToolRegistry` |
| **Validation Services** | `strategyValidationService`, `exchangeValidationService` | Singleton | Memoized existence checks |
| **Connection Services** | `strategyConnectionService`, `exchangeConnectionService` | Singleton | Memoized client instance factories |
| **Core Services** | `strategyCoreService`, `exchangeCoreService` | Singleton | Business logic orchestration |
| **Global Services** | `riskGlobalService`, `sizingGlobalService` | Singleton | Shared state across strategies |
| **Logic Services** | `backtestLogicPrivateService`, `liveLogicPrivateService` | Singleton | Async generator execution loops |
| **Command Services** | `backtestCommandService`, `liveCommandService` | Singleton | Public API wrappers |
| **Markdown Services** | `backtestMarkdownService`, `liveMarkdownService` | Singleton | Event subscribers for reporting |
| **Template Services** | `optimizerTemplateService` | Singleton | Code generation for optimizer |


### Service Registration Pattern

Services are registered in `src/lib/core/provide.ts:1-143` using the `provide()` function with lazy factory patterns. The `backtest` object aggregates all service references via `inject()`:

```typescript
// From src/lib/core/provide.ts
provide(TYPES.strategyConnectionService, () => new StrategyConnectionService());

// From src/lib/index.ts
const connectionServices = {
  strategyConnectionService: inject<StrategyConnectionService>(
    TYPES.strategyConnectionService
  ),
};

export const backtest = {
  ...baseServices,
  ...connectionServices,
  // ... other categories
};
```

The `init()` function is called at module load to trigger service initialization: `src/lib/index.ts:240`.


## Service Layer Architecture

The service layer consists of 11 categories organized by responsibility. Services never directly instantiate dependencies; instead they use dependency injection.

### Service Dependency Graph

```mermaid
graph TD
    BacktestCmd["BacktestCommandService<br/>(src/services/command/)"]
    LiveCmd["LiveCommandService"]
    
    BtLogicPub["BacktestLogicPublicService<br/>(src/services/logic/public/)"]
    LiveLogicPub["LiveLogicPublicService"]
    
    BtLogicPriv["BacktestLogicPrivateService<br/>(src/services/logic/private/)"]
    LiveLogicPriv["LiveLogicPrivateService"]
    
    StratCore["StrategyCoreService<br/>(src/services/core/)"]
    ExchCore["ExchangeCoreService"]
    FrameCore["FrameCoreService"]
    
    StratConn["StrategyConnectionService<br/>(src/services/connection/)"]
    ExchConn["ExchangeConnectionService"]
    RiskConn["RiskConnectionService"]
    PartialConn["PartialConnectionService"]
    
    StratSchema["StrategySchemaService<br/>(src/services/schema/)"]
    ExchSchema["ExchangeSchemaService"]
    RiskSchema["RiskSchemaService"]
    
    StratVal["StrategyValidationService<br/>(src/services/validation/)"]
    ExchVal["ExchangeValidationService"]
    RiskVal["RiskValidationService"]
    
    ClientStrat["ClientStrategy"]
    ClientExch["ClientExchange"]
    ClientRisk["ClientRisk"]
    
    BacktestCmd --> StratVal
    BacktestCmd --> ExchVal
    BacktestCmd --> BtLogicPub
    
    LiveCmd --> StratVal
    LiveCmd --> ExchVal
    LiveCmd --> LiveLogicPub
    
    BtLogicPub --> BtLogicPriv
    LiveLogicPub --> LiveLogicPriv
    
    BtLogicPriv --> StratCore
    BtLogicPriv --> ExchCore
    BtLogicPriv --> FrameCore
    LiveLogicPriv --> StratCore
    
    StratCore --> StratConn
    StratCore --> StratVal
    ExchCore --> ExchConn
    ExchCore --> ExchVal
    
    StratConn --> StratSchema
    StratConn --> RiskConn
    StratConn --> ExchConn
    StratConn --> PartialConn
    ExchConn --> ExchSchema
    RiskConn --> RiskSchema
    
    StratConn --> ClientStrat
    ExchConn --> ClientExch
    RiskConn --> ClientRisk
    
    StratVal --> RiskVal
```


### Context Propagation Services

Two context services use `di-scoped` library to propagate ambient information through the call stack without explicit parameter passing:

**ExecutionContextService** (`src/services/context/ExecutionContextService.ts`) provides:
- `symbol: string` - Trading pair symbol
- `when: Date` - Current execution timestamp
- `backtest: boolean` - Execution mode flag

**MethodContextService** (`src/services/context/MethodContextService.ts`) provides:
- `strategyName: string` - Active strategy identifier
- `exchangeName: string` - Active exchange identifier  
- `frameName?: string` - Active frame identifier (backtest only)

Both services wrap execution blocks using `runInContext()` method that leverages Node.js `AsyncLocalStorage` for context isolation.


### Connection Services (Memoized Factories)

Connection services create and cache client instances using `functools-kit` memoization. The cache key is typically the schema name:

```mermaid
graph LR
    StratConn["StrategyConnectionService"]
    ExchConn["ExchangeConnectionService"]
    
    Cache["Memoization Cache<br/>(functools-kit)"]
    
    ClientStrat1["ClientStrategy<br/>instance 1"]
    ClientStrat2["ClientStrategy<br/>instance 2"]
    ClientExch1["ClientExchange<br/>instance 1"]
    
    StratConn -->|"getClient(strategyName1)"| Cache
    StratConn -->|"getClient(strategyName2)"| Cache
    ExchConn -->|"getClient(exchangeName)"| Cache
    
    Cache -->|"cache miss"| ClientStrat1
    Cache -->|"cache hit"| ClientStrat1
    Cache -->|"cache miss"| ClientStrat2
    Cache -->|"cache miss"| ClientExch1
```

This pattern ensures:
- Only one client instance per unique schema name
- Efficient memory usage
- State preservation across multiple strategy executions
- Fast lookup for repeated access


## Client Layer (Pure Business Logic)

The client layer contains pure TypeScript classes with no dependency injection. All methods are prototype methods (not arrow functions) for memory efficiency. Clients receive dependencies via constructor parameters.

### Client Class Hierarchy

| Client Class | File Path | Responsibility | Key Methods |
|--------------|-----------|----------------|-------------|
| `ClientStrategy` | `src/lib/client/ClientStrategy.ts` | Signal lifecycle, validation, persistence | `tick()`, `backtest()`, `getSignal()` |
| `ClientExchange` | `src/lib/client/ClientExchange.ts` | Candle data, VWAP calculation, price formatting | `getCandles()`, `getAveragePrice()` |
| `ClientFrame` | `src/lib/client/ClientFrame.ts` | Timeframe generation for backtesting | `getTimeframe()` |
| `ClientRisk` | `src/lib/client/ClientRisk.ts` | Risk validation, position tracking | `checkSignal()`, `addSignal()`, `removeSignal()` |
| `MergeRisk` | `src/lib/client/ClientRisk.ts` | Combines multiple risk profiles | `checkSignal()` |
| `ClientPartial` | `src/lib/client/ClientPartial.ts` | Profit/loss milestone tracking | `checkPartials()` |
| `ClientOptimizer` | `src/lib/client/ClientOptimizer.ts` | LLM-powered strategy generation | `getData()`, `getCode()` |


### ClientStrategy Signal Processing Flow

```mermaid
stateDiagram-v2
    [*] --> tick
    tick --> getSignal: "Call user's<br/>getSignal()"
    getSignal --> validateSignal: "Check prices,<br/>TP/SL logic"
    validateSignal --> checkRisk: "ClientRisk<br/>validation"
    checkRisk --> scheduled: "priceOpen<br/>not reached"
    checkRisk --> opened: "priceOpen<br/>reached"
    scheduled --> monitorScheduled: "Check SL<br/>before activation"
    monitorScheduled --> opened: "Price reaches<br/>priceOpen"
    monitorScheduled --> cancelled: "SL hit or<br/>timeout"
    opened --> persist: "PersistSignalAdapter<br/>writeSignalData()"
    persist --> backtest: "Fast processing<br/>mode"
    persist --> active: "Real-time<br/>monitoring"
    active --> checkTP: "VWAP vs<br/>priceTakeProfit"
    active --> checkSL: "VWAP vs<br/>priceStopLoss"
    active --> checkTime: "timestamp vs<br/>minuteEstimatedTime"
    checkTP --> closed: "TP reached"
    checkSL --> closed: "SL reached"
    checkTime --> closed: "Time expired"
    backtest --> closed: "Batch candle<br/>processing"
    closed --> [*]
    cancelled --> [*]
```

The `tick()` method at `src/lib/client/ClientStrategy.ts` orchestrates the entire signal lifecycle with interval throttling to prevent spam.


## Public API Layer

The public API consists of global functions and execution classes that provide the primary interface for users. All functions are exported from `src/index.ts`.

### Configuration Functions

| Function | File | Purpose |
|----------|------|---------|
| `addStrategy()` | `src/function/add.ts:52-64` | Register `IStrategySchema` with validation |
| `addExchange()` | `src/function/add.ts:101-113` | Register `IExchangeSchema` for data source |
| `addFrame()` | `src/function/add.ts:145-151` | Register `IFrameSchema` for backtest period |
| `addRisk()` | `src/function/add.ts:270-282` | Register `IRiskSchema` with custom validations |
| `addWalker()` | `src/function/add.ts:190-202` | Register `IWalkerSchema` for strategy comparison |
| `addSizing()` | `src/function/add.ts:256-268` | Register `ISizingSchema` for position sizing |
| `addOptimizer()` | `src/function/add.ts:294-306` | Register `IOptimizerSchema` for LLM strategy generation |
| `setConfig()` | `src/function/config.ts` | Modify `GLOBAL_CONFIG` parameters |
| `setLogger()` | `src/function/logger.ts` | Plug in custom `ILogger` implementation |

### Execution Classes

```mermaid
classDiagram
    class Backtest {
        +run(symbol, context) AsyncGenerator
        +background(symbol, context) void
        +stop(symbol, strategyName) Promise
        +getData(symbol, strategyName) BacktestStatistics
        +getReport(symbol, strategyName) string
        +dump(symbol, strategyName) Promise
    }
    
    class Live {
        +run(symbol, context) AsyncGenerator
        +background(symbol, context) void
        +stop(symbol, strategyName) Promise
        +getData(symbol, strategyName) LiveStatistics
        +getReport(symbol, strategyName) string
        +dump(symbol, strategyName) Promise
    }
    
    class Walker {
        +run(symbol, context) AsyncGenerator
        +background(symbol, context) void
        +stop(symbol, walkerName) Promise
        +getData(symbol, walkerName) WalkerStatistics
        +getReport(symbol, walkerName) string
        +dump(symbol, walkerName) Promise
    }
    
    class Optimizer {
        +getData(optimizerName) Promise~OptimizerData~
        +getCode(optimizerName, outputPath) Promise~string~
        +dump(optimizerName, outputPath) Promise
    }
    
    Backtest --> BacktestCommandService: delegates to
    Live --> LiveCommandService: delegates to
    Walker --> WalkerCommandService: delegates to
    Optimizer --> OptimizerGlobalService: delegates to
```

Each execution class provides three consumption patterns:
1. **Async Iterator**: `for await (const event of Backtest.run(...))`
2. **Background Execution**: `Backtest.background(...)` with event listeners
3. **Statistics/Reports**: `getData()`, `getReport()`, `dump()` methods


## Event-Driven Architecture

The event system uses RxJS Subject pattern for decoupled communication between producers (strategy execution) and consumers (markdown services, user listeners).

### Event Emitters

| Emitter | File Path | Emits When | Payload Type |
|---------|-----------|------------|--------------|
| `signalEmitter` | `src/lib/subject/signalEmitter.ts` | Every tick (all modes) | `IStrategyTickResult` |
| `signalBacktestEmitter` | `src/lib/subject/signalBacktestEmitter.ts` | Backtest mode only | `IStrategyTickResult` |
| `signalLiveEmitter` | `src/lib/subject/signalLiveEmitter.ts` | Live mode only | `IStrategyTickResult` |
| `progressBacktestEmitter` | `src/lib/subject/progressBacktestEmitter.ts` | Frame completion | `number` (percentage) |
| `walkerEmitter` | `src/lib/subject/walkerEmitter.ts` | Strategy completion in walker | `WalkerContract` |
| `walkerCompleteSubject` | `src/lib/subject/walkerCompleteSubject.ts` | Walker finishes all strategies | `WalkerCompleteContract` |
| `doneBacktestSubject` | `src/lib/subject/doneBacktestSubject.ts` | Backtest completes | `DoneContract` |
| `doneLiveSubject` | `src/lib/subject/doneLiveSubject.ts` | Live execution stops | `DoneContract` |
| `doneWalkerSubject` | `src/lib/subject/doneWalkerSubject.ts` | Walker completes | `DoneContract` |
| `riskSubject` | `src/lib/subject/riskSubject.ts` | Signal fails risk validation | `RiskContract` |
| `performanceEmitter` | `src/lib/subject/performanceEmitter.ts` | Execution timing metrics | `PerformanceContract` |
| `partialProfitSubject` | `src/lib/subject/partialProfitSubject.ts` | Profit milestone reached | `PartialContract` |
| `partialLossSubject` | `src/lib/subject/partialLossSubject.ts` | Loss milestone reached | `PartialContract` |
| `errorEmitter` | `src/lib/subject/errorEmitter.ts` | Recoverable error occurs | `Error` |
| `exitEmitter` | `src/lib/subject/exitEmitter.ts` | Fatal error (terminate) | `Error` |

### Event Flow Architecture

```mermaid
graph LR
    subgraph "Event Producers"
        StratCore["StrategyCoreService"]
        ClientStrat["ClientStrategy.tick()"]
        BtLogic["BacktestLogicPrivateService"]
        LiveLogic["LiveLogicPrivateService"]
    end
    
    subgraph "Event Bus"
        SigEmit["signalEmitter"]
        SigBtEmit["signalBacktestEmitter"]
        SigLiveEmit["signalLiveEmitter"]
        ProgEmit["progressBacktestEmitter"]
        DoneEmit["done*Subject"]
        RiskEmit["riskSubject"]
        PartialEmit["partial*Subject"]
    end
    
    subgraph "Event Consumers"
        BtMD["BacktestMarkdownService"]
        LiveMD["LiveMarkdownService"]
        SchedMD["ScheduleMarkdownService"]
        HeatMD["HeatMarkdownService"]
        RiskMD["RiskMarkdownService"]
        PartialMD["PartialMarkdownService"]
        UserListeners["User Event Listeners<br/>(listenSignal*, etc.)"]
    end
    
    ClientStrat -->|"emit"| SigEmit
    ClientStrat -->|"emit"| SigBtEmit
    ClientStrat -->|"emit"| SigLiveEmit
    BtLogic -->|"emit"| ProgEmit
    BtLogic -->|"emit"| DoneEmit
    LiveLogic -->|"emit"| DoneEmit
    StratCore -->|"emit"| RiskEmit
    ClientStrat -->|"emit"| PartialEmit
    
    SigBtEmit -->|"subscribe"| BtMD
    SigLiveEmit -->|"subscribe"| LiveMD
    SigEmit -->|"subscribe"| SchedMD
    SigEmit -->|"subscribe"| HeatMD
    RiskEmit -->|"subscribe"| RiskMD
    PartialEmit -->|"subscribe"| PartialMD
    
    SigEmit -->|"subscribe"| UserListeners
    DoneEmit -->|"subscribe"| UserListeners
    ProgEmit -->|"subscribe"| UserListeners
    RiskEmit -->|"subscribe"| UserListeners
```

All user event listeners use `functools-kit` `queued` wrapper (`src/function/listen.ts`) to ensure sequential async processing, preventing race conditions during high-frequency event emission.


## Data Flow Patterns

The framework implements three primary data flow patterns corresponding to the three execution modes.

### Backtest Data Flow

```mermaid
sequenceDiagram
    participant User
    participant BacktestClass as "Backtest Class"
    participant BacktestCmd as "BacktestCommandService"
    participant BtLogicPriv as "BacktestLogicPrivateService"
    participant FrameCore as "FrameCoreService"
    participant StratCore as "StrategyCoreService"
    participant ClientStrat as "ClientStrategy"
    participant Emitters as "Event Emitters"
    participant MarkdownSvc as "BacktestMarkdownService"
    
    User->>BacktestClass: "Backtest.run(symbol, context)"
    BacktestClass->>BacktestCmd: "run(symbol, context)"
    BacktestCmd->>BtLogicPriv: "run(symbol)"
    BtLogicPriv->>FrameCore: "getTimeframe()"
    FrameCore-->>BtLogicPriv: "[timestamps]"
    
    loop "For each timeframe"
        BtLogicPriv->>StratCore: "tick(when)"
        StratCore->>ClientStrat: "tick()"
        ClientStrat->>ClientStrat: "getSignal()"
        ClientStrat->>ClientStrat: "validateSignal()"
        ClientStrat->>ClientStrat: "checkRisk()"
        
        alt "Signal Opened"
            ClientStrat->>ClientStrat: "backtest(candles)"
            ClientStrat->>Emitters: "emit signalBacktestEmitter"
            Emitters->>MarkdownSvc: "event notification"
            ClientStrat-->>StratCore: "IStrategyTickResultClosed"
            StratCore-->>BtLogicPriv: "result"
            BtLogicPriv->>User: "yield result"
        else "No Signal / Idle"
            ClientStrat-->>StratCore: "IStrategyTickResultIdle"
            StratCore-->>BtLogicPriv: "result"
            BtLogicPriv->>BtLogicPriv: "skip to next"
        end
    end
    
    BtLogicPriv->>Emitters: "emit doneBacktestSubject"
    BtLogicPriv-->>User: "AsyncGenerator complete"
```

Key characteristics:
- Deterministic timeframe iteration via `src/services/logic/private/BacktestLogicPrivateService.ts`
- Fast-forward optimization: skip timeframes while signal is active
- Bulk candle processing via `backtest()` method
- All events buffered in markdown services (max 250 per key)


### Live Trading Data Flow

```mermaid
sequenceDiagram
    participant User
    participant LiveClass as "Live Class"
    participant LiveCmd as "LiveCommandService"
    participant LiveLogicPriv as "LiveLogicPrivateService"
    participant StratCore as "StrategyCoreService"
    participant ClientStrat as "ClientStrategy"
    participant Persist as "PersistSignalAdapter"
    participant Emitters as "Event Emitters"
    
    User->>LiveClass: "Live.run(symbol, context)"
    LiveClass->>LiveCmd: "run(symbol, context)"
    LiveCmd->>LiveLogicPriv: "run(symbol)"
    LiveLogicPriv->>Persist: "waitForInit() - load state"
    Persist-->>LiveLogicPriv: "persisted signal or null"
    
    loop "Infinite Loop (while !stopped)"
        LiveLogicPriv->>LiveLogicPriv: "when = new Date()"
        LiveLogicPriv->>StratCore: "tick(when)"
        StratCore->>ClientStrat: "tick()"
        
        alt "No Active Signal"
            ClientStrat->>ClientStrat: "getSignal()"
            ClientStrat->>ClientStrat: "validateSignal()"
            ClientStrat->>ClientStrat: "checkRisk()"
            
            alt "Signal Opened"
                ClientStrat->>Persist: "writeSignalData()"
                Persist-->>ClientStrat: "persisted"
                ClientStrat->>Emitters: "emit signalLiveEmitter"
            end
        else "Active Signal Exists"
            ClientStrat->>ClientStrat: "checkTP/SL/Time"
            
            alt "Signal Closed"
                ClientStrat->>Persist: "deleteSignalData()"
                ClientStrat->>Emitters: "emit signalLiveEmitter"
                ClientStrat-->>StratCore: "IStrategyTickResultClosed"
            end
        end
        
        StratCore-->>LiveLogicPriv: "result"
        LiveLogicPriv->>User: "yield result"
        LiveLogicPriv->>LiveLogicPriv: "sleep(TICK_TTL)"
    end
    
    LiveLogicPriv->>Emitters: "emit doneLiveSubject"
    LiveLogicPriv-->>User: "AsyncGenerator complete"
```

Key characteristics:
- Infinite loop with sleep intervals via `src/services/logic/private/LiveLogicPrivateService.ts`
- Crash-safe persistence: only opened signals are saved
- Graceful shutdown: waits for `IStrategyTickResultClosed` before exiting
- Real-time VWAP pricing from last 5 1-minute candles


### Walker Strategy Comparison Flow

```mermaid
sequenceDiagram
    participant User
    participant WalkerClass as "Walker Class"
    participant WalkerLogicPriv as "WalkerLogicPrivateService"
    participant BtLogicPub as "BacktestLogicPublicService"
    participant BtMD as "BacktestMarkdownService"
    participant Emitters as "Event Emitters"
    
    User->>WalkerClass: "Walker.run(symbol, context)"
    WalkerClass->>WalkerLogicPriv: "run(symbol)"
    WalkerLogicPriv->>WalkerLogicPriv: "Load walker schema"
    WalkerLogicPriv->>WalkerLogicPriv: "strategies = [...]"
    
    loop "For each strategy"
        WalkerLogicPriv->>BtLogicPub: "run(symbol, strategyName)"
        
        loop "Backtest Execution"
            BtLogicPub->>BtLogicPub: "(internal backtest)"
            BtLogicPub->>Emitters: "emit signals"
        end
        
        BtLogicPub-->>WalkerLogicPriv: "completed"
        WalkerLogicPriv->>BtMD: "getData(symbol, strategyName)"
        BtMD-->>WalkerLogicPriv: "BacktestStatistics"
        WalkerLogicPriv->>WalkerLogicPriv: "Extract metric value"
        WalkerLogicPriv->>WalkerLogicPriv: "Compare to best"
        WalkerLogicPriv->>Emitters: "emit walkerEmitter"
        WalkerLogicPriv->>User: "yield progress"
    end
    
    WalkerLogicPriv->>WalkerLogicPriv: "Determine best strategy"
    WalkerLogicPriv->>Emitters: "emit walkerCompleteSubject"
    WalkerLogicPriv-->>User: "yield final results"
```

Key characteristics:
- Sequential backtest execution per strategy
- Metric-based ranking (Sharpe ratio, win rate, etc.)
- Progress events via `walkerEmitter` after each strategy
- Final comparison results via `walkerCompleteSubject`


## Summary

The Backtest Kit architecture achieves production-readiness through:

1. **Separation of Concerns**: Five distinct layers with unidirectional dependencies
2. **Dependency Injection**: Custom DI container with Symbol-based tokens and lazy initialization
3. **Context Propagation**: AsyncLocalStorage-based ambient context eliminates parameter passing
4. **Memoization**: Cached client instances prevent redundant instantiation
5. **Event-Driven Design**: Decoupled producers and consumers via RxJS Subject pattern
6. **Type Safety**: Discriminated unions for state machines and execution results
7. **Memory Efficiency**: Prototype methods, bounded event queues, async generators
8. **Crash Recovery**: Atomic file writes with state restoration on startup

The architecture enables identical code to run in backtest and live modes while maintaining determinism, testability, and extensibility.

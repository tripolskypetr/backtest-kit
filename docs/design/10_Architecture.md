# Architecture

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/add.ts](src/function/add.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/index.ts](src/index.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [types.d.ts](types.d.ts)

</details>



This document describes the overall architecture of backtest-kit, including its layered design, dependency injection system, context propagation mechanisms, and event-driven patterns. The architecture is designed to support three execution modes (Backtest, Live, Walker) while maintaining temporal isolation, crash recovery, and clean separation of concerns.

For detailed information about specific architectural components:
- Layer-specific responsibilities and interactions, see [Layer Responsibilities](#3.1)
- Dependency injection container implementation, see [Dependency Injection System](#3.2)
- Context propagation with AsyncLocalStorage, see [Context Propagation](#3.3)
- Event emitters and listener functions, see [Event System](#3.4)

## System Overview

backtest-kit implements a **layered service architecture** with dependency injection and context propagation. The system consists of approximately 50+ services organized into distinct layers, each with specific responsibilities. Services are instantiated lazily via a custom DI container and communicate through well-defined interfaces.

The architecture supports three primary execution modes:
- **Backtest**: Historical simulation with temporal isolation (prevents look-ahead bias)
- **Live**: Real-time trading with crash-safe persistence (atomic file writes)
- **Walker**: Strategy comparison with metric-based ranking

### Architectural Layers

```mermaid
graph TB
    subgraph "Public API Layer"
        API["Public Functions<br/>add*, listen*, set*<br/>Declarative registration"]
        UTILS["Utility Classes<br/>Backtest, Live, Walker<br/>Schedule, Performance, Heat<br/>PositionSize, Optimizer, Partial, Risk"]
    end
    
    subgraph "Command Layer"
        CMD_BT["BacktestCommandService<br/>Orchestrate backtest execution<br/>Progress tracking"]
        CMD_LV["LiveCommandService<br/>Orchestrate live execution<br/>Crash recovery coordination"]
        CMD_WK["WalkerCommandService<br/>Orchestrate walker execution<br/>Strategy comparison"]
    end
    
    subgraph "Logic Layer"
        LOGIC_PRI["Logic Private Services<br/>BacktestLogicPrivateService<br/>LiveLogicPrivateService<br/>WalkerLogicPrivateService<br/>Internal algorithms"]
        LOGIC_PUB["Logic Public Services<br/>BacktestLogicPublicService<br/>LiveLogicPublicService<br/>WalkerLogicPublicService<br/>API wrappers with validation"]
    end
    
    subgraph "Global Layer"
        GLOBAL["Global Services<br/>SizingGlobalService<br/>RiskGlobalService<br/>OptimizerGlobalService<br/>PartialGlobalService<br/>Facades for subsystems"]
    end
    
    subgraph "Connection Layer"
        CONN["Connection Services<br/>StrategyConnectionService<br/>ExchangeConnectionService<br/>FrameConnectionService<br/>RiskConnectionService<br/>SizingConnectionService<br/>OptimizerConnectionService<br/>PartialConnectionService<br/>Factory + Memoization"]
    end
    
    subgraph "Core Layer"
        CORE["Core Services<br/>StrategyCoreService<br/>ExchangeCoreService<br/>FrameCoreService<br/>Domain logic"]
    end
    
    subgraph "Schema Layer"
        SCHEMA["Schema Services<br/>StrategySchemaService<br/>ExchangeSchemaService<br/>FrameSchemaService<br/>RiskSchemaService<br/>SizingSchemaService<br/>WalkerSchemaService<br/>OptimizerSchemaService<br/>ToolRegistry storage"]
    end
    
    subgraph "Validation Layer"
        VALID["Validation Services<br/>StrategyValidationService<br/>ExchangeValidationService<br/>FrameValidationService<br/>RiskValidationService<br/>SizingValidationService<br/>WalkerValidationService<br/>OptimizerValidationService<br/>ConfigValidationService<br/>ColumnValidationService<br/>Business rules enforcement"]
    end
    
    subgraph "Markdown Layer"
        MD["Markdown Services<br/>BacktestMarkdownService<br/>LiveMarkdownService<br/>WalkerMarkdownService<br/>ScheduleMarkdownService<br/>PerformanceMarkdownService<br/>HeatMarkdownService<br/>PartialMarkdownService<br/>RiskMarkdownService<br/>OutlineMarkdownService<br/>Report generation"]
    end
    
    subgraph "Client Layer"
        CLIENT["Client Implementations<br/>ClientStrategy<br/>ClientExchange<br/>ClientFrame<br/>ClientRisk<br/>ClientSizing<br/>ClientPartial<br/>ClientOptimizer<br/>Business logic execution"]
    end
    
    subgraph "Context Layer"
        CTX["Context Services<br/>ExecutionContextService<br/>MethodContextService<br/>AsyncLocalStorage propagation"]
    end
    
    API --> VALID
    API --> SCHEMA
    UTILS --> CMD_BT
    UTILS --> CMD_LV
    UTILS --> CMD_WK
    
    CMD_BT --> LOGIC_PUB
    CMD_LV --> LOGIC_PUB
    CMD_WK --> LOGIC_PUB
    
    LOGIC_PUB --> LOGIC_PRI
    LOGIC_PRI --> GLOBAL
    LOGIC_PRI --> CORE
    LOGIC_PRI --> CTX
    
    GLOBAL --> CONN
    GLOBAL --> VALID
    
    CORE --> CONN
    CONN --> CLIENT
    CONN --> SCHEMA
    
    CLIENT --> CTX
    
    LOGIC_PRI -.generates data.-> MD
    
    style API fill:#f9f9f9
    style UTILS fill:#f9f9f9
    style CMD_BT fill:#f0f0f0
    style CMD_LV fill:#f0f0f0
    style CMD_WK fill:#f0f0f0
    style LOGIC_PRI fill:#e8e8e8
    style LOGIC_PUB fill:#e8e8e8
```

**Sources:** [src/lib/index.ts:1-246](), [src/lib/core/types.ts:1-105](), [src/lib/core/provide.ts:1-143]()

### Service Registration and Resolution

The system uses a custom dependency injection container that maps TYPES symbols to service factory functions. All services are registered at module load time and instantiated lazily on first access.

```mermaid
graph LR
    subgraph "DI Container Flow"
        TYPES["TYPES Symbols<br/>Symbol('strategySchemaService')<br/>Symbol('strategyConnectionService')<br/>Symbol('strategyCoreService')<br/>etc."]
        
        PROVIDE["provide() Registration<br/>provide(TYPES.x, () => new Service())"]
        
        INJECT["inject() Resolution<br/>inject&lt;ServiceType&gt;(TYPES.x)"]
        
        MEMO["Memoization<br/>Single instance per type<br/>Lazy initialization"]
        
        SERVICE["Service Instance<br/>StrategySchemaService<br/>StrategyConnectionService<br/>etc."]
    end
    
    TYPES --> PROVIDE
    PROVIDE --> MEMO
    INJECT --> MEMO
    MEMO --> SERVICE
```

**Example Registration:**
```typescript
// In provide.ts
provide(TYPES.strategySchemaService, () => new StrategySchemaService());
provide(TYPES.strategyConnectionService, () => new StrategyConnectionService());

// In index.ts
const strategySchemaService = inject<StrategySchemaService>(TYPES.strategySchemaService);
const strategyConnectionService = inject<StrategyConnectionService>(TYPES.strategyConnectionService);
```

**Sources:** [src/lib/core/provide.ts:1-143](), [src/lib/core/types.ts:1-105](), [src/lib/index.ts:1-246]()

## Architectural Patterns

### 1. Layered Service Architecture

Each layer has specific responsibilities and communicates only with adjacent layers. This enforces separation of concerns and makes the system easier to test and maintain.

| Layer | Responsibility | Examples | Communication |
|-------|---------------|----------|---------------|
| **Public API** | User-facing functions | `addStrategy()`, `listenSignal()` | Calls Validation + Schema |
| **Utility Classes** | Execution control | `Backtest`, `Live`, `Walker` | Calls Command Services |
| **Command** | Workflow orchestration | `BacktestCommandService` | Calls Logic Public |
| **Logic Public** | API wrappers with validation | `BacktestLogicPublicService` | Calls Logic Private |
| **Logic Private** | Internal algorithms | `BacktestLogicPrivateService` | Calls Global + Core + Context |
| **Global** | Subsystem facades | `RiskGlobalService` | Calls Connection + Validation |
| **Core** | Domain logic | `StrategyCoreService` | Calls Connection |
| **Connection** | Factory + Memoization | `StrategyConnectionService` | Creates Clients |
| **Schema** | Configuration storage | `StrategySchemaService` | ToolRegistry pattern |
| **Validation** | Business rules | `StrategyValidationService` | Enforces constraints |
| **Markdown** | Report generation | `BacktestMarkdownService` | Subscribes to events |
| **Client** | Business logic execution | `ClientStrategy` | Uses Context |
| **Context** | Implicit parameters | `ExecutionContextService` | AsyncLocalStorage |

**Sources:** [src/lib/index.ts:61-238](), [types.d.ts:1-50]()

### 2. Factory Pattern with Memoization

Connection services use factory pattern to create client instances. Memoization ensures proper instance isolation based on composite keys.

```mermaid
graph TD
    subgraph "Connection Service Pattern"
        CONN["StrategyConnectionService<br/>Factory with memoized cache"]
        
        KEY["Composite Key<br/>symbol:strategyName:backtest<br/>BTCUSDT:my-strategy:true"]
        
        CACHE["Memoized Cache<br/>Map&lt;string, ClientStrategy&gt;<br/>Singleton per key"]
        
        SCHEMA["StrategySchemaService<br/>retrieve(strategyName)"]
        
        CLIENT["ClientStrategy Instance<br/>Unique per key<br/>Contains state"]
    end
    
    CONN -->|"generate key"| KEY
    KEY -->|"check cache"| CACHE
    CACHE -->|"miss: create"| SCHEMA
    SCHEMA -->|"construct"| CLIENT
    CLIENT -->|"store"| CACHE
    CACHE -->|"hit: return"| CLIENT
```

**Key Construction Examples:**
- Backtest strategy: `"BTCUSDT:my-strategy:true"`
- Live strategy: `"BTCUSDT:my-strategy:false"`
- Different symbols: `"ETHUSDT:my-strategy:true"` (separate instance)

This ensures that:
- Backtest and live modes use separate instances (prevent state contamination)
- Each symbol gets its own instance (parallel execution support)
- Multiple strategies can share risk/sizing instances (portfolio-level analysis)

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts](), [src/lib/services/connection/ExchangeConnectionService.ts]()

### 3. Context Propagation with AsyncLocalStorage

Two scoped services provide implicit parameter passing without manual threading:

```mermaid
graph TB
    subgraph "Execution Context"
        EXEC_SCOPE["ExecutionContextService<br/>di-scoped with AsyncLocalStorage"]
        
        EXEC_DATA["Context Data<br/>{ symbol: 'BTCUSDT',<br/>when: Date,<br/>backtest: true }"]
        
        EXEC_USAGE["Usage in Clients<br/>ClientExchange.getCandles()<br/>ClientStrategy.tick()<br/>Implicit access to context"]
    end
    
    subgraph "Method Context"
        METHOD_SCOPE["MethodContextService<br/>di-scoped with AsyncLocalStorage"]
        
        METHOD_DATA["Context Data<br/>{ strategyName: 'my-strategy',<br/>exchangeName: 'binance',<br/>frameName: '1d-backtest' }"]
        
        METHOD_USAGE["Usage in Services<br/>ConnectionServices<br/>Retrieve correct schema"]
    end
    
    EXEC_SCOPE --> EXEC_DATA
    EXEC_DATA --> EXEC_USAGE
    
    METHOD_SCOPE --> METHOD_DATA
    METHOD_DATA --> METHOD_USAGE
```

**ExecutionContextService** provides runtime parameters:
- `symbol`: Trading pair (e.g., "BTCUSDT")
- `when`: Current timestamp for operations
- `backtest`: Boolean flag for mode detection

**MethodContextService** provides schema selection:
- `strategyName`: Which strategy to use
- `exchangeName`: Which exchange to use
- `frameName`: Which frame to use (empty for live)

This pattern eliminates the need to pass these parameters explicitly through every function call.

**Sources:** [types.d.ts:6-50](), [src/lib/services/context/ExecutionContextService.ts](), [src/lib/services/context/MethodContextService.ts]()

### 4. Event-Driven Architecture with RxJS

The system uses RxJS Subjects as a central event bus for decoupled communication between components.

```mermaid
graph TB
    subgraph "Event Producers"
        STRAT["ClientStrategy<br/>Signal state changes"]
        BT["BacktestLogicPrivateService<br/>Progress updates"]
        LV["LiveLogicPrivateService<br/>Completion events"]
        WK["WalkerLogicPrivateService<br/>Walker progress"]
        RISK["ClientRisk<br/>Risk rejections"]
        PARTIAL["ClientPartial<br/>Profit/loss levels"]
    end
    
    subgraph "Event Emitters (RxJS Subjects)"
        SIG_EM["signalEmitter<br/>All signals"]
        SIG_BT_EM["signalBacktestEmitter<br/>Backtest signals"]
        SIG_LV_EM["signalLiveEmitter<br/>Live signals"]
        PROG_BT["progressBacktestEmitter"]
        PROG_WK["progressWalkerEmitter"]
        DONE_BT["doneBacktestSubject"]
        DONE_LV["doneLiveSubject"]
        DONE_WK["doneWalkerSubject"]
        RISK_SUB["riskSubject"]
        PARTIAL_PROF["partialProfitSubject"]
        PARTIAL_LOSS["partialLossSubject"]
    end
    
    subgraph "Event Consumers"
        LISTEN["Listener Functions<br/>listenSignal()<br/>listenSignalBacktest()<br/>listenSignalLive()<br/>listenDoneBacktest()<br/>listenRisk()<br/>etc."]
        MD_BT["BacktestMarkdownService<br/>Report generation"]
        MD_LV["LiveMarkdownService<br/>Report generation"]
        MD_WK["WalkerMarkdownService<br/>Report generation"]
        USER["User Code<br/>Custom callbacks"]
    end
    
    STRAT -.emit.-> SIG_EM
    STRAT -.emit.-> SIG_BT_EM
    STRAT -.emit.-> SIG_LV_EM
    BT -.emit.-> PROG_BT
    BT -.emit.-> DONE_BT
    LV -.emit.-> DONE_LV
    WK -.emit.-> PROG_WK
    WK -.emit.-> DONE_WK
    RISK -.emit.-> RISK_SUB
    PARTIAL -.emit.-> PARTIAL_PROF
    PARTIAL -.emit.-> PARTIAL_LOSS
    
    SIG_EM --> LISTEN
    SIG_BT_EM --> LISTEN
    SIG_LV_EM --> LISTEN
    PROG_BT --> LISTEN
    DONE_BT --> LISTEN
    DONE_LV --> LISTEN
    DONE_WK --> LISTEN
    RISK_SUB --> LISTEN
    
    SIG_BT_EM --> MD_BT
    SIG_LV_EM --> MD_LV
    DONE_WK --> MD_WK
    
    LISTEN --> USER
```

**Event Hierarchy:**
- `signalEmitter`: Broadcasts ALL signals (backtest + live)
- `signalBacktestEmitter`: Backtest-only signals
- `signalLiveEmitter`: Live-only signals

This allows subscribers to listen at different granularities without tight coupling to execution logic.

**Queued Processing:**
All listener callbacks are wrapped with `queued()` from functools-kit, ensuring sequential execution even for async handlers. This prevents race conditions in event processing.

**Sources:** [src/config/emitters.ts:1-133](), [src/function/event.ts:1-969]()

## Data Flow: Backtest Execution

The following diagram shows how data flows through the system during a backtest execution:

```mermaid
sequenceDiagram
    participant User
    participant Backtest_Class as "Backtest Utility Class"
    participant BacktestCommandService
    participant BacktestLogicPublicService
    participant BacktestLogicPrivateService
    participant MethodContextService
    participant StrategyConnectionService
    participant ClientStrategy
    participant ExecutionContextService
    participant ExchangeConnectionService
    participant ClientExchange
    participant FrameConnectionService
    participant ClientFrame
    participant signalBacktestEmitter
    participant BacktestMarkdownService
    
    User->>Backtest_Class: Backtest.run(symbol, params)
    Backtest_Class->>BacktestCommandService: run(symbol, params)
    BacktestCommandService->>BacktestLogicPublicService: run(symbol, params)
    BacktestLogicPublicService->>MethodContextService: runAsyncIterator(generator, context)
    MethodContextService->>BacktestLogicPrivateService: execute backtest generator
    
    BacktestLogicPrivateService->>FrameConnectionService: getFrame(frameName)
    FrameConnectionService-->>BacktestLogicPrivateService: ClientFrame instance
    BacktestLogicPrivateService->>ClientFrame: getTimeframe(symbol, frameName)
    ClientFrame-->>BacktestLogicPrivateService: timeframe: Date[]
    
    loop For each timestamp in timeframe
        BacktestLogicPrivateService->>ExecutionContextService: runInContext({ symbol, when, backtest: true })
        ExecutionContextService->>StrategyConnectionService: getStrategy(symbol, strategyName)
        StrategyConnectionService-->>ExecutionContextService: ClientStrategy instance
        
        ExecutionContextService->>ClientStrategy: tick(symbol, when)
        ClientStrategy->>ExchangeConnectionService: getExchange(exchangeName)
        ExchangeConnectionService-->>ClientStrategy: ClientExchange instance
        ClientStrategy->>ClientExchange: getAveragePrice(symbol)
        ClientExchange->>ClientExchange: getCandles(symbol, "1m", 5)
        ClientExchange-->>ClientStrategy: VWAP price
        
        ClientStrategy->>ClientStrategy: Process signal state machine
        ClientStrategy->>signalBacktestEmitter: emit(tickResult)
        signalBacktestEmitter->>BacktestMarkdownService: receive signal event
        ClientStrategy-->>BacktestLogicPrivateService: yield tickResult
    end
    
    BacktestLogicPrivateService-->>BacktestLogicPublicService: AsyncGenerator completed
    BacktestLogicPublicService-->>BacktestCommandService: execution complete
    BacktestCommandService-->>Backtest_Class: statistics
    Backtest_Class-->>User: BacktestStatisticsModel
```

**Key Observations:**
1. **MethodContextService** wraps the generator to provide schema context
2. **ExecutionContextService** wraps each tick to provide runtime context
3. **Connection Services** provide memoized client instances
4. **ClientStrategy** orchestrates signal logic and emits events
5. **Event emitters** enable parallel data collection (markdown, user callbacks)

**Sources:** [src/classes/Backtest.ts](), [src/lib/services/command/BacktestCommandService.ts](), [src/lib/services/logic/public/BacktestLogicPublicService.ts](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts](), [src/client/ClientStrategy.ts]()

## Design Principles

### Temporal Isolation

**ExecutionContextService** enforces temporal isolation by controlling which timestamp is "current" for all operations. During backtesting, `when` is set to the candle timestamp being processed. During live trading, `when` is set to `Date.now()`.

**ClientExchange.getCandles()** uses the context's `when` value to fetch historical candles:
- In backtest mode: Fetches candles BEFORE the context timestamp (prevents look-ahead bias)
- In live mode: Fetches most recent candles up to `Date.now()`

This ensures strategies cannot access "future" data during backtesting, making backtest results realistic.

**Sources:** [types.d.ts:6-18](), [src/client/ClientExchange.ts](), [src/lib/services/context/ExecutionContextService.ts]()

### Crash-Safe Persistence

**PersistBase** abstract class provides atomic file writes using the temp-rename pattern:
1. Write data to temporary file: `signal.json.tmp`
2. Call `fsync()` to ensure disk write
3. Rename temp file to final: `signal.json`
4. OS guarantees rename is atomic

Multiple persistence adapters extend `PersistBase`:
- **PersistSignalAdapter**: Active signals per symbol/strategy
- **PersistRiskAdapter**: Portfolio state per risk profile
- **PersistScheduleAdapter**: Scheduled signals per symbol/strategy
- **PersistPartialAdapter**: Profit/loss milestone tracking per symbol/strategy

Each adapter has separate file paths to prevent cross-contamination. On restart, `waitForInit()` loads state from disk files.

**Sources:** [src/classes/Persist.ts](), [src/client/ClientStrategy.ts](), [types.d.ts:165-180]()

### Type-Safe Discriminated Unions

Signal state machine uses TypeScript discriminated unions for type-safe state handling:

```typescript
type IStrategyTickResult = 
  | IStrategyTickResultIdle       // action: "idle"
  | IStrategyTickResultScheduled  // action: "scheduled"
  | IStrategyTickResultOpened     // action: "opened"
  | IStrategyTickResultActive     // action: "active"
  | IStrategyTickResultClosed     // action: "closed"
  | IStrategyTickResultCancelled  // action: "cancelled"
```

Each state has distinct properties. TypeScript narrows the type based on the `action` discriminator:

```typescript
if (result.action === "closed") {
  // TypeScript knows result is IStrategyTickResultClosed
  console.log(result.pnl.pnlPercentage);  // OK
  console.log(result.closeReason);         // OK
}
```

This prevents accessing properties that don't exist in the current state, catching bugs at compile time.

**Sources:** [types.d.ts:769-895](), [src/interfaces/Strategy.interface.ts]()

### Memoized Service Instantiation

Connection services use memoization to ensure singleton behavior per composite key:

```typescript
// StrategyConnectionService.getStrategy() pseudo-code
getStrategy(symbol: string, strategyName: string, backtest: boolean) {
  const key = `${symbol}:${strategyName}:${backtest}`;
  
  if (!this.cache.has(key)) {
    const schema = this.schemaService.retrieve(strategyName);
    const instance = new ClientStrategy({
      ...schema,
      logger: this.logger,
      execution: this.executionContextService,
      // ... other dependencies
    });
    this.cache.set(key, instance);
  }
  
  return this.cache.get(key);
}
```

This pattern:
- Prevents duplicate instantiation (performance)
- Maintains state per key (correctness)
- Supports parallel execution (isolation)

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts](), [src/lib/services/connection/ExchangeConnectionService.ts](), [src/lib/services/connection/PartialConnectionService.ts]()

## Component Interaction Example: Risk Management

The following diagram shows how risk management integrates across layers:

```mermaid
sequenceDiagram
    participant User
    participant addRisk_Function as "addRisk() Function"
    participant RiskValidationService
    participant RiskSchemaService
    participant ClientStrategy
    participant RiskConnectionService
    participant ClientRisk
    participant PersistRiskAdapter
    participant riskSubject
    
    User->>addRisk_Function: addRisk(riskSchema)
    addRisk_Function->>RiskValidationService: validate schema
    RiskValidationService-->>addRisk_Function: validation passed
    addRisk_Function->>RiskSchemaService: register(riskName, schema)
    RiskSchemaService-->>User: registered
    
    Note over ClientStrategy: Later, during signal generation...
    
    ClientStrategy->>ClientStrategy: getSignal() returns signal
    ClientStrategy->>RiskConnectionService: getRisk(riskName)
    RiskConnectionService->>RiskSchemaService: retrieve(riskName)
    RiskSchemaService-->>RiskConnectionService: schema
    RiskConnectionService->>ClientRisk: new ClientRisk(params)
    ClientRisk->>PersistRiskAdapter: waitForInit(symbol)
    PersistRiskAdapter->>PersistRiskAdapter: load state from disk
    PersistRiskAdapter-->>ClientRisk: initialized
    ClientRisk-->>RiskConnectionService: instance (memoized)
    RiskConnectionService-->>ClientStrategy: ClientRisk instance
    
    ClientStrategy->>ClientRisk: checkSignal(params)
    ClientRisk->>ClientRisk: run validation chain
    
    alt Validation passes
        ClientRisk-->>ClientStrategy: true
        ClientStrategy->>ClientRisk: addSignal(symbol, context)
        ClientRisk->>PersistRiskAdapter: persist portfolio state
        ClientStrategy->>ClientStrategy: open signal
    else Validation fails
        ClientRisk->>riskSubject: emit rejection event
        ClientRisk-->>ClientStrategy: false
        ClientStrategy->>ClientStrategy: reject signal
    end
```

**Key Interactions:**
1. **Registration**: User calls `addRisk()` → validates → stores in SchemaService
2. **Instantiation**: ClientStrategy requests ClientRisk → ConnectionService checks cache → creates if needed
3. **State Loading**: ClientRisk calls `waitForInit()` → PersistRiskAdapter loads from disk
4. **Validation**: ClientRisk runs validation chain → emits event on rejection
5. **State Update**: On signal open/close → ClientRisk updates portfolio state → persists to disk

**Sources:** [src/function/add.ts:270-343](), [src/lib/services/connection/RiskConnectionService.ts](), [src/client/ClientRisk.ts](), [src/classes/Persist.ts](), [src/config/emitters.ts:127-132]()

## Summary

The backtest-kit architecture is characterized by:

1. **Layered Services**: Clear separation of concerns across 9+ service layers
2. **Dependency Injection**: Custom DI container with lazy instantiation and memoization
3. **Context Propagation**: AsyncLocalStorage-based implicit parameter passing
4. **Event-Driven**: RxJS Subjects for decoupled communication with queued processing
5. **Factory Pattern**: Connection services with composite key-based memoization
6. **Temporal Isolation**: Context-aware data access prevents look-ahead bias
7. **Crash Recovery**: Atomic file writes enable graceful recovery from failures
8. **Type Safety**: Discriminated unions for compile-time correctness

This architecture enables the framework to support complex trading workflows while maintaining testability, extensibility, and reliability. The layered design ensures that changes to one component (e.g., persistence implementation) do not cascade to unrelated components (e.g., signal generation logic).

**Sources:** [src/lib/index.ts:1-246](), [src/lib/core/types.ts:1-105](), [src/lib/core/provide.ts:1-143](), [types.d.ts:1-1190](), [src/index.ts:1-199]()
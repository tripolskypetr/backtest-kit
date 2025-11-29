# Layer Responsibilities

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [assets/uml.svg](assets/uml.svg)
- [docs/internals.md](docs/internals.md)
- [docs/uml.puml](docs/uml.puml)
- [scripts/_convert-md-mermaid-to-svg.cjs](scripts/_convert-md-mermaid-to-svg.cjs)
- [scripts/gpt-docs.mjs](scripts/gpt-docs.mjs)
- [scripts/uml.mjs](scripts/uml.mjs)
- [src/function/add.ts](src/function/add.ts)
- [src/function/list.ts](src/function/list.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)

</details>



This document describes the six-layer service architecture of backtest-kit and the responsibilities of each layer. The framework follows a clean architecture pattern with strict separation of concerns, dependency injection, and unidirectional data flow from public API down to infrastructure.

For information about how dependency injection works across these layers, see [Dependency Injection System](#3.2). For details on how context flows through the layers, see [Context Propagation](#3.3).

---

## Architecture Overview

The backtest-kit framework organizes services into six distinct layers, each with specific responsibilities. Services are bound via dependency injection using Symbol-based tokens defined in [src/lib/core/types.ts:1-81]().

**Layer Organization Diagram**

```mermaid
graph TB
    subgraph "Layer 1: Public API"
        API["addStrategy()<br/>addExchange()<br/>addFrame()<br/>addRisk()<br/>addSizing()<br/>addWalker()<br/>listStrategies()"]
    end
    
    subgraph "Layer 2: Logic Services"
        LogicPublic["BacktestLogicPublicService<br/>LiveLogicPublicService<br/>WalkerLogicPublicService"]
        LogicPrivate["BacktestLogicPrivateService<br/>LiveLogicPrivateService<br/>WalkerLogicPrivateService"]
    end
    
    subgraph "Layer 3: Connection Services"
        Connection["StrategyConnectionService<br/>ExchangeConnectionService<br/>RiskConnectionService<br/>FrameConnectionService<br/>SizingConnectionService"]
    end
    
    subgraph "Layer 4: Client Classes"
        Client["ClientStrategy<br/>ClientExchange<br/>ClientRisk<br/>ClientFrame<br/>ClientSizing"]
    end
    
    subgraph "Layer 5: Schema & Validation"
        Schema["StrategySchemaService<br/>ExchangeSchemaService<br/>RiskSchemaService"]
        Validation["StrategyValidationService<br/>ExchangeValidationService<br/>RiskValidationService"]
    end
    
    subgraph "Layer 6: Reporting"
        Markdown["BacktestMarkdownService<br/>LiveMarkdownService<br/>WalkerMarkdownService"]
    end
    
    API --> LogicPublic
    API --> Validation
    LogicPublic --> LogicPrivate
    LogicPrivate --> Connection
    Connection --> Client
    Connection --> Schema
    LogicPrivate --> Markdown
    Validation --> Schema
```

**Sources**: [src/lib/core/types.ts:1-81](), [src/lib/core/provide.ts:1-111](), [src/lib/index.ts:1-170](), [docs/internals.md:28-40]()

---

## Layer 1: Public API

The Public API layer provides the user-facing functions for component registration and execution. These functions have no business logic and immediately delegate to Global Services.

### Registration Functions

Component registration functions are exposed in [src/function/add.ts:1-342]():

| Function | Purpose | Delegates To |
|----------|---------|--------------|
| `addStrategy()` | Register strategy schema | `StrategyValidationService.addStrategy()`<br/>`StrategySchemaService.register()` |
| `addExchange()` | Register exchange schema | `ExchangeValidationService.addExchange()`<br/>`ExchangeSchemaService.register()` |
| `addFrame()` | Register timeframe schema | `FrameValidationService.addFrame()`<br/>`FrameSchemaService.register()` |
| `addRisk()` | Register risk profile | `RiskValidationService.addRisk()`<br/>`RiskSchemaService.register()` |
| `addSizing()` | Register sizing method | `SizingValidationService.addSizing()`<br/>`SizingSchemaService.register()` |
| `addWalker()` | Register strategy comparison | `WalkerValidationService.addWalker()`<br/>`WalkerSchemaService.register()` |

### Query Functions

Component listing functions are exposed in [src/function/list.ts:1-218]():

| Function | Purpose | Delegates To |
|----------|---------|--------------|
| `listStrategies()` | Get all strategy schemas | `StrategyValidationService.list()` |
| `listExchanges()` | Get all exchange schemas | `ExchangeValidationService.list()` |
| `listFrames()` | Get all frame schemas | `FrameValidationService.list()` |
| `listRisks()` | Get all risk schemas | `RiskValidationService.list()` |
| `listSizings()` | Get all sizing schemas | `SizingValidationService.list()` |
| `listWalkers()` | Get all walker schemas | `WalkerValidationService.list()` |

### Execution Classes

Execution entry points provide static methods for running backtests and live trading:

- `Backtest.run()` / `Backtest.background()` - Historical simulation
- `Live.run()` / `Live.background()` - Real-time trading
- `Walker.run()` / `Walker.background()` - Multi-strategy comparison

These delegate to corresponding Global Services which wrap Logic Services with validation.

**Sources**: [src/function/add.ts:1-342](), [src/function/list.ts:1-218]()

---

## Layer 2: Logic Services

Logic Services orchestrate the core execution flow. They are split into Public and Private services to separate context management from core logic.

### Public Logic Services

Public logic services wrap execution in context and provide the public interface:

**Logic Service Responsibilities**

```mermaid
graph LR
    User["User Code"] --> BLP["BacktestLogicPublicService"]
    User --> LLP["LiveLogicPublicService"]
    User --> WLP["WalkerLogicPublicService"]
    
    BLP --> MethodCtx["MethodContextService.runAsyncIterator()"]
    LLP --> MethodCtx
    WLP --> MethodCtx
    
    MethodCtx --> BLPS["BacktestLogicPrivateService"]
    MethodCtx --> LLPS["LiveLogicPrivateService"]
    MethodCtx --> WLPS["WalkerLogicPrivateService"]
```

Each public service:

1. Accepts context parameters (strategyName, exchangeName, frameName)
2. Wraps private service call with `MethodContextService.runAsyncIterator()`
3. Returns async generator from private service

**Example from BacktestLogicPublicService**:

The public service receives context and wraps the private service:

```
run(symbol, { strategyName, exchangeName, frameName }) {
  return methodContextService.runAsyncIterator(
    () => backtestLogicPrivateService.run(symbol),
    { strategyName, exchangeName, frameName }
  )
}
```

### Private Logic Services

Private logic services contain the core execution orchestration:

| Service | Responsibility | Key Methods |
|---------|---------------|-------------|
| `BacktestLogicPrivateService` | Iterate timeframes, call strategy.tick(), yield signals | `run()`, emits to `signalBacktestEmitter` |
| `LiveLogicPrivateService` | Infinite loop, Date.now() progression, persistence | `run()`, emits to `signalLiveEmitter` |
| `WalkerLogicPrivateService` | Run multiple strategies, compare metrics | `run()`, emits to `walkerEmitter` |

These services have dependencies on:
- `StrategyGlobalService` - Strategy operations
- `ExchangeGlobalService` - Market data (backtest only)
- `FrameGlobalService` - Timeframe generation (backtest only)
- Markdown services - Report generation

**Sources**: [src/lib/core/types.ts:38-48](), [src/lib/core/provide.ts:81-91](), [docs/internals.md:36-37]()

---

## Layer 3: Connection Services

Connection Services manage memoized client instances. Each service creates and caches client instances by component name, ensuring only one instance exists per registered component.

### Service Registry

Connection services are defined in [src/lib/core/types.ts:10-16]():

```typescript
const connectionServices = {
    exchangeConnectionService: Symbol('exchangeConnectionService'),
    strategyConnectionService: Symbol('strategyConnectionService'),
    frameConnectionService: Symbol('frameConnectionService'),
    sizingConnectionService: Symbol('sizingConnectionService'),
    riskConnectionService: Symbol('riskConnectionService'),
}
```

### Memoization Pattern

**Connection Service Architecture**

```mermaid
graph TB
    SGS["StrategyGlobalService"] --> SCS["StrategyConnectionService"]
    SCS --> Memo{"Memoized<br/>Instance Cache"}
    Memo -->|"Cache Miss"| Create["new ClientStrategy()"]
    Memo -->|"Cache Hit"| Cached["Return Existing<br/>ClientStrategy"]
    
    Create --> Inject["Inject Dependencies:<br/>- strategySchema<br/>- riskConnectionService<br/>- exchangeConnectionService"]
    
    Inject --> CS["ClientStrategy Instance"]
    Cached --> CS
```

Each Connection Service:

1. **Retrieves schema** from corresponding Schema Service
2. **Checks memoization cache** by component name
3. **Creates client instance** if not cached, injecting dependencies
4. **Returns memoized instance** for subsequent calls

Connection services inject their dependencies into client constructors:

- `StrategyConnectionService` injects `RiskConnectionService` and `ExchangeConnectionService`
- `ExchangeConnectionService` injects `ExecutionContextService`
- `RiskConnectionService` injects `RiskSchemaService`
- `FrameConnectionService` injects `FrameSchemaService`
- `SizingConnectionService` injects `SizingSchemaService`

**Sources**: [src/lib/core/types.ts:10-16](), [src/lib/core/provide.ts:53-59](), [docs/internals.md:34]()

---

## Layer 4: Client Classes

Client Classes contain pure business logic without dependency injection dependencies. They implement the core algorithms and state management.

### Client Responsibilities

**Client Class Hierarchy**

```mermaid
graph TB
    subgraph "ClientStrategy"
        CS_Init["waitForInit()<br/>Load persisted state"]
        CS_Tick["tick()<br/>Generate/monitor signals"]
        CS_Fast["backtest()<br/>Fast-forward simulation"]
        CS_Persist["setPendingSignal()<br/>Atomic file writes"]
    end
    
    subgraph "ClientExchange"
        CE_Candles["getCandles()<br/>Fetch market data"]
        CE_VWAP["getAveragePrice()<br/>VWAP calculation"]
        CE_Format["formatPrice()<br/>formatQuantity()"]
    end
    
    subgraph "ClientRisk"
        CR_Track["addSignal()<br/>removeSignal()"]
        CR_Check["checkSignal()<br/>Portfolio-level validation"]
        CR_Active["_activePositions Map<br/>strategyName:symbol keys"]
    end
    
    subgraph "ClientFrame"
        CF_Gen["getTimeframe()<br/>Interval-based timestamps"]
    end
    
    subgraph "ClientSizing"
        CSZ_Calc["calculateQuantity()<br/>Fixed/Kelly/ATR methods"]
    end
    
    CS_Tick --> CE_VWAP
    CS_Tick --> CR_Check
    CS_Tick --> CSZ_Calc
    CS_Fast --> CE_Candles
    CR_Check --> CR_Active
```

| Client Class | Primary Responsibility | Key State |
|--------------|----------------------|-----------|
| `ClientStrategy` | Signal lifecycle management, tick/backtest execution | `_pendingSignal`, `_lastSignalTimestamp` |
| `ClientExchange` | Market data fetching, VWAP calculation, formatting | Stateless (delegates to schema functions) |
| `ClientRisk` | Position tracking, custom validation execution | `_activePositions` Map |
| `ClientFrame` | Timeframe generation for backtesting | Stateless |
| `ClientSizing` | Position size calculation | Stateless |

### Pure Business Logic

Client classes have NO direct dependency injection. Instead:

1. **Constructor parameters** are simple values or functions from schemas
2. **Service dependencies** are passed via Connection Service injection
3. **Prototype methods** are used for memory efficiency (not arrow functions)

Example: `ClientStrategy` receives schema functions and other clients as constructor parameters, not DI symbols.

**Sources**: [docs/internals.md:30]()

---

## Layer 5: Schema & Validation Services

Schema and Validation Services manage component registration and runtime validation. They use a parallel service structure with distinct responsibilities.

### Schema Services

Schema Services store component configurations using the `ToolRegistry` pattern:

**Schema Service Pattern**

```mermaid
graph LR
    Add["addStrategy()"] --> SSS["StrategySchemaService"]
    SSS --> Registry["ToolRegistry<br/>Internal Storage"]
    Registry --> Validate["validateShallow()<br/>Type checking"]
    
    Get["get(strategyName)"] --> Registry
    Override["override(name, partial)"] --> Registry
```

Each Schema Service provides:

| Method | Purpose |
|--------|---------|
| `register(name, schema)` | Store component configuration |
| `get(name)` | Retrieve configuration by name |
| `validateShallow(schema)` | Check schema structure and types |
| `override(name, partial)` | Update existing schema |

Schema services are defined in [src/lib/core/types.ts:18-25]():

```typescript
const schemaServices = {
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    strategySchemaService: Symbol('strategySchemaService'),
    frameSchemaService: Symbol('frameSchemaService'),
    walkerSchemaService: Symbol('walkerSchemaService'),
    sizingSchemaService: Symbol('sizingSchemaService'),
    riskSchemaService: Symbol('riskSchemaService'),
}
```

### Validation Services

Validation Services perform runtime existence checks with memoization:

**Validation Service Pattern**

```mermaid
graph TB
    API["addStrategy(schema)"] --> VS["StrategyValidationService"]
    VS --> Store["Store in Internal Map"]
    
    Call["validate(strategyName)"] --> Check{"Exists in Map?"}
    Check -->|No| Error["Throw Error"]
    Check -->|Yes| RiskCheck{"Has riskName?"}
    RiskCheck -->|Yes| ValidateRisk["RiskValidationService.validate()"]
    RiskCheck -->|No| Success["Return Success"]
    ValidateRisk --> Success
```

Each Validation Service provides:

| Method | Purpose |
|--------|---------|
| `addStrategy(name, schema)` | Register component for validation |
| `validate(name)` | Check existence and dependencies |
| `list()` | Return all registered schemas |

Validation services are defined in [src/lib/core/types.ts:59-66]():

```typescript
const validationServices = {
    exchangeValidationService: Symbol('exchangeValidationService'),
    strategyValidationService: Symbol('strategyValidationService'),
    frameValidationService: Symbol('frameValidationService'),
    walkerValidationService: Symbol('walkerValidationService'),
    sizingValidationService: Symbol('sizingValidationService'),
    riskValidationService: Symbol('riskValidationService'),
}
```

**Example Validation Flow**:

When `BacktestLogicPublicService` starts execution:
1. Calls `StrategyValidationService.validate(strategyName)`
2. Calls `ExchangeValidationService.validate(exchangeName)`
3. Calls `FrameValidationService.validate(frameName)`
4. If strategy has `riskName`, validates via `RiskValidationService.validate(riskName)`

**Sources**: [src/lib/core/types.ts:18-25](), [src/lib/core/types.ts:59-66](), [src/lib/core/provide.ts:61-68](), [src/lib/core/provide.ts:102-109](), [docs/internals.md:32-34]()

---

## Layer 6: Markdown Services

Markdown Services subscribe to event emitters and accumulate data for report generation. Each execution mode has a dedicated markdown service.

### Service Registry

Markdown services are defined in [src/lib/core/types.ts:50-57]():

```typescript
const markdownServices = {
    backtestMarkdownService: Symbol('backtestMarkdownService'),
    liveMarkdownService: Symbol('liveMarkdownService'),
    scheduleMarkdownService: Symbol('scheduleMarkdownService'),
    performanceMarkdownService: Symbol('performanceMarkdownService'),
    walkerMarkdownService: Symbol('walkerMarkdownService'),
    heatMarkdownService: Symbol('heatMarkdownService'),
}
```

### Event Subscription Pattern

**Markdown Service Data Flow**

```mermaid
graph TB
    Emit["BacktestLogicPrivateService"] --> SigEmit["signalBacktestEmitter.next()"]
    SigEmit --> BMS["BacktestMarkdownService"]
    
    BMS --> Subscribe["Subscribe on Initialization"]
    Subscribe --> Store["ReportStorage<br/>Memoized by strategyName"]
    Store --> EventList["_eventList<br/>Max 250 events"]
    
    GetData["Backtest.getData()"] --> BMS
    BMS --> Calc["Calculate Statistics:<br/>- Total PNL<br/>- Win Rate<br/>- Sharpe Ratio<br/>- Drawdown"]
    
    GetReport["Backtest.getReport()"] --> BMS
    BMS --> Format["Format Markdown Tables"]
    
    Dump["Backtest.dump()"] --> BMS
    BMS --> Write["fs.writeFileSync()"]
```

Each Markdown Service:

1. **Subscribes to emitter** during initialization
2. **Accumulates events** in memoized storage by strategy/walker name
3. **Limits event queue** (e.g., `LiveMarkdownService` max 250 events)
4. **Calculates statistics** on demand via `getData()`
5. **Formats markdown** via `getReport()`
6. **Writes to disk** via `dump()`

### Report Storage

Storage is memoized per component:
- `BacktestMarkdownService` - One storage per (strategyName, exchangeName, frameName)
- `LiveMarkdownService` - One storage per (strategyName, exchangeName)
- `WalkerMarkdownService` - One storage per walkerName

**Sources**: [src/lib/core/types.ts:50-57](), [src/lib/core/provide.ts:93-100](), [docs/internals.md:37]()

---

## Cross-Cutting Services

Three services span all layers and provide infrastructure concerns.

### LoggerService

The `LoggerService` provides logging infrastructure with automatic context injection:

```mermaid
graph LR
    Any["Any Service"] --> LS["LoggerService"]
    LS --> Ctx{"Has Context?"}
    Ctx -->|Yes| Inject["Inject strategyName,<br/>exchangeName, symbol"]
    Ctx -->|No| Direct["Log directly"]
    Inject --> Custom["User-defined ILogger"]
    Direct --> Custom
```

Injected into nearly every service via [src/lib/core/types.ts:1-3]():

```typescript
const baseServices = {
    loggerService: Symbol('loggerService'),
}
```

### ExecutionContextService

The `ExecutionContextService` manages execution-time parameters using `di-scoped`:

| Property | Purpose |
|----------|---------|
| `symbol` | Trading pair (e.g., "BTCUSDT") |
| `when` | Current timestamp (Date for live, historical for backtest) |
| `backtest` | Boolean flag indicating execution mode |

Used by client classes to access current execution context without explicit parameter passing.

### MethodContextService

The `MethodContextService` manages component selection using `di-scoped`:

| Property | Purpose |
|----------|---------|
| `strategyName` | Active strategy identifier |
| `exchangeName` | Active exchange identifier |
| `frameName` | Active frame identifier (backtest only) |

Used by Connection Services to resolve which component instance to return.

**Sources**: [src/lib/core/types.ts:1-8](), [src/lib/index.ts:49-60](), [docs/internals.md:72-73]()

---

## Layer Interaction Patterns

### Registration Flow

**Component Registration Pattern**

```mermaid
sequenceDiagram
    participant User
    participant addStrategy
    participant StrategyValidationService
    participant StrategySchemaService
    
    User->>addStrategy: addStrategy(schema)
    addStrategy->>StrategyValidationService: addStrategy(name, schema)
    StrategyValidationService->>StrategyValidationService: Store in internal map
    addStrategy->>StrategySchemaService: register(name, schema)
    StrategySchemaService->>StrategySchemaService: validateShallow(schema)
    StrategySchemaService->>StrategySchemaService: Store in ToolRegistry
```

1. Public API function receives schema
2. Validation Service stores for runtime checks
3. Schema Service validates structure and stores in registry

### Execution Flow

**Backtest Execution Pattern**

```mermaid
sequenceDiagram
    participant User
    participant BacktestLogicPublicService
    participant MethodContextService
    participant BacktestLogicPrivateService
    participant StrategyConnectionService
    participant ClientStrategy
    
    User->>BacktestLogicPublicService: run(symbol, context)
    BacktestLogicPublicService->>MethodContextService: runAsyncIterator(fn, context)
    MethodContextService->>BacktestLogicPrivateService: run(symbol)
    BacktestLogicPrivateService->>StrategyConnectionService: get()
    StrategyConnectionService->>StrategyConnectionService: Check memoization cache
    StrategyConnectionService->>ClientStrategy: new ClientStrategy() [if not cached]
    StrategyConnectionService-->>BacktestLogicPrivateService: Return ClientStrategy
    BacktestLogicPrivateService->>ClientStrategy: tick(symbol)
    ClientStrategy-->>BacktestLogicPrivateService: Signal result
    BacktestLogicPrivateService-->>User: yield signal
```

1. Public service wraps with MethodContext
2. Private service gets client from Connection Service
3. Connection Service returns memoized instance
4. Private service calls client methods
5. Results yielded to user

### Data Flow Direction

All data flows unidirectionally down the layers:

```
Layer 1 (Public API)
    ↓ Delegates
Layer 2 (Logic Services)
    ↓ Requests Instances
Layer 3 (Connection Services)
    ↓ Creates/Returns
Layer 4 (Client Classes)
    ↓ Uses
Layer 5 (Schemas)
```

Events flow horizontally to Layer 6 (Markdown Services) for reporting.

**Sources**: [src/function/add.ts:50-62](), [docs/internals.md:54-92]()

---

## Service Binding

All services are bound in [src/lib/core/provide.ts:1-111]() using the `provide()` function from the DI container. Services are organized in blocks matching their layer:

```typescript
// Base Services (Cross-cutting)
provide(TYPES.loggerService, () => new LoggerService());

// Context Services (Cross-cutting)
provide(TYPES.executionContextService, () => new ExecutionContextService());
provide(TYPES.methodContextService, () => new MethodContextService());

// Connection Services (Layer 3)
provide(TYPES.strategyConnectionService, () => new StrategyConnectionService());
provide(TYPES.exchangeConnectionService, () => new ExchangeConnectionService());

// Schema Services (Layer 5)
provide(TYPES.strategySchemaService, () => new StrategySchemaService());

// Global Services (Layer 2 wrappers)
provide(TYPES.strategyGlobalService, () => new StrategyGlobalService());

// Logic Services (Layer 2)
provide(TYPES.backtestLogicPrivateService, () => new BacktestLogicPrivateService());
provide(TYPES.backtestLogicPublicService, () => new BacktestLogicPublicService());

// Markdown Services (Layer 6)
provide(TYPES.backtestMarkdownService, () => new BacktestMarkdownService());

// Validation Services (Layer 5)
provide(TYPES.strategyValidationService, () => new StrategyValidationService());
```

All services are then exported as a single object in [src/lib/index.ts:152-162]():

```typescript
export const backtest = {
  ...baseServices,
  ...contextServices,
  ...connectionServices,
  ...schemaServices,
  ...globalServices,
  ...logicPrivateServices,
  ...logicPublicServices,
  ...markdownServices,
  ...validationServices,
};
```

**Sources**: [src/lib/core/provide.ts:1-111](), [src/lib/index.ts:49-162]()
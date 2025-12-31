# Service Layer

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/classes/Backtest.ts](src/classes/Backtest.ts)
- [src/classes/Live.ts](src/classes/Live.ts)
- [src/classes/Walker.ts](src/classes/Walker.ts)
- [src/function/add.ts](src/function/add.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [src/lib/services/connection/StrategyConnectionService.ts](src/lib/services/connection/StrategyConnectionService.ts)

</details>



The Service Layer provides the orchestration infrastructure that coordinates business logic execution across the framework. It implements a layered architecture where ~60 services are organized into functional categories, each handling a specific aspect of system operation: connection management, schema registration, validation, context injection, execution logic, and reporting. Services communicate through dependency injection, with the `backtest` aggregation object providing a unified namespace for all service access.

For information about the core business logic classes (`ClientStrategy`, `ClientExchange`, etc.) that services orchestrate, see [Core Business Logic](#6). For dependency injection implementation details, see [Dependency Injection System](#3.2).

## Service Organization

Services follow a matrix organization pattern where most component types (Strategy, Exchange, Frame, Risk, Sizing) have corresponding service variants across multiple functional categories. This creates a predictable structure where finding a service for a specific component and function is straightforward.

The service matrix spans two dimensions:

| Component Type | Connection | Schema | Global | Validation | Markdown |
|---------------|-----------|--------|--------|------------|----------|
| Strategy | StrategyConnectionService | StrategySchemaService | StrategyGlobalService | StrategyValidationService | - |
| Exchange | ExchangeConnectionService | ExchangeSchemaService | ExchangeGlobalService | ExchangeValidationService | - |
| Frame | FrameConnectionService | FrameSchemaService | FrameGlobalService | FrameValidationService | - |
| Risk | RiskConnectionService | RiskSchemaService | RiskGlobalService | RiskValidationService | - |
| Sizing | SizingConnectionService | SizingSchemaService | SizingGlobalService | SizingValidationService | - |
| Walker | - | WalkerSchemaService | - | WalkerValidationService | WalkerMarkdownService |
| Optimizer | OptimizerConnectionService | OptimizerSchemaService | OptimizerGlobalService | OptimizerValidationService | - |
| Partial | PartialConnectionService | - | PartialGlobalService | - | PartialMarkdownService |

Additional service categories exist for execution modes:

- **Command Services**: BacktestCommandService, LiveCommandService, WalkerCommandService
- **Logic Services**: BacktestLogicPrivateService, BacktestLogicPublicService, LiveLogicPrivateService, LiveLogicPublicService, WalkerLogicPrivateService, WalkerLogicPublicService
- **Markdown Services**: BacktestMarkdownService, LiveMarkdownService, ScheduleMarkdownService, PerformanceMarkdownService, HeatMarkdownService
- **Context Services**: ExecutionContextService, MethodContextService
- **Template Services**: OptimizerTemplateService

**Sources:** [src/lib/index.ts:57-224](), [src/lib/core/types.ts:1-96]()

## Service Categories

```mermaid
graph TB
    subgraph "Base Services"
        Logger["LoggerService<br/>Structured logging"]
    end
    
    subgraph "Context Services"
        ExecCtx["ExecutionContextService<br/>symbol, when, backtest"]
        MethodCtx["MethodContextService<br/>strategyName, exchangeName, frameName"]
    end
    
    subgraph "Connection Services"
        StratConn["StrategyConnectionService<br/>Memoized ClientStrategy instances<br/>tick(), backtest(), stop()"]
        ExchConn["ExchangeConnectionService<br/>Memoized ClientExchange instances<br/>getCandles(), formatPrice()"]
        RiskConn["RiskConnectionService<br/>Memoized ClientRisk instances<br/>checkSignal(), addSignal()"]
        SizingConn["SizingConnectionService<br/>Memoized ClientSizing instances<br/>calculate()"]
        FrameConn["FrameConnectionService<br/>Memoized ClientFrame instances<br/>getTimeframes()"]
        OptimizerConn["OptimizerConnectionService<br/>Memoized ClientOptimizer instances<br/>getData(), getCode()"]
        PartialConn["PartialConnectionService<br/>Memoized ClientPartial instances<br/>check()"]
    end
    
    subgraph "Schema Services"
        StratSchema["StrategySchemaService<br/>Registry: name → IStrategySchema<br/>register(), get()"]
        ExchSchema["ExchangeSchemaService<br/>Registry: name → IExchangeSchema"]
        FrameSchema["FrameSchemaService<br/>Registry: name → IFrameSchema"]
        WalkerSchema["WalkerSchemaService<br/>Registry: name → IWalkerSchema"]
        SizingSchema["SizingSchemaService<br/>Registry: name → ISizingSchema"]
        RiskSchema["RiskSchemaService<br/>Registry: name → IRiskSchema"]
        OptimizerSchema["OptimizerSchemaService<br/>Registry: name → IOptimizerSchema"]
    end
    
    subgraph "Global Services"
        StratGlobal["StrategyGlobalService<br/>Context injection wrapper<br/>tick(), backtest() with context"]
        ExchGlobal["ExchangeGlobalService<br/>Context injection wrapper<br/>getCandles() with context"]
        FrameGlobal["FrameGlobalService<br/>Context injection wrapper<br/>getTimeframes() with context"]
        RiskGlobal["RiskGlobalService<br/>Context injection wrapper<br/>checkSignal() with context"]
        SizingGlobal["SizingGlobalService<br/>Context injection wrapper<br/>calculate() with context"]
        OptimizerGlobal["OptimizerGlobalService<br/>Context injection wrapper<br/>getData() with context"]
        PartialGlobal["PartialGlobalService<br/>Context injection wrapper<br/>check() with context"]
    end
    
    subgraph "Validation Services"
        StratValid["StrategyValidationService<br/>30+ signal rules<br/>validate(), addStrategy()"]
        ExchValid["ExchangeValidationService<br/>Schema validation<br/>validate(), addExchange()"]
        FrameValid["FrameValidationService<br/>Schema validation<br/>validate(), addFrame()"]
        WalkerValid["WalkerValidationService<br/>Schema validation<br/>validate(), addWalker()"]
        SizingValid["SizingValidationService<br/>Schema validation<br/>validate(), addSizing()"]
        RiskValid["RiskValidationService<br/>Schema validation<br/>validate(), addRisk()"]
        OptimizerValid["OptimizerValidationService<br/>Schema validation<br/>validate(), addOptimizer()"]
    end
    
    subgraph "Command Services"
        BacktestCmd["BacktestCommandService<br/>Validation + delegation<br/>run()"]
        LiveCmd["LiveCommandService<br/>Validation + delegation<br/>run()"]
        WalkerCmd["WalkerCommandService<br/>Validation + delegation<br/>run()"]
    end
    
    subgraph "Logic Services"
        BacktestLogicPriv["BacktestLogicPrivateService<br/>Internal implementation<br/>AsyncGenerator execution"]
        BacktestLogicPub["BacktestLogicPublicService<br/>External contract<br/>run() entry point"]
        LiveLogicPriv["LiveLogicPrivateService<br/>Internal implementation<br/>Infinite loop + persistence"]
        LiveLogicPub["LiveLogicPublicService<br/>External contract<br/>run() entry point"]
        WalkerLogicPriv["WalkerLogicPrivateService<br/>Internal implementation<br/>Strategy iteration"]
        WalkerLogicPub["WalkerLogicPublicService<br/>External contract<br/>run() entry point"]
    end
    
    subgraph "Markdown Services"
        BacktestMD["BacktestMarkdownService<br/>Event accumulation<br/>Statistics calculation<br/>getData(), getReport(), dump()"]
        LiveMD["LiveMarkdownService<br/>Event accumulation<br/>Statistics calculation"]
        ScheduleMD["ScheduleMarkdownService<br/>Scheduled signal tracking<br/>Cancellation analysis"]
        WalkerMD["WalkerMarkdownService<br/>Strategy comparison<br/>Metric ranking"]
        PartialMD["PartialMarkdownService<br/>Partial profit/loss tracking<br/>Milestone analysis"]
        PerfMD["PerformanceMarkdownService<br/>Timing metrics<br/>Bottleneck detection"]
        HeatMD["HeatMarkdownService<br/>Timeframe heat analysis"]
    end
    
    subgraph "Template Services"
        OptimizerTmpl["OptimizerTemplateService<br/>Code generation templates<br/>getStrategyTemplate(), etc."]
    end
    
    Logger -.->|injected into| StratConn
    ExecCtx -.->|injected into| StratConn
    MethodCtx -.->|injected into| StratGlobal
    
    StratSchema -.->|injected into| StratConn
    StratConn -.->|injected into| StratGlobal
    StratGlobal -.->|injected into| BacktestCmd
    BacktestCmd -.->|injected into| BacktestLogicPub
    BacktestLogicPub -.->|injected into| BacktestLogicPriv
    
    StratValid -.->|used by| BacktestCmd
```

### Connection Services

Connection Services manage memoized instances of Client* business logic classes. Each service caches instances by a key derived from execution parameters (e.g., `symbol:strategyName` for strategies). The `getStrategy`, `getExchange`, `getRisk` methods use `memoize` from `functools-kit` to ensure only one instance exists per unique parameter combination.

**Key Methods:**
- **StrategyConnectionService**: `tick()`, `backtest()`, `stop()`, `clear()`, `getPendingSignal()`
- **ExchangeConnectionService**: `getCandles()`, `getNextCandles()`, `getAveragePrice()`, `formatPrice()`, `formatQuantity()`
- **RiskConnectionService**: `getRisk()` returns memoized `ClientRisk` interface
- **SizingConnectionService**: `getSizing()` returns memoized `ClientSizing` interface

These services ensure consistent instance routing - multiple calls with the same parameters return the same cached instance, preserving internal state like signal history and initialization promises.

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:1-222](), [src/lib/index.ts:70-92]()

### Schema Services

Schema Services maintain registries mapping component names to their configuration schemas. Each service exposes `register(name, schema)` to add entries and `get(name)` to retrieve them. The registries are Map-based stores that persist for the application lifetime.

**Example:**
```typescript
// Internal storage
private schemaMap = new Map<StrategyName, IStrategySchema>()

// Registration
strategySchemaService.register("my-strategy", {
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async (symbol) => { /* ... */ }
})

// Retrieval
const schema = strategySchemaService.get("my-strategy")
```

These services are queried by Connection Services during instance creation to retrieve configuration data.

**Sources:** [src/lib/index.ts:94-108](), [src/function/add.ts:52-64]()

### Global Services

Global Services wrap Connection Services with context injection via `ExecutionContextService`. They call `ExecutionContextService.runInContext()` to set the `symbol`, `when`, and `backtest` parameters before delegating to Connection Services. This pattern enables implicit parameter passing without requiring these values to be passed through every function call.

**Flow:**
```
StrategyGlobalService.tick(symbol, when, backtest)
  → ExecutionContextService.runInContext({ symbol, when, backtest })
    → StrategyConnectionService.tick(symbol, strategyName)
      → ClientStrategy.tick() [reads context implicitly]
```

Global Services also call Validation Services to verify component registration before operations.

**Sources:** [src/lib/services/global/StrategyGlobalService.ts:1-204](), [src/lib/index.ts:110-126]()

### Validation Services

Validation Services implement two validation layers:

1. **Registration Validation** (`addStrategy`, `addExchange`, etc.): Called by `add.ts` functions to verify schema correctness before registration
2. **Usage Validation** (`validate`): Called by Global Services or Command Services before operations to verify component exists

**StrategyValidationService** implements 30+ signal validation rules checked during strategy execution:
- Price logic (TP must be above entry for long, SL must be below)
- NaN/Infinity checks on all numeric fields
- Price anomaly detection (unrealistic values)
- Timestamp validity
- Position type validation

**Sources:** [src/lib/index.ts:182-204](), [src/function/add.ts:52-64]()

### Command Services

Command Services provide the top-level entry points for execution modes. They perform validation, inject context, and delegate to Logic Services.

**Responsibilities:**
- Validate all components exist (strategy, exchange, frame)
- Set MethodContextService with component names
- Delegate to LogicPublicService
- Return AsyncGenerator for result streaming

**Sources:** [src/lib/index.ts:128-136]()

### Logic Services

Logic Services implement execution mode algorithms through a two-tier architecture:

- **Public Services** (`BacktestLogicPublicService`, etc.): External contract that validates parameters and delegates to Private
- **Private Services** (`BacktestLogicPrivateService`, etc.): Internal implementation with core execution logic

This separation enables Private Services to call other Private Services without re-validation while maintaining a clean public API.

**Execution Patterns:**
- **BacktestLogicPrivateService**: Iterates timeframes, calls `tick()`, skips ahead on signal open
- **LiveLogicPrivateService**: Infinite `while(true)` loop with `sleep(TICK_TTL)`, persistence recovery
- **WalkerLogicPrivateService**: Serial strategy iteration with metric comparison

For detailed execution flows, see [Logic Services](#7.6).

**Sources:** [src/lib/index.ts:138-160]()

### Markdown Services

Markdown Services accumulate events from execution and generate reports with statistics. They subscribe to event emitters (e.g., `signalBacktestEmitter`) and maintain internal arrays of events (limited to `MAX_EVENTS = 5000`).

**Methods:**
- `getData(symbol, strategyName)`: Returns statistics object (sharpe ratio, win rate, etc.)
- `getReport(symbol, strategyName)`: Returns markdown formatted report string
- `dump(strategyName, path)`: Writes report to disk

**Statistics Calculation:**
- Safe math layer with `isUnsafe()` checks for NaN/Infinity
- Variance/standard deviation computation
- Annualized metrics (Sharpe, returns)
- Win rate, certainty ratio, expected yearly returns

For detailed metrics, see [Performance Metrics](#13.2).

**Sources:** [src/lib/index.ts:162-180](), [src/classes/Backtest.ts:144-163]()

### Template Services

Template Services provide code generation templates for AI optimization. `OptimizerTemplateService` contains 11 template methods that generate different sections of the output script:

- `getTopBanner()`: Imports and constants
- `getJsonDumpTemplate()`: Helper functions
- `getStrategyTemplate()`: Strategy configuration with LLM integration
- `getWalkerTemplate()`: Walker comparison setup
- `getLauncherTemplate()`: Execution code with event listeners

For details on AI optimization, see [AI-Powered Strategy Optimization](#16.5).

**Sources:** [src/lib/index.ts:206-210]()

## Service Registration and Injection

```mermaid
graph LR
    subgraph "Registration Phase"
        TYPES["TYPES Symbol Registry<br/>src/lib/core/types.ts<br/>~60 unique symbols"]
        Provide["provide.ts<br/>Service instantiation<br/>Factory functions"]
        
        TYPES -->|"provides keys"| Provide
    end
    
    subgraph "Service Instantiation"
        Provide -->|"provide(TYPES.loggerService, () => new LoggerService())"| Logger["LoggerService<br/>instance"]
        Provide -->|"provide(TYPES.strategyConnectionService, ...)"| StratConn["StrategyConnectionService<br/>instance"]
        Provide -->|"provide(TYPES.strategySchemaService, ...)"| StratSchema["StrategySchemaService<br/>instance"]
        Provide -->|"provide(TYPES.strategyGlobalService, ...)"| StratGlobal["StrategyGlobalService<br/>instance"]
        Provide -->|"provide(TYPES.backtestLogicPrivateService, ...)"| BacktestLogic["BacktestLogicPrivateService<br/>instance"]
    end
    
    subgraph "Dependency Injection"
        StratConn -->|"inject<LoggerService>(TYPES.loggerService)"| Logger
        StratConn -->|"inject<StrategySchemaService>(TYPES.strategySchemaService)"| StratSchema
        StratGlobal -->|"inject<StrategyConnectionService>(TYPES.strategyConnectionService)"| StratConn
        BacktestLogic -->|"inject<StrategyGlobalService>(TYPES.strategyGlobalService)"| StratGlobal
    end
    
    subgraph "Aggregation"
        Index["src/lib/index.ts<br/>backtest object"]
        
        Logger -->|"inject<LoggerService>(TYPES.loggerService)"| Index
        StratConn -->|"inject<StrategyConnectionService>(...)"| Index
        StratSchema -->|"inject<StrategySchemaService>(...)"| Index
        StratGlobal -->|"inject<StrategyGlobalService>(...)"| Index
        BacktestLogic -->|"inject<BacktestLogicPrivateService>(...)"| Index
    end
    
    subgraph "User Access"
        UserCode["User Code<br/>import backtest"]
        
        Index -->|"export default backtest"| UserCode
    end
```

The registration process follows three phases:

**Phase 1: Type Definition** - [src/lib/core/types.ts:1-96]() defines Symbol constants for each service. Symbols prevent naming collisions and enable type-safe lookups.

**Phase 2: Service Registration** - [src/lib/core/provide.ts:1-132]() calls `provide(type, factory)` for each service. Factory functions instantiate services with their dependencies injected via `inject<T>(type)`.

**Phase 3: Aggregation** - [src/lib/index.ts:212-224]() imports all services via `inject()` and aggregates them into the `backtest` object, creating a single-namespace API.

**Sources:** [src/lib/core/types.ts:1-96](), [src/lib/core/provide.ts:1-132](), [src/lib/index.ts:1-232]()

## The Backtest Aggregation Object

The `backtest` object exported from [src/lib/index.ts:212-224]() flattens the service hierarchy into a single namespace. This provides convenient access to any service without needing to understand the dependency graph:

```typescript
// Internal organization
const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
}

const connectionServices = {
  strategyConnectionService: inject<StrategyConnectionService>(TYPES.strategyConnectionService),
  exchangeConnectionService: inject<ExchangeConnectionService>(TYPES.exchangeConnectionService),
  // ... 5 more
}

const schemaServices = {
  strategySchemaService: inject<StrategySchemaService>(TYPES.strategySchemaService),
  exchangeSchemaService: inject<ExchangeSchemaService>(TYPES.exchangeSchemaService),
  // ... 5 more
}

// ... 7 more categories

export const backtest = {
  ...baseServices,
  ...contextServices,
  ...connectionServices,
  ...schemaServices,
  ...globalServices,
  ...commandServices,
  ...logicPrivateServices,
  ...logicPublicServices,
  ...markdownServices,
  ...validationServices,
  ...templateServices,
}
```

This enables direct service access:
```typescript
import backtest from "./lib"

// Access any service directly
backtest.loggerService.info("message", data)
backtest.strategySchemaService.get("my-strategy")
backtest.backtestCommandService.run(symbol, context)
```

The Backtest, Live, and Walker utility classes ([src/classes/Backtest.ts](), [src/classes/Live.ts](), [src/classes/Walker.ts]()) use this object internally to access services.

**Sources:** [src/lib/index.ts:57-232]()

## Service Interaction Patterns

Services follow a strict layering pattern to prevent circular dependencies:

```mermaid
graph TB
    subgraph "Layer 1: Base Infrastructure"
        Logger["LoggerService"]
        ExecCtx["ExecutionContextService"]
        MethodCtx["MethodContextService"]
    end
    
    subgraph "Layer 2: Schema Registry"
        StratSchema["StrategySchemaService"]
        ExchSchema["ExchangeSchemaService"]
        RiskSchema["RiskSchemaService"]
    end
    
    subgraph "Layer 3: Validation"
        StratValid["StrategyValidationService"]
        ExchValid["ExchangeValidationService"]
        RiskValid["RiskValidationService"]
    end
    
    subgraph "Layer 4: Connection"
        StratConn["StrategyConnectionService<br/>Creates ClientStrategy"]
        ExchConn["ExchangeConnectionService<br/>Creates ClientExchange"]
        RiskConn["RiskConnectionService<br/>Creates ClientRisk"]
    end
    
    subgraph "Layer 5: Global Wrappers"
        StratGlobal["StrategyGlobalService<br/>Injects context"]
        ExchGlobal["ExchangeGlobalService<br/>Injects context"]
        RiskGlobal["RiskGlobalService<br/>Injects context"]
    end
    
    subgraph "Layer 6: Command Entry Points"
        BacktestCmd["BacktestCommandService"]
        LiveCmd["LiveCommandService"]
        WalkerCmd["WalkerCommandService"]
    end
    
    subgraph "Layer 7: Logic Implementation"
        BacktestLogicPub["BacktestLogicPublicService"]
        BacktestLogicPriv["BacktestLogicPrivateService"]
        LiveLogicPub["LiveLogicPublicService"]
        LiveLogicPriv["LiveLogicPrivateService"]
    end
    
    subgraph "Layer 8: Reporting"
        BacktestMD["BacktestMarkdownService"]
        LiveMD["LiveMarkdownService"]
    end
    
    Logger -->|"injected into"| StratConn
    ExecCtx -->|"injected into"| StratConn
    
    StratSchema -->|"injected into"| StratConn
    StratSchema -->|"injected into"| StratValid
    
    StratValid -->|"injected into"| StratGlobal
    StratConn -->|"injected into"| StratGlobal
    
    StratGlobal -->|"injected into"| BacktestCmd
    ExchGlobal -->|"injected into"| BacktestCmd
    
    BacktestCmd -->|"injected into"| BacktestLogicPub
    BacktestLogicPub -->|"injected into"| BacktestLogicPriv
    
    StratGlobal -->|"called by"| BacktestLogicPriv
    ExchGlobal -->|"called by"| BacktestLogicPriv
    
    BacktestLogicPriv -->|"emits to"| BacktestMD
```

**Layering Rules:**

1. **Base Services** (Layer 1) have no dependencies on other services
2. **Schema Services** (Layer 2) depend only on Base Services
3. **Validation Services** (Layer 3) depend on Base + Schema
4. **Connection Services** (Layer 4) depend on Base + Schema + other Connections (for composition)
5. **Global Services** (Layer 5) depend on Connection + Validation + Context
6. **Command Services** (Layer 6) depend on Global + Validation
7. **Logic Services** (Layer 7) depend on Command + Global
8. **Markdown Services** (Layer 8) depend on event emitters only (passive listeners)

This layering ensures:
- No circular dependencies
- Clear separation of concerns
- Predictable initialization order
- Easy testing (mock lower layers)

**Example Dependency Chain:**
```
User calls Backtest.run()
  → BacktestCommandService.run()
    → BacktestLogicPublicService.run()
      → BacktestLogicPrivateService.run()
        → StrategyGlobalService.tick()
          → StrategyConnectionService.tick()
            → ClientStrategy.tick()
              → ExchangeConnectionService.getCandles()
                → ClientExchange.getCandles()
```

Each layer adds value:
- **Command**: Validation and context setup
- **Logic Public**: External contract
- **Logic Private**: Core algorithm
- **Global**: Context injection
- **Connection**: Instance routing
- **Client**: Business logic

**Sources:** [src/lib/services/global/StrategyGlobalService.ts:1-204](), [src/lib/services/connection/StrategyConnectionService.ts:1-222]()

## Service Category Deep Dives

For detailed information about each service category:

- [Service Architecture Overview](#7.1) - Service matrix patterns and organization principles
- [Connection Services](#7.2) - Memoization, instance routing, dependency injection details
- [Schema Services](#7.3) - Registration patterns, retrieval, name-based lookup
- [Validation Services](#7.4) - 30+ validation rules, error handling, registration validation
- [Global Services](#7.5) - Context injection wrappers, ExecutionContext integration
- [Logic Services](#7.6) - Private vs Public separation, AsyncGenerator streaming, execution orchestration
- [Markdown Services](#7.7) - Event accumulation, statistics calculation, report generation
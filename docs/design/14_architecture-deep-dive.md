---
title: design/14_architecture-deep-dive
group: design
---

# Architecture Deep Dive

## Purpose and Scope

This document provides a detailed technical exploration of Backtest Kit's internal architecture, focusing on the dependency injection system, service layer organization, context propagation mechanisms, and architectural patterns. This material is intended for developers who need to understand the framework's internal design, extend its functionality, or troubleshoot complex issues.

For information about the public API and usage patterns, see [Getting Started](./04_getting-started.md). For details on strategy development and signal generation, see [Strategy Development](./25_strategy-development.md). For client-layer implementation specifics, see [Client Layer](./14_architecture-deep-dive.md).

## The Dependency Injection Container

Backtest Kit implements a custom dependency injection container using Symbol-based tokens for type-safe service resolution. The DI system consists of three core components:

1. **TYPES Registry** - Symbol-based tokens for each service
2. **Service Providers** - Factory functions that instantiate services
3. **Service Injectors** - Lazy dependency resolution functions
4. **Backtest Aggregator** - Central object exposing all services

### TYPES Symbol Registry

The framework defines unique Symbol tokens for each service, organized by category. These symbols serve as dependency injection keys that prevent naming collisions and enable type-safe resolution.

**TYPES Symbol Structure**

```mermaid
graph TB
    subgraph "TYPES Registry (src/lib/core/types.ts)"
        BASE["baseServices<br/>loggerService"]
        CONTEXT["contextServices<br/>executionContextService<br/>methodContextService"]
        SCHEMA["schemaServices<br/>exchangeSchemaService<br/>strategySchemaService<br/>frameSchemaService<br/>walkerSchemaService<br/>sizingSchemaService<br/>riskSchemaService<br/>optimizerSchemaService"]
        VALIDATION["validationServices<br/>exchangeValidationService<br/>strategyValidationService<br/>frameValidationService<br/>walkerValidationService<br/>sizingValidationService<br/>riskValidationService<br/>optimizerValidationService<br/>configValidationService<br/>columnValidationService"]
        CONNECTION["connectionServices<br/>exchangeConnectionService<br/>strategyConnectionService<br/>frameConnectionService<br/>sizingConnectionService<br/>riskConnectionService<br/>optimizerConnectionService<br/>partialConnectionService"]
        CORE["coreServices<br/>exchangeCoreService<br/>strategyCoreService<br/>frameCoreService"]
        GLOBAL["globalServices<br/>sizingGlobalService<br/>riskGlobalService<br/>optimizerGlobalService<br/>partialGlobalService"]
        COMMAND["commandServices<br/>liveCommandService<br/>backtestCommandService<br/>walkerCommandService"]
        LOGIC_PRIV["logicPrivateServices<br/>backtestLogicPrivateService<br/>liveLogicPrivateService<br/>walkerLogicPrivateService"]
        LOGIC_PUB["logicPublicServices<br/>backtestLogicPublicService<br/>liveLogicPublicService<br/>walkerLogicPublicService"]
        MARKDOWN["markdownServices<br/>backtestMarkdownService<br/>liveMarkdownService<br/>scheduleMarkdownService<br/>performanceMarkdownService<br/>walkerMarkdownService<br/>heatMarkdownService<br/>partialMarkdownService<br/>outlineMarkdownService<br/>riskMarkdownService"]
        TEMPLATE["templateServices<br/>optimizerTemplateService"]
    end
    
    BASE --> TYPES_EXPORT["TYPES Object<br/>Exported from<br/>src/lib/core/types.ts"]
    CONTEXT --> TYPES_EXPORT
    SCHEMA --> TYPES_EXPORT
    VALIDATION --> TYPES_EXPORT
    CONNECTION --> TYPES_EXPORT
    CORE --> TYPES_EXPORT
    GLOBAL --> TYPES_EXPORT
    COMMAND --> TYPES_EXPORT
    LOGIC_PRIV --> TYPES_EXPORT
    LOGIC_PUB --> TYPES_EXPORT
    MARKDOWN --> TYPES_EXPORT
    TEMPLATE --> TYPES_EXPORT
```


### Service Provider Registration

Service factories are registered via the `provide()` function, which associates each TYPES symbol with a constructor function. The registration happens in `src/lib/core/provide.ts`, organized by service category.

**Service Registration Pattern**

| Category | Registration Example | Constructor |
|----------|---------------------|-------------|
| Base Services | `provide(TYPES.loggerService, () => new LoggerService())` | `LoggerService` |
| Context Services | `provide(TYPES.executionContextService, () => new ExecutionContextService())` | `ExecutionContextService` |
| Schema Services | `provide(TYPES.strategySchemaService, () => new StrategySchemaService())` | `StrategySchemaService` |
| Validation Services | `provide(TYPES.strategyValidationService, () => new StrategyValidationService())` | `StrategyValidationService` |
| Connection Services | `provide(TYPES.strategyConnectionService, () => new StrategyConnectionService())` | `StrategyConnectionService` |
| Core Services | `provide(TYPES.strategyCoreService, () => new StrategyCoreService())` | `StrategyCoreService` |
| Command Services | `provide(TYPES.backtestCommandService, () => new BacktestCommandService())` | `BacktestCommandService` |
| Logic Private Services | `provide(TYPES.backtestLogicPrivateService, () => new BacktestLogicPrivateService())` | `BacktestLogicPrivateService` |
| Logic Public Services | `provide(TYPES.backtestLogicPublicService, () => new BacktestLogicPublicService())` | `BacktestLogicPublicService` |
| Markdown Services | `provide(TYPES.backtestMarkdownService, () => new BacktestMarkdownService())` | `BacktestMarkdownService` |
| Template Services | `provide(TYPES.optimizerTemplateService, () => new OptimizerTemplateService())` | `OptimizerTemplateService` |


### Service Injection and the Backtest Aggregator

The `inject()` function performs lazy dependency resolution. Services are instantiated only when first accessed, enabling circular dependency resolution and reducing initialization overhead.

The `backtest` object aggregates all injected services into a single namespace, providing a centralized access point for the entire service layer.

**Backtest Object Structure**

```mermaid
graph LR
    subgraph "Service Injection (src/lib/index.ts)"
        INJECT["inject() function<br/>Lazy resolution"]
        
        BASE_INJ["baseServices<br/>loggerService: inject(TYPES.loggerService)"]
        CONTEXT_INJ["contextServices<br/>executionContextService: inject(...)<br/>methodContextService: inject(...)"]
        SCHEMA_INJ["schemaServices<br/>exchangeSchemaService: inject(...)<br/>strategySchemaService: inject(...)<br/>etc..."]
        CONN_INJ["connectionServices<br/>exchangeConnectionService: inject(...)<br/>strategyConnectionService: inject(...)<br/>etc..."]
        CORE_INJ["coreServices<br/>exchangeCoreService: inject(...)<br/>strategyCoreService: inject(...)<br/>frameCoreService: inject(...)"]
        
        INJECT -.-> BASE_INJ
        INJECT -.-> CONTEXT_INJ
        INJECT -.-> SCHEMA_INJ
        INJECT -.-> CONN_INJ
        INJECT -.-> CORE_INJ
    end
    
    BASE_INJ --> BACKTEST["backtest Object<br/>Aggregates all services<br/>Export: lib"]
    CONTEXT_INJ --> BACKTEST
    SCHEMA_INJ --> BACKTEST
    CONN_INJ --> BACKTEST
    CORE_INJ --> BACKTEST
```

The aggregation structure allows services to access other services through the same namespace:

```typescript
// Inside a service class
const strategySchema = backtest.strategySchemaService.get(strategyName);
const logger = backtest.loggerService;
const context = backtest.executionContextService.context;
```


## Service Layer Organization

The service layer is organized into 11 distinct categories, each with specific responsibilities. This categorization enforces separation of concerns and prevents circular dependencies through careful layering.

### Service Category Overview

| Category | Purpose | Key Characteristics | Example Services |
|----------|---------|---------------------|------------------|
| **Base Services** | Fundamental services used throughout the system | No dependencies on other services | `LoggerService` |
| **Context Services** | Ambient context propagation using `di-scoped` | Provide implicit context without explicit parameters | `ExecutionContextService`, `MethodContextService` |
| **Schema Services** | Configuration storage using `ToolRegistry` pattern | Immutable schema registration and retrieval | `StrategySchemaService`, `ExchangeSchemaService` |
| **Validation Services** | Runtime existence checks with memoization | Fast repeated validation through caching | `StrategyValidationService`, `ExchangeValidationService` |
| **Connection Services** | Memoized client instance factories | Cache clients by unique keys to prevent redundant instantiation | `StrategyConnectionService`, `ExchangeConnectionService` |
| **Core Services** | Business logic orchestration | Coordinate execution flow and delegate to clients | `StrategyCoreService`, `ExchangeCoreService` |
| **Global Services** | Shared state management across strategies | Manage portfolio-wide concerns | `RiskGlobalService`, `PartialGlobalService` |
| **Logic Private Services** | Internal async generator implementations | Stream results with backpressure control | `BacktestLogicPrivateService`, `LiveLogicPrivateService` |
| **Logic Public Services** | External API wrappers for logic services | Public interface delegation to private implementations | `BacktestLogicPublicService`, `LiveLogicPublicService` |
| **Command Services** | Top-level API entry points | Handle validation and delegate to logic services | `BacktestCommandService`, `LiveCommandService` |
| **Markdown Services** | Event-driven report generation | Subscribe to emitters, accumulate data, generate reports | `BacktestMarkdownService`, `LiveMarkdownService` |
| **Template Services** | Code generation for optimizer | Generate executable strategy code from schemas | `OptimizerTemplateService` |

### Service Dependency Layers

The service architecture follows a strict layering principle to prevent circular dependencies. Lower layers have no knowledge of higher layers.

**Service Dependency Hierarchy**

```mermaid
graph TB
    subgraph "Layer 1: Foundation"
        BASE["Base Services<br/>LoggerService"]
    end
    
    subgraph "Layer 2: Context"
        CONTEXT["Context Services<br/>ExecutionContextService<br/>MethodContextService"]
    end
    
    subgraph "Layer 3: Configuration"
        SCHEMA["Schema Services<br/>Store user configs"]
        VALIDATION["Validation Services<br/>Existence checks"]
    end
    
    subgraph "Layer 4: Client Management"
        CONNECTION["Connection Services<br/>Memoized client factories"]
    end
    
    subgraph "Layer 5: Core Logic"
        CORE["Core Services<br/>Business logic orchestration"]
        GLOBAL["Global Services<br/>Shared state management"]
    end
    
    subgraph "Layer 6: Execution"
        LOGIC_PRIV["Logic Private Services<br/>Async generators"]
    end
    
    subgraph "Layer 7: Public API"
        LOGIC_PUB["Logic Public Services<br/>API wrappers"]
        COMMAND["Command Services<br/>Entry points"]
    end
    
    subgraph "Layer 8: Reporting"
        MARKDOWN["Markdown Services<br/>Event subscribers"]
        TEMPLATE["Template Services<br/>Code generation"]
    end
    
    BASE --> CONTEXT
    BASE --> SCHEMA
    BASE --> VALIDATION
    
    CONTEXT --> CONNECTION
    SCHEMA --> VALIDATION
    SCHEMA --> CONNECTION
    
    VALIDATION --> CORE
    CONNECTION --> CORE
    CONNECTION --> GLOBAL
    
    CORE --> LOGIC_PRIV
    GLOBAL --> LOGIC_PRIV
    
    LOGIC_PRIV --> LOGIC_PUB
    
    LOGIC_PUB --> COMMAND
    VALIDATION --> COMMAND
    SCHEMA --> COMMAND
    
    LOGIC_PRIV -.->|subscribe| MARKDOWN
    SCHEMA --> TEMPLATE
```


### Service Category Implementation Details

Each service category follows specific patterns and conventions:

**1. Base Services** - Provide fundamental capabilities without dependencies:
```typescript
// LoggerService has no dependencies
class LoggerService {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}
```

**2. Context Services** - Use `di-scoped` for context propagation:
- `ExecutionContextService` contains: `{ symbol, when, backtest }`
- `MethodContextService` contains: `{ strategyName, exchangeName, frameName }`
- Both extend `di-scoped.IScopedClassRun` for `runInContext()` method

**3. Schema Services** - Implement registry pattern with `ToolRegistry`:
- `register(name: string, schema: ISchema): void`
- `get(name: string): ISchema`
- `has(name: string): boolean`
- `list(): ISchema[]`

**4. Validation Services** - Provide memoized existence checks:
- `addStrategy(name: string, schema: ISchema): void` (validates no duplicates)
- `strategyExists(name: string): boolean` (memoized)
- `list(): ISchema[]` (returns all schemas)

**5. Connection Services** - Create and cache client instances:
- Use `functools-kit` `memoize()` decorator
- Cache key: unique identifier (e.g., `strategyName`, `exchangeName`)
- Return cached instance on subsequent calls with same key

**6. Core Services** - Orchestrate execution:
- Retrieve clients from connection services
- Delegate method calls to client instances
- Handle execution context propagation

**7. Global Services** - Manage shared state:
- Track portfolio-wide metrics
- Coordinate cross-strategy concerns
- Provide centralized state access

**8. Logic Private Services** - Implement async generators:
- `async *run(symbol: string)` yields results progressively
- Handle timeframe iteration (backtest) or infinite loop (live)
- Skip frames based on signal state

**9. Logic Public Services** - Wrap private implementations:
- Validate parameters before delegation
- Provide public-facing API surface
- Simplify complex private logic

**10. Command Services** - Entry points for public API:
- Validate all required schemas exist
- Set up contexts via `MethodContextService`
- Delegate to logic services

**11. Markdown Services** - Generate reports from events:
- Subscribe to relevant emitters
- Accumulate events in `ReportStorage`
- Calculate statistics on demand
- Generate formatted markdown tables


## Context Propagation Architecture

Backtest Kit uses the `di-scoped` library to propagate ambient context throughout the execution stack without explicit parameter passing. This approach eliminates parameter drilling while maintaining type safety.

### Context Services

Two context services provide different levels of ambient information:

**ExecutionContextService** - Runtime execution parameters:
```typescript
interface IExecutionContext {
    symbol: string;        // Trading pair (e.g., "BTCUSDT")
    when: Date;           // Current timestamp for operation
    backtest: boolean;    // true = backtest mode, false = live mode
}
```

**MethodContextService** - Schema routing information:
```typescript
interface IMethodContext {
    exchangeName: ExchangeName;   // Which exchange schema to use
    strategyName: StrategyName;   // Which strategy schema to use
    frameName: FrameName;         // Which frame schema to use (empty for live)
}
```

### Context Propagation Flow

```mermaid
graph TB
    subgraph "Public API Layer"
        BACKTEST_RUN["Backtest.run()<br/>symbol: 'BTCUSDT'<br/>context: { strategyName, exchangeName, frameName }"]
        LIVE_RUN["Live.run()<br/>symbol: 'BTCUSDT'<br/>context: { strategyName, exchangeName }"]
    end
    
    subgraph "Method Context Setup"
        METHOD_CTX["MethodContextService.runAsyncIterator()<br/>Sets: strategyName, exchangeName, frameName<br/>Wraps: async generator"]
    end
    
    subgraph "Logic Layer"
        LOGIC["BacktestLogicPrivateService.run()<br/>Iterates timeframes<br/>For each frame:"]
    end
    
    subgraph "Execution Context Setup"
        EXEC_CTX["ExecutionContextService.runInContext()<br/>Sets: symbol, when, backtest=true<br/>Calls: StrategyGlobalService.tick()"]
    end
    
    subgraph "Core Service Layer"
        CORE["StrategyCoreService.tick()<br/>Accesses contexts:<br/>- executionContextService.context<br/>- methodContextService.context"]
    end
    
    subgraph "Connection Layer"
        CONN["StrategyConnectionService.getStrategy()<br/>Uses methodContextService.context.strategyName<br/>Returns: memoized ClientStrategy"]
    end
    
    subgraph "Client Layer"
        CLIENT["ClientStrategy.tick()<br/>Uses executionContextService.context:<br/>- symbol, when, backtest"]
    end
    
    BACKTEST_RUN --> METHOD_CTX
    LIVE_RUN --> METHOD_CTX
    METHOD_CTX --> LOGIC
    LOGIC --> EXEC_CTX
    EXEC_CTX --> CORE
    CORE --> CONN
    CONN --> CLIENT
```

### Context Access Pattern

Services access context through the context services without receiving context as parameters:

```typescript
// Inside StrategyCoreService
class StrategyCoreService {
    async tick() {
        // Access execution context (symbol, when, backtest)
        const execCtx = this.executionContextService.context;
        const { symbol, when, backtest } = execCtx;
        
        // Access method context (strategyName, exchangeName, frameName)
        const methodCtx = this.methodContextService.context;
        const { strategyName, exchangeName } = methodCtx;
        
        // Use contexts without explicit parameters
        const strategy = this.strategyConnectionService.getStrategy(strategyName);
        return await strategy.tick(symbol, when, backtest);
    }
}
```

The `di-scoped` library manages context scope boundaries:
- `runInContext(callback, context)` - Execute callback with specific context
- `runAsyncIterator(generator, context)` - Execute async generator with context
- Context automatically available to all code within callback/generator scope


## Memoization Strategy

Connection services use memoization to cache client instances, preventing redundant instantiation and improving performance. This pattern is critical for maintaining consistent state across multiple calls.

### Connection Service Memoization Pattern

**StrategyConnectionService Example**

```mermaid
graph LR
    subgraph "StrategyConnectionService"
        GET_STRATEGY["getStrategy(strategyName)<br/>Memoized method"]
        CREATE["createStrategy(strategyName)<br/>Factory method"]
        CACHE["Memoization Cache<br/>Key: strategyName<br/>Value: ClientStrategy instance"]
    end
    
    subgraph "First Call"
        CALL1["getStrategy('my-strategy')"]
        MISS1["Cache miss"]
        CREATE1["Create new ClientStrategy"]
        STORE1["Store in cache"]
        RETURN1["Return instance"]
    end
    
    subgraph "Subsequent Calls"
        CALL2["getStrategy('my-strategy')"]
        HIT2["Cache hit"]
        RETURN2["Return cached instance"]
    end
    
    CALL1 --> MISS1
    MISS1 --> CREATE1
    CREATE1 --> STORE1
    STORE1 --> RETURN1
    
    CALL2 --> HIT2
    HIT2 --> RETURN2
    
    GET_STRATEGY -.->|uses| CACHE
    CREATE -.->|creates| ClientStrategy["ClientStrategy instance<br/>Maintains internal state"]
```

### Memoization Benefits

| Benefit | Description | Impact |
|---------|-------------|--------|
| **Performance** | Avoids repeated instantiation of expensive client objects | Reduces CPU and memory overhead |
| **State Consistency** | Same instance returned for same key ensures consistent state | Prevents duplicate signals, maintains accurate tracking |
| **Memory Efficiency** | Single instance per unique key rather than per call | Reduces memory footprint for long-running processes |
| **Deterministic Behavior** | Predictable instance resolution simplifies debugging | Easier to reason about system state |

### Memoization Cache Keys

Different connection services use different cache key strategies:

| Connection Service | Cache Key | Example |
|-------------------|-----------|---------|
| `StrategyConnectionService` | `strategyName` | `"my-strategy"` |
| `ExchangeConnectionService` | `exchangeName` | `"binance"` |
| `FrameConnectionService` | `frameName` | `"1d-backtest"` |
| `RiskConnectionService` | `riskName` | `"conservative"` |
| `PartialConnectionService` | `symbol` | `"BTCUSDT"` |
| `OptimizerConnectionService` | `optimizerName` | `"llm-generator"` |

### Implementation Details

Connection services implement a consistent pattern:

1. **Schema Retrieval** - Get schema from schema service
2. **Parameter Assembly** - Build client constructor parameters
3. **Client Instantiation** - Create new client with parameters
4. **Memoized Getter** - Cache instance by unique key

Example pseudo-pattern:
```typescript
class ConnectionService {
    // Memoized getter (implemented via functools-kit memoize decorator)
    getClient(name: string) {
        const schema = this.schemaService.get(name);
        return this.createClient(schema);
    }
    
    // Factory method (non-memoized)
    private createClient(schema: ISchema) {
        return new Client({
            ...schema,
            logger: this.loggerService,
            execution: this.executionContextService,
            // ... other dependencies
        });
    }
}
```


## Service Dependency Graph

The service layer exhibits a carefully designed dependency structure that avoids circular dependencies while enabling rich functionality. Dependencies flow from lower layers to higher layers, with context services providing cross-cutting concerns.

### Key Service Dependencies

**Command Service Dependencies**

```mermaid
graph TB
    subgraph "BacktestCommandService"
        BCmdLogger["loggerService"]
        BCmdStratSchema["strategySchemaService"]
        BCmdRiskVal["riskValidationService"]
        BCmdLogicPub["backtestLogicPublicService"]
        BCmdStratVal["strategyValidationService"]
        BCmdExchVal["exchangeValidationService"]
        BCmdFrameVal["frameValidationService"]
    end
    
    subgraph "BacktestLogicPublicService"
        BPubLogger["loggerService"]
        BPubLogicPriv["backtestLogicPrivateService"]
    end
    
    subgraph "BacktestLogicPrivateService"
        BPrivLogger["loggerService"]
        BPrivStratCore["strategyCoreService"]
        BPrivExchCore["exchangeCoreService"]
        BPrivFrameCore["frameCoreService"]
        BPrivMethod["methodContextService"]
    end
    
    subgraph "StrategyCoreService"
        SCoreLogger["loggerService"]
        SCoreStratConn["strategyConnectionService"]
        SCoreStratSchema["strategySchemaService"]
        SCoreRiskVal["riskValidationService"]
        SCoreStratVal["strategyValidationService"]
        SCoreMethod["methodContextService"]
    end
    
    BCmdLogicPub --> BPubLogicPriv
    BPubLogicPriv --> BPrivStratCore
    BPrivStratCore --> SCoreStratConn
```

### Cross-Service Communication Patterns

Services communicate through well-defined patterns:

**1. Direct Dependency Injection**
- Service A injects Service B via TYPES symbol
- Service A calls methods on Service B
- Example: `StrategyCoreService` → `StrategyConnectionService`

**2. Context-Based Communication**
- Services read ambient context without direct coupling
- Example: All services access `ExecutionContextService.context`

**3. Event-Based Communication**
- Services emit events to subjects
- Other services subscribe to subjects
- Example: `ClientStrategy` emits to `signalEmitter`, `MarkdownService` subscribes

**4. Schema Registry Pattern**
- Services store configurations in schema services
- Other services retrieve configurations by name
- Example: `StrategySchemaService.register()` → `StrategyConnectionService.get()`

### Acyclic Dependency Enforcement

The architecture prevents circular dependencies through:

| Mechanism | Description | Example |
|-----------|-------------|---------|
| **Layered Architecture** | Higher layers depend on lower layers, never reverse | Command → Logic → Core → Connection |
| **Context Services** | Provide cross-cutting concerns without coupling | Services access context without depending on setter |
| **Event System** | Decouple producers from consumers | Strategy emits signal, markdown subscribes (no direct dependency) |
| **Registry Pattern** | Schemas stored centrally, accessed by name | Strategy registers schema, connection service retrieves it |

**Dependency Flow Direction**

```mermaid
graph LR
    SCHEMA["Schema Services<br/>Configuration storage"] --> VALIDATION["Validation Services<br/>Existence checks"]
    SCHEMA --> CONNECTION["Connection Services<br/>Client factories"]
    VALIDATION --> CORE["Core Services<br/>Orchestration"]
    CONNECTION --> CORE
    CORE --> LOGIC_PRIV["Logic Private<br/>Generators"]
    LOGIC_PRIV --> LOGIC_PUB["Logic Public<br/>API wrappers"]
    LOGIC_PUB --> COMMAND["Command Services<br/>Entry points"]
    
    CONTEXT["Context Services<br/>Ambient context"] -.->|used by| CONNECTION
    CONTEXT -.->|used by| CORE
    CONTEXT -.->|used by| LOGIC_PRIV
    
    BASE["Base Services<br/>Logger"] -.->|used by| SCHEMA
    BASE -.->|used by| VALIDATION
    BASE -.->|used by| CONNECTION
    BASE -.->|used by| CORE
```


## Initialization Flow

The framework initialization follows a specific sequence to ensure all services are properly configured before execution begins.

### Initialization Sequence

```mermaid
sequenceDiagram
    participant Import as Module Import
    participant Provide as provide.ts
    participant DI as DI Container
    participant Init as init()
    participant Backtest as backtest Object
    
    Import->>Provide: Execute provide.ts
    Note over Provide: Registers all service factories
    Provide->>DI: provide(TYPES.loggerService, factory)
    Provide->>DI: provide(TYPES.executionContextService, factory)
    Provide->>DI: provide(TYPES.strategySchemaService, factory)
    Provide->>DI: ... (all services)
    
    Import->>Init: Call init()
    Note over Init: Triggers lazy resolution setup
    Init->>DI: Initialize DI container
    
    Import->>Backtest: Export backtest object
    Note over Backtest: All services available via inject()
    
    Backtest->>DI: First access to service
    DI->>DI: Instantiate service (lazy)
    DI->>Backtest: Return instance
```

### Lazy Dependency Resolution

Services are instantiated only when first accessed, not during module import. This enables:

1. **Circular Dependency Handling** - Services can depend on each other if resolution is lazy
2. **Reduced Startup Time** - Only used services are instantiated
3. **Memory Efficiency** - Unused services never allocate memory
4. **Configuration Flexibility** - Services can be configured before first use

**Lazy Resolution Example:**

```typescript
// src/lib/index.ts
import "./core/provide";  // Registers all factories (no instantiation)
import { inject, init } from "./core/di";

// Services are injected but not yet instantiated
const backtest = {
    loggerService: inject(TYPES.loggerService),  // Returns getter function
    strategyCoreService: inject(TYPES.strategyCoreService),  // Returns getter function
    // ... all other services
};

init();  // Initialize DI container

export { backtest };  // Export service accessors

// When backtest.loggerService is first accessed:
// 1. DI container calls factory: () => new LoggerService()
// 2. Instance is cached for future access
// 3. Same instance returned on subsequent access
```

### Service Access Patterns

| Access Pattern | Use Case | Example |
|----------------|----------|---------|
| **Direct Property Access** | Internal service communication | `this.loggerService.log(...)` |
| **inject() Function** | Service injection in constructors | `inject(TYPES.loggerService)` |
| **backtest Object** | External API implementation | `backtest.strategySchemaService.get(name)` |


## Type Safety and IntelliSense

The framework maintains full TypeScript type safety across the entire service layer through carefully designed type exports and declarations.

### Service Type Exports

The `types.d.ts` file declares all service interfaces and their relationships, enabling IDE IntelliSense and compile-time type checking:

```typescript
// Context service types
declare const ExecutionContextService: (new () => {
    readonly context: IExecutionContext;
}) & IScopedClassRun<[context: IExecutionContext]>;

type TExecutionContextService = InstanceType<typeof ExecutionContextService>;
```

### Type Flow Through Layers

```mermaid
graph TB
    subgraph "Type Definitions (types.d.ts)"
        INTERFACES["Interfaces<br/>IExchangeSchema<br/>IStrategySchema<br/>IFrameSchema<br/>etc."]
        CONTRACTS["Contract Types<br/>DoneContract<br/>PerformanceContract<br/>etc."]
        RESULT_TYPES["Result Types<br/>IStrategyTickResult<br/>IStrategyBacktestResult"]
    end
    
    subgraph "Service Implementations"
        SCHEMA_SVC["Schema Services<br/>Use interface types for storage"]
        CONN_SVC["Connection Services<br/>Return typed client instances"]
        LOGIC_SVC["Logic Services<br/>Yield typed results"]
    end
    
    subgraph "Public API"
        ADD_FUNCS["add*() functions<br/>Accept interface types"]
        EVENT_FUNCS["listen*() functions<br/>Receive typed events"]
        CLASS_API["Class methods<br/>Return typed results"]
    end
    
    INTERFACES --> SCHEMA_SVC
    INTERFACES --> ADD_FUNCS
    
    CONTRACTS --> LOGIC_SVC
    CONTRACTS --> EVENT_FUNCS
    
    RESULT_TYPES --> CONN_SVC
    RESULT_TYPES --> CLASS_API
```

Full type safety is maintained from user-facing API through internal service layer to client implementations, ensuring compile-time error detection and rich IDE support.

# Dependency Injection System

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



This document describes the dependency injection (DI) container architecture used throughout backtest-kit. The DI system provides type-safe service resolution, singleton lifecycle management, and context propagation for all framework services. For information about the context propagation mechanism itself, see [Context Propagation](#3.3). For details on specific service layers, see [Layer Responsibilities](#3.1).

## Overview

The DI system in backtest-kit is based on Symbol-based service tokens, factory-based service registration, and lazy singleton initialization. All services are registered at module load time and resolved on first access. The system enables clean separation of concerns, testability, and predictable service lifecycle management.

**Sources:** [docs/internals.md:66-77](), [src/lib/index.ts:1-170]()

## Service Token System

Service tokens are JavaScript Symbols that uniquely identify each service type in the container. Tokens are organized by service category and defined in a centralized registry.

```mermaid
graph TB
    subgraph "Token Registry (types.ts)"
        TYPES["TYPES Object<br/>Centralized Symbol Registry"]
        
        BaseTokens["baseServices<br/>• loggerService: Symbol"]
        ContextTokens["contextServices<br/>• executionContextService: Symbol<br/>• methodContextService: Symbol"]
        ConnectionTokens["connectionServices<br/>• exchangeConnectionService: Symbol<br/>• strategyConnectionService: Symbol<br/>• frameConnectionService: Symbol<br/>• sizingConnectionService: Symbol<br/>• riskConnectionService: Symbol"]
        SchemaTokens["schemaServices<br/>• exchangeSchemaService: Symbol<br/>• strategySchemaService: Symbol<br/>• frameSchemaService: Symbol<br/>• walkerSchemaService: Symbol<br/>• sizingSchemaService: Symbol<br/>• riskSchemaService: Symbol"]
        GlobalTokens["globalServices<br/>• exchangeGlobalService: Symbol<br/>• strategyGlobalService: Symbol<br/>• frameGlobalService: Symbol<br/>• liveGlobalService: Symbol<br/>• backtestGlobalService: Symbol<br/>• walkerGlobalService: Symbol<br/>• sizingGlobalService: Symbol<br/>• riskGlobalService: Symbol"]
        LogicTokens["logicPrivateServices + logicPublicServices<br/>• backtestLogicPrivateService: Symbol<br/>• liveLogicPrivateService: Symbol<br/>• walkerLogicPrivateService: Symbol<br/>• backtestLogicPublicService: Symbol<br/>• liveLogicPublicService: Symbol<br/>• walkerLogicPublicService: Symbol"]
        MarkdownTokens["markdownServices<br/>• backtestMarkdownService: Symbol<br/>• liveMarkdownService: Symbol<br/>• scheduleMarkdownService: Symbol<br/>• performanceMarkdownService: Symbol<br/>• walkerMarkdownService: Symbol<br/>• heatMarkdownService: Symbol"]
        ValidationTokens["validationServices<br/>• exchangeValidationService: Symbol<br/>• strategyValidationService: Symbol<br/>• frameValidationService: Symbol<br/>• walkerValidationService: Symbol<br/>• sizingValidationService: Symbol<br/>• riskValidationService: Symbol"]
        
        TYPES --> BaseTokens
        TYPES --> ContextTokens
        TYPES --> ConnectionTokens
        TYPES --> SchemaTokens
        TYPES --> GlobalTokens
        TYPES --> LogicTokens
        TYPES --> MarkdownTokens
        TYPES --> ValidationTokens
    end
```

The token registry groups related services by their architectural layer. Each token is a unique Symbol created with a descriptive name matching the service's purpose.

**Token Categories:**

| Category | Purpose | Example Tokens |
|----------|---------|----------------|
| `baseServices` | Core infrastructure | `loggerService` |
| `contextServices` | Execution context management | `executionContextService`, `methodContextService` |
| `connectionServices` | Memoized client instance factories | `strategyConnectionService`, `exchangeConnectionService` |
| `schemaServices` | Schema storage and retrieval | `strategySchemaService`, `exchangeSchemaService` |
| `globalServices` | Public API entry points | `backtestGlobalService`, `liveGlobalService` |
| `logicPrivateServices` / `logicPublicServices` | Core orchestration logic | `backtestLogicPrivateService`, `backtestLogicPublicService` |
| `markdownServices` | Report generation | `backtestMarkdownService`, `liveMarkdownService` |
| `validationServices` | Runtime validation | `strategyValidationService`, `exchangeValidationService` |

**Sources:** [src/lib/core/types.ts:1-81]()

## Service Registration

Service registration occurs at module load time via the `provide()` function. Each service is bound to its token with a factory function that creates a new instance. Registration is organized by service category in separate code blocks.

```mermaid
graph LR
    subgraph "provide.ts - Registration Phase"
        Block1["Base Services Block<br/>provide(TYPES.loggerService, () => new LoggerService())"]
        Block2["Context Services Block<br/>provide(TYPES.executionContextService, () => new ExecutionContextService())<br/>provide(TYPES.methodContextService, () => new MethodContextService())"]
        Block3["Connection Services Block<br/>provide(TYPES.exchangeConnectionService, () => new ExchangeConnectionService())<br/>provide(TYPES.strategyConnectionService, () => new StrategyConnectionService())<br/>..."]
        Block4["Schema Services Block<br/>provide(TYPES.exchangeSchemaService, () => new ExchangeSchemaService())<br/>..."]
        Block5["Global Services Block<br/>provide(TYPES.exchangeGlobalService, () => new ExchangeGlobalService())<br/>..."]
        Block6["Logic Services Blocks<br/>provide(TYPES.backtestLogicPrivateService, () => new BacktestLogicPrivateService())<br/>..."]
        Block7["Markdown Services Block<br/>provide(TYPES.backtestMarkdownService, () => new BacktestMarkdownService())<br/>..."]
        Block8["Validation Services Block<br/>provide(TYPES.exchangeValidationService, () => new ExchangeValidationService())<br/>..."]
        
        Block1 --> Block2
        Block2 --> Block3
        Block3 --> Block4
        Block4 --> Block5
        Block5 --> Block6
        Block6 --> Block7
        Block7 --> Block8
    end
    
    Block8 --> Container["DI Container<br/>Ready for Resolution"]
```

The registration pattern follows a consistent structure:

1. Import service class
2. Call `provide(token, factory)` with token from TYPES and factory function
3. Factory returns new instance of the service class

All services are registered as singletons - the factory is only called once per token, and the same instance is returned on all subsequent resolutions.

**Sources:** [src/lib/core/provide.ts:1-111]()

## Service Resolution and Aggregation

Services are resolved from the DI container using the `inject()` function and aggregated into typed service collections. The main backtest object exports all services grouped by category.

```mermaid
graph TB
    subgraph "Service Resolution (index.ts)"
        InjectFn["inject<T>(token: Symbol): T<br/>Resolves service from container"]
        
        BaseServices["baseServices = {<br/>  loggerService: inject<LoggerService>(TYPES.loggerService)<br/>}"]
        
        ContextServices["contextServices = {<br/>  executionContextService: inject<TExecutionContextService>(...),<br/>  methodContextService: inject<TMethodContextService>(...)<br/>}"]
        
        ConnectionServices["connectionServices = {<br/>  exchangeConnectionService: inject<ExchangeConnectionService>(...),<br/>  strategyConnectionService: inject<StrategyConnectionService>(...),<br/>  frameConnectionService: inject<FrameConnectionService>(...),<br/>  sizingConnectionService: inject<SizingConnectionService>(...),<br/>  riskConnectionService: inject<RiskConnectionService>(...)<br/>}"]
        
        SchemaServices["schemaServices = {<br/>  exchangeSchemaService: inject<ExchangeSchemaService>(...),<br/>  strategySchemaService: inject<StrategySchemaService>(...),<br/>  frameSchemaService: inject<FrameSchemaService>(...),<br/>  walkerSchemaService: inject<WalkerSchemaService>(...),<br/>  sizingSchemaService: inject<SizingSchemaService>(...),<br/>  riskSchemaService: inject<RiskSchemaService>(...)<br/>}"]
        
        GlobalServices["globalServices = {<br/>  exchangeGlobalService: inject<ExchangeGlobalService>(...),<br/>  strategyGlobalService: inject<StrategyGlobalService>(...),<br/>  frameGlobalService: inject<FrameGlobalService>(...),<br/>  liveGlobalService: inject<LiveGlobalService>(...),<br/>  backtestGlobalService: inject<BacktestGlobalService>(...),<br/>  walkerGlobalService: inject<WalkerGlobalService>(...),<br/>  sizingGlobalService: inject<SizingGlobalService>(...),<br/>  riskGlobalService: inject<RiskGlobalService>(...)<br/>}"]
        
        LogicServices["logicPrivateServices = {...}<br/>logicPublicServices = {...}"]
        
        MarkdownServices["markdownServices = {<br/>  backtestMarkdownService: inject<BacktestMarkdownService>(...),<br/>  liveMarkdownService: inject<LiveMarkdownService>(...),<br/>  scheduleMarkdownService: inject<ScheduleMarkdownService>(...),<br/>  performanceMarkdownService: inject<PerformanceMarkdownService>(...),<br/>  walkerMarkdownService: inject<WalkerMarkdownService>(...),<br/>  heatMarkdownService: inject<HeatMarkdownService>(...)<br/>}"]
        
        ValidationServices["validationServices = {<br/>  exchangeValidationService: inject<ExchangeValidationService>(...),<br/>  strategyValidationService: inject<StrategyValidationService>(...),<br/>  frameValidationService: inject<FrameValidationService>(...),<br/>  walkerValidationService: inject<WalkerValidationService>(...),<br/>  sizingValidationService: inject<SizingValidationService>(...),<br/>  riskValidationService: inject<RiskValidationService>(...)<br/>}"]
        
        BacktestObject["backtest = {<br/>  ...baseServices,<br/>  ...contextServices,<br/>  ...connectionServices,<br/>  ...schemaServices,<br/>  ...globalServices,<br/>  ...logicPrivateServices,<br/>  ...logicPublicServices,<br/>  ...markdownServices,<br/>  ...validationServices<br/>}"]
        
        InjectFn -.-> BaseServices
        InjectFn -.-> ContextServices
        InjectFn -.-> ConnectionServices
        InjectFn -.-> SchemaServices
        InjectFn -.-> GlobalServices
        InjectFn -.-> LogicServices
        InjectFn -.-> MarkdownServices
        InjectFn -.-> ValidationServices
        
        BaseServices --> BacktestObject
        ContextServices --> BacktestObject
        ConnectionServices --> BacktestObject
        SchemaServices --> BacktestObject
        GlobalServices --> BacktestObject
        LogicServices --> BacktestObject
        MarkdownServices --> BacktestObject
        ValidationServices --> BacktestObject
    end
    
    BacktestObject --> Export["export default backtest<br/>export { backtest }"]
    BacktestObject --> Init["init()<br/>Initialize DI Container"]
```

The `inject()` function performs lazy resolution - services are only instantiated when first accessed. The aggregated `backtest` object serves as the central service locator used throughout the framework.

**Sources:** [src/lib/index.ts:1-170]()

## Service Lifecycle and Initialization

All services follow a singleton lifecycle pattern. Once a service is resolved from the container, the same instance is reused for all subsequent requests.

```mermaid
graph TD
    ModuleLoad["Module Load Time<br/>import './core/provide'<br/>import { init } from './core/di'"]
    
    Registration["Service Registration Phase<br/>All provide() calls execute<br/>Factories registered but not executed"]
    
    InitCall["Container Initialization<br/>init() called at end of index.ts"]
    
    FirstAccess["First Service Access<br/>backtest.strategyGlobalService.method()"]
    
    LazyResolution["Lazy Resolution<br/>Factory function executes<br/>Service instance created"]
    
    DependencyChain["Dependency Chain Resolution<br/>Service constructor injects dependencies<br/>Each dependency resolved recursively"]
    
    SingletonCache["Singleton Caching<br/>Instance stored in container<br/>Same instance returned for future access"]
    
    SubsequentAccess["Subsequent Access<br/>backtest.strategyGlobalService.method()"]
    
    CachedReturn["Return Cached Instance<br/>No factory execution<br/>No new instance creation"]
    
    ModuleLoad --> Registration
    Registration --> InitCall
    InitCall --> FirstAccess
    FirstAccess --> LazyResolution
    LazyResolution --> DependencyChain
    DependencyChain --> SingletonCache
    SingletonCache --> SubsequentAccess
    SubsequentAccess --> CachedReturn
```

Key lifecycle characteristics:

| Phase | Behavior | Example |
|-------|----------|---------|
| Registration | Factory functions stored, not executed | `provide(TYPES.loggerService, () => new LoggerService())` |
| Initialization | Container prepared for resolution | `init()` at module load |
| First Access | Factory executes, dependencies resolved | `backtest.loggerService` triggers creation |
| Subsequent Access | Cached instance returned | Same `LoggerService` instance every time |

**Sources:** [src/lib/index.ts:164](), [src/lib/core/provide.ts:44-111]()

## Dependency Injection in Service Constructors

Services declare their dependencies by importing and using the DI system within their constructors. Dependencies are resolved at construction time through recursive DI resolution.

```mermaid
graph TB
    subgraph "Example: StrategyGlobalService Dependencies"
        SGS["StrategyGlobalService<br/>Constructor"]
        
        Logger["inject<LoggerService><br/>(TYPES.loggerService)"]
        StratConn["inject<StrategyConnectionService><br/>(TYPES.strategyConnectionService)"]
        StratSchema["inject<StrategySchemaService><br/>(TYPES.strategySchemaService)"]
        RiskVal["inject<RiskValidationService><br/>(TYPES.riskValidationService)"]
        StratVal["inject<StrategyValidationService><br/>(TYPES.strategyValidationService)"]
        MethodCtx["inject<TMethodContextService><br/>(TYPES.methodContextService)"]
        
        SGS --> Logger
        SGS --> StratConn
        SGS --> StratSchema
        SGS --> RiskVal
        SGS --> StratVal
        SGS --> MethodCtx
        
        StratConn --> StratConn_Logger["inject<LoggerService>"]
        StratConn --> StratConn_ExecCtx["inject<TExecutionContextService>"]
        StratConn --> StratConn_Schema["inject<StrategySchemaService>"]
        StratConn --> StratConn_Risk["inject<RiskConnectionService>"]
        StratConn --> StratConn_Exchange["inject<ExchangeConnectionService>"]
        StratConn --> StratConn_MethodCtx["inject<TMethodContextService>"]
    end
    
    subgraph "Transitive Dependency Resolution"
        StratConn_Risk --> Risk_Logger["inject<LoggerService>"]
        StratConn_Risk --> Risk_Schema["inject<RiskSchemaService>"]
        
        StratConn_Exchange --> Exch_Logger["inject<LoggerService>"]
        StratConn_Exchange --> Exch_ExecCtx["inject<TExecutionContextService>"]
        StratConn_Exchange --> Exch_Schema["inject<ExchangeSchemaService>"]
        StratConn_Exchange --> Exch_MethodCtx["inject<TMethodContextService>"]
    end
```

This pattern enables:
- **Automatic Dependency Resolution**: Services don't need to manually pass dependencies
- **Type Safety**: TypeScript enforces correct service types at compile time
- **Testability**: Services can be replaced with mocks by rebinding tokens
- **Decoupling**: Services depend on abstractions (tokens) not concrete implementations

**Sources:** [docs/uml.puml:29-99]()

## Memoization Pattern in Connection Services

Connection services use the memoization pattern to ensure that only one client instance exists per schema name. This prevents duplicate client creation and ensures consistent state across the framework.

```mermaid
graph TB
    subgraph "StrategyConnectionService Memoization"
        GetMethod["get(strategyName: string): ClientStrategy"]
        
        CheckCache["Check Memoization Cache<br/>Key: strategyName"]
        
        CacheHit["Cache Hit<br/>Return Existing ClientStrategy"]
        
        CacheMiss["Cache Miss<br/>Create New ClientStrategy"]
        
        ResolveSchema["strategySchemaService.get(strategyName)"]
        
        ResolveDeps["Resolve Dependencies:<br/>• riskConnectionService.get(riskName)<br/>• exchangeConnectionService.get(exchangeName)"]
        
        CreateClient["new ClientStrategy({<br/>  schema,<br/>  riskClient,<br/>  exchangeClient<br/>})"]
        
        StoreCache["Store in Memoization Cache<br/>Key: strategyName<br/>Value: ClientStrategy instance"]
        
        Return["Return ClientStrategy"]
        
        GetMethod --> CheckCache
        CheckCache --> |"Found"| CacheHit
        CheckCache --> |"Not Found"| CacheMiss
        CacheMiss --> ResolveSchema
        ResolveSchema --> ResolveDeps
        ResolveDeps --> CreateClient
        CreateClient --> StoreCache
        StoreCache --> Return
        CacheHit --> Return
    end
    
    subgraph "Memoization Guarantees"
        G1["Same Schema Name → Same Client Instance"]
        G2["Different Schema Names → Different Client Instances"]
        G3["No Duplicate Client Creation"]
        G4["Consistent State Across Framework"]
    end
```

**Memoized Connection Services:**

| Service | Client Created | Memoization Key | Purpose |
|---------|----------------|-----------------|---------|
| `StrategyConnectionService` | `ClientStrategy` | `strategyName` | Memoizes strategy instances with risk/exchange dependencies |
| `ExchangeConnectionService` | `ClientExchange` | `exchangeName` | Memoizes exchange instances for market data |
| `FrameConnectionService` | `ClientFrame` | `frameName` | Memoizes timeframe generators for backtesting |
| `RiskConnectionService` | `ClientRisk` | `riskName` | Memoizes risk managers shared across strategies |
| `SizingConnectionService` | `ClientSizing` | `sizingName` | Memoizes position sizing calculators |

The memoization is implemented using the `singleshot` decorator from `functools-kit`, which ensures the factory function only executes once per unique key combination.

**Sources:** [docs/internals.md:46-47](), [src/lib/core/provide.ts:54-59]()

## Context Propagation via DI-Scoped

The DI system integrates with `di-scoped` to provide context propagation throughout the framework. Two context types flow through the service layer: `ExecutionContext` and `MethodContext`.

```mermaid
graph TB
    subgraph "Context Establishment"
        UserCall["User Code<br/>Backtest.run(symbol, {<br/>  strategyName,<br/>  exchangeName,<br/>  frameName<br/>})"]
        
        MethodCtxWrap["MethodContextService.runInContext({<br/>  strategyName,<br/>  exchangeName,<br/>  frameName<br/>})"]
        
        ExecCtxWrap["ExecutionContextService.runInContext({<br/>  symbol,<br/>  when: timestamp,<br/>  backtest: true<br/>})"]
        
        UserCall --> MethodCtxWrap
        MethodCtxWrap --> ExecCtxWrap
    end
    
    subgraph "Context Resolution in Services"
        ServiceMethod["strategyGlobalService.tick()"]
        
        ResolveMethod["this.methodContextService.get()<br/>Returns: { strategyName, exchangeName, frameName }"]
        
        ResolveExec["this.executionContextService.get()<br/>Returns: { symbol, when, backtest }"]
        
        UseContext["Use context values:<br/>• strategyName to select strategy<br/>• exchangeName to select exchange<br/>• symbol for market data<br/>• when for timestamp<br/>• backtest flag for mode"]
        
        ServiceMethod --> ResolveMethod
        ServiceMethod --> ResolveExec
        ResolveMethod --> UseContext
        ResolveExec --> UseContext
    end
    
    subgraph "Context-Aware Operations"
        GetCandles["exchangeGlobalService.getCandles()<br/>No explicit context params needed"]
        GetSignal["strategyGlobalService.getSignal()<br/>No explicit context params needed"]
        FormatPrice["exchangeGlobalService.formatPrice()<br/>No explicit context params needed"]
        
        UseContext --> GetCandles
        UseContext --> GetSignal
        UseContext --> FormatPrice
    end
```

**Context Types:**

| Context Type | Purpose | Fields | Established By |
|--------------|---------|--------|----------------|
| `MethodContext` | Identifies which components to use | `strategyName`, `exchangeName`, `frameName` | `MethodContextService.runInContext()` |
| `ExecutionContext` | Provides runtime parameters | `symbol`, `when`, `backtest` | `ExecutionContextService.runInContext()` |

**Benefits:**
- Services access context without parameter drilling
- User code provides context once at execution boundary
- Internal services automatically resolve correct components
- Context scoped to async execution flow via `di-scoped`

For detailed information on context propagation mechanics, see [Context Propagation](#3.3).

**Sources:** [docs/internals.md:70-77](), [src/lib/index.ts:10-15]()

## DI Flow Through Service Layers

The dependency injection system enables clean separation of the six architectural layers. Each layer depends on services from the same or lower layers via DI.

```mermaid
graph TB
    subgraph "Layer 1: Public API (add.ts, list.ts)"
        AddStrategy["addStrategy(schema)<br/>→ backtest.strategyValidationService.addStrategy()<br/>→ backtest.strategySchemaService.register()"]
        ListStrategies["listStrategies()<br/>→ backtest.strategyValidationService.list()"]
    end
    
    subgraph "Layer 2: Global Services"
        StrategyGlobal["StrategyGlobalService<br/>Injects: LoggerService, StrategyConnectionService,<br/>StrategySchemaService, RiskValidationService,<br/>StrategyValidationService, MethodContextService"]
        
        BacktestGlobal["BacktestGlobalService<br/>Injects: LoggerService, BacktestLogicPublicService,<br/>StrategySchemaService, ValidationServices"]
    end
    
    subgraph "Layer 3: Logic Services"
        BacktestLogicPublic["BacktestLogicPublicService<br/>Injects: LoggerService, BacktestLogicPrivateService"]
        
        BacktestLogicPrivate["BacktestLogicPrivateService<br/>Injects: LoggerService, StrategyGlobalService,<br/>ExchangeGlobalService, FrameGlobalService,<br/>MethodContextService"]
    end
    
    subgraph "Layer 4: Connection Services"
        StrategyConnection["StrategyConnectionService<br/>Injects: LoggerService, ExecutionContextService,<br/>StrategySchemaService, RiskConnectionService,<br/>ExchangeConnectionService, MethodContextService"]
        
        ExchangeConnection["ExchangeConnectionService<br/>Injects: LoggerService, ExecutionContextService,<br/>ExchangeSchemaService, MethodContextService"]
    end
    
    subgraph "Layer 5: Schema & Validation Services"
        StrategySchema["StrategySchemaService<br/>Injects: LoggerService"]
        
        StrategyValidation["StrategyValidationService<br/>Injects: LoggerService, RiskValidationService"]
        
        ExchangeSchema["ExchangeSchemaService<br/>Injects: LoggerService"]
    end
    
    subgraph "Layer 6: Client Classes (No DI)"
        ClientStrategy["ClientStrategy<br/>Pure business logic<br/>No DI dependencies<br/>Receives dependencies as constructor params"]
        
        ClientExchange["ClientExchange<br/>Pure business logic<br/>No DI dependencies<br/>Receives dependencies as constructor params"]
    end
    
    AddStrategy --> StrategyValidation
    AddStrategy --> StrategySchema
    ListStrategies --> StrategyValidation
    
    StrategyGlobal --> StrategyConnection
    StrategyGlobal --> StrategySchema
    StrategyGlobal --> StrategyValidation
    
    BacktestGlobal --> BacktestLogicPublic
    BacktestLogicPublic --> BacktestLogicPrivate
    
    BacktestLogicPrivate --> StrategyGlobal
    
    StrategyConnection --> StrategySchema
    StrategyConnection --> ExchangeConnection
    StrategyConnection --> ClientStrategy
    
    ExchangeConnection --> ExchangeSchema
    ExchangeConnection --> ClientExchange
```

**Layer Dependency Rules:**

| Layer | May Depend On | Cannot Depend On |
|-------|---------------|------------------|
| Public API Functions | All Service Layers | Client Classes (directly) |
| Global Services | Logic Services, Connection Services, Schema Services, Validation Services | Client Classes (directly) |
| Logic Services | Global Services, Connection Services, Schema Services, Context Services | Client Classes (directly) |
| Connection Services | Schema Services, Other Connection Services, Context Services | Client Classes receive them as params |
| Schema Services | Base Services only | Any higher layer |
| Validation Services | Schema Services, Base Services | Any higher layer |
| Client Classes | Nothing (DI-free) | All service layers |

The DI system enforces this layering through constructor injection - each layer only has access to the tokens it needs, preventing architectural violations.

**Sources:** [docs/internals.md:28-40](), [src/lib/index.ts:49-162](), [src/function/add.ts:1-342]()
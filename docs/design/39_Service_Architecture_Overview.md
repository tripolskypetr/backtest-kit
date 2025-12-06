# Service Architecture Overview

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/function/add.ts](src/function/add.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)

</details>



## Purpose and Scope

This document explains the service layer architecture in backtest-kit, which sits between the Public API and Client classes. The service layer implements a matrix-based organization pattern where services are categorized by both functional role (Connection, Schema, Validation, Global, Logic, Markdown, Template, Command) and component type (Strategy, Exchange, Frame, Risk, Sizing, Walker, Optimizer, Partial). This page covers the service matrix structure and dependency injection system. For implementation details of specific service categories, see pages 7.2-7.7.

## Service Layer Pattern

The service layer implements a dependency injection architecture using Symbol-based tokens from `di-scoped` package. All services are singleton instances registered in [src/lib/core/provide.ts:52-131]() using the `provide()` function and injected in [src/lib/index.ts:57-210]() using the `inject<T>()` function. The DI container is initialized via `init()` call at [src/lib/index.ts:226]().

The service layer isolates business logic (Client classes) from framework concerns (validation, context propagation, persistence, reporting). Client classes (`ClientStrategy`, `ClientExchange`, `ClientFrame`, `ClientRisk`, `ClientSizing`, `ClientOptimizer`) have no DI dependencies and receive all parameters explicitly through constructor injection, while services handle cross-cutting concerns through the DI container.

**Sources:** [src/lib/index.ts:1-232](), [src/lib/core/provide.ts:1-132]()

## Service Category Matrix

The framework organizes services into 11 functional categories, with most categories having component-specific implementations following a matrix pattern:

**Service Categories by Function:**

```mermaid
graph TB
    subgraph "Execution Flow Layers"
        Command["Command Services<br/>BacktestCommandService<br/>LiveCommandService<br/>WalkerCommandService"]
        LogicPublic["Logic Public Services<br/>BacktestLogicPublicService<br/>LiveLogicPublicService<br/>WalkerLogicPublicService"]
        LogicPrivate["Logic Private Services<br/>BacktestLogicPrivateService<br/>LiveLogicPrivateService<br/>WalkerLogicPrivateService"]
    end
    
    subgraph "Component Instance Management"
        Global["Global Services<br/>StrategyGlobalService<br/>ExchangeGlobalService<br/>FrameGlobalService<br/>RiskGlobalService<br/>SizingGlobalService<br/>OptimizerGlobalService<br/>PartialGlobalService"]
        Connection["Connection Services<br/>StrategyConnectionService<br/>ExchangeConnectionService<br/>FrameConnectionService<br/>RiskConnectionService<br/>SizingConnectionService<br/>OptimizerConnectionService<br/>PartialConnectionService"]
    end
    
    subgraph "Configuration & Validation"
        Schema["Schema Services<br/>StrategySchemaService<br/>ExchangeSchemaService<br/>FrameSchemaService<br/>WalkerSchemaService<br/>RiskSchemaService<br/>SizingSchemaService<br/>OptimizerSchemaService"]
        Validation["Validation Services<br/>StrategyValidationService<br/>ExchangeValidationService<br/>FrameValidationService<br/>WalkerValidationService<br/>RiskValidationService<br/>SizingValidationService<br/>OptimizerValidationService"]
    end
    
    subgraph "Reporting & Code Generation"
        Markdown["Markdown Services<br/>BacktestMarkdownService<br/>LiveMarkdownService<br/>ScheduleMarkdownService<br/>PerformanceMarkdownService<br/>WalkerMarkdownService<br/>HeatMarkdownService<br/>PartialMarkdownService"]
        Template["Template Services<br/>OptimizerTemplateService"]
    end
    
    subgraph "Infrastructure"
        Base["Base Services<br/>LoggerService"]
        Context["Context Services<br/>ExecutionContextService<br/>MethodContextService"]
    end
    
    Command --> LogicPublic
    LogicPublic --> LogicPrivate
    LogicPrivate --> Global
    Global --> Connection
    Global --> Validation
    Connection --> Schema
    Validation --> Schema
    LogicPrivate --> Markdown
    Connection --> Template
    
    Global -.-> Context
    Connection -.-> Context
    LogicPrivate -.-> Context
    
    Global -.-> Base
    Connection -.-> Base
    LogicPrivate -.-> Base
```

**Sources:** [src/lib/core/types.ts:1-97](), [src/lib/index.ts:57-224]()

## Service Organization in Code

Services are organized into 11 groups in the codebase, with each group containing related service instances:

| Category | Service Count | Symbol Names (types.ts) | File Location |
|----------|---------------|-------------------------|---------------|
| Base Services | 1 | `loggerService` | [src/lib/services/base/]() |
| Context Services | 2 | `executionContextService`, `methodContextService` | [src/lib/services/context/]() |
| Connection Services | 7 | `exchangeConnectionService`, `strategyConnectionService`, `frameConnectionService`, `sizingConnectionService`, `riskConnectionService`, `optimizerConnectionService`, `partialConnectionService` | [src/lib/services/connection/]() |
| Schema Services | 7 | `exchangeSchemaService`, `strategySchemaService`, `frameSchemaService`, `walkerSchemaService`, `sizingSchemaService`, `riskSchemaService`, `optimizerSchemaService` | [src/lib/services/schema/]() |
| Global Services | 7 | `exchangeGlobalService`, `strategyGlobalService`, `frameGlobalService`, `sizingGlobalService`, `riskGlobalService`, `optimizerGlobalService`, `partialGlobalService` | [src/lib/services/global/]() |
| Command Services | 3 | `liveCommandService`, `backtestCommandService`, `walkerCommandService` | [src/lib/services/command/]() |
| Logic Private Services | 3 | `backtestLogicPrivateService`, `liveLogicPrivateService`, `walkerLogicPrivateService` | [src/lib/services/logic/private/]() |
| Logic Public Services | 3 | `backtestLogicPublicService`, `liveLogicPublicService`, `walkerLogicPublicService` | [src/lib/services/logic/public/]() |
| Markdown Services | 7 | `backtestMarkdownService`, `liveMarkdownService`, `scheduleMarkdownService`, `performanceMarkdownService`, `walkerMarkdownService`, `heatMarkdownService`, `partialMarkdownService` | [src/lib/services/markdown/]() |
| Validation Services | 7 | `exchangeValidationService`, `strategyValidationService`, `frameValidationService`, `walkerValidationService`, `sizingValidationService`, `riskValidationService`, `optimizerValidationService` | [src/lib/services/validation/]() |
| Template Services | 1 | `optimizerTemplateService` | [src/lib/services/template/]() |

**Total Service Count:** 48 services

The dependency injection container is initialized through three core files:

1. **[src/lib/core/types.ts:1-97]()**: Defines Symbol-based tokens for all 48 services organized into category groups at lines 1-3 (base), 5-8 (context), 10-18 (connection), 20-28 (schema), 30-38 (global), 40-44 (command), 46-50 (logicPrivate), 52-56 (logicPublic), 58-66 (markdown), 68-76 (validation), 78-80 (template)
2. **[src/lib/core/provide.ts:52-131]()**: Binds service implementations to tokens using `provide()` function with factory callbacks
3. **[src/lib/index.ts:57-224]()**: Injects services using `inject<T>()` and aggregates them into the unified `backtest` export object at lines 212-224

**Sources:** [src/lib/index.ts:57-224](), [src/lib/core/types.ts:1-97](), [src/lib/core/provide.ts:52-131]()

## Dependency Injection System

Services use Symbol-based dependency injection for type-safe resolution. Each service type has a unique Symbol identifier defined in [src/lib/core/types.ts](), which is used as a token key for the DI container.

**DI Container Initialization Flow:**

```mermaid
graph TB
    subgraph "1. Symbol Token Definition"
        TypesFile["src/lib/core/types.ts"]
        Token1["const connectionServices = {<br/>strategyConnectionService: Symbol('strategyConnectionService'),<br/>exchangeConnectionService: Symbol('exchangeConnectionService'),<br/>...}"]
        Token2["const schemaServices = {<br/>strategySchemaService: Symbol('strategySchemaService'),<br/>exchangeSchemaService: Symbol('exchangeSchemaService'),<br/>...}"]
        TypesExport["export const TYPES = {<br/>...connectionServices,<br/>...schemaServices,<br/>...}"]
    end
    
    subgraph "2. Service Registration"
        ProvideFile["src/lib/core/provide.ts"]
        Provide1["provide(TYPES.strategyConnectionService,<br/>() => new StrategyConnectionService())"]
        Provide2["provide(TYPES.strategySchemaService,<br/>() => new StrategySchemaService())"]
        Provide3["provide(TYPES.exchangeConnectionService,<br/>() => new ExchangeConnectionService())"]
    end
    
    subgraph "3. Service Injection"
        IndexFile["src/lib/index.ts"]
        Import["import './core/provide'<br/>import { inject, init } from './core/di'<br/>import TYPES from './core/types'"]
        Inject1["strategyConnectionService: inject<StrategyConnectionService><br/>(TYPES.strategyConnectionService)"]
        Inject2["strategySchemaService: inject<StrategySchemaService><br/>(TYPES.strategySchemaService)"]
        InitCall["init()"]
        Export["export const backtest = {<br/>...connectionServices,<br/>...schemaServices,<br/>...}"]
    end
    
    TypesFile --> Token1
    TypesFile --> Token2
    Token1 --> TypesExport
    Token2 --> TypesExport
    
    TypesExport --> ProvideFile
    ProvideFile --> Provide1
    ProvideFile --> Provide2
    ProvideFile --> Provide3
    
    Provide1 --> IndexFile
    Provide2 --> IndexFile
    Provide3 --> IndexFile
    
    IndexFile --> Import
    Import --> Inject1
    Import --> Inject2
    Inject1 --> InitCall
    Inject2 --> InitCall
    InitCall --> Export
```

The DI container resolves the dependency graph at initialization time via `init()` called in [src/lib/index.ts:226](). Services receive dependencies through constructor injection, with the `di-scoped` package handling singleton lifecycle and lazy initialization.

**Sources:** [src/lib/core/types.ts:1-97](), [src/lib/core/provide.ts:1-132](), [src/lib/index.ts:1-232]()

## Service Category Responsibilities

Each service category has a specific role in the framework's execution flow:

### Base Services (1 service)

`LoggerService` provides logging infrastructure with `info()`, `warn()`, and `error()` methods. All services inject `LoggerService` via DI and use method name constants for log identification.

**File Location:** [src/lib/services/base/LoggerService.ts]()

### Context Services (2 services)

`ExecutionContextService` and `MethodContextService` provide scoped context propagation using the `di-scoped` package. `ExecutionContextService` stores execution-level context (`symbol`, `when`, `backtest` flag), while `MethodContextService` stores method-level context (`strategyName`, `exchangeName`, `frameName`, `riskName`, `sizingName`, `optimizerName`).

**File Location:** [src/lib/services/context/]()

### Schema Services (7 services)

Store component configurations using the `ToolRegistry` pattern from `functools-kit`. Schema services provide a typed registry for strategies, exchanges, frames, walkers, sizing, risk profiles, and optimizers. They expose `register()`, `get()`, and `override()` methods for component management.

**Implementations:** `StrategySchemaService`, `ExchangeSchemaService`, `FrameSchemaService`, `WalkerSchemaService`, `SizingSchemaService`, `RiskSchemaService`, `OptimizerSchemaService`

**File Location:** [src/lib/services/schema/]()

### Validation Services (7 services)

Perform runtime existence checks and cross-component validation. Validation services verify that referenced components exist before execution begins and use memoization to cache validation results. They expose validation methods named after the `add*` pattern (e.g., `addStrategy()`, `addExchange()`).

**Implementations:** `StrategyValidationService`, `ExchangeValidationService`, `FrameValidationService`, `WalkerValidationService`, `SizingValidationService`, `RiskValidationService`, `OptimizerValidationService`

**File Location:** [src/lib/services/validation/]()

### Connection Services (7 services)

Create and memoize Client class instances. Connection services act as factories for `ClientStrategy`, `ClientExchange`, `ClientFrame`, `ClientRisk`, `ClientSizing`, `ClientOptimizer`, and `ClientPartial`. They use `functools-kit`'s `memoize()` to ensure one instance per component name, with memoization keys based on component identifier (e.g., `strategyName`, `exchangeName`).

**Implementations:** `StrategyConnectionService`, `ExchangeConnectionService`, `FrameConnectionService`, `SizingConnectionService`, `RiskConnectionService`, `OptimizerConnectionService`, `PartialConnectionService`

**File Location:** [src/lib/services/connection/]()

### Global Services (7 services)

Provide public API entry points with validation and context setup. Global services wrap lower-level Connection services and ensure all prerequisites are met before component instantiation. They orchestrate validation, context injection, and delegation to Connection services for Client class instantiation.

**Implementations:** `StrategyGlobalService`, `ExchangeGlobalService`, `FrameGlobalService`, `SizingGlobalService`, `RiskGlobalService`, `OptimizerGlobalService`, `PartialGlobalService`

**File Location:** [src/lib/services/global/]()

### Command Services (3 services)

Provide execution mode entry points with validation orchestration. Command services validate all required components exist (strategy, exchange, frame) before delegating to Logic Public services. They expose `run()` methods that return async generators.

**Implementations:** `BacktestCommandService`, `LiveCommandService`, `WalkerCommandService`

**File Location:** [src/lib/services/command/]()

### Logic Public Services (3 services)

Wrap execution logic with method context propagation. Logic Public services use `MethodContextService.runAsyncIterator()` to inject method-level context before delegating to Logic Private services. They expose `run()` methods that return async generators.

**Implementations:** `BacktestLogicPublicService`, `LiveLogicPublicService`, `WalkerLogicPublicService`

**File Location:** [src/lib/services/logic/public/]()

### Logic Private Services (3 services)

Implement core execution loops and async generator flows. Logic Private services contain the actual backtest/live/walker execution logic, including timeframe iteration, signal detection, and result streaming. They expose `run()` methods that return async generators.

**Implementations:** `BacktestLogicPrivateService`, `LiveLogicPrivateService`, `WalkerLogicPrivateService`

**File Location:** [src/lib/services/logic/private/]()

### Markdown Services (7 services)

Subscribe to event emitters and generate performance reports. Markdown services accumulate signal events, calculate statistics (Sharpe Ratio, Win Rate, etc.), and format results as markdown tables. They use memoization per strategy/exchange/frame to maintain separate report storage. They expose `getData()`, `getReport()`, and `dump()` methods.

**Implementations:** `BacktestMarkdownService`, `LiveMarkdownService`, `ScheduleMarkdownService`, `PerformanceMarkdownService`, `WalkerMarkdownService`, `HeatMarkdownService`, `PartialMarkdownService`

**File Location:** [src/lib/services/markdown/]()

### Template Services (1 service)

`OptimizerTemplateService` provides code generation templates for AI-powered strategy optimization. It exposes 11 template methods (`getTopBanner()`, `getJsonDumpTemplate()`, `getTextTemplate()`, `getJsonTemplate()`, `getExchangeTemplate()`, `getFrameTemplate()`, `getStrategyTemplate()`, `getWalkerTemplate()`, `getLauncherTemplate()`, etc.) that generate standalone Node.js code.

**File Location:** [src/lib/services/template/OptimizerTemplateService.ts]()

**Sources:** [src/lib/services/base/](), [src/lib/services/context/](), [src/lib/services/schema/](), [src/lib/services/validation/](), [src/lib/services/connection/](), [src/lib/services/global/](), [src/lib/services/command/](), [src/lib/services/logic/](), [src/lib/services/markdown/](), [src/lib/services/template/]()

## Service Dependency Chain

Services form a dependency chain from user-facing API functions to Client classes. The chain follows a consistent pattern: API → Command → Logic Public → Logic Private → Global → Connection → Schema → Client.

**Backtest Execution Flow:**

```mermaid
graph TB
    User["User Code"]
    
    subgraph "API Layer (src/function/add.ts)"
        AddStrategy["addStrategy(strategySchema)"]
        AddExchange["addExchange(exchangeSchema)"]
        AddFrame["addFrame(frameSchema)"]
    end
    
    subgraph "API Layer (src/class/Backtest.ts)"
        BacktestRun["Backtest.run(symbol, params)"]
    end
    
    subgraph "Validation Layer"
        StrVal["StrategyValidationService.addStrategy()"]
        ExVal["ExchangeValidationService.addExchange()"]
        FrVal["FrameValidationService.addFrame()"]
    end
    
    subgraph "Schema Layer"
        StrSchema["StrategySchemaService.register()"]
        ExSchema["ExchangeSchemaService.register()"]
        FrSchema["FrameSchemaService.register()"]
    end
    
    subgraph "Command Layer"
        BtCmd["BacktestCommandService.run()"]
    end
    
    subgraph "Logic Public Layer"
        BtLogicPub["BacktestLogicPublicService.run()"]
    end
    
    subgraph "Logic Private Layer"
        BtLogicPriv["BacktestLogicPrivateService.run()"]
    end
    
    subgraph "Global Layer"
        StrGlobal["StrategyGlobalService.tick()"]
        ExGlobal["ExchangeGlobalService.getCandles()"]
        FrGlobal["FrameGlobalService.getTimeframe()"]
    end
    
    subgraph "Connection Layer"
        StrConn["StrategyConnectionService.get()"]
        ExConn["ExchangeConnectionService.get()"]
        FrConn["FrameConnectionService.get()"]
    end
    
    subgraph "Client Layer"
        ClientStr["ClientStrategy.tick()"]
        ClientEx["ClientExchange.getCandles()"]
        ClientFr["ClientFrame.getTimeframe()"]
    end
    
    User --> AddStrategy
    User --> AddExchange
    User --> AddFrame
    User --> BacktestRun
    
    AddStrategy --> StrVal
    AddStrategy --> StrSchema
    AddExchange --> ExVal
    AddExchange --> ExSchema
    AddFrame --> FrVal
    AddFrame --> FrSchema
    
    BacktestRun --> BtCmd
    BtCmd --> BtLogicPub
    BtLogicPub --> BtLogicPriv
    
    BtLogicPriv --> StrGlobal
    BtLogicPriv --> ExGlobal
    BtLogicPriv --> FrGlobal
    
    StrGlobal --> StrConn
    ExGlobal --> ExConn
    FrGlobal --> FrConn
    
    StrConn --> ClientStr
    ExConn --> ClientEx
    FrConn --> ClientFr
    
    StrConn -.-> StrSchema
    ExConn -.-> ExSchema
    FrConn -.-> FrSchema
```

The pattern is identical for Live and Walker modes, with `LiveCommandService`/`WalkerCommandService`, `LiveLogicPublicService`/`WalkerLogicPublicService`, and `LiveLogicPrivateService`/`WalkerLogicPrivateService` replacing the Backtest equivalents.

**Sources:** [src/function/add.ts:1-444](), [src/lib/services/command/](), [src/lib/services/logic/](), [src/lib/services/global/](), [src/lib/services/connection/]()

## Component Service Matrix

Services are organized around eight component types (Strategy, Exchange, Frame, Walker, Sizing, Risk, Optimizer, Partial), with most components having a complete service stack following the Global → Connection → Schema → Validation pattern:

| Component | Global Service | Connection Service | Schema Service | Validation Service | Client Class |
|-----------|----------------|-------------------|----------------|-------------------|--------------|
| Strategy | `StrategyGlobalService` | `StrategyConnectionService` | `StrategySchemaService` | `StrategyValidationService` | `ClientStrategy` |
| Exchange | `ExchangeGlobalService` | `ExchangeConnectionService` | `ExchangeSchemaService` | `ExchangeValidationService` | `ClientExchange` |
| Frame | `FrameGlobalService` | `FrameConnectionService` | `FrameSchemaService` | `FrameValidationService` | `ClientFrame` |
| Risk | `RiskGlobalService` | `RiskConnectionService` | `RiskSchemaService` | `RiskValidationService` | `ClientRisk` |
| Sizing | `SizingGlobalService` | `SizingConnectionService` | `SizingSchemaService` | `SizingValidationService` | `ClientSizing` |
| Optimizer | `OptimizerGlobalService` | `OptimizerConnectionService` | `OptimizerSchemaService` | `OptimizerValidationService` | `ClientOptimizer` |
| Partial | `PartialGlobalService` | `PartialConnectionService` | - | - | - |
| Walker | - | - | `WalkerSchemaService` | `WalkerValidationService` | - |

**Component Service Dependencies:**

```mermaid
graph TB
    subgraph "Strategy Component Stack"
        StrGlobal["StrategyGlobalService"]
        StrConn["StrategyConnectionService"]
        StrSchema["StrategySchemaService"]
        StrVal["StrategyValidationService"]
        ClientStr["ClientStrategy"]
        
        StrGlobal --> StrConn
        StrGlobal --> StrVal
        StrConn --> StrSchema
        StrConn --> ClientStr
        StrVal --> StrSchema
    end
    
    subgraph "Exchange Component Stack"
        ExGlobal["ExchangeGlobalService"]
        ExConn["ExchangeConnectionService"]
        ExSchema["ExchangeSchemaService"]
        ExVal["ExchangeValidationService"]
        ClientEx["ClientExchange"]
        
        ExGlobal --> ExConn
        ExGlobal --> ExVal
        ExConn --> ExSchema
        ExConn --> ClientEx
        ExVal --> ExSchema
    end
    
    subgraph "Frame Component Stack"
        FrGlobal["FrameGlobalService"]
        FrConn["FrameConnectionService"]
        FrSchema["FrameSchemaService"]
        FrVal["FrameValidationService"]
        ClientFr["ClientFrame"]
        
        FrGlobal --> FrConn
        FrGlobal --> FrVal
        FrConn --> FrSchema
        FrConn --> ClientFr
        FrVal --> FrSchema
    end
    
    subgraph "Risk Component Stack"
        RiskGlobal["RiskGlobalService"]
        RiskConn["RiskConnectionService"]
        RiskSchema["RiskSchemaService"]
        RiskVal["RiskValidationService"]
        ClientRisk["ClientRisk"]
        
        RiskGlobal --> RiskConn
        RiskGlobal --> RiskVal
        RiskConn --> RiskSchema
        RiskConn --> ClientRisk
        RiskVal --> RiskSchema
    end
    
    subgraph "Sizing Component Stack"
        SizingGlobal["SizingGlobalService"]
        SizingConn["SizingConnectionService"]
        SizingSchema["SizingSchemaService"]
        SizingVal["SizingValidationService"]
        ClientSizing["ClientSizing"]
        
        SizingGlobal --> SizingConn
        SizingGlobal --> SizingVal
        SizingConn --> SizingSchema
        SizingConn --> ClientSizing
        SizingVal --> SizingSchema
    end
    
    subgraph "Optimizer Component Stack"
        OptGlobal["OptimizerGlobalService"]
        OptConn["OptimizerConnectionService"]
        OptSchema["OptimizerSchemaService"]
        OptVal["OptimizerValidationService"]
        ClientOpt["ClientOptimizer"]
        OptTmpl["OptimizerTemplateService"]
        
        OptGlobal --> OptConn
        OptGlobal --> OptVal
        OptConn --> OptSchema
        OptConn --> ClientOpt
        OptConn --> OptTmpl
        OptVal --> OptSchema
    end
```

Walker is a special case that uses Logic services instead of Global/Connection services, as it orchestrates multiple backtest runs rather than managing a single Client instance.

**Sources:** [src/lib/core/types.ts:10-38](), [src/lib/services/global/](), [src/lib/services/connection/](), [src/lib/services/schema/](), [src/lib/services/validation/]()

## Context Propagation Through Services

Services use `MethodContextService` and `ExecutionContextService` from `di-scoped` to propagate context without explicit parameters. The context flows through the service stack:

```mermaid
graph TB
    User["User calls Backtest.run(symbol, context)"]
    
    BtGlobal["BacktestGlobalService.run()"]
    BtLogicPub["BacktestLogicPublicService.run()"]
    BtLogicPriv["BacktestLogicPrivateService.run()"]
    
    MethodWrap["MethodContextService.runAsyncIterator()<br/>Sets: strategyName, exchangeName, frameName"]
    ExecWrap["ExecutionContextService.runInContext()<br/>Sets: symbol, when, backtest"]
    
    StrGlobal["StrategyGlobalService.tick()"]
    StrConn["StrategyConnectionService.get()"]
    ClientStr["ClientStrategy instance"]
    
    User --> BtGlobal
    BtGlobal --> BtLogicPub
    BtLogicPub --> MethodWrap
    MethodWrap --> BtLogicPriv
    BtLogicPriv --> ExecWrap
    ExecWrap --> StrGlobal
    StrGlobal --> StrConn
    StrConn --> ClientStr
    
    Note1["Context available via DI<br/>in all services below this point"]
    
    ExecWrap -.-> Note1
    Note1 -.-> StrGlobal
    Note1 -.-> StrConn
    Note1 -.-> ClientStr
```

Services at any depth can resolve `MethodContextService` or `ExecutionContextService` via DI to access context without it being passed as parameters. This enables clean APIs where strategy authors call `getCandles(symbol, interval, limit)` instead of `getCandles(symbol, interval, limit, context)`.

**Sources:** [src/lib/services/context/ExecutionContextService.ts](), [src/lib/services/context/MethodContextService.ts](), [src/lib/services/logic/public/]()
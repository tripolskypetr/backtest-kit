# Service Architecture Overview


## Purpose and Scope

This document explains the service layer architecture in backtest-kit, which sits between the Public API and Client classes. The service layer provides dependency injection, context management, validation, and orchestration logic. This page covers the six service type categories and their relationships. For implementation details of specific service types, see [Connection Services](./38_Connection_Services.md), [Schema Services](./39_Schema_Services.md), [Validation Services](./40_Validation_Services.md), [Global Services](./41_Global_Services.md), [Logic Services](./42_Logic_Services.md), and [Markdown Services](./43_Markdown_Services.md).

## Service Layer Pattern

The service layer implements a 6-layer architecture where each layer has a specific responsibility in the framework's execution pipeline. Services use dependency injection via `di-kit` with Symbol-based tokens for type-safe resolution. All services are registered in [src/lib/core/provide.ts]() and injected in [src/lib/index.ts]().

The service layer isolates business logic (Client classes) from framework concerns (validation, context propagation, persistence, reporting). Client classes have no DI dependencies and receive all parameters explicitly, while services handle cross-cutting concerns through dependency injection.

**Sources:** [src/lib/index.ts:1-170](), [src/lib/core/provide.ts:1-111](), [docs/internals.md:28-40]()

## Service Type Hierarchy

The framework organizes services into six categories, each with a distinct purpose in the execution flow:

![Mermaid Diagram](./diagrams/37_Service_Architecture_Overview_0.svg)

**Sources:** [src/lib/index.ts:49-162](), [src/lib/core/types.ts:1-81](), [docs/internals.md:28-40]()

## Service Organization in Code

Services are organized into nine groups in the codebase, with each group containing related service instances:

| Group | Symbol Prefix | File Location | Count |
|-------|---------------|---------------|-------|
| Base Services | `loggerService` | [src/lib/services/base/]() | 1 |
| Context Services | `*ContextService` | [src/lib/services/context/]() | 2 |
| Connection Services | `*ConnectionService` | [src/lib/services/connection/]() | 5 |
| Schema Services | `*SchemaService` | [src/lib/services/schema/]() | 6 |
| Global Services | `*GlobalService` | [src/lib/services/global/]() | 8 |
| Logic Private Services | `*LogicPrivateService` | [src/lib/services/logic/private/]() | 3 |
| Logic Public Services | `*LogicPublicService` | [src/lib/services/logic/public/]() | 3 |
| Markdown Services | `*MarkdownService` | [src/lib/services/markdown/]() | 6 |
| Validation Services | `*ValidationService` | [src/lib/services/validation/]() | 6 |

The dependency injection container is initialized through three files:

1. **[src/lib/core/types.ts]()**: Defines Symbol-based tokens for all services
2. **[src/lib/core/provide.ts]()**: Binds service implementations to tokens using `provide()`
3. **[src/lib/index.ts]()**: Injects services using `inject<T>()` and exports the unified `backtest` object

**Sources:** [src/lib/index.ts:1-170](), [src/lib/core/types.ts:1-81](), [src/lib/core/provide.ts:1-111]()

## Dependency Injection System

Services use Symbol-based dependency injection for type-safe resolution. Each service type has a unique Symbol defined in [src/lib/core/types.ts]():

![Mermaid Diagram](./diagrams/37_Service_Architecture_Overview_1.svg)

Services receive dependencies through constructor injection. The DI container resolves the dependency graph at initialization time via `init()` called in [src/lib/index.ts:164]().

**Sources:** [src/lib/core/types.ts:1-81](), [src/lib/core/provide.ts:1-111](), [src/lib/index.ts:1-170]()

## Service Type Responsibilities

Each service type has a specific role in the framework's execution flow:

### Schema Services

Store component configurations using the ToolRegistry pattern from `functools-kit`. Schema services provide a typed registry for strategies, exchanges, frames, walkers, sizing, and risk profiles. They perform shallow validation during registration and allow runtime retrieval by name.

**Key Methods:** `register()`, `get()`, `override()`, `validateShallow()`

**Implementations:** `StrategySchemaService`, `ExchangeSchemaService`, `FrameSchemaService`, `WalkerSchemaService`, `SizingSchemaService`, `RiskSchemaService`

### Validation Services

Perform runtime existence checks and cross-component validation. Validation services use memoization to cache validation results and prevent redundant checks. They verify that referenced components exist before execution begins.

**Key Methods:** `addStrategy()`, `addExchange()`, `addFrame()`, `validate()`, `list()`

**Implementations:** `StrategyValidationService`, `ExchangeValidationService`, `FrameValidationService`, `WalkerValidationService`, `SizingValidationService`, `RiskValidationService`

### Connection Services

Create and memoize Client class instances. Connection services act as factories for `ClientStrategy`, `ClientExchange`, `ClientFrame`, `ClientRisk`, and `ClientSizing`. They use `functools-kit`'s `memoize()` to ensure one instance per component name.

**Key Methods:** `get()` (memoized)

**Implementations:** `StrategyConnectionService`, `ExchangeConnectionService`, `FrameConnectionService`, `SizingConnectionService`, `RiskConnectionService`

### Global Services

Provide public API entry points with validation and context setup. Global services wrap lower-level logic services and ensure all prerequisites are met before execution. They orchestrate validation, context propagation, and delegation to logic services.

**Key Methods:** `tick()`, `backtest()`, `getTimeframe()`, `checkSignal()`

**Implementations:** `StrategyGlobalService`, `ExchangeGlobalService`, `FrameGlobalService`, `BacktestGlobalService`, `LiveGlobalService`, `WalkerGlobalService`, `SizingGlobalService`, `RiskGlobalService`

### Logic Services

Orchestrate execution loops and async generator flows. Logic services are split into Public (context management) and Private (core logic) layers. Public services wrap generators with `MethodContextService.runAsyncIterator()`, while Private services contain the actual backtest/live/walker execution logic.

**Key Methods:** `run()` (async generator)

**Implementations:** `BacktestLogicPublicService`, `BacktestLogicPrivateService`, `LiveLogicPublicService`, `LiveLogicPrivateService`, `WalkerLogicPublicService`, `WalkerLogicPrivateService`

### Markdown Services

Subscribe to event emitters and generate performance reports. Markdown services accumulate signal events, calculate statistics, and format results as markdown tables. They use memoization per strategy/exchange/frame to maintain separate report storage.

**Key Methods:** `getData()`, `getReport()`, `dump()`

**Implementations:** `BacktestMarkdownService`, `LiveMarkdownService`, `ScheduleMarkdownService`, `PerformanceMarkdownService`, `WalkerMarkdownService`, `HeatMarkdownService`

**Sources:** [src/lib/services/schema/](), [src/lib/services/validation/](), [src/lib/services/connection/](), [src/lib/services/global/](), [src/lib/services/logic/](), [src/lib/services/markdown/]()

## Service Dependency Flow

Services form a dependency chain from public API to Client classes:

![Mermaid Diagram](./diagrams/37_Service_Architecture_Overview_2.svg)

**Sources:** [src/lib/index.ts:1-170](), [src/lib/services/global/](), [src/lib/services/logic/](), [src/lib/services/connection/]()

## Component-Specific Service Groups

Services are organized around six component types (Strategy, Exchange, Frame, Walker, Sizing, Risk). Each component has a complete service stack:

![Mermaid Diagram](./diagrams/37_Service_Architecture_Overview_3.svg)

The pattern is consistent across all components: Global → Validation/Logic → Connection → Schema → Client. This uniformity makes the codebase predictable and maintainable.

**Sources:** [src/lib/core/types.ts:1-81](), [src/lib/index.ts:49-162](), [src/lib/core/provide.ts:1-111]()

## Context Propagation Through Services

Services use `MethodContextService` and `ExecutionContextService` from `di-scoped` to propagate context without explicit parameters. The context flows through the service stack:

![Mermaid Diagram](./diagrams/37_Service_Architecture_Overview_4.svg)

Services at any depth can resolve `MethodContextService` or `ExecutionContextService` via DI to access context without it being passed as parameters. This enables clean APIs where strategy authors call `getCandles(symbol, interval, limit)` instead of `getCandles(symbol, interval, limit, context)`.

**Sources:** [src/lib/services/context/ExecutionContextService.ts](), [src/lib/services/context/MethodContextService.ts](), [src/lib/services/logic/public/]()
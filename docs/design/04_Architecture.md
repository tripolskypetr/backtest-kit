# Architecture

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [docs/classes/ClientFrame.md](docs/classes/ClientFrame.md)
- [docs/classes/StrategyConnectionService.md](docs/classes/StrategyConnectionService.md)
- [docs/interfaces/IExchangeParams.md](docs/interfaces/IExchangeParams.md)
- [docs/interfaces/IStrategySchema.md](docs/interfaces/IStrategySchema.md)
- [docs/uml.puml](docs/uml.puml)
- [scripts/uml.mjs](scripts/uml.mjs)
- [src/index.ts](src/index.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [types.d.ts](types.d.ts)

</details>



This document describes the four-layer clean architecture pattern of the backtest-kit framework, including the dependency injection system, service organization, and how components interact across architectural boundaries. It explains how the system maintains separation of concerns through explicit layer boundaries and context propagation mechanisms.

For specific service implementations within each layer, see [Layer Responsibilities](#2.1). For details on the DI system mechanics, see [Dependency Injection System](#2.2). For context propagation patterns, see [Context Propagation](#2.3).

---

## Architectural Overview

The framework implements a **four-layer clean architecture** with strict separation of concerns. Each layer has well-defined responsibilities and communicates through explicit interfaces, enabling testability, modularity, and configuration flexibility.

![Mermaid Diagram](./diagrams\04_Architecture_0.svg)

**Sources:** Diagram 1 from high-level architecture overview, [src/lib/index.ts:1-118](), [src/index.ts:1-56]()

### Layer Responsibilities Summary

| Layer | Directory | Purpose | Key Characteristics |
|-------|-----------|---------|---------------------|
| **Public API** | `src/classes/*`, `src/function/*` | User-facing utilities and entry points | No business logic, delegates to services |
| **Service Orchestration** | `src/lib/services/*` | Dependency injection, routing, context management | Complex wiring, no domain logic |
| **Business Logic** | `src/lib/client/*` | Pure domain logic (strategies, exchanges, frames) | No DI dependencies, highly testable |
| **Cross-Cutting** | `src/lib/services/base/*`, `src/classes/Persist.ts` | Logging, persistence, reporting, context | Injected throughout other layers |

---

## Dependency Injection Infrastructure

The framework uses a **symbol-based dependency injection** system built on `di-kit` for service registration and `di-scoped` for context propagation. All services are lazily instantiated and registered in a central container.

### DI Core Components

![Mermaid Diagram](./diagrams\04_Architecture_1.svg)

**Sources:** [src/lib/core/types.ts:1-57](), [src/lib/core/provide.ts:1-68](), [src/lib/index.ts:29-110]()

### Symbol Registration Pattern

The `types.ts` file defines unique Symbol identifiers for each service, organized into semantic groups:

[src/lib/core/types.ts:1-57]()

```typescript
const baseServices = {
    loggerService: Symbol('loggerService'),
};

const contextServices = {
    executionContextService: Symbol('executionContextService'),
    methodContextService: Symbol('methodContextService'),
};

const connectionServices = {
    exchangeConnectionService: Symbol('exchangeConnectionService'),
    strategyConnectionService: Symbol('strategyConnectionService'),
    frameConnectionService: Symbol('frameConnectionService'),
};
// ... additional service groups
```

The `provide.ts` file registers factory functions for each symbol:

[src/lib/core/provide.ts:24-68]()

```typescript
{
    provide(TYPES.loggerService, () => new LoggerService());
}

{
    provide(TYPES.executionContextService, () => new ExecutionContextService());
    provide(TYPES.methodContextService, () => new MethodContextService());
}

{
    provide(TYPES.exchangeConnectionService, () => new ExchangeConnectionService());
    provide(TYPES.strategyConnectionService, () => new StrategyConnectionService());
    provide(TYPES.frameConnectionService, () => new FrameConnectionService());
}
// ... additional service registrations
```

### Service Aggregator Object

The `backtest` object exported from [src/lib/index.ts:101-110]() acts as a **service locator**, aggregating all services into a single importable object. This design allows consumers to import the entire service graph without managing individual dependencies:

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
};
```

This pattern enables:
- **Centralized access** to all services
- **Lazy initialization** of service instances
- **Type-safe injection** via TypeScript inference
- **Single import point** for framework internals

**Sources:** [src/lib/index.ts:29-118](), [src/lib/core/types.ts:1-57](), [src/lib/core/provide.ts:1-68]()

---

## Service Organization Taxonomy

Services are organized into **six semantic categories** based on their architectural role. This taxonomy enables clear understanding of each service's purpose and dependencies.

![Mermaid Diagram](./diagrams\04_Architecture_2.svg)

**Sources:** [src/lib/index.ts:29-110](), [docs/uml.puml:1-208](), [src/lib/core/types.ts:1-57]()

### Service Category Definitions

| Category | Naming Pattern | Responsibilities | Example |
|----------|----------------|------------------|---------|
| **Base** | `*Service` | Foundational utilities (logging) | `LoggerService` |
| **Context** | `*ContextService` | Scoped context propagation | `ExecutionContextService` |
| **Schema** | `*SchemaService` | Registry of user configurations | `StrategySchemaService` |
| **Connection** | `*ConnectionService` | Memoized client instance factories | `StrategyConnectionService` |
| **Global** | `*GlobalService` | Context injection for domain operations | `StrategyGlobalService` |
| **Logic** | `*LogicPublicService`, `*LogicPrivateService` | Execution orchestration | `BacktestLogicPrivateService` |

---

## Layer Interaction Patterns

Communication between layers follows strict patterns to maintain architectural boundaries. Each pattern serves a specific purpose in the execution flow.

### Configuration Registration Flow

User configuration flows from Public API to Schema registries without executing business logic:

![Mermaid Diagram](./diagrams\04_Architecture_3.svg)

**Sources:** [src/function/add.ts]() (inferred), [types.d.ts:579-579](), [types.d.ts:413-422]()

### Runtime Instance Creation Flow

At execution time, Connection services create memoized client instances from registered schemas:

![Mermaid Diagram](./diagrams\04_Architecture_4.svg)

**Sources:** [docs/classes/StrategyConnectionService.md:10-21](), Diagram 4 from high-level architecture overview

### Context Propagation Pattern

ExecutionContextService and MethodContextService use `di-scoped` to propagate context implicitly without manual parameter passing:

![Mermaid Diagram](./diagrams\04_Architecture_5.svg)

**Sources:** [types.d.ts:84-90](), [types.d.ts:344-351](), [types.d.ts:52-83](), [types.d.ts:310-323]()

---

## Context Propagation Mechanism

The framework uses **scoped services** from `di-scoped` to propagate context without explicit parameter threading. Two context services manage different aspects of execution:

### ExecutionContextService

Provides **runtime execution parameters** for each operation:

| Property | Type | Purpose |
|----------|------|---------|
| `symbol` | `string` | Trading pair (e.g., "BTCUSDT") |
| `when` | `Date` | Current timestamp for operation |
| `backtest` | `boolean` | Execution mode (true = backtest, false = live) |

Used by [src/lib/services/global/]() services to inject context into `ClientExchange` and `ClientStrategy` operations.

**Sources:** [types.d.ts:52-95](), [src/lib/services/context/ExecutionContextService.ts]() (inferred)

### MethodContextService

Provides **schema routing parameters** for dependency resolution:

| Property | Type | Purpose |
|----------|------|---------|
| `strategyName` | `string` | Which strategy schema to use |
| `exchangeName` | `string` | Which exchange schema to use |
| `frameName` | `string` | Which frame schema to use (empty in live mode) |

Used by [src/lib/services/connection/]() services to retrieve correct client instances via memoized factories.

**Sources:** [types.d.ts:310-351](), [src/lib/services/context/MethodContextService.ts]() (inferred)

### Scope Boundaries

Context scope is established at the **Logic Public Service** layer and flows down through all dependent services:

![Mermaid Diagram](./diagrams\04_Architecture_6.svg)

This pattern eliminates the need to pass `strategyName`, `exchangeName`, `symbol`, `when`, and `backtest` as parameters through every method call in the service chain.

**Sources:** Diagram 4 from high-level architecture overview, [types.d.ts:84-90](), [types.d.ts:344-351]()

---

## Service Lifecycle and Instantiation

Services follow a **lazy instantiation** pattern with memoization to optimize performance and memory usage.

### Lifecycle Stages

| Stage | When | Responsible Component | Action |
|-------|------|----------------------|---------|
| **Registration** | Application startup | `provide.ts` | Factory functions registered with DI container |
| **Schema Storage** | User calls `addStrategy()`, `addExchange()`, `addFrame()` | Schema Services | Configuration stored in `Map<name, schema>` |
| **Service Creation** | First `inject<T>(symbol)` call | DI container | Factory function executed, singleton created |
| **Client Instantiation** | First operation requiring specific schema | Connection Services | `ClientStrategy`/`ClientExchange`/`ClientFrame` created and memoized |
| **Context Injection** | Every operation | Global Services | Context propagated via `di-scoped` |

### Memoization Strategy

Connection services use **memoization** to cache client instances by schema name:

![Mermaid Diagram](./diagrams\04_Architecture_7.svg)

This ensures:
- **Single instance per schema name** across all operations
- **No redundant construction overhead** after first use
- **Stateful client behavior** (e.g., signal persistence in `ClientStrategy`)

**Sources:** [docs/classes/StrategyConnectionService.md:61-70](), Diagram 4 from high-level architecture overview

---

## Public API to Business Logic Flow

The complete execution flow from user-facing API to business logic demonstrates all architectural layers working together:

![Mermaid Diagram](./diagrams\04_Architecture_8.svg)

**Key Observations:**

1. **Layer boundaries are explicit** - Each service calls only services in adjacent layers
2. **Context flows implicitly** - No manual parameter passing for `strategyName`, `exchangeName`, `symbol`, `when`, `backtest`
3. **Business logic is pure** - `ClientStrategy` and `ClientExchange` have no knowledge of DI or service infrastructure
4. **Memoization prevents redundancy** - Client instances created once per schema and reused

**Sources:** Diagram 2 from high-level architecture overview, [src/lib/index.ts:1-118]()

---

## Architecture Benefits

This four-layer architecture with dependency injection provides several key advantages:

| Benefit | Mechanism | Impact |
|---------|-----------|--------|
| **Testability** | Business logic in `Client*` classes has no DI dependencies | Unit tests can instantiate `ClientStrategy` directly without mocking framework |
| **Modularity** | Clear layer boundaries with explicit interfaces | Services can be replaced/extended without affecting other layers |
| **Configurability** | Schema registration decoupled from execution | Multiple strategies/exchanges can coexist, selected dynamically via context |
| **Performance** | Memoization in Connection services | No redundant instance creation, minimal overhead |
| **Maintainability** | Consistent service naming and organization | Easy to locate functionality by following naming conventions |
| **Extensibility** | New schemas registered via `add*` functions | Framework supports custom strategies/exchanges without code changes |

**Sources:** Diagram 1 from high-level architecture overview, entire architecture analysis
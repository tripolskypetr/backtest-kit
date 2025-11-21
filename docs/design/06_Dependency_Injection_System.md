# Dependency Injection System

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [docs/classes/ClientFrame.md](docs/classes/ClientFrame.md)
- [docs/classes/StrategyConnectionService.md](docs/classes/StrategyConnectionService.md)
- [docs/interfaces/IExchangeParams.md](docs/interfaces/IExchangeParams.md)
- [docs/interfaces/IStrategySchema.md](docs/interfaces/IStrategySchema.md)
- [docs/uml.puml](docs/uml.puml)
- [scripts/uml.mjs](scripts/uml.mjs)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)

</details>



This document explains the dependency injection (DI) infrastructure that provides the architectural backbone for backtest-kit. The system uses symbol-based service identifiers, factory registration, and a service aggregator pattern to enable loose coupling, testability, and implicit context propagation.

For information about how context services specifically enable implicit parameter passing, see [Context Propagation](#2.3). For details on how services are organized into layers, see [Layer Responsibilities](#2.1).

---

## Overview

The dependency injection system consists of three core components:

1. **Symbol Registry** ([src/lib/core/types.ts]()) - Defines unique identifiers for each service
2. **Factory Registration** ([src/lib/core/provide.ts]()) - Registers factory functions that create service instances
3. **Service Aggregator** ([src/lib/index.ts]()) - Exposes all services through a single `backtest` object

The system uses the `di-kit` and `di-scoped` libraries to provide inversion of control, enabling services to depend on abstractions rather than concrete implementations.

**Sources:** [src/lib/index.ts:1-118](), [src/lib/core/types.ts:1-57](), [src/lib/core/provide.ts:1-68]()

---

## Core DI Components

### Symbol Registry

The `TYPES` constant in [src/lib/core/types.ts]() defines Symbol-based identifiers for every service in the system. Symbols ensure uniqueness and prevent naming collisions.

![Mermaid Diagram](./diagrams\06_Dependency_Injection_System_0.svg)

The symbols are organized into logical groups matching the architectural layers. Each service category is defined as a separate object, then merged into the `TYPES` export at [src/lib/core/types.ts:45-54]().

**Sources:** [src/lib/core/types.ts:1-57]()

---

### Factory Registration

The [src/lib/core/provide.ts]() file registers factory functions for each service using the `provide()` function from `di-kit`. Each registration associates a Symbol identifier with a factory function that instantiates the service.

![Mermaid Diagram](./diagrams\06_Dependency_Injection_System_1.svg)

Factory functions are executed lazily when a service is first requested. Services are singletons by default—once created, the same instance is returned for subsequent injections.

The registration is organized into blocks matching the symbol groups:
- Base services at [src/lib/core/provide.ts:24-26]()
- Context services at [src/lib/core/provide.ts:28-31]()
- Connection services at [src/lib/core/provide.ts:33-37]()
- Schema services at [src/lib/core/provide.ts:39-43]()
- Global services at [src/lib/core/provide.ts:45-51]()
- Logic services at [src/lib/core/provide.ts:53-61]()
- Markdown services at [src/lib/core/provide.ts:63-66]()

**Sources:** [src/lib/core/provide.ts:1-68]()

---

## Service Categories

The framework organizes services into seven logical categories, each serving a distinct architectural purpose:

| Category | Services | Responsibilities |
|----------|----------|------------------|
| **Base** | `LoggerService` | Cross-cutting logging with automatic context enrichment |
| **Context** | `ExecutionContextService`<br/>`MethodContextService` | Implicit context propagation for execution state and routing |
| **Connection** | `StrategyConnectionService`<br/>`ExchangeConnectionService`<br/>`FrameConnectionService` | Memoized factories that route to client instances based on context |
| **Schema** | `StrategySchemaService`<br/>`ExchangeSchemaService`<br/>`FrameSchemaService` | Registry maps storing user-provided configuration schemas |
| **Global** | `StrategyGlobalService`<br/>`ExchangeGlobalService`<br/>`FrameGlobalService`<br/>`LiveGlobalService`<br/>`BacktestGlobalService` | Context injection wrappers that set execution context before delegating |
| **Logic** | `BacktestLogicPublicService`<br/>`BacktestLogicPrivateService`<br/>`LiveLogicPublicService`<br/>`LiveLogicPrivateService` | Orchestration of async generator execution flows |
| **Markdown** | `BacktestMarkdownService`<br/>`LiveMarkdownService` | Passive accumulation of events for report generation |

**Sources:** [src/lib/core/types.ts:1-54](), [src/lib/index.ts:29-110]()

---

## Service Aggregator Pattern

The `backtest` object in [src/lib/index.ts]() acts as a service locator, aggregating all services into a single importable object. This provides a convenient entry point for accessing services without manual dependency injection.

![Mermaid Diagram](./diagrams\06_Dependency_Injection_System_2.svg)

The aggregation pattern uses object spread syntax at [src/lib/index.ts:101-110]() to merge all service groups into a single object:

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

Each service group is constructed by calling `inject<T>()` with the appropriate Symbol identifier. For example, the base services group at [src/lib/index.ts:29-31]():

```typescript
const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};
```

After the `backtest` object is constructed, the container is initialized by calling `init()` at [src/lib/index.ts:112](). This triggers lazy instantiation of any eagerly-loaded services.

**Sources:** [src/lib/index.ts:1-118]()

---

## Dependency Resolution

### Service Injection

Services declare dependencies by calling `inject<T>()` within their constructors or property initializers. The DI container automatically resolves dependencies by looking up the factory function registered for each Symbol.

![Mermaid Diagram](./diagrams\06_Dependency_Injection_System_3.svg)

The dependency graph shown in [docs/uml.puml]() illustrates the complete dependency tree. For example, `StrategyConnectionService` depends on five other services, which are automatically injected when the service is first created.

**Sources:** [docs/classes/StrategyConnectionService.md:29-60](), [docs/uml.puml:28-55]()

---

### Memoization Pattern

Connection services use memoization to cache client instances by their configuration name. The `getStrategy` method in `StrategyConnectionService` demonstrates this pattern:

![Mermaid Diagram](./diagrams\06_Dependency_Injection_System_4.svg)

The memoization ensures that each unique strategy name maps to exactly one `ClientStrategy` instance. This pattern is implemented in:
- `StrategyConnectionService.getStrategy` - caches `ClientStrategy` instances
- `ExchangeConnectionService.getExchange` - caches `ClientExchange` instances
- `FrameConnectionService.getFrame` - caches `ClientFrame` instances

The cache key is the configuration name (`strategyName`, `exchangeName`, or `frameName`) obtained from `MethodContextService.context` at runtime.

**Sources:** [docs/classes/StrategyConnectionService.md:61-71](), [docs/uml.puml:28-173]()

---

## Service Lifecycle

The DI system follows a predictable lifecycle:

![Mermaid Diagram](./diagrams\06_Dependency_Injection_System_5.svg)

**Key Lifecycle Stages:**

1. **Registration Phase** - [src/lib/core/provide.ts]() executes at import time, registering all factory functions
2. **Import Phase** - [src/lib/index.ts]() executes, calling `inject<T>()` for each service to create lazy proxies
3. **Initialization Phase** - `init()` is called at [src/lib/index.ts:112]() to prepare the container
4. **Resolution Phase** - Services are instantiated lazily on first access, with dependencies resolved recursively
5. **Singleton Caching** - Subsequent accesses return the cached singleton instance

**Sources:** [src/lib/core/provide.ts:1-68](), [src/lib/index.ts:1-118]()

---

## Complete Dependency Graph

The following diagram shows the full service dependency hierarchy, illustrating how services depend on each other:

![Mermaid Diagram](./diagrams\06_Dependency_Injection_System_6.svg)

This graph shows that `LoggerService` is the most pervasive dependency, injected into nearly every service. Context services (`ExecutionContextService`, `MethodContextService`) are injected into connection services to enable routing and execution context management. The dependency flow moves upward from Schema → Connection → Global → Logic → Public services.

**Sources:** [docs/uml.puml:1-208]()

---

## Design Benefits

The dependency injection architecture provides several key benefits:

### 1. Testability
Services can be easily mocked or replaced for testing. Tests can inject stub implementations instead of real services.

### 2. Modularity
Each service has a single responsibility and declares its dependencies explicitly. Services can be developed and tested independently.

### 3. Loose Coupling
Services depend on abstractions (interfaces) rather than concrete implementations. The Symbol-based registration prevents tight coupling to specific class names.

### 4. Configuration Flexibility
The registry pattern allows multiple strategies, exchanges, and frames to coexist. Connection services automatically route to the correct implementation based on context.

### 5. Implicit Context Propagation
The `di-scoped` library enables context services to propagate execution context and routing information without explicit parameter threading. See [Context Propagation](#2.3) for details.

### 6. Singleton Management
The DI container ensures that services are created only once and reused throughout the application lifecycle. This prevents memory overhead and maintains consistent state.

### 7. Lazy Initialization
Services are instantiated only when first accessed. This improves startup performance and reduces memory usage when certain features aren't used.

**Sources:** [src/lib/index.ts:1-118](), [src/lib/core/types.ts:1-57](), [src/lib/core/provide.ts:1-68]()
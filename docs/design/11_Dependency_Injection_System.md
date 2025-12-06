# Dependency Injection System

This document describes the dependency injection (DI) container architecture used throughout backtest-kit. The DI system provides type-safe service resolution, singleton lifecycle management, and context propagation for all framework services. For information about the context propagation mechanism itself, see [Context Propagation](./12_Context_Propagation.md). For details on specific service layers, see [Layer Responsibilities](./15_Configuration_Functions.md).

## Overview

The DI system in backtest-kit is based on Symbol-based service tokens, factory-based service registration, and lazy singleton initialization. All services are registered at module load time and resolved on first access. The system enables clean separation of concerns, testability, and predictable service lifecycle management.


## Service Token System

Service tokens are JavaScript Symbols that uniquely identify each service type in the container. Tokens are organized by service category and defined in a centralized registry.

![Mermaid Diagram](./diagrams/11_Dependency_Injection_System_0.svg)

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


## Service Registration

Service registration occurs at module load time via the `provide()` function. Each service is bound to its token with a factory function that creates a new instance. Registration is organized by service category in separate code blocks.

![Mermaid Diagram](./diagrams/11_Dependency_Injection_System_1.svg)

The registration pattern follows a consistent structure:

1. Import service class
2. Call `provide(token, factory)` with token from TYPES and factory function
3. Factory returns new instance of the service class

All services are registered as singletons - the factory is only called once per token, and the same instance is returned on all subsequent resolutions.


## Service Resolution and Aggregation

Services are resolved from the DI container using the `inject()` function and aggregated into typed service collections. The main backtest object exports all services grouped by category.

![Mermaid Diagram](./diagrams/11_Dependency_Injection_System_2.svg)

The `inject()` function performs lazy resolution - services are only instantiated when first accessed. The aggregated `backtest` object serves as the central service locator used throughout the framework.


## Service Lifecycle and Initialization

All services follow a singleton lifecycle pattern. Once a service is resolved from the container, the same instance is reused for all subsequent requests.

![Mermaid Diagram](./diagrams/11_Dependency_Injection_System_3.svg)

Key lifecycle characteristics:

| Phase | Behavior | Example |
|-------|----------|---------|
| Registration | Factory functions stored, not executed | `provide(TYPES.loggerService, () => new LoggerService())` |
| Initialization | Container prepared for resolution | `init()` at module load |
| First Access | Factory executes, dependencies resolved | `backtest.loggerService` triggers creation |
| Subsequent Access | Cached instance returned | Same `LoggerService` instance every time |


## Dependency Injection in Service Constructors

Services declare their dependencies by importing and using the DI system within their constructors. Dependencies are resolved at construction time through recursive DI resolution.

![Mermaid Diagram](./diagrams/11_Dependency_Injection_System_4.svg)

This pattern enables:
- **Automatic Dependency Resolution**: Services don't need to manually pass dependencies
- **Type Safety**: TypeScript enforces correct service types at compile time
- **Testability**: Services can be replaced with mocks by rebinding tokens
- **Decoupling**: Services depend on abstractions (tokens) not concrete implementations


## Memoization Pattern in Connection Services

Connection services use the memoization pattern to ensure that only one client instance exists per schema name. This prevents duplicate client creation and ensures consistent state across the framework.

![Mermaid Diagram](./diagrams/11_Dependency_Injection_System_5.svg)

**Memoized Connection Services:**

| Service | Client Created | Memoization Key | Purpose |
|---------|----------------|-----------------|---------|
| `StrategyConnectionService` | `ClientStrategy` | `strategyName` | Memoizes strategy instances with risk/exchange dependencies |
| `ExchangeConnectionService` | `ClientExchange` | `exchangeName` | Memoizes exchange instances for market data |
| `FrameConnectionService` | `ClientFrame` | `frameName` | Memoizes timeframe generators for backtesting |
| `RiskConnectionService` | `ClientRisk` | `riskName` | Memoizes risk managers shared across strategies |
| `SizingConnectionService` | `ClientSizing` | `sizingName` | Memoizes position sizing calculators |

The memoization is implemented using the `singleshot` decorator from `functools-kit`, which ensures the factory function only executes once per unique key combination.


## Context Propagation via DI-Scoped

The DI system integrates with `di-scoped` to provide context propagation throughout the framework. Two context types flow through the service layer: `ExecutionContext` and `MethodContext`.

![Mermaid Diagram](./diagrams/11_Dependency_Injection_System_6.svg)

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

For detailed information on context propagation mechanics, see [Context Propagation](./12_Context_Propagation.md).


## DI Flow Through Service Layers

The dependency injection system enables clean separation of the six architectural layers. Each layer depends on services from the same or lower layers via DI.

![Mermaid Diagram](./diagrams/11_Dependency_Injection_System_7.svg)

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

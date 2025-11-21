# Cross-Cutting Concerns

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/interfaces/Logger.interface.ts](src/interfaces/Logger.interface.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [src/lib/services/base/LoggerService.ts](src/lib/services/base/LoggerService.ts)

</details>



## Purpose and Scope

This document describes the cross-cutting concerns that span all architectural layers of the backtest-kit framework. Cross-cutting concerns are system-wide capabilities that cannot be cleanly encapsulated within a single layer or component. These include logging, context management, persistence, and reporting mechanisms that are injected throughout the service stack.

For detailed information about specific concerns, see:
- **Logging System**: [10.1](#10.1)
- **Error Handling**: [10.2](#10.2)
- **Context Propagation Architecture**: [2.3](#2.3)
- **Signal Persistence**: [6.3](#6.3)
- **Report Generation**: [9](#9)

---

## System-Wide Concerns Overview

The framework implements four primary cross-cutting concerns:

| Concern | Primary Service | Purpose |
|---------|----------------|---------|
| **Logging** | `LoggerService` | Unified logging with automatic context enrichment |
| **Context Management** | `ExecutionContextService`<br/>`MethodContextService` | Implicit context propagation without explicit parameters |
| **Persistence** | `PersistSignalAdapter` | Crash-safe atomic storage for live trading |
| **Reporting** | `BacktestMarkdownService`<br/>`LiveMarkdownService` | Passive event accumulation and markdown generation |

**Sources:** [src/lib/index.ts:1-118](), [src/lib/core/types.ts:1-57]()

---

## Cross-Cutting Architecture

### Diagram: Cross-Cutting Concerns Integration

![Mermaid Diagram](./diagrams\39_Cross-Cutting_Concerns_0.svg)

This diagram shows how cross-cutting concerns are injected (dashed lines) throughout the layered architecture, providing system-wide capabilities without creating tight coupling.

**Sources:** [src/lib/index.ts:29-110](), [src/lib/core/provide.ts:24-66]()

---

## Logging System

### Service Registration and Injection

The `LoggerService` is registered as a singleton in the dependency injection container and injected into nearly every service in the system.

**Registration:**
[src/lib/core/provide.ts:24-26]()
```typescript
provide(TYPES.loggerService, () => new LoggerService());
```

**Symbol Definition:**
[src/lib/core/types.ts:1-3]()
```typescript
const baseServices = {
    loggerService: Symbol('loggerService'),
};
```

**Service Aggregator Export:**
[src/lib/index.ts:29-31]()
```typescript
const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};
```

### Automatic Context Enrichment

The `LoggerService` automatically appends context information to all log messages without requiring explicit parameters. This is achieved by reading from `MethodContextService` and `ExecutionContextService`.

**Context Injection Pattern:**
[src/lib/services/base/LoggerService.ts:41-71]()

| Context Source | Contains | Availability |
|----------------|----------|--------------|
| `MethodContextService` | `strategyName`, `exchangeName`, `frameName` | Available within service call boundaries |
| `ExecutionContextService` | `symbol`, `when`, `backtest` | Available during tick execution |

**Log Method Implementation:**
[src/lib/services/base/LoggerService.ts:79-86]()

The logger checks context availability using static methods:
- `MethodContextService.hasContext()` 
- `ExecutionContextService.hasContext()`

If context exists, it is automatically appended to all log calls.

### Default No-Op Logger

By default, the logger uses a no-op implementation that silently discards all messages:

[src/lib/services/base/LoggerService.ts:15-28]()

Users configure a custom logger using `setLogger()`:
[src/lib/services/base/LoggerService.ts:138-140]()

### Logger Interface

The framework expects loggers to implement the `ILogger` interface with four severity levels:

[src/interfaces/Logger.interface.ts:6-30]()

| Method | Purpose |
|--------|---------|
| `log()` | General-purpose messages |
| `debug()` | Detailed diagnostic information |
| `info()` | Informational updates |
| `warn()` | Potentially problematic situations |

**Sources:** [src/lib/services/base/LoggerService.ts:1-144](), [src/interfaces/Logger.interface.ts:1-31](), [src/lib/core/types.ts:1-3]()

---

## Context Management Services

### Diagram: Context Service Architecture

![Mermaid Diagram](./diagrams\39_Cross-Cutting_Concerns_1.svg)

**Sources:** [src/lib/services/base/LoggerService.ts:42-71](), [src/lib/index.ts:33-40]()

### MethodContextService

Stores routing keys that determine which strategy/exchange/frame instances to use:

| Property | Type | Purpose |
|----------|------|---------|
| `strategyName` | `string` | Identifies the active strategy |
| `exchangeName` | `string` | Identifies the active exchange |
| `frameName` | `string` | Identifies the active frame |

Set by connection services before routing calls to client instances.

### ExecutionContextService

Stores execution state during tick processing:

| Property | Type | Purpose |
|----------|------|---------|
| `symbol` | `string` | Trading pair being processed |
| `when` | `number` | Current timestamp |
| `backtest` | `boolean` | Execution mode flag |

Set by logic services before each tick execution.

### Context Lifecycle

1. **Registration Phase**: Services registered in DI container
2. **Method Entry**: `MethodContextService` set with routing keys
3. **Tick Execution**: `ExecutionContextService` set with execution state
4. **Logging**: Both contexts automatically read and appended
5. **Method Exit**: Context automatically cleared by `di-scoped`

**Sources:** [src/lib/core/provide.ts:28-31](), [src/lib/index.ts:33-40]()

---

## Persistence Layer

The `PersistSignalAdapter` provides crash-safe atomic file writes for live trading signal persistence. This ensures that on process restart, the system can recover the exact signal state without duplication or loss.

### Key Characteristics

| Feature | Implementation |
|---------|----------------|
| **Atomicity** | Write to temp file, then atomic rename |
| **Crash Recovery** | State loaded from disk on restart |
| **Location** | `./persist` directory |
| **Format** | JSON serialization of `ISignalDto` |

### Integration with ClientStrategy

The `ClientStrategy` calls `PersistSignalAdapter` at critical state transitions:

1. **Signal Opened**: Write full signal to disk before yielding result
2. **Signal Closed**: Write `null` to disk to clear state
3. **System Restart**: Load persisted signal from disk during initialization

This ensures exactly-once signal semantics in production trading.

**Note:** For detailed persistence mechanics, see [6.3](#6.3) Signal Persistence.

**Sources:** Referenced from high-level architecture diagrams

---

## Reporting Services

### Service Specialization

The framework provides two specialized markdown services:

| Service | Mode | Purpose |
|---------|------|---------|
| `BacktestMarkdownService` | Backtest | Accumulates closed signals for historical analysis |
| `LiveMarkdownService` | Live | Tracks opened/closed events for operational monitoring |

**Registration:**
[src/lib/core/provide.ts:63-66]()
```typescript
provide(TYPES.backtestMarkdownService, () => new BacktestMarkdownService());
provide(TYPES.liveMarkdownService, () => new LiveMarkdownService());
```

### Passive Accumulation Pattern

Markdown services observe signal events without affecting execution:

![Mermaid Diagram](./diagrams\39_Cross-Cutting_Concerns_2.svg)

**Sources:** [src/lib/core/types.ts:40-43](), [src/lib/index.ts:96-99]()

---

## Cross-Cutting Integration Patterns

### Pattern 1: Constructor Injection

All services receive cross-cutting dependencies via constructor injection:

![Mermaid Diagram](./diagrams\39_Cross-Cutting_Concerns_3.svg)

Example from any service constructor:
```typescript
private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
private readonly methodContextService = inject<TMethodContextService>(TYPES.methodContextService);
```

### Pattern 2: Implicit Context Reading

Services read context implicitly without explicit parameters:

[src/lib/services/base/LoggerService.ts:55-71]()

This eliminates parameter threading across the call stack.

### Pattern 3: Service Aggregation

All services, including cross-cutting concerns, are aggregated in the `backtest` object:

[src/lib/index.ts:101-110]()
```typescript
export const backtest = {
  ...baseServices,        // LoggerService
  ...contextServices,     // Execution/Method Context
  ...connectionServices,  // Connection routing
  ...schemaServices,      // Configuration registries
  ...globalServices,      // Context injection wrappers
  ...logicPrivateServices,// Execution orchestration
  ...logicPublicServices, // Public API
  ...markdownServices,    // Reporting
};
```

This provides a single import point for all framework capabilities.

### Pattern 4: Scoped Context with di-scoped

Context services use `di-scoped` for automatic cleanup:

- Context set at method entry
- Context available throughout call stack
- Context automatically cleared at method exit
- No manual cleanup required

**Sources:** [src/lib/index.ts:101-110](), [src/lib/services/base/LoggerService.ts:55-71]()

---

## Service Registration Flow

### Diagram: Cross-Cutting Services in DI Container

![Mermaid Diagram](./diagrams\39_Cross-Cutting_Concerns_4.svg)

**Registration Order:**
1. Base services (logger)
2. Context services (execution/method)
3. Connection services
4. Schema services
5. Global services
6. Logic services
7. Markdown services

Each service category is registered in blocks within [src/lib/core/provide.ts:24-66]().

**Sources:** [src/lib/core/types.ts:1-57](), [src/lib/core/provide.ts:1-68](), [src/lib/index.ts:1-118]()

---

## Summary

Cross-cutting concerns in backtest-kit are implemented as injected services that span all architectural layers:

| Concern | Service(s) | Key Feature |
|---------|-----------|-------------|
| **Logging** | `LoggerService` | Automatic context enrichment |
| **Context** | `ExecutionContextService`<br/>`MethodContextService` | Implicit propagation via di-scoped |
| **Persistence** | `PersistSignalAdapter` | Atomic writes for crash recovery |
| **Reporting** | `BacktestMarkdownService`<br/>`LiveMarkdownService` | Passive event accumulation |

These services are registered at startup, injected via constructor parameters, and accessed throughout the call stack without polluting business logic with cross-cutting concerns. The design enables clean separation of concerns while providing system-wide capabilities.

**Sources:** [src/lib/index.ts:1-118](), [src/lib/core/types.ts:1-57](), [src/lib/core/provide.ts:1-68](), [src/lib/services/base/LoggerService.ts:1-144]()
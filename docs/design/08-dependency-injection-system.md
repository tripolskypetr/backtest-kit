---
title: design/08_dependency-injection-system
group: design
---

# Dependency Injection System

# Dependency Injection System

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/add.ts](src/function/add.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/function/list.ts](src/function/list.ts)
- [src/index.ts](src/index.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [types.d.ts](types.d.ts)

</details>



## Purpose and Scope

The Dependency Injection (DI) system provides centralized service management for the backtest-kit framework. It uses Symbol-based keys for type-safe service registration and retrieval, aggregating all services into a single `backtest` object that serves as the framework's service locator. This page documents the DI container implementation, service registration patterns, the aggregation object structure, and the 11 service categories.

For information about how services use scoped context propagation, see [Layered Architecture](./07-layered-architecture.md). For details on individual service implementations, see [Service Categories](./09-service-categories.md).

**Sources:** [src/lib/core/types.ts](), [src/lib/core/provide.ts](), [src/lib/index.ts]()

---

## Architecture Overview

The DI system consists of three core components:

1. **Symbol Registry** - Unique Symbol keys for each service type
2. **Service Provider** - Registration mechanism using factory functions
3. **Service Aggregation** - The `backtest` singleton object exposing all services

```mermaid
graph TB
    subgraph "Symbol Registry (types.ts)"
        TYPES_BASE["baseServices<br/>loggerService: Symbol"]
        TYPES_CONTEXT["contextServices<br/>executionContextService: Symbol<br/>methodContextService: Symbol"]
        TYPES_SCHEMA["schemaServices<br/>exchangeSchemaService: Symbol<br/>strategySchemaService: Symbol<br/>frameSchemaService: Symbol<br/>+4 more"]
        TYPES_VALIDATION["validationServices<br/>exchangeValidationService: Symbol<br/>strategyValidationService: Symbol<br/>+6 more"]
        TYPES_CONNECTION["connectionServices<br/>exchangeConnectionService: Symbol<br/>strategyConnectionService: Symbol<br/>+5 more"]
        TYPES_CORE["coreServices<br/>exchangeCoreService: Symbol<br/>strategyCoreService: Symbol<br/>frameCoreService: Symbol"]
        TYPES_GLOBAL["globalServices<br/>sizingGlobalService: Symbol<br/>riskGlobalService: Symbol<br/>+2 more"]
        TYPES_COMMAND["commandServices<br/>liveCommandService: Symbol<br/>backtestCommandService: Symbol<br/>walkerCommandService: Symbol"]
        TYPES_LOGIC["logicPrivateServices<br/>logicPublicServices<br/>6 symbols total"]
        TYPES_MARKDOWN["markdownServices<br/>9 symbols total"]
        TYPES_TEMPLATE["templateServices<br/>optimizerTemplateService: Symbol"]
    end
    
    subgraph "Service Provider (provide.ts)"
        PROVIDE_BASE["provide(TYPES.loggerService,<br/>() => new LoggerService())"]
        PROVIDE_CONTEXT["provide(TYPES.executionContextService,<br/>() => new ExecutionContextService())<br/>provide(TYPES.methodContextService,<br/>() => new MethodContextService())"]
        PROVIDE_SCHEMA["7 provide() calls<br/>Factory functions instantiate<br/>Schema services"]
        PROVIDE_VALIDATION["8 provide() calls<br/>Factory functions instantiate<br/>Validation services"]
        PROVIDE_CONNECTION["7 provide() calls<br/>Factory functions instantiate<br/>Connection services"]
        PROVIDE_CORE["3 provide() calls<br/>Factory functions instantiate<br/>Core services"]
        PROVIDE_GLOBAL["4 provide() calls<br/>Factory functions instantiate<br/>Global services"]
        PROVIDE_COMMAND["3 provide() calls<br/>Factory functions instantiate<br/>Command services"]
        PROVIDE_LOGIC["12 provide() calls<br/>Public/Private split<br/>6 services each"]
        PROVIDE_MARKDOWN["9 provide() calls<br/>Factory functions instantiate<br/>Markdown services"]
        PROVIDE_TEMPLATE["1 provide() call<br/>OptimizerTemplateService"]
    end
    
    subgraph "Service Aggregation (index.ts)"
        INJECT_BASE["baseServices<br/>inject<LoggerService>(TYPES.loggerService)"]
        INJECT_CONTEXT["contextServices<br/>inject<TExecutionContextService>(...)<br/>inject<TMethodContextService>(...)"]
        INJECT_SCHEMA["schemaServices<br/>7 inject() calls"]
        INJECT_VALIDATION["validationServices<br/>8 inject() calls"]
        INJECT_CONNECTION["connectionServices<br/>7 inject() calls"]
        INJECT_CORE["coreServices<br/>3 inject() calls"]
        INJECT_GLOBAL["globalServices<br/>4 inject() calls"]
        INJECT_COMMAND["commandServices<br/>3 inject() calls"]
        INJECT_LOGIC["logicPrivateServices<br/>logicPublicServices<br/>12 inject() calls"]
        INJECT_MARKDOWN["markdownServices<br/>9 inject() calls"]
        INJECT_TEMPLATE["templateServices<br/>1 inject() call"]
        
        BACKTEST["export const backtest = {<br/>...baseServices,<br/>...contextServices,<br/>...connectionServices,<br/>...schemaServices,<br/>...coreServices,<br/>...globalServices,<br/>...commandServices,<br/>...logicPrivateServices,<br/>...logicPublicServices,<br/>...markdownServices,<br/>...validationServices,<br/>...templateServices<br/>}"]
    end
    
    TYPES_BASE --> PROVIDE_BASE
    TYPES_CONTEXT --> PROVIDE_CONTEXT
    TYPES_SCHEMA --> PROVIDE_SCHEMA
    TYPES_VALIDATION --> PROVIDE_VALIDATION
    TYPES_CONNECTION --> PROVIDE_CONNECTION
    TYPES_CORE --> PROVIDE_CORE
    TYPES_GLOBAL --> PROVIDE_GLOBAL
    TYPES_COMMAND --> PROVIDE_COMMAND
    TYPES_LOGIC --> PROVIDE_LOGIC
    TYPES_MARKDOWN --> PROVIDE_MARKDOWN
    TYPES_TEMPLATE --> PROVIDE_TEMPLATE
    
    PROVIDE_BASE --> INJECT_BASE
    PROVIDE_CONTEXT --> INJECT_CONTEXT
    PROVIDE_SCHEMA --> INJECT_SCHEMA
    PROVIDE_VALIDATION --> INJECT_VALIDATION
    PROVIDE_CONNECTION --> INJECT_CONNECTION
    PROVIDE_CORE --> INJECT_CORE
    PROVIDE_GLOBAL --> INJECT_GLOBAL
    PROVIDE_COMMAND --> INJECT_COMMAND
    PROVIDE_LOGIC --> INJECT_LOGIC
    PROVIDE_MARKDOWN --> INJECT_MARKDOWN
    PROVIDE_TEMPLATE --> INJECT_TEMPLATE
    
    INJECT_BASE --> BACKTEST
    INJECT_CONTEXT --> BACKTEST
    INJECT_SCHEMA --> BACKTEST
    INJECT_VALIDATION --> BACKTEST
    INJECT_CONNECTION --> BACKTEST
    INJECT_CORE --> BACKTEST
    INJECT_GLOBAL --> BACKTEST
    INJECT_COMMAND --> BACKTEST
    INJECT_LOGIC --> BACKTEST
    INJECT_MARKDOWN --> BACKTEST
    INJECT_TEMPLATE --> BACKTEST
```

**Sources:** [src/lib/core/types.ts:1-104](), [src/lib/core/provide.ts:1-141](), [src/lib/index.ts:1-242]()

---

## Symbol-Based Service Keys

The `TYPES` object in [src/lib/core/types.ts]() defines Symbol-based keys for type-safe service registration. Each service category is grouped into a sub-object, then merged into the exported `TYPES` constant.

### Symbol Registry Structure

| Category | Symbol Count | Examples |
|----------|--------------|----------|
| **baseServices** | 1 | `loggerService` |
| **contextServices** | 2 | `executionContextService`, `methodContextService` |
| **connectionServices** | 7 | `exchangeConnectionService`, `strategyConnectionService`, `frameConnectionService`, `sizingConnectionService`, `riskConnectionService`, `optimizerConnectionService`, `partialConnectionService` |
| **schemaServices** | 7 | `exchangeSchemaService`, `strategySchemaService`, `frameSchemaService`, `walkerSchemaService`, `sizingSchemaService`, `riskSchemaService`, `optimizerSchemaService` |
| **coreServices** | 3 | `exchangeCoreService`, `strategyCoreService`, `frameCoreService` |
| **globalServices** | 4 | `sizingGlobalService`, `riskGlobalService`, `optimizerGlobalService`, `partialGlobalService` |
| **commandServices** | 3 | `liveCommandService`, `backtestCommandService`, `walkerCommandService` |
| **logicPrivateServices** | 3 | `backtestLogicPrivateService`, `liveLogicPrivateService`, `walkerLogicPrivateService` |
| **logicPublicServices** | 3 | `backtestLogicPublicService`, `liveLogicPublicService`, `walkerLogicPublicService` |
| **markdownServices** | 9 | `backtestMarkdownService`, `liveMarkdownService`, `scheduleMarkdownService`, `performanceMarkdownService`, `walkerMarkdownService`, `heatMarkdownService`, `partialMarkdownService`, `outlineMarkdownService`, `riskMarkdownService` |
| **validationServices** | 8 | `exchangeValidationService`, `strategyValidationService`, `frameValidationService`, `walkerValidationService`, `sizingValidationService`, `riskValidationService`, `optimizerValidationService`, `configValidationService` |
| **templateServices** | 1 | `optimizerTemplateService` |

### Symbol Definition Pattern

```typescript
// src/lib/core/types.ts
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
    // ... 4 more
};

// Merge all service categories
export const TYPES = {
    ...baseServices,
    ...contextServices,
    ...connectionServices,
    ...schemaServices,
    ...coreServices,
    ...globalServices,
    ...commandServices,
    ...logicPrivateServices,
    ...logicPublicServices,
    ...markdownServices,
    ...validationServices,
    ...templateServices,
}
```

Symbols guarantee uniqueness at runtime, preventing key collisions even if string names clash. Each Symbol is created with a descriptive string for debugging purposes.

**Sources:** [src/lib/core/types.ts:1-104]()

---

## Service Registration Pattern

The [src/lib/core/provide.ts]() file registers all services using the `provide()` function from the DI container. Each registration pairs a Symbol key with a factory function that instantiates the service.

### Registration Flow

```mermaid
graph LR
    IMPORT["Import service classes<br/>LoggerService, ExchangeConnectionService,<br/>StrategySchemaService, etc."]
    PROVIDE["provide(symbol, factory)<br/>Factory function returns<br/>new service instance"]
    CONTAINER["DI Container<br/>Stores symbol → factory mapping"]
    INIT["init()<br/>Called after all registrations<br/>Resolves dependencies"]
    
    IMPORT --> PROVIDE
    PROVIDE --> CONTAINER
    CONTAINER --> INIT
```

### Registration Examples by Category

**Base Services:**
```typescript
// src/lib/core/provide.ts:55-57
{
    provide(TYPES.loggerService, () => new LoggerService());
}
```

**Context Services:**
```typescript
// src/lib/core/provide.ts:59-62
{
    provide(TYPES.executionContextService, () => new ExecutionContextService());
    provide(TYPES.methodContextService, () => new MethodContextService());
}
```

**Connection Services:**
```typescript
// src/lib/core/provide.ts:64-72
{
    provide(TYPES.exchangeConnectionService, () => new ExchangeConnectionService());
    provide(TYPES.strategyConnectionService, () => new StrategyConnectionService());
    provide(TYPES.frameConnectionService, () => new FrameConnectionService());
    provide(TYPES.sizingConnectionService, () => new SizingConnectionService());
    provide(TYPES.riskConnectionService, () => new RiskConnectionService());
    provide(TYPES.optimizerConnectionService, () => new OptimizerConnectionService());
    provide(TYPES.partialConnectionService, () => new PartialConnectionService());
}
```

**Schema Services:**
```typescript
// src/lib/core/provide.ts:74-82
{
    provide(TYPES.exchangeSchemaService, () => new ExchangeSchemaService());
    provide(TYPES.strategySchemaService, () => new StrategySchemaService());
    provide(TYPES.frameSchemaService, () => new FrameSchemaService());
    provide(TYPES.walkerSchemaService, () => new WalkerSchemaService());
    provide(TYPES.sizingSchemaService, () => new SizingSchemaService());
    provide(TYPES.riskSchemaService, () => new RiskSchemaService());
    provide(TYPES.optimizerSchemaService, () => new OptimizerSchemaService());
}
```

All other service categories follow the same pattern. The factory functions are invoked lazily by the DI container when services are first injected.

**Sources:** [src/lib/core/provide.ts:55-141]()

---

## Service Aggregation Object

The [src/lib/index.ts]() file creates the `backtest` aggregation object by injecting all registered services and merging them into a single export. This serves as the framework's primary service locator.

### Aggregation Structure

```mermaid
graph TB
    subgraph "Service Injection (index.ts:60-219)"
        BASE["baseServices = {<br/>loggerService: inject<LoggerService>(TYPES.loggerService)<br/>}"]
        CONTEXT["contextServices = {<br/>executionContextService: inject<TExecutionContextService>(...),<br/>methodContextService: inject<TMethodContextService>(...)<br/>}"]
        CONNECTION["connectionServices = {<br/>exchangeConnectionService: inject<ExchangeConnectionService>(...),<br/>strategyConnectionService: inject<StrategyConnectionService>(...),<br/>... 5 more<br/>}"]
        SCHEMA["schemaServices = {<br/>exchangeSchemaService: inject<ExchangeSchemaService>(...),<br/>strategySchemaService: inject<StrategySchemaService>(...),<br/>... 5 more<br/>}"]
        CORE["coreServices = {<br/>exchangeCoreService: inject<ExchangeCoreService>(...),<br/>strategyCoreService: inject<StrategyCoreService>(...),<br/>frameCoreService: inject<FrameCoreService>(...)<br/>}"]
        GLOBAL["globalServices = {<br/>sizingGlobalService: inject<SizingGlobalService>(...),<br/>riskGlobalService: inject<RiskGlobalService>(...),<br/>... 2 more<br/>}"]
        COMMAND["commandServices = {<br/>liveCommandService: inject<LiveCommandService>(...),<br/>backtestCommandService: inject<BacktestCommandService>(...),<br/>walkerCommandService: inject<WalkerCommandService>(...)<br/>}"]
        LOGIC_PRIV["logicPrivateServices = {<br/>backtestLogicPrivateService: inject<BacktestLogicPrivateService>(...),<br/>liveLogicPrivateService: inject<LiveLogicPrivateService>(...),<br/>walkerLogicPrivateService: inject<WalkerLogicPrivateService>(...)<br/>}"]
        LOGIC_PUB["logicPublicServices = {<br/>backtestLogicPublicService: inject<BacktestLogicPublicService>(...),<br/>liveLogicPublicService: inject<LiveLogicPublicService>(...),<br/>walkerLogicPublicService: inject<WalkerLogicPublicService>(...)<br/>}"]
        MARKDOWN["markdownServices = {<br/>backtestMarkdownService: inject<BacktestMarkdownService>(...),<br/>liveMarkdownService: inject<LiveMarkdownService>(...),<br/>... 7 more<br/>}"]
        VALIDATION["validationServices = {<br/>exchangeValidationService: inject<ExchangeValidationService>(...),<br/>strategyValidationService: inject<StrategyValidationService>(...),<br/>... 6 more<br/>}"]
        TEMPLATE["templateServices = {<br/>optimizerTemplateService: inject<OptimizerTemplateService>(...)<br/>}"]
    end
    
    subgraph "Aggregation (index.ts:221-234)"
        BACKTEST_OBJ["export const backtest = {<br/>...baseServices,<br/>...contextServices,<br/>...connectionServices,<br/>...schemaServices,<br/>...coreServices,<br/>...globalServices,<br/>...commandServices,<br/>...logicPrivateServices,<br/>...logicPublicServices,<br/>...markdownServices,<br/>...validationServices,<br/>...templateServices,<br/>}<br/><br/>Total: 51 services"]
    end
    
    BASE --> BACKTEST_OBJ
    CONTEXT --> BACKTEST_OBJ
    CONNECTION --> BACKTEST_OBJ
    SCHEMA --> BACKTEST_OBJ
    CORE --> BACKTEST_OBJ
    GLOBAL --> BACKTEST_OBJ
    COMMAND --> BACKTEST_OBJ
    LOGIC_PRIV --> BACKTEST_OBJ
    LOGIC_PUB --> BACKTEST_OBJ
    MARKDOWN --> BACKTEST_OBJ
    VALIDATION --> BACKTEST_OBJ
    TEMPLATE --> BACKTEST_OBJ
```

### Initialization and Export

```typescript
// src/lib/index.ts:221-236
export const backtest = {
  ...baseServices,
  ...contextServices,
  ...connectionServices,
  ...schemaServices,
  ...coreServices,
  ...globalServices,
  ...commandServices,
  ...logicPrivateServices,
  ...logicPublicServices,
  ...markdownServices,
  ...validationServices,
  ...templateServices,
};

init(); // Resolves all lazy dependencies

export { ExecutionContextService };
export { MethodContextService };

export default backtest;
```

The `init()` call triggers dependency resolution for all registered services. The `backtest` object is then exported as both a named export and default export.

**Sources:** [src/lib/index.ts:60-242]()

---

## Service Categories

The DI system organizes services into 11 categories based on their architectural role. Each category has a specific responsibility in the overall system.

### Base Services

Provides foundational logging infrastructure.

| Service | Symbol Key | Class | Responsibility |
|---------|-----------|-------|----------------|
| `loggerService` | `TYPES.loggerService` | `LoggerService` | Structured logging with context injection |

**Sources:** [src/lib/core/types.ts:1-3](), [src/lib/core/provide.ts:55-57](), [src/lib/index.ts:60-62]()

---

### Context Services

Provides scoped context propagation using the `di-scoped` library pattern. See [types.d.ts:246-285]() and [types.d.ts:505-544]() for interface definitions.

| Service | Symbol Key | Class | Responsibility |
|---------|-----------|-------|----------------|
| `executionContextService` | `TYPES.executionContextService` | `ExecutionContextService` | Propagates `symbol`, `when`, and `backtest` flag through execution chain |
| `methodContextService` | `TYPES.methodContextService` | `MethodContextService` | Propagates `strategyName`, `exchangeName`, `frameName` for schema routing |

Both services extend the `di-scoped` library's scoped class pattern, enabling implicit context passing without explicit parameters.

```typescript
// Example from types.d.ts:274-280
ExecutionContextService.runInContext(
  async () => {
    // Inside this callback, context is automatically available
    return await someOperation();
  },
  { symbol: "BTCUSDT", when: new Date(), backtest: true }
);
```

**Sources:** [src/lib/core/types.ts:5-8](), [src/lib/core/provide.ts:59-62](), [src/lib/index.ts:64-71](), [types.d.ts:246-285](), [types.d.ts:505-544]()

---

### Schema Services

Store registered user configurations using the Tool Registry pattern (immutable Map-based storage).

| Service | Symbol Key | Class | Stored Schema Type |
|---------|-----------|-------|-------------------|
| `exchangeSchemaService` | `TYPES.exchangeSchemaService` | `ExchangeSchemaService` | `IExchangeSchema` |
| `strategySchemaService` | `TYPES.strategySchemaService` | `StrategySchemaService` | `IStrategySchema` |
| `frameSchemaService` | `TYPES.frameSchemaService` | `FrameSchemaService` | `IFrameSchema` |
| `walkerSchemaService` | `TYPES.walkerSchemaService` | `WalkerSchemaService` | `IWalkerSchema` |
| `sizingSchemaService` | `TYPES.sizingSchemaService` | `SizingSchemaService` | `ISizingSchema` |
| `riskSchemaService` | `TYPES.riskSchemaService` | `RiskSchemaService` | `IRiskSchema` |
| `optimizerSchemaService` | `TYPES.optimizerSchemaService` | `OptimizerSchemaService` | `IOptimizerSchema` |

Each Schema Service provides:
- `register(name: string, schema: TSchema): void` - Store schema
- `get(name: string): TSchema | null` - Retrieve schema
- `has(name: string): boolean` - Check existence

**Sources:** [src/lib/core/types.ts:20-28](), [src/lib/core/provide.ts:74-82](), [src/lib/index.ts:97-111]()

---

### Validation Services

Enforce schema structure and business rules before registration.

| Service | Symbol Key | Class | Validates |
|---------|-----------|-------|-----------|
| `exchangeValidationService` | `TYPES.exchangeValidationService` | `ExchangeValidationService` | `IExchangeSchema` structure, required fields |
| `strategyValidationService` | `TYPES.strategyValidationService` | `StrategyValidationService` | `IStrategySchema` structure, interval validity, memoization |
| `frameValidationService` | `TYPES.frameValidationService` | `FrameValidationService` | `IFrameSchema` structure, date range logic |
| `walkerValidationService` | `TYPES.walkerValidationService` | `WalkerValidationService` | `IWalkerSchema` structure, strategy list, metric |
| `sizingValidationService` | `TYPES.sizingValidationService` | `SizingValidationService` | `ISizingSchema` structure, method-specific params |
| `riskValidationService` | `TYPES.riskValidationService` | `RiskValidationService` | `IRiskSchema` structure, validation array |
| `optimizerValidationService` | `TYPES.optimizerValidationService` | `OptimizerValidationService` | `IOptimizerSchema` structure, source functions |
| `configValidationService` | `TYPES.configValidationService` | `ConfigValidationService` | Global config economic viability |

Each Validation Service provides:
- `addXXX(name: string, schema: TSchema): void` - Validate and throw on error
- `list(): Promise<TSchema[]>` - Return all registered schemas

**Sources:** [src/lib/core/types.ts:73-82](), [src/lib/core/provide.ts:127-136](), [src/lib/index.ts:188-213]()

---

### Connection Services

Factory pattern for creating memoized client instances. Each service maintains a cache keyed by identifier strings to prevent duplicate instantiation.

| Service | Symbol Key | Class | Factory Return Type | Cache Key Pattern |
|---------|-----------|-------|-------------------|------------------|
| `exchangeConnectionService` | `TYPES.exchangeConnectionService` | `ExchangeConnectionService` | `IExchange` (ClientExchange) | `exchangeName` |
| `strategyConnectionService` | `TYPES.strategyConnectionService` | `StrategyConnectionService` | `IStrategy` (ClientStrategy) | `symbol:strategyName` |
| `frameConnectionService` | `TYPES.frameConnectionService` | `FrameConnectionService` | `IFrame` (ClientFrame) | `frameName` |
| `sizingConnectionService` | `TYPES.sizingConnectionService` | `SizingConnectionService` | `ISizing` (ClientSizing) | `sizingName` |
| `riskConnectionService` | `TYPES.riskConnectionService` | `RiskConnectionService` | `IRisk` (ClientRisk) | `riskName` |
| `optimizerConnectionService` | `TYPES.optimizerConnectionService` | `OptimizerConnectionService` | `IOptimizer` (ClientOptimizer) | `optimizerName` |
| `partialConnectionService` | `TYPES.partialConnectionService` | `PartialConnectionService` | `IPartial` (ClientPartial) | `symbol` |

### Connection Service Pattern

```typescript
// Typical Connection Service structure
class ExchangeConnectionService {
  private cache = new Map<string, IExchange>();

  getExchange(exchangeName: string): IExchange {
    if (!this.cache.has(exchangeName)) {
      const schema = schemaService.get(exchangeName);
      const client = new ClientExchange(schema, dependencies);
      this.cache.set(exchangeName, client);
    }
    return this.cache.get(exchangeName)!;
  }
}
```

Memoization ensures that multiple calls with the same identifier return the same client instance, preserving internal state.

**Sources:** [src/lib/core/types.ts:10-18](), [src/lib/core/provide.ts:64-72](), [src/lib/index.ts:73-95]()

---

### Core Services

Implement domain logic for primary business entities.

| Service | Symbol Key | Class | Responsibility |
|---------|-----------|-------|----------------|
| `exchangeCoreService` | `TYPES.exchangeCoreService` | `ExchangeCoreService` | Candle fetching (`getCandles`, `getNextCandles`), VWAP calculation |
| `strategyCoreService` | `TYPES.strategyCoreService` | `StrategyCoreService` | Signal lifecycle management (`tick`, `backtest` methods) |
| `frameCoreService` | `TYPES.frameCoreService` | `FrameCoreService` | Timeframe generation, date iteration |

Core Services are invoked by Logic Services to execute domain operations. They consume Connection Services to access client instances.

**Sources:** [src/lib/core/types.ts:30-34](), [src/lib/core/provide.ts:84-88](), [src/lib/index.ts:113-117]()

---

### Global Services

Provide portfolio-level orchestration and shared state management.

| Service | Symbol Key | Class | Responsibility |
|---------|-----------|-------|----------------|
| `sizingGlobalService` | `TYPES.sizingGlobalService` | `SizingGlobalService` | Position size calculation across strategies |
| `riskGlobalService` | `TYPES.riskGlobalService` | `RiskGlobalService` | Risk state management, position tracking |
| `optimizerGlobalService` | `TYPES.optimizerGlobalService` | `OptimizerGlobalService` | Optimizer orchestration, validation wrapper |
| `partialGlobalService` | `TYPES.partialGlobalService` | `PartialGlobalService` | Partial profit/loss tracking, milestone management |

Global Services coordinate between multiple client instances and provide cross-cutting concerns like risk limits and position sizing.

**Sources:** [src/lib/core/types.ts:36-41](), [src/lib/core/provide.ts:90-95](), [src/lib/index.ts:119-128]()

---

### Command Services

High-level orchestration layer that coordinates validation, context setup, and execution.

| Service | Symbol Key | Class | Orchestrates |
|---------|-----------|-------|-------------|
| `liveCommandService` | `TYPES.liveCommandService` | `LiveCommandService` | Live trading execution workflow |
| `backtestCommandService` | `TYPES.backtestCommandService` | `BacktestCommandService` | Backtest execution workflow |
| `walkerCommandService` | `TYPES.walkerCommandService` | `WalkerCommandService` | Walker comparison workflow |

Command Services delegate to Logic Services after performing validation and context initialization.

**Sources:** [src/lib/core/types.ts:43-47](), [src/lib/core/provide.ts:97-101](), [src/lib/index.ts:130-138]()

---

### Logic Services

Implement execution flow with public/private split. Public services wrap private services with context setup.

| Service | Symbol Key | Class | Execution Pattern |
|---------|-----------|-------|------------------|
| `backtestLogicPublicService` | `TYPES.backtestLogicPublicService` | `BacktestLogicPublicService` | Sets up `MethodContextService` context |
| `backtestLogicPrivateService` | `TYPES.backtestLogicPrivateService` | `BacktestLogicPrivateService` | Generator implementation with timeframe iteration |
| `liveLogicPublicService` | `TYPES.liveLogicPublicService` | `LiveLogicPublicService` | Sets up `MethodContextService` context |
| `liveLogicPrivateService` | `TYPES.liveLogicPrivateService` | `LiveLogicPrivateService` | Generator implementation with infinite loop |
| `walkerLogicPublicService` | `TYPES.walkerLogicPublicService` | `WalkerLogicPublicService` | Sets up `MethodContextService` context |
| `walkerLogicPrivateService` | `TYPES.walkerLogicPrivateService` | `WalkerLogicPrivateService` | Generator implementation with sequential backtests |

### Public/Private Pattern

```typescript
// Public Service (context wrapper)
class BacktestLogicPublicService {
  async *run(symbol: string, options: BacktestOptions) {
    yield* MethodContextService.runAsyncIterator(
      () => this.privateService.run(symbol, options),
      { strategyName: options.strategyName, exchangeName: options.exchangeName, frameName: options.frameName }
    );
  }
}

// Private Service (generator implementation)
class BacktestLogicPrivateService {
  async *run(symbol: string, options: BacktestOptions) {
    const timeframe = await this.frameService.getTimeframe(symbol, options.frameName);
    for (const when of timeframe) {
      // Execution logic
      yield result;
    }
  }
}
```

**Sources:** [src/lib/core/types.ts:49-59](), [src/lib/core/provide.ts:103-113](), [src/lib/index.ts:140-162]()

---

### Markdown Services

Generate reports and calculate statistics from accumulated events.

| Service | Symbol Key | Class | Report Type |
|---------|-----------|-------|------------|
| `backtestMarkdownService` | `TYPES.backtestMarkdownService` | `BacktestMarkdownService` | Closed signals, PnL statistics (MAX_EVENTS: 250) |
| `liveMarkdownService` | `TYPES.liveMarkdownService` | `LiveMarkdownService` | All tick types, live monitoring (MAX_EVENTS: 250) |
| `scheduleMarkdownService` | `TYPES.scheduleMarkdownService` | `ScheduleMarkdownService` | Scheduled signals, activation tracking (MAX_EVENTS: 250) |
| `performanceMarkdownService` | `TYPES.performanceMarkdownService` | `PerformanceMarkdownService` | Execution metrics, duration tracking (MAX_EVENTS: 10000) |
| `walkerMarkdownService` | `TYPES.walkerMarkdownService` | `WalkerMarkdownService` | Comparison tables, best strategy (unbounded) |
| `heatMarkdownService` | `TYPES.heatMarkdownService` | `HeatMarkdownService` | Portfolio heatmap, symbol statistics (unbounded) |
| `partialMarkdownService` | `TYPES.partialMarkdownService` | `PartialMarkdownService` | Partial P/L, milestone events (MAX_EVENTS: 250) |
| `outlineMarkdownService` | `TYPES.outlineMarkdownService` | `OutlineMarkdownService` | System outline, configuration dump (unbounded) |
| `riskMarkdownService` | `TYPES.riskMarkdownService` | `RiskMarkdownService` | Risk rejections, validation stats (unbounded) |

Each Markdown Service subscribes to relevant event emitters and provides:
- `getData(): TData[]` - Return accumulated event data
- `getReport(): string` - Generate markdown report
- `dump(filepath: string): Promise<void>` - Write report to file

**Sources:** [src/lib/core/types.ts:61-71](), [src/lib/core/provide.ts:115-125](), [src/lib/index.ts:164-186]()

---

### Template Services

Generate code artifacts for strategy creation.

| Service | Symbol Key | Class | Responsibility |
|---------|-----------|-------|----------------|
| `optimizerTemplateService` | `TYPES.optimizerTemplateService` | `OptimizerTemplateService` | Code generation for optimizer output, default templates |

The Optimizer Template Service merges user-provided template overrides with default templates to generate complete executable `.mjs` files containing strategy implementations.

**Sources:** [src/lib/core/types.ts:84-86](), [src/lib/core/provide.ts:138-140](), [src/lib/index.ts:215-219]()

---

## Service Dependency Flow

The following diagram illustrates how services depend on each other within the DI system.

```mermaid
graph TB
    subgraph "Public API Layer (function/)"
        ADD["addStrategy, addExchange,<br/>addFrame, addWalker,<br/>addSizing, addRisk,<br/>addOptimizer"]
        LIST["listStrategies,<br/>listExchanges,<br/>listFrames, etc."]
        EVENT["listenSignal,<br/>listenError,<br/>listenPartialProfit, etc."]
    end
    
    subgraph "Command Services"
        LIVE_CMD["LiveCommandService"]
        BACKTEST_CMD["BacktestCommandService"]
        WALKER_CMD["WalkerCommandService"]
    end
    
    subgraph "Logic Services (Public)"
        LIVE_PUB["LiveLogicPublicService"]
        BACKTEST_PUB["BacktestLogicPublicService"]
        WALKER_PUB["WalkerLogicPublicService"]
    end
    
    subgraph "Logic Services (Private)"
        LIVE_PRIV["LiveLogicPrivateService"]
        BACKTEST_PRIV["BacktestLogicPrivateService"]
        WALKER_PRIV["WalkerLogicPrivateService"]
    end
    
    subgraph "Core Services"
        STRATEGY_CORE["StrategyCoreService<br/>tick(), backtest()"]
        EXCHANGE_CORE["ExchangeCoreService<br/>getCandles(), VWAP"]
        FRAME_CORE["FrameCoreService<br/>getTimeframe()"]
    end
    
    subgraph "Connection Services"
        STRATEGY_CONN["StrategyConnectionService<br/>Memoized ClientStrategy"]
        EXCHANGE_CONN["ExchangeConnectionService<br/>Memoized ClientExchange"]
        FRAME_CONN["FrameConnectionService<br/>Memoized ClientFrame"]
        SIZING_CONN["SizingConnectionService<br/>Memoized ClientSizing"]
        RISK_CONN["RiskConnectionService<br/>Memoized ClientRisk"]
        OPTIMIZER_CONN["OptimizerConnectionService<br/>Memoized ClientOptimizer"]
        PARTIAL_CONN["PartialConnectionService<br/>Memoized ClientPartial"]
    end
    
    subgraph "Schema Services"
        STRATEGY_SCHEMA["StrategySchemaService<br/>ToolRegistry pattern"]
        EXCHANGE_SCHEMA["ExchangeSchemaService<br/>ToolRegistry pattern"]
        FRAME_SCHEMA["FrameSchemaService<br/>ToolRegistry pattern"]
        SIZING_SCHEMA["SizingSchemaService<br/>ToolRegistry pattern"]
        RISK_SCHEMA["RiskSchemaService<br/>ToolRegistry pattern"]
        OPTIMIZER_SCHEMA["OptimizerSchemaService<br/>ToolRegistry pattern"]
        WALKER_SCHEMA["WalkerSchemaService<br/>ToolRegistry pattern"]
    end
    
    subgraph "Validation Services"
        STRATEGY_VAL["StrategyValidationService"]
        EXCHANGE_VAL["ExchangeValidationService"]
        FRAME_VAL["FrameValidationService"]
        SIZING_VAL["SizingValidationService"]
        RISK_VAL["RiskValidationService"]
        OPTIMIZER_VAL["OptimizerValidationService"]
        WALKER_VAL["WalkerValidationService"]
        CONFIG_VAL["ConfigValidationService"]
    end
    
    subgraph "Global Services"
        SIZING_GLOBAL["SizingGlobalService"]
        RISK_GLOBAL["RiskGlobalService"]
        OPTIMIZER_GLOBAL["OptimizerGlobalService"]
        PARTIAL_GLOBAL["PartialGlobalService"]
    end
    
    subgraph "Markdown Services"
        BACKTEST_MD["BacktestMarkdownService"]
        LIVE_MD["LiveMarkdownService"]
        WALKER_MD["WalkerMarkdownService"]
        PARTIAL_MD["PartialMarkdownService"]
        RISK_MD["RiskMarkdownService"]
    end
    
    subgraph "Context Services"
        EXEC_CTX["ExecutionContextService<br/>symbol, when, backtest"]
        METHOD_CTX["MethodContextService<br/>strategyName, exchangeName,<br/>frameName"]
    end
    
    subgraph "Base Services"
        LOGGER["LoggerService"]
    end
    
    ADD --> STRATEGY_VAL
    ADD --> EXCHANGE_VAL
    ADD --> STRATEGY_SCHEMA
    ADD --> EXCHANGE_SCHEMA
    
    LIST --> STRATEGY_VAL
    LIST --> EXCHANGE_VAL
    
    LIVE_CMD --> LIVE_PUB
    BACKTEST_CMD --> BACKTEST_PUB
    WALKER_CMD --> WALKER_PUB
    
    LIVE_PUB --> METHOD_CTX
    LIVE_PUB --> LIVE_PRIV
    BACKTEST_PUB --> METHOD_CTX
    BACKTEST_PUB --> BACKTEST_PRIV
    WALKER_PUB --> METHOD_CTX
    WALKER_PUB --> WALKER_PRIV
    
    LIVE_PRIV --> STRATEGY_CORE
    BACKTEST_PRIV --> STRATEGY_CORE
    BACKTEST_PRIV --> EXCHANGE_CORE
    BACKTEST_PRIV --> FRAME_CORE
    WALKER_PRIV --> BACKTEST_PUB
    
    STRATEGY_CORE --> STRATEGY_CONN
    STRATEGY_CORE --> EXEC_CTX
    EXCHANGE_CORE --> EXCHANGE_CONN
    EXCHANGE_CORE --> EXEC_CTX
    FRAME_CORE --> FRAME_CONN
    
    STRATEGY_CONN --> STRATEGY_SCHEMA
    STRATEGY_CONN --> RISK_CONN
    STRATEGY_CONN --> PARTIAL_CONN
    EXCHANGE_CONN --> EXCHANGE_SCHEMA
    FRAME_CONN --> FRAME_SCHEMA
    SIZING_CONN --> SIZING_SCHEMA
    RISK_CONN --> RISK_SCHEMA
    OPTIMIZER_CONN --> OPTIMIZER_SCHEMA
    
    STRATEGY_VAL --> STRATEGY_SCHEMA
    EXCHANGE_VAL --> EXCHANGE_SCHEMA
    FRAME_VAL --> FRAME_SCHEMA
    SIZING_VAL --> SIZING_SCHEMA
    RISK_VAL --> RISK_SCHEMA
    OPTIMIZER_VAL --> OPTIMIZER_SCHEMA
    WALKER_VAL --> WALKER_SCHEMA
    
    SIZING_GLOBAL --> SIZING_CONN
    RISK_GLOBAL --> RISK_CONN
    OPTIMIZER_GLOBAL --> OPTIMIZER_CONN
    PARTIAL_GLOBAL --> PARTIAL_CONN
    
    BACKTEST_MD -.->|subscribes| EVENT
    LIVE_MD -.->|subscribes| EVENT
    WALKER_MD -.->|subscribes| EVENT
    PARTIAL_MD -.->|subscribes| EVENT
    RISK_MD -.->|subscribes| EVENT
    
    LOGGER -.->|used by| STRATEGY_CORE
    LOGGER -.->|used by| EXCHANGE_CORE
    LOGGER -.->|used by| LIVE_PRIV
    LOGGER -.->|used by| BACKTEST_PRIV
```

### Dependency Resolution Order

1. **Base Services** - No dependencies, instantiated first
2. **Context Services** - No dependencies, instantiated early
3. **Schema Services** - No dependencies, instantiated to store configurations
4. **Validation Services** - Depend on Schema Services for existence checks
5. **Connection Services** - Depend on Schema Services for client instantiation
6. **Core Services** - Depend on Connection Services and Context Services
7. **Global Services** - Depend on Connection Services
8. **Logic Services** - Depend on Core Services and Context Services
9. **Command Services** - Depend on Logic Services
10. **Markdown Services** - Subscribe to event emitters (no direct dependencies)
11. **Template Services** - No dependencies

**Sources:** [src/lib/index.ts:1-242](), [src/lib/core/provide.ts:1-141]()

---

## Usage Patterns

### Accessing Services Internally

Services access other services by importing the `backtest` aggregation object:

```typescript
// Example from a Core Service
import backtest from "../index";

class StrategyCoreService {
  async tick(symbol: string, when: Date) {
    // Access connection service
    const strategy = backtest.strategyConnectionService.getStrategy(symbol, "my-strategy");
    
    // Access logger
    backtest.loggerService.log("StrategyCoreService.tick", { symbol, when });
    
    // ... implementation
  }
}
```

### Accessing Services Externally

External code (public API functions, user code) imports the `backtest` object from the main library export:

```typescript
// Example from function/add.ts
import backtest from "../lib/index";

export function addStrategy(strategySchema: IStrategySchema) {
  // Use validation service
  backtest.strategyValidationService.addStrategy(
    strategySchema.strategyName,
    strategySchema
  );
  
  // Use schema service
  backtest.strategySchemaService.register(
    strategySchema.strategyName,
    strategySchema
  );
}
```

### Service Initialization

The `init()` function must be called after all `provide()` registrations but before any service usage:

```typescript
// src/lib/index.ts:236
init();
```

This resolves any circular dependencies and ensures all services are properly instantiated in the container.

**Sources:** [src/lib/index.ts:221-242](), [src/function/add.ts:52-64]()

---

## Summary

The Dependency Injection system provides:

1. **Type-Safe Service Keys** - Symbol-based keys prevent collisions and enable type inference
2. **Lazy Instantiation** - Services are created only when first requested
3. **Centralized Access** - The `backtest` aggregation object serves as the single service locator
4. **Organized Structure** - 11 service categories with clear architectural boundaries
5. **Memoization** - Connection Services cache client instances by identifier
6. **Context Propagation** - Scoped services enable implicit parameter passing

This architecture enables loose coupling, testability, and modular service composition across the 51 registered services in the framework.

**Sources:** [src/lib/core/types.ts](), [src/lib/core/provide.ts](), [src/lib/index.ts]()
# Architecture


## Purpose and Scope

This document provides a comprehensive overview of backtest-kit's layered architecture, including the service layer organization, dependency injection system, context propagation patterns, and event-driven infrastructure. For details on individual component types (strategies, exchanges, frames), see [Component Types](./23_Component_Types.md). For execution flow specifics, see [Backtesting](./50_Backtesting.md), [Live Trading](./54_Live_Trading.md), and [Walker Mode](./59_Walker_Mode.md).

## Architectural Overview

The framework follows clean architecture principles with six distinct layers, separated by dependency injection boundaries. Each layer has a specific responsibility, with dependencies flowing inward toward business logic.

![Mermaid Diagram](./diagrams/09_Architecture_0.svg)

**Sources:** [src/lib/index.ts:1-170](), [src/lib/core/types.ts:1-81](), [src/lib/core/provide.ts:1-111]()

## Layer Responsibilities

### Layer 1: Public API

The public API layer consists of exported functions and classes that users interact with directly. These provide a clean, stable interface while delegating implementation to lower layers.

| Function Category | Exports | Purpose |
|------------------|---------|---------|
| Registration | `addStrategy`, `addExchange`, `addFrame`, `addRisk`, `addSizing`, `addWalker` | Register component schemas |
| Configuration | `setLogger`, `setConfig` | Configure global settings |
| Introspection | `listStrategies`, `listExchanges`, etc. | Query registered components |
| Execution | `Backtest`, `Live`, `Walker`, `Schedule`, `Performance` | Run backtests and live trading |
| Event Listeners | `listenSignal`, `listenError`, `listenDone`, etc. | Subscribe to system events |
| Utilities | `getCandles`, `getAveragePrice`, `formatPrice`, `formatQuantity` | Exchange helpers |

**Sources:** [src/index.ts:1-131](), [src/function/add.ts:1-342](), [src/function/list.ts:1-218]()

### Layer 2: Global Services

Global Services act as context-aware entry points that wrap lower layers with `MethodContextService` and `ExecutionContextService` scope management. They coordinate validation and delegate to Logic Services.

![Mermaid Diagram](./diagrams/09_Architecture_1.svg)

**Key Global Services:**

- `StrategyGlobalService` - Strategy execution with validation
- `ExchangeGlobalService` - Exchange data access with context injection
- `LiveGlobalService` - Live trading orchestration
- `BacktestGlobalService` - Backtest orchestration
- `WalkerGlobalService` - Multi-strategy comparison
- `RiskGlobalService` - Risk management coordination

**Sources:** [src/lib/services/global/StrategyGlobalService.ts](), [src/lib/services/global/ExchangeGlobalService.ts](), [src/lib/index.ts:93-108]()

### Layer 3: Logic Services

Logic Services implement core orchestration logic using async generators for backtest/live execution. They are split into Public (context management) and Private (core logic) services to separate concerns.

**Logic Service Pattern:**

![Mermaid Diagram](./diagrams/09_Architecture_2.svg)

**Public vs Private Split:**

- **Public Services** (`BacktestLogicPublicService`, `LiveLogicPublicService`) - Wrap generators with `MethodContextService.runAsyncIterator()` to propagate `strategyName`, `exchangeName`, `frameName`
- **Private Services** (`BacktestLogicPrivateService`, `LiveLogicPrivateService`) - Implement async generator logic with `ExecutionContextService.runInContext()` calls

**Sources:** [src/lib/services/logic/public/BacktestLogicPublicService.ts](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts](), [src/lib/index.ts:110-132]()

### Layer 4: Connection Services

Connection Services provide memoized client instance management. They resolve schema configurations, inject dependencies, and return cached client instances to avoid repeated instantiation.

![Mermaid Diagram](./diagrams/09_Architecture_3.svg)

**Key Connection Services:**

| Service | Creates | Memoization Key |
|---------|---------|----------------|
| `StrategyConnectionService` | `ClientStrategy` | `strategyName` |
| `ExchangeConnectionService` | `ClientExchange` | `exchangeName` |
| `FrameConnectionService` | `ClientFrame` | `frameName` |
| `RiskConnectionService` | `ClientRisk` | `riskName` |
| `SizingConnectionService` | `ClientSizing` | `sizingName` |

**Memoization Pattern:** Connection Services use `functools-kit`'s `singlerun` to cache instances: `this.getClient = singlerun((name) => new ClientStrategy(params))`

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts](), [src/lib/services/connection/ExchangeConnectionService.ts](), [src/lib/index.ts:62-78]()

### Layer 5: Schema & Validation Services

Schema Services use the `ToolRegistry` pattern to store and retrieve component configurations. Validation Services perform runtime checks using memoization to cache validation results.

**Schema Service Pattern:**

```typescript
// StrategySchemaService
private readonly _registry = new ToolRegistry<StrategyName, IStrategySchema>();

register(name: StrategyName, schema: IStrategySchema): void {
  this._registry.add(name, schema);
}

get(name: StrategyName): IStrategySchema {
  return this._registry.get(name);
}
```

**Validation Service Pattern:**

```typescript
// StrategyValidationService
private readonly _validate = singleshot(async (name: StrategyName) => {
  if (!this.schemaService.has(name)) {
    throw new Error(`Strategy ${name} not registered`);
  }
  // Additional validation logic
});

async validate(name: StrategyName): Promise<void> {
  await this._validate(name);
}
```

**Sources:** [src/lib/services/schema/StrategySchemaService.ts](), [src/lib/services/validation/StrategyValidationService.ts](), [src/lib/index.ts:80-91](), [src/lib/index.ts:143-150]()

### Layer 6: Client Classes

Client Classes contain pure business logic without dependency injection. They receive dependencies through constructor parameters and implement prototype methods for memory efficiency.

**Key Client Classes:**

| Client | Purpose | Key Methods |
|--------|---------|-------------|
| `ClientStrategy` | Signal lifecycle management | `tick()`, `backtest()`, `stop()` |
| `ClientExchange` | Market data & VWAP calculation | `getCandles()`, `getAveragePrice()` |
| `ClientFrame` | Timeframe generation | `getTimeframe()` |
| `ClientRisk` | Portfolio risk tracking | `checkSignal()`, `addSignal()`, `removeSignal()` |
| `ClientSizing` | Position size calculation | `calculate()` |

**Memory Efficiency Pattern:** All methods are defined on the prototype, not as arrow functions:

```typescript
class ClientStrategy {
  // Prototype method (shared across instances)
  async tick(symbol: string): Promise<IStrategyTickResult> {
    // Implementation
  }
}
```

**Sources:** [src/lib/classes/ClientStrategy.ts](), [src/lib/classes/ClientExchange.ts](), [src/lib/classes/ClientRisk.ts]()

## Dependency Injection System

The framework uses a custom DI container with Symbol-based tokens for type-safe service resolution.

![Mermaid Diagram](./diagrams/09_Architecture_4.svg)

### Symbol-Based Tokens

All service dependencies use unique Symbol tokens to avoid naming collisions and enable type-safe resolution:

```typescript
// src/lib/core/types.ts
const TYPES = {
  loggerService: Symbol('loggerService'),
  strategyGlobalService: Symbol('strategyGlobalService'),
  exchangeConnectionService: Symbol('exchangeConnectionService'),
  // ... 30+ more tokens
};
```

### Service Binding

Services are bound to tokens using factory functions in `provide.ts`:

```typescript
// src/lib/core/provide.ts
provide(TYPES.strategyGlobalService, () => new StrategyGlobalService());
provide(TYPES.exchangeConnectionService, () => new ExchangeConnectionService());
provide(TYPES.loggerService, () => new LoggerService());
```

### Service Resolution

Services resolve dependencies by injecting tokens:

```typescript
// src/lib/index.ts
const backtest = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
  strategyGlobalService: inject<StrategyGlobalService>(TYPES.strategyGlobalService),
  exchangeConnectionService: inject<ExchangeConnectionService>(TYPES.exchangeConnectionService),
  // ... all services
};
```

### Dependency Graph

The following diagram maps the actual dependency relationships between services:

![Mermaid Diagram](./diagrams/09_Architecture_5.svg)

**Sources:** [src/lib/core/types.ts:1-81](), [src/lib/core/provide.ts:1-111](), [src/lib/index.ts:49-162](), [src/lib/core/di.ts]()

## Context Propagation

Context propagation uses `di-scoped` to implicitly pass execution parameters through nested async operations without explicit parameter drilling.

### Context Types

Two context types flow through the system:

**IMethodContext** - Component selection:
```typescript
interface IMethodContext {
  exchangeName: ExchangeName;
  strategyName: StrategyName;
  frameName: FrameName;
}
```

**IExecutionContext** - Runtime parameters:
```typescript
interface IExecutionContext {
  symbol: string;
  when: Date;
  backtest: boolean;
}
```

### Context Flow Architecture

![Mermaid Diagram](./diagrams/09_Architecture_6.svg)

### MethodContextService Pattern

`MethodContextService` wraps async generators to propagate `strategyName`, `exchangeName`, `frameName`:

```typescript
// BacktestLogicPublicService
async *run(symbol: string, context: IBacktestContext) {
  yield* MethodContextService.runAsyncIterator(
    this.logicPrivateService.run(symbol),
    {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName
    }
  );
}
```

### ExecutionContextService Pattern

`ExecutionContextService` wraps individual operations with runtime parameters:

```typescript
// BacktestLogicPrivateService
for (const when of timeframe) {
  const result = await ExecutionContextService.runInContext(
    async () => await this.strategyGlobalService.tick(symbol),
    { symbol, when, backtest: true }
  );
  yield result;
}
```

### Context Resolution

Services access context via dependency injection:

```typescript
class ExchangeConnectionService {
  private readonly methodContextService: TMethodContextService;
  
  async getClient(symbol: string): Promise<ClientExchange> {
    // Implicitly access context
    const exchangeName = this.methodContextService.context.exchangeName;
    return this.getCachedClient(exchangeName);
  }
}
```

**Benefits:**
- No parameter drilling through 6+ layers
- Type-safe context access via DI
- Automatic propagation through async boundaries
- Isolated execution contexts prevent cross-contamination

**Sources:** [types.d.ts:100-143](), [types.d.ts:362-403](), [src/lib/services/context/ExecutionContextService.ts](), [src/lib/services/context/MethodContextService.ts]()

## Event System

The framework uses `functools-kit`'s `Subject` for pub-sub event handling with queued processing to ensure sequential execution.

### Event Emitters

All events are emitted through global Subject instances:

![Mermaid Diagram](./diagrams/09_Architecture_7.svg)

### Event Types

| Emitter | Type | Usage |
|---------|------|-------|
| `signalEmitter` | `IStrategyTickResult` | All tick results (idle/opened/active/closed) |
| `signalBacktestEmitter` | `IStrategyTickResult` | Backtest signals only |
| `signalLiveEmitter` | `IStrategyTickResult` | Live signals only |
| `errorEmitter` | `Error` | Background execution errors |
| `doneEmitter` | `DoneContract` | Execution completion events |
| `progressEmitter` | `ProgressContract` | Walker/backtest progress |
| `performanceEmitter` | `PerformanceContract` | Timing metrics |
| `walkerEmitter` | `IWalkerStrategyResult` | Walker strategy results |
| `validationEmitter` | `Error` | Risk validation errors |

### Queued Processing

All event listeners use `functools-kit`'s `queued()` wrapper to ensure sequential processing:

```typescript
export const listenSignal = (fn: (data: IStrategyTickResult) => void | Promise<void>) => {
  return signalEmitter.subscribe(queued(fn));
};
```

**Why Queued Processing?**
- Prevents race conditions in async event handlers
- Guarantees FIFO ordering even with slow handlers
- Avoids event handler interleaving

### Event Emission Flow

![Mermaid Diagram](./diagrams/09_Architecture_8.svg)

### Emission Points

Events are emitted from Logic Services after yielding results:

```typescript
// BacktestLogicPrivateService
async *run(symbol: string) {
  for (const when of timeframe) {
    const result = await this.strategyGlobalService.tick(symbol);
    
    // Emit to event system
    signalEmitter.next(result);
    signalBacktestEmitter.next(result);
    
    yield result;
  }
  
  // Emit completion
  doneEmitter.next({
    backtest: true,
    symbol,
    strategyName: context.strategyName,
    exchangeName: context.exchangeName
  });
}
```

**Sources:** [src/config/emitters.ts](), [src/function/event.ts](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts]()

## Service Organization Summary

The following table maps service categories to their file locations:

| Category | Pattern | Location | Count |
|----------|---------|----------|-------|
| Base Services | `LoggerService` | `src/lib/services/base/` | 1 |
| Context Services | `ExecutionContextService`, `MethodContextService` | `src/lib/services/context/` | 2 |
| Connection Services | `*ConnectionService` | `src/lib/services/connection/` | 5 |
| Schema Services | `*SchemaService` | `src/lib/services/schema/` | 6 |
| Validation Services | `*ValidationService` | `src/lib/services/validation/` | 6 |
| Global Services | `*GlobalService` | `src/lib/services/global/` | 8 |
| Logic Services | `*LogicPublicService`, `*LogicPrivateService` | `src/lib/services/logic/` | 6 |
| Markdown Services | `*MarkdownService` | `src/lib/services/markdown/` | 6 |

**Total Services:** 40+ injectable services

**Sources:** [src/lib/index.ts:49-162](), [src/lib/core/types.ts:1-81](), [src/lib/core/provide.ts:1-111]()
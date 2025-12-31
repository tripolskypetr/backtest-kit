# Context Propagation

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/add.ts](src/function/add.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/index.ts](src/index.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [types.d.ts](types.d.ts)

</details>



## Purpose and Scope

This document explains the context propagation system in backtest-kit, which uses `ExecutionContextService` and `MethodContextService` to pass runtime parameters and schema identifiers implicitly through the call stack without manual parameter threading. This pattern enables temporal isolation for look-ahead bias prevention and proper instance isolation across different execution contexts.

For information about how these context services integrate with the dependency injection system, see [Dependency Injection System](#3.2). For details on how temporal isolation prevents look-ahead bias, see [Temporal Isolation and Look-Ahead Prevention](#2.4).

---

## The Problem: Parameter Threading

Without context propagation, every function in the execution path would need explicit parameters for runtime context (symbol, timestamp, backtest flag) and schema identifiers (strategyName, exchangeName, frameName). This creates maintenance burden and tight coupling.

```mermaid
graph TB
    subgraph "Without Context Propagation - Manual Parameter Threading"
        API["Public API<br/>Backtest.run()"]
        LOGIC["BacktestLogicPrivateService<br/>execute()"]
        CONN["StrategyConnectionService<br/>getStrategy()"]
        CLIENT["ClientStrategy<br/>tick()"]
        CORE["StrategyCoreService<br/>getCandles()"]
        SCHEMA["ExchangeSchemaService<br/>get()"]
        
        API -->|"symbol, strategyName,<br/>exchangeName, frameName,<br/>when, backtest"| LOGIC
        LOGIC -->|"symbol, strategyName,<br/>exchangeName, when,<br/>backtest"| CONN
        CONN -->|"symbol, when,<br/>backtest"| CLIENT
        CLIENT -->|"symbol, when,<br/>backtest, exchangeName"| CORE
        CORE -->|"exchangeName"| SCHEMA
    end
    
    NOTE1["Problem: Every function<br/>needs 5+ parameters<br/>Tight coupling<br/>Hard to maintain"]
    
    CLIENT -.-> NOTE1
```

**Sources**: [types.d.ts:5-49](), [types.d.ts:296-336]()

---

## Context Services Overview

The system uses two scoped context services to eliminate parameter threading:

| Context Service | Scope | Contains | Used By | Purpose |
|----------------|-------|----------|---------|---------|
| `ExecutionContextService` | Runtime execution | `symbol`, `when`, `backtest` | Core services, Client implementations | Temporal isolation, preventing access to future data |
| `MethodContextService` | Schema routing | `strategyName`, `exchangeName`, `frameName` | Connection services, Global services | Instance selection, memoization keys |

```mermaid
graph TB
    subgraph "Context Propagation - Implicit Parameter Passing"
        API["Public API<br/>Backtest.run()"]
        EXEC_CTX["ExecutionContextService<br/>{symbol, when, backtest}"]
        METHOD_CTX["MethodContextService<br/>{strategyName, exchangeName, frameName}"]
        LOGIC["BacktestLogicPrivateService"]
        CONN["StrategyConnectionService"]
        CLIENT["ClientStrategy"]
        CORE["StrategyCoreService"]
        EXCHANGE["ClientExchange"]
        
        API -->|"runInContext()<br/>runAsyncIterator()"| EXEC_CTX
        API -->|"runInContext()<br/>runAsyncIterator()"| METHOD_CTX
        
        EXEC_CTX -.->|"implicit access<br/>via .context"| LOGIC
        METHOD_CTX -.->|"implicit access<br/>via .context"| CONN
        
        LOGIC --> CONN
        CONN --> CLIENT
        CLIENT --> CORE
        CORE --> EXCHANGE
        
        EXCHANGE -.->|"reads .context.symbol<br/>.context.when<br/>.context.backtest"| EXEC_CTX
    end
    
    NOTE1["Benefit: No parameter threading<br/>Loose coupling<br/>Easy to maintain"]
    
    EXCHANGE -.-> NOTE1
```

**Sources**: [types.d.ts:5-49](), [types.d.ts:296-336](), [src/lib/index.ts:66-72]()

---

## ExecutionContextService

`ExecutionContextService` provides runtime execution parameters that change for every tick/candle during strategy execution. It uses `di-scoped` library's `IScopedClassRun` interface to wrap execution in AsyncLocalStorage context.

### Context Structure

```typescript
interface IExecutionContext {
  symbol: string;      // Trading pair (e.g., "BTCUSDT")
  when: Date;          // Current timestamp for operation
  backtest: boolean;   // true = backtest mode, false = live mode
}
```

### Key Properties

| Property | Type | Purpose | Example |
|----------|------|---------|---------|
| `symbol` | `string` | Trading pair identifier | `"BTCUSDT"`, `"ETHUSDT"` |
| `when` | `Date` | Current execution timestamp | `new Date("2024-01-15T10:30:00Z")` |
| `backtest` | `boolean` | Execution mode flag | `true` (backtest), `false` (live) |

### Temporal Isolation

The `when` property is **critical** for preventing look-ahead bias during backtesting. When `ClientExchange.getCandles()` is called, it uses `when` to fetch only historical data up to that timestamp, never future data.

```mermaid
graph LR
    subgraph "Backtest Execution at 2024-01-15 10:00"
        WHEN["ExecutionContextService.context.when<br/>= 2024-01-15 10:00"]
        EXCHANGE["ClientExchange.getCandles()"]
        VALID["Returns candles:<br/>2024-01-15 09:00<br/>2024-01-15 09:30<br/>2024-01-15 10:00"]
        INVALID["NEVER returns:<br/>2024-01-15 10:30<br/>2024-01-15 11:00<br/>(future data)"]
        
        WHEN --> EXCHANGE
        EXCHANGE --> VALID
        EXCHANGE -.X.-> INVALID
    end
    
    NOTE1["Temporal Isolation:<br/>Strategies can only see<br/>data from the past<br/>relative to 'when' timestamp"]
    
    VALID -.-> NOTE1
```

**Sources**: [types.d.ts:5-49](), [types.d.ts:159-205]()

---

## MethodContextService

`MethodContextService` provides schema identifiers that determine which registered component instances to use. It enables proper memoization and instance isolation across different strategies, exchanges, and frames.

### Context Structure

```typescript
interface IMethodContext {
  exchangeName: ExchangeName;  // Exchange schema identifier
  strategyName: StrategyName;  // Strategy schema identifier
  frameName: FrameName;        // Frame schema identifier (empty for live)
}
```

### Instance Isolation

Connection services use `MethodContextService.context` to build composite memoization keys, ensuring separate instances for different execution contexts.

```mermaid
graph TB
    subgraph "StrategyConnectionService Memoization"
        METHOD_CTX["MethodContextService.context<br/>{strategyName, exchangeName, frameName}"]
        GET_STRATEGY["getStrategy(symbol)"]
        KEY["Composite Key:<br/>'BTCUSDT:my-strategy:backtest'"]
        MEMO["memoize() cache"]
        INSTANCE1["ClientStrategy instance 1<br/>for BTCUSDT + my-strategy + backtest"]
        INSTANCE2["ClientStrategy instance 2<br/>for ETHUSDT + my-strategy + backtest"]
        INSTANCE3["ClientStrategy instance 3<br/>for BTCUSDT + my-strategy + live"]
        
        METHOD_CTX --> GET_STRATEGY
        GET_STRATEGY --> KEY
        KEY --> MEMO
        MEMO --> INSTANCE1
        MEMO --> INSTANCE2
        MEMO --> INSTANCE3
    end
    
    NOTE1["Each combination of<br/>(symbol, strategyName, exchangeName, backtest)<br/>gets its own isolated instance"]
    
    MEMO -.-> NOTE1
```

**Sources**: [types.d.ts:296-336]()

---

## Implementation Using di-scoped

Both context services extend the `IScopedClassRun` interface from the `di-scoped` library, which provides AsyncLocalStorage-based context propagation.

### Service Declaration Pattern

The context services are declared with a complex type signature that combines:
1. Constructor signature
2. Omitted prototype
3. `IScopedClassRun` interface with context parameter

```typescript
declare const ExecutionContextService: 
  (new () => { readonly context: IExecutionContext }) 
  & Omit<{
      new (context: IExecutionContext): {
        readonly context: IExecutionContext;
      };
    }, "prototype"> 
  & di_scoped.IScopedClassRun<[context: IExecutionContext]>;
```

### Execution Methods

The `IScopedClassRun` interface provides two key methods for wrapping execution:

| Method | Purpose | Use Case | Returns |
|--------|---------|----------|---------|
| `runInContext()` | Wrap async function execution | Single operations, API calls | `Promise<T>` |
| `runAsyncIterator()` | Wrap async generator execution | Backtest iteration, streaming | `AsyncIterator<T>` |

**Sources**: [types.d.ts:38-44](), [types.d.ts:330-336](), [src/lib/core/provide.ts:61-63]()

---

## Usage Patterns

### Pattern 1: Backtest Execution Context

Backtest execution wraps the entire backtest iteration in both `ExecutionContextService` and `MethodContextService` contexts. The `when` parameter advances through timeframes, and `backtest` is always `true`.

```mermaid
sequenceDiagram
    participant API as Backtest.run()
    participant LOGIC as BacktestLogicPrivateService
    participant EXEC_CTX as ExecutionContextService
    participant METHOD_CTX as MethodContextService
    participant STRATEGY as ClientStrategy
    participant EXCHANGE as ClientExchange
    
    API->>LOGIC: run(symbol, {strategyName, exchangeName, frameName})
    LOGIC->>METHOD_CTX: runAsyncIterator(generator, {strategyName, exchangeName, frameName})
    METHOD_CTX->>EXEC_CTX: runAsyncIterator(generator, {symbol, when, backtest: true})
    
    loop For each timeframe timestamp
        EXEC_CTX->>STRATEGY: tick(symbol, when)
        STRATEGY->>EXEC_CTX: Read .context.symbol, .context.when
        STRATEGY->>EXCHANGE: getCandles(symbol, interval, limit)
        EXCHANGE->>EXEC_CTX: Read .context.when for temporal filtering
        EXCHANGE-->>STRATEGY: Historical candles up to 'when'
        STRATEGY-->>EXEC_CTX: Return tick result
        Note over EXEC_CTX: Advance 'when' to next timeframe
    end
    
    EXEC_CTX-->>METHOD_CTX: Complete iteration
    METHOD_CTX-->>LOGIC: Backtest results
    LOGIC-->>API: Statistics
```

**Sources**: [types.d.ts:27-36](), [types.d.ts:319-328]()

---

### Pattern 2: Live Execution Context

Live execution wraps each tick in execution context with `when` set to `Date.now()` and `backtest` set to `false`. The method context remains constant throughout the live session.

```mermaid
sequenceDiagram
    participant API as Live.background()
    participant LOGIC as LiveLogicPrivateService
    participant EXEC_CTX as ExecutionContextService
    participant METHOD_CTX as MethodContextService
    participant STRATEGY as ClientStrategy
    participant EXCHANGE as ClientExchange
    
    API->>LOGIC: background(symbol, {strategyName, exchangeName})
    LOGIC->>METHOD_CTX: runInContext(fn, {strategyName, exchangeName, frameName: ""})
    
    loop Infinite loop (every 1 minute)
        Note over LOGIC: when = new Date() (current time)
        LOGIC->>EXEC_CTX: runInContext(fn, {symbol, when, backtest: false})
        EXEC_CTX->>STRATEGY: tick(symbol, when)
        STRATEGY->>EXEC_CTX: Read .context.symbol, .context.when, .context.backtest
        STRATEGY->>EXCHANGE: getAveragePrice(symbol)
        EXCHANGE->>EXEC_CTX: Read .context.when
        EXCHANGE-->>STRATEGY: Current VWAP price
        STRATEGY-->>EXEC_CTX: Return tick result
        EXEC_CTX-->>LOGIC: Tick result
        Note over LOGIC: Sleep 60 seconds
    end
```

**Sources**: [types.d.ts:27-36](), [types.d.ts:319-328]()

---

### Pattern 3: Connection Service Instance Selection

Connection services use `MethodContextService.context` to retrieve the correct schema and build composite memoization keys for client instances.

```mermaid
graph TB
    subgraph "StrategyConnectionService.getStrategy()"
        START["getStrategy(symbol)"]
        READ_METHOD["Read MethodContextService.context<br/>{strategyName, exchangeName, frameName}"]
        READ_EXEC["Read ExecutionContextService.context<br/>{backtest}"]
        GET_SCHEMA["strategySchemaService.get(strategyName)"]
        BUILD_KEY["Build memoization key:<br/>'symbol:strategyName:backtest'"]
        MEMOIZE["memoize() - check cache"]
        HIT["Cache hit:<br/>return existing instance"]
        MISS["Cache miss:<br/>create new ClientStrategy"]
        INJECT_EXEC["Inject ExecutionContextService<br/>into ClientStrategy"]
        
        START --> READ_METHOD
        READ_METHOD --> READ_EXEC
        READ_EXEC --> GET_SCHEMA
        GET_SCHEMA --> BUILD_KEY
        BUILD_KEY --> MEMOIZE
        MEMOIZE -->|"found"| HIT
        MEMOIZE -->|"not found"| MISS
        MISS --> INJECT_EXEC
        INJECT_EXEC --> HIT
    end
    
    NOTE1["Context services enable:<br/>1. Automatic schema routing<br/>2. Proper instance isolation<br/>3. Dependency injection"]
    
    INJECT_EXEC -.-> NOTE1
```

**Sources**: [types.d.ts:296-336]()

---

## Context Flow Through System Layers

The following diagram shows how execution and method contexts flow through the service layer architecture, from public API down to client implementations.

```mermaid
graph TB
    subgraph "Public API Layer"
        API["Backtest.run()<br/>Live.background()"]
    end
    
    subgraph "Command Services"
        CMD["BacktestCommandService<br/>LiveCommandService"]
    end
    
    subgraph "Logic Services"
        LOGIC["BacktestLogicPrivateService<br/>LiveLogicPrivateService"]
    end
    
    subgraph "Context Services - Implicit Propagation"
        EXEC_CTX["ExecutionContextService<br/>{symbol, when, backtest}"]
        METHOD_CTX["MethodContextService<br/>{strategyName, exchangeName, frameName}"]
    end
    
    subgraph "Connection Services"
        CONN["StrategyConnectionService<br/>ExchangeConnectionService"]
    end
    
    subgraph "Client Implementations"
        CLIENT["ClientStrategy<br/>ClientExchange<br/>ClientRisk"]
    end
    
    subgraph "Schema Services"
        SCHEMA["StrategySchemaService<br/>ExchangeSchemaService"]
    end
    
    API -->|"symbol, strategyName,<br/>exchangeName, frameName"| CMD
    CMD -->|"wrap in<br/>runInContext()<br/>runAsyncIterator()"| METHOD_CTX
    CMD -->|"wrap in<br/>runInContext()<br/>runAsyncIterator()"| EXEC_CTX
    
    METHOD_CTX -.->|"implicit access"| LOGIC
    EXEC_CTX -.->|"implicit access"| LOGIC
    
    LOGIC --> CONN
    
    CONN -.->|"read .context<br/>for schema routing"| METHOD_CTX
    CONN --> SCHEMA
    CONN --> CLIENT
    
    CLIENT -.->|"read .context<br/>for runtime params"| EXEC_CTX
    
    NOTE1["No explicit parameter passing<br/>after initial context setup"]
    
    CLIENT -.-> NOTE1
```

**Sources**: [src/lib/index.ts:1-246](), [src/lib/core/types.ts:1-105]()

---

## Benefits and Trade-offs

### Benefits

| Benefit | Description | Impact |
|---------|-------------|--------|
| **No Parameter Threading** | Eliminates need to pass context parameters through every function | Reduces boilerplate by ~80% |
| **Loose Coupling** | Functions don't need to know about context structure | Easier to refactor and extend |
| **Temporal Isolation** | `ExecutionContextService.context.when` prevents look-ahead bias | Ensures realistic backtest results |
| **Instance Isolation** | `MethodContextService.context` enables proper memoization | Prevents state leakage between executions |
| **Type Safety** | TypeScript discriminated unions for context access | Compile-time error detection |

### Implementation Details

```mermaid
graph TB
    subgraph "AsyncLocalStorage Under the Hood"
        ASYNC_LOCAL["Node.js AsyncLocalStorage"]
        DI_SCOPED["di-scoped library<br/>IScopedClassRun interface"]
        EXEC_SERVICE["ExecutionContextService"]
        METHOD_SERVICE["MethodContextService"]
        
        ASYNC_LOCAL --> DI_SCOPED
        DI_SCOPED --> EXEC_SERVICE
        DI_SCOPED --> METHOD_SERVICE
    end
    
    subgraph "Context Access Pattern"
        CLIENT["ClientExchange.getCandles()"]
        INJECT["Injected ExecutionContextService<br/>in constructor"]
        READ["this.execution.context.when<br/>this.execution.context.symbol"]
        FILTER["Filter candles <= when timestamp"]
        
        CLIENT --> INJECT
        INJECT --> READ
        READ --> FILTER
    end
    
    NOTE1["AsyncLocalStorage provides<br/>isolated storage per async context<br/>No global state pollution"]
    
    ASYNC_LOCAL -.-> NOTE1
```

**Sources**: [types.d.ts:38-44](), [types.d.ts:330-336](), [types.d.ts:105-110]()

---

## Dependency Injection Integration

Context services are registered in the DI container and injected into client implementations via constructor parameters.

### DI Registration

The context services are provided as singletons in the DI container at application startup.

```typescript
// src/lib/core/types.ts
const contextServices = {
  executionContextService: Symbol('executionContextService'),
  methodContextService: Symbol('methodContextService'),
};

// src/lib/core/provide.ts
{
  provide(TYPES.executionContextService, () => new ExecutionContextService());
  provide(TYPES.methodContextService, () => new MethodContextService());
}
```

### Client Injection

Client implementations receive context services through their constructor parameters, defined in their `*Params` interfaces.

```typescript
// types.d.ts - IExchangeParams extends IExchangeSchema
interface IExchangeParams extends IExchangeSchema {
  logger: ILogger;
  execution: TExecutionContextService;  // Injected context service
}
```

```mermaid
graph LR
    subgraph "DI Container"
        PROVIDE["provide(TYPES.executionContextService)"]
        INJECT["inject<TExecutionContextService>()"]
    end
    
    subgraph "Connection Service"
        CONN["ExchangeConnectionService.getExchange()"]
        CREATE["new ClientExchange({<br/>...schema,<br/>execution: executionContextService<br/>})"]
    end
    
    subgraph "Client Implementation"
        CLIENT["ClientExchange"]
        USE["this.execution.context.when<br/>this.execution.context.symbol"]
    end
    
    PROVIDE --> INJECT
    INJECT --> CONN
    CONN --> CREATE
    CREATE --> CLIENT
    CLIENT --> USE
    
    NOTE1["Context service injected<br/>once at construction<br/>Used throughout lifetime"]
    
    USE -.-> NOTE1
```

**Sources**: [src/lib/core/types.ts:5-8](), [src/lib/core/provide.ts:61-63](), [types.d.ts:105-110](), [src/index.ts:162-163]()

---

## Summary

Context propagation in backtest-kit eliminates parameter threading by using two scoped services:

1. **ExecutionContextService** - Provides runtime parameters (`symbol`, `when`, `backtest`) for temporal isolation and look-ahead bias prevention
2. **MethodContextService** - Provides schema identifiers (`strategyName`, `exchangeName`, `frameName`) for instance selection and memoization

Both services use `di-scoped` library's AsyncLocalStorage-based context propagation to make context implicitly available throughout the call stack without explicit parameter passing. This pattern reduces boilerplate, improves maintainability, and ensures proper isolation between different execution contexts.

**Sources**: [types.d.ts:5-49](), [types.d.ts:296-336](), [src/lib/index.ts:66-72](), [src/lib/core/provide.ts:61-63]()
# Core Business Logic

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [assets/uml.svg](assets/uml.svg)
- [docs/internals.md](docs/internals.md)
- [docs/uml.puml](docs/uml.puml)
- [scripts/_convert-md-mermaid-to-svg.cjs](scripts/_convert-md-mermaid-to-svg.cjs)
- [scripts/gpt-docs.mjs](scripts/gpt-docs.mjs)
- [scripts/uml.mjs](scripts/uml.mjs)
- [src/client/ClientStrategy.ts](src/client/ClientStrategy.ts)
- [src/interfaces/Strategy.interface.ts](src/interfaces/Strategy.interface.ts)
- [src/lib/services/connection/StrategyConnectionService.ts](src/lib/services/connection/StrategyConnectionService.ts)

</details>



## Purpose and Scope

This document describes the Client classes layer, which implements core business logic for signal management, market data, risk validation, and timeframe generation. Client classes are pure TypeScript classes without dependency injection, designed for memory efficiency and testability. They represent the innermost layer of the framework's architecture, containing algorithmic logic isolated from infrastructure concerns.

For information about the service layer that wraps these client classes, see [Service Layer](#7). For details on dependency injection and context propagation, see [Architecture](#3).

## Client Layer Architecture

Client classes form Layer 4 in the framework's six-layer architecture. They implement business rules and algorithms without any dependency on the DI container, making them independently testable and memory-efficient through prototype methods.

```mermaid
graph TB
    subgraph "Layer 3: Connection Services"
        StrategyConn["StrategyConnectionService<br/>Memoized instance management"]
        ExchangeConn["ExchangeConnectionService<br/>Memoized instance management"]
        RiskConn["RiskConnectionService<br/>Memoized instance management"]
        FrameConn["FrameConnectionService<br/>Memoized instance management"]
        SizingConn["SizingConnectionService<br/>Memoized instance management"]
    end
    
    subgraph "Layer 4: Client Classes (Pure Business Logic)"
        ClientStrategy["ClientStrategy<br/>Signal lifecycle state machine<br/>TP/SL monitoring<br/>Persistence coordination"]
        ClientExchange["ClientExchange<br/>Market data fetching<br/>VWAP calculation<br/>Price/quantity formatting"]
        ClientRisk["ClientRisk<br/>Portfolio position tracking<br/>Custom validation execution<br/>Concurrent position limits"]
        ClientFrame["ClientFrame<br/>Timeframe generation<br/>Interval-based timestamps"]
        ClientSizing["ClientSizing<br/>Position size calculation<br/>Fixed/Kelly/ATR methods"]
    end
    
    subgraph "Layer 5: Schema & Validation"
        StrategySchema["IStrategySchema"]
        ExchangeSchema["IExchangeSchema"]
        RiskSchema["IRiskSchema"]
        FrameSchema["IFrameSchema"]
        SizingSchema["ISizingSchema"]
    end
    
    StrategyConn -->|"new ClientStrategy(params)"| ClientStrategy
    ExchangeConn -->|"new ClientExchange(params)"| ClientExchange
    RiskConn -->|"new ClientRisk(params)"| ClientRisk
    FrameConn -->|"new ClientFrame(params)"| ClientFrame
    SizingConn -->|"new ClientSizing(params)"| ClientSizing
    
    StrategySchema -.->|"provides config"| StrategyConn
    ExchangeSchema -.->|"provides config"| ExchangeConn
    RiskSchema -.->|"provides config"| RiskConn
    FrameSchema -.->|"provides config"| FrameConn
    SizingSchema -.->|"provides config"| SizingConn
```

**Sources:** [src/client/ClientStrategy.ts:1-1300](), [src/lib/services/connection/StrategyConnectionService.ts:76-94](), [docs/internals.md:28-39]()

## Client Classes Overview

The framework provides five client classes, each responsible for a specific domain of business logic:

| Client Class | File Location | Primary Responsibility | Key Methods |
|-------------|---------------|----------------------|-------------|
| `ClientStrategy` | [src/client/ClientStrategy.ts]() | Signal lifecycle management, TP/SL monitoring, backtest fast-forward | `tick()`, `backtest()`, `waitForInit()`, `stop()` |
| `ClientExchange` | [src/client/ClientExchange.ts]() | Market data fetching, VWAP calculation, price/quantity formatting | `getCandles()`, `getAveragePrice()`, `formatPrice()`, `formatQuantity()` |
| `ClientRisk` | [src/client/ClientRisk.ts]() | Portfolio position tracking, custom risk validations, concurrent limits | `checkSignal()`, `addSignal()`, `removeSignal()` |
| `ClientFrame` | [src/client/ClientFrame.ts]() | Timeframe generation for backtesting, interval-based timestamp arrays | `getTimeframe()` |
| `ClientSizing` | [src/client/ClientSizing.ts]() | Position size calculation using fixed, Kelly, or ATR methods | `calculateSize()` |

**Sources:** [src/client/ClientStrategy.ts:1-1300](), [docs/internals.md:30-31]()

## Design Principles

### No Dependency Injection

Client classes receive all dependencies through constructor parameters, avoiding framework-level dependency injection:

```mermaid
graph LR
    Schema["Schema<br/>(IStrategySchema)"] -->|"extracted properties"| Params["Constructor Params<br/>(IStrategyParams)"]
    Services["Service References<br/>(logger, exchange, risk)"] -->|"injected references"| Params
    Contexts["Context Services<br/>(execution, method)"] -->|"runtime contexts"| Params
    
    Params -->|"plain object"| Constructor["new ClientStrategy(params)"]
    Constructor --> Instance["ClientStrategy Instance<br/>(no DI container access)"]
```

This design allows client classes to be instantiated and tested independently without the DI container. Constructor parameters are plain objects conforming to interfaces like `IStrategyParams`.

**Sources:** [src/interfaces/Strategy.interface.ts:74-89](), [src/lib/services/connection/StrategyConnectionService.ts:76-94]()

### Prototype Methods for Memory Efficiency

Client classes use prototype methods instead of arrow functions to avoid creating new function instances for each object:

```typescript
// Prototype method (efficient - shared across instances)
class ClientStrategy {
  public tick = async (): Promise<IStrategyTickResult> => {
    // Method implementation
  }
}

// Arrow function property (inefficient - new function per instance)
class ClientStrategy {
  public tick = async (): Promise<IStrategyTickResult> => {
    // Method implementation
  }
}
```

All Client classes follow the prototype method pattern, ensuring that multiple instances share the same method implementations in memory.

**Sources:** [docs/internals.md:94-95](), [src/client/ClientStrategy.ts:1-50]()

### Private Helper Functions

Client classes extensively use module-level private functions prefixed with uppercase names (e.g., `GET_SIGNAL_FN`, `VALIDATE_SIGNAL_FN`) instead of class methods. This pattern:

1. Keeps the class interface clean with only public methods
2. Prevents accidental access to internal implementation details
3. Allows helper functions to be unit tested independently
4. Reduces memory overhead by sharing functions across all instances

```mermaid
graph TB
    ClientStrategy["ClientStrategy Class<br/>(public interface)"]
    
    subgraph "Module-Level Private Functions"
        GET_SIGNAL_FN["GET_SIGNAL_FN<br/>Signal generation wrapper"]
        VALIDATE_SIGNAL_FN["VALIDATE_SIGNAL_FN<br/>Price and TP/SL validation"]
        CHECK_PENDING_FN["CHECK_PENDING_SIGNAL_COMPLETION_FN<br/>TP/SL/time monitoring"]
        CLOSE_PENDING_FN["CLOSE_PENDING_SIGNAL_FN<br/>Position closure"]
        PROCESS_CANDLES_FN["PROCESS_PENDING_SIGNAL_CANDLES_FN<br/>Backtest candle iteration"]
    end
    
    ClientStrategy -->|"calls"| GET_SIGNAL_FN
    ClientStrategy -->|"calls"| CHECK_PENDING_FN
    GET_SIGNAL_FN -->|"calls"| VALIDATE_SIGNAL_FN
    CHECK_PENDING_FN -->|"calls"| CLOSE_PENDING_FN
    ClientStrategy -->|"calls"| PROCESS_CANDLES_FN
```

**Example private function pattern:**

[src/client/ClientStrategy.ts:40-185]() defines `VALIDATE_SIGNAL_FN` as a module-level constant function that validates signal prices, TP/SL relationships, and time parameters. This function is called by `GET_SIGNAL_FN` at [src/client/ClientStrategy.ts:251]() and [src/client/ClientStrategy.ts:269]().

**Sources:** [src/client/ClientStrategy.ts:40-896]()

## Connection Service Instantiation

Connection Services act as factories that create and memoize Client class instances. The memoization pattern ensures one client instance per schema name:

```mermaid
sequenceDiagram
    participant User
    participant StrategyGlobalService
    participant StrategyConnectionService
    participant StrategySchemaService
    participant ClientStrategy
    participant Memoize as "memoize() cache"
    
    User->>StrategyGlobalService: tick()
    StrategyGlobalService->>StrategyConnectionService: tick()
    StrategyConnectionService->>StrategyConnectionService: getStrategy(strategyName)
    
    alt First call for strategyName
        StrategyConnectionService->>StrategySchemaService: get(strategyName)
        StrategySchemaService-->>StrategyConnectionService: IStrategySchema
        StrategyConnectionService->>ClientStrategy: new ClientStrategy(params)
        ClientStrategy-->>StrategyConnectionService: instance
        StrategyConnectionService->>Memoize: cache[strategyName] = instance
    else Subsequent calls
        StrategyConnectionService->>Memoize: retrieve cache[strategyName]
        Memoize-->>StrategyConnectionService: cached instance
    end
    
    StrategyConnectionService->>ClientStrategy: tick()
    ClientStrategy-->>StrategyConnectionService: IStrategyTickResult
    StrategyConnectionService-->>StrategyGlobalService: IStrategyTickResult
    StrategyGlobalService-->>User: IStrategyTickResult
```

The memoization key is the schema name string (e.g., `strategyName`, `exchangeName`), ensuring that multiple calls with the same name reuse the same client instance.

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:76-94](), [docs/internals.md:94]()

## Instance Lifecycle Management

Client instances persist for the duration of the application process and maintain internal state across multiple operations:

| Lifecycle Phase | Description | Relevant Methods |
|-----------------|-------------|------------------|
| **Instantiation** | Connection Service creates instance via `new ClientClass(params)` with schema configuration | Constructor |
| **Initialization** | One-time setup operations (e.g., loading persisted state) | `waitForInit()` for ClientStrategy |
| **Active Use** | Repeated method calls for core operations (tick, backtest, checkSignal) | `tick()`, `backtest()`, `checkSignal()`, etc. |
| **State Management** | Internal state tracked across calls (e.g., `_pendingSignal`, `_activePositions`) | Private instance variables |
| **Cleanup** | Graceful shutdown and resource release | `stop()` for ClientStrategy, `clear()` for Connection Services |

**Example state tracking in ClientStrategy:**

[src/client/ClientStrategy.ts:1247-1255]() shows the class constructor initializing state variables:
- `_pendingSignal`: Currently active signal being monitored
- `_scheduledSignal`: Signal waiting for price activation
- `_lastSignalTimestamp`: Interval throttling timestamp
- `_isStopped`: Graceful shutdown flag

**Sources:** [src/client/ClientStrategy.ts:1247-1300](), [src/lib/services/connection/StrategyConnectionService.ts:177-182]()

## Client Dependencies and Collaboration

Client classes collaborate through dependency references passed in constructor parameters, forming a dependency graph:

```mermaid
graph TB
    subgraph "ClientStrategy Dependencies"
        CS_Logger["logger: ILogger<br/>Logging service"]
        CS_Exchange["exchange: IExchange<br/>(ClientExchange instance)"]
        CS_Risk["risk: IRisk<br/>(ClientRisk instance)"]
        CS_Execution["execution: TExecutionContextService<br/>Symbol, timestamp, backtest flag"]
        CS_Method["method: TMethodContextService<br/>Strategy/exchange/frame names"]
    end
    
    subgraph "ClientExchange Dependencies"
        CE_Logger["logger: ILogger<br/>Logging service"]
        CE_Schema["getCandles: Function<br/>User-provided implementation"]
        CE_Format["formatPrice: Function<br/>formatQuantity: Function"]
        CE_Execution["execution: TExecutionContextService"]
        CE_Method["method: TMethodContextService"]
    end
    
    subgraph "ClientRisk Dependencies"
        CR_Logger["logger: ILogger<br/>Logging service"]
        CR_Validations["validations: Array<Function><br/>Custom validation rules"]
        CR_MaxPositions["maxConcurrentPositions: number<br/>Portfolio limit"]
    end
    
    ClientStrategy -->|"references"| CS_Logger
    ClientStrategy -->|"references"| CS_Exchange
    ClientStrategy -->|"references"| CS_Risk
    ClientStrategy -->|"references"| CS_Execution
    ClientStrategy -->|"references"| CS_Method
    
    ClientExchange -->|"references"| CE_Logger
    ClientExchange -->|"references"| CE_Schema
    ClientExchange -->|"references"| CE_Format
    ClientExchange -->|"references"| CE_Execution
    ClientExchange -->|"references"| CE_Method
    
    ClientRisk -->|"references"| CR_Logger
    ClientRisk -->|"references"| CR_Validations
    ClientRisk -->|"references"| CR_MaxPositions
```

**Key collaboration patterns:**

1. **ClientStrategy → ClientExchange**: Fetches VWAP prices via `getAveragePrice()` and historical candles via `getCandles()` at [src/client/ClientStrategy.ts:209-211]()

2. **ClientStrategy → ClientRisk**: Validates signals via `checkSignal()` at [src/client/ClientStrategy.ts:214-224](), adds positions via `addSignal()` at [src/client/ClientStrategy.ts:519-523](), removes positions via `removeSignal()` at [src/client/ClientStrategy.ts:761-764]()

3. **Context Services**: All clients access `execution.context.symbol`, `execution.context.when`, `execution.context.backtest`, and `method.context.strategyName` to determine runtime behavior

**Sources:** [src/interfaces/Strategy.interface.ts:74-89](), [src/client/ClientStrategy.ts:209-224](), [src/client/ClientStrategy.ts:519-523]()

## Summary

Client classes form the core algorithmic layer of the framework, implementing business logic without dependency injection for testability and memory efficiency. The five client classes (Strategy, Exchange, Risk, Frame, Sizing) are instantiated and memoized by Connection Services, maintaining state across operations while collaborating through interface references. This architectural separation enables the framework to keep business rules isolated from infrastructure concerns.

For detailed implementation documentation of individual client classes, see:
- [ClientStrategy](#6.1) - Signal lifecycle and monitoring
- [ClientExchange](#6.2) - Market data and formatting
- [ClientFrame](#6.3) - Timeframe generation
- [ClientRisk](#6.4) - Portfolio risk management
- [ClientSizing](#6.5) - Position sizing algorithms

**Sources:** [docs/internals.md:28-39](), [src/client/ClientStrategy.ts:1-1300](), [src/lib/services/connection/StrategyConnectionService.ts:1-186]()
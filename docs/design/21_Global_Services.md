# Global Services

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



## Purpose and Scope

Global Services form the context injection layer in the Service Orchestration tier of the architecture. They wrap Connection Services and Logic Services with execution context (symbol, timestamp, backtest mode) and provide routing logic based on the current method context. Global Services act as an adapter layer between the pure business logic in Client classes and the orchestration logic in Logic Services.

For information about the routing and memoization layer beneath Global Services, see [Connection Services](#5.1). For information about configuration registries, see [Schema Services](#5.2). For information about the orchestration layer above Global Services, see [Logic Services](#5.4).

## Architecture Position

Global Services occupy the middle tier of the Service Orchestration layer, sitting between Logic Services (which orchestrate execution) and Connection Services (which manage client instances). They serve two distinct roles depending on their domain:

**Domain Global Services** inject execution context into domain operations for Strategy, Exchange, and Frame:
- Retrieve the appropriate Connection Service instance
- Inject `ExecutionContextService` state into operations
- Route calls based on `MethodContextService` state

**Mode Global Services** provide high-level execution interfaces for Live and Backtest modes:
- Wrap Logic Public Services
- Expose simplified APIs for external consumers
- Act as the primary entry point for execution flows

![Mermaid Diagram](./diagrams\21_Global_Services_0.svg)

**Sources:** [src/lib/index.ts:64-76](), [docs/uml.puml:1-208]()

## Service Registration

Global Services are registered in the dependency injection container through the standard `provide()` pattern. All five Global Services are instantiated as singletons at application startup.

| Service | Symbol | Factory | Purpose |
|---------|--------|---------|---------|
| `StrategyGlobalService` | `TYPES.strategyGlobalService` | `new StrategyGlobalService()` | Inject context into strategy operations |
| `ExchangeGlobalService` | `TYPES.exchangeGlobalService` | `new ExchangeGlobalService()` | Inject context into exchange operations |
| `FrameGlobalService` | `TYPES.frameGlobalService` | `new FrameGlobalService()` | Inject context into frame operations |
| `LiveGlobalService` | `TYPES.liveGlobalService` | `new LiveGlobalService()` | Wrap live trading logic |
| `BacktestGlobalService` | `TYPES.backtestGlobalService` | `new BacktestGlobalService()` | Wrap backtest logic |

The registration occurs in the provider configuration:

[src/lib/core/provide.ts:45-51]()

The services are then injected and exported through the `backtest` aggregator object:

[src/lib/index.ts:64-76]()

**Sources:** [src/lib/core/provide.ts:45-51](), [src/lib/core/types.ts:22-28](), [src/lib/index.ts:64-76]()

## Domain Global Services

Domain Global Services (`StrategyGlobalService`, `ExchangeGlobalService`, `FrameGlobalService`) implement the same interfaces as their corresponding Client classes (`IStrategy`, `IExchange`, `IFrame`) but add context injection. They delegate actual business logic to Connection Services while enriching calls with execution context.

### Common Pattern

All domain Global Services follow this pattern:

![Mermaid Diagram](./diagrams\21_Global_Services_1.svg)

**Sources:** [docs/uml.puml:2-69]()

### StrategyGlobalService

`StrategyGlobalService` injects execution context into strategy operations and delegates to `StrategyConnectionService`. It implements the `IStrategy` interface.

**Key Dependencies:**
- `LoggerService` - Logging with context enrichment
- `StrategyConnectionService` - Routing to correct `ClientStrategy` instance

**Primary Methods:**
- `tick()` - Execute strategy tick with current execution context
- `backtest(candles)` - Execute backtest simulation with provided candles

**Dependency Chain:**

![Mermaid Diagram](./diagrams\21_Global_Services_2.svg)

**Sources:** [docs/uml.puml:22-55](), [src/lib/index.ts:68-69]()

### ExchangeGlobalService

`ExchangeGlobalService` injects execution context into exchange operations and delegates to `ExchangeConnectionService`. It implements the `IExchange` interface.

**Key Dependencies:**
- `LoggerService` - Logging with context enrichment
- `ExchangeConnectionService` - Routing to correct `ClientExchange` instance

**Primary Methods:**
- `getCandles(symbol, interval, limit)` - Fetch OHLCV candle data
- `getNextCandles(symbol, interval, limit)` - Fetch future candles (backtest mode)
- `getAveragePrice(symbol)` - Calculate VWAP for current/historical timestamp
- `formatPrice(symbol, price)` - Format price to exchange precision
- `formatQuantity(symbol, quantity)` - Format quantity to exchange rules

**Context Injection:**
The `when` field from `ExecutionContextService` determines whether to fetch historical or real-time data. The `backtest` flag controls whether `getNextCandles()` is allowed.

**Sources:** [docs/uml.puml:2-21](), [src/lib/index.ts:65-66]()

### FrameGlobalService

`FrameGlobalService` injects execution context into frame generation and delegates to `FrameConnectionService`. It implements the `IFrame` interface.

**Key Dependencies:**
- `LoggerService` - Logging with context enrichment
- `FrameConnectionService` - Routing to correct `ClientFrame` instance

**Primary Methods:**
- `getTimeframe(symbol)` - Generate timestamp array for backtest iteration

**Context Usage:**
Execution context is primarily used for logging and validation. The timeframe generation itself is based on the schema configuration (start date, end date, interval) rather than runtime context.

**Dependency Chain:**

![Mermaid Diagram](./diagrams\21_Global_Services_3.svg)

**Sources:** [docs/uml.puml:56-69](), [src/lib/index.ts:71]()

## Mode Global Services

Mode Global Services (`LiveGlobalService`, `BacktestGlobalService`) provide high-level execution interfaces by wrapping Logic Public Services. They act as the primary entry points for external API functions and manage the lifecycle of execution generators.

### BacktestGlobalService

`BacktestGlobalService` wraps `BacktestLogicPublicService` to provide a simplified interface for backtest execution. It serves as the implementation layer for the public `Backtest` API.

**Key Dependencies:**
- `LoggerService` - Execution logging
- `BacktestLogicPublicService` - Core backtest orchestration

**Primary Responsibilities:**
- Initialize backtest execution context
- Start backtest generator with proper configuration
- Stream results through async generator
- Manage backtest lifecycle

**Interaction Flow:**

![Mermaid Diagram](./diagrams\21_Global_Services_4.svg)

**Sources:** [docs/uml.puml:122-208](), [src/lib/index.ts:73-74]()

### LiveGlobalService

`LiveGlobalService` wraps `LiveLogicPublicService` to provide a simplified interface for live trading execution. It serves as the implementation layer for the public `Live` API.

**Key Dependencies:**
- `LoggerService` - Real-time logging with timestamps
- `LiveLogicPublicService` - Core live trading orchestration

**Primary Responsibilities:**
- Initialize live trading context with current timestamp
- Start infinite generator with 1-minute intervals
- Stream live trading events (signal opened/closed)
- Handle crash recovery through persistent state

**Execution Pattern:**

![Mermaid Diagram](./diagrams\21_Global_Services_5.svg)

**Sources:** [docs/uml.puml:70-121](), [src/lib/index.ts:72]()

## Context Injection Mechanism

Global Services inject execution context by coordinating two context services:

### ExecutionContextService Integration

`ExecutionContextService` provides the runtime state that determines operation behavior:

| Context Field | Type | Purpose |
|---------------|------|---------|
| `symbol` | `string` | Trading pair being processed |
| `when` | `Date` | Timestamp for operation (current for live, historical for backtest) |
| `backtest` | `boolean` | Flag determining operation mode |

Domain Global Services read this context and pass it implicitly to their Connection Services, which then inject it into Client class constructors.

### MethodContextService Integration

`MethodContextService` provides routing keys that determine which configuration to use:

| Context Field | Type | Purpose |
|---------------|------|---------|
| `strategyName` | `string` | Identifies which strategy configuration to use |
| `exchangeName` | `string` | Identifies which exchange configuration to use |
| `frameName` | `string` | Identifies which frame configuration to use |

Connection Services use these routing keys to look up schemas and create memoized client instances.

**Full Context Flow:**

![Mermaid Diagram](./diagrams\21_Global_Services_6.svg)

For detailed information on context propagation patterns, see [Context Propagation](#2.3).

**Sources:** [src/lib/index.ts:34-40](), [docs/uml.puml:1-208]()

## Dependency Injection Flow

Global Services are instantiated through the standard DI container flow. The following diagram shows how dependencies are resolved at runtime:

![Mermaid Diagram](./diagrams\21_Global_Services_7.svg)

**Instance Lifecycle:**
1. Application imports `backtest` object from `src/lib/index.ts`
2. Import triggers `init()` which resolves all DI dependencies
3. Global Services are instantiated as singletons
4. Global Services inject their own dependencies (Connection/Logic Services)
5. Connection Services lazily create and memoize Client instances on first use

**Sources:** [src/lib/index.ts:1-118](), [src/lib/core/provide.ts:45-51](), [src/lib/core/types.ts:22-28]()

## Usage in Logic Services

Logic Services (both Public and Private) are the primary consumers of Domain Global Services. They use Global Services to execute domain operations with proper context injection.

**Typical Usage Pattern:**

![Mermaid Diagram](./diagrams\21_Global_Services_8.svg)

**Backtest Example:**
`BacktestLogicPrivateService` sets execution context for each timestamp in the historical range, then calls `StrategyGlobalService.tick()` and `ExchangeGlobalService.getCandles()` to evaluate strategy signals.

**Live Example:**
`LiveLogicPrivateService` sets execution context to `Date.now()` every minute, then calls `StrategyGlobalService.tick()` to check for signal state changes.

**Sources:** [docs/uml.puml:70-208]()

## Summary

Global Services serve as the context injection and routing layer in the Service Orchestration architecture:

| Service | Layer Type | Primary Role | Key Dependencies |
|---------|-----------|--------------|------------------|
| `StrategyGlobalService` | Domain | Inject context into strategy operations | `StrategyConnectionService`, `LoggerService` |
| `ExchangeGlobalService` | Domain | Inject context into exchange operations | `ExchangeConnectionService`, `LoggerService` |
| `FrameGlobalService` | Domain | Inject context into frame generation | `FrameConnectionService`, `LoggerService` |
| `LiveGlobalService` | Mode | Wrap live trading logic | `LiveLogicPublicService`, `LoggerService` |
| `BacktestGlobalService` | Mode | Wrap backtest logic | `BacktestLogicPublicService`, `LoggerService` |

Domain Global Services implement the same interfaces as their corresponding Client classes but enrich operations with execution context. Mode Global Services provide simplified APIs for external consumers by wrapping Logic Public Services. Together, they enable clean separation between pure business logic (Client layer) and orchestration concerns (Logic layer) while maintaining implicit context propagation throughout the system.

**Sources:** [src/lib/index.ts:64-76](), [src/lib/core/provide.ts:45-51](), [docs/uml.puml:1-208]()
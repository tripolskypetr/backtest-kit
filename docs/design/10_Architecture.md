---
title: design/10_architecture
group: design
---

# Architecture

This document describes the overall architecture of backtest-kit, including its layered design, dependency injection system, context propagation mechanisms, and event-driven patterns. The architecture is designed to support three execution modes (Backtest, Live, Walker) while maintaining temporal isolation, crash recovery, and clean separation of concerns.

For detailed information about specific architectural components:
- Layer-specific responsibilities and interactions, see [Layer Responsibilities](./11_Layer_Responsibilities.md)
- Dependency injection container implementation, see [Dependency Injection System](./12_Dependency_Injection_System.md)
- Context propagation with AsyncLocalStorage, see [Context Propagation](./13_Context_Propagation.md)
- Event emitters and listener functions, see [Event System](./14_Event_System.md)

## System Overview

backtest-kit implements a **layered service architecture** with dependency injection and context propagation. The system consists of approximately 50+ services organized into distinct layers, each with specific responsibilities. Services are instantiated lazily via a custom DI container and communicate through well-defined interfaces.

The architecture supports three primary execution modes:
- **Backtest**: Historical simulation with temporal isolation (prevents look-ahead bias)
- **Live**: Real-time trading with crash-safe persistence (atomic file writes)
- **Walker**: Strategy comparison with metric-based ranking

### Architectural Layers

![Mermaid Diagram](./diagrams/10_Architecture_0.svg)


### Service Registration and Resolution

The system uses a custom dependency injection container that maps TYPES symbols to service factory functions. All services are registered at module load time and instantiated lazily on first access.

![Mermaid Diagram](./diagrams/10_Architecture_1.svg)

**Example Registration:**
```typescript
// In provide.ts
provide(TYPES.strategySchemaService, () => new StrategySchemaService());
provide(TYPES.strategyConnectionService, () => new StrategyConnectionService());

// In index.ts
const strategySchemaService = inject<StrategySchemaService>(TYPES.strategySchemaService);
const strategyConnectionService = inject<StrategyConnectionService>(TYPES.strategyConnectionService);
```


## Architectural Patterns

### 1. Layered Service Architecture

Each layer has specific responsibilities and communicates only with adjacent layers. This enforces separation of concerns and makes the system easier to test and maintain.

| Layer | Responsibility | Examples | Communication |
|-------|---------------|----------|---------------|
| **Public API** | User-facing functions | `addStrategy()`, `listenSignal()` | Calls Validation + Schema |
| **Utility Classes** | Execution control | `Backtest`, `Live`, `Walker` | Calls Command Services |
| **Command** | Workflow orchestration | `BacktestCommandService` | Calls Logic Public |
| **Logic Public** | API wrappers with validation | `BacktestLogicPublicService` | Calls Logic Private |
| **Logic Private** | Internal algorithms | `BacktestLogicPrivateService` | Calls Global + Core + Context |
| **Global** | Subsystem facades | `RiskGlobalService` | Calls Connection + Validation |
| **Core** | Domain logic | `StrategyCoreService` | Calls Connection |
| **Connection** | Factory + Memoization | `StrategyConnectionService` | Creates Clients |
| **Schema** | Configuration storage | `StrategySchemaService` | ToolRegistry pattern |
| **Validation** | Business rules | `StrategyValidationService` | Enforces constraints |
| **Markdown** | Report generation | `BacktestMarkdownService` | Subscribes to events |
| **Client** | Business logic execution | `ClientStrategy` | Uses Context |
| **Context** | Implicit parameters | `ExecutionContextService` | AsyncLocalStorage |


### 2. Factory Pattern with Memoization

Connection services use factory pattern to create client instances. Memoization ensures proper instance isolation based on composite keys.

![Mermaid Diagram](./diagrams/10_Architecture_2.svg)

**Key Construction Examples:**
- Backtest strategy: `"BTCUSDT:my-strategy:true"`
- Live strategy: `"BTCUSDT:my-strategy:false"`
- Different symbols: `"ETHUSDT:my-strategy:true"` (separate instance)

This ensures that:
- Backtest and live modes use separate instances (prevent state contamination)
- Each symbol gets its own instance (parallel execution support)
- Multiple strategies can share risk/sizing instances (portfolio-level analysis)


### 3. Context Propagation with AsyncLocalStorage

Two scoped services provide implicit parameter passing without manual threading:

![Mermaid Diagram](./diagrams/10_Architecture_3.svg)

**ExecutionContextService** provides runtime parameters:
- `symbol`: Trading pair (e.g., "BTCUSDT")
- `when`: Current timestamp for operations
- `backtest`: Boolean flag for mode detection

**MethodContextService** provides schema selection:
- `strategyName`: Which strategy to use
- `exchangeName`: Which exchange to use
- `frameName`: Which frame to use (empty for live)

This pattern eliminates the need to pass these parameters explicitly through every function call.


### 4. Event-Driven Architecture with RxJS

The system uses RxJS Subjects as a central event bus for decoupled communication between components.

![Mermaid Diagram](./diagrams/10_Architecture_4.svg)

**Event Hierarchy:**
- `signalEmitter`: Broadcasts ALL signals (backtest + live)
- `signalBacktestEmitter`: Backtest-only signals
- `signalLiveEmitter`: Live-only signals

This allows subscribers to listen at different granularities without tight coupling to execution logic.

**Queued Processing:**
All listener callbacks are wrapped with `queued()` from functools-kit, ensuring sequential execution even for async handlers. This prevents race conditions in event processing.


## Data Flow: Backtest Execution

The following diagram shows how data flows through the system during a backtest execution:

![Mermaid Diagram](./diagrams/10_Architecture_5.svg)

**Key Observations:**
1. **MethodContextService** wraps the generator to provide schema context
2. **ExecutionContextService** wraps each tick to provide runtime context
3. **Connection Services** provide memoized client instances
4. **ClientStrategy** orchestrates signal logic and emits events
5. **Event emitters** enable parallel data collection (markdown, user callbacks)


## Design Principles

### Temporal Isolation

**ExecutionContextService** enforces temporal isolation by controlling which timestamp is "current" for all operations. During backtesting, `when` is set to the candle timestamp being processed. During live trading, `when` is set to `Date.now()`.

**ClientExchange.getCandles()** uses the context's `when` value to fetch historical candles:
- In backtest mode: Fetches candles BEFORE the context timestamp (prevents look-ahead bias)
- In live mode: Fetches most recent candles up to `Date.now()`

This ensures strategies cannot access "future" data during backtesting, making backtest results realistic.


### Crash-Safe Persistence

**PersistBase** abstract class provides atomic file writes using the temp-rename pattern:
1. Write data to temporary file: `signal.json.tmp`
2. Call `fsync()` to ensure disk write
3. Rename temp file to final: `signal.json`
4. OS guarantees rename is atomic

Multiple persistence adapters extend `PersistBase`:
- **PersistSignalAdapter**: Active signals per symbol/strategy
- **PersistRiskAdapter**: Portfolio state per risk profile
- **PersistScheduleAdapter**: Scheduled signals per symbol/strategy
- **PersistPartialAdapter**: Profit/loss milestone tracking per symbol/strategy

Each adapter has separate file paths to prevent cross-contamination. On restart, `waitForInit()` loads state from disk files.


### Type-Safe Discriminated Unions

Signal state machine uses TypeScript discriminated unions for type-safe state handling:

```typescript
type IStrategyTickResult = 
  | IStrategyTickResultIdle       // action: "idle"
  | IStrategyTickResultScheduled  // action: "scheduled"
  | IStrategyTickResultOpened     // action: "opened"
  | IStrategyTickResultActive     // action: "active"
  | IStrategyTickResultClosed     // action: "closed"
  | IStrategyTickResultCancelled  // action: "cancelled"
```

Each state has distinct properties. TypeScript narrows the type based on the `action` discriminator:

```typescript
if (result.action === "closed") {
  // TypeScript knows result is IStrategyTickResultClosed
  console.log(result.pnl.pnlPercentage);  // OK
  console.log(result.closeReason);         // OK
}
```

This prevents accessing properties that don't exist in the current state, catching bugs at compile time.


### Memoized Service Instantiation

Connection services use memoization to ensure singleton behavior per composite key:

```typescript
// StrategyConnectionService.getStrategy() pseudo-code
getStrategy(symbol: string, strategyName: string, backtest: boolean) {
  const key = `${symbol}:${strategyName}:${backtest}`;
  
  if (!this.cache.has(key)) {
    const schema = this.schemaService.retrieve(strategyName);
    const instance = new ClientStrategy({
      ...schema,
      logger: this.logger,
      execution: this.executionContextService,
      // ... other dependencies
    });
    this.cache.set(key, instance);
  }
  
  return this.cache.get(key);
}
```

This pattern:
- Prevents duplicate instantiation (performance)
- Maintains state per key (correctness)
- Supports parallel execution (isolation)


## Component Interaction Example: Risk Management

The following diagram shows how risk management integrates across layers:

![Mermaid Diagram](./diagrams/10_Architecture_6.svg)

**Key Interactions:**
1. **Registration**: User calls `addRisk()` → validates → stores in SchemaService
2. **Instantiation**: ClientStrategy requests ClientRisk → ConnectionService checks cache → creates if needed
3. **State Loading**: ClientRisk calls `waitForInit()` → PersistRiskAdapter loads from disk
4. **Validation**: ClientRisk runs validation chain → emits event on rejection
5. **State Update**: On signal open/close → ClientRisk updates portfolio state → persists to disk


## Summary

The backtest-kit architecture is characterized by:

1. **Layered Services**: Clear separation of concerns across 9+ service layers
2. **Dependency Injection**: Custom DI container with lazy instantiation and memoization
3. **Context Propagation**: AsyncLocalStorage-based implicit parameter passing
4. **Event-Driven**: RxJS Subjects for decoupled communication with queued processing
5. **Factory Pattern**: Connection services with composite key-based memoization
6. **Temporal Isolation**: Context-aware data access prevents look-ahead bias
7. **Crash Recovery**: Atomic file writes enable graceful recovery from failures
8. **Type Safety**: Discriminated unions for compile-time correctness

This architecture enables the framework to support complex trading workflows while maintaining testability, extensibility, and reliability. The layered design ensures that changes to one component (e.g., persistence implementation) do not cascade to unrelated components (e.g., signal generation logic).

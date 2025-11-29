# Component Types

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/function/add.ts](src/function/add.ts)
- [src/function/list.ts](src/function/list.ts)
- [src/index.ts](src/index.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [test/index.mjs](test/index.mjs)
- [types.d.ts](types.d.ts)

</details>



## Purpose and Scope

This page provides a comprehensive overview of the six component types that can be registered in backtest-kit. Each component type serves a distinct role in the trading system architecture: **Strategy** (signal generation logic), **Exchange** (market data access), **Frame** (backtest timeframe generation), **Risk** (portfolio-level risk management), **Sizing** (position size calculation), and **Walker** (multi-strategy comparison).

For detailed implementation guidance on individual component types, see their respective subsections: [Strategy Schemas](#5.1), [Exchange Schemas](#5.2), [Frame Schemas](#5.3), [Risk Schemas](#5.4), [Sizing Schemas](#5.5), and [Walker Schemas](#5.6). For information about registering components via the public API, see [Component Registration Functions](#4.2). For information about the service layer that manages these components, see [Schema Services](#7.3).

---

## Component-Based Architecture

backtest-kit uses a **schema-based registration system** where users define component configurations as TypeScript objects and register them via `add*` functions. Each component type has:

1. **Schema Interface** - TypeScript interface defining required and optional fields
2. **Registration Function** - Public API function (`addStrategy`, `addExchange`, etc.) for schema registration
3. **Schema Service** - Internal storage using `ToolRegistry` pattern for schema retrieval by name
4. **Validation Service** - Runtime validation logic ensuring schema correctness and preventing duplicate registration
5. **Connection Service** - Memoized factory for creating client instances from schemas

This architecture enables **separation of concerns**: schemas define "what" components do, while the framework handles "how" they integrate with execution modes (Backtest, Live, Walker).

**Sources:** [src/function/add.ts:1-342](), [types.d.ts:184-633]()

---

## Registration Pattern

All component registration follows the same pattern implemented in [src/function/add.ts:1-342]():

```typescript
// 1. User calls public registration function
addStrategy(schema);  // or addExchange, addFrame, addRisk, addSizing, addWalker

// 2. Framework validates schema
backtest.strategyValidationService.addStrategy(schema.strategyName, schema);

// 3. Framework stores schema in registry
backtest.strategySchemaService.register(schema.strategyName, schema);
```

The validation step performs:
- **Duplicate name detection** - Throws error if component name already registered
- **Required field validation** - Ensures all mandatory schema fields are present
- **Type checking** - Validates field types match interface definitions
- **Memoization** - Stores validation result to avoid redundant checks

**Sources:** [src/function/add.ts:50-341](), [src/lib/core/types.ts:18-66]()

---

## Component Type Overview

### Comparison Table

| Component Type | Schema Interface | Registration Function | Primary Responsibility | Used In Modes |
|----------------|------------------|----------------------|------------------------|---------------|
| **Strategy** | `IStrategySchema` | `addStrategy()` | Signal generation logic with `getSignal()` function | Backtest, Live, Walker |
| **Exchange** | `IExchangeSchema` | `addExchange()` | Market data access via `getCandles()`, price/quantity formatting | Backtest, Live, Walker |
| **Frame** | `IFrameSchema` | `addFrame()` | Timeframe generation for historical backtesting periods | Backtest, Walker |
| **Risk** | `IRiskSchema` | `addRisk()` | Portfolio-level risk validation and position tracking | Backtest, Live, Walker |
| **Sizing** | `ISizingSchema` | `addSizing()` | Position size calculation (fixed, Kelly, ATR-based methods) | Backtest, Live, Walker |
| **Walker** | `IWalkerSchema` | `addWalker()` | Multi-strategy comparison orchestration | Walker only |

**Sources:** [types.d.ts:184-633](), [src/function/add.ts:1-342]()

---

## Component Registration Flow Diagram

```mermaid
graph TB
    User["User Code"]
    AddFn["add* Function<br/>(addStrategy, addExchange, etc.)"]
    ValidationSvc["*ValidationService<br/>(StrategyValidationService, etc.)"]
    SchemaSvc["*SchemaService<br/>(StrategySchemaService, etc.)"]
    Registry["ToolRegistry<br/>(Map: name → schema)"]
    ConnectionSvc["*ConnectionService<br/>(StrategyConnectionService, etc.)"]
    ClientClass["Client* Class<br/>(ClientStrategy, ClientExchange, etc.)"]
    
    User -->|"Pass IStrategySchema"| AddFn
    AddFn -->|"1. Validate schema"| ValidationSvc
    ValidationSvc -->|"Check duplicates<br/>Validate fields"| ValidationSvc
    AddFn -->|"2. Store schema"| SchemaSvc
    SchemaSvc -->|"register(name, schema)"| Registry
    
    ConnectionSvc -->|"get(name)"| SchemaSvc
    SchemaSvc -->|"Return schema"| ConnectionSvc
    ConnectionSvc -->|"Instantiate with schema"| ClientClass
    
    note1["Validation happens at<br/>registration time"]
    note2["Client instances are<br/>memoized (one per name)"]
    
    ValidationSvc -.-> note1
    ConnectionSvc -.-> note2
```

**Sources:** [src/function/add.ts:50-341](), [src/lib/services/validation/StrategyValidationService.ts:1-50](), [src/lib/services/schema/StrategySchemaService.ts:1-30](), [src/lib/services/connection/StrategyConnectionService.ts:1-50]()

---

## Schema Storage and Retrieval

### Schema Service Pattern

Each component type has a corresponding `*SchemaService` class that implements the `ToolRegistry` pattern for name-based storage and retrieval:

```mermaid
classDiagram
    class ToolRegistry {
        -Map~string,T~ _registry
        +register(name: string, tool: T)
        +get(name: string): T
        +has(name: string): boolean
        +list(): T[]
    }
    
    class StrategySchemaService {
        +register(name: StrategyName, schema: IStrategySchema)
        +get(name: StrategyName): IStrategySchema
        +has(name: StrategyName): boolean
        +list(): IStrategySchema[]
    }
    
    class ExchangeSchemaService {
        +register(name: ExchangeName, schema: IExchangeSchema)
        +get(name: ExchangeName): IExchangeSchema
    }
    
    class FrameSchemaService {
        +register(name: FrameName, schema: IFrameSchema)
        +get(name: FrameName): IFrameSchema
    }
    
    class RiskSchemaService {
        +register(name: RiskName, schema: IRiskSchema)
        +get(name: RiskName): IRiskSchema
    }
    
    class SizingSchemaService {
        +register(name: SizingName, schema: ISizingSchema)
        +get(name: SizingName): ISizingSchema
    }
    
    class WalkerSchemaService {
        +register(name: WalkerName, schema: IWalkerSchema)
        +get(name: WalkerName): IWalkerSchema
    }
    
    ToolRegistry <|-- StrategySchemaService
    ToolRegistry <|-- ExchangeSchemaService
    ToolRegistry <|-- FrameSchemaService
    ToolRegistry <|-- RiskSchemaService
    ToolRegistry <|-- SizingSchemaService
    ToolRegistry <|-- WalkerSchemaService
```

**Sources:** [src/lib/services/schema/StrategySchemaService.ts:1-30](), [src/lib/services/schema/ExchangeSchemaService.ts:1-30](), [src/lib/core/types.ts:18-26]()

---

## Validation Services

Each component type has a `*ValidationService` class responsible for:

1. **Registration-time validation** - Called by `add*` functions before schema storage
2. **Duplicate detection** - Prevents registering the same component name twice
3. **Schema validation** - Ensures required fields are present and valid
4. **List functionality** - Returns all registered schemas for introspection

### Validation Service Architecture

| Service Class | Purpose | Registered Via | Retrieved Via |
|---------------|---------|----------------|---------------|
| `StrategyValidationService` | Validates `IStrategySchema` fields (strategyName, interval, getSignal) | `addStrategy()` | `listStrategies()` |
| `ExchangeValidationService` | Validates `IExchangeSchema` fields (exchangeName, getCandles, formatPrice, formatQuantity) | `addExchange()` | `listExchanges()` |
| `FrameValidationService` | Validates `IFrameSchema` fields (frameName, interval, startDate, endDate) | `addFrame()` | `listFrames()` |
| `RiskValidationService` | Validates `IRiskSchema` fields (riskName, validations array) | `addRisk()` | `listRisks()` |
| `SizingValidationService` | Validates `ISizingSchema` discriminated union (method-specific fields) | `addSizing()` | `listSizings()` |
| `WalkerValidationService` | Validates `IWalkerSchema` fields (walkerName, strategies array, metric) | `addWalker()` | `listWalkers()` |

**Sources:** [src/lib/services/validation/StrategyValidationService.ts:1-50](), [src/lib/core/types.ts:59-66](), [src/function/list.ts:1-218]()

---

## Connection Services and Client Instantiation

### Memoized Instance Pattern

`*ConnectionService` classes act as **memoized factories** that create and cache `Client*` instances. Each component name gets exactly one client instance, created lazily on first use:

```mermaid
sequenceDiagram
    participant Logic as "BacktestLogicPrivateService"
    participant ConnSvc as "StrategyConnectionService"
    participant SchemaSvc as "StrategySchemaService"
    participant Client as "ClientStrategy"
    participant Cache as "Memoization Cache"
    
    Logic->>ConnSvc: get("my-strategy")
    ConnSvc->>Cache: Check if instance exists
    
    alt Instance cached
        Cache-->>ConnSvc: Return cached ClientStrategy
        ConnSvc-->>Logic: Return instance
    else Instance not cached
        ConnSvc->>SchemaSvc: get("my-strategy")
        SchemaSvc-->>ConnSvc: Return IStrategySchema
        ConnSvc->>Client: new ClientStrategy(schema, logger, execution)
        Client-->>ConnSvc: ClientStrategy instance
        ConnSvc->>Cache: Store instance
        ConnSvc-->>Logic: Return instance
    end
```

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:1-50](), [src/lib/services/connection/ExchangeConnectionService.ts:1-50]()

---

## Component Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> Unregistered
    Unregistered --> Validating: User calls add* function
    Validating --> ValidationFailed: Validation error<br/>(duplicate name, missing field)
    Validating --> Registered: Validation passes
    Registered --> Instantiated: First use in execution
    Instantiated --> Executing: tick() or backtest() called
    Executing --> Instantiated: Operation complete
    
    ValidationFailed --> [*]
    
    note right of Registered
        Schema stored in
        *SchemaService registry
    end note
    
    note right of Instantiated
        Client instance created
        and cached in
        *ConnectionService
    end note
    
    note right of Executing
        Component logic executes
        within ExecutionContext
        and MethodContext
    end note
```

**Sources:** [src/function/add.ts:50-341](), [src/lib/services/connection/StrategyConnectionService.ts:1-50]()

---

## Dependency Injection Tokens

The framework uses Symbol-based tokens for dependency injection, defined in [src/lib/core/types.ts:1-81]():

### Schema Service Tokens

```typescript
const schemaServices = {
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    strategySchemaService: Symbol('strategySchemaService'),
    frameSchemaService: Symbol('frameSchemaService'),
    walkerSchemaService: Symbol('walkerSchemaService'),
    sizingSchemaService: Symbol('sizingSchemaService'),
    riskSchemaService: Symbol('riskSchemaService'),
}
```

### Validation Service Tokens

```typescript
const validationServices = {
    exchangeValidationService: Symbol('exchangeValidationService'),
    strategyValidationService: Symbol('strategyValidationService'),
    frameValidationService: Symbol('frameValidationService'),
    walkerValidationService: Symbol('walkerValidationService'),
    sizingValidationService: Symbol('sizingValidationService'),
    riskValidationService: Symbol('riskValidationService'),
}
```

### Connection Service Tokens

```typescript
const connectionServices = {
    exchangeConnectionService: Symbol('exchangeConnectionService'),
    strategyConnectionService: Symbol('strategyConnectionService'),
    frameConnectionService: Symbol('frameConnectionService'),
    sizingConnectionService: Symbol('sizingConnectionService'),
    riskConnectionService: Symbol('riskConnectionService'),
}
```

**Sources:** [src/lib/core/types.ts:1-81](), [src/lib/core/provide.ts:1-111]()

---

## Component Name Types

Each component type has a corresponding string-based name type for type-safe registration and retrieval:

| Component | Name Type | Example Value |
|-----------|-----------|---------------|
| Strategy | `StrategyName` (alias of `string`) | `"my-strategy"` |
| Exchange | `ExchangeName` (alias of `string`) | `"binance"` |
| Frame | `FrameName` (alias of `string`) | `"1d-backtest"` |
| Risk | `RiskName` (alias of `string`) | `"conservative"` |
| Sizing | `SizingName` (alias of `string`) | `"fixed-1-percent"` |
| Walker | `WalkerName` (alias of `string`) | `"llm-optimizer"` |

These type aliases provide semantic clarity while maintaining string compatibility for runtime lookup.

**Sources:** [types.d.ts:275-360](), [types.d.ts:533-824]()

---

## Cross-Component Dependencies

Some component types reference other components by name, creating a dependency graph:

```mermaid
graph LR
    Strategy["IStrategySchema<br/>strategyName"]
    Exchange["IExchangeSchema<br/>exchangeName"]
    Frame["IFrameSchema<br/>frameName"]
    Risk["IRiskSchema<br/>riskName"]
    Sizing["ISizingSchema<br/>sizingName"]
    Walker["IWalkerSchema<br/>walkerName"]
    
    Strategy -.->|"Optional riskName<br/>reference"| Risk
    Strategy -.->|"Optional sizingName<br/>reference"| Sizing
    Walker -->|"Required exchangeName<br/>reference"| Exchange
    Walker -->|"Required frameName<br/>reference"| Frame
    Walker -->|"Required strategies[]<br/>array reference"| Strategy
    
    note1["Strategy can operate<br/>independently without<br/>risk or sizing"]
    note2["Walker orchestrates<br/>multiple strategies<br/>on same exchange/frame"]
    
    Strategy -.-> note1
    Walker -.-> note2
```

**Sources:** [types.d.ts:616-633](), [types.d.ts:1019-1033]()

---

## List Functions for Introspection

The framework provides `list*` functions defined in [src/function/list.ts:1-218]() for retrieving all registered component schemas:

| Function | Returns | Purpose |
|----------|---------|---------|
| `listStrategies()` | `Promise<IStrategySchema[]>` | All registered strategies |
| `listExchanges()` | `Promise<IExchangeSchema[]>` | All registered exchanges |
| `listFrames()` | `Promise<IFrameSchema[]>` | All registered frames |
| `listRisks()` | `Promise<IRiskSchema[]>` | All registered risk profiles |
| `listSizings()` | `Promise<ISizingSchema[]>` | All registered sizing configurations |
| `listWalkers()` | `Promise<IWalkerSchema[]>` | All registered walkers |

These functions are useful for:
- **Debugging** - Inspecting what components are registered
- **Documentation** - Generating component lists dynamically
- **UI Generation** - Building dropdowns/selectors of available components
- **Testing** - Verifying registration state

**Sources:** [src/function/list.ts:41-217](), [src/index.ts:3]()

---

## Common Schema Fields

All component schemas share these common optional fields:

| Field | Type | Purpose |
|-------|------|---------|
| `note` | `string \| undefined` | Optional developer documentation for the component |
| `callbacks` | `Partial<I*Callbacks> \| undefined` | Optional lifecycle event handlers for debugging/logging |

The `callbacks` field provides hooks into component lifecycle events without requiring custom code. Each component type has its own callback interface (e.g., `IStrategyCallbacks`, `IExchangeCallbacks`) with event-specific methods.

**Sources:** [types.d.ts:179-221](), [types.d.ts:295-341]()

---

## Service Layer Summary

For each component type, the framework maintains three service classes:

```mermaid
graph TB
    subgraph "Component Type: Strategy"
        SchemaA["StrategySchemaService<br/>(Storage)"]
        ValidationA["StrategyValidationService<br/>(Validation)"]
        ConnectionA["StrategyConnectionService<br/>(Factory)"]
        ClientA["ClientStrategy<br/>(Business Logic)"]
        
        ValidationA -->|"Validates before"| SchemaA
        ConnectionA -->|"Retrieves from"| SchemaA
        ConnectionA -->|"Creates"| ClientA
    end
    
    subgraph "Component Type: Exchange"
        SchemaB["ExchangeSchemaService<br/>(Storage)"]
        ValidationB["ExchangeValidationService<br/>(Validation)"]
        ConnectionB["ExchangeConnectionService<br/>(Factory)"]
        ClientB["ClientExchange<br/>(Business Logic)"]
        
        ValidationB -->|"Validates before"| SchemaB
        ConnectionB -->|"Retrieves from"| SchemaB
        ConnectionB -->|"Creates"| ClientB
    end
    
    subgraph "... (Same pattern for Frame, Risk, Sizing)"
        EllipsisNode["..."]
    end
```

This consistent three-layer pattern (Validation → Schema → Connection → Client) applies to all component types, providing predictable behavior and code organization.

**Sources:** [src/lib/index.ts:1-170](), [src/lib/core/types.ts:1-81]()
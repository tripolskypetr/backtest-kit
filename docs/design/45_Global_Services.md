# Global Services

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/classes/Persist.ts](src/classes/Persist.ts)
- [src/client/ClientPartial.ts](src/client/ClientPartial.ts)
- [src/contract/PartialLoss.contract.ts](src/contract/PartialLoss.contract.ts)
- [src/contract/PartialProfit.contract.ts](src/contract/PartialProfit.contract.ts)
- [src/function/add.ts](src/function/add.ts)
- [src/interfaces/Partial.interface.ts](src/interfaces/Partial.interface.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [src/lib/services/connection/PartialConnectionService.ts](src/lib/services/connection/PartialConnectionService.ts)
- [src/lib/services/global/PartialGlobalService.ts](src/lib/services/global/PartialGlobalService.ts)

</details>



Global Services provide entry points for runtime operations that require validation and delegation to connection services. Unlike schema services (which store configurations) and command services (which orchestrate execution), global services act as facades that coordinate validation, logging, and delegation for specific subsystems.

The framework provides four Global Services, each managing a distinct domain:

| Global Service Class | Domain | Primary Responsibilities |
|---------------------|--------|-------------------------|
| `RiskGlobalService` | Portfolio risk management | Validates risk profiles, delegates position tracking to RiskConnectionService |
| `SizingGlobalService` | Position sizing | Validates sizing configurations, delegates calculations to SizingConnectionService |
| `PartialGlobalService` | Profit/loss milestones | Validates strategies, delegates milestone tracking to PartialConnectionService |
| `OptimizerGlobalService` | LLM strategy generation | Validates optimizer configurations, delegates code generation to OptimizerConnectionService |

For information about the overall service layer organization, see [Service Architecture Overview](#7.1). For details on the services that Global Services delegate to, see [Connection Services](#7.2), [Schema Services](#7.3), and [Validation Services](#7.4).

**Sources:** [src/lib/index.ts:120-129](), [src/lib/core/types.ts:36-41](), [src/lib/core/provide.ts:91-96]()
</thinking>

---

## Global Services vs Other Service Layers

Global Services occupy a specific niche in the service architecture distinct from other layers.

### Architectural Position

```mermaid
graph TB
    subgraph "Public API Layer"
        AddFunctions["add* functions<br/>addStrategy, addRisk, etc."]
        ClientClasses["Client Classes<br/>ClientStrategy, ClientRisk"]
    end
    
    subgraph "Global Services Layer"
        RGS["RiskGlobalService"]
        SGS["SizingGlobalService"]
        PGS["PartialGlobalService"]
        OGS["OptimizerGlobalService"]
    end
    
    subgraph "Validation Layer"
        ValidationServices["*ValidationService<br/>Schema existence checks"]
    end
    
    subgraph "Connection Layer"
        ConnectionServices["*ConnectionService<br/>Memoized client instances"]
    end
    
    subgraph "Schema Layer"
        SchemaServices["*SchemaService<br/>ToolRegistry storage"]
    end
    
    AddFunctions -->|"Direct access"| ValidationServices
    AddFunctions -->|"Direct access"| SchemaServices
    
    ClientClasses -->|"Runtime delegation"| RGS
    ClientClasses -->|"Runtime delegation"| PGS
    
    RGS --> ValidationServices
    SGS --> ValidationServices
    PGS --> ValidationServices
    OGS --> ValidationServices
    
    RGS --> ConnectionServices
    SGS --> ConnectionServices
    PGS --> ConnectionServices
    OGS --> ConnectionServices
    
    ConnectionServices --> SchemaServices
    
    style RGS fill:#f9f9f9
    style SGS fill:#f9f9f9
    style PGS fill:#f9f9f9
    style OGS fill:#f9f9f9
```

**Purpose**: This diagram shows how Global Services fit between client classes and connection services. Unlike `add*` functions which access schema/validation services directly, global services provide validated entry points for runtime operations.

**Sources:** [src/lib/index.ts:120-129](), [src/function/add.ts:52-64](), [src/lib/services/global/PartialGlobalService.ts:40-54]()

### Comparison with Other Layers

| Layer | Purpose | State Management | Used By |
|-------|---------|------------------|---------|
| **Schema Services** | Store registered configurations | In-memory ToolRegistry | add* functions, Connection Services |
| **Validation Services** | Enforce registration rules | Stateless (memoized checks) | add* functions, Global Services |
| **Connection Services** | Create/cache client instances | Memoized client instances per key | Global Services, Core Services |
| **Global Services** | Coordinate validation + delegation | Stateless (delegates to Connection) | Client classes (ClientStrategy, etc.) |
| **Command Services** | Orchestrate execution workflows | Stateless (delegates to Logic) | Utility classes (Backtest, Live, Walker) |

**Key distinction**: Global Services are **runtime facades** used by client classes during execution. Schema Services are **configuration stores** used during setup. Command Services are **execution orchestrators** used by utility classes.

**Sources:** [src/lib/index.ts:61-129](), [src/lib/services/global/PartialGlobalService.ts:1-205]()

---

## Standard Global Service Pattern

All Global Services follow a consistent three-step pattern for public methods:

### Implementation Pattern

```mermaid
graph LR
    subgraph "PartialGlobalService.profit() Example"
        Input["Method Called<br/>profit(symbol, data, ...)"]
        Log["1. Log Operation<br/>loggerService.log()"]
        Validate["2. Validate Strategy<br/>validate(strategyName)"]
        Delegate["3. Delegate to Connection<br/>partialConnectionService.profit()"]
    end
    
    Input --> Log
    Log --> Validate
    Validate --> Delegate
    Delegate --> Return["Return Result"]
```

**Purpose**: This diagram shows the standard three-step pattern that all Global Service methods follow: log the operation, validate component existence, then delegate to the corresponding Connection Service.

**Sources:** [src/lib/services/global/PartialGlobalService.ts:110-135]()

### Standard Method Structure

Every public method in a Global Service follows this template:

```typescript
// Pattern from PartialGlobalService.profit()
public profit = async (
  symbol: string,
  data: ISignalRow,
  currentPrice: number,
  revenuePercent: number,
  backtest: boolean,
  when: Date
) => {
  // Step 1: Log operation with context
  this.loggerService.log("partialGlobalService profit", {
    symbol,
    data,
    currentPrice,
    revenuePercent,
    backtest,
    when,
  });
  
  // Step 2: Validate component existence (memoized)
  this.validate(data.strategyName, "partialGlobalService profit");
  
  // Step 3: Delegate to Connection Service
  return await this.partialConnectionService.profit(
    symbol,
    data,
    currentPrice,
    revenuePercent,
    backtest,
    when
  );
};
```

**Sources:** [src/lib/services/global/PartialGlobalService.ts:110-135]()

---

## Dependency Injection Pattern

All Global Services inject three types of dependencies via the DI container:

### Injected Dependencies

```mermaid
graph TB
    subgraph "PartialGlobalService Dependencies"
        PGS["PartialGlobalService"]
        
        Logger["LoggerService<br/>Logging operations"]
        Conn["PartialConnectionService<br/>Client instance factory"]
        
        StratVal["StrategyValidationService<br/>Strategy validation"]
        StratSchema["StrategySchemaService<br/>Strategy retrieval"]
        RiskVal["RiskValidationService<br/>Risk validation"]
    end
    
    PGS -->|"inject(TYPES.loggerService)"| Logger
    PGS -->|"inject(TYPES.partialConnectionService)"| Conn
    PGS -->|"inject(TYPES.strategyValidationService)"| StratVal
    PGS -->|"inject(TYPES.strategySchemaService)"| StratSchema
    PGS -->|"inject(TYPES.riskValidationService)"| RiskVal
```

**Purpose**: This diagram shows the dependency injection pattern used by PartialGlobalService. All dependencies are injected using the `inject()` function with TYPES symbols.

**Sources:** [src/lib/services/global/PartialGlobalService.ts:40-74]()

### Dependency Categories

| Dependency Type | Instance | Purpose | Usage |
|----------------|----------|---------|-------|
| **Logger** | `LoggerService` | Operation logging | Called at method entry with context |
| **Connection** | `*ConnectionService` | Client factory | Delegates operations after validation |
| **Validation** | `*ValidationService` | Schema checks | Called by memoized `validate()` |
| **Schema** | `*SchemaService` | Configuration retrieval | Accessed to check related components |

Example from PartialGlobalService:

[src/lib/services/global/PartialGlobalService.ts:40-74]()

```typescript
private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
private readonly partialConnectionService = inject<PartialConnectionService>(
  TYPES.partialConnectionService
);
private readonly strategyValidationService = inject<StrategyValidationService>(
  TYPES.strategyValidationService
);
private readonly strategySchemaService = inject<StrategySchemaService>(
  TYPES.strategySchemaService
);
private readonly riskValidationService = inject<RiskValidationService>(
  TYPES.riskValidationService
);
```

**Sources:** [src/lib/services/global/PartialGlobalService.ts:40-74]()

---

## Memoized Validation

Global Services use memoization to avoid redundant validation calls for the same component.

### Validation Caching Pattern

```mermaid
sequenceDiagram
    participant CS as ClientStrategy
    participant PGS as PartialGlobalService
    participant MemoValidate as validate() memoized
    participant SVS as StrategyValidationService
    participant PCS as PartialConnectionService
    
    Note over CS,PCS: First call for "my-strategy"
    CS->>PGS: profit(symbol, data, ...)
    PGS->>PGS: loggerService.log()
    PGS->>MemoValidate: validate("my-strategy", source)
    
    MemoValidate->>SVS: validate("my-strategy", source)
    SVS-->>MemoValidate: validation complete
    Note over MemoValidate: Cache result for "my-strategy"
    MemoValidate-->>PGS: validated
    
    PGS->>PCS: profit(symbol, data, ...)
    PCS-->>PGS: result
    PGS-->>CS: result
    
    Note over CS,PCS: Second call for "my-strategy"
    CS->>PGS: profit(symbol, data2, ...)
    PGS->>PGS: loggerService.log()
    PGS->>MemoValidate: validate("my-strategy", source)
    
    Note over MemoValidate: Return cached result instantly
    MemoValidate-->>PGS: validated (cached)
    
    PGS->>PCS: profit(symbol, data2, ...)
    PCS-->>PGS: result
    PGS-->>CS: result
```

**Purpose**: This sequence diagram shows how memoization prevents redundant validation. The first call performs validation and caches the result. Subsequent calls for the same strategy return immediately from cache.

**Sources:** [src/lib/services/global/PartialGlobalService.ts:77-95](), [src/lib/services/global/PartialGlobalService.ts:110-135]()

### Memoize Implementation

The `validate()` method is wrapped with `memoize()` from functools-kit:

[src/lib/services/global/PartialGlobalService.ts:77-95]()

```typescript
private validate = memoize(
  // Cache key: strategy name
  ([strategyName]) => `${strategyName}`,
  
  // Validation logic (only runs once per key)
  (strategyName: string, methodName: string) => {
    this.loggerService.log("partialGlobalService validate", {
      strategyName,
      methodName,
    });
    
    // Validate strategy exists
    this.strategyValidationService.validate(strategyName, methodName);
    
    // Validate associated risk profiles
    const { riskName, riskList } = this.strategySchemaService.get(strategyName);
    riskName && this.riskValidationService.validate(riskName, methodName);
    riskList && riskList.forEach((riskName) => 
      this.riskValidationService.validate(riskName, methodName)
    );
  }
);
```

**Key aspects:**
- **Cache key**: Strategy name as string
- **First call**: Validates strategy and associated risk profiles
- **Subsequent calls**: Returns immediately (no validation performed)
- **Scope**: Per Global Service instance (singleton via DI)

**Sources:** [src/lib/services/global/PartialGlobalService.ts:77-95]()

---

## PartialGlobalService

PartialGlobalService coordinates partial profit/loss milestone tracking. It validates strategies and delegates milestone operations to PartialConnectionService.

### Service Overview

```mermaid
graph TB
    subgraph "ClientStrategy Execution"
        CS["ClientStrategy.tick()"]
        Monitor["Monitor active signal<br/>Calculate revenuePercent"]
    end
    
    subgraph "PartialGlobalService"
        PGS_Profit["profit()<br/>Log + Validate + Delegate"]
        PGS_Loss["loss()<br/>Log + Validate + Delegate"]
        PGS_Clear["clear()<br/>Log + Validate + Delegate"]
        PGS_Validate["validate() memoized<br/>Check strategy + risks"]
    end
    
    subgraph "PartialConnectionService"
        PCS["getPartial() memoized<br/>One ClientPartial per signal ID"]
        CP["ClientPartial<br/>Track profit/loss levels"]
    end
    
    subgraph "Event System"
        Events["partialProfitSubject<br/>partialLossSubject"]
    end
    
    CS --> Monitor
    Monitor -->|"revenuePercent > 0"| PGS_Profit
    Monitor -->|"revenuePercent < 0"| PGS_Loss
    CS -->|"Signal closes"| PGS_Clear
    
    PGS_Profit --> PGS_Validate
    PGS_Loss --> PGS_Validate
    PGS_Clear --> PGS_Validate
    
    PGS_Profit --> PCS
    PGS_Loss --> PCS
    PGS_Clear --> PCS
    
    PCS --> CP
    CP --> Events
```

**Purpose**: This diagram shows PartialGlobalService's role in the partial tracking system. ClientStrategy calls the global service, which validates and delegates to PartialConnectionService, which manages ClientPartial instances.

**Sources:** [src/lib/services/global/PartialGlobalService.ts:1-205](), [src/lib/services/connection/PartialConnectionService.ts:117-264]()

### Public Methods

| Method | Parameters | Description |
|--------|-----------|-------------|
| `profit()` | `symbol, data, currentPrice, revenuePercent, backtest, when` | Processes profit state, emits events for new levels (10%, 20%, etc) |
| `loss()` | `symbol, data, currentPrice, lossPercent, backtest, when` | Processes loss state, emits events for new levels (-10%, -20%, etc) |
| `clear()` | `symbol, data, priceClose, backtest` | Clears milestone state when signal closes |

Example usage from ClientStrategy:

[src/lib/services/global/PartialGlobalService.ts:110-175]()

```typescript
// Called during signal monitoring when in profit
public profit = async (
  symbol: string,
  data: ISignalRow,
  currentPrice: number,
  revenuePercent: number,
  backtest: boolean,
  when: Date
) => {
  this.loggerService.log("partialGlobalService profit", {
    symbol,
    data,
    currentPrice,
    revenuePercent,
    backtest,
    when,
  });
  this.validate(data.strategyName, "partialGlobalService profit");
  return await this.partialConnectionService.profit(
    symbol,
    data,
    currentPrice,
    revenuePercent,
    backtest,
    when
  );
};
```

**Validation flow:**
1. Validates strategy exists via `StrategyValidationService`
2. Retrieves strategy schema to check `riskName` and `riskList`
3. Validates each associated risk profile via `RiskValidationService`
4. Delegates to `PartialConnectionService`

**Sources:** [src/lib/services/global/PartialGlobalService.ts:77-201]()

---

## RiskGlobalService

RiskGlobalService coordinates portfolio-level risk management. It validates risk profiles and delegates position tracking to RiskConnectionService. (Not fully detailed in provided files, but follows the same pattern as PartialGlobalService.)

**Sources:** [src/lib/index.ts:122](), [src/lib/core/types.ts:38]()

---

## SizingGlobalService

SizingGlobalService coordinates position sizing calculations. It validates sizing configurations and delegates calculations to SizingConnectionService. (Not fully detailed in provided files, but follows the same pattern.)

**Sources:** [src/lib/index.ts:121](), [src/lib/core/types.ts:37]()

---

## OptimizerGlobalService

OptimizerGlobalService coordinates LLM-based strategy generation. It validates optimizer configurations and delegates code generation to OptimizerConnectionService. (Not fully detailed in provided files, but follows the same pattern.)

**Sources:** [src/lib/index.ts:123-125](), [src/lib/core/types.ts:39]()

---

## Integration with Client Classes

Global Services are primarily used by client classes during runtime execution, not by public API functions.

### Usage Pattern: ClientStrategy → PartialGlobalService

```mermaid
sequenceDiagram
    participant User
    participant ClientStrategy
    participant PartialGlobalService
    participant PartialConnectionService
    participant ClientPartial
    participant Events
    
    Note over User,Events: Signal monitoring in ClientStrategy.tick()
    
    User->>ClientStrategy: new ClientStrategy(params)
    Note over ClientStrategy: params.partial = PartialGlobalService (injected)
    
    ClientStrategy->>ClientStrategy: Monitor active signal
    Note over ClientStrategy: Calculate revenuePercent
    
    ClientStrategy->>PartialGlobalService: profit(symbol, data, currentPrice, 15.5, false, when)
    PartialGlobalService->>PartialGlobalService: Log operation
    PartialGlobalService->>PartialGlobalService: validate(strategyName) - memoized
    PartialGlobalService->>PartialConnectionService: profit(...)
    
    PartialConnectionService->>PartialConnectionService: getPartial(signalId, backtest) - memoized
    PartialConnectionService->>ClientPartial: profit(...)
    
    ClientPartial->>ClientPartial: Check profit levels (10%, 20%, ...)
    Note over ClientPartial: 10% already emitted, emit 20%
    
    ClientPartial->>Events: partialProfitSubject.next({level: 20, ...})
    Events-->>User: Event emitted to listeners
    
    ClientPartial-->>PartialConnectionService: complete
    PartialConnectionService-->>PartialGlobalService: complete
    PartialGlobalService-->>ClientStrategy: complete
```

**Purpose**: This sequence diagram shows the complete call chain from ClientStrategy through PartialGlobalService to ClientPartial. Global Services act as validated entry points, not as direct public APIs.

**Sources:** [src/lib/services/global/PartialGlobalService.ts:110-135](), [src/lib/services/connection/PartialConnectionService.ts:159-185](), [src/client/ClientPartial.ts:399-424]()

### Injection Pattern

Client classes receive Global Services via their constructor parameters:

```typescript
// From IStrategyParams interface (not shown but inferred)
interface IStrategyParams {
  partial: PartialGlobalService;  // Injected global service
  risk: RiskGlobalService;        // Injected global service
  sizing: SizingGlobalService;    // Injected global service
  // ...
}

// ClientStrategy uses injected services
class ClientStrategy {
  constructor(readonly params: IStrategyParams) {}
  
  async monitorSignal(...) {
    // Use injected PartialGlobalService
    if (revenuePercent > 0) {
      await this.params.partial.profit(symbol, data, currentPrice, revenuePercent, backtest, when);
    }
  }
}
```

**Key points:**
- Global Services are **injected** into client classes, not imported directly
- Client classes access them via `this.params.*GlobalService`
- Public API functions (`add*`, `list*`) do NOT use Global Services
- Global Services are runtime facades, not configuration APIs

**Sources:** [src/lib/services/global/PartialGlobalService.ts:40-54]()

---

## Service Registration

Global Services are registered in the dependency injection container during framework initialization.

### DI Registration

[src/lib/core/provide.ts:91-96]()

```typescript
{
    provide(TYPES.sizingGlobalService, () => new SizingGlobalService());
    provide(TYPES.riskGlobalService, () => new RiskGlobalService());
    provide(TYPES.optimizerGlobalService, () => new OptimizerGlobalService());
    provide(TYPES.partialGlobalService, () => new PartialGlobalService());
}
```

### Export Pattern

[src/lib/index.ts:120-129]()

```typescript
const globalServices = {
  sizingGlobalService: inject<SizingGlobalService>(TYPES.sizingGlobalService),
  riskGlobalService: inject<RiskGlobalService>(TYPES.riskGlobalService),
  optimizerGlobalService: inject<OptimizerGlobalService>(
    TYPES.optimizerGlobalService
  ),
  partialGlobalService: inject<PartialGlobalService>(
    TYPES.partialGlobalService
  ),
};
```

All services are included in the `backtest` export object [src/lib/index.ts:225-246](), making them accessible as:
- `backtest.sizingGlobalService`
- `backtest.riskGlobalService`
- `backtest.optimizerGlobalService`
- `backtest.partialGlobalService`

### TYPES Symbols

[src/lib/core/types.ts:36-41]()

```typescript
const globalServices = {
    sizingGlobalService: Symbol('sizingGlobalService'),
    riskGlobalService: Symbol('riskGlobalService'),
    optimizerGlobalService: Symbol('optimizerGlobalService'),
    partialGlobalService: Symbol('partialGlobalService'),
}
```

**Key aspects:**
- Each service has a unique Symbol identifier in TYPES
- Services are registered as factory functions via `provide()`
- Services are lazily initialized on first `inject()` call
- Singletons: Only one instance per service type

**Sources:** [src/lib/core/provide.ts:91-96](), [src/lib/core/types.ts:36-41](), [src/lib/index.ts:120-129]()

---

## Key Characteristics

Global Services exhibit these consistent patterns across the framework:

### Stateless Operation

Global Services maintain no state themselves. They delegate state management to:
- Schema Services (component configurations)
- Connection Services (memoized client instances)
- Client Classes (signal state, position tracking)

### Memoized Validation

Validation is memoized by component name to avoid redundant schema checks:

```typescript
// Pattern from RiskGlobalService
private validate = memoize(
  ([riskName]) => `${riskName}`,  // Cache key
  async (riskName: RiskName) => {
    this.loggerService.log("riskGlobalService validate", {
      riskName,
    });
    this.riskValidationService.validate(
      riskName,
      "riskGlobalService validate"
    );
  }
);
```

The cache key is the component name string. First invocation performs validation, subsequent calls return immediately.

**Sources:** [src/lib/services/global/RiskGlobalService.ts:31-42]()

### Consistent Logging

Every public method logs its invocation with context:

```typescript
public checkSignal = async (
  params: IRiskCheckArgs,
  context: { riskName: RiskName }
) => {
  this.loggerService.log("riskGlobalService checkSignal", {
    symbol: params.symbol,
    context,
  });
  await this.validate(context.riskName);
  return await this.riskConnectionService.checkSignal(params, context);
};
```

Log entries include:
- Service and method name (e.g., `"riskGlobalService checkSignal"`)
- Operation-specific context (symbol, component names)
- Structured data for debugging

**Sources:** [src/lib/services/global/RiskGlobalService.ts:51-61]()

### Single Responsibility

Each Global Service manages exactly one component type or execution mode:
- `RiskGlobalService` → Risk profiles only
- `StrategyGlobalService` → Strategies only  
- `BacktestGlobalService` → Backtest execution only
- `WalkerGlobalService` → Both walker components AND walker execution (special case)

**Sources:** [src/lib/index.ts:93-108]()

---

## Delegation Flow Summary

```mermaid
graph TB
    User["User Code"]
    
    subgraph "Global Services Layer"
        CompGlobal["Component Global Services<br/>Strategy, Exchange, Risk, etc."]
        ExecGlobal["Execution Global Services<br/>Backtest, Live"]
    end
    
    subgraph "Validation Layer"
        Validation["*ValidationService<br/>Schema validation<br/>Memoized checks"]
    end
    
    subgraph "Connection/Logic Layer"
        Connection["*ConnectionService<br/>Memoized client instances"]
        Logic["*LogicPublicService<br/>Context management"]
    end
    
    subgraph "Client Layer"
        Clients["Client Classes<br/>Business logic implementation"]
    end
    
    User -->|"Component operations"| CompGlobal
    User -->|"Execution operations"| ExecGlobal
    
    CompGlobal -->|"1. Validate"| Validation
    CompGlobal -->|"2. Delegate"| Connection
    
    ExecGlobal -->|"1. Validate"| Validation
    ExecGlobal -->|"2. Delegate"| Logic
    
    Connection --> Clients
    Logic --> Connection
    Connection -->|"Return results"| CompGlobal
    Logic -->|"Return results"| ExecGlobal
    
    CompGlobal -->|"Results"| User
    ExecGlobal -->|"Results"| User
```

**Purpose**: This diagram summarizes the complete delegation flow for both Component and Execution Global Services. Both types perform validation first, but Component services delegate to Connection Services while Execution services delegate to Logic Services.

**Sources:** [src/lib/services/global/RiskGlobalService.ts:15-114](), [src/lib/index.ts:93-132]()
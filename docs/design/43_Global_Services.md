# Global Services

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/classes/Backtest.ts](src/classes/Backtest.ts)
- [src/classes/Live.ts](src/classes/Live.ts)
- [src/classes/Walker.ts](src/classes/Walker.ts)
- [src/lib/services/connection/StrategyConnectionService.ts](src/lib/services/connection/StrategyConnectionService.ts)
- [src/lib/services/global/StrategyGlobalService.ts](src/lib/services/global/StrategyGlobalService.ts)

</details>



Global Services form Layer 1 of the service architecture, serving as public API entry points that orchestrate validation and delegate operations to lower-level services. These services provide a consistent interface for component registration, validation, and execution across the framework.

For information about the overall service layer organization, see [Service Architecture Overview](#7.1). For details on the services that Global Services delegate to, see [Connection Services](#7.2), [Schema Services](#7.3), [Validation Services](#7.4), and [Logic Services](#7.6).

---

## Service Categories

The framework provides two categories of Global Services, each serving distinct purposes in the architecture.

### Component Global Services

Component Global Services manage the lifecycle and access patterns for registered components (strategies, exchanges, frames, risk profiles, sizing configurations, walkers). Each component type has a corresponding Global Service:

| Global Service Class | Component Type | Primary Responsibilities |
|---------------------|----------------|-------------------------|
| `StrategyGlobalService` | Trading strategies | Validation orchestration, delegation to StrategyConnectionService |
| `ExchangeGlobalService` | Market data sources | Validation orchestration, delegation to ExchangeConnectionService |
| `FrameGlobalService` | Backtest timeframes | Validation orchestration, delegation to FrameConnectionService |
| `RiskGlobalService` | Risk profiles | Validation orchestration, position tracking delegation |
| `SizingGlobalService` | Position sizing | Validation orchestration, sizing calculation delegation |
| `WalkerGlobalService` | Strategy comparisons | Validation orchestration, multi-strategy execution |

### Execution Mode Global Services

Execution Mode Global Services provide entry points for running backtests and live trading:

| Global Service Class | Execution Mode | Primary Responsibilities |
|---------------------|----------------|-------------------------|
| `BacktestGlobalService` | Historical simulation | Delegates to BacktestLogicPublicService |
| `LiveGlobalService` | Real-time trading | Delegates to LiveLogicPublicService |
| `WalkerGlobalService` | Strategy comparison | Also serves as execution mode service |

**Sources:** [src/lib/index.ts:93-108](), [src/lib/core/types.ts:27-36](), [src/lib/core/provide.ts:70-79]()

---

## Global Service Architecture

```mermaid
graph TB
    subgraph "Public API Layer"
        AddFunctions["add* functions<br/>(addStrategy, addExchange, etc)"]
        BacktestAPI["Backtest.run()<br/>Backtest.background()"]
        LiveAPI["Live.run()<br/>Live.background()"]
        ListFunctions["list* functions<br/>(listStrategies, listRisks, etc)"]
    end
    
    subgraph "Global Services Layer"
        ComponentGlobal["Component Global Services<br/>StrategyGlobalService<br/>ExchangeGlobalService<br/>RiskGlobalService<br/>etc."]
        ExecutionGlobal["Execution Global Services<br/>BacktestGlobalService<br/>LiveGlobalService<br/>WalkerGlobalService"]
    end
    
    subgraph "Validation & Schema Layer"
        ValidationServices["*ValidationService<br/>Memoized validation<br/>Schema existence checks"]
        SchemaServices["*SchemaService<br/>ToolRegistry storage<br/>Schema retrieval"]
    end
    
    subgraph "Connection & Logic Layer"
        ConnectionServices["*ConnectionService<br/>Memoized client instances"]
        LogicServices["*LogicPublicService<br/>Context management<br/>Execution orchestration"]
    end
    
    subgraph "Client Layer"
        Clients["Client Classes<br/>ClientStrategy<br/>ClientExchange<br/>ClientRisk<br/>etc."]
    end
    
    AddFunctions --> ValidationServices
    AddFunctions --> SchemaServices
    ListFunctions --> ValidationServices
    
    BacktestAPI --> ExecutionGlobal
    LiveAPI --> ExecutionGlobal
    
    ComponentGlobal --> ValidationServices
    ComponentGlobal --> ConnectionServices
    ExecutionGlobal --> ValidationServices
    ExecutionGlobal --> LogicServices
    
    ConnectionServices --> SchemaServices
    ConnectionServices --> Clients
    
    style ComponentGlobal fill:#f9f9f9
    style ExecutionGlobal fill:#f9f9f9
```

**Purpose**: This diagram illustrates how Global Services act as an intermediary layer between public APIs and lower-level services. Component Global Services orchestrate validation and delegate to Connection Services, while Execution Global Services delegate to Logic Services.

**Sources:** [src/lib/index.ts:49-162](), [src/function/add.ts:50-62](), [src/lib/services/global/RiskGlobalService.ts:15-114]()

---

## Component Global Service Pattern

Component Global Services follow a consistent implementation pattern with three key responsibilities: dependency injection, validation orchestration, and operation delegation.

### Standard Structure

```mermaid
graph LR
    subgraph "RiskGlobalService Example"
        DI["Dependency Injection<br/>loggerService<br/>riskConnectionService<br/>riskValidationService"]
        Validate["validate() method<br/>Memoized by riskName<br/>Calls ValidationService"]
        PublicMethods["Public Methods<br/>checkSignal()<br/>addSignal()<br/>removeSignal()<br/>clear()"]
    end
    
    DI --> Validate
    Validate --> PublicMethods
    
    PublicMethods --> Log["1. Log operation"]
    Log --> CallValidate["2. await validate(riskName)"]
    CallValidate --> Delegate["3. Delegate to ConnectionService"]
```

**Purpose**: This diagram shows the standard implementation pattern for Component Global Services using RiskGlobalService as an example. All public methods follow the log-validate-delegate sequence.

**Sources:** [src/lib/services/global/RiskGlobalService.ts:15-114]()

### Dependency Injection Pattern

Component Global Services inject three types of dependencies:

```typescript
// Pattern from RiskGlobalService
private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
private readonly riskConnectionService = inject<RiskConnectionService>(
  TYPES.riskConnectionService
);
private readonly riskValidationService = inject<RiskValidationService>(
  TYPES.riskValidationService
);
```

| Dependency Type | Purpose | Usage Pattern |
|----------------|---------|---------------|
| `LoggerService` | Operation logging | Every public method logs entry with context |
| `*ConnectionService` | Client instance management | Delegate actual operations after validation |
| `*ValidationService` | Schema validation | Called by memoized `validate()` method |

**Sources:** [src/lib/services/global/RiskGlobalService.ts:16-22]()

### Validation Orchestration

The validation pattern uses memoization to avoid redundant schema checks:

```mermaid
sequenceDiagram
    participant Client
    participant RiskGlobalService
    participant MemoizedValidate
    participant RiskValidationService
    participant RiskConnectionService
    
    Client->>RiskGlobalService: checkSignal(params, {riskName})
    RiskGlobalService->>RiskGlobalService: loggerService.log()
    RiskGlobalService->>MemoizedValidate: validate(riskName)
    
    alt First call for riskName
        MemoizedValidate->>RiskValidationService: validate(riskName, source)
        RiskValidationService-->>MemoizedValidate: validation complete
        MemoizedValidate->>MemoizedValidate: Cache result
    else Cached
        MemoizedValidate->>MemoizedValidate: Return cached result
    end
    
    MemoizedValidate-->>RiskGlobalService: validated
    RiskGlobalService->>RiskConnectionService: checkSignal(params, context)
    RiskConnectionService-->>RiskGlobalService: result
    RiskGlobalService-->>Client: result
```

**Purpose**: This sequence diagram demonstrates the validation orchestration pattern. The first call to `validate()` for a given component name performs validation and caches the result. Subsequent calls return immediately from cache.

**Sources:** [src/lib/services/global/RiskGlobalService.ts:31-42](), [src/lib/services/global/RiskGlobalService.ts:51-61]()

### Implementation Example: RiskGlobalService

The `RiskGlobalService` exemplifies the Component Global Service pattern:

[src/lib/services/global/RiskGlobalService.ts:15-114]()

**Key methods:**

| Method | Parameters | Behavior |
|--------|-----------|----------|
| `validate()` | `riskName: RiskName` | Memoized validation call to `RiskValidationService.validate()` |
| `checkSignal()` | `params: IRiskCheckArgs`, `context: {riskName}` | Log → Validate → Delegate to `RiskConnectionService.checkSignal()` |
| `addSignal()` | `symbol: string`, `context: {strategyName, riskName}` | Log → Validate → Delegate to `RiskConnectionService.addSignal()` |
| `removeSignal()` | `symbol: string`, `context: {strategyName, riskName}` | Log → Validate → Delegate to `RiskConnectionService.removeSignal()` |
| `clear()` | `riskName?: RiskName` | Optional validation → Delegate to `RiskConnectionService.clear()` |

**Validation flow:**
1. Public method receives component name (e.g., `riskName`)
2. Calls `this.validate(riskName)` before operation
3. Memoized `validate()` checks if validation already performed
4. First call: delegates to `riskValidationService.validate(riskName, source)`
5. Subsequent calls: returns immediately (no-op)
6. After validation: delegates operation to Connection Service

**Sources:** [src/lib/services/global/RiskGlobalService.ts:31-61]()

---

## Integration with Public API

Global Services are used internally by the framework but can also be accessed directly through the exported `lib` object for advanced use cases.

### Direct Access Pattern

```mermaid
graph TB
    subgraph "Public API Functions"
        AddRisk["addRisk(schema)<br/>src/function/add.ts:329-341"]
        ListRisks["listRisks()<br/>src/function/list.ts:214-217"]
    end
    
    subgraph "Global Services (via lib export)"
        RiskGlobalService["lib.riskGlobalService<br/>checkSignal()<br/>addSignal()<br/>removeSignal()"]
    end
    
    subgraph "Lower Services (Direct)"
        RiskValidationService["backtest.riskValidationService<br/>addRisk()<br/>validate()"]
        RiskSchemaService["backtest.riskSchemaService<br/>register()"]
    end
    
    AddRisk --> RiskValidationService
    AddRisk --> RiskSchemaService
    ListRisks --> RiskValidationService
    
    RiskGlobalService --> RiskValidationService
    RiskGlobalService -.->|"Delegates to"| RiskConnectionService["RiskConnectionService"]
    
    TestCode["Test Code<br/>test/spec/risk.test.mjs"] --> RiskGlobalService
```

**Purpose**: This diagram shows how Global Services fit into the public API. The `add*` and `list*` functions bypass Global Services and access Validation/Schema services directly, while test code and advanced users can access Global Services through the `lib` export.

**Sources:** [src/function/add.ts:329-341](), [src/function/list.ts:214-217](), [test/spec/risk.test.mjs:67-92](), [src/lib/index.ts:152-162]()

### Test Usage Example

Tests demonstrate direct Global Service usage:

[test/spec/risk.test.mjs:67-92]()

```javascript
// Direct access via lib export
const { riskGlobalService } = lib;

// Add positions
await riskGlobalService.addSignal("BTCUSDT", { 
  strategyName: "test-strategy-1", 
  riskName: "test-max-positions" 
});

// Check risk limits
const result = await riskGlobalService.checkSignal(
  {
    symbol: "SOLUSDT",
    strategyName: "test-strategy-4",
    exchangeName: "binance",
    currentPrice: 100,
    timestamp: Date.now(),
  },
  { riskName: "test-max-positions" }
);
```

This pattern is useful for:
- Unit testing individual services
- Building custom orchestration logic
- Debugging component behavior
- Implementing advanced workflows

**Sources:** [test/spec/risk.test.mjs:41-93]()

---

## Execution Mode Global Services

Execution Mode Global Services differ from Component Global Services by delegating to Logic Services rather than Connection Services.

### BacktestGlobalService and LiveGlobalService

These services provide the entry points for `Backtest.run()` and `Live.run()` operations:

```mermaid
graph TB
    subgraph "Backtest Class"
        BacktestRun["Backtest.run(options)"]
        BacktestBackground["Backtest.background(options)"]
    end
    
    subgraph "BacktestGlobalService"
        BGS_Validate["validate()<br/>Checks strategy/exchange/frame"]
        BGS_Run["run()<br/>Delegates to BacktestLogicPublicService"]
    end
    
    subgraph "BacktestLogicPublicService"
        BLPS_Context["Wraps with MethodContextService"]
        BLPS_Delegate["Delegates to BacktestLogicPrivateService"]
    end
    
    subgraph "BacktestLogicPrivateService"
        BLPS_Execute["Executes backtest logic<br/>Timeframe iteration<br/>Signal processing"]
    end
    
    BacktestRun --> BGS_Validate
    BacktestBackground --> BGS_Validate
    BGS_Validate --> BGS_Run
    BGS_Run --> BLPS_Context
    BLPS_Context --> BLPS_Delegate
    BLPS_Delegate --> BLPS_Execute
```

**Purpose**: This diagram illustrates the delegation chain from Execution Mode Global Services through Logic Services. Unlike Component Global Services that delegate to Connection Services, these delegate to Logic Services which manage context propagation and execution orchestration.

**Sources:** [src/lib/index.ts:101-103](), [src/lib/core/types.ts:32-33]()

### WalkerGlobalService Dual Role

`WalkerGlobalService` serves both as a Component Global Service (for walker registration) and an Execution Mode Global Service (for multi-strategy comparison):

| Role | Methods | Delegation Target |
|------|---------|------------------|
| Component Service | `validate()` | `WalkerValidationService` |
| Execution Service | `run()` | `WalkerLogicPublicService` |

**Sources:** [src/lib/services/global/WalkerGlobalService.ts]() (not directly visible in provided files but inferred from pattern)

---

## Service Registration and Discovery

Global Services are registered in the dependency injection container and made available through the `backtest` export.

### Registration Pattern

[src/lib/core/provide.ts:70-79]()

```typescript
{
    provide(TYPES.exchangeGlobalService, () => new ExchangeGlobalService());
    provide(TYPES.strategyGlobalService, () => new StrategyGlobalService());
    provide(TYPES.frameGlobalService, () => new FrameGlobalService());
    provide(TYPES.liveGlobalService, () => new LiveGlobalService());
    provide(TYPES.backtestGlobalService, () => new BacktestGlobalService());
    provide(TYPES.walkerGlobalService, () => new WalkerGlobalService());
    provide(TYPES.sizingGlobalService, () => new SizingGlobalService());
    provide(TYPES.riskGlobalService, () => new RiskGlobalService());
}
```

### Export Pattern

[src/lib/index.ts:93-108]()

```typescript
const globalServices = {
  exchangeGlobalService: inject<ExchangeGlobalService>(
    TYPES.exchangeGlobalService
  ),
  strategyGlobalService: inject<StrategyGlobalService>(
    TYPES.strategyGlobalService
  ),
  frameGlobalService: inject<FrameGlobalService>(
    TYPES.frameGlobalService
  ),
  liveGlobalService: inject<LiveGlobalService>(
    TYPES.liveGlobalService
  ),
  backtestGlobalService: inject<BacktestGlobalService>(
    TYPES.backtestGlobalService
  ),
  walkerGlobalService: inject<WalkerGlobalService>(
    TYPES.walkerGlobalService
  ),
  sizingGlobalService: inject<SizingGlobalService>(
    TYPES.sizingGlobalService
  ),
  riskGlobalService: inject<RiskGlobalService>(
    TYPES.riskGlobalService
  ),
};
```

All services are included in the `backtest` export object [src/lib/index.ts:152-162](), making them accessible as `backtest.riskGlobalService`, `backtest.strategyGlobalService`, etc.

**Sources:** [src/lib/core/provide.ts:70-79](), [src/lib/core/types.ts:27-36](), [src/lib/index.ts:93-162]()

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
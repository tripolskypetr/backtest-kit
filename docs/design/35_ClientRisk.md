# ClientRisk

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/client/ClientStrategy.ts](src/client/ClientStrategy.ts)
- [src/interfaces/Strategy.interface.ts](src/interfaces/Strategy.interface.ts)
- [test/e2e/defend.test.mjs](test/e2e/defend.test.mjs)
- [test/e2e/partial.test.mjs](test/e2e/partial.test.mjs)
- [test/index.mjs](test/index.mjs)
- [types.d.ts](types.d.ts)

</details>



This page documents the `ClientRisk` class, which implements portfolio-level risk management by tracking active positions across strategies and executing custom validation logic. For information about the risk schema registration and validation services, see [Risk Schemas](#5.4) and [Risk Management](#12). For information about risk validation services in the service layer, see [Validation Services](#7.4).

## Purpose and Scope

`ClientRisk` is a client class that provides portfolio-level risk management without dependency injection. It tracks active positions across multiple strategies sharing the same risk profile, executes custom validation functions, and provides crash-safe persistence of position state. The class is instantiated once per `riskName` and used by multiple `ClientStrategy` instances to ensure consistent risk limits across the portfolio.

Sources: [src/client/ClientRisk.ts:48-73]()

## Core Responsibilities

`ClientRisk` implements the `IRisk` interface and provides three primary operations:

| Method | Purpose | Called By |
|--------|---------|-----------|
| `checkSignal(params)` | Validates if a new position should be allowed based on custom validations | `ClientStrategy` before signal creation |
| `addSignal(symbol, context)` | Registers a newly opened position | `StrategyConnectionService` after signal opens |
| `removeSignal(symbol, context)` | Removes a closed position | `StrategyConnectionService` after signal closes |

All operations are asynchronous and support persistence for crash recovery in live trading mode.

Sources: [src/client/ClientRisk.ts:152-217](), [src/interfaces/Risk.interface.ts:115-139]()

## Architecture Overview

```mermaid
graph TB
    subgraph "Service Layer"
        RiskGlobalService["RiskGlobalService"]
        RiskConnectionService["RiskConnectionService<br/>Memoized instance management"]
        RiskSchemaService["RiskSchemaService<br/>Schema registry"]
    end
    
    subgraph "Client Layer"
        ClientRisk["ClientRisk<br/>Portfolio tracking<br/>Validation execution"]
        
        subgraph "Internal State"
            ActivePositions["_activePositions: Map<br/>Key: strategyName:symbol<br/>Value: IRiskActivePosition"]
            InitSymbol["POSITION_NEED_FETCH<br/>Lazy init marker"]
        end
        
        ClientRisk --> ActivePositions
        ClientRisk --> InitSymbol
    end
    
    subgraph "Persistence Layer"
        PersistRiskAdapter["PersistRiskAdapter<br/>Atomic file writes"]
        PersistBase["PersistBase<br/>Abstract base class"]
        
        PersistRiskAdapter --> PersistBase
    end
    
    subgraph "Strategy Execution"
        ClientStrategy["ClientStrategy<br/>Calls checkSignal<br/>before signal creation"]
    end
    
    RiskGlobalService --> RiskConnectionService
    RiskConnectionService --> RiskSchemaService
    RiskConnectionService --> ClientRisk
    
    ClientStrategy --> RiskGlobalService
    
    ClientRisk --> PersistRiskAdapter
    
    style ClientRisk fill:#f0e1ff
    style ActivePositions fill:#e1ffe1
    style PersistRiskAdapter fill:#e1ffe1
```

**Key Integration Points:**

- `RiskConnectionService` creates and memoizes `ClientRisk` instances (one per `riskName`)
- `ClientStrategy` calls risk checks before generating new signals
- `PersistRiskAdapter` provides crash-safe persistence for live mode
- Multiple strategies can share the same `ClientRisk` instance for cross-strategy limits

Sources: [src/client/ClientRisk.ts:1-89](), [src/lib/services/connection/RiskConnectionService.ts:41-65](), [src/lib/services/global/RiskGlobalService.ts:15-42]()

## Position Tracking Mechanism

### Active Position Storage

`ClientRisk` maintains a `Map` of active positions with a composite key pattern:

```typescript
// Key pattern: strategyName:symbol
const GET_KEY_FN = (strategyName: string, symbol: string) => `${strategyName}:${symbol}`;
```

Each entry stores:

```typescript
interface IRiskActivePosition {
  signal: ISignalRow;        // Signal details (null for tracking-only)
  strategyName: string;       // Strategy owning the position
  exchangeName: string;       // Exchange name
  openTimestamp: number;      // When position was opened
}
```

Sources: [src/client/ClientRisk.ts:20-28](), [src/interfaces/Risk.interface.ts:23-35]()

### Lazy Initialization Pattern

The `_activePositions` field uses a special initialization pattern:

```mermaid
stateDiagram-v2
    [*] --> POSITION_NEED_FETCH: Constructor
    POSITION_NEED_FETCH --> Loading: First operation called
    Loading --> Initialized: waitForInit completes
    Initialized --> Initialized: All subsequent operations
    
    note right of POSITION_NEED_FETCH
        Symbol indicates<br/>lazy initialization
    end note
    
    note right of Loading
        Calls PersistRiskAdapter<br/>readPositionData
    end note
    
    note right of Initialized
        _activePositions is Map<br/>with restored data
    end note
```

**Implementation Details:**

| State | Type | Meaning |
|-------|------|---------|
| `POSITION_NEED_FETCH` | `Symbol` | Initial state, positions not yet loaded |
| `Map<string, IRiskActivePosition>` | `Map` | Initialized state with position data |

The `waitForInit` method uses `singleshot` pattern to ensure initialization happens exactly once:

```typescript
private waitForInit = singleshot(async () => await WAIT_FOR_INIT_FN(this));
```

Sources: [src/client/ClientRisk.ts:79-88](), [src/client/ClientRisk.ts:53-59]()

## Risk Validation Flow

### Signal Check Process

```mermaid
sequenceDiagram
    participant CS as ClientStrategy
    participant RGS as RiskGlobalService
    participant RCS as RiskConnectionService
    participant CR as ClientRisk
    participant PRA as PersistRiskAdapter
    
    CS->>RGS: checkSignal(IRiskCheckArgs)
    RGS->>RCS: checkSignal(params, context)
    RCS->>CR: checkSignal(params)
    
    alt _activePositions === POSITION_NEED_FETCH
        CR->>CR: waitForInit()
        CR->>PRA: readPositionData(riskName)
        PRA-->>CR: Array of positions
        CR->>CR: _activePositions = new Map(data)
    end
    
    CR->>CR: Build IRiskValidationPayload<br/>with activePositionCount<br/>and activePositions
    
    loop For each validation
        CR->>CR: Execute validation function
        alt Validation throws error
            CR->>CR: isValid = false, break
        end
    end
    
    alt isValid === false
        CR->>CS: onRejected callback
        CR-->>CS: return false
    else isValid === true
        CR->>CS: onAllowed callback
        CR-->>CS: return true
    end
```

Sources: [src/client/ClientRisk.ts:165-217]()

### Validation Execution

Custom validations receive `IRiskValidationPayload` with complete portfolio state:

| Field | Source | Purpose |
|-------|--------|---------|
| `symbol` | `IRiskCheckArgs` | Trading pair being validated |
| `strategyName` | `IRiskCheckArgs` | Strategy requesting position |
| `exchangeName` | `IRiskCheckArgs` | Exchange for position |
| `currentPrice` | `IRiskCheckArgs` | Current VWAP price |
| `timestamp` | `IRiskCheckArgs` | Current timestamp |
| `activePositionCount` | `ClientRisk` | Number of active positions |
| `activePositions` | `ClientRisk` | Full list of active positions |

**Validation Function Wrapper:**

The `DO_VALIDATION_FN` wrapper provides error handling:

```typescript
const DO_VALIDATION_FN = trycatch(
  async (validation: IRiskValidationFn, params: IRiskValidationPayload) => {
    await validation(params);
    return true;  // Validation passed
  },
  {
    defaultValue: false,  // Validation failed
    fallback: (error) => {
      // Log error and emit to validationSubject
    }
  }
);
```

Sources: [src/client/ClientRisk.ts:30-46](), [src/interfaces/Risk.interface.ts:52-60]()

## Position Management

### Adding Positions

```mermaid
graph LR
    A["addSignal called"] --> B["Check if initialized"]
    B --> C["waitForInit if needed"]
    C --> D["Generate key:<br/>strategyName:symbol"]
    D --> E["Add to _activePositions Map"]
    E --> F["_updatePositions"]
    F --> G["PersistRiskAdapter.writePositionData"]
    G --> H["Return"]
    
    style E fill:#e1ffe1
    style G fill:#e1ffe1
```

**Key Pattern Ensures Uniqueness:**

- Each strategy can have one position per symbol
- Different strategies can have positions in the same symbol
- Example: `"strategy1:BTCUSDT"` and `"strategy2:BTCUSDT"` are separate positions

Sources: [src/client/ClientRisk.ts:107-128]()

### Removing Positions

```mermaid
graph LR
    A["removeSignal called"] --> B["Check if initialized"]
    B --> C["waitForInit if needed"]
    C --> D["Generate key:<br/>strategyName:symbol"]
    D --> E["Delete from _activePositions Map"]
    E --> F["_updatePositions"]
    F --> G["PersistRiskAdapter.writePositionData"]
    G --> H["Return"]
    
    style E fill:#ffe1e1
    style G fill:#e1ffe1
```

Sources: [src/client/ClientRisk.ts:134-150]()

## Persistence and Crash Recovery

### Persistence Architecture

```mermaid
graph TB
    subgraph "In-Memory State"
        ActiveMap["_activePositions: Map<br/>strategyName:symbol -> IRiskActivePosition"]
    end
    
    subgraph "Persistence Adapter"
        PRA["PersistRiskAdapter"]
        
        subgraph "Operations"
            Write["writePositionData<br/>Array.from(Map)"]
            Read["readPositionData<br/>returns Array"]
        end
        
        PRA --> Write
        PRA --> Read
    end
    
    subgraph "PersistBase Implementation"
        FileSystem["Default: Atomic file writes<br/>risk-{riskName}.json"]
        Custom["Custom: User-provided adapter<br/>Redis, MongoDB, etc."]
    end
    
    ActiveMap --> Write
    Read --> ActiveMap
    
    Write --> FileSystem
    Write --> Custom
    Read --> FileSystem
    Read --> Custom
    
    style ActiveMap fill:#fff4e1
    style FileSystem fill:#e1ffe1
    style Custom fill:#e1f5ff
```

**Data Format:**

Positions are converted between `Map` and `Array` for serialization:

```typescript
// Writing: Map -> Array
await PersistRiskAdapter.writePositionData(
  Array.from(<RiskMap>this._activePositions),
  this.params.riskName
);

// Reading: Array -> Map
const persistedPositions = await PersistRiskAdapter.readPositionData(riskName);
this._activePositions = new Map(persistedPositions);
```

Sources: [src/client/ClientRisk.ts:93-101](), [src/client/ClientRisk.ts:53-59]()

### Crash Recovery Process

```mermaid
sequenceDiagram
    participant App as Application Restart
    participant CR as ClientRisk
    participant Init as waitForInit
    participant PRA as PersistRiskAdapter
    participant FS as File System
    
    App->>CR: First operation<br/>(checkSignal, addSignal, etc.)
    CR->>CR: Check: _activePositions === POSITION_NEED_FETCH?
    CR->>Init: waitForInit() [singleshot]
    Init->>PRA: readPositionData(riskName)
    PRA->>FS: Read risk-{riskName}.json
    
    alt File exists
        FS-->>PRA: JSON data
        PRA-->>Init: Array of [key, position] tuples
    else File not found
        FS-->>PRA: Error
        PRA-->>Init: Empty array []
    end
    
    Init->>CR: _activePositions = new Map(data)
    CR-->>App: Continue with operation
    
    note over Init,PRA: Singleshot ensures<br/>this only runs once
```

**Isolation by Risk Name:**

Each `riskName` has isolated persistence:

| Risk Name | File Path | Isolated State |
|-----------|-----------|----------------|
| `"conservative"` | `risk-conservative.json` | Separate Map |
| `"aggressive"` | `risk-aggressive.json` | Separate Map |
| `"moderate"` | `risk-moderate.json` | Separate Map |

Sources: [src/client/ClientRisk.ts:53-59](), [test/spec/risk.test.mjs:756-841]()

## Data Flow Diagram

```mermaid
graph TB
    subgraph "Signal Generation"
        GetSignal["strategy.getSignal"]
        ValidateSignal["VALIDATE_SIGNAL_FN"]
    end
    
    subgraph "Risk Check"
        CheckSignal["ClientRisk.checkSignal"]
        BuildPayload["Build IRiskValidationPayload<br/>+ activePositionCount<br/>+ activePositions array"]
        RunValidations["Execute custom validations"]
        Decision{"All validations<br/>passed?"}
    end
    
    subgraph "Position Updates"
        AddSignal["ClientRisk.addSignal<br/>On signal opened"]
        RemoveSignal["ClientRisk.removeSignal<br/>On signal closed"]
        UpdatePositions["_updatePositions<br/>Persist to disk"]
    end
    
    subgraph "Persistence"
        PersistWrite["PersistRiskAdapter.writePositionData"]
        PersistRead["PersistRiskAdapter.readPositionData"]
        AtomicFile["Atomic file write<br/>risk-{riskName}.json"]
    end
    
    GetSignal --> ValidateSignal
    ValidateSignal --> CheckSignal
    CheckSignal --> BuildPayload
    BuildPayload --> RunValidations
    RunValidations --> Decision
    
    Decision -->|Yes| AddSignal
    Decision -->|No| Rejected["Return false<br/>onRejected callback"]
    
    AddSignal --> UpdatePositions
    RemoveSignal --> UpdatePositions
    UpdatePositions --> PersistWrite
    PersistWrite --> AtomicFile
    
    AtomicFile -.->|On restart| PersistRead
    PersistRead -.-> CheckSignal
    
    style BuildPayload fill:#fff4e1
    style UpdatePositions fill:#e1ffe1
    style AtomicFile fill:#e1ffe1
```

**Payload Construction:**

The `checkSignal` method constructs the validation payload by combining:

1. **Passthrough arguments** from `IRiskCheckArgs` (symbol, strategyName, exchangeName, currentPrice, timestamp)
2. **Portfolio state** from `_activePositions` Map (activePositionCount, activePositions array)

Sources: [src/client/ClientRisk.ts:165-181]()

## Key Implementation Details

### Memoization in RiskConnectionService

`ClientRisk` instances are created once per `riskName` and cached:

```typescript
public getRisk = memoize(
  ([riskName]) => `${riskName}`,
  (riskName: RiskName) => {
    const schema = this.riskSchemaService.get(riskName);
    return new ClientRisk({
      ...schema,
      logger: this.loggerService,
    });
  }
);
```

**Implications:**

- Multiple strategies sharing a `riskName` use the same `ClientRisk` instance
- Position tracking is shared across all strategies with the same risk profile
- Validation state is consistent for all strategies in the risk group

Sources: [src/lib/services/connection/RiskConnectionService.ts:56-65]()

### Validation Function Types

Two validation formats are supported:

**Object Format:**

```typescript
{
  validate: (payload: IRiskValidationPayload) => {
    if (payload.activePositionCount >= 5) {
      throw new Error("Max 5 positions");
    }
  },
  note: "Limit to 5 concurrent positions"
}
```

**Function Format:**

```typescript
(payload: IRiskValidationPayload) => {
  if (payload.activePositionCount >= 5) {
    throw new Error("Max 5 positions");
  }
}
```

Both are normalized during execution:

```typescript
for (const validation of this.params.validations) {
  await DO_VALIDATION_FN(
    typeof validation === "function" 
      ? validation 
      : validation.validate,
    payload
  );
}
```

Sources: [src/client/ClientRisk.ts:186-200](), [src/interfaces/Risk.interface.ts:64-85]()

### Error Handling Strategy

**Validation Errors:**

- Validation functions throw errors to reject signals
- `DO_VALIDATION_FN` wrapper catches errors and returns `false`
- Errors are logged and emitted to `validationSubject`
- First validation failure short-circuits remaining validations

**Persistence Errors:**

- Read failures during initialization return empty array (no crash)
- Write failures propagate to caller (operation fails, state remains consistent)

Sources: [src/client/ClientRisk.ts:30-46](), [test/spec/risk.test.mjs:498-520]()

### Position Key Uniqueness

The composite key pattern ensures:

| Component | Purpose |
|-----------|---------|
| `strategyName` | Allows multiple strategies to track the same symbol |
| `:` separator | Delimiter between components |
| `symbol` | Trading pair identifier |

**Example Keys:**

```
"momentum-1m:BTCUSDT"
"mean-reversion:BTCUSDT"
"momentum-1m:ETHUSDT"
```

This allows:
- `momentum-1m` and `mean-reversion` to both hold `BTCUSDT` positions
- Each strategy-symbol combination counted separately
- Risk limits applied to total across all keys

Sources: [src/client/ClientRisk.ts:27-28](), [test/spec/risk.test.mjs:439-496]()
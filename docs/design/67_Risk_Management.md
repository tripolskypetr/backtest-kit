# Risk Management

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [README.md](README.md)
- [src/client/ClientStrategy.ts](src/client/ClientStrategy.ts)
- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/index.ts](src/index.ts)
- [src/interfaces/Strategy.interface.ts](src/interfaces/Strategy.interface.ts)
- [test/e2e/defend.test.mjs](test/e2e/defend.test.mjs)
- [test/index.mjs](test/index.mjs)
- [types.d.ts](types.d.ts)

</details>



The risk management system enforces portfolio-level constraints and validation rules that prevent signals from opening when they violate risk parameters. Risk profiles are defined via `addRisk()` and referenced by strategies using `riskName` or `riskList`. The system tracks active positions across all strategies and evaluates custom validation functions before allowing new signals to open.

For signal lifecycle information, see [Signal Lifecycle](#8). For strategy configuration, see [Strategy Schemas](#5.1). For event monitoring, see [Event Listeners](#4.8).

## Risk Profile Configuration

Risk profiles are registered via `addRisk()` and define a set of validation rules that signals must pass before opening. Each risk profile has a unique `riskName` identifier.

### IRiskSchema Interface

```typescript
interface IRiskSchema {
  riskName: string;                              // Unique identifier
  note?: string;                                 // Optional documentation
  callbacks?: Partial<IRiskCallbacks>;           // onRejected, onAllowed
  validations: (IRiskValidation | IRiskValidationFn)[];  // Validation chain
}
```

Strategies reference risk profiles using `riskName` (single profile) or `riskList` (multiple profiles that must all pass).

### Validation Chain Structure

The `validations` array can contain either `IRiskValidation` objects (with `validate` function and optional `note`) or raw validation functions (`IRiskValidationFn`).

```typescript
interface IRiskValidation {
  validate: IRiskValidationFn;  // Function that throws on failure
  note?: string;                // Documentation for this validation
}

type IRiskValidationFn = (payload: IRiskValidationPayload) => void | Promise<void>;
```

Validation functions receive `IRiskValidationPayload` containing complete context about the signal and portfolio state.

**Sources**: [types.d.ts:417-426](), [types.d.ts:402-412](), [types.d.ts:395-397]()

## Risk Validation Payload

The payload passed to validation functions contains both signal details and portfolio state.

```mermaid
graph TB
    subgraph "IRiskCheckArgs (Signal Context)"
        A1["symbol: string"]
        A2["pendingSignal: ISignalDto"]
        A3["strategyName: StrategyName"]
        A4["exchangeName: ExchangeName"]
        A5["currentPrice: number"]
        A6["timestamp: number"]
    end
    
    subgraph "IRiskValidationPayload (Extended)"
        B1["...IRiskCheckArgs<br/>(all signal context)"]
        B2["activePositionCount: number"]
        B3["activePositions: IRiskActivePosition[]"]
    end
    
    subgraph "IRiskActivePosition (Portfolio State)"
        C1["signal: ISignalRow"]
        C2["strategyName: string"]
        C3["exchangeName: string"]
        C4["openTimestamp: number"]
    end
    
    A1 --> B1
    A2 --> B1
    A3 --> B1
    A4 --> B1
    A5 --> B1
    A6 --> B1
    
    B3 --> C1
    B3 --> C2
    B3 --> C3
    B3 --> C4
    
    B1 -.inherits.-> A1
    
    style B1 fill:#f9f9f9,stroke:#333,stroke-width:2px
```

### Payload Fields

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | `string` | Trading pair (e.g., "BTCUSDT") |
| `pendingSignal` | `ISignalDto` | Signal attempting to open |
| `strategyName` | `StrategyName` | Strategy requesting signal |
| `exchangeName` | `ExchangeName` | Exchange being used |
| `currentPrice` | `number` | Current VWAP price |
| `timestamp` | `number` | Unix timestamp (ms) |
| `activePositionCount` | `number` | Number of currently active positions |
| `activePositions` | `IRiskActivePosition[]` | Details of all active positions |

Validation functions throw `Error` to reject signals. The error message becomes the rejection reason logged to `riskSubject`.

**Sources**: [types.d.ts:343-356](), [types.d.ts:383-390](), [types.d.ts:360-369]()

## Risk Validation Flow

The risk validation system integrates with the signal lifecycle at two critical points: signal generation and scheduled signal activation.

```mermaid
stateDiagram-v2
    [*] --> GetSignal: "Strategy.getSignal()"
    
    GetSignal --> ValidateDto: "ISignalDto returned"
    
    ValidateDto --> CheckRisk1: "Signal structure valid"
    
    state CheckRisk1 {
        [*] --> LoadRisks: "Load risk profiles"
        LoadRisks --> RunValidations: "Execute validation chain"
        RunValidations --> CheckCount: "Check activePositionCount"
        CheckCount --> CheckCustom: "Run custom validations"
        CheckCustom --> [*]: "All validations passed"
    }
    
    CheckRisk1 --> Rejected1: "Validation throws Error"
    CheckRisk1 --> CreateScheduled: "Validation passed"
    
    CreateScheduled --> ScheduledState: "priceOpen specified"
    CreateScheduled --> OpenedState: "priceOpen omitted"
    
    ScheduledState --> CheckActivation: "Price reaches priceOpen"
    
    state CheckActivation {
        [*] --> CheckRisk2: "Re-validate at activation"
        CheckRisk2 --> [*]: "Risk check passed"
    }
    
    CheckActivation --> Rejected2: "Risk check failed"
    CheckActivation --> OpenedState: "Risk check passed"
    
    OpenedState --> AddPosition: "Risk.addSignal()"
    
    AddPosition --> ActiveMonitoring: "Position tracking active"
    
    ActiveMonitoring --> RemovePosition: "Signal closes"
    
    RemovePosition --> [*]: "Risk.removeSignal()"
    
    Rejected1 --> EmitRiskEvent: "riskSubject.next()"
    Rejected2 --> EmitRiskEvent
    
    EmitRiskEvent --> [*]: "listenRisk callbacks fired"
    
    note right of CheckRisk1
        ClientStrategy.GET_SIGNAL_FN
        Lines 376-387
        not(risk.checkSignal())
    end note
    
    note right of CheckActivation
        ClientStrategy.ACTIVATE_SCHEDULED_SIGNAL_FN
        Lines 712-729
        Re-check at activation time
    end note
    
    note right of AddPosition
        ClientRisk.addSignal()
        Updates _activePositionsMap
        Persists to PersistRiskAdapter
    end note
```

### Two-Stage Risk Checking

Risk validation occurs **twice** for scheduled signals:

1. **Initial Check**: When `getSignal()` returns signal with `priceOpen` ([src/client/ClientStrategy.ts:376-387]())
2. **Activation Check**: When price reaches `priceOpen` ([src/client/ClientStrategy.ts:712-729]())

This dual-check prevents race conditions where portfolio state changes between signal creation and activation.

**Sources**: [src/client/ClientStrategy.ts:376-387](), [src/client/ClientStrategy.ts:712-729]()

## ClientRisk Implementation

`ClientRisk` implements the `IRisk` interface and manages portfolio-wide position tracking.

```mermaid
graph TB
    subgraph "ClientRisk Internal State"
        MAP["_activePositionsMap<br/>Map&lt;string, IRiskActivePosition&gt;<br/>Key: symbol:strategyName:riskName"]
        PERSIST["PersistRiskAdapter<br/>./dump/data/risk/{riskName}.json"]
    end
    
    subgraph "Public Methods"
        CHECK["checkSignal(params)<br/>Validates against all rules<br/>Returns boolean"]
        ADD["addSignal(symbol, context)<br/>Adds to _activePositionsMap<br/>Persists to disk"]
        REMOVE["removeSignal(symbol, context)<br/>Removes from _activePositionsMap<br/>Persists to disk"]
    end
    
    subgraph "Validation Execution"
        LOAD["Load activePositions from Map"]
        RUN["Run validations array"]
        CATCH["Catch validation errors"]
        EMIT["Emit to riskSubject"]
        CALLBACK["Call onRejected callback"]
    end
    
    CHECK --> LOAD
    LOAD --> RUN
    RUN --> CATCH
    CATCH --> EMIT
    CATCH --> CALLBACK
    CATCH --> RETURN_FALSE["Return false"]
    
    RUN --> RETURN_TRUE["Return true<br/>(no errors)"]
    
    ADD --> MAP
    MAP --> PERSIST
    
    REMOVE --> MAP
    MAP --> PERSIST
    
    style MAP fill:#f9f9f9,stroke:#333,stroke-width:2px
    style PERSIST fill:#e1ffe1,stroke:#333,stroke-width:2px
```

### Position Tracking Key Format

Active positions are tracked using composite keys:

```
{symbol}:{strategyName}:{riskName}
```

Example: `"BTCUSDT:my-strategy:demo-risk"`

This allows:
- Multiple strategies on same symbol with different risk profiles
- Same strategy on different symbols
- Multiple risk profiles per strategy (via `riskList`)

### Method Signatures

```typescript
interface IRisk {
  checkSignal(params: IRiskCheckArgs): Promise<boolean>;
  addSignal(symbol: string, context: { strategyName: string; riskName: string }): Promise<void>;
  removeSignal(symbol: string, context: { strategyName: string; riskName: string }): Promise<void>;
}
```

**Sources**: [types.d.ts:453-481](), [src/client/ClientRisk.ts]()

## Persistence and Recovery

Active positions are persisted to disk to survive process crashes in live mode.

```mermaid
graph LR
    subgraph "Live Mode Crash Recovery"
        CRASH["Process crashes"]
        RESTART["Live.background restarts"]
        LOAD["PersistRiskAdapter.readPositionData"]
        RESTORE["_activePositionsMap restored"]
    end
    
    subgraph "Position State Files"
        FILE1["./dump/data/risk/risk1.json"]
        FILE2["./dump/data/risk/risk2.json"]
        FILE3["./dump/data/risk/risk3.json"]
    end
    
    subgraph "File Contents (RiskData)"
        STRUCTURE["Record&lt;EntityId, IRiskActivePosition&gt;<br/><br/>EntityId = symbol:strategyName:riskName<br/><br/>IRiskActivePosition:<br/>- signal: ISignalRow<br/>- strategyName: string<br/>- exchangeName: string<br/>- openTimestamp: number"]
    end
    
    CRASH --> RESTART
    RESTART --> LOAD
    LOAD --> FILE1
    LOAD --> FILE2
    LOAD --> FILE3
    FILE1 --> STRUCTURE
    LOAD --> RESTORE
    
    style FILE1 fill:#e1ffe1,stroke:#333,stroke-width:2px
    style STRUCTURE fill:#f9f9f9,stroke:#333,stroke-width:2px
```

### Atomic Persistence Pattern

Position changes are written atomically using `PersistRiskAdapter`:

1. Write to temporary file: `{riskName}.json.tmp`
2. `fsync()` to ensure disk write
3. Atomic rename: `{riskName}.json.tmp` → `{riskName}.json`

This prevents partial writes during crashes.

### Backtest vs Live Mode

- **Backtest**: No persistence (in-memory only for speed)
- **Live**: Full persistence after every `addSignal`/`removeSignal`

**Sources**: [src/classes/Persist.ts](), [types.d.ts:431-448]()

## Event System for Risk Rejections

Risk rejections emit events to `riskSubject` for monitoring and alerting.

```mermaid
sequenceDiagram
    participant Strategy as "ClientStrategy"
    participant Risk as "ClientRisk"
    participant Emit as "riskSubject"
    participant Listener as "listenRisk callbacks"
    
    Strategy->>Risk: checkSignal(params)
    
    Risk->>Risk: Run validation chain
    
    alt Validation throws Error
        Risk->>Risk: Catch error
        Risk->>Risk: Extract error.message
        Risk->>Risk: Call onRejected callback
        Risk->>Emit: riskSubject.next(RiskContract)
        Emit->>Listener: Notify all subscribers
        Risk-->>Strategy: return false
    else All validations pass
        Risk->>Risk: Call onAllowed callback
        Risk-->>Strategy: return true
    end
    
    Note over Emit: RiskContract contains:<br/>- symbol<br/>- pendingSignal<br/>- strategyName<br/>- exchangeName<br/>- currentPrice<br/>- activePositionCount<br/>- comment (rejection reason)<br/>- timestamp
```

### RiskContract Structure

Events emitted to `riskSubject` contain:

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | `string` | Trading pair |
| `pendingSignal` | `ISignalDto` | Rejected signal |
| `strategyName` | `StrategyName` | Strategy that generated signal |
| `exchangeName` | `ExchangeName` | Exchange being used |
| `currentPrice` | `number` | Current VWAP price |
| `activePositionCount` | `number` | Active positions at rejection time |
| `comment` | `string` | Rejection reason (from validation `note` or error message) |
| `timestamp` | `number` | Unix timestamp (ms) |

### Event Listener Functions

```typescript
// Continuous monitoring
const unsubscribe = listenRisk((event) => {
  console.log(`[RISK] ${event.symbol} rejected: ${event.comment}`);
  console.log(`Active positions: ${event.activePositionCount}`);
});

// Wait for first rejection matching filter
listenRiskOnce(
  (event) => event.symbol === "BTCUSDT",
  (event) => console.log("BTCUSDT signal rejected!")
);
```

**Sources**: [src/function/event.ts:924-968](), [src/config/emitters.ts:131](), [src/contract/Risk.contract.ts]()

## Common Risk Validation Patterns

### Maximum Concurrent Positions

Limit total number of active positions across all strategies:

```typescript
addRisk({
  riskName: "max-3-positions",
  validations: [
    ({ activePositionCount }) => {
      if (activePositionCount >= 3) {
        throw new Error("Max 3 concurrent positions exceeded");
      }
    }
  ]
});
```

### Minimum Take Profit Distance

Ensure TP is sufficiently far from entry to cover fees:

```typescript
addRisk({
  riskName: "min-tp-distance",
  validations: [
    ({ pendingSignal, currentPrice }) => {
      const { priceOpen = currentPrice, priceTakeProfit, position } = pendingSignal;
      
      const tpDistance = position === "long"
        ? ((priceTakeProfit - priceOpen) / priceOpen) * 100
        : ((priceOpen - priceTakeProfit) / priceOpen) * 100;
      
      if (tpDistance < 1.0) {
        throw new Error(`TP too close: ${tpDistance.toFixed(2)}%`);
      }
    }
  ]
});
```

### Risk/Reward Ratio

Enforce minimum R/R ratio (e.g., 2:1):

```typescript
addRisk({
  riskName: "min-rr-2to1",
  validations: [
    ({ pendingSignal, currentPrice }) => {
      const { priceOpen = currentPrice, priceTakeProfit, priceStopLoss, position } = pendingSignal;
      
      const reward = position === "long"
        ? priceTakeProfit - priceOpen
        : priceOpen - priceTakeProfit;
      
      const risk = position === "long"
        ? priceOpen - priceStopLoss
        : priceStopLoss - priceOpen;
      
      if (reward / risk < 2.0) {
        throw new Error(`Poor R/R: ${(reward/risk).toFixed(2)}:1`);
      }
    }
  ]
});
```

### Time Window Restrictions

Prevent signals during specific hours (e.g., low liquidity periods):

```typescript
addRisk({
  riskName: "trading-hours",
  validations: [
    ({ timestamp }) => {
      const hour = new Date(timestamp).getUTCHours();
      
      // Block 00:00-02:00 UTC (low liquidity)
      if (hour >= 0 && hour < 2) {
        throw new Error("Trading disabled during low liquidity hours");
      }
    }
  ]
});
```

### Symbol-Specific Limits

Limit positions per symbol:

```typescript
addRisk({
  riskName: "one-per-symbol",
  validations: [
    ({ symbol, activePositions }) => {
      const countOnSymbol = activePositions.filter(
        pos => pos.signal.symbol === symbol
      ).length;
      
      if (countOnSymbol > 0) {
        throw new Error(`Already have position on ${symbol}`);
      }
    }
  ]
});
```

**Sources**: [test/e2e/risk.test.mjs](), [README.md:86-99]()

## Integration with Strategy Lifecycle

Risk validation integrates with multiple strategy lifecycle points.

```mermaid
graph TB
    subgraph "Strategy Registration"
        REG["addStrategy({ riskName, riskList })"]
        SCHEMA["StrategySchemaService"]
    end
    
    subgraph "Signal Generation"
        GET["getSignal() returns ISignalDto"]
        VALIDATE["VALIDATE_SIGNAL_FN<br/>Type/price/logic checks"]
        RISK_CHECK["Risk.checkSignal()<br/>Portfolio-level validation"]
    end
    
    subgraph "Scheduled Signal Activation"
        SCHED["_scheduledSignal waiting"]
        PRICE["Price reaches priceOpen"]
        RISK_RECHECK["Risk.checkSignal()<br/>Re-validate at activation"]
    end
    
    subgraph "Position Management"
        OPEN["Signal opens (pending/active)"]
        ADD["Risk.addSignal()<br/>Track in _activePositionsMap"]
        MONITOR["Monitor TP/SL/time"]
        CLOSE["Signal closes"]
        REMOVE["Risk.removeSignal()<br/>Remove from tracking"]
    end
    
    REG --> SCHEMA
    SCHEMA --> GET
    
    GET --> VALIDATE
    VALIDATE --> RISK_CHECK
    
    RISK_CHECK --> SCHED
    RISK_CHECK --> OPEN
    
    SCHED --> PRICE
    PRICE --> RISK_RECHECK
    
    RISK_RECHECK --> OPEN
    
    OPEN --> ADD
    ADD --> MONITOR
    
    MONITOR --> CLOSE
    CLOSE --> REMOVE
    
    RISK_CHECK -.rejects.-> EMIT1["riskSubject.next()"]
    RISK_RECHECK -.rejects.-> EMIT2["riskSubject.next()"]
    
    style RISK_CHECK fill:#ffe1e1,stroke:#333,stroke-width:2px
    style RISK_RECHECK fill:#ffe1e1,stroke:#333,stroke-width:2px
```

### Multiple Risk Profiles (riskList)

Strategies can require multiple risk profiles to all pass:

```typescript
addStrategy({
  strategyName: "conservative-btc",
  riskList: ["max-3-positions", "min-rr-2to1", "trading-hours"],
  getSignal: async (symbol, when) => {
    // All three risk profiles must validate
  }
});
```

All risk profiles in `riskList` are checked sequentially. If any validation fails, the signal is rejected.

**Sources**: [types.d.ts:730-750](), [src/client/ClientStrategy.ts:376-387](), [src/client/ClientStrategy.ts:712-729]()

## Global Risk Configuration

Global risk parameters are configured via `setConfig()`:

```typescript
setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3,  // Min TP distance (%)
  CC_MIN_STOPLOSS_DISTANCE_PERCENT: 0.1,    // Min SL distance (%)
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 5.0,    // Max SL distance (%)
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 10080,    // Max 7 days
  CC_SCHEDULE_AWAIT_MINUTES: 120,           // Scheduled signal timeout
});
```

These parameters are enforced by `VALIDATE_SIGNAL_FN` before risk validation:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | `0.3` | Minimum TP distance to cover fees |
| `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | `0.1` | Minimum SL distance to avoid instant stops |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | `5.0` | Maximum SL distance to protect capital |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | `10080` | Maximum signal duration (7 days) |
| `CC_SCHEDULE_AWAIT_MINUTES` | `120` | Scheduled signal timeout (2 hours) |

**Sources**: [src/config/params.ts](), [src/client/ClientStrategy.ts:45-330]()

## Validation Error Handling

Validation errors are caught and handled gracefully:

```mermaid
sequenceDiagram
    participant Strategy as "ClientStrategy"
    participant Risk as "ClientRisk"
    participant Validation as "Validation Function"
    participant Emitter as "validationSubject"
    
    Strategy->>Risk: checkSignal(params)
    Risk->>Validation: validate(payload)
    
    alt Validation throws Error
        Validation-->>Risk: throw Error("reason")
        Risk->>Risk: Catch error
        Risk->>Emitter: validationSubject.next(error)
        Risk->>Risk: Call onRejected callback
        Risk->>Risk: Emit to riskSubject
        Risk-->>Strategy: return false
    else Validation succeeds
        Validation-->>Risk: return void
        Risk->>Risk: Call onAllowed callback
        Risk-->>Strategy: return true
    end
```

### Error Propagation

1. Validation function throws `Error`
2. `ClientRisk` catches error
3. Error emitted to `validationSubject` (for debugging)
4. `onRejected` callback invoked with error message
5. `riskSubject` emits `RiskContract` with rejection details
6. `checkSignal()` returns `false`

**Sources**: [src/function/event.ts:757-760](), [src/config/emitters.ts:112]()

## Performance Considerations

### Validation Execution

- Validations run **sequentially** in array order
- First validation that throws stops execution (short-circuit)
- Async validations are supported (use `await`)
- Validation timing tracked via `performanceEmitter`

### Position Tracking

- `_activePositionsMap` is in-memory Map for O(1) lookups
- Persistence only in live mode (backtest skips I/O)
- Atomic file writes prevent corruption
- Separate files per `riskName` for parallel writes

### Memoization

`ClientRisk` instances are memoized per `riskName` in `RiskConnectionService`, ensuring singleton behavior and preventing duplicate position tracking.

**Sources**: [src/lib/services/connection/RiskConnectionService.ts]()
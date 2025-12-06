# Signal Lifecycle Overview

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



This page describes the complete lifecycle of trading signals within the backtest-kit framework, from generation through validation, execution, and termination. A signal represents a trading position with entry price, take-profit, stop-loss, and time expiration parameters. Understanding the signal lifecycle is essential for implementing strategies and debugging execution behavior.

For details on strategy registration and configuration, see [Component Registration](#2.3). For implementation details of the `ClientStrategy` class that manages this lifecycle, see [ClientStrategy](#6.1). For validation rules and error handling, see [Signal Generation and Validation](#8.2).

---

## Signal State Machine

The signal lifecycle follows a deterministic state machine with distinct states and transition conditions. All states are represented by discriminated union types in `IStrategyTickResult`, enabling type-safe state handling in callbacks and event listeners.

```mermaid
stateDiagram-v2
    [*] --> Idle: "Initial state"
    
    Idle --> Scheduled: "getSignal() returns signal with priceOpen != currentPrice"
    Idle --> Opened: "getSignal() returns signal with priceOpen omitted or = currentPrice"
    Idle --> Idle: "getSignal() returns null or validation fails"
    
    Scheduled --> Cancelled: "Timeout (120 min) OR SL hit before activation"
    Scheduled --> Opened: "Price reaches priceOpen AND risk check passes"
    Scheduled --> Idle: "Risk check fails at activation"
    Scheduled --> Scheduled: "Monitoring activation price"
    
    Opened --> Active: "Signal persisted and monitoring begins"
    
    Active --> Closed: "TP hit OR SL hit OR time_expired"
    Active --> Active: "Monitoring TP/SL conditions"
    
    Closed --> Idle: "Cleanup and ready for next signal"
    Cancelled --> Idle: "Cleanup and ready for next signal"
    
    Idle --> [*]: "Strategy stopped"
    
    note right of Idle
        action: "idle"
        signal: null
        Waiting for getSignal()
    end note
    
    note right of Scheduled
        action: "scheduled"
        signal: IScheduledSignalRow
        _isScheduled: true
    end note
    
    note right of Opened
        action: "opened"
        signal: ISignalRow
        Just activated
    end note
    
    note right of Active
        action: "active"
        signal: ISignalRow
        Monitoring TP/SL
    end note
    
    note right of Closed
        action: "closed"
        closeReason: "take_profit" | "stop_loss" | "time_expired"
        pnl: IStrategyPnL
    end note
    
    note right of Cancelled
        action: "cancelled"
        Scheduled signal never activated
    end note
```

**Sources:** [src/interfaces/Strategy.interface.ts:170-306](), [src/client/ClientStrategy.ts:1-1000](), [types.d.ts:853-974]()

---

## Signal Type Hierarchy

Signals progress through three type representations during their lifecycle, each with increasing specificity:

```mermaid
classDiagram
    class ISignalDto {
        +id?: string
        +position: "long" | "short"
        +note?: string
        +priceOpen?: number
        +priceTakeProfit: number
        +priceStopLoss: number
        +minuteEstimatedTime: number
    }
    
    class ISignalRow {
        +id: string
        +priceOpen: number
        +position: "long" | "short"
        +note?: string
        +priceTakeProfit: number
        +priceStopLoss: number
        +minuteEstimatedTime: number
        +exchangeName: string
        +strategyName: string
        +scheduledAt: number
        +pendingAt: number
        +symbol: string
        +_isScheduled: boolean
    }
    
    class IScheduledSignalRow {
        +priceOpen: number
        +"All ISignalRow fields"
        +_isScheduled: true
    }
    
    ISignalDto <|-- ISignalRow: "validated and augmented"
    ISignalRow <|-- IScheduledSignalRow: "specialized for scheduled"
```

| Type | Purpose | When Created | Key Characteristics |
|------|---------|--------------|---------------------|
| `ISignalDto` | User-defined signal from `getSignal()` | Strategy logic returns this | Optional `priceOpen`, optional `id`, minimal fields |
| `ISignalRow` | Validated signal with auto-generated ID | After validation passes | Required `priceOpen`, UUID `id`, complete metadata |
| `IScheduledSignalRow` | Scheduled signal awaiting activation | When `priceOpen != currentPrice` | `_isScheduled: true`, waits for price to reach `priceOpen` |

**Sources:** [src/interfaces/Strategy.interface.ts:21-73](), [types.d.ts:738-785]()

---

## State Transition Details

### Idle → Scheduled/Opened

The transition from `Idle` state occurs when `getSignal()` returns a non-null signal that passes validation and risk checks:

```mermaid
flowchart TB
    Start["tick() called"]
    
    CheckInterval["Check interval throttling<br/>INTERVAL_MINUTES[interval]"]
    CheckThrottle{"currentTime - lastSignal<br/>< intervalMs?"}
    
    CheckRisk["risk.checkSignal()<br/>Portfolio validation"]
    RiskFail{"Risk check<br/>passed?"}
    
    CallGetSignal["params.getSignal()<br/>User strategy logic"]
    CheckNull{"Signal<br/>returned?"}
    
    CheckPriceOpen{"priceOpen<br/>defined?"}
    CheckActivation{"Should activate<br/>immediately?"}
    
    Validate["VALIDATE_SIGNAL_FN()<br/>30+ validation rules"]
    ValidateFail{"Validation<br/>passed?"}
    
    ReturnScheduled["Return IStrategyTickResultScheduled<br/>action: 'scheduled'"]
    ReturnOpened["Return IStrategyTickResultOpened<br/>action: 'opened'"]
    ReturnIdle["Return IStrategyTickResultIdle<br/>action: 'idle'"]
    
    Start --> CheckInterval
    CheckInterval --> CheckThrottle
    CheckThrottle -->|Yes| ReturnIdle
    CheckThrottle -->|No| CheckRisk
    
    CheckRisk --> RiskFail
    RiskFail -->|No| ReturnIdle
    RiskFail -->|Yes| CallGetSignal
    
    CallGetSignal --> CheckNull
    CheckNull -->|No| ReturnIdle
    CheckNull -->|Yes| CheckPriceOpen
    
    CheckPriceOpen -->|No| Validate
    CheckPriceOpen -->|Yes| CheckActivation
    
    CheckActivation -->|Yes<br/>currentPrice reached priceOpen| Validate
    CheckActivation -->|No<br/>waiting for priceOpen| Validate
    
    Validate --> ValidateFail
    ValidateFail -->|No| ReturnIdle
    ValidateFail -->|Yes Long + reached| ReturnOpened
    ValidateFail -->|Yes Short + reached| ReturnOpened
    ValidateFail -->|Yes + waiting| ReturnScheduled
```

**Key Logic:**
- **Throttling**: Enforced by `INTERVAL_MINUTES` mapping [src/client/ClientStrategy.ts:32-39]()
- **Risk Check**: Pre-validation gate via `risk.checkSignal()` [src/client/ClientStrategy.ts:289-299]()
- **Immediate Activation**: LONG activates if `currentPrice <= priceOpen`, SHORT activates if `currentPrice >= priceOpen` [src/client/ClientStrategy.ts:314-344]()
- **Validation**: 30+ rules in `VALIDATE_SIGNAL_FN` [src/client/ClientStrategy.ts:41-261]()

**Sources:** [src/client/ClientStrategy.ts:263-396](), [src/client/ClientStrategy.ts:720-815]()

---

### Scheduled → Opened/Cancelled/Idle

Scheduled signals require continuous monitoring for three conditions: activation, cancellation, or timeout.

```mermaid
flowchart TB
    Start["Scheduled signal exists<br/>_scheduledSignal != null"]
    
    CheckTimeout["CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN()<br/>elapsedTime >= CC_SCHEDULE_AWAIT_MINUTES"]
    TimeoutCheck{"Timeout<br/>reached?"}
    
    CheckPrice["CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN()<br/>Compare currentPrice vs priceOpen and SL"]
    PriceCheck{"Price<br/>condition?"}
    
    RiskCheck["risk.checkSignal()<br/>Re-validate at activation"]
    RiskPass{"Risk<br/>passed?"}
    
    Activate["ACTIVATE_SCHEDULED_SIGNAL_FN()<br/>Update pendingAt timestamp"]
    Cancel["Return IStrategyTickResultCancelled<br/>onCancel callback"]
    ReturnIdle["Return IStrategyTickResultIdle<br/>Signal removed"]
    ReturnOpened["Return IStrategyTickResultOpened<br/>action: 'opened'"]
    ReturnActive["Return IStrategyTickResultActive<br/>action: 'active'"]
    
    Start --> CheckTimeout
    CheckTimeout --> TimeoutCheck
    TimeoutCheck -->|Yes| Cancel
    TimeoutCheck -->|No| CheckPrice
    
    CheckPrice --> PriceCheck
    PriceCheck -->|SL hit| ReturnIdle
    PriceCheck -->|priceOpen reached| RiskCheck
    PriceCheck -->|Still waiting| ReturnActive
    
    RiskCheck --> RiskPass
    RiskPass -->|No| ReturnIdle
    RiskPass -->|Yes| Activate
    Activate --> ReturnOpened
```

**Critical Conditions:**

| Position | Activation Condition | Cancellation Condition |
|----------|---------------------|------------------------|
| LONG | `currentPrice <= priceOpen` | `currentPrice <= priceStopLoss` |
| SHORT | `currentPrice >= priceOpen` | `currentPrice >= priceStopLoss` |

**Pre-Activation Cancellation**: Scheduled signals can be cancelled by StopLoss **before** activation when price moves against the position too far without reaching `priceOpen`. This prevents entering positions that have already deteriorated. See test cases [test/e2e/defend.test.mjs:1393-1507]() for validation.

**Sources:** [src/client/ClientStrategy.ts:474-693](), [src/client/ClientStrategy.ts:530-564]()

---

### Active → Closed

Active signals are monitored on every tick for three terminal conditions:

```mermaid
flowchart TB
    Start["Active signal exists<br/>_pendingSignal != null"]
    
    GetPrice["exchange.getAveragePrice()<br/>VWAP calculation"]
    
    CheckTime["elapsedTime = currentTime - signal.pendingAt<br/>maxTimeToWait = signal.minuteEstimatedTime * 60 * 1000"]
    TimeExpired{"elapsedTime >=<br/>maxTimeToWait?"}
    
    CheckTP["Compare currentPrice vs priceTakeProfit"]
    TPHit{"Take Profit<br/>hit?"}
    
    CheckSL["Compare currentPrice vs priceStopLoss"]
    SLHit{"Stop Loss<br/>hit?"}
    
    CloseTimeout["CLOSE_PENDING_SIGNAL_FN()<br/>closeReason: 'time_expired'"]
    CloseTP["CLOSE_PENDING_SIGNAL_FN()<br/>closeReason: 'take_profit'"]
    CloseSL["CLOSE_PENDING_SIGNAL_FN()<br/>closeReason: 'stop_loss'"]
    
    CalcPnL["toProfitLossDto()<br/>Apply fees and slippage"]
    Cleanup["partial.clear()<br/>risk.removeSignal()<br/>setPendingSignal(null)"]
    
    ReturnClosed["Return IStrategyTickResultClosed<br/>action: 'closed'<br/>pnl: IStrategyPnL"]
    ReturnActive["Return IStrategyTickResultActive<br/>action: 'active'<br/>Continue monitoring"]
    
    Start --> GetPrice
    GetPrice --> CheckTime
    CheckTime --> TimeExpired
    TimeExpired -->|Yes| CloseTimeout
    TimeExpired -->|No| CheckTP
    
    CheckTP --> TPHit
    TPHit -->|LONG: price >= TP<br/>SHORT: price <= TP| CloseTP
    TPHit -->|No| CheckSL
    
    CheckSL --> SLHit
    SLHit -->|LONG: price <= SL<br/>SHORT: price >= SL| CloseSL
    SLHit -->|No| ReturnActive
    
    CloseTimeout --> CalcPnL
    CloseTP --> CalcPnL
    CloseSL --> CalcPnL
    
    CalcPnL --> Cleanup
    Cleanup --> ReturnClosed
```

**Terminal Conditions:**

| Condition | LONG Check | SHORT Check | CloseReason Value |
|-----------|-----------|-------------|-------------------|
| Time Expired | `elapsedTime >= maxTimeToWait` | `elapsedTime >= maxTimeToWait` | `"time_expired"` |
| Take Profit | `currentPrice >= priceTakeProfit` | `currentPrice <= priceTakeProfit` | `"take_profit"` |
| Stop Loss | `currentPrice <= priceStopLoss` | `currentPrice >= priceStopLoss` | `"stop_loss"` |

**Sources:** [src/client/ClientStrategy.ts:817-876](), [src/client/ClientStrategy.ts:878-960]()

---

## Validation Pipeline

All signals pass through a comprehensive validation pipeline with 30+ rules before activation. Validation occurs twice for scheduled signals: once at creation, and again at activation.

```mermaid
flowchart TB
    subgraph "Phase 1: Required Fields"
        CheckID["id: non-empty string"]
        CheckExchange["exchangeName: non-empty string"]
        CheckStrategy["strategyName: non-empty string"]
        CheckSymbol["symbol: non-empty string"]
        CheckScheduled["_isScheduled: boolean"]
        CheckPosition["position: 'long' | 'short'"]
    end
    
    subgraph "Phase 2: NaN/Infinity Protection"
        CheckCurrentPrice["currentPrice: isFinite() && > 0"]
        CheckPriceOpen["priceOpen: isFinite() && > 0"]
        CheckTP["priceTakeProfit: isFinite() && > 0"]
        CheckSL["priceStopLoss: isFinite() && > 0"]
    end
    
    subgraph "Phase 3: Price Logic Validation"
        CheckLongTP["LONG: priceTakeProfit > priceOpen"]
        CheckLongSL["LONG: priceStopLoss < priceOpen"]
        CheckShortTP["SHORT: priceTakeProfit < priceOpen"]
        CheckShortSL["SHORT: priceStopLoss > priceOpen"]
    end
    
    subgraph "Phase 4: Edge Case Protection"
        CheckTPDistance["TP distance >= CC_MIN_TAKEPROFIT_DISTANCE_PERCENT<br/>Default: 0.3%"]
        CheckSLDistance["SL distance <= CC_MAX_STOPLOSS_DISTANCE_PERCENT<br/>Default: 20%"]
        CheckImmediate["Immediate signals: currentPrice not past TP/SL"]
        CheckLifetime["minuteEstimatedTime <= CC_MAX_SIGNAL_LIFETIME_MINUTES<br/>Default: 1440 min"]
    end
    
    Start["VALIDATE_SIGNAL_FN()"] --> CheckID
    CheckID --> CheckExchange
    CheckExchange --> CheckStrategy
    CheckStrategy --> CheckSymbol
    CheckSymbol --> CheckScheduled
    CheckScheduled --> CheckPosition
    
    CheckPosition --> CheckCurrentPrice
    CheckCurrentPrice --> CheckPriceOpen
    CheckPriceOpen --> CheckTP
    CheckTP --> CheckSL
    
    CheckSL --> CheckLongTP
    CheckLongTP --> CheckLongSL
    CheckLongSL --> CheckShortTP
    CheckShortTP --> CheckShortSL
    
    CheckShortSL --> CheckTPDistance
    CheckTPDistance --> CheckSLDistance
    CheckSLDistance --> CheckImmediate
    CheckImmediate --> CheckLifetime
    
    CheckLifetime --> Success["Validation passed"]
    
    CheckID -.->|Any fail| Error["throw Error with details"]
    CheckExchange -.->|Any fail| Error
    CheckStrategy -.->|Any fail| Error
    CheckSymbol -.->|Any fail| Error
    CheckScheduled -.->|Any fail| Error
    CheckPosition -.->|Any fail| Error
    CheckCurrentPrice -.->|Any fail| Error
    CheckPriceOpen -.->|Any fail| Error
    CheckTP -.->|Any fail| Error
    CheckSL -.->|Any fail| Error
    CheckLongTP -.->|Any fail| Error
    CheckLongSL -.->|Any fail| Error
    CheckShortTP -.->|Any fail| Error
    CheckShortSL -.->|Any fail| Error
    CheckTPDistance -.->|Any fail| Error
    CheckSLDistance -.->|Any fail| Error
    CheckImmediate -.->|Any fail| Error
    CheckLifetime -.->|Any fail| Error
```

**Key Validation Rules:**

| Category | Rule | Configuration Parameter | Purpose |
|----------|------|-------------------------|---------|
| Minimum Profit | TP distance from priceOpen | `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` (0.3%) | Ensure profit covers trading fees (2×0.1%) |
| Maximum Loss | SL distance from priceOpen | `CC_MAX_STOPLOSS_DISTANCE_PERCENT` (20%) | Prevent catastrophic single-position losses |
| Signal Lifetime | Maximum duration | `CC_MAX_SIGNAL_LIFETIME_MINUTES` (1440 min) | Prevent eternal signals blocking risk limits |
| Immediate Activation | currentPrice not past TP/SL | N/A | Prevent invalid immediate signals |

**Sources:** [src/client/ClientStrategy.ts:41-261](), [src/config/params.ts:5-72](), [types.d.ts:5-72]()

---

## Timestamp Semantics

Signals track two distinct timestamps that serve different purposes:

```mermaid
graph LR
    subgraph "Scheduled Signal"
        S1["scheduledAt:<br/>When getSignal() returned"]
        S2["pendingAt:<br/>Same as scheduledAt initially"]
        S3["pendingAt:<br/>Updated when price reaches priceOpen"]
    end
    
    subgraph "Immediate Signal"
        I1["scheduledAt:<br/>When getSignal() returned"]
        I2["pendingAt:<br/>Same as scheduledAt<br/>Never changes"]
    end
    
    S1 --> S2
    S2 -.->|"Price reaches priceOpen"| S3
    I1 --> I2
```

| Timestamp | Purpose | When Set | Used For |
|-----------|---------|----------|----------|
| `scheduledAt` | Signal creation time | When `getSignal()` returns signal | Timeout calculation for scheduled signals (120 min) |
| `pendingAt` | Position activation time | When signal becomes active (priceOpen reached or immediate) | Time expiration calculation (`minuteEstimatedTime`) |

**Critical Distinction**: For scheduled signals, `scheduledAt` tracks when the signal was created, while `pendingAt` tracks when the position actually opened. The timeout for scheduled signal activation is calculated from `scheduledAt`, but the timeout for position closure is calculated from `pendingAt`.

```typescript
// Scheduled signal timeout (activation wait)
const maxActivationWait = CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000; // 120 min
const elapsedSinceSchedule = currentTime - signal.scheduledAt;
if (elapsedSinceSchedule >= maxActivationWait) {
  // Cancel scheduled signal
}

// Active signal timeout (position lifetime)
const maxPositionTime = signal.minuteEstimatedTime * 60 * 1000;
const elapsedSincePending = currentTime - signal.pendingAt;
if (elapsedSincePending >= maxPositionTime) {
  // Close position by timeout
}
```

**Sources:** [src/client/ClientStrategy.ts:474-528](), [src/client/ClientStrategy.ts:817-835](), [src/interfaces/Strategy.interface.ts:54-57]()

---

## Tick Result Contract

All state transitions return a discriminated union type `IStrategyTickResult` with an `action` discriminator field:

```mermaid
classDiagram
    class IStrategyTickResult {
        <<interface>>
        +action: "idle" | "scheduled" | "opened" | "active" | "closed" | "cancelled"
    }
    
    class IStrategyTickResultIdle {
        +action: "idle"
        +signal: null
        +strategyName: string
        +exchangeName: string
        +symbol: string
        +currentPrice: number
    }
    
    class IStrategyTickResultScheduled {
        +action: "scheduled"
        +signal: IScheduledSignalRow
        +strategyName: string
        +exchangeName: string
        +symbol: string
        +currentPrice: number
    }
    
    class IStrategyTickResultOpened {
        +action: "opened"
        +signal: ISignalRow
        +strategyName: string
        +exchangeName: string
        +symbol: string
        +currentPrice: number
    }
    
    class IStrategyTickResultActive {
        +action: "active"
        +signal: ISignalRow
        +currentPrice: number
        +strategyName: string
        +exchangeName: string
        +symbol: string
    }
    
    class IStrategyTickResultClosed {
        +action: "closed"
        +signal: ISignalRow
        +currentPrice: number
        +closeReason: "time_expired" | "take_profit" | "stop_loss"
        +closeTimestamp: number
        +pnl: IStrategyPnL
        +strategyName: string
        +exchangeName: string
        +symbol: string
    }
    
    class IStrategyTickResultCancelled {
        +action: "cancelled"
        +signal: IScheduledSignalRow
        +currentPrice: number
        +closeTimestamp: number
        +strategyName: string
        +exchangeName: string
        +symbol: string
    }
    
    IStrategyTickResult <|.. IStrategyTickResultIdle
    IStrategyTickResult <|.. IStrategyTickResultScheduled
    IStrategyTickResult <|.. IStrategyTickResultOpened
    IStrategyTickResult <|.. IStrategyTickResultActive
    IStrategyTickResult <|.. IStrategyTickResultClosed
    IStrategyTickResult <|.. IStrategyTickResultCancelled
```

**Type-Safe Pattern Matching:**

```typescript
const result = await strategy.tick(symbol, strategyName);

if (result.action === "closed") {
  // TypeScript knows result.pnl exists
  console.log(`PNL: ${result.pnl.pnlPercentage}%`);
  console.log(`Reason: ${result.closeReason}`);
} else if (result.action === "scheduled") {
  // TypeScript knows result.signal._isScheduled is true
  console.log(`Waiting for price: ${result.signal.priceOpen}`);
} else if (result.action === "idle") {
  // TypeScript knows result.signal is null
  console.log("No active position");
}
```

**Sources:** [src/interfaces/Strategy.interface.ts:170-306](), [types.d.ts:853-974]()

---

## Persistence and Crash Recovery

Signals are persisted to disk in live mode only, enabling crash recovery without data loss. Three adapters handle different persistence concerns:

```mermaid
graph TB
    subgraph "Live Mode Initialization"
        Start["ClientStrategy.waitForInit()"]
        
        CheckBacktest{"execution.context<br/>.backtest?"}
        
        ReadSignal["PersistSignalAdapter<br/>.readSignalData()"]
        CheckSignal{"Pending signal<br/>exists?"}
        RestoreSignal["_pendingSignal = restored<br/>onActive callback"]
        
        ReadSchedule["PersistScheduleAdapter<br/>.readScheduleData()"]
        CheckSchedule{"Scheduled signal<br/>exists?"}
        RestoreSchedule["_scheduledSignal = restored<br/>onSchedule callback"]
        
        Done["Initialization complete"]
    end
    
    subgraph "Signal Write Operations"
        W1["setPendingSignal()"]
        W2["setScheduledSignal()"]
        
        WP1["PersistSignalAdapter<br/>.writeSignalData()"]
        WP2["PersistScheduleAdapter<br/>.writeScheduleData()"]
        
        WP3["onWrite callback<br/>for testing"]
    end
    
    Start --> CheckBacktest
    CheckBacktest -->|true| Done
    CheckBacktest -->|false| ReadSignal
    
    ReadSignal --> CheckSignal
    CheckSignal -->|No| ReadSchedule
    CheckSignal -->|Yes| RestoreSignal
    RestoreSignal --> ReadSchedule
    
    ReadSchedule --> CheckSchedule
    CheckSchedule -->|No| Done
    CheckSchedule -->|Yes| RestoreSchedule
    RestoreSchedule --> Done
    
    W1 --> WP1
    W2 --> WP2
    WP1 --> WP3
    WP2 --> WP3
```

**Persistence Adapters:**

| Adapter | File Location | Contents | Purpose |
|---------|---------------|----------|---------|
| `PersistSignalAdapter` | `.backtest/{symbol}/{strategyName}.signal.json` | Active `ISignalRow` | Restore active positions after crash |
| `PersistScheduleAdapter` | `.backtest/{symbol}/{strategyName}.schedule.json` | Scheduled `IScheduledSignalRow` | Restore scheduled signals after crash |
| `PersistRiskAdapter` | `.backtest/{symbol}/risk.{riskName}.json` | Active position count and list | Restore risk limits after crash |

**Atomic Write Pattern:**

All persistence operations are atomic to prevent corruption:

1. Write to temporary file: `{path}.tmp`
2. Call `fsSync()` to flush to disk
3. Rename to final path (atomic operation)

**Sources:** [src/client/ClientStrategy.ts:411-472](), [src/classes/Persist.ts:1-200](), [src/client/ClientStrategy.ts:946-972]()

---

## Lifecycle Callbacks

Strategies can register callbacks for every lifecycle event, enabling custom logging, metrics collection, and state tracking:

```mermaid
sequenceDiagram
    participant Strategy as ClientStrategy
    participant User as Strategy Callbacks
    
    Note over Strategy: tick() starts
    
    alt Signal Generated
        Strategy->>User: onTick(result)
        
        alt Action: scheduled
            Strategy->>User: onSchedule(symbol, signal, currentPrice, backtest)
        end
        
        alt Action: opened
            Strategy->>User: onOpen(symbol, signal, currentPrice, backtest)
        end
        
        alt Action: active
            Strategy->>User: onActive(symbol, signal, currentPrice, backtest)
            
            opt Partial Profit
                Strategy->>User: onPartialProfit(symbol, signal, currentPrice, revenuePercent, backtest)
            end
            
            opt Partial Loss
                Strategy->>User: onPartialLoss(symbol, signal, currentPrice, lossPercent, backtest)
            end
        end
        
        alt Action: closed
            Strategy->>User: onClose(symbol, signal, priceClose, backtest)
        end
        
        alt Action: cancelled
            Strategy->>User: onCancel(symbol, signal, currentPrice, backtest)
        end
        
        alt Action: idle
            Strategy->>User: onIdle(symbol, currentPrice, backtest)
        end
    end
    
    opt Persistence Write
        Strategy->>User: onWrite(symbol, data, backtest)
    end
    
    Note over Strategy: tick() completes
```

**Callback Invocation Order:**

1. **Specialized callback** (`onSchedule`, `onOpen`, `onActive`, `onClose`, `onCancel`, `onIdle`)
2. **Generic callback** (`onTick` with `IStrategyTickResult`)
3. **Persistence callback** (`onWrite` if state changed)

**Sources:** [src/interfaces/Strategy.interface.ts:98-126](), [types.d.ts:789-811]()

---

## Integration with Execution Modes

The signal lifecycle behaves identically across all three execution modes (Backtest, Live, Walker), with minor differences in timing and persistence:

| Aspect | Backtest Mode | Live Mode | Walker Mode |
|--------|---------------|-----------|-------------|
| Time Source | Candle timestamps from frames | `new Date()` real-time | Candle timestamps (delegates to Backtest) |
| Persistence | Disabled (`backtest: true`) | Enabled via `PersistSignalAdapter` | Disabled (`backtest: true`) |
| `tick()` Frequency | Every frame timestamp | Every 61 seconds (`TICK_TTL`) | Every frame timestamp per strategy |
| Signal Activation | Immediate via `backtest()` fast-forward | Real-time monitoring via `tick()` | Immediate via `backtest()` fast-forward |
| Crash Recovery | Not needed (deterministic replay) | Full recovery via `waitForInit()` | Not needed (deterministic replay) |

**Sources:** [src/lib/logic/backtest/BacktestLogicPrivateService.ts:1-300](), [src/lib/logic/live/LiveLogicPrivateService.ts:1-200](), [src/lib/logic/walker/WalkerLogicPrivateService.ts:1-200]()
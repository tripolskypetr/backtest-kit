# Signal Lifecycle

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



This document provides a comprehensive guide to the signal lifecycle in backtest-kit. It covers signal states, generation, validation, state transitions, and persistence. The signal lifecycle is the core mechanism through which trading positions are created, monitored, and closed by the framework.

For information about risk management checks that occur during signal generation, see [Risk Management](#12). For details on execution modes (Backtest vs Live) that affect lifecycle behavior, see [Execution Modes](#2.1).

---

## Signal States Overview

Signals in backtest-kit follow a discriminated union pattern with six possible states. Each state is represented by a specific TypeScript interface with an `action` discriminator field for type-safe handling.

```mermaid
stateDiagram-v2
    [*] --> idle
    
    idle --> scheduled: "getSignal returns ISignalDto with priceOpen"
    idle --> opened: "getSignal returns ISignalDto without priceOpen"
    
    scheduled --> opened: "Price reaches priceOpen & risk check passes"
    scheduled --> cancelled: "Timeout (CC_SCHEDULE_AWAIT_MINUTES) or SL hit"
    scheduled --> idle: "Risk check fails on activation"
    
    opened --> active: "Next tick, monitoring begins"
    active --> closed: "TP hit / SL hit / time_expired"
    active --> active: "Monitoring continues"
    
    closed --> [*]
    cancelled --> [*]
    
    note right of idle
        IStrategyTickResultIdle
        No active signal
        Calls getSignal if interval passed
    end note
    
    note right of scheduled
        IStrategyTickResultScheduled
        IScheduledSignalRow
        Waits for priceOpen activation
        scheduledAt set, pendingAt=scheduledAt
    end note
    
    note right of opened
        IStrategyTickResultOpened
        ISignalRow
        Position just created
        Both timestamps set
    end note
    
    note right of active
        IStrategyTickResultActive
        ISignalRow
        Monitoring TP/SL/time
        Uses pendingAt for duration calc
    end note
    
    note right of closed
        IStrategyTickResultClosed
        Final state with PnL
        closeReason + closeTimestamp
    end note
    
    note right of cancelled
        IStrategyTickResultCancelled
        Scheduled signal failed
        No position opened
    end note
```

**Sources:** [types.d.ts:653-770](), [src/interfaces/Strategy.interface.ts:159-295]()

---

## Signal Data Structures

The framework defines a hierarchy of signal types with increasing levels of completeness and metadata.

### Core Signal Types

| Type | Description | Key Fields | Usage |
|------|-------------|------------|-------|
| `ISignalDto` | User-returned signal from `getSignal()` | `position`, `priceTakeProfit`, `priceStopLoss`, `minuteEstimatedTime`, optional `priceOpen` | Returned by strategy's `getSignal` function |
| `ISignalRow` | Validated signal with metadata | Extends `ISignalDto` + `id`, `priceOpen` (required), `scheduledAt`, `pendingAt`, `symbol`, `strategyName`, `exchangeName`, `_isScheduled` | Used throughout lifecycle |
| `IScheduledSignalRow` | Scheduled signal variant | Extends `ISignalRow`, enforces `priceOpen` presence | Represents delayed entry signals |

```mermaid
graph TB
    subgraph "User Space"
        GetSignal["strategy.getSignal(symbol)"]
        ReturnDto["Returns ISignalDto or null"]
    end
    
    subgraph "Framework Validation"
        GetSignalFn["GET_SIGNAL_FN"]
        ValidateSignalFn["VALIDATE_SIGNAL_FN"]
        AugmentMetadata["Augment with id, timestamps, context"]
    end
    
    subgraph "Signal Types"
        SignalDto["ISignalDto<br/>User-defined signal"]
        SignalRow["ISignalRow<br/>Complete signal"]
        ScheduledSignalRow["IScheduledSignalRow<br/>Delayed entry"]
    end
    
    subgraph "Validation Checks"
        CheckFinite["isFinite checks on prices"]
        CheckPosition["Position-specific logic<br/>long: TP > priceOpen > SL<br/>short: SL > priceOpen > TP"]
        CheckDistances["CC_MIN_TAKEPROFIT_DISTANCE_PERCENT<br/>CC_MAX_STOPLOSS_DISTANCE_PERCENT"]
        CheckLifetime["CC_MAX_SIGNAL_LIFETIME_MINUTES"]
    end
    
    GetSignal --> ReturnDto
    ReturnDto --> GetSignalFn
    GetSignalFn --> AugmentMetadata
    AugmentMetadata --> ValidateSignalFn
    
    SignalDto --> AugmentMetadata
    AugmentMetadata --> SignalRow
    AugmentMetadata --> ScheduledSignalRow
    
    ValidateSignalFn --> CheckFinite
    ValidateSignalFn --> CheckPosition
    ValidateSignalFn --> CheckDistances
    ValidateSignalFn --> CheckLifetime
```

**Sources:** [types.d.ts:543-592](), [src/interfaces/Strategy.interface.ts:19-72](), [src/client/ClientStrategy.ts:187-283]()

---

## Signal Generation Process

Signal generation occurs within `ClientStrategy` and involves throttling, risk checks, and validation. The `GET_SIGNAL_FN` wrapper coordinates this process.

```mermaid
sequenceDiagram
    participant Tick as "ClientStrategy.tick()"
    participant GetSignalFn as "GET_SIGNAL_FN"
    participant UserCode as "strategy.getSignal()"
    participant Risk as "ClientRisk.checkSignal()"
    participant Validate as "VALIDATE_SIGNAL_FN"
    
    Tick->>GetSignalFn: Call signal generation
    
    Note over GetSignalFn: Check _isStopped flag
    GetSignalFn->>GetSignalFn: Check if stopped
    alt Strategy stopped
        GetSignalFn-->>Tick: return null
    end
    
    Note over GetSignalFn: Throttling check
    GetSignalFn->>GetSignalFn: Check _lastSignalTimestamp<br/>vs INTERVAL_MINUTES
    alt Interval not passed
        GetSignalFn-->>Tick: return null
    end
    
    GetSignalFn->>GetSignalFn: Update _lastSignalTimestamp
    
    Note over GetSignalFn: Get current price
    GetSignalFn->>GetSignalFn: getAveragePrice(symbol)
    
    Note over GetSignalFn: Risk check BEFORE signal
    GetSignalFn->>Risk: checkSignal(IRiskCheckArgs)
    Risk-->>GetSignalFn: boolean (allowed/rejected)
    alt Risk check failed
        GetSignalFn-->>Tick: return null
    end
    
    Note over GetSignalFn: Call user function
    GetSignalFn->>UserCode: getSignal(symbol)
    UserCode-->>GetSignalFn: ISignalDto or null
    alt No signal
        GetSignalFn-->>Tick: return null
    end
    
    Note over GetSignalFn: Augment with metadata
    GetSignalFn->>GetSignalFn: Add id (randomString)<br/>Add scheduledAt/pendingAt<br/>Add symbol/strategyName/exchangeName<br/>Set _isScheduled flag
    
    alt priceOpen specified
        GetSignalFn->>GetSignalFn: Create IScheduledSignalRow<br/>pendingAt = scheduledAt temporarily
    else priceOpen omitted
        GetSignalFn->>GetSignalFn: Create ISignalRow<br/>priceOpen = currentPrice<br/>pendingAt = scheduledAt (same time)
    end
    
    Note over Validate: Validation phase
    GetSignalFn->>Validate: VALIDATE_SIGNAL_FN(signal)
    Validate->>Validate: Check prices are finite
    Validate->>Validate: Check prices > 0
    Validate->>Validate: Validate position logic
    Validate->>Validate: Check TP/SL distances
    Validate->>Validate: Check lifetime limits
    alt Validation failed
        Validate-->>GetSignalFn: throw Error
    end
    
    GetSignalFn-->>Tick: return ISignalRow or IScheduledSignalRow
```

**Sources:** [src/client/ClientStrategy.ts:187-283](), [src/client/ClientStrategy.ts:31-38]()

---

## Signal Validation Rules

The `VALIDATE_SIGNAL_FN` enforces critical safety checks to prevent invalid signals from entering the system. All validations throw descriptive errors if checks fail.

### Validation Categories

**1. Finite Number Protection**
```typescript
// Protects against NaN/Infinity from calculation errors
if (!isFinite(signal.priceOpen)) { /* error */ }
if (!isFinite(signal.priceTakeProfit)) { /* error */ }
if (!isFinite(signal.priceStopLoss)) { /* error */ }
```

**2. Price Positivity**
```typescript
// All prices must be positive
priceOpen > 0
priceTakeProfit > 0
priceStopLoss > 0
```

**3. Position Logic (Long)**
```typescript
// Long position: buy low, sell high
priceTakeProfit > priceOpen > priceStopLoss
```

**4. Position Logic (Short)**
```typescript
// Short position: sell high, buy low
priceStopLoss > priceOpen > priceTakeProfit
```

**5. TakeProfit Distance**
```typescript
// Must cover trading fees (default 0.3% > 2×0.1% fees)
const tpDistancePercent = Math.abs((priceTakeProfit - priceOpen) / priceOpen) * 100;
tpDistancePercent >= CC_MIN_TAKEPROFIT_DISTANCE_PERCENT
```

**6. StopLoss Distance**
```typescript
// Prevents catastrophic losses (default max 20%)
const slDistancePercent = Math.abs((priceStopLoss - priceOpen) / priceOpen) * 100;
slDistancePercent <= CC_MAX_STOPLOSS_DISTANCE_PERCENT
```

**7. Signal Lifetime**
```typescript
// Prevents eternal signals blocking risk limits (default max 1440 minutes = 1 day)
minuteEstimatedTime <= CC_MAX_SIGNAL_LIFETIME_MINUTES
```

**Sources:** [src/client/ClientStrategy.ts:40-185](), [types.d.ts:5-34]()

---

## State Transition: Idle to Opened/Scheduled

When no active signal exists, `ClientStrategy.tick()` attempts to generate a new signal. The flow differs based on whether `priceOpen` is specified.

```mermaid
graph TB
    TickCall["ClientStrategy.tick()"]
    CheckScheduled["Check _scheduledSignal"]
    CheckPending["Check _pendingSignal"]
    GetSignal["GET_SIGNAL_FN"]
    
    subgraph "Immediate Entry Path"
        OpenPending["OPEN_NEW_PENDING_SIGNAL_FN"]
        RiskCheckImmediate["risk.checkSignal()"]
        AddRiskImmediate["risk.addSignal()"]
        OnOpenCb["callbacks.onOpen()"]
        SetPending["setPendingSignal()"]
        ReturnOpened["Return IStrategyTickResultOpened"]
    end
    
    subgraph "Scheduled Entry Path"
        OpenScheduled["OPEN_NEW_SCHEDULED_SIGNAL_FN"]
        SetScheduledField["self._scheduledSignal = signal"]
        OnScheduleCb["callbacks.onSchedule()"]
        ReturnScheduled["Return IStrategyTickResultScheduled"]
    end
    
    TickCall --> CheckScheduled
    CheckScheduled --> |"_scheduledSignal exists"| ScheduledFlow["Handle scheduled<br/>See next section"]
    CheckScheduled --> |"null"| CheckPending
    CheckPending --> |"_pendingSignal exists"| PendingFlow["Handle pending<br/>Monitor TP/SL"]
    CheckPending --> |"null"| GetSignal
    
    GetSignal --> |"null returned"| ReturnIdle["Return IStrategyTickResultIdle"]
    GetSignal --> |"ISignalRow<br/>priceOpen = currentPrice"| OpenPending
    GetSignal --> |"IScheduledSignalRow<br/>priceOpen specified"| OpenScheduled
    
    OpenPending --> RiskCheckImmediate
    RiskCheckImmediate --> |"rejected"| ReturnIdleRisk["Return null"]
    RiskCheckImmediate --> |"allowed"| AddRiskImmediate
    AddRiskImmediate --> SetPending
    SetPending --> OnOpenCb
    OnOpenCb --> ReturnOpened
    
    OpenScheduled --> SetScheduledField
    SetScheduledField --> OnScheduleCb
    OnScheduleCb --> ReturnScheduled
```

**Key Difference:** Immediate signals undergo risk check and call `risk.addSignal()` immediately. Scheduled signals defer risk check until price activation.

**Sources:** [src/client/ClientStrategy.ts:578-621](), [src/client/ClientStrategy.ts:623-673]()

---

## Scheduled Signal Lifecycle

Scheduled signals represent delayed entry positions that wait for price to reach `priceOpen`. They have special activation and cancellation logic.

### Scheduled Signal State Machine

```mermaid
stateDiagram-v2
    [*] --> Created: "getSignal returns<br/>signal with priceOpen"
    
    Created --> Monitoring: "Store in _scheduledSignal"
    
    state Monitoring {
        [*] --> CheckTimeout
        CheckTimeout --> CheckPrice
        CheckPrice --> CheckStopLoss
        CheckStopLoss --> [*]
    }
    
    Monitoring --> Cancelled: "Timeout exceeded<br/>CC_SCHEDULE_AWAIT_MINUTES"
    Monitoring --> Cancelled: "StopLoss hit before activation"
    Monitoring --> Activation: "Price reaches priceOpen<br/>& SL not hit"
    
    state Activation {
        [*] --> RiskCheck
        RiskCheck --> AddRisk: "Allowed"
        RiskCheck --> Reject: "Rejected"
        AddRisk --> UpdatePendingAt
        UpdatePendingAt --> CallOnOpen
        CallOnOpen --> [*]
    }
    
    Activation --> Opened: "Becomes regular signal"
    Activation --> Idle: "Risk check failed"
    Cancelled --> [*]
    Opened --> [*]
    
    note right of CheckTimeout
        CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN
        elapsedTime = currentTime - scheduledAt
        maxTime = CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000
    end note
    
    note right of CheckPrice
        CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN
        Long: currentPrice <= priceOpen
        Short: currentPrice >= priceOpen
    end note
    
    note right of CheckStopLoss
        Priority: SL check before activation
        Long: cancel if price <= priceStopLoss
        Short: cancel if price >= priceStopLoss
    end note
    
    note right of UpdatePendingAt
        CRITICAL: pendingAt = activationTimestamp
        Used for minuteEstimatedTime calculation
    end note
```

**Sources:** [src/client/ClientStrategy.ts:332-386](), [src/client/ClientStrategy.ts:388-422](), [src/client/ClientStrategy.ts:459-551]()

### Activation vs Cancellation Priority

The framework prioritizes StopLoss cancellation over activation to prevent opening positions that would immediately lose:

```typescript
// CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN logic
if (scheduled.position === "long") {
  // Check StopLoss FIRST (cancellation priority)
  if (currentPrice <= scheduled.priceStopLoss) {
    shouldCancel = true;
  }
  // Only activate if NOT cancelled
  else if (currentPrice <= scheduled.priceOpen) {
    shouldActivate = true;
  }
}
```

**Sources:** [src/client/ClientStrategy.ts:388-422]()

---

## State Transition: Active to Closed

Once a signal is opened (stored in `_pendingSignal`), it enters active monitoring. The framework checks for TP/SL conditions and time expiration on each tick.

```mermaid
graph TB
    ActiveSignal["_pendingSignal exists"]
    GetAvgPrice["getAveragePrice(symbol)"]
    CheckCompletion["CHECK_PENDING_SIGNAL_COMPLETION_FN"]
    
    subgraph "Completion Checks (Priority Order)"
        CheckTime["1. Check time expiration<br/>elapsed >= minuteEstimatedTime * 60 * 1000"]
        CheckTP["2. Check TakeProfit<br/>Long: avgPrice >= priceTakeProfit<br/>Short: avgPrice <= priceTakeProfit"]
        CheckSL["3. Check StopLoss<br/>Long: avgPrice <= priceStopLoss<br/>Short: avgPrice >= priceStopLoss"]
    end
    
    subgraph "Close Signal"
        CloseFn["CLOSE_PENDING_SIGNAL_FN"]
        CalcPnL["toProfitLossDto(signal, priceClose)"]
        OnCloseCb["callbacks.onClose()"]
        RemoveRisk["risk.removeSignal()"]
        ClearPending["setPendingSignal(null)"]
        ReturnClosed["Return IStrategyTickResultClosed<br/>action: closed<br/>closeReason: time_expired|take_profit|stop_loss<br/>closeTimestamp<br/>pnl: IStrategyPnL"]
    end
    
    ActiveSignal --> GetAvgPrice
    GetAvgPrice --> CheckCompletion
    
    CheckCompletion --> CheckTime
    CheckTime --> |"Time expired<br/>pendingAt-based"| CloseFn
    CheckTime --> |"Not expired"| CheckTP
    
    CheckTP --> |"TP hit<br/>Use priceTakeProfit"| CloseFn
    CheckTP --> |"Not hit"| CheckSL
    
    CheckSL --> |"SL hit<br/>Use priceStopLoss"| CloseFn
    CheckSL --> |"Not hit"| ReturnActive["Return IStrategyTickResultActive"]
    
    CloseFn --> CalcPnL
    CalcPnL --> OnCloseCb
    OnCloseCb --> RemoveRisk
    RemoveRisk --> ClearPending
    ClearPending --> ReturnClosed
```

**Critical Detail:** Time expiration uses `pendingAt` timestamp, not `scheduledAt`. For scheduled signals, this ensures `minuteEstimatedTime` counts from activation, not from creation.

**Sources:** [src/client/ClientStrategy.ts:675-734](), [src/client/ClientStrategy.ts:736-789]()

---

## Timestamp Management

Signals maintain two critical timestamps with distinct semantics:

| Timestamp | Meaning | Set When | Used For |
|-----------|---------|----------|----------|
| `scheduledAt` | Signal creation time | Signal first generated by `getSignal()` | Tracking signal age, scheduled timeout calculation |
| `pendingAt` | Position active time | Immediate: same as `scheduledAt`<br/>Scheduled: updated on activation | `minuteEstimatedTime` duration calculation, TP/SL/time monitoring |

### Timestamp Flow for Immediate Signals

```mermaid
sequenceDiagram
    participant GetSignal as "GET_SIGNAL_FN"
    participant Signal as "ISignalRow"
    participant Time as "Time Calculations"
    
    Note over GetSignal: currentTime = execution.context.when.getTime()
    
    GetSignal->>Signal: Create signal
    GetSignal->>Signal: scheduledAt = currentTime
    GetSignal->>Signal: pendingAt = currentTime
    
    Note over Signal: Both timestamps identical<br/>Position active immediately
    
    Signal->>Time: Time expiration check
    Time->>Time: elapsed = currentTime - pendingAt<br/>maxTime = minuteEstimatedTime * 60 * 1000
```

### Timestamp Flow for Scheduled Signals

```mermaid
sequenceDiagram
    participant GetSignal as "GET_SIGNAL_FN"
    participant Scheduled as "IScheduledSignalRow"
    participant Activation as "ACTIVATE_SCHEDULED_SIGNAL_FN"
    participant Active as "Active Signal"
    participant Time as "Time Calculations"
    
    Note over GetSignal: Creation time
    GetSignal->>Scheduled: scheduledAt = currentTime
    GetSignal->>Scheduled: pendingAt = currentTime (temporary)
    
    Note over Scheduled: Waiting for price...<br/>pendingAt will be updated
    
    Note over Activation: Price reaches priceOpen
    Activation->>Activation: activationTime = tick timestamp
    Activation->>Active: pendingAt = activationTime
    
    Note over Active: CRITICAL UPDATE:<br/>pendingAt now reflects actual activation<br/>Duration counts from here
    
    Active->>Time: Time expiration check
    Time->>Time: elapsed = currentTime - pendingAt<br/>maxTime = minuteEstimatedTime * 60 * 1000
    
    Note over Time: Accurate duration from activation<br/>not from scheduling
```

**Sources:** [src/client/ClientStrategy.ts:243-266](), [src/client/ClientStrategy.ts:510-515](), [src/client/ClientStrategy.ts:949-954](), [src/client/ClientStrategy.ts:675-683]()

---

## Signal Persistence (Live Mode Only)

In live trading mode, signals are persisted to disk after every state change to enable crash recovery. The `PersistSignalAdapter` provides atomic file operations.

### Persistence Architecture

```mermaid
graph TB
    subgraph "ClientStrategy State"
        PendingSignal["_pendingSignal: ISignalRow | null"]
        ScheduledSignal["_scheduledSignal: IScheduledSignalRow | null"]
    end
    
    subgraph "PersistSignalAdapter"
        WriteSignal["writeSignalData(strategyName, symbol, data)"]
        ReadSignal["readSignalData(strategyName, symbol)"]
        FileOps["Atomic file operations<br/>signal-{strategy}-{symbol}.json"]
    end
    
    subgraph "Lifecycle Methods"
        SetPendingSignal["setPendingSignal(signal)"]
        WaitForInit["waitForInit()"]
    end
    
    subgraph "State Changes"
        OpenSignal["Signal opened"]
        UpdateSignal["Signal updated"]
        CloseSignal["Signal closed"]
    end
    
    OpenSignal --> SetPendingSignal
    UpdateSignal --> SetPendingSignal
    CloseSignal --> SetPendingSignal
    
    SetPendingSignal --> |"backtest=false"| WriteSignal
    SetPendingSignal --> |"backtest=true"| Skip["Skip persistence"]
    
    WriteSignal --> FileOps
    
    WaitForInit --> |"On strategy start"| ReadSignal
    ReadSignal --> FileOps
    ReadSignal --> PendingSignal
    
    PendingSignal -.->|"Restored state"| UpdateSignal
```

### Persistence Flow Example

```typescript
// setPendingSignal implementation
async setPendingSignal(signal: ISignalRow | null) {
  this._pendingSignal = signal;
  
  // Persist only in live mode (not backtest)
  if (!this.params.execution.context.backtest) {
    await PersistSignalAdaper.writeSignalData(
      this.params.strategyName,
      this.params.execution.context.symbol,
      signal
    );
  }
}

// waitForInit implementation
async waitForInit() {
  if (this.params.execution.context.backtest) {
    return; // No persistence in backtest
  }
  
  const pendingSignal = await PersistSignalAdaper.readSignalData(
    this.params.strategyName,
    this.params.execution.context.symbol
  );
  
  if (pendingSignal) {
    this._pendingSignal = pendingSignal;
    
    // Call onActive callback for restored signal
    if (this.params.callbacks?.onActive) {
      const currentPrice = await this.params.exchange.getAveragePrice(
        this.params.execution.context.symbol
      );
      this.params.callbacks.onActive(
        this.params.execution.context.symbol,
        pendingSignal,
        currentPrice,
        false // backtest=false
      );
    }
  }
}
```

**Note:** Scheduled signals (`_scheduledSignal`) are NOT persisted. Only active positions (`_pendingSignal`) survive crashes.

**Sources:** [src/client/ClientStrategy.ts:1068-1081](), [src/client/ClientStrategy.ts:298-330](), [src/classes/Persist.ts:1-300]()

---

## PnL Calculation

Profit and loss is calculated by `toProfitLossDto` which applies trading fees and slippage to both entry and exit prices.

### Fee and Slippage Model

```mermaid
graph LR
    subgraph "Entry Price Adjustments"
        EntryBase["signal.priceOpen"]
        EntrySlippage["Apply slippage: 0.1%"]
        EntryFee["Apply fee: 0.1%"]
        AdjustedEntry["Adjusted priceOpen"]
    end
    
    subgraph "Exit Price Adjustments"
        ExitBase["priceClose (TP/SL/current)"]
        ExitSlippage["Apply slippage: 0.1%"]
        ExitFee["Apply fee: 0.1%"]
        AdjustedExit["Adjusted priceClose"]
    end
    
    subgraph "PnL Calculation"
        CalcLong["Long: ((exit - entry) / entry) * 100"]
        CalcShort["Short: ((entry - exit) / entry) * 100"]
        PnlResult["IStrategyPnL<br/>pnlPercentage<br/>priceOpen (adjusted)<br/>priceClose (adjusted)"]
    end
    
    EntryBase --> EntrySlippage
    EntrySlippage --> EntryFee
    EntryFee --> AdjustedEntry
    
    ExitBase --> ExitSlippage
    ExitSlippage --> ExitFee
    ExitFee --> AdjustedExit
    
    AdjustedEntry --> CalcLong
    AdjustedExit --> CalcLong
    AdjustedEntry --> CalcShort
    AdjustedExit --> CalcShort
    
    CalcLong --> PnlResult
    CalcShort --> PnlResult
```

### Long Position Example

```typescript
// Original signal
priceOpen = 100
priceTakeProfit = 101

// TP hit, calculate PnL
priceClose = 101

// Apply fees/slippage to entry
entryPrice = 100 * (1 + 0.001) * (1 + 0.001) = 100.2001

// Apply fees/slippage to exit
exitPrice = 101 * (1 - 0.001) * (1 - 0.001) = 100.797999

// Calculate PnL
pnlPercentage = ((100.797999 - 100.2001) / 100.2001) * 100 = 0.597%
```

### Short Position Example

```typescript
// Original signal
priceOpen = 100
priceTakeProfit = 99

// TP hit, calculate PnL
priceClose = 99

// Apply fees/slippage to entry (worse price for short = lower)
entryPrice = 100 * (1 - 0.001) * (1 - 0.001) = 99.7999

// Apply fees/slippage to exit (worse price for short = higher)
exitPrice = 99 * (1 + 0.001) * (1 + 0.001) = 99.198001

// Calculate PnL
pnlPercentage = ((99.7999 - 99.198001) / 99.7999) * 100 = 0.603%
```

**Note:** The `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` default of 0.3% accounts for the 0.2% total fees (entry + exit), ensuring profitable trades after costs.

**Sources:** [src/helpers/toProfitLossDto.ts:1-50](), [types.d.ts:16-20]()

---

## Backtest vs Live Lifecycle Differences

The signal lifecycle behaves differently in backtest and live modes due to timing and data availability constraints.

| Aspect | Backtest Mode | Live Mode |
|--------|---------------|-----------|
| **Time Source** | Historical candle timestamps | `Date.now()` |
| **Signal Generation** | Once per candle timestamp | Throttled by real time + `INTERVAL_MINUTES` |
| **TP/SL Detection** | Check `candle.high` and `candle.low` | Check VWAP from `getAveragePrice()` |
| **Fast-Forward** | `strategy.backtest(candles)` processes all at once | `strategy.tick()` processes one tick at a time |
| **Scheduled Activation Timestamp** | `candle.timestamp + 60*1000` (next candle) | Actual tick time when detected |
| **Persistence** | None | `PersistSignalAdapter` writes to disk |
| **Crash Recovery** | N/A | `waitForInit()` restores state |
| **Callbacks** | `backtest=true` flag | `backtest=false` flag |

### Backtest Fast-Forward Algorithm

```mermaid
graph TB
    BacktestCall["strategy.backtest(candles)"]
    CheckScheduled["Check _scheduledSignal"]
    
    subgraph "Scheduled Signal Monitoring"
        IterateScheduled["For each candle"]
        CheckTimeout1["Check timeout"]
        CalcVWAP1["Calculate VWAP"]
        CheckActivation["CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN"]
        ActivateSignal["ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN<br/>pendingAt = candle.timestamp + 60*1000"]
        ContinueToMonitoring["Continue to TP/SL monitoring"]
    end
    
    subgraph "Active Signal Monitoring"
        IterateActive["For each remaining candle"]
        CheckTimeout2["Check time expiration"]
        CheckHigh["Check candle.high vs priceTakeProfit"]
        CheckLow["Check candle.low vs priceStopLoss"]
        CloseSignal["CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN"]
        ReturnClosed["Return IStrategyTickResultClosed"]
    end
    
    BacktestCall --> CheckScheduled
    CheckScheduled --> |"Scheduled signal"| IterateScheduled
    CheckScheduled --> |"No scheduled"| ReturnCancelled["Return IStrategyTickResultCancelled"]
    
    IterateScheduled --> CheckTimeout1
    CheckTimeout1 --> |"Timeout"| CancelScheduled["Return IStrategyTickResultCancelled"]
    CheckTimeout1 --> |"Not timeout"| CalcVWAP1
    CalcVWAP1 --> CheckActivation
    CheckActivation --> |"SL hit"| CancelScheduled
    CheckActivation --> |"Price activated"| ActivateSignal
    CheckActivation --> |"Still waiting"| IterateScheduled
    
    ActivateSignal --> ContinueToMonitoring
    ContinueToMonitoring --> IterateActive
    
    IterateActive --> CheckTimeout2
    CheckTimeout2 --> |"Expired"| CloseSignal
    CheckTimeout2 --> |"Not expired"| CheckHigh
    CheckHigh --> |"TP hit"| CloseSignal
    CheckHigh --> |"Not hit"| CheckLow
    CheckLow --> |"SL hit"| CloseSignal
    CheckLow --> |"Not hit"| IterateActive
    
    CloseSignal --> ReturnClosed
```

**Key Optimization:** The backtest method processes all candles in a single pass without yielding control, making it significantly faster than tick-by-tick iteration.

**Sources:** [src/client/ClientStrategy.ts:1008-1177](), [src/client/ClientStrategy.ts:897-973](), [src/client/ClientStrategy.ts:975-1006]()

---

## Event Emission During Lifecycle

Every state transition emits events through Subject-based emitters, enabling observability and report generation.

```mermaid
graph TB
    subgraph "State Transitions"
        IdleState["idle state"]
        ScheduledState["scheduled state"]
        OpenedState["opened state"]
        ActiveState["active state"]
        ClosedState["closed state"]
        CancelledState["cancelled state"]
    end
    
    subgraph "Callback System"
        OnIdle["callbacks.onIdle()"]
        OnSchedule["callbacks.onSchedule()"]
        OnOpen["callbacks.onOpen()"]
        OnActive["callbacks.onActive()"]
        OnClose["callbacks.onClose()"]
        OnCancel["callbacks.onCancel()"]
        OnTick["callbacks.onTick()<br/>(always called)"]
    end
    
    subgraph "Event Emitters"
        SignalEmitter["signalEmitter.next()<br/>(all modes)"]
        BacktestEmitter["signalBacktestEmitter.next()<br/>(backtest only)"]
        LiveEmitter["signalLiveEmitter.next()<br/>(live only)"]
    end
    
    subgraph "Report Services"
        BacktestMarkdown["BacktestMarkdownService"]
        LiveMarkdown["LiveMarkdownService"]
        ScheduleMarkdown["ScheduleMarkdownService"]
    end
    
    IdleState --> OnIdle
    ScheduledState --> OnSchedule
    OpenedState --> OnOpen
    ActiveState --> OnActive
    ClosedState --> OnClose
    CancelledState --> OnCancel
    
    OnIdle --> OnTick
    OnSchedule --> OnTick
    OnOpen --> OnTick
    OnActive --> OnTick
    OnClose --> OnTick
    OnCancel --> OnTick
    
    OnTick --> SignalEmitter
    SignalEmitter --> BacktestEmitter
    SignalEmitter --> LiveEmitter
    
    BacktestEmitter --> BacktestMarkdown
    LiveEmitter --> LiveMarkdown
    SignalEmitter --> ScheduleMarkdown
```

**Event Flow:** Each state transition calls the specific lifecycle callback (e.g., `onOpen`), then always calls `onTick` with the full result. The result is then emitted to all registered listeners via the Subject pattern.

**Sources:** [src/config/emitters.ts:1-100](), [src/lib/services/connection/StrategyConnectionService.ts:104-121](), [types.d.ts:595-611]()

---

## Summary Table: Signal Lifecycle Functions

| Function | Location | Purpose | Returns |
|----------|----------|---------|---------|
| `GET_SIGNAL_FN` | [ClientStrategy.ts:187-283]() | Throttled signal generation with risk check | `ISignalRow \| IScheduledSignalRow \| null` |
| `VALIDATE_SIGNAL_FN` | [ClientStrategy.ts:40-185]() | Validate prices, TP/SL logic, distances, lifetime | `void` (throws on error) |
| `CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN` | [ClientStrategy.ts:332-386]() | Check if scheduled signal timed out | `IStrategyTickResultCancelled \| null` |
| `CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN` | [ClientStrategy.ts:388-422]() | Determine if scheduled signal should activate/cancel | `{ shouldActivate, shouldCancel }` |
| `ACTIVATE_SCHEDULED_SIGNAL_FN` | [ClientStrategy.ts:459-551]() | Convert scheduled to active signal (live) | `IStrategyTickResultOpened \| null` |
| `ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN` | [ClientStrategy.ts:897-973]() | Convert scheduled to active signal (backtest) | `boolean` |
| `OPEN_NEW_PENDING_SIGNAL_FN` | [ClientStrategy.ts:623-673]() | Create immediate entry signal | `IStrategyTickResultOpened \| null` |
| `OPEN_NEW_SCHEDULED_SIGNAL_FN` | [ClientStrategy.ts:578-621]() | Create delayed entry signal | `IStrategyTickResultScheduled` |
| `CHECK_PENDING_SIGNAL_COMPLETION_FN` | [ClientStrategy.ts:675-734]() | Check TP/SL/time conditions | `IStrategyTickResultClosed \| null` |
| `CLOSE_PENDING_SIGNAL_FN` | [ClientStrategy.ts:736-789]() | Close signal and calculate PnL (live) | `IStrategyTickResultClosed` |
| `CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN` | [ClientStrategy.ts:975-1006]() | Close signal and calculate PnL (backtest) | `IStrategyTickResultClosed` |
| `toProfitLossDto` | [toProfitLossDto.ts:1-50]() | Calculate PnL with fees/slippage | `IStrategyPnL` |

**Sources:** [src/client/ClientStrategy.ts:1-1300](), [src/helpers/toProfitLossDto.ts:1-50]()
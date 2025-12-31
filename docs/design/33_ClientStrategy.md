# ClientStrategy

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [README.md](README.md)
- [src/classes/Backtest.ts](src/classes/Backtest.ts)
- [src/classes/Live.ts](src/classes/Live.ts)
- [src/classes/Walker.ts](src/classes/Walker.ts)
- [src/client/ClientStrategy.ts](src/client/ClientStrategy.ts)
- [src/interfaces/Strategy.interface.ts](src/interfaces/Strategy.interface.ts)
- [src/lib/services/connection/StrategyConnectionService.ts](src/lib/services/connection/StrategyConnectionService.ts)
- [test/e2e/defend.test.mjs](test/e2e/defend.test.mjs)
- [test/index.mjs](test/index.mjs)

</details>



## Purpose and Scope

`ClientStrategy` implements the `IStrategy` interface defined in [src/interfaces/Strategy.interface.ts:318-388]() and serves as the core execution engine for trading signal lifecycle management. The class is instantiated by `StrategyConnectionService` with memoization per `symbol:strategyName:backtest` combination.

**Core Responsibilities:**
- **Signal Generation**: Calls user-defined `getSignal()` function with interval throttling via `GET_SIGNAL_FN`
- **Validation**: Enforces 30+ validation rules through `VALIDATE_SIGNAL_FN` before signal activation
- **State Management**: Maintains `_pendingSignal` (active positions) and `_scheduledSignal` (limit orders) with atomic persistence
- **Monitoring**: Continuously checks VWAP prices against `priceTakeProfit`, `priceStopLoss`, and `minuteEstimatedTime` in `tick()` method
- **Execution Modes**: Supports both real-time `tick()` iteration (live mode) and fast-forward `backtest()` simulation (backtest mode)

**State Machine Implementation:**
The class manages six discriminated union states: `IStrategyTickResultIdle`, `IStrategyTickResultScheduled`, `IStrategyTickResultOpened`, `IStrategyTickResultActive`, `IStrategyTickResultClosed`, `IStrategyTickResultCancelled`.

For strategy schema definitions, see [Strategy Schemas](#5.1). For signal state transitions, see [Signal Lifecycle](#8). For persistence adapters, see [Signal Persistence](#8.4).

**Sources**: [src/client/ClientStrategy.ts:1-30](), [src/interfaces/Strategy.interface.ts:318-388](), [src/interfaces/Strategy.interface.ts:76-94]()

---

## Class Architecture

`ClientStrategy` is instantiated by `StrategyConnectionService` with memoization per symbol-strategy pair. The class maintains internal state for pending and scheduled signals while delegating to injected dependencies for exchange data, risk validation, and persistence.

```mermaid
classDiagram
    class ClientStrategy {
        -_isStopped: boolean
        -_pendingSignal: ISignalRow | null
        -_scheduledSignal: IScheduledSignalRow | null
        -_lastSignalTimestamp: number | null
        +waitForInit() Promise~void~
        +tick(symbol, strategyName) Promise~IStrategyTickResult~
        +backtest(symbol, strategyName, candles) Promise~IStrategyBacktestResult~
        +stop(symbol, strategyName) Promise~void~
        +setPendingSignal(signal) Promise~void~
        +setScheduledSignal(signal) Promise~void~
        +getPendingSignal(symbol, strategyName) Promise~ISignalRow~
    }
    
    class IStrategyParams {
        +strategyName: StrategyName
        +interval: SignalInterval
        +getSignal(symbol, when) Promise~ISignalDto~
        +exchange: IExchange
        +risk: IRisk
        +partial: IPartial
        +execution: TExecutionContextService
        +method: TMethodContextService
        +logger: ILogger
        +callbacks: IStrategyCallbacks
        +riskName: RiskName
    }
    
    class IExchange {
        +getAveragePrice(symbol) Promise~number~
        +getNextCandles(symbol, interval, limit) Promise~ICandleData[]~
    }
    
    class IRisk {
        +checkSignal(params) Promise~boolean~
        +addSignal(symbol, context) Promise~void~
        +removeSignal(symbol, context) Promise~void~
    }
    
    class IPartial {
        +profit(symbol, data, price, percent, backtest, when) Promise~void~
        +loss(symbol, data, price, percent, backtest, when) Promise~void~
        +clear(symbol, data, price) Promise~void~
    }
    
    class PersistSignalAdapter {
        +readSignalData(symbol, strategyName) Promise~ISignalRow~
        +writeSignalData(signal, symbol, strategyName) Promise~void~
    }
    
    class PersistScheduleAdapter {
        +readScheduleData(symbol, strategyName) Promise~IScheduledSignalRow~
        +writeScheduleData(signal, symbol, strategyName) Promise~void~
    }
    
    ClientStrategy --> IStrategyParams : params
    ClientStrategy ..> IExchange : uses
    ClientStrategy ..> IRisk : uses
    ClientStrategy ..> IPartial : uses
    ClientStrategy ..> PersistSignalAdapter : persists to
    ClientStrategy ..> PersistScheduleAdapter : persists to
```

**State Variables:**
- `_isStopped`: Flag set by `stop()` to prevent new signal generation
- `_pendingSignal`: Currently active signal being monitored for TP/SL
- `_scheduledSignal`: Signal waiting for price to reach `priceOpen` for activation
- `_lastSignalTimestamp`: Timestamp of last `getSignal()` call for interval throttling

**Sources**: [src/client/ClientStrategy.ts:1515-1521](), [src/interfaces/Strategy.interface.ts:76-94]()

---

## Signal State Machine

The strategy manages signals through a state machine with two parallel tracks: scheduled signals (delayed entry via `_scheduledSignal`) and pending signals (active positions via `_pendingSignal`). Each state corresponds to a discriminated union type from [src/interfaces/Strategy.interface.ts:174-307]().

### State-to-Code Mapping

```mermaid
stateDiagram-v2
    [*] --> Idle: "_pendingSignal=null<br/>_scheduledSignal=null"
    
    Idle --> Throttled: "_lastSignalTimestamp<br/>check fails"
    Throttled --> Idle: "return null"
    
    Idle --> RiskCheck: "GET_SIGNAL_FN<br/>called"
    RiskCheck --> Idle: "risk.checkSignal()<br/>returns false"
    
    RiskCheck --> GetSignal: "getSignal()<br/>invoked"
    GetSignal --> Idle: "returns null"
    
    GetSignal --> Scheduled: "IScheduledSignalRow<br/>_scheduledSignal=signal<br/>PersistScheduleAdapter"
    GetSignal --> Opened: "ISignalRow<br/>_pendingSignal=signal<br/>PersistSignalAdapter"
    
    state Scheduled {
        [*] --> AwaitingActivation
        AwaitingActivation --> Cancelled: "CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN<br/>IStrategyTickResultCancelled"
        AwaitingActivation --> Cancelled: "CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN<br/>currentPrice <= priceStopLoss"
        AwaitingActivation --> PendingActivation: "CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN<br/>shouldActivate=true"
        PendingActivation --> Cancelled: "risk.checkSignal()<br/>returns false"
        PendingActivation --> Opened: "ACTIVATE_SCHEDULED_SIGNAL_FN<br/>IStrategyTickResultOpened"
    }
    
    state Opened {
        [*] --> Active
    }
    
    state Active {
        [*] --> Monitoring
        Monitoring --> PartialProfit: "ClientPartial.profit()<br/>callbacks.onPartialProfit"
        Monitoring --> PartialLoss: "ClientPartial.loss()<br/>callbacks.onPartialLoss"
        PartialProfit --> Monitoring
        PartialLoss --> Monitoring
        Monitoring --> ClosedTP: "CHECK_PENDING_SIGNAL_COMPLETION_FN<br/>currentPrice >= priceTakeProfit"
        Monitoring --> ClosedSL: "CHECK_PENDING_SIGNAL_COMPLETION_FN<br/>currentPrice <= priceStopLoss"
        Monitoring --> ClosedTimeout: "CHECK_PENDING_SIGNAL_COMPLETION_FN<br/>elapsedTime >= minuteEstimatedTime"
    }
    
    Cancelled --> [*]: "IStrategyTickResultCancelled<br/>_scheduledSignal=null"
    ClosedTP --> [*]: "IStrategyTickResultClosed<br/>closeReason=take_profit<br/>_pendingSignal=null"
    ClosedSL --> [*]: "IStrategyTickResultClosed<br/>closeReason=stop_loss<br/>_pendingSignal=null"
    ClosedTimeout --> [*]: "IStrategyTickResultClosed<br/>closeReason=time_expired<br/>_pendingSignal=null"
    
    note right of Scheduled
        State Variable: _scheduledSignal
        Type: IScheduledSignalRow | null
        Persistence: PersistScheduleAdapter
        Methods: setScheduledSignal()
    end note
    
    note right of Active
        State Variable: _pendingSignal
        Type: ISignalRow | null
        Persistence: PersistSignalAdapter
        Methods: setPendingSignal()
    end note
```

### State Variables and Types

| State | Type | Variable | Persistence Adapter | Line Reference |
|-------|------|----------|---------------------|----------------|
| Idle | `IStrategyTickResultIdle` | `_pendingSignal=null` `_scheduledSignal=null` | - | [src/client/ClientStrategy.ts:1516-1519]() |
| Scheduled | `IStrategyTickResultScheduled` | `_scheduledSignal: IScheduledSignalRow` | `PersistScheduleAdapter` | [src/client/ClientStrategy.ts:1519]() |
| Opened | `IStrategyTickResultOpened` | `_pendingSignal: ISignalRow` (just set) | `PersistSignalAdapter` | [src/client/ClientStrategy.ts:1516]() |
| Active | `IStrategyTickResultActive` | `_pendingSignal: ISignalRow` | `PersistSignalAdapter` | [src/client/ClientStrategy.ts:1516]() |
| Closed | `IStrategyTickResultClosed` | `_pendingSignal=null` (after cleanup) | - | [src/client/ClientStrategy.ts:1000]() |
| Cancelled | `IStrategyTickResultCancelled` | `_scheduledSignal=null` (after cleanup) | - | [src/client/ClientStrategy.ts:578]() |

**Sources**: [src/client/ClientStrategy.ts:1516-1519](), [src/interfaces/Strategy.interface.ts:174-307](), [src/client/ClientStrategy.ts:263-396](), [src/client/ClientStrategy.ts:554-608](), [src/client/ClientStrategy.ts:901-960]()

---

## Signal Intervals and Throttling

`ClientStrategy` enforces minimum time between `getSignal()` calls using the `interval` parameter. This prevents excessive signal generation and API rate limiting.

| Interval | Minutes | Milliseconds | Use Case |
|----------|---------|--------------|----------|
| `1m` | 1 | 60,000 | High-frequency scalping |
| `3m` | 3 | 180,000 | Fast momentum strategies |
| `5m` | 5 | 300,000 | Short-term swing trading |
| `15m` | 15 | 900,000 | Medium-term position trading |
| `30m` | 30 | 1,800,000 | Longer-term strategies |
| `1h` | 60 | 3,600,000 | Daily trading strategies |

**Throttling Implementation:**

```mermaid
flowchart LR
    Start["tick() called"] --> CheckTime{"currentTime -<br/>_lastSignalTimestamp<br/>< intervalMs?"}
    CheckTime -->|Yes| ReturnNull["return null<br/>(throttled)"]
    CheckTime -->|No| UpdateTime["_lastSignalTimestamp =<br/>currentTime"]
    UpdateTime --> CallGetSignal["await getSignal()"]
    CallGetSignal --> ProcessSignal["Process signal"]
```

**Sources**: [src/client/ClientStrategy.ts:32-39](), [src/client/ClientStrategy.ts:271-284](), [src/interfaces/Strategy.interface.ts:12-18]()

---

## Method: waitForInit()

Initializes strategy state by loading persisted signals from disk (live mode only). Uses `singleshot` pattern to ensure execution exactly once per instance.

```typescript
// Usage in LiveLogicPrivateService
const strategy = await strategyConnection.getStrategy(symbol, strategyName);
await strategy.waitForInit();
```

**Behavior:**
1. **Backtest mode**: Returns immediately (no persistence)
2. **Live mode**: 
   - Reads `_pendingSignal` from `PersistSignalAdapter`
   - Reads `_scheduledSignal` from `PersistScheduleAdapter`
   - Validates exchangeName/strategyName match
   - Triggers `onActive` or `onSchedule` callbacks for restored signals

**State Restoration Flow:**

```mermaid
sequenceDiagram
    participant LS as LiveLogicPrivateService
    participant CS as ClientStrategy
    participant PSA as PersistSignalAdapter
    participant PSCHA as PersistScheduleAdapter
    
    LS->>CS: waitForInit()
    
    alt backtest mode
        CS-->>LS: return (no-op)
    else live mode
        CS->>PSA: readSignalData(symbol, strategyName)
        PSA-->>CS: ISignalRow | null
        
        alt pending signal exists
            CS->>CS: _pendingSignal = restored signal
            CS->>CS: callbacks.onActive()
        end
        
        CS->>PSCHA: readScheduleData(symbol, strategyName)
        PSCHA-->>CS: IScheduledSignalRow | null
        
        alt scheduled signal exists
            CS->>CS: _scheduledSignal = restored signal
            CS->>CS: callbacks.onSchedule()
        end
        
        CS-->>LS: initialized
    end
```

**Sources**: [src/client/ClientStrategy.ts:411-472](), [src/client/ClientStrategy.ts:1532]()

---

## Method: tick()

Performs a single iteration of strategy execution, handling signal generation, validation, monitoring, and closure.

### Execution Flow (Live Mode)

```mermaid
flowchart TD
    Start["tick(symbol, strategyName)"] --> CheckStopped{"_isStopped?"}
    CheckStopped -->|Yes| ReturnIdle1["RETURN_IDLE_FN"]
    
    CheckStopped -->|No| HasScheduled{"_scheduledSignal &&<br/>!_pendingSignal?"}
    
    HasScheduled -->|Yes| CheckTimeout["CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN"]
    CheckTimeout --> TimeoutResult{"timeout?"}
    TimeoutResult -->|Yes| ReturnCancelled1["return IStrategyTickResultCancelled"]
    
    TimeoutResult -->|No| CheckActivation["CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN"]
    CheckActivation --> ActivationCheck{"shouldActivate?<br/>shouldCancel?"}
    
    ActivationCheck -->|shouldCancel| CancelScheduled["CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN"]
    CancelScheduled --> ReturnIdle2["return IStrategyTickResultIdle"]
    
    ActivationCheck -->|shouldActivate| ActivateScheduled["ACTIVATE_SCHEDULED_SIGNAL_FN"]
    ActivateScheduled --> ActivateResult{"activated?"}
    ActivateResult -->|Yes| ReturnOpened1["return IStrategyTickResultOpened"]
    ActivateResult -->|No| ReturnIdle3["return IStrategyTickResultIdle"]
    
    ActivationCheck -->|neither| ReturnActive1["RETURN_SCHEDULED_SIGNAL_ACTIVE_FN"]
    ReturnActive1 --> ReturnActiveResult1["return IStrategyTickResultActive"]
    
    HasScheduled -->|No| HasPending{"_pendingSignal?"}
    
    HasPending -->|No| GetSignal["GET_SIGNAL_FN"]
    GetSignal --> SignalResult{"signal?"}
    
    SignalResult -->|null| ReturnIdle4["RETURN_IDLE_FN"]
    
    SignalResult -->|IScheduledSignalRow| SetScheduled["setScheduledSignal(signal)"]
    SetScheduled --> OpenScheduled["OPEN_NEW_SCHEDULED_SIGNAL_FN"]
    OpenScheduled --> ReturnScheduled["return IStrategyTickResultScheduled"]
    
    SignalResult -->|ISignalRow| SetPending["setPendingSignal(signal)"]
    SetPending --> OpenPending["OPEN_NEW_PENDING_SIGNAL_FN"]
    OpenPending --> OpenResult{"risk approved?"}
    OpenResult -->|Yes| ReturnOpened2["return IStrategyTickResultOpened"]
    OpenResult -->|No| ClearPending["setPendingSignal(null)"]
    ClearPending --> ReturnIdle5["return IStrategyTickResultIdle"]
    
    HasPending -->|Yes| GetVWAP["exchange.getAveragePrice()"]
    GetVWAP --> CheckCompletion["CHECK_PENDING_SIGNAL_COMPLETION_FN"]
    CheckCompletion --> CompletionResult{"closed?"}
    
    CompletionResult -->|Yes| ReturnClosed["return IStrategyTickResultClosed"]
    CompletionResult -->|No| ReturnActive2["RETURN_PENDING_SIGNAL_ACTIVE_FN"]
    ReturnActive2 --> ReturnActiveResult2["return IStrategyTickResultActive"]
```

**Key Decision Points:**
1. **Stopped check**: Early return if `stop()` was called
2. **Scheduled signal monitoring**: Check timeout and price activation
3. **Signal generation**: Call `getSignal()` with throttling if no active signal
4. **Pending signal monitoring**: Check VWAP against TP/SL and time expiration

**Sources**: [src/client/ClientStrategy.ts:1639-1753]()

---

## Method: backtest()

Fast-forwards through historical candle data to simulate signal lifecycle without real-time waiting. Processes entire signal duration in one call.

### Backtest Flow

```mermaid
flowchart TD
    Start["backtest(symbol, strategyName, candles)"] --> ValidateContext{"backtest context?"}
    ValidateContext -->|No| ThrowError1["throw Error:<br/>'running in live context'"]
    
    ValidateContext -->|Yes| HasSignal{"_pendingSignal ||<br/>_scheduledSignal?"}
    HasSignal -->|No| ThrowError2["throw Error:<br/>'no pending or scheduled signal'"]
    
    HasSignal -->|Yes| TypeCheck{"signal type?"}
    
    TypeCheck -->|scheduled| ProcessScheduled["PROCESS_SCHEDULED_SIGNAL_CANDLES_FN"]
    ProcessScheduled --> ScheduledResult{"result?"}
    
    ScheduledResult -->|cancelled| ReturnCancelled["return IStrategyTickResultCancelled"]
    
    ScheduledResult -->|activated| SliceCandles["remainingCandles =<br/>candles.slice(activationIndex + 1)"]
    SliceCandles --> CheckRemaining{"remainingCandles.length > 0?"}
    
    CheckRemaining -->|No| CalculateLastPrice["lastPrice = GET_AVG_PRICE_FN"]
    CalculateLastPrice --> CloseImmediate["CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN<br/>('time_expired')"]
    CloseImmediate --> ReturnClosed1["return IStrategyTickResultClosed"]
    
    CheckRemaining -->|Yes| UpdateCandles["candles = remainingCandles"]
    UpdateCandles --> ProcessPending["PROCESS_PENDING_SIGNAL_CANDLES_FN"]
    
    ScheduledResult -->|still_waiting| CheckTimeout{"timeout?"}
    CheckTimeout -->|Yes| CancelTimeout["CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN"]
    CancelTimeout --> ReturnCancelled2["return IStrategyTickResultCancelled"]
    CheckTimeout -->|No| ReturnActive["return IStrategyTickResultActive"]
    
    TypeCheck -->|pending| ProcessPending
    
    ProcessPending --> PendingResult{"closed?"}
    PendingResult -->|Yes| ReturnClosed2["return IStrategyTickResultClosed"]
    
    PendingResult -->|No| GetLastPrice["lastPrice = GET_AVG_PRICE_FN(candles)"]
    GetLastPrice --> CloseTimeout["CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN<br/>('time_expired')"]
    CloseTimeout --> ReturnClosed3["return IStrategyTickResultClosed"]
```

**Scheduled Signal Processing Logic:**

For scheduled signals, the backtest must first determine if/when activation occurs:

```mermaid
sequenceDiagram
    participant BT as backtest()
    participant PSSCF as PROCESS_SCHEDULED_SIGNAL_CANDLES_FN
    participant Candles as Candle Array
    
    BT->>PSSCF: process scheduled signal
    
    loop for each candle
        PSSCF->>Candles: get candle[i]
        PSSCF->>PSSCF: calculate VWAP
        
        alt timeout reached
            PSSCF->>PSSCF: CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN
            PSSCF-->>BT: { cancelled: true, result }
        else LONG: candle.low <= priceStopLoss
            Note over PSSCF: SL hit BEFORE activation
            PSSCF->>PSSCF: CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN
            PSSCF-->>BT: { cancelled: true, result }
        else SHORT: candle.high >= priceStopLoss
            Note over PSSCF: SL hit BEFORE activation
            PSSCF->>PSSCF: CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN
            PSSCF-->>BT: { cancelled: true, result }
        else LONG: candle.low <= priceOpen
            Note over PSSCF: Activation reached
            PSSCF->>PSSCF: ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN
            PSSCF-->>BT: { activated: true, activationIndex: i }
        else SHORT: candle.high >= priceOpen
            Note over PSSCF: Activation reached
            PSSCF->>PSSCF: ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN
            PSSCF-->>BT: { activated: true, activationIndex: i }
        else still waiting
            Note over PSSCF: Continue to next candle
        end
    end
    
    alt not activated and not cancelled
        PSSCF-->>BT: { activated: false, cancelled: false }
    end
```

**VWAP Calculation Window:**

Uses last N candles (default 5) for VWAP calculation, configurable via `CC_AVG_PRICE_CANDLES_COUNT`:

```
Candle Index:  0    1    2    3    4    5    6    7
               [----][----][----][----][====][====][====][====]
                                        ^              ^
                                        |              |
                                   Start here     Current position
                                   (i=4)          Uses candles 3-7
```

**Sources**: [src/client/ClientStrategy.ts:1781-1949](), [src/client/ClientStrategy.ts:1263-1357](), [src/client/ClientStrategy.ts:1359-1486]()

---

## Method: stop()

Gracefully stops new signal generation while allowing active positions to close naturally.

**Behavior:**
- Sets `_isStopped = true` to prevent `getSignal()` calls
- Clears `_scheduledSignal` if exists (not yet activated)
- Does **NOT** force-close `_pendingSignal` (continues monitoring)

```mermaid
sequenceDiagram
    participant User
    participant CS as ClientStrategy
    participant PSA as PersistScheduleAdapter
    
    User->>CS: stop(symbol, strategyName)
    CS->>CS: _isStopped = true
    
    alt _scheduledSignal exists
        CS->>PSA: setScheduledSignal(null)
        PSA->>PSA: delete schedule file
        PSA-->>CS: done
    end
    
    Note over CS: _pendingSignal NOT cleared<br/>Will continue monitoring<br/>until TP/SL/time_expired
    
    CS-->>User: stopped
    
    Note over User,CS: Subsequent tick() calls will:<br/>1. Skip getSignal()<br/>2. Continue monitoring _pendingSignal<br/>3. Return idle after signal closes
```

**Sources**: [src/client/ClientStrategy.ts:1969-1983]()

---

## Signal Generation Pipeline

The `GET_SIGNAL_FN` helper orchestrates multi-stage validation before creating signals.

```mermaid
flowchart TD
    Start["GET_SIGNAL_FN(self)"] --> CheckStopped{"_isStopped?"}
    CheckStopped -->|Yes| ReturnNull1["return null"]
    
    CheckStopped -->|No| CheckInterval["Check interval throttling"]
    CheckInterval --> IntervalCheck{"elapsed > interval?"}
    IntervalCheck -->|No| ReturnNull2["return null (throttled)"]
    
    IntervalCheck -->|Yes| UpdateTimestamp["_lastSignalTimestamp = currentTime"]
    UpdateTimestamp --> GetVWAP["currentPrice = exchange.getAveragePrice()"]
    
    GetVWAP --> RiskCheck["risk.checkSignal(params)"]
    RiskCheck --> RiskResult{"approved?"}
    RiskResult -->|No| ReturnNull3["return null (risk rejected)"]
    
    RiskResult -->|Yes| CallGetSignal["signalDto = await getSignal(symbol, when)"]
    CallGetSignal --> DtoResult{"signalDto?"}
    DtoResult -->|null| ReturnNull4["return null (no signal)"]
    
    DtoResult -->|ISignalDto| CheckPriceOpen{"priceOpen provided?"}
    
    CheckPriceOpen -->|Yes| CheckActivation{"priceOpen already<br/>reached by currentPrice?"}
    
    CheckActivation -->|Yes| CreateImmediate["Create ISignalRow<br/>with priceOpen from DTO<br/>_isScheduled = false"]
    CreateImmediate --> ValidateImmediate["VALIDATE_SIGNAL_FN(signal, currentPrice, false)"]
    ValidateImmediate --> ReturnImmediate["return ISignalRow"]
    
    CheckActivation -->|No| CreateScheduled["Create IScheduledSignalRow<br/>_isScheduled = true"]
    CreateScheduled --> ValidateScheduled["VALIDATE_SIGNAL_FN(scheduled, currentPrice, true)"]
    ValidateScheduled --> ReturnScheduled["return IScheduledSignalRow"]
    
    CheckPriceOpen -->|No| CreateStandard["Create ISignalRow<br/>priceOpen = currentPrice<br/>_isScheduled = false"]
    CreateStandard --> ValidateStandard["VALIDATE_SIGNAL_FN(signal, currentPrice, false)"]
    ValidateStandard --> ReturnStandard["return ISignalRow"]
```

**Validation Stages:**

| Stage | Check | Action |
|-------|-------|--------|
| 1. Stopped | `_isStopped === true` | Return null |
| 2. Throttling | `currentTime - _lastSignalTimestamp < intervalMs` | Return null |
| 3. Risk Gate | `risk.checkSignal()` returns false | Return null |
| 4. Signal Generation | `getSignal()` returns null | Return null |
| 5. Signal Validation | `VALIDATE_SIGNAL_FN()` throws | Error logged, return null |

**Sources**: [src/client/ClientStrategy.ts:263-396]()

---

## Signal Validation Rules

`VALIDATE_SIGNAL_FN` enforces 30+ validation rules to prevent invalid trades. All validations occur **before** signal activation.

### Required Field Checks

```typescript
// Validation failures throw Error with detailed message
const errors: string[] = [];

// Field presence validation
if (signal.id === undefined || signal.id === null || signal.id === '') {
  errors.push('id is required and must be a non-empty string');
}
if (signal.position === undefined || signal.position === null) {
  errors.push('position is required and must be "long" or "short"');
}
```

### Price Validation Rules

```mermaid
flowchart TD
    Start["VALIDATE_SIGNAL_FN(signal, currentPrice, isScheduled)"] --> ValidateFields["Validate required fields"]
    
    ValidateFields --> ValidateNaN["Check NaN/Infinity:<br/>- currentPrice<br/>- priceOpen<br/>- priceTakeProfit<br/>- priceStopLoss"]
    
    ValidateNaN --> ValidatePositive["Check positive values:<br/>All prices > 0"]
    
    ValidatePositive --> PositionCheck{"position?"}
    
    PositionCheck -->|long| LongChecks["LONG Validations:<br/>- TP > Open<br/>- SL < Open"]
    
    LongChecks --> LongDistanceTP["TP Distance Check:<br/>(TP - Open) / Open * 100<br/>> CC_MIN_TAKEPROFIT_DISTANCE_PERCENT"]
    
    LongDistanceTP --> LongDistanceSL["SL Distance Check:<br/>(Open - SL) / Open * 100<br/>< CC_MAX_STOPLOSS_DISTANCE_PERCENT"]
    
    LongDistanceSL --> LongImmediate{"isScheduled?"}
    LongImmediate -->|No| LongCurrentPrice["Current Price Checks:<br/>- currentPrice < SL → error<br/>- currentPrice > TP → error"]
    
    PositionCheck -->|short| ShortChecks["SHORT Validations:<br/>- TP < Open<br/>- SL > Open"]
    
    ShortChecks --> ShortDistanceTP["TP Distance Check:<br/>(Open - TP) / Open * 100<br/>> CC_MIN_TAKEPROFIT_DISTANCE_PERCENT"]
    
    ShortDistanceTP --> ShortDistanceSL["SL Distance Check:<br/>(SL - Open) / Open * 100<br/>< CC_MAX_STOPLOSS_DISTANCE_PERCENT"]
    
    ShortDistanceSL --> ShortImmediate{"isScheduled?"}
    ShortImmediate -->|No| ShortCurrentPrice["Current Price Checks:<br/>- currentPrice > SL → error<br/>- currentPrice < TP → error"]
    
    LongImmediate -->|Yes| TimeChecks
    ShortImmediate -->|Yes| TimeChecks
    LongCurrentPrice --> TimeChecks
    ShortCurrentPrice --> TimeChecks
    
    TimeChecks["Time Validation:<br/>- minuteEstimatedTime > 0<br/>- Integer value<br/>- < CC_MAX_SIGNAL_LIFETIME_MINUTES"]
    
    TimeChecks --> TimestampChecks["Timestamp Validation:<br/>- scheduledAt > 0<br/>- pendingAt > 0"]
    
    TimestampChecks --> ErrorCheck{"errors.length > 0?"}
    ErrorCheck -->|Yes| ThrowError["throw Error with all errors"]
    ErrorCheck -->|No| Success["Validation passed"]
```

### Configuration Parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | 0.3% | Minimum TP distance to cover fees (2×0.1%) + profit |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | 20% | Maximum SL distance to prevent catastrophic losses |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 (1 day) | Maximum signal duration to prevent eternal positions |
| `CC_AVG_PRICE_CANDLES_COUNT` | 5 | Number of candles for VWAP calculation |
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 (2 hours) | Maximum wait time for scheduled signal activation |

**Edge Case Protection:**

For immediate (non-scheduled) signals:
- **LONG**: `currentPrice < priceStopLoss` → Error (would immediately trigger SL)
- **LONG**: `currentPrice > priceTakeProfit` → Error (profit opportunity already passed)
- **SHORT**: `currentPrice > priceStopLoss` → Error (would immediately trigger SL)
- **SHORT**: `currentPrice < priceTakeProfit` → Error (profit opportunity already passed)

**Sources**: [src/client/ClientStrategy.ts:41-261](), [types.d.ts:5-72]()

---

## Scheduled Signal Lifecycle

Scheduled signals implement delayed entry at specific price points with pre-activation cancellation logic.

### Activation Decision Tree

```mermaid
flowchart TD
    Start["Scheduled Signal Monitoring"] --> GetPrice["currentPrice = exchange.getAveragePrice()"]
    
    GetPrice --> CheckTimeout{"elapsedTime ><br/>CC_SCHEDULE_AWAIT_MINUTES?"}
    CheckTimeout -->|Yes| CancelTimeout["Cancel by timeout"]
    CancelTimeout --> EmitCancelled1["Emit IStrategyTickResultCancelled"]
    
    CheckTimeout -->|No| PositionCheck{"position?"}
    
    PositionCheck -->|long| LongLogic["LONG Logic:<br/>- Waiting for price to DROP<br/>- priceOpen > priceStopLoss"]
    
    LongLogic --> LongCheck{"candle state?"}
    LongCheck -->|"low <= priceStopLoss"| CancelLongSL["Cancel (SL hit)"]
    CancelLongSL --> EmitCancelled2["Emit IStrategyTickResultCancelled"]
    
    LongCheck -->|"low <= priceOpen"| ActivateLong["Activate signal"]
    ActivateLong --> LongRisk["risk.checkSignal()"]
    LongRisk --> LongRiskResult{"approved?"}
    LongRiskResult -->|No| CancelLongRisk["Cancel (risk rejected)"]
    CancelLongRisk --> EmitCancelled3["Emit IStrategyTickResultCancelled"]
    LongRiskResult -->|Yes| OpenLong["Convert to pending signal<br/>pendingAt = activationTime"]
    OpenLong --> EmitOpened1["Emit IStrategyTickResultOpened"]
    
    LongCheck -->|"still waiting"| EmitActive1["Emit IStrategyTickResultActive"]
    
    PositionCheck -->|short| ShortLogic["SHORT Logic:<br/>- Waiting for price to RISE<br/>- priceOpen < priceStopLoss"]
    
    ShortLogic --> ShortCheck{"candle state?"}
    ShortCheck -->|"high >= priceStopLoss"| CancelShortSL["Cancel (SL hit)"]
    CancelShortSL --> EmitCancelled4["Emit IStrategyTickResultCancelled"]
    
    ShortCheck -->|"high >= priceOpen"| ActivateShort["Activate signal"]
    ActivateShort --> ShortRisk["risk.checkSignal()"]
    ShortRisk --> ShortRiskResult{"approved?"}
    ShortRiskResult -->|No| CancelShortRisk["Cancel (risk rejected)"]
    CancelShortRisk --> EmitCancelled5["Emit IStrategyTickResultCancelled"]
    ShortRiskResult -->|Yes| OpenShort["Convert to pending signal<br/>pendingAt = activationTime"]
    OpenShort --> EmitOpened2["Emit IStrategyTickResultOpened"]
    
    ShortCheck -->|"still waiting"| EmitActive2["Emit IStrategyTickResultActive"]
```

### Cancellation Priority Logic

**Critical**: For scheduled signals, StopLoss cancellation has **priority over activation** when both conditions occur on the same candle.

**LONG Position:**
```typescript
if (candle.low <= priceStopLoss) {
  // Cancel FIRST - even if candle.low also <= priceOpen
  shouldCancel = true;
} else if (candle.low <= priceOpen) {
  // Only activate if SL NOT hit
  shouldActivate = true;
}
```

**SHORT Position:**
```typescript
if (candle.high >= priceStopLoss) {
  // Cancel FIRST - even if candle.high also >= priceOpen
  shouldCancel = true;
} else if (candle.high >= priceOpen) {
  // Only activate if SL NOT hit
  shouldActivate = true;
}
```

**Rationale**: If price moves past StopLoss before or simultaneously with reaching priceOpen, the market conditions have invalidated the trade setup. Signal should be cancelled rather than opening a position that will immediately hit StopLoss.

**Sources**: [src/client/ClientStrategy.ts:530-564](), [src/client/ClientStrategy.ts:1263-1357](), [src/client/ClientStrategy.ts:1296-1327]()

---

## Pending Signal Monitoring

Once activated, pending signals are continuously monitored for Take Profit, Stop Loss, or time expiration.

### TP/SL Check Logic

```mermaid
flowchart TD
    Start["Pending Signal Monitoring"] --> GetVWAP["currentPrice = exchange.getAveragePrice()"]
    
    GetVWAP --> CheckTime["elapsedTime = currentTime - pendingAt"]
    CheckTime --> TimeExpired{"elapsedTime ><br/>minuteEstimatedTime?"}
    TimeExpired -->|Yes| CloseTimeout["Close 'time_expired'<br/>priceClose = currentPrice"]
    
    TimeExpired -->|No| PositionType{"position?"}
    
    PositionType -->|long| LongTP{"currentPrice ><br/>priceTakeProfit?"}
    LongTP -->|Yes| CloseLongTP["Close 'take_profit'<br/>priceClose = priceTakeProfit"]
    
    LongTP -->|No| LongSL{"currentPrice <<br/>priceStopLoss?"}
    LongSL -->|Yes| CloseLongSL["Close 'stop_loss'<br/>priceClose = priceStopLoss"]
    
    LongSL -->|No| LongPartial["Calculate revenue %:<br/>(currentPrice - priceOpen) / priceOpen * 100"]
    LongPartial --> LongPartialCheck{"revenue > 0?"}
    LongPartialCheck -->|Yes| LongProfit["partial.profit()<br/>onPartialProfit callback"]
    LongPartialCheck -->|No| LongLoss["partial.loss()<br/>onPartialLoss callback"]
    
    PositionType -->|short| ShortTP{"currentPrice <<br/>priceTakeProfit?"}
    ShortTP -->|Yes| CloseShortTP["Close 'take_profit'<br/>priceClose = priceTakeProfit"]
    
    ShortTP -->|No| ShortSL{"currentPrice ><br/>priceStopLoss?"}
    ShortSL -->|Yes| CloseShortSL["Close 'stop_loss'<br/>priceClose = priceStopLoss"]
    
    ShortSL -->|No| ShortPartial["Calculate revenue %:<br/>(priceOpen - currentPrice) / priceOpen * 100"]
    ShortPartial --> ShortPartialCheck{"revenue > 0?"}
    ShortPartialCheck -->|Yes| ShortProfit["partial.profit()<br/>onPartialProfit callback"]
    ShortPartialCheck -->|No| ShortLoss["partial.loss()<br/>onPartialLoss callback"]
    
    LongProfit --> ContinueActive1["Return IStrategyTickResultActive"]
    LongLoss --> ContinueActive2["Return IStrategyTickResultActive"]
    ShortProfit --> ContinueActive3["Return IStrategyTickResultActive"]
    ShortLoss --> ContinueActive4["Return IStrategyTickResultActive"]
    
    CloseTimeout --> CalculatePnL1["Calculate PnL"]
    CloseLongTP --> CalculatePnL2["Calculate PnL"]
    CloseLongSL --> CalculatePnL3["Calculate PnL"]
    CloseShortTP --> CalculatePnL4["Calculate PnL"]
    CloseShortSL --> CalculatePnL5["Calculate PnL"]
    
    CalculatePnL1 --> Cleanup1["Clean up state"]
    CalculatePnL2 --> Cleanup1
    CalculatePnL3 --> Cleanup1
    CalculatePnL4 --> Cleanup1
    CalculatePnL5 --> Cleanup1
    
    Cleanup1 --> EmitClosed["Emit IStrategyTickResultClosed"]
```

### Closure Cleanup Sequence

When a signal closes, multiple cleanup operations execute:

```mermaid
sequenceDiagram
    participant CS as ClientStrategy
    participant Partial as ClientPartial
    participant Risk as ClientRisk
    participant PSA as PersistSignalAdapter
    participant CB as Callbacks
    
    CS->>CS: Calculate PnL (toProfitLossDto)
    
    CS->>CB: onClose(symbol, signal, priceClose, backtest)
    
    CS->>Partial: clear(symbol, signal, priceClose)
    Note over Partial: Remove profit/loss<br/>level tracking
    
    CS->>Risk: removeSignal(symbol, { strategyName, riskName })
    Note over Risk: Decrement active<br/>position count
    
    CS->>CS: setPendingSignal(null)
    CS->>PSA: writeSignalData(null, symbol, strategyName)
    Note over PSA: Delete signal file<br/>(live mode only)
    
    CS->>CB: onTick(symbol, IStrategyTickResultClosed, backtest)
    
    CS-->>CS: Return IStrategyTickResultClosed
```

**Sources**: [src/client/ClientStrategy.ts:817-876](), [src/client/ClientStrategy.ts:878-938](), [src/client/ClientStrategy.ts:940-1022]()

---

## Persistence Integration

`ClientStrategy` uses atomic file writes for crash-safe state persistence in live mode.

### Persistence Adapters

```mermaid
classDiagram
    class PersistSignalAdapter {
        +readSignalData(symbol, strategyName) Promise~ISignalRow~
        +writeSignalData(signal, symbol, strategyName) Promise~void~
    }
    
    class PersistScheduleAdapter {
        +readScheduleData(symbol, strategyName) Promise~IScheduledSignalRow~
        +writeScheduleData(signal, symbol, strategyName) Promise~void~
    }
    
    class PersistBase {
        <<interface>>
        +readValue(key) Promise~string~
        +writeValue(key, value) Promise~void~
        +hasValue(key) Promise~boolean~
        +removeValue(key) Promise~void~
    }
    
    PersistSignalAdapter ..> PersistBase : uses
    PersistScheduleAdapter ..> PersistBase : uses
```

### Write Operations

| Method | Trigger | Persistence Call | Backtest Behavior |
|--------|---------|------------------|-------------------|
| `setPendingSignal()` | Signal opened/closed | `PersistSignalAdapter.writeSignalData()` | Calls `onWrite` callback only |
| `setScheduledSignal()` | Scheduled signal created/cancelled | `PersistScheduleAdapter.writeScheduleData()` | Skipped |

**File Paths** (default implementation):
- Pending signal: `./persist/signal-{symbol}-{strategyName}.json`
- Scheduled signal: `./persist/schedule-{symbol}-{strategyName}.json`

### State Restoration Guarantees

**Atomic Write**: All persistence operations use atomic file writes (write-temp-rename pattern) to prevent corruption during crashes.

**Validation on Load**: 
```typescript
// waitForInit() validates restored signals
if (pendingSignal.exchangeName !== self.params.method.context.exchangeName) {
  return; // Ignore mismatched exchange
}
if (pendingSignal.strategyName !== self.params.method.context.strategyName) {
  return; // Ignore mismatched strategy
}
```

**Callback Invocation**: Restored signals trigger lifecycle callbacks:
- `onActive` for restored `_pendingSignal`
- `onSchedule` for restored `_scheduledSignal`

**Sources**: [src/client/ClientStrategy.ts:1543-1568](), [src/client/ClientStrategy.ts:1579-1594](), [src/client/ClientStrategy.ts:411-472]()

---

## Live Mode vs Backtest Mode Differences

`ClientStrategy` behavior diverges based on the `execution.context.backtest` flag.

| Feature | Live Mode (`backtest=false`) | Backtest Mode (`backtest=true`) |
|---------|----------------------------|----------------------------------|
| **Time Source** | `new Date()` at each `tick()` | `when` from `ExecutionContextService` |
| **Candle Processing** | VWAP from `getAveragePrice()` | Array processing in `backtest()` |
| **Persistence** | All state changes persisted | No persistence (in-memory only) |
| **State Restoration** | `waitForInit()` loads from disk | `waitForInit()` no-op |
| **Scheduled Activation** | Real-time price checks on each `tick()` | Candle-by-candle in `backtest()` |
| **Partial Callbacks** | Called on each `tick()` | Called on each candle iteration |
| **Time Progression** | 61-second sleep between ticks | Instant (skip-ahead optimization) |

### Live Mode Tick Flow

```typescript
// LiveLogicPrivateService
while (true) {
  const result = await strategy.tick(symbol, strategyName);
  
  if (result.action === "opened" || result.action === "closed") {
    yield result; // Stream to listener
  }
  
  await sleep(TICK_TTL); // 61 seconds
}
```

### Backtest Mode Flow

```typescript
// BacktestLogicPrivateService
for (const when of timeframes) {
  const result = await strategy.tick(symbol, strategyName);
  
  if (result.action === "scheduled" || result.action === "opened") {
    // Fetch future candles
    const candles = await exchange.getNextCandles(symbol, "1m", signal.minuteEstimatedTime);
    const finalResult = await strategy.backtest(symbol, strategyName, candles);
    yield finalResult;
    
    // Skip ahead to after signal closure
    skipToTimestamp = finalResult.closeTimestamp;
  }
}
```

**Sources**: [src/client/ClientStrategy.ts:413-415](), [src/client/ClientStrategy.ts:1559-1561](), [src/client/ClientStrategy.ts:1795-1797]()

---

## Internal Helper Functions

`ClientStrategy` delegates complex logic to 19 stateless helper functions defined at module scope in [src/client/ClientStrategy.ts:41-1486](). This architecture improves testability and reduces cyclomatic complexity of public methods.

### Helper Function Architecture

**Method-to-Helper Mapping:**

```mermaid
graph TB
    subgraph "Public Methods"
        TICK["tick()"]
        BACKTEST["backtest()"]
        WAIT["waitForInit()"]
        STOP["stop()"]
    end
    
    subgraph "Core Helper Functions"
        GET_SIGNAL["GET_SIGNAL_FN<br/>Signal generation pipeline"]
        VALIDATE["VALIDATE_SIGNAL_FN<br/>30+ validation rules"]
        WAIT_INIT["WAIT_FOR_INIT_FN<br/>State restoration"]
    end
    
    subgraph "Scheduled Signal Helpers"
        CHECK_TIMEOUT["CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN"]
        CHECK_ACTIVATION["CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN"]
        CANCEL_SL["CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN"]
        ACTIVATE["ACTIVATE_SCHEDULED_SIGNAL_FN"]
        RETURN_SCH_ACTIVE["RETURN_SCHEDULED_SIGNAL_ACTIVE_FN"]
        OPEN_SCHEDULED["OPEN_NEW_SCHEDULED_SIGNAL_FN"]
    end
    
    subgraph "Pending Signal Helpers"
        CHECK_COMPLETION["CHECK_PENDING_SIGNAL_COMPLETION_FN"]
        CLOSE["CLOSE_PENDING_SIGNAL_FN"]
        RETURN_PEND_ACTIVE["RETURN_PENDING_SIGNAL_ACTIVE_FN"]
        OPEN_PENDING["OPEN_NEW_PENDING_SIGNAL_FN"]
    end
    
    subgraph "Backtest-Specific Helpers"
        CANCEL_BT["CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN"]
        ACTIVATE_BT["ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN"]
        CLOSE_BT["CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN"]
        PROCESS_SCH["PROCESS_SCHEDULED_SIGNAL_CANDLES_FN"]
        PROCESS_PEND["PROCESS_PENDING_SIGNAL_CANDLES_FN"]
    end
    
    subgraph "Utility Helpers"
        GET_AVG["GET_AVG_PRICE_FN"]
        RETURN_IDLE["RETURN_IDLE_FN"]
    end
    
    TICK --> GET_SIGNAL
    TICK --> CHECK_TIMEOUT
    TICK --> CHECK_ACTIVATION
    TICK --> CHECK_COMPLETION
    
    BACKTEST --> PROCESS_SCH
    BACKTEST --> PROCESS_PEND
    
    WAIT --> WAIT_INIT
    
    GET_SIGNAL --> VALIDATE
    
    CHECK_ACTIVATION --> CANCEL_SL
    CHECK_ACTIVATION --> ACTIVATE
    CHECK_ACTIVATION --> RETURN_SCH_ACTIVE
    
    GET_SIGNAL --> OPEN_SCHEDULED
    GET_SIGNAL --> OPEN_PENDING
    
    CHECK_COMPLETION --> CLOSE
    CHECK_COMPLETION --> RETURN_PEND_ACTIVE
    
    PROCESS_SCH --> CANCEL_BT
    PROCESS_SCH --> ACTIVATE_BT
    
    PROCESS_PEND --> CLOSE_BT
    
    BACKTEST --> GET_AVG
    CLOSE_BT --> GET_AVG
    
    TICK --> RETURN_IDLE
```

### Function Reference Table

| Function | Line Range | Called By | Returns |
|----------|-----------|-----------|---------|
| `VALIDATE_SIGNAL_FN` | [src/client/ClientStrategy.ts:45-330]() | `GET_SIGNAL_FN` | `void` (throws on error) |
| `GET_SIGNAL_FN` | [src/client/ClientStrategy.ts:332-476]() | `tick()` | `ISignalRow \| IScheduledSignalRow \| null` |
| `GET_AVG_PRICE_FN` | [src/client/ClientStrategy.ts:478-489]() | `backtest()` | `number` |
| `WAIT_FOR_INIT_FN` | [src/client/ClientStrategy.ts:491-552]() | `waitForInit()` | `Promise<void>` |
| `CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN` | [src/client/ClientStrategy.ts:554-608]() | `tick()` | `Promise<IStrategyTickResultCancelled \| null>` |
| `CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN` | [src/client/ClientStrategy.ts:610-644]() | `tick()` | `{ shouldActivate, shouldCancel }` |
| `CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN` | [src/client/ClientStrategy.ts:646-679]() | `tick()` | `Promise<IStrategyTickResultIdle>` |
| `ACTIVATE_SCHEDULED_SIGNAL_FN` | [src/client/ClientStrategy.ts:681-774]() | `tick()` | `Promise<IStrategyTickResultOpened \| null>` |
| `RETURN_SCHEDULED_SIGNAL_ACTIVE_FN` | [src/client/ClientStrategy.ts:776-801]() | `tick()` | `Promise<IStrategyTickResultActive>` |
| `OPEN_NEW_SCHEDULED_SIGNAL_FN` | [src/client/ClientStrategy.ts:803-846]() | `tick()` | `Promise<IStrategyTickResultScheduled>` |
| `OPEN_NEW_PENDING_SIGNAL_FN` | [src/client/ClientStrategy.ts:848-899]() | `tick()` | `Promise<IStrategyTickResultOpened \| null>` |
| `CHECK_PENDING_SIGNAL_COMPLETION_FN` | [src/client/ClientStrategy.ts:901-960]() | `tick()` | `Promise<IStrategyTickResultClosed \| null>` |
| `CLOSE_PENDING_SIGNAL_FN` | [src/client/ClientStrategy.ts:962-1023]() | `CHECK_PENDING_SIGNAL_COMPLETION_FN` | `Promise<IStrategyTickResultClosed>` |
| `RETURN_PENDING_SIGNAL_ACTIVE_FN` | [src/client/ClientStrategy.ts:1025-1062]() | `tick()` | `Promise<IStrategyTickResultActive>` |
| `RETURN_IDLE_FN` | [src/client/ClientStrategy.ts:1064-1077]() | `tick()` | `Promise<IStrategyTickResultIdle>` |
| `CANCEL_SCHEDULED_SIGNAL_IN_BACKTEST_FN` | [src/client/ClientStrategy.ts:1079-1114]() | `PROCESS_SCHEDULED_SIGNAL_CANDLES_FN` | `Promise<IStrategyTickResultCancelled>` |
| `ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN` | [src/client/ClientStrategy.ts:1116-1186]() | `PROCESS_SCHEDULED_SIGNAL_CANDLES_FN` | `Promise<boolean>` |
| `CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN` | [src/client/ClientStrategy.ts:1188-1261]() | `PROCESS_PENDING_SIGNAL_CANDLES_FN` | `Promise<IStrategyTickResultClosed>` |
| `PROCESS_SCHEDULED_SIGNAL_CANDLES_FN` | [src/client/ClientStrategy.ts:1263-1357]() | `backtest()` | `Promise<{ activated, cancelled, activationIndex, result }>` |
| `PROCESS_PENDING_SIGNAL_CANDLES_FN` | [src/client/ClientStrategy.ts:1359-1486]() | `backtest()` | `Promise<IStrategyTickResultClosed \| null>` |

**Function Naming Convention**: All helper functions use `SCREAMING_SNAKE_CASE_FN` suffix for visual distinction and grep-ability.

**Sources**: [src/client/ClientStrategy.ts:41-1486]()

---

## Error Handling and Logging

`ClientStrategy` uses `trycatch` wrapper for signal generation errors with automatic fallback.

```typescript
const GET_SIGNAL_FN = trycatch(
  async (self: ClientStrategy): Promise<ISignalRow | IScheduledSignalRow | null> => {
    // ... signal generation logic
  },
  {
    defaultValue: null,
    fallback: (error) => {
      backtest.loggerService.warn("ClientStrategy exception thrown", {
        error: errorData(error),
        message: getErrorMessage(error),
      });
      errorEmitter.next(error);
    },
  }
);
```

**Error Recovery Strategy:**
- **Signal generation errors**: Return `null`, log warning, emit to `errorEmitter`
- **Validation errors**: Caught by `trycatch`, logged, return `null`
- **Persistence errors**: Propagate to caller (fatal in live mode)
- **Exchange errors**: Propagate with retry logic in `ClientExchange`

**Logging Levels:**

| Level | Use Case | Example |
|-------|----------|---------|
| `debug` | State transitions | `"ClientStrategy tick"` |
| `info` | Signal lifecycle events | `"ClientStrategy signal take_profit"` |
| `warn` | Recoverable errors | `"ClientStrategy exception thrown"` |

**Sources**: [src/client/ClientStrategy.ts:263-396](), [src/client/ClientStrategy.ts:386-395]()

---

## Performance Considerations

### Memory Efficiency

**Memoization**: `StrategyConnectionService` memoizes `ClientStrategy` instances per symbol-strategy pair:
```typescript
// Only one instance per (symbol, strategyName) combination
const strategy = await strategyConnection.getStrategy(symbol, strategyName);
```

**State Cleanup**: Signals are automatically removed from memory after closure:
- `_pendingSignal = null`
- `_scheduledSignal = null`
- `ClientPartial` state cleared
- `ClientRisk` active position removed

### Backtest Optimization

**Skip-Ahead**: After signal opens, backtest skips directly to closure without iterating unused timeframes:
```typescript
// BacktestLogicPrivateService
if (result.action === "opened") {
  const finalResult = await strategy.backtest(...);
  skipToTimestamp = finalResult.closeTimestamp; // Skip ahead
}
```

**VWAP Sliding Window**: Only last N candles used for average price calculation (default 5), not full history.

**Single File Load**: `waitForInit()` uses `singleshot` pattern to prevent duplicate reads:
```typescript
public waitForInit = singleshot(async () => await WAIT_FOR_INIT_FN(this));
```

**Sources**: [src/client/ClientStrategy.ts:1532](), [src/client/ClientStrategy.ts:398-409]()

---

## Usage Examples

### Basic Strategy Registration

```typescript
import { addStrategy } from "backtest-kit";

await addStrategy({
  strategyName: "momentum-scalper",
  interval: "5m",
  getSignal: async (symbol, when) => {
    // Custom signal logic
    const price = await getCurrentPrice(symbol);
    const momentum = calculateMomentum(symbol, when);
    
    if (momentum > threshold) {
      return {
        position: "long",
        priceTakeProfit: price * 1.02,
        priceStopLoss: price * 0.98,
        minuteEstimatedTime: 120,
        note: `Momentum: ${momentum.toFixed(2)}`
      };
    }
    
    return null;
  },
  callbacks: {
    onOpen: (symbol, signal, price, backtest) => {
      console.log(`Signal opened: ${signal.id} at ${price}`);
    },
    onClose: (symbol, signal, price, backtest) => {
      console.log(`Signal closed: ${signal.id} at ${price}`);
    }
  }
});
```

### Scheduled Signal (Limit Order)

```typescript
await addStrategy({
  strategyName: "limit-order-strategy",
  interval: "15m",
  getSignal: async (symbol, when) => {
    const currentPrice = await getCurrentPrice(symbol);
    const supportLevel = findSupportLevel(symbol);
    
    // Wait for price to drop to support before entering
    if (currentPrice > supportLevel * 1.05) {
      return {
        position: "long",
        priceOpen: supportLevel, // Will wait for this price
        priceTakeProfit: supportLevel * 1.03,
        priceStopLoss: supportLevel * 0.97,
        minuteEstimatedTime: 240,
        note: "Support bounce entry"
      };
    }
    
    return null;
  }
});
```

### Live Trading with Crash Recovery

```typescript
import { Live, listenSignalLive } from "backtest-kit";

// Listen for signal events
listenSignalLive((result) => {
  if (result.action === "opened") {
    console.log("Position opened:", result.signal.id);
  } else if (result.action === "closed") {
    console.log("Position closed:", result.pnl.pnlPercentage);
  }
});

// Start live trading (will restore state if crashed)
for await (const result of Live.run("BTCUSDT", {
  strategyName: "momentum-scalper",
  exchangeName: "binance",
})) {
  console.log(`Action: ${result.action}`);
}
```

**Sources**: [src/interfaces/Strategy.interface.ts:132-149](), [types.d.ts:813-831]()

---

## Integration with Other Components

```mermaid
graph TB
    subgraph "Service Layer"
        SSS[StrategySchemaService<br/>Component registry]
        SCS[StrategyConnectionService<br/>Instance memoization]
        SGS[StrategyGlobalService<br/>Context injection]
    end
    
    subgraph "ClientStrategy Instance"
        CS[ClientStrategy]
        State["Internal State:<br/>_pendingSignal<br/>_scheduledSignal<br/>_lastSignalTimestamp<br/>_isStopped"]
    end
    
    subgraph "Dependencies"
        CE[ClientExchange<br/>VWAP calculation]
        CR[ClientRisk<br/>Position validation]
        CP[ClientPartial<br/>Milestone tracking]
        PSA[PersistSignalAdapter<br/>Signal storage]
        PSCHA[PersistScheduleAdapter<br/>Schedule storage]
    end
    
    subgraph "Execution Engines"
        BLP[BacktestLogicPrivateService<br/>Historical simulation]
        LLP[LiveLogicPrivateService<br/>Real-time trading]
    end
    
    subgraph "Event System"
        Emitters["Event Emitters:<br/>signalEmitter<br/>signalBacktestEmitter<br/>signalLiveEmitter"]
    end
    
    SSS -->|getSchema| SCS
    SCS -->|instantiates| CS
    SGS -->|wraps| CS
    
    CS --> State
    CS -->|getAveragePrice| CE
    CS -->|checkSignal| CR
    CS -->|profit/loss/clear| CP
    CS -->|read/write| PSA
    CS -->|read/write| PSCHA
    
    BLP -->|tick/backtest| SGS
    LLP -->|tick| SGS
    
    CS -->|emits| Emitters
    
    style CS fill:#e1f5ff
    style State fill:#fff4e1
```

**Component Interaction Pattern:**
1. **Schema Registration**: `addStrategy()` → `StrategySchemaService.addSchema()`
2. **Instance Creation**: `StrategyConnectionService.getStrategy()` → `new ClientStrategy(params)`
3. **Context Injection**: `StrategyGlobalService` wraps calls with `ExecutionContextService` and `MethodContextService`
4. **Execution**: Logic services call `tick()` or `backtest()` through global service wrapper
5. **Event Emission**: Strategy emits to `signalEmitter` / `signalBacktestEmitter` / `signalLiveEmitter`
6. **Persistence**: Automatic state writes to disk adapters in live mode

**Sources**: [src/client/ClientStrategy.ts:1-30](), [src/interfaces/Strategy.interface.ts:76-94]()
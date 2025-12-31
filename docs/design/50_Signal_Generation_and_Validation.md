# Signal Generation and Validation

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



This page documents the signal generation process and the multi-layer validation pipeline that ensures all trading signals meet safety and logical requirements before execution. Signal generation occurs in the `getSignal` function defined in `IStrategySchema`, and validation is performed by `VALIDATE_SIGNAL_FN` within `ClientStrategy`.

**Scope**: This page covers the mechanics of signal creation from `getSignal()` through validation. For information about signal state transitions after validation, see [Signal States](#8.1). For the actual risk checking integration, see [Risk Management](#12). For signal persistence after validation, see [Signal Persistence](#8.4).

---

## Signal Generation Overview

Signal generation is the entry point for all trading decisions. The `getSignal` function is called by `ClientStrategy` at intervals specified by the strategy's `interval` parameter, respecting throttling limits to prevent excessive signal generation.

### Signal Generation Flow Diagram

```mermaid
graph TB
    TICK["ClientStrategy.tick()"]
    THROTTLE{"Interval\nthrottling\npassed?"}
    SIGNAL_FN["getSignal(symbol, when)"]
    NULL_CHECK{"Signal\nreturned?"}
    DTO["ISignalDto\n{position, priceOpen?, priceTakeProfit, priceStopLoss, minuteEstimatedTime, note?, id?}"]
    RISK_CHECK["ClientRisk.checkSignal()"]
    RISK_OK{"Risk\nallowed?"}
    PRICE_CHECK{"priceOpen\nspecified?"}
    ACTIVATION_CHECK{"Price already\nreached\npriceOpen?"}
    
    IMMEDIATE["Create ISignalRow\n(immediate entry)\n_isScheduled=false\npriceOpen=currentPrice"]
    SCHEDULED["Create IScheduledSignalRow\n(limit order)\n_isScheduled=true\npriceOpen from DTO"]
    SCHEDULED_IMM["Create ISignalRow\n(immediate entry)\n_isScheduled=false\npriceOpen from DTO"]
    
    VALIDATE["VALIDATE_SIGNAL_FN()"]
    VALIDATE_OK{"Validation\npassed?"}
    RETURN["Return signal"]
    RETURN_NULL["Return null"]
    
    TICK --> THROTTLE
    THROTTLE -->|"No (too soon)"| RETURN_NULL
    THROTTLE -->|"Yes"| SIGNAL_FN
    SIGNAL_FN --> NULL_CHECK
    NULL_CHECK -->|"null"| RETURN_NULL
    NULL_CHECK -->|"ISignalDto"| DTO
    DTO --> RISK_CHECK
    RISK_CHECK --> RISK_OK
    RISK_OK -->|"No (rejected)"| RETURN_NULL
    RISK_OK -->|"Yes"| PRICE_CHECK
    
    PRICE_CHECK -->|"No (undefined)"| IMMEDIATE
    PRICE_CHECK -->|"Yes"| ACTIVATION_CHECK
    
    ACTIVATION_CHECK -->|"Yes (immediate)"| SCHEDULED_IMM
    ACTIVATION_CHECK -->|"No (wait for price)"| SCHEDULED
    
    IMMEDIATE --> VALIDATE
    SCHEDULED --> VALIDATE
    SCHEDULED_IMM --> VALIDATE
    
    VALIDATE --> VALIDATE_OK
    VALIDATE_OK -->|"Yes"| RETURN
    VALIDATE_OK -->|"No (throws error)"| RETURN_NULL
    
    style VALIDATE fill:#f9f9f9,stroke:#333,stroke-width:2px
    style RISK_CHECK fill:#f9f9f9,stroke:#333,stroke-width:2px
    style DTO fill:#e1f5ff,stroke:#333,stroke-width:2px
```

**Sources**: [src/client/ClientStrategy.ts:332-476]()

---

## Signal Data Transfer Object (ISignalDto)

The `getSignal` function returns an `ISignalDto` object containing the signal parameters. This DTO is then validated and augmented with metadata to create an `ISignalRow`.

### ISignalDto Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | No | Optional signal ID (UUID v4 auto-generated if omitted) |
| `position` | `"long" \| "short"` | Yes | Trade direction: "long" for buy, "short" for sell |
| `note` | `string` | No | Human-readable description of signal reason |
| `priceOpen` | `number` | No | Entry price for limit order. If omitted, opens immediately at current VWAP |
| `priceTakeProfit` | `number` | Yes | Target exit price for profit |
| `priceStopLoss` | `number` | Yes | Exit price for loss protection |
| `minuteEstimatedTime` | `number` | Yes | Expected duration in minutes before time expiration |

**Sources**: [src/interfaces/Strategy.interface.ts:20-39](), [types.d.ts:649-667]()

### Augmented Signal Row (ISignalRow)

After validation, `ISignalDto` is augmented with system metadata to create `ISignalRow`:

| Additional Field | Type | Description |
|-----------------|------|-------------|
| `id` | `string` | Guaranteed non-empty (generated if missing) |
| `priceOpen` | `number` | Guaranteed defined (set to currentPrice if omitted) |
| `exchangeName` | `ExchangeName` | Exchange identifier from strategy context |
| `strategyName` | `StrategyName` | Strategy identifier from strategy context |
| `symbol` | `string` | Trading pair symbol (e.g., "BTCUSDT") |
| `scheduledAt` | `number` | Signal creation timestamp (milliseconds) |
| `pendingAt` | `number` | Position activation timestamp (milliseconds) |
| `_isScheduled` | `boolean` | Internal marker for scheduled signals |

**Sources**: [src/interfaces/Strategy.interface.ts:41-62](), [src/client/ClientStrategy.ts:400-456]()

---

## Validation Pipeline (VALIDATE_SIGNAL_FN)

The validation function `VALIDATE_SIGNAL_FN` performs comprehensive safety checks before a signal is allowed to proceed. This function throws an error if any validation fails, preventing invalid signals from being executed.

### Validation Layers

```mermaid
graph TB
    START["VALIDATE_SIGNAL_FN(signal, currentPrice, isScheduled)"]
    
    subgraph "Layer 1: Type Validation"
        TYPE_ID["id is non-empty string?"]
        TYPE_EXCHANGE["exchangeName defined?"]
        TYPE_STRATEGY["strategyName defined?"]
        TYPE_SYMBOL["symbol is non-empty string?"]
        TYPE_SCHEDULED["_isScheduled defined?"]
        TYPE_POSITION["position is 'long' or 'short'?"]
    end
    
    subgraph "Layer 2: Price Validation (NaN/Infinity Protection)"
        PRICE_CURRENT["currentPrice is finite > 0?"]
        PRICE_OPEN["priceOpen is finite > 0?"]
        PRICE_TP["priceTakeProfit is finite > 0?"]
        PRICE_SL["priceStopLoss is finite > 0?"]
    end
    
    subgraph "Layer 3: Logic Validation (Position-Specific)"
        LONG_LOGIC["LONG: TP > priceOpen > SL?"]
        SHORT_LOGIC["SHORT: TP < priceOpen < SL?"]
        LONG_IMM["LONG immediate: SL < currentPrice < TP?"]
        SHORT_IMM["SHORT immediate: TP < currentPrice < SL?"]
        LONG_SCHED["LONG scheduled: SL < priceOpen < TP?"]
        SHORT_SCHED["SHORT scheduled: TP < priceOpen < SL?"]
    end
    
    subgraph "Layer 4: Distance Validation (Global Config)"
        TP_MIN["TP distance >= CC_MIN_TAKEPROFIT_DISTANCE_PERCENT?"]
        SL_MIN["SL distance >= CC_MIN_STOPLOSS_DISTANCE_PERCENT?"]
        SL_MAX["SL distance <= CC_MAX_STOPLOSS_DISTANCE_PERCENT?"]
    end
    
    subgraph "Layer 5: Time Validation"
        TIME_POSITIVE["minuteEstimatedTime > 0?"]
        TIME_INTEGER["minuteEstimatedTime is integer?"]
        TIME_MAX["minuteEstimatedTime <= CC_MAX_SIGNAL_LIFETIME_MINUTES?"]
        TIMESTAMP_SCHEDULED["scheduledAt > 0?"]
        TIMESTAMP_PENDING["pendingAt > 0?"]
    end
    
    PASS["Validation passed\nReturn signal"]
    FAIL["Validation failed\nThrow Error with message"]
    
    START --> TYPE_ID
    TYPE_ID --> TYPE_EXCHANGE
    TYPE_EXCHANGE --> TYPE_STRATEGY
    TYPE_STRATEGY --> TYPE_SYMBOL
    TYPE_SYMBOL --> TYPE_SCHEDULED
    TYPE_SCHEDULED --> TYPE_POSITION
    
    TYPE_POSITION --> PRICE_CURRENT
    PRICE_CURRENT --> PRICE_OPEN
    PRICE_OPEN --> PRICE_TP
    PRICE_TP --> PRICE_SL
    
    PRICE_SL --> LONG_LOGIC
    LONG_LOGIC --> SHORT_LOGIC
    SHORT_LOGIC --> LONG_IMM
    LONG_IMM --> SHORT_IMM
    SHORT_IMM --> LONG_SCHED
    LONG_SCHED --> SHORT_SCHED
    
    SHORT_SCHED --> TP_MIN
    TP_MIN --> SL_MIN
    SL_MIN --> SL_MAX
    
    SL_MAX --> TIME_POSITIVE
    TIME_POSITIVE --> TIME_INTEGER
    TIME_INTEGER --> TIME_MAX
    TIME_MAX --> TIMESTAMP_SCHEDULED
    TIMESTAMP_SCHEDULED --> TIMESTAMP_PENDING
    
    TIMESTAMP_PENDING -->|"All checks passed"| PASS
    
    TYPE_ID -->|"Any check fails"| FAIL
    TYPE_EXCHANGE -->|"Any check fails"| FAIL
    TYPE_STRATEGY -->|"Any check fails"| FAIL
    TYPE_SYMBOL -->|"Any check fails"| FAIL
    TYPE_SCHEDULED -->|"Any check fails"| FAIL
    TYPE_POSITION -->|"Any check fails"| FAIL
    PRICE_CURRENT -->|"Any check fails"| FAIL
    PRICE_OPEN -->|"Any check fails"| FAIL
    PRICE_TP -->|"Any check fails"| FAIL
    PRICE_SL -->|"Any check fails"| FAIL
    LONG_LOGIC -->|"Any check fails"| FAIL
    SHORT_LOGIC -->|"Any check fails"| FAIL
    LONG_IMM -->|"Any check fails"| FAIL
    SHORT_IMM -->|"Any check fails"| FAIL
    LONG_SCHED -->|"Any check fails"| FAIL
    SHORT_SCHED -->|"Any check fails"| FAIL
    TP_MIN -->|"Any check fails"| FAIL
    SL_MIN -->|"Any check fails"| FAIL
    SL_MAX -->|"Any check fails"| FAIL
    TIME_POSITIVE -->|"Any check fails"| FAIL
    TIME_INTEGER -->|"Any check fails"| FAIL
    TIME_MAX -->|"Any check fails"| FAIL
    TIMESTAMP_SCHEDULED -->|"Any check fails"| FAIL
    TIMESTAMP_PENDING -->|"Any check fails"| FAIL
    
    style PASS fill:#e1ffe1,stroke:#333,stroke-width:2px
    style FAIL fill:#ffe1e1,stroke:#333,stroke-width:2px
```

**Sources**: [src/client/ClientStrategy.ts:45-330]()

---

## Layer 1: Type Validation

Type validation ensures all required fields are present and have valid types. This prevents runtime errors from missing or malformed data.

### Required Field Checks

```typescript
// Example validation checks (pseudocode from VALIDATE_SIGNAL_FN)
if (signal.id === undefined || signal.id === null || signal.id === '') {
  errors.push('id is required and must be a non-empty string');
}

if (signal.position !== "long" && signal.position !== "short") {
  errors.push(`position must be "long" or "short", got "${signal.position}"`);
}
```

**Validation Rules**:
- `id`: Must be non-empty string (auto-generated if missing in DTO, but required in ISignalRow)
- `exchangeName`: Must be defined and non-empty
- `strategyName`: Must be defined and non-empty
- `symbol`: Must be defined and non-empty string
- `_isScheduled`: Must be boolean
- `position`: Must be exactly `"long"` or `"short"` (no other values allowed)

**Sources**: [src/client/ClientStrategy.ts:48-70]()

---

## Layer 2: Price Validation (NaN/Infinity Protection)

Price validation protects against `NaN` and `Infinity` values that could cause financial losses or system crashes. All price fields must be finite positive numbers.

### Price Safety Checks

| Check | Purpose | Example Error |
|-------|---------|---------------|
| `isFinite(currentPrice)` | Prevent NaN/Infinity in current market price | "currentPrice must be a finite number, got NaN" |
| `currentPrice > 0` | Prevent negative or zero prices | "currentPrice must be positive, got -42000" |
| `isFinite(priceOpen)` | Prevent NaN/Infinity in entry price | "priceOpen must be a finite number, got Infinity" |
| `priceOpen > 0` | Prevent negative or zero entry | "priceOpen must be positive, got 0" |
| `isFinite(priceTakeProfit)` | Prevent NaN/Infinity in TP | "priceTakeProfit must be a finite number" |
| `priceTakeProfit > 0` | Prevent negative or zero TP | "priceTakeProfit must be positive" |
| `isFinite(priceStopLoss)` | Prevent NaN/Infinity in SL | "priceStopLoss must be a finite number" |
| `priceStopLoss > 0` | Prevent negative or zero SL | "priceStopLoss must be positive" |

**Critical Protection**: These checks prevent catastrophic scenarios:
- **Zero StopLoss**: Would allow unlimited losses in flash crashes
- **NaN prices**: Would cause position to never close (TP/SL comparisons always false)
- **Infinity prices**: Would cause position to never trigger TP or SL

**Sources**: [src/client/ClientStrategy.ts:71-109]()

---

## Layer 3: Logic Validation (Position-Specific Rules)

Logic validation enforces the mathematical relationships between prices based on position direction. LONG and SHORT positions have opposite requirements.

### LONG Position Rules

```mermaid
graph LR
    SL["StopLoss\n(priceStopLoss)"]
    OPEN["Entry\n(priceOpen)"]
    CURRENT["Current\n(currentPrice)"]
    TP["TakeProfit\n(priceTakeProfit)"]
    
    SL -.->|"must be <"| OPEN
    OPEN -.->|"must be <"| TP
    
    SL -.->|"immediate: must be <"| CURRENT
    CURRENT -.->|"immediate: must be <"| TP
    
    SL -.->|"scheduled: must be <"| OPEN
    OPEN -.->|"scheduled: must be <"| TP
```

**LONG Position Requirements**:
1. **Basic**: `priceStopLoss < priceOpen < priceTakeProfit`
   - Buy low, sell higher for profit
   - Exit low to cut losses
2. **Immediate Entry**: `priceStopLoss < currentPrice < priceTakeProfit`
   - Current price must be between SL and TP
   - Prevents opening positions that would close immediately
3. **Scheduled Entry**: `priceStopLoss < priceOpen < priceTakeProfit`
   - Entry price must be between SL and TP
   - Prevents limit orders that would activate and close immediately

**Example Error Messages**:
```
Long: priceTakeProfit (42000) must be > priceOpen (43000)
Long immediate: currentPrice (41000) <= priceStopLoss (41500). 
  Signal would be immediately closed by stop loss.
Long scheduled: priceOpen (40000) <= priceStopLoss (40500). 
  Signal would be immediately cancelled on activation.
```

**Sources**: [src/client/ClientStrategy.ts:111-200]()

### SHORT Position Rules

```mermaid
graph LR
    TP["TakeProfit\n(priceTakeProfit)"]
    OPEN["Entry\n(priceOpen)"]
    CURRENT["Current\n(currentPrice)"]
    SL["StopLoss\n(priceStopLoss)"]
    
    TP -.->|"must be <"| OPEN
    OPEN -.->|"must be <"| SL
    
    TP -.->|"immediate: must be <"| CURRENT
    CURRENT -.->|"immediate: must be <"| SL
    
    TP -.->|"scheduled: must be <"| OPEN
    OPEN -.->|"scheduled: must be <"| SL
```

**SHORT Position Requirements**:
1. **Basic**: `priceTakeProfit < priceOpen < priceStopLoss`
   - Sell high, buy back lower for profit
   - Exit high to cut losses
2. **Immediate Entry**: `priceTakeProfit < currentPrice < priceStopLoss`
   - Current price must be between TP and SL
   - Prevents opening positions that would close immediately
3. **Scheduled Entry**: `priceTakeProfit < priceOpen < priceStopLoss`
   - Entry price must be between TP and SL
   - Prevents limit orders that would activate and close immediately

**Example Error Messages**:
```
Short: priceTakeProfit (44000) must be < priceOpen (43000)
Short immediate: currentPrice (45000) >= priceStopLoss (44500). 
  Signal would be immediately closed by stop loss.
Short scheduled: priceOpen (46000) >= priceStopLoss (45500). 
  Signal would be immediately cancelled on activation.
```

**Sources**: [src/client/ClientStrategy.ts:202-291]()

---

## Layer 4: Distance Validation (Global Config)

Distance validation enforces minimum and maximum distances between prices to prevent unprofitable or overly risky trades. These thresholds are configured globally via `setConfig()`.

### Distance Validation Rules

| Validation | Config Parameter | Purpose |
|------------|-----------------|---------|
| Minimum TP Distance | `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | Ensures TP is far enough to cover fees + slippage (default: no minimum) |
| Minimum SL Distance | `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | Prevents micro-SL that triggers on normal volatility (default: no minimum) |
| Maximum SL Distance | `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | Caps maximum loss per trade to protect capital (default: no maximum) |

### Minimum TakeProfit Distance

**Calculation** (LONG):
```typescript
const tpDistancePercent = ((priceTakeProfit - priceOpen) / priceOpen) * 100;
// Example: ((43000 - 42000) / 42000) * 100 = 2.38%
```

**Calculation** (SHORT):
```typescript
const tpDistancePercent = ((priceOpen - priceTakeProfit) / priceOpen) * 100;
// Example: ((43000 - 42000) / 43000) * 100 = 2.33%
```

**Protection**: With fees (0.1%) + slippage (0.1%) = 0.2% total overhead, a minimum TP distance (e.g., 0.5%) ensures trades can be profitable after costs.

**Sources**: [src/client/ClientStrategy.ts:163-173](), [src/client/ClientStrategy.ts:254-263]()

### Minimum StopLoss Distance

**Purpose**: Prevents "micro-stoploss" that triggers on normal market volatility before the trade has a chance to succeed.

**Example**: If `CC_MIN_STOPLOSS_DISTANCE_PERCENT = 0.3`, then:
- LONG at 42000 requires SL ≤ 41874 (0.3% away)
- SHORT at 43000 requires SL ≥ 43129 (0.3% away)

**Error Example**:
```
Long: StopLoss too close to priceOpen (0.120%). 
  Minimum distance: 0.300% to avoid instant stop out on market volatility. 
  Current: SL=41950, Open=42000
```

**Sources**: [src/client/ClientStrategy.ts:176-186](), [src/client/ClientStrategy.ts:266-276]()

### Maximum StopLoss Distance

**Purpose**: Caps the maximum loss per trade to prevent catastrophic losses from a single position.

**Example**: If `CC_MAX_STOPLOSS_DISTANCE_PERCENT = 5.0`, then:
- LONG at 42000 requires SL ≥ 39900 (5% maximum loss)
- SHORT at 43000 requires SL ≤ 45150 (5% maximum loss)

**Risk Management**: Protects portfolio from single-trade wipeout scenarios. Combined with position sizing, this enforces maximum risk per trade.

**Error Example**:
```
Long: StopLoss too far from priceOpen (8.500%). 
  Maximum distance: 5.000% to protect capital. 
  Current: SL=38430, Open=42000
```

**Sources**: [src/client/ClientStrategy.ts:189-199](), [src/client/ClientStrategy.ts:279-290]()

---

## Layer 5: Time Validation

Time validation ensures signal lifetime parameters are reasonable and prevents pathological edge cases like eternal signals or instant timeouts.

### Time Parameter Checks

| Check | Requirement | Protection |
|-------|------------|------------|
| `minuteEstimatedTime > 0` | Positive duration | Prevents instant timeout (0 minutes = immediate close) |
| `Number.isInteger(minuteEstimatedTime)` | Whole number | Ensures precise minute-based timing |
| `minuteEstimatedTime <= CC_MAX_SIGNAL_LIFETIME_MINUTES` | Maximum duration cap | Prevents eternal signals that block risk limits indefinitely |
| `scheduledAt > 0` | Valid timestamp | Ensures signal creation time is tracked |
| `pendingAt > 0` | Valid timestamp | Ensures activation time is tracked |

### Maximum Signal Lifetime Protection

**Configuration**: `CC_MAX_SIGNAL_LIFETIME_MINUTES` (default: undefined = unlimited)

**Problem**: Signals with extremely long `minuteEstimatedTime` (e.g., 43200 minutes = 30 days) can:
- Block risk limit slots for weeks
- Prevent new signals from opening
- Create "zombie positions" that never close
- Tie up capital indefinitely

**Example Error**:
```
minuteEstimatedTime too large (43200 minutes = 30.0 days). 
  Maximum: 10080 minutes (7 days) to prevent strategy deadlock. 
  Eternal signals block risk limits and prevent new trades.
```

**Sources**: [src/client/ClientStrategy.ts:294-323]()

---

## Scheduled vs Immediate Signal Logic

The signal generation logic determines whether to create an immediate entry (`_isScheduled=false`) or a scheduled entry (`_isScheduled=true`) based on the `priceOpen` parameter and current market price.

### Signal Type Decision Tree

```mermaid
graph TB
    DTO["getSignal returns ISignalDto"]
    PRICE_OPEN_PRESENT{"priceOpen\nspecified?"}
    
    subgraph "Immediate Entry Path"
        IMM_NO_PRICE["priceOpen undefined"]
        IMM_SET_PRICE["Set priceOpen = currentPrice"]
        IMM_CREATE["Create ISignalRow\n_isScheduled = false\nscheduledAt = currentTime\npendingAt = currentTime"]
    end
    
    subgraph "Scheduled Entry Logic"
        SCHED_PRICE["priceOpen defined in DTO"]
        SCHED_CHECK{"Price activation\ncheck"}
        
        subgraph "LONG Activation Check"
            LONG_CHECK["position === 'long'"]
            LONG_ACTIVATE{"currentPrice <= priceOpen?"}
        end
        
        subgraph "SHORT Activation Check"
            SHORT_CHECK["position === 'short'"]
            SHORT_ACTIVATE{"currentPrice >= priceOpen?"}
        end
        
        SCHED_IMM["Immediate activation\nCreate ISignalRow\n_isScheduled = false\npriceOpen from DTO\nscheduledAt = currentTime\npendingAt = currentTime"]
        
        SCHED_WAIT["Wait for activation\nCreate IScheduledSignalRow\n_isScheduled = true\npriceOpen from DTO\nscheduledAt = currentTime\npendingAt = currentTime (temp)"]
    end
    
    VALIDATE["VALIDATE_SIGNAL_FN"]
    RETURN["Return signal"]
    
    DTO --> PRICE_OPEN_PRESENT
    PRICE_OPEN_PRESENT -->|"No"| IMM_NO_PRICE
    PRICE_OPEN_PRESENT -->|"Yes"| SCHED_PRICE
    
    IMM_NO_PRICE --> IMM_SET_PRICE
    IMM_SET_PRICE --> IMM_CREATE
    
    SCHED_PRICE --> SCHED_CHECK
    SCHED_CHECK --> LONG_CHECK
    SCHED_CHECK --> SHORT_CHECK
    
    LONG_CHECK --> LONG_ACTIVATE
    LONG_ACTIVATE -->|"Yes (price fell)"| SCHED_IMM
    LONG_ACTIVATE -->|"No (wait for drop)"| SCHED_WAIT
    
    SHORT_CHECK --> SHORT_ACTIVATE
    SHORT_ACTIVATE -->|"Yes (price rose)"| SCHED_IMM
    SHORT_ACTIVATE -->|"No (wait for rise)"| SCHED_WAIT
    
    IMM_CREATE --> VALIDATE
    SCHED_IMM --> VALIDATE
    SCHED_WAIT --> VALIDATE
    
    VALIDATE --> RETURN
    
    style IMM_CREATE fill:#e1f5ff,stroke:#333,stroke-width:2px
    style SCHED_IMM fill:#e1f5ff,stroke:#333,stroke-width:2px
    style SCHED_WAIT fill:#fff4e1,stroke:#333,stroke-width:2px
```

### Immediate Entry (Market Order)

**Trigger**: `priceOpen` is `undefined` in `ISignalDto`

**Behavior**:
1. System fetches current VWAP price via `exchange.getAveragePrice(symbol)`
2. Sets `priceOpen = currentPrice`
3. Creates `ISignalRow` with `_isScheduled = false`
4. Position opens immediately on next tick
5. Both `scheduledAt` and `pendingAt` are set to same timestamp

**Use Case**: Market orders that execute at current market price without waiting.

**Sources**: [src/client/ClientStrategy.ts:445-461]()

### Scheduled Entry (Limit Order) - Wait for Activation

**Trigger**: `priceOpen` is specified AND price has NOT yet reached entry point

**Conditions**:
- **LONG**: `currentPrice > priceOpen` (waiting for price to fall)
- **SHORT**: `currentPrice < priceOpen` (waiting for price to rise)

**Behavior**:
1. Creates `IScheduledSignalRow` with `_isScheduled = true`
2. `priceOpen` is stored from DTO
3. `scheduledAt = currentTime` (signal creation time)
4. `pendingAt = currentTime` (temporary, will update on activation)
5. Signal waits in scheduled state until price reaches `priceOpen`

**Use Case**: Limit orders that wait for better entry price before activating.

**Sources**: [src/client/ClientStrategy.ts:423-442]()

### Scheduled Entry (Limit Order) - Immediate Activation

**Trigger**: `priceOpen` is specified AND price has ALREADY reached entry point

**Conditions**:
- **LONG**: `currentPrice <= priceOpen` (price already fell to entry)
- **SHORT**: `currentPrice >= priceOpen` (price already rose to entry)

**Behavior**:
1. Creates `ISignalRow` (not `IScheduledSignalRow`)
2. `_isScheduled = false` (activates immediately)
3. `priceOpen` from DTO (uses specified entry price, not current price)
4. Both `scheduledAt` and `pendingAt` set to current time
5. Position opens immediately without waiting

**Critical Logic**: This prevents the system from creating a scheduled signal when the target price has already been reached. Instead, it treats it as an immediate entry at the specified `priceOpen`.

**Sources**: [src/client/ClientStrategy.ts:389-420]()

---

## Risk Validation Integration

After the internal validation checks pass, the signal must also pass risk management checks via `ClientRisk.checkSignal()`. This is a separate validation layer that enforces portfolio-level constraints.

### Risk Check Flow

```mermaid
sequenceDiagram
    participant GS as GET_SIGNAL_FN
    participant DTO as ISignalDto
    participant CR as ClientRisk
    participant VA as IRiskValidation[]
    participant CB as Callbacks
    
    GS->>GS: getSignal() returns signal
    GS->>GS: VALIDATE_SIGNAL_FN() passes
    GS->>CR: checkSignal(params)
    
    CR->>CR: Build IRiskValidationPayload
    Note over CR: payload = {pendingSignal, activePositionCount, activePositions, ...}
    
    CR->>VA: Execute validations array
    
    loop Each validation
        VA->>VA: validate(payload)
        alt Validation throws error
            VA-->>CR: Error thrown
            CR->>CR: Catch error
            CR->>CB: onRejected(symbol, params)
            CR-->>GS: return false
        end
    end
    
    alt All validations passed
        VA-->>CR: All passed
        CR->>CB: onAllowed(symbol, params)
        CR-->>GS: return true
        GS->>GS: Create ISignalRow/IScheduledSignalRow
    else Any validation failed
        CR-->>GS: return false
        GS-->>GS: Return null (no signal)
    end
```

**Risk Check Parameters** (`IRiskCheckArgs`):
- `symbol`: Trading pair
- `pendingSignal`: The `ISignalDto` being validated
- `strategyName`: Strategy requesting the signal
- `exchangeName`: Exchange identifier
- `currentPrice`: Current VWAP price
- `timestamp`: Current time in milliseconds

**Risk Payload** (`IRiskValidationPayload` extends `IRiskCheckArgs`):
- `activePositionCount`: Number of currently open positions
- `activePositions`: Array of `IRiskActivePosition` objects with signal details

**Rejection Behavior**:
- If risk check fails, `checkSignal()` returns `false`
- Signal generation aborts and returns `null`
- No signal is created or persisted
- Risk callbacks (`onRejected`) are fired for monitoring

**Sources**: [src/client/ClientStrategy.ts:374-387](), [src/interfaces/Risk.interface.ts:339-397]()

---

## Error Handling and Recovery

Validation errors are caught by `trycatch()` wrapper around `GET_SIGNAL_FN`, preventing crashes and enabling graceful degradation.

### Error Handling Flow

```mermaid
graph TB
    GET_SIGNAL["GET_SIGNAL_FN()"]
    TRYCATCH["trycatch wrapper"]
    VALIDATE["VALIDATE_SIGNAL_FN()"]
    THROW{"Error\nthrown?"}
    
    LOG["Log to logger.warn()"]
    EMIT["Emit to errorEmitter"]
    RETURN_NULL["Return null (no signal)"]
    RETURN_SIGNAL["Return validated signal"]
    
    GET_SIGNAL --> TRYCATCH
    TRYCATCH --> VALIDATE
    VALIDATE --> THROW
    
    THROW -->|"Yes (validation failed)"| LOG
    LOG --> EMIT
    EMIT --> RETURN_NULL
    
    THROW -->|"No (validation passed)"| RETURN_SIGNAL
    
    style RETURN_NULL fill:#ffe1e1,stroke:#333,stroke-width:2px
    style RETURN_SIGNAL fill:#e1ffe1,stroke:#333,stroke-width:2px
```

**Error Handling Behavior**:
1. **Catch**: `trycatch()` wrapper catches all exceptions in signal generation
2. **Log**: Error logged via `backtest.loggerService.warn()`
3. **Emit**: Error emitted via `errorEmitter.next(error)` for monitoring
4. **Default**: Returns `null` (no signal) instead of crashing
5. **Continue**: Strategy continues processing future ticks

**Example Error Log**:
```javascript
{
  message: "ClientStrategy exception thrown",
  payload: {
    error: { ... },
    message: "Invalid signal for long position:\nLong: priceTakeProfit (42000) must be > priceOpen (43000)"
  }
}
```

**Sources**: [src/client/ClientStrategy.ts:332-476](), [src/client/ClientStrategy.ts:463-475]()

---

## Validation Test Coverage

The validation pipeline is extensively tested to ensure all edge cases are handled correctly and financial safety is maintained.

### Critical Test Scenarios

| Test Category | Test Case | File Reference |
|---------------|-----------|----------------|
| **LONG Logic** | Limit order activates BEFORE StopLoss | [test/e2e/defend.test.mjs:26-146]() |
| **SHORT Logic** | Limit order activates BEFORE StopLoss | [test/e2e/defend.test.mjs:158-278]() |
| **Instant TP** | Scheduled signal activated and closed on same candle | [test/e2e/defend.test.mjs:291-439]() |
| **Timeout** | Scheduled signal cancelled at 120min boundary | [test/e2e/defend.test.mjs:446-537]() |
| **Invalid TP** | LONG signal rejected (TP below priceOpen) | [test/e2e/defend.test.mjs:545-642]() |
| **Invalid TP** | SHORT signal rejected (TP above priceOpen) | [test/e2e/defend.test.mjs:649-744]() |
| **Invalid SL** | LONG signal rejected (SL >= priceOpen) | [test/e2e/defend.test.mjs:752-846]() |
| **Zero SL** | Signal rejected (StopLoss = 0) | [test/e2e/defend.test.mjs:858-950]() |
| **Inverted Logic** | SHORT signal rejected (TP > priceOpen) | [test/e2e/defend.test.mjs:963-1057]() |
| **Zero Time** | Signal rejected (minuteEstimatedTime = 0) | [test/e2e/defend.test.mjs:1069-1162]() |
| **Equal TP** | Signal rejected (TP equals priceOpen) | [test/e2e/defend.test.mjs:1174-1269]() |
| **SL Cancellation** | Scheduled LONG cancelled by SL before activation | [test/e2e/defend.test.mjs:1393-1507]() |
| **Extreme Volatility** | Price crosses both TP and SL (TP wins) | [test/e2e/defend.test.mjs:1520-1653]() |
| **Infrastructure** | Exchange.getCandles throws error | [test/e2e/defend.test.mjs:1664-1743]() |

**Test Philosophy**: Each test validates that the system **rejects** invalid signals before they can cause financial harm. Tests verify error messages contain actionable information.

**Sources**: [test/e2e/defend.test.mjs:1-1860]()

---

## Code Entity Reference

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `GET_SIGNAL_FN` | [src/client/ClientStrategy.ts:332-476]() | Main signal generation logic with throttling and risk checks |
| `VALIDATE_SIGNAL_FN` | [src/client/ClientStrategy.ts:45-330]() | Multi-layer validation pipeline |
| `getSignal` (user-defined) | `IStrategySchema.getSignal` | User-provided signal generation callback |

### Key Types

| Type | Location | Description |
|------|----------|-------------|
| `ISignalDto` | [src/interfaces/Strategy.interface.ts:24-39]() | Signal data transfer object from getSignal |
| `ISignalRow` | [src/interfaces/Strategy.interface.ts:45-62]() | Validated signal with metadata |
| `IScheduledSignalRow` | [src/interfaces/Strategy.interface.ts:70-73]() | Scheduled signal awaiting activation |
| `IRiskCheckArgs` | [types.d.ts:339-356]() | Risk validation parameters |
| `IRiskValidationPayload` | [types.d.ts:380-390]() | Extended risk check with portfolio state |

### Configuration Constants

| Constant | Type | Purpose |
|----------|------|---------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | `number \| undefined` | Minimum TP distance percentage |
| `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | `number \| undefined` | Minimum SL distance percentage |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | `number \| undefined` | Maximum SL distance percentage |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | `number \| undefined` | Maximum signal duration |
| `CC_SCHEDULE_AWAIT_MINUTES` | `number` | Scheduled signal timeout (default: 120) |

**Sources**: [src/config/params.ts](), [types.d.ts:179-184]()

---

## Best Practices for Signal Generation

### DO: Return Null for No Signal

```typescript
addStrategy({
  strategyName: "example",
  interval: "5m",
  getSignal: async (symbol, when) => {
    const candles = await getCandles(symbol, "1h", 24);
    
    // Calculate indicators
    const rsi = calculateRSI(candles);
    
    // No signal condition
    if (rsi > 30 && rsi < 70) {
      return null; // ✅ Return null when no trade opportunity
    }
    
    // Signal condition
    return {
      position: "long",
      priceTakeProfit: currentPrice * 1.02,
      priceStopLoss: currentPrice * 0.98,
      minuteEstimatedTime: 60,
      note: `RSI ${rsi.toFixed(2)} oversold`
    };
  }
});
```

### DO: Use priceOpen for Limit Orders

```typescript
// Wait for better entry price
return {
  position: "long",
  priceOpen: 42000,        // ✅ Wait for price to drop to 42000
  priceTakeProfit: 43000,
  priceStopLoss: 41000,
  minuteEstimatedTime: 120,
  note: "Limit order at 42000"
};
```

### DO: Respect Validation Constraints

```typescript
const currentPrice = await getAveragePrice(symbol);

return {
  position: "long",
  // ✅ TP is 2% above entry (covers fees + slippage)
  priceTakeProfit: currentPrice * 1.02,
  // ✅ SL is 1% below entry (reasonable risk)
  priceStopLoss: currentPrice * 0.99,
  // ✅ Integer minutes, reasonable duration
  minuteEstimatedTime: 60,
  note: "Valid signal parameters"
};
```

### DON'T: Return Equal TP and priceOpen

```typescript
// ❌ WRONG: TP equals entry = zero profit
return {
  position: "long",
  priceOpen: 42000,
  priceTakeProfit: 42000, // ❌ No profit, only fees!
  priceStopLoss: 41000,
  minuteEstimatedTime: 60
};
// This will be REJECTED by validation
```

### DON'T: Use Inverted Logic

```typescript
// ❌ WRONG: SHORT with TP > priceOpen
return {
  position: "short",
  priceOpen: 42000,
  priceTakeProfit: 43000, // ❌ SHORT needs TP < priceOpen!
  priceStopLoss: 44000,
  minuteEstimatedTime: 60
};
// This will be REJECTED by validation
```

### DON'T: Generate Eternal Signals

```typescript
// ❌ WRONG: 30 days = blocks risk limits for a month
return {
  position: "long",
  priceOpen: 42000,
  priceTakeProfit: 45000,
  priceStopLoss: 40000,
  minuteEstimatedTime: 43200 // ❌ 30 days!
};
// This will be REJECTED if CC_MAX_SIGNAL_LIFETIME_MINUTES is set
```

**Sources**: [README.md:86-143](), [test/e2e/defend.test.mjs]()
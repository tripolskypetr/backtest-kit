# Client Implementations

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

This document describes the **client implementation classes** that form the core business logic layer of backtest-kit. Client implementations are concrete classes that execute trading operations: signal generation, market data fetching, risk validation, position sizing, partial profit tracking, and strategy optimization.

For schema definitions that configure these clients, see [Component Schemas](#5). For the service layer that routes operations to client instances, see [Service Layer](#7). For the signal lifecycle state machine, see [Signal Lifecycle](#8).

---

## Client Architecture Overview

Client implementations sit between the **connection service layer** and the **trading domain logic**. They are instantiated by connection services and cached using memoization patterns to ensure singleton behavior per trading context.

### System Layer Hierarchy

```mermaid
graph TB
    subgraph "Public API Layer"
        ADD["addStrategy()<br/>addExchange()<br/>addRisk()"]
        UTIL["Backtest.run()<br/>Live.run()<br/>Walker.run()"]
    end
    
    subgraph "Service Layer"
        SCHEMA["Schema Services<br/>StrategySchemaService<br/>ExchangeSchemaService"]
        CONN["Connection Services<br/>StrategyConnectionService<br/>ExchangeConnectionService"]
        CMD["Command Services<br/>BacktestCommandService<br/>LiveCommandService"]
    end
    
    subgraph "Client Implementation Layer"
        CSTRAT["ClientStrategy<br/>Signal generation<br/>State machine<br/>Validation"]
        CEXCH["ClientExchange<br/>Candle fetching<br/>VWAP calculation<br/>Temporal isolation"]
        CRISK["ClientRisk<br/>Validation chain<br/>Position tracking"]
        CSIZE["ClientSizing<br/>Position sizing<br/>Kelly/ATR/Fixed"]
        CPART["ClientPartial<br/>TP/SL milestones<br/>Progress tracking"]
        CFRAME["ClientFrame<br/>Timeframe generation"]
        COPT["ClientOptimizer<br/>LLM integration<br/>Code generation"]
    end
    
    subgraph "External Dependencies"
        PERSIST["PersistSignalAdapter<br/>PersistRiskAdapter<br/>Atomic file I/O"]
        EMIT["RxJS Emitters<br/>signalEmitter<br/>errorEmitter"]
        CONTEXT["ExecutionContextService<br/>MethodContextService<br/>AsyncLocalStorage"]
    end
    
    ADD --> SCHEMA
    UTIL --> CMD
    CMD --> CONN
    CONN --> CSTRAT
    CONN --> CEXCH
    CONN --> CRISK
    
    CSTRAT --> CEXCH
    CSTRAT --> CRISK
    CSTRAT --> CSIZE
    CSTRAT --> CPART
    
    CSTRAT --> PERSIST
    CSTRAT --> EMIT
    CSTRAT --> CONTEXT
    
    style CSTRAT fill:#e1f5ff,stroke:#333,stroke-width:3px
    style CEXCH fill:#fff4e1,stroke:#333,stroke-width:2px
    style CRISK fill:#ffe1e1,stroke:#333,stroke-width:2px
```

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:1-325](), [src/client/ClientStrategy.ts:1-100]()

---

## ClientStrategy

`ClientStrategy` implements the `IStrategy` interface and is the most complex client class. It manages the complete signal lifecycle from generation through validation, monitoring, and closure.

### Core Responsibilities

| Responsibility | Methods | Description |
|---------------|---------|-------------|
| **Signal Generation** | `GET_SIGNAL_FN` | Calls user's `getSignal()` with throttling and timeout |
| **Validation** | `VALIDATE_SIGNAL_FN` | Multi-layer validation: types, prices, logic, distance, time |
| **State Machine** | `tick()`, `backtest()` | Manages transitions between idle → scheduled → pending → active → closed |
| **Persistence** | `setPendingSignal()`, `setScheduledSignal()` | Atomic writes for crash recovery |
| **Lifecycle Callbacks** | `onOpen`, `onActive`, `onClose`, `onSchedule`, `onCancel` | User event notifications |

### Instance Creation and Memoization

```mermaid
graph LR
    subgraph "StrategyConnectionService"
        GET["getStrategy()<br/>memoized function"]
        KEY["Cache Key<br/>symbol:strategyName:backtest"]
    end
    
    subgraph "ClientStrategy Instance"
        CONS["new ClientStrategy()<br/>IStrategyParams"]
        STATE["Internal State<br/>_pendingSignal<br/>_scheduledSignal<br/>_isStopped<br/>_lastSignalTimestamp"]
    end
    
    subgraph "Dependencies Injected"
        EXEC["execution: ExecutionContextService<br/>context.symbol<br/>context.when<br/>context.backtest"]
        METH["method: MethodContextService<br/>context.strategyName<br/>context.exchangeName"]
        EXCH["exchange: IExchange<br/>getCandles()<br/>getAveragePrice()"]
        RISK["risk: IRisk<br/>checkSignal()<br/>addSignal()<br/>removeSignal()"]
        PART["partial: IPartial<br/>monitor()<br/>clear()"]
    end
    
    GET --> KEY
    KEY --> CONS
    CONS --> EXEC
    CONS --> METH
    CONS --> EXCH
    CONS --> RISK
    CONS --> PART
    
    STATE -.stored in.-> CONS
```

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:123-156](), [src/client/ClientStrategy.ts:1074-1140]()

### Signal Validation Pipeline

`ClientStrategy` performs extensive validation using `VALIDATE_SIGNAL_FN` before allowing signal creation. This function prevents logically impossible or financially dangerous signals.

| Validation Category | Checks Performed | Example Rejection |
|---------------------|------------------|-------------------|
| **Required Fields** | `id`, `symbol`, `position`, `_isScheduled` must exist | `id === undefined` |
| **NaN/Infinity Protection** | All prices and `currentPrice` must be finite numbers | `priceOpen === NaN` |
| **Positive Prices** | `priceOpen`, `priceTakeProfit`, `priceStopLoss` > 0 | `priceStopLoss === 0` |
| **Long Position Logic** | `priceTakeProfit > priceOpen > priceStopLoss` | TP=40000, Open=42000 |
| **Short Position Logic** | `priceStopLoss > priceOpen > priceTakeProfit` | SL=40000, Open=42000 |
| **Instant Closure Protection** | Current price not already beyond TP/SL | Long with `currentPrice >= TP` |
| **Minimum TP Distance** | `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` enforced | TP only 0.05% from open |
| **Minimum SL Distance** | `CC_MIN_STOPLOSS_DISTANCE_PERCENT` enforced | SL only 0.01% from open |
| **Maximum SL Distance** | `CC_MAX_STOPLOSS_DISTANCE_PERCENT` enforced | SL 50% away from open |
| **Time Validation** | `minuteEstimatedTime` must be positive integer | `minuteEstimatedTime === 0` |
| **Maximum Lifetime** | `CC_MAX_SIGNAL_LIFETIME_MINUTES` enforced | `minuteEstimatedTime > 10080` (7 days) |

**Sources:** [src/client/ClientStrategy.ts:45-330]()

### Signal Generation with Throttling

```mermaid
sequenceDiagram
    participant Tick as tick() call
    participant GSF as GET_SIGNAL_FN
    participant Throttle as Interval Check
    participant User as getSignal()
    participant Timeout as Race Condition
    participant Risk as risk.checkSignal()
    participant Result as Return Signal
    
    Tick->>GSF: Request signal
    GSF->>Throttle: Check _lastSignalTimestamp
    
    alt Interval not elapsed
        Throttle-->>GSF: return null (throttled)
        GSF-->>Tick: null
    else Interval elapsed
        GSF->>User: Call user's getSignal()
        GSF->>Timeout: Race with CC_MAX_SIGNAL_GENERATION_SECONDS
        
        alt User returns in time
            User-->>GSF: ISignalDto or null
        else Timeout
            Timeout-->>GSF: TIMEOUT_SYMBOL
            GSF-->>Tick: throw Error("Timeout")
        end
        
        alt Signal returned
            GSF->>Risk: checkSignal(pendingSignal)
            
            alt Risk approved
                Risk-->>GSF: true
                GSF->>Result: Validate and return
                Result-->>Tick: ISignalRow or IScheduledSignalRow
            else Risk rejected
                Risk-->>GSF: false
                GSF-->>Tick: null
            end
        else null returned
            GSF-->>Tick: null
        end
    end
```

**Sources:** [src/client/ClientStrategy.ts:332-476](), [src/client/ClientStrategy.ts:34-41]()

### Scheduled Signal Activation Logic

Scheduled signals (limit orders) require special handling for activation and cancellation. The logic checks both price conditions and stop loss violations.

```mermaid
stateDiagram-v2
    [*] --> Scheduled: getSignal() returns<br/>priceOpen specified
    
    Scheduled --> CheckActivation: Every tick
    
    CheckActivation --> CheckStopLoss: Evaluate conditions
    
    CheckStopLoss --> Cancelled: currentPrice violates SL<br/>(LONG: price <= SL)<br/>(SHORT: price >= SL)
    
    CheckStopLoss --> CheckPriceOpen: SL not violated
    
    CheckPriceOpen --> Activated: LONG: currentPrice <= priceOpen<br/>SHORT: currentPrice >= priceOpen
    
    CheckPriceOpen --> Timeout: Time > CC_SCHEDULE_AWAIT_MINUTES
    
    CheckPriceOpen --> Scheduled: Conditions not met<br/>Continue monitoring
    
    Activated --> RiskCheck: Verify risk limits
    
    RiskCheck --> Pending: Risk approved<br/>Position opened
    
    RiskCheck --> Cancelled: Risk rejected
    
    Timeout --> Cancelled: Max wait time exceeded
    
    Cancelled --> [*]: Signal removed
    Pending --> [*]: Monitor TP/SL
    
    note right of CheckStopLoss
        CRITICAL: StopLoss check
        happens BEFORE activation
        Prevents opening losing positions
    end note
    
    note right of Activated
        pendingAt timestamp updated
        scheduledAt preserved
        Duration calculated correctly
    end note
```

**Sources:** [src/client/ClientStrategy.ts:610-644](), [src/client/ClientStrategy.ts:646-679](), [src/client/ClientStrategy.ts:681-774]()

### Method Reference

| Method | Signature | Purpose |
|--------|-----------|---------|
| `tick()` | `(symbol, strategyName) => Promise<IStrategyTickResult>` | Single execution cycle for live trading |
| `backtest()` | `(symbol, strategyName, candles) => Promise<IStrategyBacktestResult>` | Fast-forward through historical candles |
| `waitForInit()` | `() => Promise<void>` | Load persisted state from disk (live mode only) |
| `getPendingSignal()` | `(symbol, strategyName) => Promise<ISignalRow \| null>` | Retrieve active pending signal |
| `stop()` | `(symbol, strategyName, backtest) => Promise<void>` | Prevent new signal generation |
| `setPendingSignal()` | `(signal) => Promise<void>` | Persist pending signal atomically |
| `setScheduledSignal()` | `(signal) => Promise<void>` | Persist scheduled signal atomically |

**Sources:** [src/interfaces/Strategy.interface.ts:318-388](), [src/client/ClientStrategy.ts:1142-1470]()

---

## ClientExchange

`ClientExchange` implements the `IExchange` interface and provides market data with temporal isolation guarantees.

### Core Responsibilities

| Responsibility | Methods | Description |
|---------------|---------|-------------|
| **Candle Fetching** | `getCandles()` | Retrieves historical OHLCV data with temporal bounds |
| **VWAP Calculation** | `getAveragePrice()` | Volume-weighted average of last N candles |
| **Price Formatting** | `formatPrice()`, `formatQuantity()` | Display formatting for UI |
| **Temporal Isolation** | Context awareness | Prevents look-ahead bias via `ExecutionContextService` |

### VWAP Pricing Implementation

The system uses **Volume Weighted Average Price (VWAP)** instead of simple close prices for realistic execution simulation. VWAP is calculated from the last `CC_AVG_PRICE_CANDLES_COUNT` (default: 5) one-minute candles.

```mermaid
graph TB
    subgraph "getAveragePrice() Flow"
        START["getAveragePrice(symbol)"]
        CTX["ExecutionContextService<br/>current timestamp"]
        FETCH["getCandles(symbol, '1m', ..., 5)<br/>Last 5 one-minute candles"]
        CALC["Calculate VWAP<br/>Σ(typical_price × volume) / Σ(volume)<br/>typical_price = (high + low + close) / 3"]
        FALLBACK["If total volume = 0<br/>Simple average of close prices"]
        RETURN["Return VWAP"]
    end
    
    START --> CTX
    CTX --> FETCH
    FETCH --> CALC
    CALC --> FALLBACK
    FALLBACK --> RETURN
    
    note right of CALC
        More realistic than close price
        Accounts for liquidity
        Simulates slippage naturally
    end note
```

**Formula (from [src/client/ClientStrategy.ts:478-489]()):
```
typicalPrice = (high + low + close) / 3
sumPriceVolume = Σ(typicalPrice × volume)
totalVolume = Σ(volume)
VWAP = sumPriceVolume / totalVolume
```

If `totalVolume === 0`, fallback to simple average: `Σ(close) / candles.length`

**Sources:** [src/client/ClientStrategy.ts:478-489](), [src/config/params.ts]()

### Temporal Isolation

`ClientExchange.getCandles()` uses `ExecutionContextService` to enforce temporal bounds. In backtest mode, it **never returns data from the future**, preventing look-ahead bias.

**Sources:** Connection services document context propagation, AsyncLocalStorage used for temporal isolation

---

## ClientRisk

`ClientRisk` implements the `IRisk` interface and enforces portfolio-level constraints through validation chains.

### Core Responsibilities

| Responsibility | Methods | Description |
|---------------|---------|-------------|
| **Signal Validation** | `checkSignal()` | Runs validation chain against pending signal |
| **Position Tracking** | `addSignal()`, `removeSignal()` | Tracks active positions per strategy |
| **Persistence** | Via `PersistRiskAdapter` | Atomic state saves for crash recovery |
| **Validation Callbacks** | `onAllowed`, `onRejected` | User notifications for validation results |

### Validation Chain Execution

```mermaid
sequenceDiagram
    participant CS as ClientStrategy
    participant CR as ClientRisk
    participant Chain as Validation Array
    participant V1 as Validation 1
    participant V2 as Validation 2
    participant VN as Validation N
    participant Callback as onAllowed/onRejected
    
    CS->>CR: checkSignal(payload)
    CR->>Chain: Iterate validations
    
    loop Each validation
        Chain->>V1: Execute validation fn
        
        alt Validation passes
            V1-->>Chain: No error thrown
            Chain->>V2: Continue to next
        else Validation fails
            V1-->>Chain: throw Error(reason)
            Chain-->>CR: Validation failed
            CR->>Callback: onRejected(payload, error)
            CR-->>CS: return false
        end
    end
    
    alt All validations passed
        Chain-->>CR: Success
        CR->>Callback: onAllowed(payload)
        CR-->>CS: return true
    end
```

### Position Tracking with Persistence

`ClientRisk` maintains `_activePositionsMap` to track concurrent positions per strategy. This enables `maxConcurrentPositions` enforcement and portfolio-level risk management.

**Data Structure:**
```typescript
_activePositionsMap = Map<symbol, Set<strategyIdentifier>>
// Example: Map { "BTCUSDT" => Set { "strategy1:riskA", "strategy2:riskA" } }
```

**Persistence:** State saved to `./dump/data/risk/{riskName}.json` via `PersistRiskAdapter` after every `addSignal()` or `removeSignal()` call.

**Sources:** [src/client/ClientRisk.ts]() (not provided but referenced in architecture), [src/classes/Persist.ts]()

---

## ClientSizing

`ClientSizing` implements the `ISizing` interface and calculates position sizes based on account balance and risk parameters.

### Sizing Methods

| Method | Formula | Use Case |
|--------|---------|----------|
| **Fixed Percentage** | `position = balance × fixedPercent / 100` | Conservative, predictable sizing |
| **Kelly Criterion** | `f* = (p × b - q) / b`<br/>where p=winRate, b=avgWin/avgLoss | Optimal growth, requires historical data |
| **ATR-Based** | `position = (balance × riskPercent) / (ATR × atrMultiplier)` | Volatility-adjusted sizing |

### Position Constraints

All methods respect constraints from `ISizingSchema`:
- `minPositionSize`: Minimum position value
- `maxPositionSize`: Maximum position value
- `maxPositionPercent`: Maximum % of account balance

**Sources:** Schema documentation references sizing interface

---

## ClientPartial

`ClientPartial` implements the `IPartial` interface and tracks profit/loss milestones for active signals.

### Milestone Levels

| Event Type | Levels | Trigger |
|------------|--------|---------|
| **Partial Profit** | `TP_LEVEL1`, `TP_LEVEL2`, `TP_LEVEL3` | 33%, 66%, 100% toward TP |
| **Partial Loss** | `SL_LEVEL1`, `SL_LEVEL2` | 50%, 100% toward SL |

### Monitoring Flow

```mermaid
graph TB
    subgraph "ClientPartial.monitor()"
        START["monitor(symbol, signal, currentPrice)"]
        CALC_TP["Calculate progress toward TP<br/>percentTp = progress%"]
        CALC_SL["Calculate progress toward SL<br/>percentSl = progress%"]
        CHECK_TP["Check if crossed TP milestone"]
        CHECK_SL["Check if crossed SL milestone"]
        EMIT_TP["Emit partialProfitSubject"]
        EMIT_SL["Emit partialLossSubject"]
        CALLBACK_TP["Call onPartialProfit callback"]
        CALLBACK_SL["Call onPartialLoss callback"]
        PERSIST["Save to PersistPartialAdapter"]
    end
    
    START --> CALC_TP
    START --> CALC_SL
    CALC_TP --> CHECK_TP
    CALC_SL --> CHECK_SL
    
    CHECK_TP -->|Milestone crossed| EMIT_TP
    CHECK_SL -->|Milestone crossed| EMIT_SL
    
    EMIT_TP --> CALLBACK_TP
    EMIT_SL --> CALLBACK_SL
    
    CALLBACK_TP --> PERSIST
    CALLBACK_SL --> PERSIST
```

**State Persistence:** `./dump/data/partial/{strategy}/{symbol}.json` stores already-emitted milestones to prevent duplicate events after crash recovery.

**Sources:** [src/lib/services/connection/PartialConnectionService.ts]() (referenced in architecture)

---

## ClientFrame

`ClientFrame` implements the `IFrame` interface and generates timeframes for backtesting.

### Timeframe Generation

```mermaid
graph LR
    subgraph "ClientFrame.getTimeframes()"
        START["IFrameSchema<br/>startDate<br/>endDate<br/>interval"]
        PARSE["Parse interval<br/>1m = 60000ms<br/>1h = 3600000ms"]
        ITERATE["Loop from startDate<br/>to endDate<br/>step by interval"]
        GENERATE["Yield Date objects<br/>for each timeframe"]
    end
    
    START --> PARSE
    PARSE --> ITERATE
    ITERATE --> GENERATE
    
    note right of ITERATE
        Async generator pattern
        Memory efficient
        Lazy evaluation
    end note
```

**Example:**
- `startDate`: 2025-01-01 00:00:00
- `endDate`: 2025-01-02 00:00:00
- `interval`: 1h
- **Output:** 24 Date objects, one per hour

**Sources:** Frame schema references

---

## ClientOptimizer

`ClientOptimizer` implements the `IOptimizer` interface and generates executable strategy code using LLMs.

### Architecture

```mermaid
graph TB
    subgraph "ClientOptimizer Flow"
        SCHEMA["IOptimizerSchema<br/>rangeTrain<br/>rangeTest<br/>source<br/>getPrompt<br/>template"]
        FETCH["Fetch data from sources<br/>iterateDocuments()<br/>distinctDocuments()"]
        FORMAT["Format as MessageModel<br/>user/assistant pairs"]
        PROMPT["Call getPrompt()<br/>Analyze conversation history"]
        TEMPLATE["OptimizerTemplateService<br/>Generate code sections"]
        OUTPUT["Complete .mjs file<br/>Executable strategy"]
    end
    
    subgraph "Generated Code Sections"
        BANNER["Top banner<br/>Imports, constants"]
        HELPERS["Helper functions<br/>dumpJson, text, json"]
        EXCHANGE["addExchange()<br/>CCXT configuration"]
        FRAMES["addFrame()<br/>Train + Test periods"]
        STRATEGIES["addStrategy()<br/>Multi-timeframe analysis"]
        WALKER["addWalker()<br/>Strategy comparison"]
        LAUNCHER["Event listeners<br/>Execution trigger"]
    end
    
    SCHEMA --> FETCH
    FETCH --> FORMAT
    FORMAT --> PROMPT
    PROMPT --> TEMPLATE
    TEMPLATE --> BANNER
    TEMPLATE --> HELPERS
    TEMPLATE --> EXCHANGE
    TEMPLATE --> FRAMES
    TEMPLATE --> STRATEGIES
    TEMPLATE --> WALKER
    TEMPLATE --> LAUNCHER
    
    BANNER --> OUTPUT
    HELPERS --> OUTPUT
    EXCHANGE --> OUTPUT
    FRAMES --> OUTPUT
    STRATEGIES --> OUTPUT
    WALKER --> OUTPUT
    LAUNCHER --> OUTPUT
```

### Data Source Pattern

`IOptimizerSource` can be a function or an object:

**Function-based:**
```typescript
{
  fetch: (params) => Promise<any[]>
}
```

**Object-based:**
```typescript
{
  fetch: (params) => Promise<any[]>,
  user: (doc) => string,      // Format as user message
  assistant: (doc) => string   // Format as assistant message
}
```

**Pagination:** Uses `iterateDocuments()` for paginated fetching and `distinctDocuments()` for deduplication by ID.

**Sources:** [README.md:111-142]() shows LLM strategy example

---

## Common Patterns Across Clients

### Memoization for Instance Caching

All connection services use `memoize()` from functools-kit to cache client instances:

```typescript
private getStrategy = memoize(
  ([symbol, strategyName, backtest]) => `${symbol}:${strategyName}:${backtest}`,
  (symbol, strategyName, backtest) => new ClientStrategy({...})
)
```

**Cache keys include:**
- `symbol`: Trading pair
- `strategyName` or component name
- `backtest`: Boolean flag (separate instances for backtest vs live)

**Benefits:**
- Singleton behavior per context
- Preserved state across calls
- Memory efficiency

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:123-156]()

### Persistence Adapters

Client implementations that require crash recovery use persistence adapters:

| Adapter | File Path | Purpose |
|---------|-----------|---------|
| `PersistSignalAdapter` | `./dump/data/signal/{strategy}/{symbol}.json` | Active pending signals |
| `PersistRiskAdapter` | `./dump/data/risk/{riskName}.json` | Portfolio position counts |
| `PersistScheduleAdapter` | `./dump/data/schedule/{strategy}/{symbol}.json` | Scheduled signals (limit orders) |
| `PersistPartialAdapter` | `./dump/data/partial/{strategy}/{symbol}.json` | Emitted milestone levels |

**Atomic Write Pattern:**
1. Write to temporary file: `data.json.tmp`
2. Call `fsync()` to ensure disk write
3. Rename `data.json.tmp` → `data.json` (atomic operation)

**Sources:** [src/classes/Persist.ts](), [src/client/ClientStrategy.ts:28]()

### Context Dependency Injection

All clients receive `ExecutionContextService` and `MethodContextService` in their constructor parameters:

```typescript
interface IStrategyParams {
  execution: TExecutionContextService;  // Runtime context (symbol, when, backtest)
  method: TMethodContextService;        // Schema context (strategyName, exchangeName)
  // ... other dependencies
}
```

**ExecutionContextService provides:**
- `context.symbol`: Current trading pair
- `context.when`: Current timestamp (Date object)
- `context.backtest`: Boolean flag for mode

**MethodContextService provides:**
- `context.strategyName`: Active strategy identifier
- `context.exchangeName`: Active exchange identifier
- `context.frameName`: Active frame identifier (backtest only)

These contexts use `AsyncLocalStorage` for implicit propagation without manual parameter threading.

**Sources:** [src/interfaces/Strategy.interface.ts:76-94]()

### Event Emission

Client implementations emit events through RxJS Subjects after state changes:

```typescript
// ClientStrategy emits signals
await signalEmitter.next(tickResult);
await signalBacktestEmitter.next(tickResult);
await signalLiveEmitter.next(tickResult);
```

**Emitters used by clients:**
- `signalEmitter`: All signals (backtest + live)
- `signalBacktestEmitter`: Backtest-only signals
- `signalLiveEmitter`: Live-only signals
- `errorEmitter`: Exception propagation
- `partialProfitSubject`: TP milestone events
- `partialLossSubject`: SL milestone events

**Sources:** [src/config/emitters.ts](), [src/lib/services/connection/StrategyConnectionService.ts:228-237]()

---

## Client Lifecycle Management

### Initialization Sequence

```mermaid
sequenceDiagram
    participant API as Public API
    participant Schema as Schema Service
    participant Conn as Connection Service
    participant Client as Client Instance
    participant Persist as Persistence Layer
    
    API->>Schema: addStrategy(schema)
    Schema->>Schema: Store in ToolRegistry
    
    Note over Conn: First call triggers instantiation
    
    Conn->>Conn: getStrategy() memoized lookup
    
    alt Cache miss
        Conn->>Schema: Get schema by name
        Schema-->>Conn: IStrategySchema
        Conn->>Client: new ClientStrategy(params)
        Client->>Client: Initialize internal state
        
        alt Live mode
            Client->>Persist: waitForInit()
            Persist->>Persist: Read persisted state
            Persist-->>Client: Restored state or null
        end
        
        Conn->>Conn: Cache instance
    else Cache hit
        Conn->>Conn: Return cached instance
    end
    
    Conn-->>API: Client ready for operations
```

### Cleanup and Disposal

```mermaid
graph TB
    subgraph "Cleanup Sequence"
        STOP["stop() called"]
        FLAG["Set _isStopped = true"]
        WAIT["Wait for active signal<br/>to complete naturally"]
        CLEAR["Connection service<br/>clear() method"]
        REMOVE["Remove from memoize cache"]
        GC["Eligible for garbage collection"]
    end
    
    STOP --> FLAG
    FLAG --> WAIT
    WAIT --> CLEAR
    CLEAR --> REMOVE
    REMOVE --> GC
    
    note right of WAIT
        Graceful shutdown
        Active signals close via TP/SL/time
        No forced interruption
    end note
```

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:284-321](), [src/classes/Backtest.ts:254-260]()
# Key Features

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [README.md](README.md)
- [package-lock.json](package-lock.json)
- [package.json](package.json)
- [src/client/ClientOptimizer.ts](src/client/ClientOptimizer.ts)
- [src/client/ClientStrategy.ts](src/client/ClientStrategy.ts)
- [src/interfaces/Optimizer.interface.ts](src/interfaces/Optimizer.interface.ts)
- [src/interfaces/Strategy.interface.ts](src/interfaces/Strategy.interface.ts)
- [src/lib/services/connection/OptimizerConnectionService.ts](src/lib/services/connection/OptimizerConnectionService.ts)
- [src/lib/services/markdown/BacktestMarkdownService.ts](src/lib/services/markdown/BacktestMarkdownService.ts)
- [src/lib/services/markdown/LiveMarkdownService.ts](src/lib/services/markdown/LiveMarkdownService.ts)
- [src/lib/services/markdown/ScheduleMarkdownService.ts](src/lib/services/markdown/ScheduleMarkdownService.ts)
- [src/lib/services/template/OptimizerTemplateService.ts](src/lib/services/template/OptimizerTemplateService.ts)
- [types.d.ts](types.d.ts)

</details>



This page provides an overview of the core features that make backtest-kit a production-ready framework for algorithmic trading. Each feature is explained with its implementation details and integration points.

Related pages: [Core Concepts (2)](#2), [Architecture (3)](#3), [Public API Reference (4)](#4)

---

## Multi-Mode Execution

The framework provides three execution modes that share core business logic but implement distinct orchestration patterns: `Backtest` for historical simulation, `Live` for real-time trading, and `Walker` for strategy comparison.

### Diagram: Execution Mode Architecture

```mermaid
graph TB
    User["User Code"]
    
    subgraph "Execution Modes"
        BacktestAPI["Backtest.run()<br/>Backtest.background()"]
        LiveAPI["Live.run()<br/>Live.background()"]
        WalkerAPI["Walker.run()<br/>Walker.background()"]
    end
    
    subgraph "Logic Services"
        BacktestLogic["BacktestLogicPrivateService<br/>execute() generator"]
        LiveLogic["LiveLogicPrivateService<br/>execute() generator"]
        WalkerLogic["WalkerLogicPrivateService<br/>execute() generator"]
    end
    
    subgraph "Shared Components"
        Strategy["ClientStrategy<br/>tick(), backtest(), stop()"]
        Exchange["ClientExchange<br/>getCandles(), getAveragePrice()"]
        Risk["ClientRisk<br/>checkSignal(), addSignal()"]
    end
    
    User --> BacktestAPI
    User --> LiveAPI
    User --> WalkerAPI
    
    BacktestAPI --> BacktestLogic
    LiveAPI --> LiveLogic
    WalkerAPI --> WalkerLogic
    
    BacktestLogic --> Strategy
    LiveLogic --> Strategy
    WalkerLogic --> BacktestLogic
    
    Strategy --> Exchange
    Strategy --> Risk
```

**Sources:**
- [src/lib/services/logic/private/BacktestLogicPrivateService.ts]()
- [src/lib/services/logic/private/LiveLogicPrivateService.ts]()
- [src/lib/services/logic/private/WalkerLogicPrivateService.ts]()
- [src/client/ClientStrategy.ts]()

### Backtest Mode

Historical simulation processes timeframes sequentially using `BacktestLogicPrivateService`:

```mermaid
graph TB
    User["User Code"]
    BacktestRun["Backtest.run()"]
    LogicPrivate["BacktestLogicPrivateService"]
    Frame["FrameGlobalService<br/>(ClientFrame)"]
    Strategy["StrategyGlobalService<br/>(ClientStrategy)"]
    Exchange["ExchangeGlobalService<br/>(ClientExchange)"]
    
    User -->|"Backtest.run(symbol, config)"| BacktestRun
    BacktestRun -->|"delegates to"| LogicPrivate
    LogicPrivate -->|"getTimeframe(symbol)"| Frame
    Frame -->|"[timestamp1, timestamp2, ...]"| LogicPrivate
    
    LogicPrivate -->|"for each timestamp"| Strategy
    LogicPrivate -->|"setExecutionContext(when, backtest=true)"| Exchange
    Strategy -->|"tick()"| LogicPrivate
    Strategy -->|"backtest(candles)"| LogicPrivate
    LogicPrivate -->|"yield closed result"| BacktestRun
    BacktestRun -->|"stream results"| User
```

**Backtest Flow Characteristics:**

| Feature | Implementation |
|---------|----------------|
| **Timeframe Generation** | `ClientFrame.getTimeframe()` creates timestamp array with configured interval |
| **Context Injection** | `ExecutionContextService` sets `when` to historical timestamp, `backtest=true` |
| **Fast-Forward Simulation** | `ClientStrategy.backtest()` processes future candles without tick iteration |
| **Memory Efficiency** | Generator yields only closed signals, no accumulation |
| **Early Termination** | User can `break` from async iterator at any time |

### Live Mode

Real-time trading operates an infinite loop with crash recovery:

```mermaid
graph TB
    User["User Code"]
    LiveRun["Live.run()"]
    LogicPrivate["LiveLogicPrivateService"]
    Strategy["ClientStrategy<br/>tick(), waitForInit()"]
    Exchange["ClientExchange"]
    Persist["PersistSignalAdapter"]
    Disk["./storage/signals/<br/>{strategy}_{symbol}.json"]
    
    User -->|"Live.run(symbol, config)"| LiveRun
    LiveRun -->|"delegates to"| LogicPrivate
    
    LogicPrivate -->|"while(true) loop"| LogicPrivate
    LogicPrivate -->|"ExecutionContextService<br/>when=Date.now(), backtest=false"| Strategy
    LogicPrivate -->|"tick()"| Strategy
    
    Strategy -->|"setPendingSignal()"| Persist
    Persist -->|"atomic write"| Disk
    Disk -->|"waitForInit()"| Strategy
    
    LogicPrivate -->|"yield opened/closed"| LiveRun
    LiveRun -->|"stream events"| User
    LogicPrivate -->|"sleep(60000 + 1ms)"| LogicPrivate
```

**Live Trading Characteristics:**

| Feature | Implementation |
|---------|----------------|
| **Infinite Generator** | `LiveLogicPrivateService.execute()` loops with `while (true)` |
| **Real-Time Context** | `ExecutionContextService` sets `when=Date.now()`, `backtest=false` |
| **State Persistence** | `PersistSignalAdapter.writeSignalData()` before every state change |
| **Crash Recovery** | `ClientStrategy.waitForInit()` loads last known state on restart |
| **Interval Control** | `sleep(TICK_TTL)` ensures 61-second tick rate |
| **Filtered Output** | Only `opened` and `closed` yielded, `active` filtered |

**Sources:**
- [src/lib/services/logic/private/LiveLogicPrivateService.ts]()
- [src/client/ClientStrategy.ts:411-472]() (waitForInit)
- [src/classes/Persist.ts]() (PersistSignalAdapter)
- [src/config/params.ts]() (TICK_TTL)

### Walker Mode

Strategy comparison mode runs multiple backtests sequentially and ranks results by a metric:

```mermaid
graph TB
    User["User Code"]
    WalkerRun["Walker.run()"]
    WalkerLogic["WalkerLogicPrivateService"]
    WalkerSchema["WalkerSchemaService<br/>strategies[], metric"]
    BacktestLogic["BacktestLogicPrivateService"]
    Markdown["BacktestMarkdownService<br/>getData()"]
    Compare["Metric Comparison<br/>bestStrategy, bestMetric"]
    
    User -->|"Walker.run(symbol, config)"| WalkerRun
    WalkerRun -->|"delegates to"| WalkerLogic
    WalkerLogic -->|"get walker schema"| WalkerSchema
    
    WalkerLogic -->|"for each strategy"| BacktestLogic
    BacktestLogic -->|"run full backtest"| Markdown
    Markdown -->|"stats (sharpeRatio, winRate, etc)"| Compare
    Compare -->|"update best if better"| WalkerLogic
    
    WalkerLogic -->|"yield WalkerContract<br/>{strategyName, stats, metric}"| WalkerRun
    WalkerRun -->|"stream progress"| User
```

**Walker Characteristics:**

| Feature | Implementation |
|---------|----------------|
| **Sequential Execution** | `WalkerLogicPrivateService.execute()` iterates strategies |
| **Metric Selection** | `sharpeRatio` (default), `winRate`, `avgPnl`, `totalPnl`, `certaintyRatio` |
| **Progress Tracking** | Emits `WalkerContract` after each strategy completion |
| **Best Strategy Tracking** | Maintains `bestStrategy` and `bestMetric` state |
| **Shared Timeframe** | All strategies use same `frameName` for fair comparison |

**Sources:**
- [src/lib/services/logic/private/WalkerLogicPrivateService.ts]()
- [src/lib/services/schema/WalkerSchemaService.ts]()
- [src/contract/Walker.contract.ts]()
- [src/classes/Walker.ts]() (public API)

---

## Crash-Safe Persistence

Live trading uses atomic file writes to persist signal state before every state transition, enabling crash recovery without signal duplication or data loss.

### Persistence Architecture

```mermaid
graph LR
    Strategy["ClientStrategy"]
    Persist["PersistSignalAdapter"]
    Base["PersistBase"]
    FileImpl["FilePersist"]
    Disk["./storage/signals/<br/>{strategyName}_{symbol}.json"]
    
    Strategy -->|"setPendingSignal(signal)"| Persist
    Persist -->|"writeSignalData()"| Base
    Base -->|"writeValue()"| FileImpl
    FileImpl -->|"atomic write"| Disk
    
    Disk -->|"restore on restart"| FileImpl
    FileImpl -->|"readValue()"| Base
    Base -->|"readSignalData()"| Persist
    Persist -->|"load state"| Strategy
```

### Atomic Write Implementation

The `PersistSignalAdapter` ensures atomicity through temporary file writes:

| Step | Operation | Purpose |
|------|-----------|---------|
| 1 | Write to `.tmp` file | Prevent corruption if crash during write |
| 2 | Sync to disk | Ensure OS flushes write buffer |
| 3 | Rename `.tmp` to final | Atomic filesystem operation (all-or-nothing) |
| 4 | Sync directory | Ensure directory entry is persisted |

**State Transitions with Persistence:**

```mermaid
stateDiagram-v2
    [*] --> Idle: "No signal<br/>(disk: null)"
    
    Idle --> Opened: "getSignal() returns signal<br/>PERSIST BEFORE YIELD"
    note right of Opened
        ClientStrategy.setPendingSignal(signal)
        → PersistSignalAdapter.writeSignalData()
        → yield opened result
    end note
    
    Opened --> Active: "Next tick"
    Active --> Active: "Monitoring (no persist)"
    
    Active --> Closed: "TP/SL/time hit<br/>PERSIST NULL BEFORE YIELD"
    note right of Closed
        ClientStrategy.setPendingSignal(null)
        → PersistSignalAdapter.writeSignalData(null)
        → yield closed result
    end note
    
    Closed --> Idle: "Signal complete"
```

**Key Code Locations:**

- **Atomic Write Logic**: [src/classes/Persist.ts]() (`FilePersist.writeValue`)
- **Signal Persistence**: [src/client/ClientStrategy.ts:220-233]() (`setPendingSignal`)
- **State Recovery**: [src/client/ClientStrategy.ts:146-165]() (`waitForInit`)
- **File Naming**: `{strategyName}_{symbol}.json` convention in `PersistSignalAdapter.getEntityId()`

**Sources:**
- [src/classes/Persist.ts]()
- [src/client/ClientStrategy.ts:220-233]()
- [src/client/ClientStrategy.ts:146-165]()

---

---

## Signal Validation and Sanitization

Every signal from `getSignal()` passes through 30+ validation rules before execution. Validation failures throw descriptive errors with exact violations. The framework protects against common trading mistakes through configurable constraints.

### Diagram: Validation Pipeline

```mermaid
graph LR
    GetSignal["User getSignal()"]
    Augment["Augment with id,<br/>timestamps, metadata"]
    Validate["VALIDATE_SIGNAL_FN<br/>30+ rules"]
    Risk["Risk.checkSignal()"]
    Accept["Return ISignalRow"]
    Reject["return null<br/>(error logged)"]
    
    GetSignal --> Augment
    Augment --> Validate
    Validate -->|"pass"| Risk
    Validate -->|"fail"| Reject
    Risk -->|"pass"| Accept
    Risk -->|"fail"| Reject
```

**Sources:**
- [src/client/ClientStrategy.ts:41-261]() (VALIDATE_SIGNAL_FN)
- [src/client/ClientStrategy.ts:263-396]() (GET_SIGNAL_FN)

### Validation Rules

The `VALIDATE_SIGNAL_FN` at [src/client/ClientStrategy.ts:41-261]() enforces these constraints:

```mermaid
graph TB
    subgraph "Price Validation"
        P1["priceOpen > 0"]
        P2["priceTakeProfit > 0"]
        P3["priceStopLoss > 0"]
    end
    
    subgraph "Long Position Logic"
        L1["priceTakeProfit > priceOpen<br/>(profit goes up)"]
        L2["priceStopLoss < priceOpen<br/>(stop below entry)"]
    end
    
    subgraph "Short Position Logic"
        S1["priceTakeProfit < priceOpen<br/>(profit goes down)"]
        S2["priceStopLoss > priceOpen<br/>(stop above entry)"]
    end
    
    subgraph "Time Validation"
        T1["minuteEstimatedTime > 0"]
        T2["timestamp > 0"]
    end
    
    subgraph "Distance Validation"
        D1["TP distance >= CC_MIN_TAKEPROFIT_DISTANCE_PERCENT"]
        D2["SL distance <= CC_MAX_STOPLOSS_DISTANCE_PERCENT"]
        D3["minuteEstimatedTime <= CC_MAX_SIGNAL_LIFETIME_MINUTES"]
    end
```

### Global Validation Parameters

Configurable via `setConfig()` from [src/config/params.ts:1-35]():

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | 0.1% | Ensures TP covers trading fees (prevents micro-profits eaten by costs) |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | 20% | Prevents catastrophic losses from extreme SL values |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 (1 day) | Prevents eternal signals blocking risk limits |
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 (2 hours) | Maximum wait time for scheduled signal activation |

**Validation Error Examples:**

| Invalid Signal | Error Message |
|----------------|---------------|
| Long with TP below open | `Long: priceTakeProfit (49000) must be > priceOpen (50000)` |
| Long with SL above open | `Long: priceStopLoss (51000) must be < priceOpen (50000)` |
| Short with TP above open | `Short: priceTakeProfit (51000) must be < priceOpen (50000)` |
| Short with SL below open | `Short: priceStopLoss (49000) must be > priceOpen (50000)` |
| Negative price | `priceOpen must be positive, got -50000` |
| Zero time | `minuteEstimatedTime must be positive, got 0` |
| TP too close | `TakeProfit distance (0.05%) below minimum (0.1%)` |
| SL too far | `StopLoss distance (25%) exceeds maximum (20%)` |
| Excessive lifetime | `Signal lifetime (2000min) exceeds maximum (1440min)` |

### Validation Flow

```mermaid
sequenceDiagram
    participant Strategy as "ClientStrategy"
    participant GetSignal as "GET_SIGNAL_FN"
    participant Validate as "VALIDATE_SIGNAL_FN"
    participant User as "User getSignal()"
    
    Strategy->>GetSignal: "Check interval throttle"
    alt "Too soon (< interval)"
        GetSignal-->>Strategy: "return null"
    else "Interval passed"
        GetSignal->>User: "await getSignal(symbol)"
        User-->>GetSignal: "ISignalDto"
        GetSignal->>GetSignal: "Augment with id, timestamp"
        GetSignal->>Validate: "VALIDATE_SIGNAL_FN(signalRow)"
        alt "Validation passes"
            Validate-->>GetSignal: "void"
            GetSignal-->>Strategy: "ISignalRow"
        else "Validation fails"
            Validate-->>GetSignal: "throw Error(details)"
            GetSignal-->>Strategy: "null (caught by trycatch)"
        end
    end
```

**Sources:**
- [src/client/ClientStrategy.ts:41-261]() (VALIDATE_SIGNAL_FN)
- [src/client/ClientStrategy.ts:263-396]() (GET_SIGNAL_FN)
- [src/interfaces/Strategy.interface.ts:24-39]() (ISignalDto)
- [src/config/params.ts:5-72]() (GLOBAL_CONFIG)
- [test/e2e/sanitize.test.mjs]() (validation test coverage)

---

## Signal Lifecycle and Order Types

Signals follow a deterministic state machine supporting both market orders (immediate execution) and limit orders (scheduled execution at specific price).

### Diagram: Signal State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle
    
    Idle --> Scheduled: "getSignal() with priceOpen != current"
    Idle --> Opened: "getSignal() with priceOpen == current"
    
    Scheduled --> Opened: "Price reaches priceOpen"
    Scheduled --> Cancelled: "Timeout (CC_SCHEDULE_AWAIT_MINUTES)"
    Scheduled --> Cancelled: "SL hit before activation"
    
    Cancelled --> [*]
    
    Opened --> Active: "Next tick()"
    
    Active --> Active: "Monitoring TP/SL/time"
    Active --> Closed: "TP/SL/time_expired"
    
    Closed --> Idle: "Signal complete"
    Idle --> [*]
```

**Sources:**
- [src/client/ClientStrategy.ts:474-596]() (scheduled signal logic)
- [src/client/ClientStrategy.ts:598-718]() (scheduled signal activation)
- [src/interfaces/Strategy.interface.ts:45-306]() (ISignalRow, state types)

### Scheduled Signals (Limit Orders)

Scheduled signals wait for price activation with timeout and pre-activation cancellation:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 | Maximum wait time before timeout cancellation |
| Pre-Activation SL Check | Enabled | Cancel if SL hit before entry (prevents bad entries) |
| Risk Re-Validation | Required | Re-check risk limits at activation time |

**Scheduled Signal Flow:**

```mermaid
sequenceDiagram
    participant Strategy as "ClientStrategy"
    participant Check as "CHECK_SCHEDULED_SIGNAL_PRICE_ACTIVATION_FN"
    participant Activate as "ACTIVATE_SCHEDULED_SIGNAL_FN"
    participant Risk as "ClientRisk"
    
    Strategy->>Check: "Check price vs priceOpen"
    
    alt "SL hit before activation"
        Check-->>Strategy: "shouldCancel=true"
        Strategy->>Strategy: "CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN"
    else "Price reached priceOpen"
        Check-->>Strategy: "shouldActivate=true"
        Strategy->>Activate: "Activate scheduled signal"
        Activate->>Risk: "checkSignal() re-validation"
        Risk-->>Activate: "pass/fail"
        alt "Risk check pass"
            Activate->>Strategy: "Convert to opened signal"
        else "Risk check fail"
            Activate-->>Strategy: "Cancel activation"
        end
    else "Still waiting"
        Check-->>Strategy: "Continue monitoring"
    end
```

**Sources:**
- [src/client/ClientStrategy.ts:474-528]() (timeout check)
- [src/client/ClientStrategy.ts:530-564]() (price activation check)
- [src/client/ClientStrategy.ts:601-693]() (activation with risk re-check)

### Discriminated Union Types

Type-safe state handling via `IStrategyTickResult`:

```typescript
// Example type narrowing (not actual code)
if (result.action === "scheduled") {
  // TypeScript knows: result.signal is IScheduledSignalRow
  console.log(result.signal.priceOpen);
}

if (result.action === "cancelled") {
  // TypeScript knows: result has closeReason, closeTimestamp
  console.log(result.closeReason); // "timeout" | "stop_loss"
}

if (result.action === "closed") {
  // TypeScript knows: result has pnl, closeReason
  console.log(result.pnl.pnlPercentage);
  console.log(result.closeReason); // "take_profit" | "stop_loss" | "time_expired"
}
```

**Sources:**
- [src/interfaces/Strategy.interface.ts:173-289]() (discriminated union types)

---

## Risk Management System

Portfolio-level risk controls with custom validation logic, concurrent position limits, and cross-strategy coordination via `ClientRisk` and `IRiskSchema`.

### Diagram: Risk Validation Flow

```mermaid
graph TB
    GetSignal["GET_SIGNAL_FN"]
    PreCheck["Risk.checkSignal()<br/>pre-generation check"]
    Generate["User getSignal()"]
    PostCheck["Risk.checkSignal()<br/>post-validation check"]
    AddSignal["Risk.addSignal()<br/>register active position"]
    RemoveSignal["Risk.removeSignal()<br/>on signal close"]
    
    GetSignal --> PreCheck
    PreCheck -->|"pass"| Generate
    PreCheck -->|"fail"| Reject["return null"]
    Generate --> Validate["VALIDATE_SIGNAL_FN"]
    Validate --> PostCheck
    PostCheck -->|"pass"| AddSignal
    PostCheck -->|"fail"| Reject
    AddSignal --> Active["Signal active"]
    Active --> RemoveSignal
```

**Sources:**
- [src/client/ClientRisk.ts]()
- [src/client/ClientStrategy.ts:288-300]() (pre-check)
- [src/client/ClientStrategy.ts:769-781]() (post-check and addSignal)

### Risk Schema Configuration

`IRiskSchema` defines custom validation functions with portfolio state access:

| Field | Type | Purpose |
|-------|------|---------|
| `riskName` | `string` | Unique risk profile identifier |
| `validations` | `IRiskValidation[]` | Array of validation functions |
| `callbacks` | `Partial<IRiskCallbacks>` | Optional `onRejected`, `onAllowed` |

**Validation Payload:**

```typescript
// From IRiskValidationPayload interface
{
  symbol: string;
  strategyName: string;
  exchangeName: string;
  currentPrice: number;
  timestamp: number;
  activePositionCount: number; // Portfolio-wide
  activePositions: IRiskActivePosition[]; // All active signals
}
```

**Example Risk Validations:**

```typescript
// Concurrent position limit (not actual code)
validations: [
  ({ activePositionCount }) => {
    if (activePositionCount >= 3) {
      throw new Error("Maximum 3 concurrent positions");
    }
  }
]

// Symbol filtering (not actual code)
validations: [
  ({ symbol }) => {
    if (memeCoins.includes(symbol)) {
      throw new Error(`Meme coin ${symbol} blocked`);
    }
  }
]

// Time-based trading windows (not actual code)
validations: [
  ({ timestamp }) => {
    const hour = new Date(timestamp).getUTCHours();
    if (hour < 9 || hour > 17) {
      throw new Error("Outside trading hours");
    }
  }
]
```

**Sources:**
- [src/interfaces/Risk.interface.ts:443-526]() (IRiskSchema, IRiskValidation)
- [src/client/ClientRisk.ts]() (ClientRisk implementation)
- [README.md:646-695]() (risk management examples)

---

## Strategy Comparison (Walker)

Walker mode executes multiple strategies on the same timeframe and ranks them by a configurable metric. Results include statistical comparison and best strategy identification.

### Diagram: Walker Execution Flow

```mermaid
graph TB
    WalkerSchema["WalkerSchemaService<br/>strategies[], metric, frameName"]
    WalkerLogic["WalkerLogicPrivateService"]
    Loop["For each strategy<br/>in strategies[]"]
    RunBacktest["BacktestLogicPublicService<br/>run full backtest"]
    GetStats["BacktestMarkdownService<br/>getData()"]
    Extract["Extract metric value<br/>(sharpeRatio, winRate, etc)"]
    Compare["Compare with bestMetric<br/>update if better"]
    Emit["Emit WalkerContract<br/>progress event"]
    Final["Emit walkerCompleteSubject<br/>final results"]
    
    WalkerSchema --> WalkerLogic
    WalkerLogic --> Loop
    Loop --> RunBacktest
    RunBacktest --> GetStats
    GetStats --> Extract
    Extract --> Compare
    Compare --> Emit
    Loop -->|"all strategies done"| Final
```

**Sources:**
- [src/lib/services/logic/private/WalkerLogicPrivateService.ts]()
- [src/lib/services/markdown/WalkerMarkdownService.ts]()

### Walker Schema Configuration

`IWalkerSchema` defines strategy comparison parameters:

| Field | Type | Purpose |
|-------|------|---------|
| `walkerName` | `string` | Unique walker identifier |
| `strategies` | `string[]` | Array of strategy names to compare |
| `exchangeName` | `string` | Exchange to use for all backtests |
| `frameName` | `string` | Timeframe for fair comparison |
| `metric` | `WalkerMetric` | Comparison metric (default: `sharpeRatio`) |

**Available Metrics:**

| Metric | Formula | Purpose |
|--------|---------|---------|
| `sharpeRatio` | `avgPnl / stdDev` | Risk-adjusted return (default) |
| `winRate` | `(winCount / totalSignals) × 100` | Win percentage |
| `avgPnl` | `Σ(pnl) / totalSignals` | Average profit per trade |
| `totalPnl` | `Σ(pnl)` | Cumulative profit |
| `certaintyRatio` | `avgWin / |avgLoss|` | Win/loss ratio |

**Walker Output:**

```typescript
// WalkerContract structure (not actual code)
{
  strategyName: string;
  stats: BacktestStatistics;
  metric: number; // Extracted metric value
  bestStrategy: string; // Current best
  bestMetric: number; // Current best metric value
  progress: number; // 0-1 completion
}
```

**Sources:**
- [src/interfaces/Walker.interface.ts]() (IWalkerSchema)
- [src/contract/Walker.contract.ts]() (WalkerContract)
- [src/classes/Walker.ts]() (public API)
- [README.md:413-467]() (Walker examples)

---

## AI-Powered Strategy Optimization

LLM-driven strategy generation from historical data with multi-timeframe analysis, automatic code generation, and walk-forward validation via `ClientOptimizer` and `IOptimizerSchema`.

### Diagram: Optimizer Pipeline

```mermaid
graph TB
    subgraph "Phase 1: Data Collection"
        Sources["Data Sources<br/>(1h, 30m, 15m, 1m)"]
        Fetch["IOptimizerSourceFn<br/>pagination with limit/offset"]
        Format["Format to markdown tables"]
        Messages["Build conversation history<br/>user/assistant pairs"]
    end
    
    subgraph "Phase 2: LLM Interaction"
        Prompt["getPrompt(symbol, messageList)"]
        LLM["Ollama API<br/>deepseek-v3.1:671b"]
        Strategy["Generated strategy logic"]
    end
    
    subgraph "Phase 3: Code Generation"
        Templates["OptimizerTemplateService<br/>11 template methods"]
        Assemble["Assemble code sections"]
        Export["Write to .mjs file"]
    end
    
    Sources --> Fetch
    Fetch --> Format
    Format --> Messages
    Messages --> Prompt
    Prompt --> LLM
    LLM --> Strategy
    
    Strategy --> Templates
    Templates --> Assemble
    Assemble --> Export
```

**Sources:**
- [src/client/ClientOptimizer.ts]()
- [src/lib/services/template/OptimizerTemplateService.ts]()
- [src/interfaces/Optimizer.interface.ts]()

### Optimizer Schema Configuration

`IOptimizerSchema` defines AI strategy generation parameters:

| Field | Type | Purpose |
|-------|------|---------|
| `optimizerName` | `string` | Unique optimizer identifier |
| `rangeTrain` | `IOptimizerRange[]` | Training date ranges for data collection |
| `rangeTest` | `IOptimizerRange` | Testing date range for validation |
| `source` | `Source[]` | Data sources (functions or configs) |
| `getPrompt` | Function | LLM prompt generator from message history |
| `template` | `Partial<IOptimizerTemplate>` | Optional code generation overrides |

**Data Source Types:**

```typescript
// Simple function (not actual code)
source: [
  async ({ symbol, startDate, endDate, limit, offset }) => {
    return await fetchCandleData(symbol, startDate, endDate, limit, offset);
  }
]

// Full configuration (not actual code)
source: [
  {
    name: "1h-candles",
    fetch: async (args) => { /* ... */ },
    user: (symbol, data) => formatUserMessage(data),
    assistant: (symbol, data) => "Data analyzed"
  }
]
```

**Code Generation Templates:**

The `OptimizerTemplateService` provides 11 template methods:

| Method | Purpose |
|--------|---------|
| `getTopBanner` | Imports and initialization |
| `getJsonDumpTemplate` | Debug logging helper |
| `getTextTemplate` | LLM text helper function |
| `getJsonTemplate` | LLM JSON helper function |
| `getExchangeTemplate` | CCXT exchange configuration |
| `getFrameTemplate` | Timeframe definitions (train + test) |
| `getStrategyTemplate` | Strategy with LLM integration |
| `getWalkerTemplate` | Strategy comparison setup |
| `getLauncherTemplate` | Execution code with listeners |
| `getUserMessage` | Default user message format |
| `getAssistantMessage` | Default assistant message format |

**Sources:**
- [src/lib/services/template/OptimizerTemplateService.ts:26-583]() (template methods)
- [src/client/ClientOptimizer.ts:99-215]() (data collection)
- [src/client/ClientOptimizer.ts:224-350]() (code assembly)
- [README.md:1000-1100]() (optimizer examples)

---

## Position Sizing

Position size calculation with multiple methods: fixed percentage, Kelly Criterion, and ATR-based sizing via `ClientSizing` and `ISizingSchema`.

### Diagram: Position Sizing Methods

```mermaid
graph TB
    SizingSchema["ISizingSchema<br/>method, constraints"]
    
    subgraph "Fixed Percentage"
        FixedCalc["riskPercentage × balance<br/>/ (priceOpen - priceStopLoss)"]
    end
    
    subgraph "Kelly Criterion"
        KellyCalc["kellyFraction = winRate - (1 - winRate) / winLossRatio<br/>position = kellyFraction × kellyMultiplier × balance"]
    end
    
    subgraph "ATR-Based"
        ATRCalc["stopDistance = atr × atrMultiplier<br/>position = riskPercentage × balance / stopDistance"]
    end
    
    subgraph "Constraints"
        MinSize["minPositionSize"]
        MaxSize["maxPositionSize"]
        MaxPct["maxPositionPercentage"]
    end
    
    SizingSchema --> FixedCalc
    SizingSchema --> KellyCalc
    SizingSchema --> ATRCalc
    
    FixedCalc --> MinSize
    KellyCalc --> MinSize
    ATRCalc --> MinSize
    
    MinSize --> MaxSize
    MaxSize --> MaxPct
```

**Sources:**
- [src/client/ClientSizing.ts]()
- [src/interfaces/Sizing.interface.ts]()

### Sizing Schema Configuration

`ISizingSchema` defines position sizing parameters:

| Field | Type | Purpose |
|-------|------|---------|
| `sizingName` | `string` | Unique sizing profile identifier |
| `method` | `SizingMethod` | `"fixed-percentage"`, `"kelly-criterion"`, or `"atr-based"` |
| `riskPercentage` | `number` | Risk per trade (e.g., 2 for 2%) |
| `kellyMultiplier` | `number?` | Kelly fraction multiplier (0.25 recommended) |
| `atrMultiplier` | `number?` | ATR multiplier for stop distance |
| `maxPositionPercentage` | `number?` | Maximum position as % of balance |
| `minPositionSize` | `number?` | Minimum position size |
| `maxPositionSize` | `number?` | Maximum position size |

**Position Sizing API:**

```typescript
// Example usage (not actual code)
import { PositionSize } from "backtest-kit";

// Fixed percentage
const qty1 = await PositionSize.fixedPercentage(
  "BTCUSDT",
  10000,  // balance
  50000,  // entry price
  49000,  // stop loss
  { sizingName: "conservative" }
);

// Kelly Criterion
const qty2 = await PositionSize.kellyCriterion(
  "BTCUSDT",
  10000,  // balance
  50000,  // entry price
  0.55,   // win rate
  1.5,    // win/loss ratio
  { sizingName: "kelly-quarter" }
);

// ATR-based
const qty3 = await PositionSize.atrBased(
  "BTCUSDT",
  10000,  // balance
  50000,  // entry price
  500,    // ATR value
  { sizingName: "atr-dynamic" }
);
```

**Sources:**
- [src/classes/PositionSize.ts]() (public API)
- [src/client/ClientSizing.ts]() (calculation logic)
- [README.md:560-643]() (sizing examples)

---

## Memory-Efficient Async Generators

All execution modes use async generators (`AsyncIterableIterator`) to stream results without memory accumulation:

### Generator Architecture

```mermaid
graph TB
    subgraph "Public API Layer"
        BacktestRun["Backtest.run()"]
        LiveRun["Live.run()"]
    end
    
    subgraph "Generator Implementation"
        BacktestGen["BacktestLogicPrivateService.execute()*"]
        LiveGen["LiveLogicPrivateService.execute()*"]
    end
    
    subgraph "Yield Patterns"
        BacktestYield["yield closed result<br/>(only completed signals)"]
        LiveYield["yield opened/closed<br/>(filtered active)"]
    end
    
    subgraph "Memory Characteristics"
        M1["No accumulation"]
        M2["O(1) memory per iteration"]
        M3["Early termination with break"]
    end
    
    BacktestRun --> BacktestGen
    LiveRun --> LiveGen
    BacktestGen --> BacktestYield
    LiveGen --> LiveYield
    BacktestYield --> M1
    LiveYield --> M1
    M1 --> M2
    M2 --> M3
```

### Generator Comparison

| Aspect | Backtest Generator | Live Generator |
|--------|-------------------|----------------|
| **Termination** | Finite (timeframe exhausted) | Infinite (`while (true)`) |
| **Yield Condition** | Only `closed` results | `opened` and `closed` (filters `active`) |
| **Context Setting** | Historical timestamp from timeframe | `Date.now()` on each iteration |
| **Sleep Interval** | None (fast iteration) | 60000ms + 1ms between ticks |
| **Fast-Forward** | Yes (`backtest()` method) | No (real-time only) |
| **Cancellation** | `break` from iterator | `cancel()` function returned by `background()` |

### Memory Optimization Techniques

1. **Prototype Methods**: All client classes use prototype functions instead of arrow functions
   - **Location**: [src/client/ClientStrategy.ts]() (all methods use `public methodName = async () => {}` pattern)
   - **Benefit**: Single function instance shared across all instances

2. **Memoization**: Connection services cache client instances
   - **Location**: [src/lib/services/connection/]()
   - **Pattern**: `memoize()` from `functools-kit` on `getStrategy()`, `getExchange()`, `getFrame()`

3. **Streaming Accumulation**: Markdown services accumulate passively
   - **Location**: [src/lib/services/markdown/]()
   - **Pattern**: Listen to events, build report only when requested via `getReport()`

4. **Lazy Initialization**: Services created only when needed
   - **Pattern**: DI container resolves dependencies on first access

**Sources:**
- [src/lib/services/logic/private/BacktestLogicPrivateService.ts]()
- [src/lib/services/logic/private/LiveLogicPrivateService.ts]()
- [src/client/ClientStrategy.ts:194-464]() (prototype methods)

---

## Signal Lifecycle State Machine

Signals follow a deterministic state machine with discriminated union types for type-safe handling. The framework supports both market orders (immediate execution) and limit orders (scheduled execution).

### Complete Signal Lifecycle

```mermaid
stateDiagram-v2
    direction LR
    
    [*] --> Idle
    
    state "Idle" as Idle {
        [*] --> NoSignal
        NoSignal: "IStrategyTickResultIdle"
        NoSignal: "action: 'idle'"
        NoSignal: "signal: null"
    }
    
    Idle --> Scheduled: "getSignal() with priceOpen != current"
    Idle --> Opened: "getSignal() with priceOpen == current"
    
    state "Scheduled" as Scheduled {
        [*] --> Pending
        Pending: "IStrategyTickResultScheduled"
        Pending: "action: 'scheduled'"
        Pending: "signal: ISignalRow (scheduledAt)"
        Pending: "Wait for price activation"
        Pending: "Trigger onSchedule callback"
    }
    
    Scheduled --> Opened: "Price reaches priceOpen"
    Scheduled --> Cancelled: "Timeout (CC_SCHEDULE_AWAIT_MINUTES)"
    Scheduled --> Cancelled: "SL hit before activation"
    
    state "Cancelled" as Cancelled {
        [*] --> NotActivated
        NotActivated: "IStrategyTickResultCancelled"
        NotActivated: "action: 'cancelled'"
        NotActivated: "signal: ISignalRow"
        NotActivated: "closeReason: 'timeout' | 'stop_loss'"
        NotActivated: "Trigger onCancel callback"
    }
    
    Cancelled --> Idle: "Return to idle"
    
    state "Opened" as Opened {
        [*] --> NewSignal
        NewSignal: "IStrategyTickResultOpened"
        NewSignal: "action: 'opened'"
        NewSignal: "signal: ISignalRow (pendingAt)"
        NewSignal: "Persist to disk (live)"
        NewSignal: "Trigger onOpen callback"
    }
    
    Opened --> Active: "Next tick()"
    
    state "Active" as Active {
        [*] --> Monitoring
        Monitoring: "IStrategyTickResultActive"
        Monitoring: "action: 'active'"
        Monitoring: "signal: ISignalRow"
        Monitoring: "Check TP/SL/time"
        Monitoring: "Trigger onActive callback"
    }
    
    Active --> Active: "Conditions not met"
    Active --> Closed: "TP hit"
    Active --> Closed: "SL hit"
    Active --> Closed: "Time expired"
    
    state "Closed" as Closed {
        [*] --> Completed
        Completed: "IStrategyTickResultClosed"
        Completed: "action: 'closed'"
        Completed: "signal: ISignalRow"
        Completed: "closeReason: StrategyCloseReason"
        Completed: "pnl: IStrategyPnL"
        Completed: "Persist null (live)"
        Completed: "Trigger onClose callback"
    }
    
    Closed --> Idle: "Signal lifecycle complete"
```

### Type-Safe State Handling

The discriminated union `IStrategyTickResult` enables type narrowing:

```typescript
// Example usage (not actual code, just illustration)
const result = await strategy.tick();

if (result.action === "idle") {
  // TypeScript knows: result.signal === null
  console.log(result.currentPrice);
}

if (result.action === "scheduled") {
  // TypeScript knows: result.signal is ISignalRow with scheduledAt
  console.log(result.signal.priceOpen);
  console.log(result.signal.scheduledAt);
}

if (result.action === "cancelled") {
  // TypeScript knows: result has closeReason, closeTimestamp
  console.log(result.closeReason); // "timeout" | "stop_loss"
  console.log(result.closeTimestamp);
}

if (result.action === "opened") {
  // TypeScript knows: result.signal is ISignalRow with pendingAt
  console.log(result.signal.priceOpen);
  console.log(result.signal.pendingAt);
}

if (result.action === "active") {
  // TypeScript knows: result.signal is ISignalRow
  // result.currentPrice is available
}

if (result.action === "closed") {
  // TypeScript knows: result has pnl, closeReason, closeTimestamp
  console.log(result.pnl.pnlPercentage);
  console.log(result.closeReason); // "take_profit" | "stop_loss" | "time_expired"
}
```

### State Transition Code Locations

| State | Entry Point | Exit Point | Notes |
|-------|-------------|------------|-------|
| **idle** | [src/client/ClientStrategy.ts:306-322]() | `getSignal()` returns non-null | No active signal |
| **scheduled** | Signal generation with future `priceOpen` | Price activation or timeout | Limit order waiting |
| **cancelled** | Timeout or SL before activation | Return to idle | Scheduled signal not filled |
| **opened** | [src/client/ClientStrategy.ts:275-291]() | Next tick iteration | Position activated |
| **active** | [src/client/ClientStrategy.ts:447-463]() | TP/SL/time condition met | Position monitoring |
| **closed** | [src/client/ClientStrategy.ts:416-435]() | `setPendingSignal(null)` | Final state with PNL |

**Sources:**
- [src/lib/services/logic/private/BacktestLogicPrivateService.ts]()
- [src/lib/services/logic/private/LiveLogicPrivateService.ts]()

---

## Accurate PNL Calculation

Profit and loss includes realistic trading costs via `toProfitLossDto()`:

### Cost Constants

| Cost Type | Value | Application |
|-----------|-------|-------------|
| **Fee** | 0.1% (0.001) | Applied to both entry and exit |
| **Slippage** | 0.1% (0.001) | Simulates market impact |
| **Total Cost** | 0.2% per side | 0.4% round-trip (0.2% entry + 0.2% exit) |

### PNL Formulas

**Long Position:**
```
priceOpenWithCosts  = priceOpen  × (1 + slippage + fee)
priceCloseWithCosts = priceClose × (1 - slippage - fee)
pnl% = (priceCloseWithCosts - priceOpenWithCosts) / priceOpenWithCosts × 100
```

**Short Position:**
```
priceOpenWithCosts  = priceOpen  × (1 - slippage + fee)
priceCloseWithCosts = priceClose × (1 + slippage + fee)
pnl% = (priceOpenWithCosts - priceCloseWithCosts) / priceOpenWithCosts × 100
```

### PNL Calculation Implementation

```mermaid
graph TB
    Signal["ISignalRow"]
    ClosePrice["currentPrice<br/>(VWAP at close)"]
    Helper["toProfitLossDto()"]
    Result["IStrategyPnL"]
    
    Signal -->|"position, priceOpen"| Helper
    ClosePrice -->|"priceClose"| Helper
    
    Helper -->|"apply costs"| Result
    
    Result -->|"priceOpen (adjusted)"| Output
    Result -->|"priceClose (adjusted)"| Output
    Result -->|"pnlPercentage"| Output
    
    subgraph "Cost Application"
        L["LONG:<br/>open × 1.002<br/>close × 0.998"]
        S["SHORT:<br/>open × 0.999<br/>close × 1.002"]
    end
```

**Example Calculation (Long Position):**

| Parameter | Value |
|-----------|-------|
| Entry Price | $50,000 |
| Exit Price | $51,000 |
| **Adjusted Entry** | $50,000 × 1.002 = $50,100 |
| **Adjusted Exit** | $51,000 × 0.998 = $50,898 |
| **PNL %** | ($50,898 - $50,100) / $50,100 × 100 = **+1.59%** |

Without costs, this would be +2.0%. The 0.41% difference represents realistic trading costs.

**Sources:**
- [src/helpers/toProfitLossDto.ts]() (PNL calculation)
- [src/client/ClientStrategy.ts:883]() (usage in CLOSE_PENDING_SIGNAL_FN)

---

## Reporting and Analytics

Comprehensive performance analysis with markdown reports, statistics calculation, and specialized tracking systems.

### Diagram: Reporting Architecture

```mermaid
graph TB
    subgraph "Event Sources"
        SignalEmitters["signalEmitter<br/>signalBacktestEmitter<br/>signalLiveEmitter"]
        ProgressEmitters["progressBacktestEmitter<br/>progressWalkerEmitter<br/>progressOptimizerEmitter"]
        PartialEmitters["partialProfitSubject<br/>partialLossSubject"]
    end
    
    subgraph "Markdown Services"
        BacktestMD["BacktestMarkdownService<br/>closed signals only"]
        LiveMD["LiveMarkdownService<br/>all events (idle/active/opened/closed)"]
        WalkerMD["WalkerMarkdownService<br/>strategy comparison"]
        ScheduleMD["ScheduleMarkdownService<br/>scheduled/cancelled"]
        PartialMD["PartialMarkdownService<br/>milestone tracking"]
        HeatMD["HeatMarkdownService<br/>multi-symbol analysis"]
    end
    
    subgraph "Public API"
        GetData["getData(strategyName)"]
        GetReport["getReport(strategyName)"]
        Dump["dump(strategyName, path?)"]
    end
    
    SignalEmitters --> BacktestMD
    SignalEmitters --> LiveMD
    SignalEmitters --> ScheduleMD
    PartialEmitters --> PartialMD
    
    BacktestMD --> GetData
    LiveMD --> GetData
    WalkerMD --> GetData
    ScheduleMD --> GetData
    PartialMD --> GetData
    HeatMD --> GetData
    
    GetData --> GetReport
    GetReport --> Dump
```

**Sources:**
- [src/lib/services/markdown/BacktestMarkdownService.ts]()
- [src/lib/services/markdown/LiveMarkdownService.ts]()
- [src/lib/services/markdown/WalkerMarkdownService.ts]()
- [src/lib/services/markdown/ScheduleMarkdownService.ts]()
- [src/lib/services/markdown/PartialMarkdownService.ts]()
- [src/lib/services/markdown/HeatMarkdownService.ts]()

### Performance Metrics

All markdown services calculate comprehensive statistics:

| Metric | Formula | Purpose |
|--------|---------|---------|
| **Win Rate** | `(winCount / totalSignals) × 100` | Percentage of profitable trades |
| **Average PNL** | `Σ(pnl) / totalSignals` | Average profit per trade |
| **Total PNL** | `Σ(pnl)` | Cumulative profit/loss |
| **Standard Deviation** | `√(Σ(pnl - avgPnl)² / n)` | Volatility metric |
| **Sharpe Ratio** | `avgPnl / stdDev` | Risk-adjusted return |
| **Annualized Sharpe** | `sharpeRatio × √365` | Yearly risk-adjusted return |
| **Certainty Ratio** | `avgWin / |avgLoss|` | Win/loss magnitude ratio |
| **Expected Yearly Returns** | `avgPnl × (365 / avgDurationDays)` | Projected annual return |

**Sources:**
- [src/lib/services/markdown/BacktestMarkdownService.ts:202-269]() (statistics calculation)

### Partial Profit/Loss Tracking

`ClientPartial` tracks milestone levels (10%, 20%, 30%, ..., 100%) for active signals:

```mermaid
graph LR
    Active["Active Signal"]
    Monitor["Monitor revenuePercent"]
    Check["Check milestone levels"]
    Emit["Emit partialProfitSubject<br/>or partialLossSubject"]
    Store["Store in Set<br/>(deduplication)"]
    
    Active --> Monitor
    Monitor --> Check
    Check -->|"new level reached"| Emit
    Emit --> Store
    Check -->|"already emitted"| Monitor
```

**Partial API:**

```typescript
// Example usage (not actual code)
import { listenPartialProfit, listenPartialLoss } from "backtest-kit";

listenPartialProfit((event) => {
  console.log(`Signal ${event.data.id} reached ${event.level}% profit`);
  // event.level: 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100
});

listenPartialLoss((event) => {
  console.log(`Signal ${event.data.id} reached ${event.level}% loss`);
});
```

**Sources:**
- [src/client/ClientPartial.ts]()
- [src/interfaces/Partial.interface.ts:585-727]() (IPartial interface)

### Portfolio Heatmap

`HeatMarkdownService` aggregates backtest results across multiple symbols:

| Column | Description |
|--------|-------------|
| **Total PNL** | Cumulative profit/loss for symbol |
| **Sharpe Ratio** | Risk-adjusted return (used for sorting) |
| **Profit Factor** | Sum of wins / sum of losses |
| **Expectancy** | Expected value per trade |
| **Win Rate** | Percentage of winning trades |
| **Avg Win / Avg Loss** | Average profit and loss magnitudes |
| **Max Drawdown** | Largest peak-to-trough decline |
| **Win Streak / Loss Streak** | Maximum consecutive wins/losses |
| **Total Trades** | Number of closed signals |

**Heatmap API:**

```typescript
// Example usage (not actual code)
import { Heat, Backtest } from "backtest-kit";

// Run backtests for multiple symbols
for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
  for await (const _ of Backtest.run(symbol, { /* config */ })) {}
}

// Generate portfolio heatmap
const stats = await Heat.getData("my-strategy");
const report = await Heat.getReport("my-strategy");
await Heat.dump("my-strategy"); // Save to ./logs/heatmap/
```

**Sources:**
- [src/lib/services/markdown/HeatMarkdownService.ts]()
- [src/classes/Heat.ts]() (public API)
- [README.md:476-558]() (heatmap examples)

---

## Additional Production Features

### VWAP-Based Pricing

All price monitoring uses Volume-Weighted Average Price from last 5 one-minute candles:

### Throttling Mechanism

```mermaid
graph TB
    Tick["ClientStrategy.tick()"]
    GetSignal["GET_SIGNAL_FN()"]
    Check["Check interval"]
    LastTime["_lastSignalTimestamp"]
    CurrentTime["execution.context.when"]
    
    Tick --> GetSignal
    GetSignal --> Check
    Check --> LastTime
    Check --> CurrentTime
    
    Check -->|"currentTime - lastTime < interval"| Reject["return null"]
    Check -->|"currentTime - lastTime >= interval"| Allow["Call getSignal()"]
    
    Allow --> Update["Update _lastSignalTimestamp"]
    Update --> Validate["VALIDATE_SIGNAL_FN()"]
    Validate --> Return["return ISignalRow"]
```

### Supported Intervals

| Interval | Minutes | Use Case |
|----------|---------|----------|
| `"1m"` | 1 | High-frequency strategies |
| `"3m"` | 3 | Short-term signals |
| `"5m"` | 5 | Medium-frequency trading |
| `"15m"` | 15 | Moderate signals |
| `"30m"` | 30 | Low-frequency strategies |
| `"1h"` | 60 | Hourly signals |

### Throttling Logic Location

The throttling check occurs at [src/client/ClientStrategy.ts:94-106]():

```typescript
// Pseudocode representation (not actual code)
const intervalMinutes = INTERVAL_MINUTES[interval]; // e.g., "5m" → 5
const intervalMs = intervalMinutes × 60 × 1000;

if (lastSignalTimestamp !== null && 
    currentTime - lastSignalTimestamp < intervalMs) {
  return null; // Too soon, throttle
}

lastSignalTimestamp = currentTime; // Update for next check
```

**Sources:**
- [src/client/ClientStrategy.ts:19-26]() (INTERVAL_MINUTES mapping)
- [src/client/ClientStrategy.ts:90-131]() (GET_SIGNAL_FN with throttling)
- [src/interfaces/Strategy.interface.ts:10-16]() (SignalInterval type)

---

## VWAP-Based Pricing

All price monitoring uses Volume-Weighted Average Price (VWAP) calculated from the last `CC_AVG_PRICE_CANDLES_COUNT` (default: 5) one-minute candles, providing more accurate price discovery than simple close prices:

### VWAP Calculation

```mermaid
graph TB
    Candles["Last 5 × 1m candles"]
    TypicalPrice["Typical Price = (high + low + close) / 3"]
    PriceVolume["Price × Volume"]
    SumPV["Σ(Price × Volume)"]
    SumV["Σ(Volume)"]
    VWAP["VWAP = Σ(Price × Volume) / Σ(Volume)"]
    
    Candles --> TypicalPrice
    TypicalPrice --> PriceVolume
    PriceVolume --> SumPV
    Candles --> SumV
    SumPV --> VWAP
    SumV --> VWAP
```

### VWAP Usage Points

| Context | Method | Purpose |
|---------|--------|---------|
| **Live Tick** | `ClientStrategy.tick()` | Check TP/SL against current VWAP |
| **Live Idle** | `ClientStrategy.tick()` (no signal) | Report current market price |
| **Backtest** | `ClientStrategy.backtest()` | Check TP/SL on each candle's VWAP |
| **Public API** | `getAveragePrice(symbol)` | Expose VWAP to user strategies |

### VWAP Implementation Flow

```mermaid
sequenceDiagram
    participant Strategy as "ClientStrategy"
    participant Exchange as "ExchangeGlobalService"
    participant Client as "ClientExchange"
    participant Calc as "GET_AVG_PRICE_FN"
    
    Strategy->>Exchange: "getAveragePrice(symbol)"
    Exchange->>Client: "getAveragePrice(symbol)"
    Client->>Client: "getCandles(symbol, '1m', 5)"
    Client->>Calc: "Calculate VWAP"
    Calc->>Calc: "Σ(typical_price × volume) / Σ(volume)"
    Calc-->>Client: "VWAP value"
    Client-->>Exchange: "VWAP value"
    Exchange-->>Strategy: "VWAP value"
```

**Edge Case**: If total volume is zero, fallback to simple average of close prices:
```typescript
// Pseudocode (not actual code)
if (totalVolume === 0) {
  return candles.reduce((sum, c) => sum + c.close, 0) / candles.length;
}
```

**Sources:**
- [src/client/ClientStrategy.ts:398-409]() (GET_AVG_PRICE_FN)
- [src/client/ClientExchange.ts]() (getAveragePrice implementation)
- [src/config/params.ts:14-15]() (CC_AVG_PRICE_CANDLES_COUNT)

### Interval Throttling

Signal generation throttling prevents spam:

| Interval | Minutes | Use Case |
|----------|---------|----------|
| `"1m"` | 1 | High-frequency strategies |
| `"5m"` | 5 | Medium-frequency trading |
| `"15m"` | 15 | Moderate signals |
| `"30m"` | 30 | Low-frequency strategies |
| `"1h"` | 60 | Hourly signals |

**Sources:**
- [src/client/ClientStrategy.ts:32-39]() (INTERVAL_MINUTES mapping)
- [src/client/ClientStrategy.ts:263-396]() (throttling in GET_SIGNAL_FN)

### Plugin Architecture

The framework uses a registry pattern with dependency injection to support custom implementations of exchanges, strategies, and timeframes:

### Registration System

```mermaid
graph TB
    subgraph "User Configuration"
        AddStrategy["addStrategy(IStrategySchema)"]
        AddExchange["addExchange(IExchangeSchema)"]
        AddFrame["addFrame(IFrameSchema)"]
    end
    
    subgraph "Schema Registries"
        StrategyReg["StrategySchemaService<br/>Map<name, schema>"]
        ExchangeReg["ExchangeSchemaService<br/>Map<name, schema>"]
        FrameReg["FrameSchemaService<br/>Map<name, schema>"]
    end
    
    subgraph "Connection Services (Memoized)"
        StrategyConn["StrategyConnectionService<br/>getStrategy(name)"]
        ExchangeConn["ExchangeConnectionService<br/>getExchange(name)"]
        FrameConn["FrameConnectionService<br/>getFrame(name)"]
    end
    
    subgraph "Client Instances"
        CS["ClientStrategy instances"]
        CE["ClientExchange instances"]
        CF["ClientFrame instances"]
    end
    
    AddStrategy --> StrategyReg
    AddExchange --> ExchangeReg
    AddFrame --> FrameReg
    
    StrategyReg --> StrategyConn
    ExchangeReg --> ExchangeConn
    FrameReg --> FrameConn
    
    StrategyConn -->|"create once, cache"| CS
    ExchangeConn -->|"create once, cache"| CE
    FrameConn -->|"create once, cache"| CF
```

### Schema Interfaces

| Schema | Required Methods | Purpose |
|--------|------------------|---------|
| **IStrategySchema** | `getSignal(symbol)` | Define signal generation logic |
| **IExchangeSchema** | `getCandles(symbol, interval, since, limit)` | Provide market data |
| **IFrameSchema** | `startDate`, `endDate`, `interval` | Define backtest period |

### Instance Caching

Connection services use memoization to ensure single instance per schema name:

```mermaid
graph LR
    Call1["Call 1:<br/>getStrategy('my-strategy')"]
    Call2["Call 2:<br/>getStrategy('my-strategy')"]
    Memo["Memoization Cache"]
    Instance["ClientStrategy instance"]
    
    Call1 --> Memo
    Memo -->|"cache miss"| Create["new ClientStrategy()"]
    Create --> Instance
    Instance --> Memo
    
    Call2 --> Memo
    Memo -->|"cache hit"| Instance
```

### Custom Implementation Example

Users can implement custom exchanges by providing a schema:

```typescript
// Example pattern (not actual code)
addExchange({
  exchangeName: "custom-db",
  getCandles: async (symbol, interval, since, limit) => {
    // Fetch from PostgreSQL, MongoDB, etc.
    const rows = await db.query(`SELECT * FROM candles WHERE ...`);
    return rows.map(row => ({
      timestamp: row.time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume
    }));
  },
  formatPrice: async (symbol, price) => price.toFixed(8),
  formatQuantity: async (symbol, qty) => qty.toFixed(8)
});
```

**Sources:**
- [src/function/add.ts]() (addStrategy, addExchange, addFrame)
- [src/lib/services/schema/]() (registry services)
- [src/lib/services/connection/]() (memoized factories)
- [src/interfaces/Strategy.interface.ts:96-106]() (IStrategySchema)
- [src/interfaces/Exchange.interface.ts]() (IExchangeSchema)
- [src/interfaces/Frame.interface.ts:75-86]() (IFrameSchema)

---

## Feature Summary Table

| Feature | Key Components | Primary Benefit |
|---------|----------------|-----------------|
| **Multi-Mode Execution** | `BacktestLogicPrivateService`, `LiveLogicPrivateService` | Single codebase for research and production |
| **Crash-Safe Persistence** | `PersistSignalAdapter`, `FilePersist` | Zero data loss in production crashes |
| **Signal Validation** | `VALIDATE_SIGNAL_FN`, `GET_SIGNAL_FN` | Prevents invalid trades at source |
| **Async Generators** | `execute()` generator methods | Constant memory usage, early termination |
| **Signal Lifecycle** | `IStrategyTickResult` discriminated union | Type-safe state handling |
| **Accurate PNL** | `toProfitLossDto()` | Realistic performance metrics |
| **Interval Throttling** | `_lastSignalTimestamp` check | Controlled signal frequency |
| **VWAP Pricing** | `GET_AVG_PRICE_FN`, `getAveragePrice()` | Better price discovery |
| **Markdown Reports** | `BacktestMarkdownService`, `LiveMarkdownService` | Performance analysis and auditing |
| **Plugin Architecture** | Schema services, connection services | Easy integration with custom data sources |
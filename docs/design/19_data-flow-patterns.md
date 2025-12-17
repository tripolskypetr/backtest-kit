# Data Flow Patterns

## Purpose and Scope

This page documents the end-to-end data flow patterns in Backtest Kit, tracing how data moves from user configuration through validation, execution, signal processing, and finally to reporting. It maps the transformation of data structures at each stage and identifies the specific services, classes, and methods that handle each transformation.

For information about the service layer architecture and dependency injection patterns, see [Service Layer & Dependency Injection](./14_architecture-deep-dive.md). For details on client implementations, see [Client Layer](./14_architecture-deep-dive.md). For the event-driven architecture, see [Event System Architecture](./14_architecture-deep-dive.md). For execution mode specifics, see [Execution Modes](./20_execution-modes.md).

This page focuses on **how data flows** rather than **what components do**. It serves as a reference for understanding the complete journey of trading signals from conception to completion.

---

## Configuration Phase: User Input to Schema Storage

The data flow begins when users call registration functions to define their trading strategies, exchanges, and risk parameters. This phase transforms user-provided JavaScript objects into validated, immutable schema entries stored in registry services.

### Configuration Registration Flow

```mermaid
graph LR
    User["User Code"] -->|"addStrategy()"| StratGlobal["StrategyGlobalService"]
    User -->|"addExchange()"| ExchGlobal["ExchangeGlobalService"]
    User -->|"addFrame()"| FrameGlobal["FrameGlobalService"]
    User -->|"addRisk()"| RiskGlobal["RiskGlobalService"]
    User -->|"addWalker()"| WalkGlobal["WalkerGlobalService"]
    
    StratGlobal -->|"IStrategySchema"| StratVal["StrategyValidationService<br/>shallow validation"]
    ExchGlobal -->|"IExchangeSchema"| ExchVal["ExchangeValidationService<br/>shallow validation"]
    FrameGlobal -->|"IFrameSchema"| FrameVal["FrameValidationService<br/>shallow validation"]
    RiskGlobal -->|"IRiskSchema"| RiskVal["RiskValidationService<br/>shallow validation"]
    WalkGlobal -->|"IWalkerSchema"| WalkVal["WalkerValidationService<br/>shallow validation"]
    
    StratVal -->|"store in ToolRegistry"| StratSchema["StrategySchemaService"]
    ExchVal -->|"store in ToolRegistry"| ExchSchema["ExchangeSchemaService"]
    FrameVal -->|"store in ToolRegistry"| FrameSchema["FrameSchemaService"]
    RiskVal -->|"store in ToolRegistry"| RiskSchema["RiskSchemaService"]
    WalkVal -->|"store in ToolRegistry"| WalkSchema["WalkerSchemaService"]
```

**Sources:** [src/lib/services/global/StrategyGlobalService.ts](), [src/lib/services/schema/StrategySchemaService.ts](), [src/lib/services/validation/StrategyValidationService.ts]()

### Data Transformation: User Objects to Schema Entries

| Input Type | Validation Layer | Storage Format | Registry Key |
|------------|------------------|----------------|--------------|
| `IStrategySchema` | `StrategyValidationService` checks for duplicate names | Stored in `ToolRegistry<IStrategySchema>` | `strategyName: string` |
| `IExchangeSchema` | `ExchangeValidationService` checks for duplicate names | Stored in `ToolRegistry<IExchangeSchema>` | `exchangeName: string` |
| `IFrameSchema` | `FrameValidationService` checks for duplicate names | Stored in `ToolRegistry<IFrameSchema>` | `frameName: string` |
| `IRiskSchema` | `RiskValidationService` checks for duplicate names | Stored in `ToolRegistry<IRiskSchema>` | `riskName: string` |
| `IWalkerSchema` | `WalkerValidationService` validates strategy list | Stored in `ToolRegistry<IWalkerSchema>` | `walkerName: string` |

**Sources:** [src/interfaces/Strategy.interface.ts:132-151](), [src/interfaces/Exchange.interface.ts](), [src/interfaces/Frame.interface.ts](), [src/interfaces/Risk.interface.ts](), [src/interfaces/Walker.interface.ts]()

---

## Execution Initiation: API Call to Context Setup

When users invoke `Backtest.run()`, `Live.run()`, or `Walker.run()`, the framework validates all schema references, establishes execution contexts, and routes operations to the appropriate services. This phase prepares the runtime environment before any signal processing begins.

### Execution Startup Flow (Backtest Mode)

```mermaid
graph TB
    UserCall["Backtest.run(symbol, context)"] --> BtCmd["BacktestCommandService.run()"]
    
    BtCmd --> Validate{{"Validate schema names<br/>exist in registries"}}
    
    Validate -->|"strategyName"| StratVal["StrategyValidationService.validate()"]
    Validate -->|"exchangeName"| ExchVal["ExchangeValidationService.validate()"]
    Validate -->|"frameName"| FrameVal["FrameValidationService.validate()"]
    
    StratVal --> MethodCtx["MethodContextService.runInContext()<br/>strategyName, exchangeName, frameName"]
    ExchVal --> MethodCtx
    FrameVal --> MethodCtx
    
    MethodCtx --> BtLogicPub["BacktestLogicPublicService.run()"]
    BtLogicPub --> BtLogicPriv["BacktestLogicPrivateService.run()"]
    
    BtLogicPriv --> FrameCore["FrameCoreService.getTimeframe()"]
    FrameCore -->|"Date[]"| TimeframeLoop["Iterate timeframes"]
    
    TimeframeLoop --> ExecCtx["ExecutionContextService.runInContext()<br/>symbol, when, backtest=true"]
    
    ExecCtx --> StratCore["StrategyCoreService.tick()"]
```

**Sources:** [src/lib/services/command/BacktestCommandService.ts](), [src/lib/services/logic/public/BacktestLogicPublicService.ts](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts:62-78](), [src/lib/services/context/MethodContextService.ts](), [src/lib/services/context/ExecutionContextService.ts]()

### Context Propagation Pattern

The framework uses ambient context services (`MethodContextService` and `ExecutionContextService`) to propagate configuration without explicit parameter passing. This pattern uses the `di-scoped` library to maintain context throughout the call stack.

```mermaid
graph LR
    MethodContext["MethodContextService<br/>{strategyName, exchangeName, frameName}"] -->|"ambient context"| Services["All Services"]
    ExecContext["ExecutionContextService<br/>{symbol, when, backtest}"] -->|"ambient context"| Services
    
    Services --> StratCore["StrategyCoreService<br/>reads contexts"]
    Services --> StratConn["StrategyConnectionService<br/>reads contexts"]
    Services --> ExchCore["ExchangeCoreService<br/>reads contexts"]
```

**Sources:** [src/lib/services/context/MethodContextService.ts](), [src/lib/services/context/ExecutionContextService.ts](), [src/lib/services/core/StrategyCoreService.ts]()

---

## Signal Generation: Tick to Signal Creation

During execution, the framework calls `ClientStrategy.tick()` on each timeframe to generate trading signals. This process involves throttling checks, user function invocation, multi-stage validation, risk checks, and persistence decisions.

### Signal Generation Data Flow

```mermaid
graph TB
    TickCall["StrategyCoreService.tick(symbol, when, backtest)"] --> ConnRoute["StrategyConnectionService.tick()"]
    
    ConnRoute --> GetStrat["getStrategy(symbol, strategyName)<br/>memoized ClientStrategy instance"]
    
    GetStrat --> WaitInit["ClientStrategy.waitForInit()<br/>restore persisted signal"]
    
    WaitInit --> TickMethod["ClientStrategy.tick(symbol, strategyName)"]
    
    TickMethod --> Throttle{{"Check interval throttling<br/>INTERVAL_MINUTES[interval]"}}
    
    Throttle -->|"not throttled"| GetAvgPrice["exchange.getAveragePrice()<br/>VWAP from last 5 candles"]
    
    GetAvgPrice --> UserFunc["user getSignal(symbol, when)<br/>returns ISignalDto | null"]
    
    UserFunc -->|"ISignalDto"| ValidateSignal["VALIDATE_SIGNAL_FN<br/>7-stage validation"]
    
    ValidateSignal --> RiskCheck["risk.checkSignal()<br/>portfolio limits, custom rules"]
    
    RiskCheck -->|"pass"| PriceCheck{{"priceOpen specified?"}}
    
    PriceCheck -->|"no"| ImmediateSignal["Create ISignalRow<br/>priceOpen = currentPrice<br/>_isScheduled = false"]
    
    PriceCheck -->|"yes"| ActivationCheck{{"priceOpen reached?"}}
    
    ActivationCheck -->|"yes"| ImmediateSignal
    ActivationCheck -->|"no"| ScheduledSignal["Create IScheduledSignalRow<br/>_isScheduled = true"]
    
    ImmediateSignal --> Persist["PersistSignalAdapter.writeSignalData()"]
    ScheduledSignal --> PersistSched["PersistScheduleAdapter.writeScheduleData()"]
    
    Persist --> RiskAdd["risk.addSignal()"]
    PersistSched --> ReturnSched["Return IStrategyTickResultScheduled"]
    
    RiskAdd --> ReturnOpened["Return IStrategyTickResultOpened"]
    
    Throttle -->|"throttled"| ReturnNull["Return null<br/>no signal generation"]
    UserFunc -->|"null"| ReturnNull
    RiskCheck -->|"fail"| ReturnNull
```

**Sources:** [src/client/ClientStrategy.ts:332-476](), [src/lib/services/connection/StrategyConnectionService.ts:207-228](), [src/lib/services/core/StrategyCoreService.ts]()

### Signal Validation Pipeline

The `VALIDATE_SIGNAL_FN` performs comprehensive validation before any signal activates:

| Validation Stage | Check | GLOBAL_CONFIG Parameter | Failure Reason |
|-----------------|-------|-------------------------|----------------|
| 1. Schema Fields | Required fields present (`id`, `symbol`, `position`, etc.) | N/A | Missing required data |
| 2. Finite Prices | All prices are finite numbers > 0 | N/A | NaN or Infinity detected |
| 3. TP/SL Logic | Long: `TP > open > SL`<br/>Short: `SL > open > TP` | N/A | Invalid price relationships |
| 4. TP Distance | TP far enough to cover fees | `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | Profit too small (< 0.2%) |
| 5. SL Min Distance | SL not too close (instant stop) | `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | Stop too tight |
| 6. SL Max Distance | SL not too far (risk limit) | `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | Risk too high |
| 7. Signal Lifetime | Duration within limits | `CC_MAX_SIGNAL_LIFETIME_MINUTES` | Signal too long (blocks risk) |

**Sources:** [src/client/ClientStrategy.ts:45-330](), [src/config/params.ts]()

---

## Signal Processing: Active Monitoring to Closure

Once a signal opens, the framework monitors it on every tick, checking for take profit, stop loss, or time expiration conditions. For backtest mode, the `backtest()` method processes multiple candles efficiently.

### Live Mode Monitoring Flow

```mermaid
graph TB
    LiveLoop["LiveLogicPrivateService.run()<br/>while(true) loop"] --> CreateWhen["when = new Date()<br/>real-time timestamp"]
    
    CreateWhen --> TickCall["StrategyCoreService.tick()"]
    
    TickCall --> GetPending["getPendingSignal()<br/>retrieve active signal"]
    
    GetPending -->|"null"| CallGetSignal["Call GET_SIGNAL_FN<br/>check for new signal"]
    GetPending -->|"ISignalRow"| MonitorActive["Monitor active signal"]
    
    MonitorActive --> GetVWAP["exchange.getAveragePrice()<br/>current VWAP"]
    
    GetVWAP --> CheckTP{{"Long: currentPrice >= TP?<br/>Short: currentPrice <= TP?"}}
    CheckTP -->|"yes"| CloseTp["CLOSE_PENDING_SIGNAL_FN<br/>closeReason='take_profit'"]
    
    CheckTP -->|"no"| CheckSL{{"Long: currentPrice <= SL?<br/>Short: currentPrice >= SL?"}}
    CheckSL -->|"yes"| CloseSL["CLOSE_PENDING_SIGNAL_FN<br/>closeReason='stop_loss'"]
    
    CheckSL -->|"no"| CheckTime{{"elapsedTime >= minuteEstimatedTime?"}}
    CheckTime -->|"yes"| CloseTime["CLOSE_PENDING_SIGNAL_FN<br/>closeReason='time_expired'"]
    
    CheckTime -->|"no"| PartialCheck["Check partial profit/loss<br/>emit partial events"]
    
    CloseTp --> CleanUp["Delete persisted signal<br/>risk.removeSignal()<br/>partial.clear()"]
    CloseSL --> CleanUp
    CloseTime --> CleanUp
    
    CleanUp --> CalcPNL["toProfitLossDto()<br/>apply fees & slippage"]
    
    CalcPNL --> EmitClosed["Return IStrategyTickResultClosed"]
    
    PartialCheck --> EmitActive["Return IStrategyTickResultActive"]
    
    CallGetSignal --> EmitIdle["Return IStrategyTickResultIdle"]
    
    EmitClosed --> Sleep["sleep(TICK_TTL)<br/>1 minute + 1ms"]
    EmitActive --> Sleep
    EmitIdle --> Sleep
    
    Sleep --> LiveLoop
```

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:63-175](), [src/client/ClientStrategy.ts:901-1023](), [src/helpers/toProfitLossDto.ts]()

### Backtest Mode Fast Processing Flow

```mermaid
graph TB
    OpenedResult["IStrategyTickResultOpened<br/>signal just created"] --> GetCandles["ExchangeCoreService.getNextCandles()<br/>fetch minuteEstimatedTime + buffer"]
    
    GetCandles -->|"ICandleData[]"| CallBacktest["StrategyConnectionService.backtest()"]
    
    CallBacktest --> ClientBacktest["ClientStrategy.backtest(symbol, strategyName, candles)"]
    
    ClientBacktest --> ScheduledCheck{{"_scheduledSignal exists?"}}
    
    ScheduledCheck -->|"yes"| MonitorScheduled["Monitor scheduled signal activation"]
    ScheduledCheck -->|"no"| MonitorPending["Monitor pending signal"]
    
    MonitorScheduled --> CandleLoop1["For each candle:<br/>check if SL hit before activation"]
    CandleLoop1 -->|"SL hit"| CancelScheduled["Return IStrategyTickResultCancelled"]
    CandleLoop1 -->|"priceOpen reached"| ActivateSignal["Convert to ISignalRow<br/>update pendingAt"]
    
    ActivateSignal --> MonitorPending
    
    MonitorPending --> CandleLoop2["For each candle:<br/>calc VWAP, check TP/SL/time"]
    
    CandleLoop2 -->|"TP/SL/time hit"| ReturnClosed["Return IStrategyTickResultClosed"]
    
    CandleLoop2 -->|"all candles exhausted"| TimeExpired["Force close at last candle<br/>closeReason='time_expired'"]
    
    TimeExpired --> ReturnClosed
```

**Sources:** [src/client/ClientStrategy.ts:1190-1484](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts:304-431]()

---

## Event Propagation: Signal Results to Event Consumers

After each tick or signal closure, the framework emits events through RxJS Subject-based emitters. Multiple markdown services subscribe to these events to accumulate data for report generation.

### Event Flow Architecture

```mermaid
graph LR
    ClientStrat["ClientStrategy.tick()<br/>or ClientStrategy.backtest()"] --> ConnService["StrategyConnectionService<br/>after operation completes"]
    
    ConnService --> EmitCheck{{"Check execution mode"}}
    
    EmitCheck -->|"backtest=true"| EmitBT["signalBacktestEmitter.next(result)"]
    EmitCheck -->|"backtest=false"| EmitLive["signalLiveEmitter.next(result)"]
    
    EmitBT --> EmitGlobal["signalEmitter.next(result)"]
    EmitLive --> EmitGlobal
    
    EmitGlobal --> Subscribers["Event Subscribers"]
    
    Subscribers --> BTMd["BacktestMarkdownService<br/>filters action='closed'"]
    Subscribers --> LiveMd["LiveMarkdownService<br/>all actions"]
    Subscribers --> SchedMd["ScheduleMarkdownService<br/>filters scheduled/cancelled"]
    Subscribers --> HeatMd["HeatMarkdownService<br/>cross-symbol aggregation"]
    Subscribers --> UserListeners["User listenSignal* callbacks"]
    
    BTMd --> Storage["ReportStorage<br/>bounded queue (250 events)"]
    LiveMd --> Storage
    SchedMd --> Storage
    HeatMd --> Storage
```

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:217-227](), [src/config/emitters.ts](), [src/lib/services/markdown/BacktestMarkdownService.ts](), [src/lib/services/markdown/LiveMarkdownService.ts]()

### Event Filtering and Storage Pattern

Each markdown service subscribes to specific events and maintains a bounded event queue:

| Markdown Service | Event Filter | Queue Bound | Storage Key |
|------------------|--------------|-------------|-------------|
| `BacktestMarkdownService` | `action === "closed"` | 250 events | `${symbol}:${strategyName}` |
| `LiveMarkdownService` | All actions (idle, opened, active, closed) | 250 events | `${symbol}:${strategyName}` |
| `ScheduleMarkdownService` | `action === "scheduled" \|\| "cancelled"` | 250 events | `${symbol}:${strategyName}` |
| `HeatMarkdownService` | `action === "closed"` | No bound (portfolio-wide) | `portfolio` |
| `PartialMarkdownService` | Partial profit/loss events | 250 events | `${symbol}:${strategyName}` |
| `RiskMarkdownService` | Risk rejection events | 250 events | `${symbol}:${strategyName}` |

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts](), [src/lib/services/markdown/LiveMarkdownService.ts](), [src/classes/ReportStorage.ts]()

---

## Report Generation: Accumulated Events to Statistics

The final stage transforms accumulated event data into statistical models and formatted markdown reports. This process calculates metrics like Sharpe ratio, win rate, and PNL using safe math functions.

### Statistics Calculation Flow

```mermaid
graph TB
    UserCall["Backtest.getData(symbol, strategyName)"] --> MarkdownService["BacktestMarkdownService.getData()"]
    
    MarkdownService --> GetEvents["ReportStorage.get(key)<br/>retrieve bounded event list"]
    
    GetEvents -->|"IStrategyTickResultClosed[]"| FilterClosed["Filter closed signals only"]
    
    FilterClosed --> CalcBasic["Calculate basic counts<br/>totalSignals, winCount, lossCount"]
    
    CalcBasic --> CalcWinRate["winRate = winCount / totalSignals * 100<br/>with safeDiv()"]
    
    CalcWinRate --> CalcPNL["totalPnl = sum(pnl.pnlPercentage)<br/>avgPnl = totalPnl / totalSignals"]
    
    CalcPNL --> CalcStdDev["stdDev = sqrt(variance)<br/>using safeDiv() for division"]
    
    CalcStdDev --> CalcSharpe["sharpeRatio = avgPnl / stdDev<br/>annualizedSharpeRatio = sharpeRatio * sqrt(365)"]
    
    CalcSharpe --> CalcCertainty["certaintyRatio = avgWin / abs(avgLoss)<br/>with safeDiv()"]
    
    CalcCertainty --> CalcYearly["expectedYearlyReturns = avgPnl * tradesPerYear<br/>based on avg duration"]
    
    CalcYearly --> ReturnStats["Return BacktestStatisticsModel"]
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts](), [src/model/BacktestStatisticsModel.ts](), [src/helpers/safeDiv.ts]()

### Report Formatting and Dump

```mermaid
graph LR
    UserCall["Backtest.getReport(symbol, strategyName)"] --> GetData["BacktestMarkdownService.getData()<br/>BacktestStatisticsModel"]
    
    GetData --> FormatTable["Format markdown table<br/>columns from ColumnConfig"]
    
    FormatTable --> FormatStats["Format statistics section<br/>winRate, sharpeRatio, etc."]
    
    FormatStats --> ReturnMd["Return markdown string"]
    
    UserDump["Backtest.dump(symbol, strategyName)"] --> GetReport["BacktestMarkdownService.getReport()"]
    
    GetReport --> WritePath["./dump/backtest/<br/>write {symbol}_{strategyName}.md"]
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts](), [src/classes/BacktestCommandService.ts]()

---

## Cross-Cutting Data Flows

### Persistence and Recovery Flow

```mermaid
graph LR
    SetPending["ClientStrategy.setPendingSignal(signal)"] --> PersistWrite["PersistSignalAdapter.writeSignalData()<br/>atomic file write"]
    
    PersistWrite --> FileWrite["fs.writeFile(tmpPath)<br/>fs.rename(tmpPath, finalPath)"]
    
    LiveRestart["Live.run() after crash"] --> WaitInit["ClientStrategy.waitForInit()"]
    
    WaitInit --> PersistRead["PersistSignalAdapter.readSignalData()"]
    
    PersistRead --> FileRead["fs.readFile(finalPath)<br/>JSON.parse()"]
    
    FileRead --> Restore["Restore _pendingSignal<br/>call onActive callback"]
```

**Sources:** [src/client/ClientStrategy.ts:491-552](), [src/classes/Persist.ts]()

### Memoization and Caching Pattern

```mermaid
graph TB
    FirstCall["StrategyConnectionService.getStrategy<br/>first call for 'BTCUSDT:my-strategy'"] --> CreateClient["new ClientStrategy({...params})<br/>initialize instance"]
    
    CreateClient --> Cache["Store in memoize cache<br/>key = 'BTCUSDT:my-strategy'"]
    
    SecondCall["StrategyConnectionService.getStrategy<br/>subsequent call 'BTCUSDT:my-strategy'"] --> CheckCache{{"Cache hit?"}}
    
    CheckCache -->|"yes"| ReturnCached["Return cached ClientStrategy<br/>same instance"]
    
    CheckCache -->|"no"| CreateClient
```

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:120-151]()

---

## Complete End-to-End Flow Summary

```mermaid
graph TB
    subgraph "1. Configuration"
        A1["addStrategy()"] --> A2["StrategySchemaService<br/>ToolRegistry storage"]
    end
    
    subgraph "2. Execution Initiation"
        B1["Backtest.run()"] --> B2["Validate schemas"]
        B2 --> B3["MethodContextService.runInContext()"]
        B3 --> B4["BacktestLogicPrivateService.run()"]
    end
    
    subgraph "3. Signal Generation"
        C1["FrameCoreService.getTimeframe()"] --> C2["For each timeframe"]
        C2 --> C3["ExecutionContextService.runInContext()"]
        C3 --> C4["StrategyConnectionService.tick()"]
        C4 --> C5["ClientStrategy.tick()"]
        C5 --> C6["User getSignal()"]
        C6 --> C7["VALIDATE_SIGNAL_FN"]
        C7 --> C8["risk.checkSignal()"]
    end
    
    subgraph "4. Signal Processing"
        D1["PersistSignalAdapter.writeSignalData()"] --> D2["ClientStrategy.backtest()"]
        D2 --> D3["Monitor TP/SL/time"]
        D3 --> D4["CLOSE_PENDING_SIGNAL_FN"]
        D4 --> D5["toProfitLossDto()"]
    end
    
    subgraph "5. Event Emission"
        E1["signalBacktestEmitter.next()"] --> E2["BacktestMarkdownService"]
        E1 --> E3["LiveMarkdownService"]
        E1 --> E4["User listeners"]
    end
    
    subgraph "6. Report Generation"
        F1["ReportStorage.get()"] --> F2["Calculate statistics"]
        F2 --> F3["Format markdown"]
        F3 --> F4["Backtest.dump()"]
    end
    
    A2 --> B1
    B4 --> C1
    C8 --> D1
    D5 --> E1
    E2 --> F1
    E3 --> F1
```

**Sources:** All service files in [src/lib/services/](), [src/client/ClientStrategy.ts](), [src/classes/]()
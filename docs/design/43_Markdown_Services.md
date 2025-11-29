# Markdown Services

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [README.md](README.md)
- [assets/uml.svg](assets/uml.svg)
- [docs/internals.md](docs/internals.md)
- [docs/uml.puml](docs/uml.puml)
- [scripts/_convert-md-mermaid-to-svg.cjs](scripts/_convert-md-mermaid-to-svg.cjs)
- [scripts/gpt-docs.mjs](scripts/gpt-docs.mjs)
- [scripts/uml.mjs](scripts/uml.mjs)
- [src/classes/Schedule.ts](src/classes/Schedule.ts)
- [src/lib/services/global/WalkerGlobalService.ts](src/lib/services/global/WalkerGlobalService.ts)
- [src/lib/services/markdown/BacktestMarkdownService.ts](src/lib/services/markdown/BacktestMarkdownService.ts)
- [src/lib/services/markdown/LiveMarkdownService.ts](src/lib/services/markdown/LiveMarkdownService.ts)
- [src/lib/services/markdown/ScheduleMarkdownService.ts](src/lib/services/markdown/ScheduleMarkdownService.ts)
- [test/spec/scheduled.test.mjs](test/spec/scheduled.test.mjs)

</details>



## Purpose and Scope

This document describes the Markdown Services subsystem, which provides automated report generation and performance analytics for backtesting and live trading operations. These services subscribe to execution events, accumulate statistical data, and generate markdown-formatted reports with comprehensive trading metrics.

For information about the event system that feeds these services, see [Event System](#3.4). For details on the execution modes that generate events, see [Execution Modes](#2.1).

---

## Service Architecture

The Markdown Services subsystem consists of three specialized service classes, each responsible for reporting on a specific execution mode:

```mermaid
graph TB
    subgraph "Event Sources"
        signalBacktestEmitter["signalBacktestEmitter"]
        signalLiveEmitter["signalLiveEmitter"]
        signalEmitter["signalEmitter"]
    end
    
    subgraph "Markdown Services Layer"
        BacktestMarkdownService["BacktestMarkdownService"]
        LiveMarkdownService["LiveMarkdownService"]
        ScheduleMarkdownService["ScheduleMarkdownService"]
    end
    
    subgraph "Public API Classes"
        BacktestClass["Backtest.getData/getReport/dump"]
        LiveClass["Live.getData/getReport/dump"]
        ScheduleClass["Schedule.getData/getReport/dump"]
    end
    
    subgraph "Storage Layer"
        BacktestStorage["ReportStorage<br/>(closed signals)"]
        LiveStorage["ReportStorage<br/>(all events)"]
        ScheduleStorage["ReportStorage<br/>(scheduled/cancelled)"]
    end
    
    signalBacktestEmitter --> BacktestMarkdownService
    signalLiveEmitter --> LiveMarkdownService
    signalEmitter --> ScheduleMarkdownService
    signalLiveEmitter --> ScheduleMarkdownService
    
    BacktestMarkdownService --> BacktestStorage
    LiveMarkdownService --> LiveStorage
    ScheduleMarkdownService --> ScheduleStorage
    
    BacktestClass --> BacktestMarkdownService
    LiveClass --> LiveMarkdownService
    ScheduleClass --> ScheduleMarkdownService
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:370-532](), [src/lib/services/markdown/LiveMarkdownService.ts:567-736](), [src/lib/services/markdown/ScheduleMarkdownService.ts:374-493]()

| Service | Event Source | Data Stored | Primary Purpose |
|---------|-------------|-------------|-----------------|
| `BacktestMarkdownService` | `signalBacktestEmitter` | Closed signals only | Historical backtest performance analysis |
| `LiveMarkdownService` | `signalLiveEmitter` | All events (idle, opened, active, closed) | Real-time trading activity monitoring |
| `ScheduleMarkdownService` | `signalEmitter`, `signalLiveEmitter` | Scheduled and cancelled signals | Limit order execution tracking |

**Sources:** [docs/internals.md:62]()

---

## Data Flow Architecture

The following diagram illustrates how trading events flow from execution contexts through emitters to markdown services, and finally to persistent reports:

```mermaid
graph LR
    subgraph "Execution Layer"
        BacktestRun["Backtest.run()"]
        LiveRun["Live.run()"]
    end
    
    subgraph "Event Emission"
        BacktestLogic["BacktestLogicPrivateService"]
        LiveLogic["LiveLogicPrivateService"]
        BacktestEmit["signalBacktestEmitter.next()"]
        LiveEmit["signalLiveEmitter.next()"]
        GlobalEmit["signalEmitter.next()"]
    end
    
    subgraph "Markdown Services"
        BacktestMD["BacktestMarkdownService.tick()"]
        LiveMD["LiveMarkdownService.tick()"]
        ScheduleMD["ScheduleMarkdownService.tick()"]
    end
    
    subgraph "Data Accumulation"
        BacktestStore["ReportStorage._signalList[]"]
        LiveStore["ReportStorage._eventList[]"]
        ScheduleStore["ReportStorage._eventList[]"]
    end
    
    subgraph "Report Generation"
        GetData["getData()<br/>(statistics)"]
        GetReport["getReport()<br/>(markdown)"]
        Dump["dump()<br/>(file write)"]
    end
    
    BacktestRun --> BacktestLogic
    LiveRun --> LiveLogic
    
    BacktestLogic --> BacktestEmit
    LiveLogic --> LiveEmit
    LiveLogic --> GlobalEmit
    
    BacktestEmit --> BacktestMD
    LiveEmit --> LiveMD
    LiveEmit --> ScheduleMD
    GlobalEmit --> ScheduleMD
    
    BacktestMD --> BacktestStore
    LiveMD --> LiveStore
    ScheduleMD --> ScheduleStore
    
    BacktestStore --> GetData
    LiveStore --> GetData
    ScheduleStore --> GetData
    
    GetData --> GetReport
    GetReport --> Dump
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:402-413](), [src/lib/services/markdown/LiveMarkdownService.ts:601-617](), [src/lib/services/markdown/ScheduleMarkdownService.ts:401-413]()

---

## BacktestMarkdownService

### Purpose

`BacktestMarkdownService` generates performance reports for historical backtesting by accumulating closed signals and calculating trading statistics. It only processes `closed` action events, ignoring intermediate states.

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:343-370]()

### Event Subscription

The service subscribes to `signalBacktestEmitter` during initialization using the `singleshot` pattern to ensure one-time setup:

```mermaid
sequenceDiagram
    participant Init as BacktestMarkdownService.init()
    participant Emitter as signalBacktestEmitter
    participant Tick as tick() method
    participant Storage as ReportStorage
    
    Init->>Emitter: subscribe(tick)
    Note over Init: singleshot ensures<br/>this runs once
    
    loop Backtest Execution
        Emitter->>Tick: IStrategyTickResult
        alt action === "closed"
            Tick->>Storage: addSignal(data)
        else action !== "closed"
            Tick-->>Tick: ignore
        end
    end
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:526-529](), [src/lib/services/markdown/BacktestMarkdownService.ts:402-413]()

### Internal Storage Structure

Each strategy gets an isolated `ReportStorage` instance via memoization:

```mermaid
graph TB
    getStorage["getStorage = memoize()"]
    
    subgraph "Memoization Key"
        strategyName["strategyName (string)"]
    end
    
    subgraph "ReportStorage Instance"
        signalList["_signalList: IStrategyTickResultClosed[]"]
        addSignal["addSignal(data)"]
        getData["getData(): BacktestStatistics"]
        getReport["getReport(): string"]
        dump["dump(): void"]
    end
    
    strategyName --> getStorage
    getStorage --> signalList
    signalList --> addSignal
    signalList --> getData
    getData --> getReport
    getReport --> dump
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:378-381](), [src/lib/services/markdown/BacktestMarkdownService.ts:179-194]()

### Statistics Interface

```typescript
interface BacktestStatistics {
  signalList: IStrategyTickResultClosed[];
  totalSignals: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;          // 0-100%, null if unsafe
  avgPnl: number | null;            // Average PNL %
  totalPnl: number | null;          // Cumulative PNL %
  stdDev: number | null;            // Volatility
  sharpeRatio: number | null;       // avgPnl / stdDev
  annualizedSharpeRatio: number | null;  // sharpeRatio × √365
  certaintyRatio: number | null;    // avgWin / |avgLoss|
  expectedYearlyReturns: number | null;  // Projected annual return
}
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:46-102]()

### Safe Math Pattern

All numeric metrics use the `isUnsafe()` function to guard against `NaN`, `Infinity`, and invalid calculations:

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:33-44](), [src/lib/services/markdown/BacktestMarkdownService.ts:261-268]()

---

## LiveMarkdownService

### Purpose

`LiveMarkdownService` tracks real-time trading activity by accumulating all tick events (idle, opened, active, closed) and provides comprehensive live trading analytics.

**Sources:** [src/lib/services/markdown/LiveMarkdownService.ts:538-566]()

### Event Types Tracked

| Event Type | Stored As | Update Strategy |
|-----------|-----------|-----------------|
| `idle` | `TickEvent` | Replaces last idle if no open/active signals follow |
| `opened` | `TickEvent` | Appends to event list |
| `active` | `TickEvent` | Replaces existing event with same `signalId` |
| `closed` | `TickEvent` | Replaces existing event with same `signalId` |

**Sources:** [src/lib/services/markdown/LiveMarkdownService.ts:38-66](), [src/lib/services/markdown/LiveMarkdownService.ts:239-373]()

### Event Accumulation Logic

```mermaid
graph TB
    tickEvent["tick(data: IStrategyTickResult)"]
    
    actionCheck{action type?}
    
    idleHandler["addIdleEvent(currentPrice)"]
    openedHandler["addOpenedEvent(data)"]
    activeHandler["addActiveEvent(data)"]
    closedHandler["addClosedEvent(data)"]
    
    idleCheck{Last event is idle<br/>and no open/active<br/>after it?}
    replaceIdle["Replace last idle event"]
    appendIdle["Append new idle event"]
    
    findIndex["findIndex(signalId)"]
    replaceEvent["Replace at index"]
    appendEvent["Append to _eventList"]
    
    checkSize{length > MAX_EVENTS?}
    trimQueue["shift() first element"]
    
    tickEvent --> actionCheck
    
    actionCheck -->|idle| idleHandler
    actionCheck -->|opened| openedHandler
    actionCheck -->|active| activeHandler
    actionCheck -->|closed| closedHandler
    
    idleHandler --> idleCheck
    idleCheck -->|yes| replaceIdle
    idleCheck -->|no| appendIdle
    appendIdle --> checkSize
    
    openedHandler --> appendEvent
    appendEvent --> checkSize
    
    activeHandler --> findIndex
    closedHandler --> findIndex
    findIndex -->|found| replaceEvent
    findIndex -->|not found| appendEvent
    
    checkSize -->|yes| trimQueue
    checkSize -->|no| Done["Done"]
    trimQueue --> Done
```

**Sources:** [src/lib/services/markdown/LiveMarkdownService.ts:239-373](), [src/lib/services/markdown/LiveMarkdownService.ts:222-224]()

### MAX_EVENTS Limit

The service maintains a bounded queue of 250 events to prevent memory leaks in long-running live trading sessions:

**Sources:** [src/lib/services/markdown/LiveMarkdownService.ts:223]()

---

## ScheduleMarkdownService

### Purpose

`ScheduleMarkdownService` tracks scheduled limit orders and their lifecycle outcomes (activated vs. cancelled), providing cancellation rate analytics.

**Sources:** [src/lib/services/markdown/ScheduleMarkdownService.ts:354-373]()

### Event Subscription Strategy

Unlike the other services, `ScheduleMarkdownService` subscribes to both `signalLiveEmitter` and the global `signalEmitter` to capture scheduled signals from live trading:

**Sources:** [src/lib/services/markdown/ScheduleMarkdownService.ts:471-474](), [docs/internals.md:62]()

### Statistics Interface

```typescript
interface ScheduleStatistics {
  eventList: ScheduledEvent[];
  totalEvents: number;
  totalScheduled: number;
  totalCancelled: number;
  cancellationRate: number | null;  // 0-100%, null if no scheduled
  avgWaitTime: number | null;       // Minutes, null if no cancelled
}
```

**Sources:** [src/lib/services/markdown/ScheduleMarkdownService.ts:47-86]()

### Cancellation Rate Calculation

The cancellation rate metric indicates what percentage of scheduled limit orders were cancelled without execution:

```
cancellationRate = (totalCancelled / totalScheduled) × 100
```

**Sources:** [src/lib/services/markdown/ScheduleMarkdownService.ts:267-268]()

---

## ReportStorage Pattern

### Architecture

Each markdown service contains an internal `ReportStorage` class that implements the Controller-View pattern for data management:

```mermaid
graph TB
    subgraph "ReportStorage Responsibilities"
        DataModel["Data Model<br/>(_signalList / _eventList)"]
        Controller["Controller<br/>(getData: statistics calculation)"]
        View["View<br/>(getReport: markdown formatting)"]
        Persistence["Persistence<br/>(dump: file write)"]
    end
    
    DataModel --> Controller
    Controller --> View
    View --> Persistence
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:179-341](), [src/lib/services/markdown/LiveMarkdownService.ts:229-535]()

### Memoization Pattern

Services use `functools-kit` memoization to create one `ReportStorage` instance per strategy:

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:378-381](), [src/lib/services/markdown/LiveMarkdownService.ts:575-578](), [src/lib/services/markdown/ScheduleMarkdownService.ts:382-385]()

---

## Statistics Calculation Pipeline

### Calculation Flow

```mermaid
graph TB
    rawData["Raw Event Data<br/>(signalList or eventList)"]
    
    filter["Filter by Criteria<br/>(e.g., closed only)"]
    
    basicStats["Calculate Basic Stats<br/>- totalSignals<br/>- winCount<br/>- lossCount<br/>- avgPnl<br/>- totalPnl"]
    
    volatility["Calculate Volatility<br/>- variance<br/>- stdDev"]
    
    sharpe["Calculate Sharpe Ratio<br/>sharpeRatio = avgPnl / stdDev<br/>annualized = sharpe × √365"]
    
    certainty["Calculate Certainty Ratio<br/>certaintyRatio = avgWin / |avgLoss|"]
    
    projection["Calculate Yearly Returns<br/>tradesPerYear = 365 / avgDurationDays<br/>expectedYearlyReturns = avgPnl × tradesPerYear"]
    
    safetyCheck{All values<br/>finite and valid?}
    
    output["Return Statistics<br/>(null for unsafe values)"]
    
    rawData --> filter
    filter --> basicStats
    basicStats --> volatility
    volatility --> sharpe
    sharpe --> certainty
    certainty --> projection
    projection --> safetyCheck
    safetyCheck --> output
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:202-269](), [src/lib/services/markdown/LiveMarkdownService.ts:381-464]()

### Metric Definitions

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| Win Rate | `(winCount / totalSignals) × 100` | Percentage of profitable trades |
| Sharpe Ratio | `avgPnl / stdDev` | Risk-adjusted return (higher is better) |
| Annualized Sharpe | `sharpeRatio × √365` | Annual risk-adjusted return |
| Certainty Ratio | `avgWin / |avgLoss|` | Average win vs. average loss ratio |
| Expected Yearly Returns | `avgPnl × (365 / avgDurationDays)` | Projected annual profit % |

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:224-254](), [src/lib/services/markdown/LiveMarkdownService.ts:405-447]()

---

## Report Generation

### Markdown Table Structure

All services generate markdown reports with column-based tables for event data:

```mermaid
graph LR
    columns["Column[] definitions"]
    eventData["Event data array"]
    
    header["Generate header row<br/>(col.label)"]
    separator["Generate separator row<br/>('---')"]
    rows["Generate data rows<br/>(col.format(event))"]
    
    table["Assemble markdown table<br/>| col1 | col2 | ... |"]
    
    stats["Append statistics section<br/>**Total signals:** N<br/>**Win rate:** X%<br/>..."]
    
    fullReport["Complete markdown string"]
    
    columns --> header
    eventData --> rows
    
    header --> table
    separator --> table
    rows --> table
    
    table --> stats
    stats --> fullReport
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:104-177](), [src/lib/services/markdown/LiveMarkdownService.ts:145-220]()

### Column Configuration

Columns are defined as arrays of objects with `key`, `label`, and `format` properties:

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:104-177](), [src/lib/services/markdown/LiveMarkdownService.ts:145-220]()

### File Output

The `dump()` method writes reports to disk with the following structure:

```
./logs/
  backtest/
    {strategyName}.md
  live/
    {strategyName}.md
  schedule/
    {strategyName}.md
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:322-340](), [src/lib/services/markdown/LiveMarkdownService.ts:516-534](), [src/lib/services/markdown/ScheduleMarkdownService.ts:332-350]()

---

## Integration with Public API

### Class Delegation Pattern

Public API classes (`Backtest`, `Live`, `Schedule`) delegate to markdown services through the dependency injection container:

```mermaid
graph LR
    subgraph "Public API"
        BacktestClass["Backtest class"]
        LiveClass["Live class"]
        ScheduleClass["Schedule class"]
    end
    
    subgraph "DI Container"
        lib["backtest.backtestMarkdownService"]
        lib2["backtest.liveMarkdownService"]
        lib3["backtest.scheduleMarkdownService"]
    end
    
    subgraph "Markdown Services"
        BacktestMD["BacktestMarkdownService"]
        LiveMD["LiveMarkdownService"]
        ScheduleMD["ScheduleMarkdownService"]
    end
    
    BacktestClass --> lib
    LiveClass --> lib2
    ScheduleClass --> lib3
    
    lib --> BacktestMD
    lib2 --> LiveMD
    lib3 --> ScheduleMD
```

**Sources:** [src/classes/Backtest.ts:1-134](), [src/classes/Live.ts:1-134](), [src/classes/Schedule.ts:1-135]()

### Method Mapping

| Public Method | Service Method | Return Type |
|--------------|----------------|-------------|
| `Backtest.getData(strategyName)` | `backtestMarkdownService.getData(strategyName)` | `BacktestStatistics` |
| `Backtest.getReport(strategyName)` | `backtestMarkdownService.getReport(strategyName)` | `string` |
| `Backtest.dump(strategyName, path?)` | `backtestMarkdownService.dump(strategyName, path)` | `void` |
| `Live.getData(strategyName)` | `liveMarkdownService.getData(strategyName)` | `LiveStatistics` |
| `Live.getReport(strategyName)` | `liveMarkdownService.getReport(strategyName)` | `string` |
| `Live.dump(strategyName, path?)` | `liveMarkdownService.dump(strategyName, path)` | `void` |
| `Schedule.getData(strategyName)` | `scheduleMarkdownService.getData(strategyName)` | `ScheduleStatistics` |
| `Schedule.getReport(strategyName)` | `scheduleMarkdownService.getReport(strategyName)` | `string` |
| `Schedule.dump(strategyName, path?)` | `scheduleMarkdownService.dump(strategyName, path)` | `void` |

**Sources:** [src/classes/Backtest.ts:47-109](), [src/classes/Live.ts:47-109](), [src/classes/Schedule.ts:47-120]()

---

## Service Lifecycle

### Initialization Sequence

```mermaid
sequenceDiagram
    participant User as User Code
    participant API as Public API (Backtest/Live)
    participant Logic as LogicPrivateService
    participant Emitter as Event Emitter
    participant Service as MarkdownService
    participant Storage as ReportStorage
    
    User->>API: run() or background()
    API->>Logic: execute strategy
    
    Logic->>Emitter: emit signal event
    
    Note over Service: Lazy initialization<br/>via singleshot
    Emitter->>Service: tick(data)
    
    Service->>Service: init() [first call only]
    Service->>Emitter: subscribe(tick)
    
    Service->>Storage: getStorage(strategyName)
    Note over Storage: Memoized instance<br/>per strategy
    
    Storage->>Storage: addSignal/addEvent(data)
    
    loop Additional Events
        Logic->>Emitter: emit signal event
        Emitter->>Service: tick(data)
        Service->>Storage: add to storage
    end
    
    User->>API: getData() or dump()
    API->>Service: getData() or dump()
    Service->>Storage: getData() or dump()
    Storage-->>User: Statistics or File Written
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:526-529](), [src/lib/services/markdown/LiveMarkdownService.ts:730-733](), [src/lib/services/markdown/ScheduleMarkdownService.ts:465-474]()

---

## Clear Operation

All markdown services implement a `clear()` method to reset accumulated data:

```mermaid
graph TB
    clearCall["clear(strategyName?)"]
    
    hasStrategy{strategyName<br/>provided?}
    
    clearSpecific["getStorage.clear(strategyName)"]
    clearAll["getStorage.clear()"]
    
    clearMemoized["Clear memoization cache<br/>for specified key"]
    clearAllMemoized["Clear all memoization<br/>cache entries"]
    
    clearCall --> hasStrategy
    hasStrategy -->|yes| clearSpecific
    hasStrategy -->|no| clearAll
    
    clearSpecific --> clearMemoized
    clearAll --> clearAllMemoized
```

**Sources:** [src/lib/services/markdown/BacktestMarkdownService.ts:508-513](), [src/lib/services/markdown/LiveMarkdownService.ts:712-717](), [src/lib/services/markdown/ScheduleMarkdownService.ts:465-470]()
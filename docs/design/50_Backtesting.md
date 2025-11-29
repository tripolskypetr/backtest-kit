# Backtesting

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/classes/Backtest.ts](src/classes/Backtest.ts)
- [src/classes/Live.ts](src/classes/Live.ts)
- [src/classes/Walker.ts](src/classes/Walker.ts)
- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/lib/services/logic/private/BacktestLogicPrivateService.ts](src/lib/services/logic/private/BacktestLogicPrivateService.ts)
- [src/lib/services/logic/private/LiveLogicPrivateService.ts](src/lib/services/logic/private/LiveLogicPrivateService.ts)
- [src/lib/services/logic/public/BacktestLogicPublicService.ts](src/lib/services/logic/public/BacktestLogicPublicService.ts)
- [src/lib/services/logic/public/LiveLogicPublicService.ts](src/lib/services/logic/public/LiveLogicPublicService.ts)
- [test/e2e/timing.test.mjs](test/e2e/timing.test.mjs)

</details>



## Purpose and Scope

This document describes the backtesting functionality in the backtest-kit framework, which simulates trading strategies against historical market data. Backtesting executes a strategy across a predefined timeframe, generating signals and calculating their profit/loss (PnL) without executing real trades.

This page covers the high-level backtest orchestration, execution flow, and memory-efficient streaming architecture. For detailed API reference, see [Backtest API](#3.2). For signal state management, see [Signal Lifecycle](#6). For timeframe generation specifics, see [Timeframe Generation](#7.2). For fast-forward simulation mechanics, see [Fast-Forward Simulation](#7.3).

**Sources:** [src/classes/Backtest.ts:1-169](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts:1-123]()

---

## Overview

Backtesting in this framework operates as a **memory-efficient async generator** that streams closed signals without accumulating results in memory. The system iterates through historical timestamps, evaluates strategy signals at each point, and simulates their outcomes using future candle data.

### Key Characteristics

| Characteristic | Description |
|---------------|-------------|
| **Execution Mode** | Synchronous iteration through historical timestamps |
| **Memory Model** | Streaming generator (yields results incrementally) |
| **Data Source** | Historical OHLCV candles via `ClientExchange` |
| **Signal Processing** | Opens, simulates, and closes signals via `ClientStrategy` |
| **Time Progression** | Controlled by `ClientFrame` timeframe array |
| **Early Termination** | Consumer can break iteration at any time |

### Entry Points

```typescript
// Public API
import { Backtest } from "backtest-kit";

// Run backtest with async iteration
for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance-historical",
  frameName: "1d-2023"
})) {
  console.log(result.pnl.pnlPercentage);
}

// Get accumulated report
const report = await Backtest.getReport("my-strategy");
```

**Sources:** [src/classes/Backtest.ts:16-50](), [src/classes/Backtest.ts:104-121]()

---

## Architecture Components

The backtesting system follows the four-layer architecture with clear separation between orchestration, business logic, and cross-cutting concerns.

### Component Diagram

```mermaid
graph TB
    subgraph "Public API Layer"
        BacktestClass["BacktestUtils<br/>(Backtest.run, getReport, dump)"]
    end
    
    subgraph "Service Orchestration Layer"
        BacktestLogicPublic["BacktestLogicPublicService<br/>(Context wrapper)"]
        BacktestLogicPrivate["BacktestLogicPrivateService<br/>(Async generator orchestrator)"]
        MethodContext["MethodContextService<br/>(Context propagation)"]
    end
    
    subgraph "Global Service Layer"
        BacktestGlobal["BacktestGlobalService<br/>(Execution context injection)"]
        StrategyGlobal["StrategyGlobalService<br/>(tick, backtest methods)"]
        ExchangeGlobal["ExchangeGlobalService<br/>(getNextCandles)"]
        FrameGlobal["FrameGlobalService<br/>(getTimeframe)"]
    end
    
    subgraph "Business Logic Layer"
        ClientStrategy["ClientStrategy<br/>(Signal lifecycle, backtest simulation)"]
        ClientExchange["ClientExchange<br/>(Historical candle fetching)"]
        ClientFrame["ClientFrame<br/>(Timestamp array generation)"]
    end
    
    subgraph "Cross-Cutting Concerns"
        BacktestMarkdown["BacktestMarkdownService<br/>(Report accumulation)"]
        Logger["LoggerService<br/>(Execution logging)"]
        ExecutionContext["ExecutionContextService<br/>(Backtest mode flag)"]
    end
    
    BacktestClass --> BacktestGlobal
    BacktestGlobal --> BacktestLogicPublic
    BacktestLogicPublic --> MethodContext
    BacktestLogicPublic --> BacktestLogicPrivate
    
    BacktestLogicPrivate --> FrameGlobal
    BacktestLogicPrivate --> StrategyGlobal
    BacktestLogicPrivate --> ExchangeGlobal
    
    FrameGlobal --> ClientFrame
    StrategyGlobal --> ClientStrategy
    ExchangeGlobal --> ClientExchange
    
    ClientStrategy -.-> BacktestMarkdown
    BacktestLogicPrivate -.-> Logger
    StrategyGlobal -.-> ExecutionContext
```

### Component Responsibilities

| Component | File Path | Responsibility |
|-----------|-----------|----------------|
| `BacktestUtils` | [src/classes/Backtest.ts]() | Public API facade with logging |
| `BacktestLogicPublicService` | [src/lib/services/logic/public/BacktestLogicPublicService.ts]() | Context propagation wrapper |
| `BacktestLogicPrivateService` | [src/lib/services/logic/private/BacktestLogicPrivateService.ts]() | Async generator orchestration |
| `BacktestGlobalService` | Service aggregator | Routes to BacktestLogicPublicService |
| `StrategyGlobalService` | Global service layer | Calls `tick()` and `backtest()` on ClientStrategy |
| `ExchangeGlobalService` | Global service layer | Calls `getNextCandles()` on ClientExchange |
| `FrameGlobalService` | Global service layer | Calls `getTimeframe()` on ClientFrame |
| `ClientStrategy` | Business logic | Signal generation, validation, simulation |
| `ClientExchange` | Business logic | Historical candle retrieval |
| `ClientFrame` | Business logic | Timeframe timestamp array generation |

**Sources:** [src/classes/Backtest.ts:29-50](), [src/lib/services/logic/public/BacktestLogicPublicService.ts:31-67](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts:22-119]()

---

## Execution Flow

Backtesting follows a deterministic execution pattern that processes each timestamp sequentially, opening and simulating signals as they occur.

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant BacktestClass["Backtest"]
    participant LogicPublic["BacktestLogicPublicService"]
    participant MethodCtx["MethodContextService"]
    participant LogicPrivate["BacktestLogicPrivateService"]
    participant FrameGlobal["FrameGlobalService"]
    participant StrategyGlobal["StrategyGlobalService"]
    participant ExchangeGlobal["ExchangeGlobalService"]
    
    User->>BacktestClass: "run(symbol, context)"
    BacktestClass->>LogicPublic: "run(symbol, context)"
    LogicPublic->>MethodCtx: "runAsyncIterator(generator, context)"
    LogicPublic->>LogicPrivate: "run(symbol)"
    
    LogicPrivate->>FrameGlobal: "getTimeframe(symbol)"
    FrameGlobal-->>LogicPrivate: "[timestamp1, ..., timestampN]"
    
    loop "For each timestamp in timeframes"
        LogicPrivate->>StrategyGlobal: "tick(symbol, timestamp, backtest=true)"
        StrategyGlobal-->>LogicPrivate: "IStrategyTickResult"
        
        alt "result.action === 'opened'"
            LogicPrivate->>ExchangeGlobal: "getNextCandles(symbol, '1m', minuteEstimatedTime, when, true)"
            ExchangeGlobal-->>LogicPrivate: "ICandle[] (future candles)"
            
            LogicPrivate->>StrategyGlobal: "backtest(symbol, candles, when, true)"
            StrategyGlobal-->>LogicPrivate: "IStrategyTickResultClosed"
            
            LogicPrivate->>LogicPrivate: "Skip timestamps until closeTimestamp"
            LogicPrivate-->>User: "yield closed result"
        end
        
        LogicPrivate->>LogicPrivate: "i++"
    end
    
    LogicPrivate-->>User: "Generator completes"
```

### Execution Steps

1. **Context Initialization** - [src/lib/services/logic/public/BacktestLogicPublicService.ts:46-66]()
   - `BacktestLogicPublicService` wraps the generator with `MethodContextService`
   - Context contains `strategyName`, `exchangeName`, `frameName`
   - Context is implicitly propagated to all service calls

2. **Timeframe Retrieval** - [src/lib/services/logic/private/BacktestLogicPrivateService.ts:53]()
   - `FrameGlobalService.getTimeframe()` returns array of timestamps
   - Timestamps represent points in historical time to evaluate strategy

3. **Timestamp Iteration** - [src/lib/services/logic/private/BacktestLogicPrivateService.ts:57-118]()
   - Loop through each timestamp in sequential order
   - Index `i` tracks current position in timeframe array

4. **Signal Evaluation** - [src/lib/services/logic/private/BacktestLogicPrivateService.ts:60]()
   - Call `StrategyGlobalService.tick(symbol, when, backtest=true)`
   - Returns `IStrategyTickResult` with discriminated union type

5. **Signal Opening** - [src/lib/services/logic/private/BacktestLogicPrivateService.ts:63-79]()
   - When `result.action === "opened"`, signal requires simulation
   - Fetch future candles via `getNextCandles()` for simulation period
   - `signal.minuteEstimatedTime` determines how many future minutes to fetch

6. **Fast-Forward Simulation** - [src/lib/services/logic/private/BacktestLogicPrivateService.ts:92-97]()
   - Call `StrategyGlobalService.backtest()` with future candles
   - Simulates signal monitoring without iterating every timestamp
   - Always returns `IStrategyTickResultClosed` with PnL

7. **Timestamp Skipping** - [src/lib/services/logic/private/BacktestLogicPrivateService.ts:107-112]()
   - Skip timestamps until `backtestResult.closeTimestamp`
   - Prevents re-evaluating timestamps during active signal period
   - Advances index `i` to resume after signal closes

8. **Result Streaming** - [src/lib/services/logic/private/BacktestLogicPrivateService.ts:114]()
   - `yield backtestResult` streams closed result to consumer
   - Memory-efficient: no array accumulation
   - Consumer can break iteration early

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:48-119](), [src/lib/services/logic/public/BacktestLogicPublicService.ts:46-66]()

---

## Memory-Efficient Streaming

The backtest system uses async generators to achieve memory efficiency when processing millions of timestamps.

### Streaming vs Accumulation

```mermaid
graph LR
    subgraph "Memory-Efficient Streaming (Current Design)"
        Timeframes1["Timeframe Array<br/>(loaded once)"]
        Generator1["Async Generator<br/>(yields one at a time)"]
        Consumer1["Consumer<br/>(processes incrementally)"]
        Memory1["Memory Usage<br/>(O(1) for results)"]
        
        Timeframes1 --> Generator1
        Generator1 -.->|"yield"| Consumer1
        Consumer1 --> Memory1
    end
    
    subgraph "Array Accumulation (Alternative Design)"
        Timeframes2["Timeframe Array<br/>(loaded once)"]
        Accumulator["Result Accumulator<br/>(stores all results)"]
        Consumer2["Consumer<br/>(receives full array)"]
        Memory2["Memory Usage<br/>(O(N) for results)"]
        
        Timeframes2 --> Accumulator
        Accumulator --> Consumer2
        Consumer2 --> Memory2
    end
    
    style Memory1 fill:#90EE90
    style Memory2 fill:#FFB6C6
```

### Benefits of Streaming

| Benefit | Description |
|---------|-------------|
| **Constant Memory** | Results are not accumulated in memory |
| **Early Termination** | Consumer can break iteration at any point |
| **Progressive Processing** | Results available immediately as they're generated |
| **Large Timeframes** | Can process years of data without memory overflow |

### Early Termination Example

```typescript
// Consumer controls iteration lifetime
for await (const result of Backtest.run("BTCUSDT", context)) {
  console.log(result.pnl.pnlPercentage);
  
  // Early termination based on condition
  if (result.pnl.pnlPercentage < -10) {
    console.log("Stop loss threshold reached");
    break; // Generator is abandoned
  }
}
```

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:21-47](), [src/classes/Backtest.ts:10-28]()

---

## Context Propagation

Backtesting uses `MethodContextService` to implicitly pass configuration context through the call stack without explicit parameters.

### Context Flow Diagram

```mermaid
graph TB
    UserCode["User Code<br/>(specifies context)"]
    BacktestRun["Backtest.run<br/>(receives context)"]
    LogicPublic["BacktestLogicPublicService.run<br/>(wraps with MethodContextService)"]
    MethodCtx["MethodContextService.runAsyncIterator<br/>(di-scoped context)"]
    LogicPrivate["BacktestLogicPrivateService.run<br/>(no context param)"]
    
    subgraph "Implicit Context Access"
        StrategyGlobal["StrategyGlobalService<br/>(reads strategyName from context)"]
        ExchangeGlobal["ExchangeGlobalService<br/>(reads exchangeName from context)"]
        FrameGlobal["FrameGlobalService<br/>(reads frameName from context)"]
    end
    
    ConnectionServices["ConnectionServices<br/>(use context for routing)"]
    
    UserCode -->|"context object"| BacktestRun
    BacktestRun -->|"forwards context"| LogicPublic
    LogicPublic -->|"injects context"| MethodCtx
    MethodCtx -->|"scope boundary"| LogicPrivate
    
    LogicPrivate --> StrategyGlobal
    LogicPrivate --> ExchangeGlobal
    LogicPrivate --> FrameGlobal
    
    StrategyGlobal -.->|"implicit read"| MethodCtx
    ExchangeGlobal -.->|"implicit read"| MethodCtx
    FrameGlobal -.->|"implicit read"| MethodCtx
    
    StrategyGlobal --> ConnectionServices
    ExchangeGlobal --> ConnectionServices
    FrameGlobal --> ConnectionServices
```

### Context Structure

The context object passed to `Backtest.run()` contains three schema names:

```typescript
interface IMethodContext {
  strategyName: string;  // Which strategy to execute
  exchangeName: string;  // Which exchange to fetch data from
  frameName: string;     // Which timeframe to iterate through
}
```

### Context Propagation Mechanism

| Step | File | Description |
|------|------|-------------|
| 1. Context Specification | [src/classes/Backtest.ts:37-43]() | User provides context object |
| 2. Context Forwarding | [src/classes/Backtest.ts:49]() | `BacktestUtils.run()` forwards to `BacktestGlobalService` |
| 3. Context Injection | [src/lib/services/logic/public/BacktestLogicPublicService.ts:58-64]() | `BacktestLogicPublicService` wraps generator with `MethodContextService.runAsyncIterator()` |
| 4. Scope Boundary | [src/lib/services/context/MethodContextService.ts:41-45]() | `di-scoped` creates implicit context scope |
| 5. Implicit Retrieval | Service layer | Global/Connection services read context without explicit parameters |

**Sources:** [src/lib/services/logic/public/BacktestLogicPublicService.ts:46-66](), [src/lib/services/context/MethodContextService.ts:1-56](), [src/classes/Backtest.ts:37-50]()

---

## Report Generation

The framework passively accumulates closed signals for reporting via `BacktestMarkdownService`.

### Report Accumulation Flow

```mermaid
graph LR
    BacktestLogic["BacktestLogicPrivateService<br/>(yields closed signals)"]
    ClientStrategy["ClientStrategy<br/>(emits signal events)"]
    BacktestMarkdown["BacktestMarkdownService<br/>(accumulates results)"]
    ReportAPI["Backtest.getReport<br/>(generates markdown)"]
    User["User<br/>(retrieves report)"]
    
    BacktestLogic -.->|"yield"| ClientStrategy
    ClientStrategy -.->|"event emission"| BacktestMarkdown
    BacktestMarkdown -->|"stores in memory"| BacktestMarkdown
    
    User --> ReportAPI
    ReportAPI --> BacktestMarkdown
    BacktestMarkdown -->|"formats as markdown"| User
```

### Report Usage

```typescript
// Run backtest (results are accumulated automatically)
for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance-historical",
  frameName: "1d-2023"
})) {
  // Process results...
}

// Retrieve accumulated report
const markdown = await Backtest.getReport("my-strategy");
console.log(markdown);

// Save report to disk
await Backtest.dump("my-strategy", "./custom/path");
```

### Report Methods

| Method | File | Description |
|--------|------|-------------|
| `getReport(strategyName)` | [src/classes/Backtest.ts:116-121]() | Returns markdown string with all closed signals |
| `dump(strategyName, path?)` | [src/classes/Backtest.ts:138-147]() | Saves markdown report to filesystem |

For detailed report structure and metrics, see [Markdown Report Generation](#9.1) and [Performance Metrics](#9.2).

**Sources:** [src/classes/Backtest.ts:104-147]()

---

## Background Execution

The `background()` method consumes backtest results without exposing them to the caller, useful for running backtests purely for side effects.

### Background Pattern

```typescript
// Run backtest in background (no yielded results)
const cancel = await Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance-historical",
  frameName: "1d-2023"
});

// Results are not returned, but:
// - BacktestMarkdownService still accumulates
// - Event listeners still fire
// - Logging still occurs

// Optional: cancel early
cancel();
```

### Background Implementation

The `background()` method internally consumes the async generator without yielding values:

```typescript
public background = async (symbol: string, context: {...}) => {
  const iterator = this.run(symbol, context);
  let isStopped = false;
  
  const task = async () => {
    while (true) {
      const { done } = await iterator.next();
      if (done || isStopped) break;
    }
  }
  
  task();
  return () => { isStopped = true; }
}
```

**Sources:** [src/classes/Backtest.ts:73-102]()

---

## Integration with Signal Lifecycle

Backtesting integrates with the signal lifecycle state machine. For complete signal state details, see [Signal Lifecycle](#6).

### State Transitions in Backtest

```mermaid
stateDiagram-v2
    [*] --> Idle: "timestamp iteration"
    
    Idle --> Opened: "tick() returns 'opened'"
    
    state Opened {
        [*] --> FetchFutureCandles: "getNextCandles()"
        FetchFutureCandles --> InvokeBacktest: "candles retrieved"
        InvokeBacktest --> Simulate: "backtest(candles)"
    }
    
    Opened --> Closed: "backtest() always returns 'closed'"
    
    state Closed {
        [*] --> CalculatePnL: "closeReason determined"
        CalculatePnL --> ApplyFees: "slippage + fees"
        ApplyFees --> YieldResult: "IStrategyTickResultClosed"
    }
    
    Closed --> Idle: "skip timestamps, continue iteration"
    
    note right of Opened
        Fast-forward simulation
        No timestamp iteration
        during signal lifetime
    end note
```

### Signal Result Types

| Result Type | Yielded in Backtest? | Description |
|-------------|---------------------|-------------|
| `IStrategyTickResultIdle` | ❌ No | No signal exists |
| `IStrategyTickResultOpened` | ❌ No | Signal opened (internal state) |
| `IStrategyTickResultActive` | ❌ No | Signal monitoring (internal state) |
| `IStrategyTickResultClosed` | ✅ Yes | Signal closed with PnL |

Only closed signals are yielded in backtest mode because opening immediately triggers fast-forward simulation.

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:63-114]()

---

## Key Design Decisions

### Why Async Generators?

| Decision | Rationale |
|----------|-----------|
| Async generators over arrays | Constant memory usage, early termination support |
| Yield only closed signals | Opening triggers immediate simulation, no active state |
| Skip timestamps during signal | Avoid redundant tick evaluations |
| Stream results immediately | Progressive processing without blocking |

### Why Fast-Forward Simulation?

Instead of iterating every minute during a signal's lifetime, `backtest()` simulates the entire signal outcome in a single call using future candles. This provides:

- **Performance**: O(1) call vs O(N) timestamp iterations
- **Accuracy**: Uses actual historical OHLCV data for simulation
- **Simplicity**: Signal lifecycle managed in one method

For fast-forward simulation details, see [Fast-Forward Simulation](#7.3).

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:9-21]()

---

## Usage Examples

### Basic Backtest

```typescript
import { Backtest } from "backtest-kit";

for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "moving-average",
  exchangeName: "binance-historical",
  frameName: "daily-2023"
})) {
  console.log(`Closed at ${result.closeTimestamp}`);
  console.log(`PnL: ${result.pnl.pnlPercentage}%`);
  console.log(`Reason: ${result.closeReason}`);
}
```

### Conditional Termination

```typescript
let totalPnl = 0;

for await (const result of Backtest.run("ETHUSDT", context)) {
  totalPnl += result.pnl.pnlPercentage;
  
  // Stop if cumulative loss exceeds threshold
  if (totalPnl < -20) {
    console.log("Drawdown limit reached");
    break;
  }
}
```

### Report Generation

```typescript
// Run backtest (accumulates results)
for await (const result of Backtest.run("BTCUSDT", context)) {
  // Process results...
}

// Generate report
const report = await Backtest.getReport("moving-average");
console.log(report); // Markdown table with all signals

// Save to disk
await Backtest.dump("moving-average", "./reports");
// Writes to: ./reports/moving-average.md
```

**Sources:** [src/classes/Backtest.ts:16-28](), [src/classes/Backtest.ts:104-147]()
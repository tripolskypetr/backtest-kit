# Logic Services

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/index.ts](src/index.ts)
- [src/lib/services/context/MethodContextService.ts](src/lib/services/context/MethodContextService.ts)
- [src/lib/services/logic/private/BacktestLogicPrivateService.ts](src/lib/services/logic/private/BacktestLogicPrivateService.ts)
- [src/lib/services/logic/private/LiveLogicPrivateService.ts](src/lib/services/logic/private/LiveLogicPrivateService.ts)
- [src/lib/services/logic/public/BacktestLogicPublicService.ts](src/lib/services/logic/public/BacktestLogicPublicService.ts)
- [src/lib/services/logic/public/LiveLogicPublicService.ts](src/lib/services/logic/public/LiveLogicPublicService.ts)
- [types.d.ts](types.d.ts)

</details>



## Purpose and Scope

Logic Services orchestrate the execution of backtest and live trading operations using async generators. They coordinate between Strategy, Exchange, and Frame services while managing execution context propagation. Logic Services form the top layer of the Service Orchestration hierarchy and are the primary entry point for execution flows initiated by the Public API.

For configuration and registration of strategies, exchanges, and frames, see [Configuration Functions](#3.1). For the business logic implementations that Logic Services orchestrate, see [Core Business Logic](#4).

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:1-123](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:1-86](), [Diagram 1: Four-Layer Architecture Overview]()

---

## Architecture Overview

Logic Services follow a two-tier pattern with distinct responsibilities:

| Layer | Classes | Responsibility |
|-------|---------|----------------|
| **Public** | `BacktestLogicPublicService`, `LiveLogicPublicService` | Context propagation, method routing, public API exposure |
| **Private** | `BacktestLogicPrivateService`, `LiveLogicPrivateService` | Core orchestration logic, async generator implementation, service coordination |

### Service Hierarchy Diagram

![Mermaid Diagram](./diagrams\22_Logic_Services_0.svg)

**Sources:** [src/lib/services/logic/public/BacktestLogicPublicService.ts:1-70](), [src/lib/services/logic/public/LiveLogicPublicService.ts:1-78](), [Diagram 1: Four-Layer Architecture Overview]()

---

## Public-Private Separation Pattern

Logic Services use a two-tier pattern to separate context management from execution logic:

### Responsibilities

**Public Services:**
- Wrap private service generators with `MethodContextService.runAsyncIterator()`
- Inject `IMethodContext` containing `strategyName`, `exchangeName`, `frameName`
- Provide the public interface for dependency injection consumers
- Located in [src/lib/services/logic/public/]()

**Private Services:**
- Implement core orchestration logic using async generators
- Coordinate between Global Services
- Manage execution flow (iteration, timing, result streaming)
- Located in [src/lib/services/logic/private/]()

### Context Propagation Flow

![Mermaid Diagram](./diagrams\22_Logic_Services_1.svg)

**Sources:** [src/lib/services/logic/public/BacktestLogicPublicService.ts:46-66](), [src/lib/services/context/MethodContextService.ts:1-56](), [Diagram 4: Configuration and Registration System]()

---

## BacktestLogicPrivateService

Core orchestration service for backtest execution using memory-efficient async generators.

### Class Structure

| Property | Type | Purpose |
|----------|------|---------|
| `loggerService` | `LoggerService` | Logs orchestration events (tick results, signal state changes) |
| `strategyGlobalService` | `StrategyGlobalService` | Executes `tick()` and `backtest()` operations |
| `exchangeGlobalService` | `ExchangeGlobalService` | Fetches future candles for fast-forward simulation |
| `frameGlobalService` | `FrameGlobalService` | Retrieves timeframe array for iteration |

### Execution Flow

![Mermaid Diagram](./diagrams\22_Logic_Services_2.svg)

### Key Methods

**`run(symbol: string): AsyncGenerator<IStrategyTickResultClosed>`**

Iterates through historical timeframes, executing strategy ticks and fast-forwarding through opened signals.

- Fetches timeframe array from `FrameGlobalService` [src/lib/services/logic/private/BacktestLogicPrivateService.ts:53]()
- Loops through each timestamp in the timeframe [src/lib/services/logic/private/BacktestLogicPrivateService.ts:57-118]()
- Calls `tick()` for each timestamp to check for signal generation [src/lib/services/logic/private/BacktestLogicPrivateService.ts:60]()
- When `action === "opened"`: fetches future candles and calls `backtest()` [src/lib/services/logic/private/BacktestLogicPrivateService.ts:63-97]()
- Skips timeframes until `closeTimestamp` to avoid redundant processing [src/lib/services/logic/private/BacktestLogicPrivateService.ts:107-112]()
- Yields only closed results, never intermediate states [src/lib/services/logic/private/BacktestLogicPrivateService.ts:114]()

### Signal Processing Logic

When a signal opens during iteration:

1. **Candle Fetch**: Calls `getNextCandles(symbol, "1m", minuteEstimatedTime)` to retrieve future candles [src/lib/services/logic/private/BacktestLogicPrivateService.ts:73-79]()
2. **Fast-Forward**: Calls `backtest(candles)` to simulate signal lifecycle without iterating each timestamp [src/lib/services/logic/private/BacktestLogicPrivateService.ts:92-97]()
3. **Time Skip**: Advances loop index to skip past the signal's close timestamp [src/lib/services/logic/private/BacktestLogicPrivateService.ts:107-112]()
4. **Result Yield**: Emits `IStrategyTickResultClosed` with PnL calculation [src/lib/services/logic/private/BacktestLogicPrivateService.ts:114]()

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:1-123](), [Diagram 2: Backtest Execution Flow]()

---

## LiveLogicPrivateService

Core orchestration service for live trading execution with infinite async generation.

### Class Structure

| Property | Type | Purpose |
|----------|------|---------|
| `loggerService` | `LoggerService` | Logs tick results and signal state changes |
| `strategyGlobalService` | `StrategyGlobalService` | Executes `tick()` to monitor signals in real-time |

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `TICK_TTL` | `1 * 60 * 1_000 + 1` | 1 minute + 1ms sleep duration between ticks |

### Key Methods

**`run(symbol: string): AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed>`**

Infinite generator that monitors signal state every minute and yields opened/closed events.

- Runs infinite `while(true)` loop for continuous monitoring [src/lib/services/logic/private/LiveLogicPrivateService.ts:58]()
- Creates real-time date with `new Date()` on each iteration [src/lib/services/logic/private/LiveLogicPrivateService.ts:59]()
- Calls `tick(symbol, when, false)` to check signal status [src/lib/services/logic/private/LiveLogicPrivateService.ts:61]()
- Filters out `idle` and `active` states (does not yield) [src/lib/services/logic/private/LiveLogicPrivateService.ts:68-76]()
- Yields only `opened` and `closed` results [src/lib/services/logic/private/LiveLogicPrivateService.ts:78]()
- Sleeps for `TICK_TTL` (1 minute + 1ms) between iterations [src/lib/services/logic/private/LiveLogicPrivateService.ts:69-80]()

### State Filtering Strategy

Live trading filters intermediate states to reduce noise:

| State | Yielded | Reason |
|-------|---------|--------|
| `idle` | No | No active signal - nothing to report [src/lib/services/logic/private/LiveLogicPrivateService.ts:73-76]() |
| `opened` | **Yes** | New signal created - requires notification [src/lib/services/logic/private/LiveLogicPrivateService.ts:78]() |
| `active` | No | Signal monitoring in progress - no state change [src/lib/services/logic/private/LiveLogicPrivateService.ts:68-71]() |
| `closed` | **Yes** | Signal completed - PnL finalized [src/lib/services/logic/private/LiveLogicPrivateService.ts:78]() |

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:1-86](), [Diagram 3: Live Trading with Crash Recovery]()

---

## BacktestLogicPublicService

Public-facing wrapper for `BacktestLogicPrivateService` that manages context propagation.

### Class Structure

| Property | Type | Purpose |
|----------|------|---------|
| `loggerService` | `LoggerService` | Logs public service invocations |
| `backtestLogicPrivateService` | `BacktestLogicPrivateService` | Core orchestration logic |

### Key Methods

**`run(symbol: string, context: {strategyName, exchangeName, frameName}): AsyncGenerator`**

Wraps private service generator with method context injection.

```typescript
// Method signature from source
public run = (
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
    frameName: string;
  }
)
```

**Implementation Pattern:**
1. Logs invocation with context parameters [src/lib/services/logic/public/BacktestLogicPublicService.ts:54-57]()
2. Calls `MethodContextService.runAsyncIterator()` with generator and context [src/lib/services/logic/public/BacktestLogicPublicService.ts:58-65]()
3. Returns wrapped async generator that propagates context to all downstream services

### Context Object Structure

| Field | Type | Description |
|-------|------|-------------|
| `strategyName` | `string` | Identifies which strategy schema to use |
| `exchangeName` | `string` | Identifies which exchange schema to use |
| `frameName` | `string` | Identifies which frame schema to use for timeframe generation |

**Sources:** [src/lib/services/logic/public/BacktestLogicPublicService.ts:1-70](), [src/lib/services/context/MethodContextService.ts:12-19]()

---

## LiveLogicPublicService

Public-facing wrapper for `LiveLogicPrivateService` that manages context propagation.

### Class Structure

| Property | Type | Purpose |
|----------|------|---------|
| `loggerService` | `LoggerService` | Logs public service invocations |
| `liveLogicPrivateService` | `LiveLogicPrivateService` | Core orchestration logic |

### Key Methods

**`run(symbol: string, context: {strategyName, exchangeName}): AsyncGenerator`**

Wraps private service generator with method context injection.

```typescript
// Method signature from source
public run = (
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  }
)
```

**Implementation Pattern:**
1. Logs invocation with context parameters [src/lib/services/logic/public/LiveLogicPublicService.ts:62-65]()
2. Calls `MethodContextService.runAsyncIterator()` with generator and context [src/lib/services/logic/public/LiveLogicPublicService.ts:66-73]()
3. Returns wrapped async generator that propagates context to all downstream services

### Context Object Structure

| Field | Type | Description |
|-------|------|-------------|
| `strategyName` | `string` | Identifies which strategy schema to use |
| `exchangeName` | `string` | Identifies which exchange schema to use |
| `frameName` | `string` | Empty string for live mode (no frame needed) [src/lib/services/logic/public/LiveLogicPublicService.ts:71]() |

**Sources:** [src/lib/services/logic/public/LiveLogicPublicService.ts:1-78](), [src/lib/services/context/MethodContextService.ts:12-19]()

---

## Async Generator Pattern

Logic Services use async generators (`async function*`) for memory-efficient streaming execution.

### Generator Characteristics

| Aspect | Backtest | Live |
|--------|----------|------|
| **Completion** | Finite (completes when timeframe exhausted) | Infinite (never completes) |
| **Iteration** | Array of historical timestamps | Real-time `new Date()` every minute |
| **Yielded Types** | `IStrategyTickResultClosed` only | `IStrategyTickResultOpened \| IStrategyTickResultClosed` |
| **Memory Usage** | O(1) - streams results without accumulation | O(1) - no result accumulation |
| **Early Termination** | Supported via `break` in consumer | Supported via `break` in consumer |

### Memory Efficiency Diagram

![Mermaid Diagram](./diagrams\22_Logic_Services_4.svg)

### Consumer Pattern Examples

**Backtest with Early Termination:**
```typescript
// Example from documentation
for await (const result of backtestLogic.run("BTCUSDT")) {
  console.log(result.closeReason, result.pnl.pnlPercentage);
  if (result.pnl.pnlPercentage < -10) break; // Early termination
}
```

**Live with Infinite Loop:**
```typescript
// Example from documentation
for await (const result of liveLogic.run("BTCUSDT")) {
  if (result.action === "opened") {
    console.log("New signal:", result.signal.id);
  }
  if (result.action === "closed") {
    console.log("PNL:", result.pnl.pnlPercentage);
  }
  // Infinite loop - will never complete
}
```

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:48-119](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:53-82](), [Diagram 2: Backtest Execution Flow]()

---

## Service Dependencies

Logic Services coordinate multiple service types through dependency injection.

### Dependency Injection Registration

![Mermaid Diagram](./diagrams\22_Logic_Services_5.svg)

### Injected Dependencies by Service

**BacktestLogicPrivateService:**
- `LoggerService` - Event logging [src/lib/services/logic/private/BacktestLogicPrivateService.ts:23]()
- `StrategyGlobalService` - Signal tick and backtest execution [src/lib/services/logic/private/BacktestLogicPrivateService.ts:24-26]()
- `ExchangeGlobalService` - Future candle fetching [src/lib/services/logic/private/BacktestLogicPrivateService.ts:27-29]()
- `FrameGlobalService` - Timeframe array retrieval [src/lib/services/logic/private/BacktestLogicPrivateService.ts:30-32]()

**LiveLogicPrivateService:**
- `LoggerService` - Event logging [src/lib/services/logic/private/LiveLogicPrivateService.ts:26]()
- `StrategyGlobalService` - Signal tick execution [src/lib/services/logic/private/LiveLogicPrivateService.ts:27-29]()

**BacktestLogicPublicService:**
- `LoggerService` - Invocation logging [src/lib/services/logic/public/BacktestLogicPublicService.ts:32]()
- `BacktestLogicPrivateService` - Orchestration delegation [src/lib/services/logic/public/BacktestLogicPublicService.ts:33-34]()

**LiveLogicPublicService:**
- `LoggerService` - Invocation logging [src/lib/services/logic/public/LiveLogicPublicService.ts:39]()
- `LiveLogicPrivateService` - Orchestration delegation [src/lib/services/logic/public/LiveLogicPublicService.ts:40-42]()

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:1-32](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:1-29](), [src/lib/services/logic/public/BacktestLogicPublicService.ts:1-34](), [src/lib/services/logic/public/LiveLogicPublicService.ts:1-42](), [Diagram 6: Dependency Injection and Service Aggregation]()

---

## Context Injection Mechanism

Logic Services use `MethodContextService.runAsyncIterator()` to inject context into async generators.

### MethodContextService Integration

![Mermaid Diagram](./diagrams\22_Logic_Services_6.svg)

### Context Lifecycle

1. **Context Creation**: Public service receives context object with schema names [src/lib/services/logic/public/BacktestLogicPublicService.ts:48-52]()
2. **Scope Injection**: `MethodContextService.runAsyncIterator()` wraps generator with scoped context [src/lib/services/logic/public/BacktestLogicPublicService.ts:58-65]()
3. **Implicit Propagation**: Connection Services read context without explicit parameters [src/lib/services/context/MethodContextService.ts:41-45]()
4. **Scope Cleanup**: Context destroyed when generator completes or terminates

### IMethodContext Interface

| Field | Type | Purpose |
|-------|------|---------|
| `strategyName` | `StrategyName` | Routes to correct strategy schema |
| `exchangeName` | `ExchangeName` | Routes to correct exchange schema |
| `frameName` | `FrameName` | Routes to correct frame schema (empty for live) |

**Sources:** [src/lib/services/logic/public/BacktestLogicPublicService.ts:46-66](), [src/lib/services/logic/public/LiveLogicPublicService.ts:55-74](), [src/lib/services/context/MethodContextService.ts:1-56](), [Diagram 4: Configuration and Registration System]()

---

## Integration with Global Services

Logic Services delegate business logic execution to Global Services that inject `ExecutionContextService`.

### Service Call Patterns

**BacktestLogicPrivateService calls:**

| Global Service | Method | Purpose | Line Reference |
|----------------|--------|---------|----------------|
| `FrameGlobalService` | `getTimeframe(symbol)` | Retrieve historical timestamp array | [src/lib/services/logic/private/BacktestLogicPrivateService.ts:53]() |
| `StrategyGlobalService` | `tick(symbol, when, true)` | Check for signal generation at timestamp | [src/lib/services/logic/private/BacktestLogicPrivateService.ts:60]() |
| `ExchangeGlobalService` | `getNextCandles(symbol, "1m", limit)` | Fetch future candles for simulation | [src/lib/services/logic/private/BacktestLogicPrivateService.ts:73-79]() |
| `StrategyGlobalService` | `backtest(symbol, candles, when, true)` | Fast-forward simulate signal lifecycle | [src/lib/services/logic/private/BacktestLogicPrivateService.ts:92-97]() |

**LiveLogicPrivateService calls:**

| Global Service | Method | Purpose | Line Reference |
|----------------|--------|---------|----------------|
| `StrategyGlobalService` | `tick(symbol, when, false)` | Monitor signal status in real-time | [src/lib/services/logic/private/LiveLogicPrivateService.ts:61]() |

### Execution Context Injection

![Mermaid Diagram](./diagrams\22_Logic_Services_7.svg)

**Sources:** [src/lib/services/logic/private/BacktestLogicPrivateService.ts:60-97](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:61](), [Diagram 1: Four-Layer Architecture Overview](), [Diagram 2: Backtest Execution Flow]()

---

## Usage from Public API

Logic Services are accessed through the `Backtest` and `Live` classes in the Public API layer.

### Call Chain Diagram

![Mermaid Diagram](./diagrams\22_Logic_Services_8.svg)

### Type Signatures

**Backtest Entry Point:**
```typescript
// From Backtest class
async *run(
  symbol: string,
  options: {
    strategyName: string;
    exchangeName: string;
    frameName: string;
  }
): AsyncGenerator<IStrategyTickResultClosed>
```

**Live Entry Point:**
```typescript
// From Live class
async *run(
  symbol: string,
  options: {
    strategyName: string;
    exchangeName: string;
  }
): AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed>
```

**Sources:** [src/index.ts:44-55](), [types.d.ts:1-56](), [Diagram 1: Four-Layer Architecture Overview]()
---
title: design/22_live-trading-mode
group: design
---

# Live Trading Mode

**Purpose**: This page documents the Live Trading Mode execution system, covering real-time signal execution, crash recovery, persistence, graceful shutdown, and the infinite loop architecture.

For historical simulation, see [Backtest Mode](./20_execution-modes.md). For strategy comparison, see [Walker](./20_execution-modes.md). For async generator implementation details, see [Async Generator Patterns](./20_execution-modes.md).

---

## Overview

Live Trading Mode executes strategies in real-time against live market data. Unlike Backtest Mode's deterministic timeframe iteration, Live Mode operates as an **infinite loop** that continuously monitors active signals and generates new ones when idle.

Key characteristics:
- **Infinite execution**: Runs until manually stopped or crashes
- **Real-time progression**: Uses `new Date()` for current timestamp
- **Crash-safe persistence**: Active signals survive process restarts
- **Graceful shutdown**: Waits for active signals to close before stopping
- **Fixed polling interval**: Checks signal status every 1 minute + 1ms


---

## Architecture

### Execution Flow Diagram

![Mermaid Diagram](./diagrams\22_live-trading-mode_0.svg)


### Core Loop Implementation

The infinite loop in `LiveLogicPrivateService.run()` implements the following sequence:

| Step | Operation | File Reference |
|------|-----------|----------------|
| 1 | Create real-time date with `new Date()` | `LiveLogicPrivateService.ts:72` |
| 2 | Call `strategyCoreService.tick(symbol, when, false)` | `LiveLogicPrivateService.ts:76` |
| 3 | Handle errors and retry after sleep | `LiveLogicPrivateService.ts:77-95` |
| 4 | Check result action type | `LiveLogicPrivateService.ts:118-149` |
| 5 | Yield `opened` or `closed` results | `LiveLogicPrivateService.ts:152` |
| 6 | Sleep for `TICK_TTL` (1 minute + 1ms) | `LiveLogicPrivateService.ts:137-173` |
| 7 | Check stop conditions before continuing | `LiveLogicPrivateService.ts:119-135` |


### Sleep Interval Configuration

```typescript
const TICK_TTL = 1 * 60 * 1_000 + 1; // 60,001 milliseconds
```

The `TICK_TTL` constant defines the polling interval. The additional 1ms prevents timing boundary issues when candles complete exactly at minute boundaries.

**Why 1 minute?**
- Aligns with minimum candle interval (1m)
- Balances responsiveness vs. API rate limits
- Sufficient for monitoring TP/SL/time_expired conditions


---

## Crash Recovery

### Persistence Architecture Diagram

![Mermaid Diagram](./diagrams\22_live-trading-mode_1.svg)


### Persistence Strategy

Live Mode implements **crash-safe persistence** through the following mechanisms:

#### Signal Lifecycle and Persistence

| Signal State | Persisted? | Reason |
|--------------|-----------|---------|
| `idle` | No | No active signal to save |
| `scheduled` | No | Not yet activated, ephemeral |
| `opened` | **Yes** | Active position, requires recovery |
| `active` | **Yes** | Position monitoring TP/SL/time |
| `closed` | No | Position completed, delete from storage |
| `cancelled` | No | Never opened, nothing to recover |

**Critical**: Only `opened` signals are persisted. This prevents storage bloat while ensuring all active positions can be recovered.


#### Recovery Process

```typescript
// On restart, ClientStrategy calls:
await clientStrategy.waitForInit();
// This internally:
// 1. Calls PersistSignalAdapter.hasValue(symbol, strategyName)
// 2. If exists, calls PersistSignalAdapter.readValue()
// 3. Restores pendingSignal state
// 4. Continues tick() monitoring from current Date
```

The recovery process is **transparent** to the strategy code. When `Live.run()` starts:

1. `LiveLogicPrivateService` begins infinite loop
2. First `tick()` call triggers `waitForInit()` internally
3. If persisted signal exists, it's restored
4. Tick continues monitoring the restored signal's TP/SL/time conditions


#### Atomic Write Guarantees

The `PersistSignalAdapter` interface requires **atomic writes**:

```typescript
interface PersistBase {
  waitForInit(): Promise<void>;
  hasValue(symbol: string, strategyName: string): Promise<boolean>;
  readValue(symbol: string, strategyName: string): Promise<ISignalRow>;
  writeValue(symbol: string, strategyName: string, signal: ISignalRow): Promise<void>;
}
```

Implementations must ensure:
- Writes are atomic (complete or not started, no partial writes)
- `hasValue()` returns true only after successful `writeValue()`
- `readValue()` returns complete signal data or throws


---

## Graceful Shutdown

### Shutdown Flow Diagram

![Mermaid Diagram](./diagrams\22_live-trading-mode_2.svg)


### Stop Mechanism Implementation

The graceful shutdown mechanism involves coordination between multiple components:

#### 1. Setting Stop Flag

```typescript
// User calls:
await Live.stop(symbol, strategyName);

// Internally calls:
await strategyCoreService.stop({ symbol, strategyName }, false);
//                                                        ^^^^
//                                              backtest=false
```

The `false` parameter indicates **live mode**, which affects behavior:
- Waits for active signals to close naturally
- Does not force immediate cancellation
- Allows TP/SL/time_expired conditions to complete


#### 2. Checking Stop Condition

The infinite loop checks for stop conditions at two points:

**Point A: Idle State**
```typescript
if (result.action === "idle") {
  if (await strategyCoreService.getStopped(symbol, strategyName)) {
    // No active signal, safe to stop immediately
    break;
  }
}
```

**Point B: After Signal Closes**
```typescript
if (result.action === "closed") {
  if (await strategyCoreService.getStopped(symbol, strategyName)) {
    // Signal just closed, safe to stop now
    break;
  }
}
```


#### 3. Background Task Stop Handler

When using `Live.background()`, the cancellation closure provides additional safety:

```typescript
const cancel = Live.background(symbol, context);

// Later:
cancel(); // Calls stop AND waits for signal completion
```

The cancellation closure:
1. Sets stop flag via `strategyCoreService.stop()`
2. Checks for pending signal
3. Only emits `doneLiveSubject` if signal is closed
4. Waits for natural completion before returning


### Stop Behavior Comparison

| Scenario | Immediate Stop? | Signal Fate | Done Event? |
|----------|----------------|-------------|-------------|
| Idle (no active signal) | Yes | N/A | Yes, immediately |
| Active signal exists | No | Completes normally (TP/SL/time) | Yes, after close |
| Scheduled signal exists | No | Waits for activation or cancellation | Yes, after resolution |
| Multiple stop calls | Idempotent | First stop wins | Once, after close |


---

## Public API

### LiveUtils Class Diagram

![Mermaid Diagram](./diagrams\22_live-trading-mode_3.svg)


### Method Reference

#### Live.run()

```typescript
public run(
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  }
): AsyncGenerator<IStrategyTickResultClosed | IStrategyTickResultOpened>
```

**Returns**: Infinite async generator yielding `opened` and `closed` signal results

**Example**:
```typescript
for await (const result of Live.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
})) {
  if (result.action === "opened") {
    console.log("Signal opened:", result.signal.id);
  } else if (result.action === "closed") {
    console.log("PNL:", result.pnl.pnlPercentage);
  }
}
```

**Behavior**:
- Validates strategy and exchange exist
- Clears previous markdown/state for symbol-strategy pair
- Clears risk global service for associated risks
- Returns instance-specific generator via `_getInstance()`


#### Live.background()

```typescript
public background(
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  }
): () => void
```

**Returns**: Cancellation closure to stop execution

**Example**:
```typescript
const cancel = Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});

// Later, to stop:
cancel(); // Waits for active signal to close
```

**Behavior**:
- Consumes generator internally without yielding
- Returns cancellation closure for graceful shutdown
- Catches errors and emits to `exitEmitter`
- Uses `singlerun` wrapper to prevent duplicate executions


#### Live.stop()

```typescript
public stop(
  symbol: string,
  strategyName: string
): Promise<void>
```

**Returns**: Promise resolving when stop flag is set

**Example**:
```typescript
await Live.stop("BTCUSDT", "my-strategy");
// Strategy will stop after current signal closes
```

**Behavior**:
- Sets internal stop flag via `strategyCoreService.stop()`
- Does NOT force immediate termination
- Allows active signals to complete normally
- Safe to call multiple times (idempotent)


#### Live.getData()

```typescript
public getData(
  symbol: string,
  strategyName: string
): Promise<LiveStatisticsModel>
```

**Returns**: Statistical data from all live trading events

**Data includes**:
- Closed signals count and PNL statistics
- Opened signals count
- Scheduled/cancelled signals tracking
- Sharpe ratio, win rate, max drawdown
- Average signal lifetime


#### Live.getReport()

```typescript
public getReport(
  symbol: string,
  strategyName: string,
  columns?: Columns[]
): Promise<string>
```

**Returns**: Markdown formatted report string

**Report includes**:
- Summary statistics table
- All events table (opened/closed/scheduled/cancelled)
- Profit/loss analysis
- Risk-adjusted metrics


#### Live.dump()

```typescript
public dump(
  symbol: string,
  strategyName: string,
  path?: string,
  columns?: Columns[]
): Promise<void>
```

**Default path**: `./dump/live/{strategyName}.md`

**Example**:
```typescript
await Live.dump("BTCUSDT", "my-strategy");
// Saves to: ./dump/live/my-strategy.md

await Live.dump("BTCUSDT", "my-strategy", "./reports");
// Saves to: ./reports/my-strategy.md
```


#### Live.list()

```typescript
public list(): Promise<Array<{
  id: string;
  symbol: string;
  strategyName: string;
  status: "idle" | "running" | "done";
}>>
```

**Returns**: Status of all active live trading instances

**Example**:
```typescript
const statusList = await Live.list();
statusList.forEach(status => {
  console.log(`${status.symbol} - ${status.strategyName}: ${status.status}`);
});
```


---

## State Management

### LiveInstance Lifecycle

Each `symbol:strategyName` combination gets its own isolated `LiveInstance`:

![Mermaid Diagram](./diagrams\22_live-trading-mode_4.svg)


### Instance Isolation

The `_getInstance` memoization pattern ensures:

```typescript
private _getInstance = memoize<
  (symbol: string, strategyName: StrategyName) => LiveInstance
>(
  ([symbol, strategyName]) => `${symbol}:${strategyName}`,
  (symbol: string, strategyName: StrategyName) => new LiveInstance(symbol, strategyName)
);
```

**Key**: `"BTCUSDT:my-strategy"`

**Implications**:
- Same symbol + different strategy = separate instances
- Different symbol + same strategy = separate instances
- Each instance maintains independent `_isStopped` and `_isDone` flags
- Each instance has its own `task` (singlerun wrapper)


### Task Status Tracking

The `task` field uses `singlerun` wrapper from `functools-kit`:

```typescript
private task = singlerun(async (
  symbol: string,
  context: { strategyName: string; exchangeName: string; }
) => {
  return await INSTANCE_TASK_FN(symbol, context, this);
})
```

**Status values**:
- `"idle"`: Never started or completed
- `"running"`: Currently executing
- `"done"`: Execution completed


---

## Event Emission

### Live Mode Event Flow

![Mermaid Diagram](./diagrams\22_live-trading-mode_5.svg)


### Event Types and Payloads

| Event Emitter | Trigger | Payload Fields | Purpose |
|---------------|---------|----------------|---------|
| `signalEmitter` | Any signal event | `action`, `signal`, `pnl?` | Global signal tracking |
| `signalLiveEmitter` | Live signal event | Same as above + `backtest=false` | Live-specific filtering |
| `performanceEmitter` | Every tick | `metricType="live_tick"`, `duration`, `symbol`, `strategyName` | Performance profiling |
| `errorEmitter` | Tick failure | `error`, `symbol`, `when`, `message` | Error monitoring |
| `doneLiveSubject` | Stopped + closed | `symbol`, `strategyName`, `exchangeName`, `backtest=false` | Completion tracking |


### Listening to Events

```typescript
import {
  listenSignalLive,
  listenDoneLive,
  listenPerformance,
  listenError
} from "backtest-kit";

listenSignalLive((event) => {
  if (event.action === "opened") {
    console.log("New position:", event.signal.id);
  }
});

listenDoneLive((event) => {
  console.log("Live trading stopped:", event.strategyName);
});

listenPerformance((event) => {
  if (event.metricType === "live_tick") {
    console.log(`Tick took ${event.duration.toFixed(2)}ms`);
  }
});

listenError((error) => {
  console.error("Live trading error:", error);
});
```


---

## Comparison with Backtest Mode

### Key Differences

| Aspect | Live Mode | Backtest Mode |
|--------|-----------|---------------|
| **Time Source** | `new Date()` (real-time) | `timeframes[i]` (historical) |
| **Loop Type** | `while(true)` (infinite) | `for` loop (finite) |
| **Completion** | Never (until stopped) | After last timeframe |
| **Persistence** | Yes (opened signals) | No (ephemeral) |
| **Sleep Interval** | 1 minute + 1ms | None (fast iteration) |
| **Progress Events** | None | `progressBacktestEmitter` |
| **Fast Backtest** | N/A (real-time only) | Yes (bulk candle processing) |
| **Crash Recovery** | Yes (via PersistSignalAdapter) | N/A |
| **Generator Type** | Infinite | Finite |
| **Stop Behavior** | Graceful (waits for close) | Immediate (can stop mid-signal) |


### Method Signature Differences

```typescript
// Backtest requires frameName for timeframe generation
Backtest.run(symbol, {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-test" // Required!
});

// Live does NOT use frameName (real-time progression)
Live.run(symbol, {
  strategyName: "my-strategy",
  exchangeName: "binance"
  // No frameName needed
});
```


### Context Propagation Difference

Both modes use `ExecutionContextService` and `MethodContextService`, but with different parameters:

```typescript
// Backtest context
{
  symbol: "BTCUSDT",
  when: timeframes[i],    // Historical date
  backtest: true
}

// Live context
{
  symbol: "BTCUSDT",
  when: new Date(),       // Current date
  backtest: false
}
```

The `backtest` flag affects:
- Persistence behavior (only live persists)
- Event emission filtering
- Fast backtest availability
- Candle fetching strategy


---

## Implementation Details

### Error Handling Strategy

Live mode implements **retry-on-error** for tick failures:

```typescript
try {
  result = await strategyCoreService.tick(symbol, when, false);
} catch (error) {
  console.warn(`tick failed when=${when.toISOString()}`);
  this.loggerService.warn("tick failed, retrying after sleep", { ... });
  await errorEmitter.next(error);
  await sleep(TICK_TTL);
  continue; // Retry on next iteration
}
```

**Rationale**:
- Live trading cannot skip time like backtest
- Network errors should not terminate execution
- Sleep interval allows transient issues to resolve
- Error is logged and emitted for monitoring


### Signal State Filtering

The infinite loop only **yields** `opened` and `closed` results:

```typescript
if (result.action === "idle") {
  await sleep(TICK_TTL);
  continue; // Don't yield idle
}

if (result.action === "active") {
  await sleep(TICK_TTL);
  continue; // Don't yield active monitoring
}

if (result.action === "scheduled") {
  await sleep(TICK_TTL);
  continue; // Don't yield scheduled waiting
}

// Only yield opened/closed
yield result as IStrategyTickResultClosed | IStrategyTickResultOpened;
```

**Why filter?**
- `idle`: No information, just waiting
- `active`: Signal already opened, just monitoring
- `scheduled`: Waiting for activation, no action needed
- `opened`/`closed`: **Actionable events** for user code


### Performance Tracking

Every tick emits performance metrics:

```typescript
await performanceEmitter.next({
  timestamp: currentTimestamp,
  previousTimestamp: previousEventTimestamp,
  metricType: "live_tick",
  duration: tickEndTime - tickStartTime,
  strategyName: this.methodContextService.context.strategyName,
  exchangeName: this.methodContextService.context.exchangeName,
  symbol,
  backtest: false,
});
```

These metrics enable:
- Monitoring tick duration for bottlenecks
- Detecting slow `getSignal()` implementations
- Tracking API call latency
- Generating performance reports via `Performance.getData()`


---

## Best Practices

### Production Deployment

```typescript
import { Live, listenError, listenExit, setLogger } from "backtest-kit";

// Configure logging
setLogger(console);

// Handle errors without crashing
listenError((error) => {
  console.error("Recoverable error:", error);
  // Send to monitoring system
});

// Handle fatal errors
listenExit((error) => {
  console.error("FATAL ERROR:", error);
  process.exit(1);
});

// Start live trading
Live.background("BTCUSDT", {
  strategyName: "production-strategy",
  exchangeName: "binance"
});

// Health check endpoint
app.get("/health", async (req, res) => {
  const instances = await Live.list();
  res.json({ instances });
});
```


### Graceful Process Shutdown

```typescript
const cancelFunctions = [];

// Start multiple live traders
cancelFunctions.push(
  Live.background("BTCUSDT", { ... })
);
cancelFunctions.push(
  Live.background("ETHUSDT", { ... })
);

// Handle SIGTERM/SIGINT
process.on("SIGTERM", () => {
  console.log("Gracefully shutting down...");
  
  // Stop all traders
  cancelFunctions.forEach(cancel => cancel());
  
  // Wait for all signals to close (handled by cancel functions)
});
```


### Monitoring Active Positions

```typescript
import { listenSignalLive } from "backtest-kit";

const activePositions = new Map();

listenSignalLive((event) => {
  if (event.action === "opened") {
    activePositions.set(event.signal.id, {
      symbol: event.symbol,
      position: event.signal.position,
      priceOpen: event.signal.priceOpen,
      priceTakeProfit: event.signal.priceTakeProfit,
      priceStopLoss: event.signal.priceStopLoss,
      openedAt: new Date()
    });
  }
  
  if (event.action === "closed") {
    const position = activePositions.get(event.signal.id);
    console.log(`Position closed:`, {
      ...position,
      closeReason: event.closeReason,
      pnl: event.pnl.pnlPercentage,
      duration: Date.now() - position.openedAt.getTime()
    });
    activePositions.delete(event.signal.id);
  }
});
```


---

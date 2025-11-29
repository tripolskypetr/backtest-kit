# Live Trading


This page describes the live trading execution mode, which runs trading strategies in real-time against live market data. Live trading operates as an infinite async generator that continuously monitors positions and generates signals based on the current market state.

**Scope**: This page covers the core execution flow, API, and architectural patterns for live trading. For crash recovery mechanisms, see [Crash Recovery](./56_Crash_Recovery.md). For real-time price monitoring with VWAP, see [Real-time Monitoring](./57_Real-time_Monitoring.md). For signal validation and lifecycle management, see [Signal Lifecycle](./44_Signal_Lifecycle.md). For backtesting execution, see [Backtesting](./50_Backtesting.md).

## Overview

Live trading differs fundamentally from backtesting in its execution model:

| Aspect | Backtest Mode | Live Mode |
|--------|--------------|-----------|
| Time progression | Iterates predefined timeframe array | Infinite loop with `Date.now()` |
| Execution duration | Finite (completes when timeframe ends) | Infinite (runs until stopped) |
| Data source | Historical candles from Frame | Real-time market data from Exchange |
| State persistence | None (ephemeral) | Crash-safe atomic writes to disk |
| Price monitoring | Fast-forward via candle high/low | VWAP calculation using recent candles |
| Recovery | Not applicable | Automatic on restart via `waitForInit()` |


## Architecture

![Mermaid Diagram](./diagrams/54_Live_Trading_0.svg)

**Live Trading Architecture**

The live trading system uses a three-layer architecture:
1. **Public API Layer** (`Live` singleton) - User-facing methods with logging and cleanup
2. **Service Layer** - Context management and infinite loop orchestration
3. **Client Layer** - Business logic for signal lifecycle and market data


## Infinite Loop Execution

![Mermaid Diagram](./diagrams/54_Live_Trading_1.svg)

**Infinite Loop State Machine**

The `LiveLogicPrivateService.run()` method implements an infinite `while(true)` loop that never terminates. Each iteration performs a tick check and sleeps for `TICK_TTL` (61 seconds).


### Tick Execution Flow

Each tick iteration creates a fresh `Date` object representing the current time. Unlike backtesting, there is no timeframe array - the loop simply continues forever with real-time progression.


## Public API

### Live.run()

```typescript
public run = (
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  }
) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed>
```

Starts live trading as an infinite async generator. Yields opened and closed signals. Does not yield idle, active, or scheduled states (they are filtered out internally).

**State Cleanup**: Before starting, `Live.run()` clears:
- `liveMarkdownService` accumulated events for the strategy
- `scheduleMarkdownService` scheduled signal tracking
- `strategyGlobalService` cached client instance
- `riskGlobalService` position tracking (if risk profile exists)

This ensures each run starts with clean state.

**Example:**

```typescript
import { Live } from "backtest-kit";

for await (const result of Live.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
})) {
  if (result.action === "opened") {
    console.log("Position opened:", result.signal.id);
  } else if (result.action === "closed") {
    console.log("Position closed. PNL:", result.pnl.pnlPercentage);
  }
  // Loop continues infinitely
}
```


### Live.background()

```typescript
public background = (
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  }
) => () => void
```

Runs live trading in the background without yielding results to the caller. Internally consumes all results from `Live.run()` and only executes callbacks. Returns a cancellation function.

**Cancellation**: The returned function sets an internal `isStopped` flag and calls `strategyGlobalService.stop()`. The loop breaks after the next closed signal.

**Completion Event**: Emits to `doneLiveSubject` when the loop terminates (either via cancellation or error).

**Error Handling**: Catches errors and emits to `errorEmitter`.

**Example:**

```typescript
import { Live, listenSignalLive, listenDoneLive } from "backtest-kit";

// Set up listeners first
listenSignalLive((result) => {
  console.log("Background signal:", result.action);
});

listenDoneLive((event) => {
  console.log("Live trading completed:", event.strategyName);
});

// Start background execution
const cancel = Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});

// Later: cancel execution
setTimeout(() => {
  cancel();
}, 60000); // Cancel after 60 seconds
```


### Live.getData()

```typescript
public getData = async (strategyName: StrategyName) => Promise<ILiveStatistics>
```

Retrieves accumulated statistics for a strategy from `LiveMarkdownService`. Returns PNL aggregation, win rate, average duration, Sharpe ratio, drawdown, and other performance metrics.


### Live.getReport()

```typescript
public getReport = async (strategyName: StrategyName) => Promise<string>
```

Generates a markdown-formatted report for a strategy. Includes all signal events, statistics tables, and performance summary.


### Live.dump()

```typescript
public dump = async (
  strategyName: StrategyName,
  path?: string
) => Promise<void>
```

Writes the markdown report to disk. Default path is `./logs/live/{strategyName}.md`.


## Context Propagation

![Mermaid Diagram](./diagrams/54_Live_Trading_3.svg)

**Context Propagation in Live Trading**

The `LiveLogicPublicService` wraps the infinite loop with `MethodContextService.runAsyncIterator()`, which establishes a DI scope containing `{strategyName, exchangeName, frameName: ""}`. Note that `frameName` is always empty string for live trading.

Inside each tick iteration, `ExecutionContextService.runInContext()` creates a nested scope with `{symbol, when: Date.now(), backtest: false}`. The `backtest: false` flag signals that VWAP-based price monitoring should be used instead of fast-forward simulation.


## Signal Yielding Behavior

The infinite loop filters signals before yielding:

| Signal State | Yielded? | Rationale |
|--------------|----------|-----------|
| `idle` | No | No position exists, nothing to report |
| `scheduled` | No | Waiting for price activation, not actionable yet |
| `active` | No | Position being monitored, no state change |
| `opened` | **Yes** | New position created, consumer should know |
| `closed` | **Yes** | Position closed with PNL, consumer should know |
| `cancelled` | **Yes** | Scheduled signal timed out, consumer should know |

This filtering is implemented in [src/lib/services/logic/private/LiveLogicPrivateService.ts:93-109]():

```typescript
if (result.action === "active") {
  await sleep(TICK_TTL);
  continue;
}

if (result.action === "idle") {
  await sleep(TICK_TTL);
  continue;
}

if (result.action === "scheduled") {
  await sleep(TICK_TTL);
  continue;
}

// Yield opened, closed, cancelled results
yield result;
```


## Performance Metrics

Each tick iteration emits timing metrics via `performanceEmitter`:

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

The `metricType: "live_tick"` identifies this as a live trading metric. The `duration` field measures how long the tick operation took, useful for detecting slow exchange API calls or expensive strategy logic.


## Event Emitters

Live trading emits to multiple event streams:

| Emitter | Event Type | When Emitted |
|---------|-----------|--------------|
| `signalEmitter` | `IStrategyTickResult` | All signal events (live + backtest) |
| `signalLiveEmitter` | `IStrategyTickResult` | Only live trading signals |
| `performanceEmitter` | `PerformanceContract` | Each tick iteration |
| `doneLiveSubject` | `DoneContract` | `Live.background()` completes |
| `errorEmitter` | `Error` | `Live.background()` error |

Users can subscribe to these emitters using event listeners:

```typescript
import { 
  listenSignalLive, 
  listenPerformance, 
  listenDoneLive, 
  listenError 
} from "backtest-kit";

// Listen to live signals only
listenSignalLive((result) => {
  console.log("Live signal:", result.action);
});

// Monitor performance
listenPerformance((metric) => {
  if (metric.metricType === "live_tick") {
    console.log(`Tick took ${metric.duration}ms`);
  }
});

// Listen to completion
listenDoneLive((event) => {
  console.log("Live trading stopped:", event.strategyName);
});

// Listen to errors
listenError((error) => {
  console.error("Background error:", error.message);
});
```


## Comparison with Backtest Execution

![Mermaid Diagram](./diagrams/54_Live_Trading_4.svg)

**Backtest vs Live Execution Comparison**

Key differences:
- **Time Source**: Backtest uses predefined `Date[]` array, Live uses `new Date()`
- **Loop Termination**: Backtest completes when array exhausted, Live never completes
- **Signal Processing**: Backtest calls `strategy.backtest()` for fast-forward, Live uses VWAP monitoring
- **State Persistence**: Backtest has none, Live persists after each state change
- **Crash Recovery**: Backtest not applicable, Live recovers via `waitForInit()`


## Integration with ClientStrategy

The `ClientStrategy` class handles the actual signal lifecycle. In live mode, it behaves differently:

| Operation | Backtest Mode | Live Mode |
|-----------|---------------|-----------|
| Price monitoring | Fast-forward via candle array | VWAP via `getAveragePrice()` |
| State persistence | None | Atomic writes via `PersistSignalAdapter` |
| Time checks | Compare `candle.timestamp` | Compare `Date.now()` |
| Signal activation | Scan candle high/low for `priceOpen` | Wait for VWAP to reach `priceOpen` |
| TP/SL detection | Scan candle high/low | Compare VWAP |

When `backtest: false` is passed to `tick()`, the `ClientStrategy` knows to:
1. Use `getAveragePrice()` for current market price instead of candle data
2. Persist state changes to disk via `PersistSignalAdapter`
3. Check real-time clock (`Date.now()`) for timeouts instead of simulated time
4. Monitor scheduled signal activation using VWAP instead of candle high/low

For details on these behaviors, see [Signal Lifecycle](./44_Signal_Lifecycle.md) and [Real-time Monitoring](./57_Real-time_Monitoring.md).

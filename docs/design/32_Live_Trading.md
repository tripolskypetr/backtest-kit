# Live Trading

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/classes/Backtest.ts](src/classes/Backtest.ts)
- [src/classes/Live.ts](src/classes/Live.ts)
- [src/lib/services/context/MethodContextService.ts](src/lib/services/context/MethodContextService.ts)
- [src/lib/services/logic/private/BacktestLogicPrivateService.ts](src/lib/services/logic/private/BacktestLogicPrivateService.ts)
- [src/lib/services/logic/private/LiveLogicPrivateService.ts](src/lib/services/logic/private/LiveLogicPrivateService.ts)
- [src/lib/services/logic/public/BacktestLogicPublicService.ts](src/lib/services/logic/public/BacktestLogicPublicService.ts)
- [src/lib/services/logic/public/LiveLogicPublicService.ts](src/lib/services/logic/public/LiveLogicPublicService.ts)

</details>



This document covers the live trading execution system, which enables real-time signal monitoring and trading operations with crash recovery. Live trading runs as an infinite async generator that continuously evaluates market conditions and manages open positions.

For information about backtesting historical data, see [Backtesting](#7). For details on the underlying signal lifecycle and state transitions, see [Signal Lifecycle](#6). For information about signal persistence mechanisms, see [Signal Persistence](#6.3).

---

## Purpose and Scope

Live trading provides a production-ready framework for executing trading strategies in real-time. Unlike backtesting, which iterates through historical timeframes, live trading operates continuously with 1-minute intervals and uses the current system time (`Date.now()`). The system is designed for reliability with atomic state persistence that enables crash recovery without signal duplication or loss.

Key characteristics:
- **Infinite execution**: The generator never completes unless manually stopped
- **Crash-safe**: State is persisted to disk before every yield
- **Real-time**: Uses current market prices via `getAveragePrice()`
- **Filtered output**: Only yields `opened` and `closed` events (skips `idle` and `active`)

Sources: [src/classes/Live.ts:10-38](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:10-24]()

---

## Public API Surface

The `Live` singleton class provides the user-facing interface for live trading operations. All methods delegate to `liveGlobalService` with logging.

### Live.run()

Starts live trading execution and returns an infinite async generator that yields opened and closed signals.

**Method Signature**:
```typescript
Live.run(
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  }
): AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed>
```

**Usage Example**:
```typescript
for await (const result of Live.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
})) {
  if (result.action === "opened") {
    console.log("Signal opened:", result.signal.id);
  } else if (result.action === "closed") {
    console.log("PNL:", result.pnl.pnlPercentage);
  }
}
```

**Important**: This loop runs forever and must be terminated with Ctrl+C or process.exit().

Sources: [src/classes/Live.ts:40-62]()

---

### Live.background()

Executes live trading without yielding results to the caller. All signal events are still processed internally and logged, but the caller does not receive them. Returns a cancellation closure that stops execution after the next closed signal.

**Method Signature**:
```typescript
Live.background(
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  }
): Promise<() => void>
```

**Usage Example**:
```typescript
const cancel = await Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
});

// Later: stop after next signal closes
cancel();
```

Sources: [src/classes/Live.ts:64-117]()

---

### Live.getReport() and Live.dump()

Generate markdown reports summarizing all signal events for a strategy. `getReport()` returns the markdown string, while `dump()` writes it to disk.

**Method Signatures**:
```typescript
Live.getReport(strategyName: string): Promise<string>
Live.dump(strategyName: string, path?: string): Promise<void>
```

Default path for `dump()` is `./logs/live`.

Sources: [src/classes/Live.ts:119-162]()

---

## Architecture Overview

Live trading uses a three-layer architecture with context injection:

![Mermaid Diagram](./diagrams\32_Live_Trading_0.svg)

**Layer Responsibilities**:

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| Public API | `Live` | User-facing interface with logging |
| Service Orchestration | `LiveGlobalService` | Service aggregation |
| Service Orchestration | `LiveLogicPublicService` | Context injection wrapper |
| Service Orchestration | `LiveLogicPrivateService` | Core infinite loop orchestration |
| Business Logic | `ClientStrategy` | Signal evaluation and persistence |
| Cross-Cutting | `PersistSignalAdapter` | Atomic file I/O for crash safety |

Sources: [src/classes/Live.ts:1-9](), [src/lib/services/logic/public/LiveLogicPublicService.ts:8-20](), [src/lib/services/logic/private/LiveLogicPrivateService.ts:10-24]()

---

## LiveLogicPrivateService: Core Execution Loop

`LiveLogicPrivateService` implements the infinite execution loop that drives live trading. The service is located at [src/lib/services/logic/private/LiveLogicPrivateService.ts]().

### Infinite Loop Pattern

![Mermaid Diagram](./diagrams\32_Live_Trading_1.svg)

### Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `TICK_TTL` | `60,001 ms` | Interval between ticks (1 minute + 1 millisecond buffer) |

The extra 1ms buffer ensures the next tick starts after the minute boundary, preventing edge case timing issues.

Sources: [src/lib/services/logic/private/LiveLogicPrivateService.ts:7-82]()

---

### Execution Flow Details

The `run()` method at [src/lib/services/logic/private/LiveLogicPrivateService.ts:53-82]() implements the following steps:

1. **Enter infinite loop**: `while (true)` creates unbounded execution
2. **Create timestamp**: `const when = new Date()` captures current time
3. **Evaluate strategy**: `await this.strategyGlobalService.tick(symbol, when, false)`
   - The `false` parameter indicates live mode (not backtest)
   - This triggers signal evaluation in `ClientStrategy`
4. **Filter results**:
   - `idle`: No signal exists, skip yielding
   - `active`: Signal is monitoring conditions, skip yielding
   - `opened`: New signal created, yield to user
   - `closed`: Signal completed, yield to user with PnL
5. **Sleep**: `await sleep(TICK_TTL)` waits 1 minute before next iteration

**Result Filtering Rationale**:

Live mode only yields `opened` and `closed` events to reduce noise. The `active` state occurs every minute while a signal is monitoring conditions, which would flood the output. Users typically only care about signal entry and exit points.

Sources: [src/lib/services/logic/private/LiveLogicPrivateService.ts:53-82]()

---

## Context Propagation

`LiveLogicPublicService` wraps `LiveLogicPrivateService` with `MethodContextService` to enable implicit context passing. This allows framework functions like `getCandles()` and `getSignal()` to work without explicit parameters.

![Mermaid Diagram](./diagrams\32_Live_Trading_2.svg)

### Context Structure

The context object contains:

```typescript
interface IMethodContext {
  strategyName: string;  // Which strategy to execute
  exchangeName: string;  // Which exchange to use
  frameName: string;     // Always "" for live mode
}
```

The `frameName` is an empty string for live trading because there is no historical timeframe—execution uses real-time data.

Sources: [src/lib/services/logic/public/LiveLogicPublicService.ts:38-74](), [src/lib/services/context/MethodContextService.ts:6-19]()

---

## Crash Recovery Mechanism

Live trading persists signal state to disk before every yield, enabling seamless recovery after process crashes or restarts.

### Persistence Workflow

![Mermaid Diagram](./diagrams\32_Live_Trading_3.svg)

### Persistence Guarantees

1. **Atomicity**: File writes are atomic using temporary files and rename operations
2. **Durability**: State is written to disk before yielding, ensuring no in-memory-only state
3. **Idempotency**: On restart, the same signal is not duplicated—monitoring resumes
4. **Location**: Files stored at `./logs/persist/{strategyName}/{symbol}.json`

### State Transitions and Persistence

| State Transition | Persistence Action |
|------------------|-------------------|
| `idle` → `opened` | Write signal to disk |
| `opened` → `active` | No change (signal already persisted) |
| `active` → `active` | No change (monitoring) |
| `active` → `closed` | Write `null` to disk (clear signal) |

Sources: [src/lib/services/logic/private/LiveLogicPrivateService.ts:10-24]()

---

## Real-time Price Fetching

Unlike backtesting which uses historical candle data, live trading fetches the current market price in real-time using `getAveragePrice()`. This function calculates Volume-Weighted Average Price (VWAP) from recent trades.

### Price Source

![Mermaid Diagram](./diagrams\32_Live_Trading_4.svg)

The `getAveragePrice()` function is called during every tick to:
1. **Check take profit**: Compare current price to signal's `takeProfit` level
2. **Check stop loss**: Compare current price to signal's `stopLoss` level
3. **Calculate PnL**: Determine profit/loss when closing signal

Sources: Based on execution flow from Diagram 3 in high-level architecture

---

## Integration with Global Services

`LiveLogicPrivateService` orchestrates execution by delegating to global services:

![Mermaid Diagram](./diagrams\32_Live_Trading_5.svg)

**Dependencies**:

- **StrategyGlobalService**: Executes strategy logic and manages signal lifecycle
- **LoggerService**: Records tick results and signal events
- **ExchangeGlobalService** (indirect): Fetches market prices via strategy calls

All services are injected via dependency injection using `TYPES` symbols.

Sources: [src/lib/services/logic/private/LiveLogicPrivateService.ts:26-29]()

---

## Comparison: Live vs Backtest

| Aspect | Live Trading | Backtesting |
|--------|-------------|-------------|
| **Execution** | Infinite loop (`while(true)`) | Finite iteration over timeframes |
| **Time Source** | `new Date()` (real-time) | Timeframe array (historical) |
| **Price Source** | `getAveragePrice()` (VWAP) | `getCandles()` (OHLCV data) |
| **Interval** | 1 minute + 1ms | Configurable (1m, 5m, 1d, etc.) |
| **Persistence** | Enabled (crash recovery) | Disabled (simulation only) |
| **Yielded Events** | `opened` and `closed` only | All events including `active` |
| **Fast-Forward** | No (real-time progression) | Yes (`backtest()` method) |
| **Completion** | Never completes | Completes after last timeframe |

Sources: [src/lib/services/logic/private/LiveLogicPrivateService.ts:53-82](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts:48-119]()

---

## Error Handling

### Process Termination

Live trading does not handle graceful shutdown automatically. To stop execution:

1. **Ctrl+C**: Sends SIGINT to process, which Node.js handles by default
2. **process.exit()**: Explicitly terminates process
3. **Cancel function**: `Live.background()` returns a closure that stops after next closed signal

### Crash Scenarios

The system handles crashes transparently:

- **Mid-tick crash**: Next restart recovers persisted state from disk
- **Between ticks**: No active work to recover, resumes normally
- **During persistence**: Atomic writes prevent partial state corruption

### Validation Errors

If `getSignal()` returns an invalid signal, `ClientStrategy` throws an error and the process crashes. Users should ensure their signal generation logic is correct before running live.

Sources: [src/classes/Live.ts:40-117]()

---

## Monitoring and Observability

### Logging

`LiveLogicPrivateService` logs every tick result:

```typescript
this.loggerService.info("liveLogicPrivateService tick result", {
  symbol,
  action: result.action,
});
```

Log locations:
- Console output (if enabled)
- Log files (if file transport configured)
- Custom logger implementation (if provided)

### Markdown Reports

The `LiveMarkdownService` accumulates all signal events and generates reports with:
- List of all opened signals
- List of all closed signals with PnL
- Win rate statistics
- Average profit/loss

Access reports via:
- `Live.getReport(strategyName)`: Returns markdown string
- `Live.dump(strategyName, path)`: Writes markdown to disk

Sources: [src/lib/services/logic/private/LiveLogicPrivateService.ts:63-66](), [src/classes/Live.ts:119-162]()

---

## Usage Example: Complete Live Trading Setup

```typescript
import { Live } from "./classes/Live";
import { addStrategy } from "./functions/addStrategy";
import { addExchange } from "./functions/addExchange";

// Register strategy
addStrategy({
  name: "momentum-strategy",
  getSignal: async (symbol, when) => {
    // Your signal generation logic
    const price = await getAveragePrice(symbol);
    
    if (shouldEnterLong(price)) {
      return {
        id: `signal-${Date.now()}`,
        symbol,
        side: "long",
        openPrice: price,
        takeProfit: price * 1.02,
        stopLoss: price * 0.98,
        minuteEstimatedTime: 60,
      };
    }
    
    return null;
  },
});

// Register exchange
addExchange({
  name: "binance",
  getCandles: async (symbol, interval, limit, date) => {
    // Fetch from Binance API
  },
});

// Run live trading (infinite loop)
for await (const result of Live.run("BTCUSDT", {
  strategyName: "momentum-strategy",
  exchangeName: "binance",
})) {
  if (result.action === "opened") {
    console.log("🔔 Signal opened:", result.signal.id);
    console.log("   Open:", result.signal.openPrice);
    console.log("   TP:", result.signal.takeProfit);
    console.log("   SL:", result.signal.stopLoss);
  }
  
  if (result.action === "closed") {
    console.log("🏁 Signal closed:", result.signal.id);
    console.log("   Reason:", result.closeReason);
    console.log("   PnL:", result.pnl.pnlPercentage, "%");
  }
}

// Generate report after stopping (in another context)
const report = await Live.getReport("momentum-strategy");
console.log(report);
```

Sources: [src/classes/Live.ts:16-36]()

---

## Thread Safety and Concurrency

Live trading is **single-threaded** and **synchronous**:

- Only one tick executes at a time
- The `sleep(TICK_TTL)` ensures 1-minute spacing
- No concurrent ticks can occur
- No locks or mutexes required

**Running Multiple Strategies**:

To run multiple strategies or symbols simultaneously, spawn separate Node.js processes:

```bash
# Terminal 1
node live-btc.js

# Terminal 2
node live-eth.js
```

Each process maintains its own state and persistence files, preventing conflicts.

Sources: [src/lib/services/logic/private/LiveLogicPrivateService.ts:53-82]()

---

## Performance Considerations

| Factor | Impact | Mitigation |
|--------|--------|-----------|
| **Network latency** | Delays in fetching VWAP | Use exchange with low latency, consider co-location |
| **Disk I/O** | Persistence writes block execution | Use SSD storage, minimize writes |
| **Strategy complexity** | Slow `getSignal()` delays ticks | Optimize signal generation logic |
| **Sleep precision** | Node.js timers not guaranteed precise | Accept ~1ms jitter, or use `setInterval` |

**Memory Usage**:

Live trading has minimal memory footprint:
- No historical data arrays (unlike backtest)
- Only current signal in memory
- Generator pattern prevents accumulation

Sources: [src/lib/services/logic/private/LiveLogicPrivateService.ts:7]()

---

## Related Subsections

For detailed information about specific live trading subsystems:

- **[Live Execution Flow](#8.1)**: Step-by-step explanation of `LiveLogicPrivateService` orchestration
- **[Crash Recovery](#8.2)**: Detailed atomic persistence and state recovery mechanisms
- **[Real-time Monitoring](#8.3)**: How `ClientStrategy` monitors signals against market conditions

For related topics across the framework:

- **[Signal Lifecycle](#6)**: Complete signal state machine and transitions
- **[Signal Persistence](#6.3)**: `PersistSignalAdapter` implementation details
- **[Backtest API](#3.2)**: Comparison with backtesting execution model
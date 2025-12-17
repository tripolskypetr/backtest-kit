---
title: design/24_async-generator-patterns
group: design
---

# Async Generator Patterns

This page documents the async generator patterns used throughout Backtest Kit's execution modes to enable memory-efficient streaming, early termination, and progressive result delivery. Async generators are the core architectural pattern that allows the framework to process large backtests without accumulating results in memory and support graceful shutdown in live trading.

For information about the higher-level execution orchestration, see [Execution Modes](./20_execution-modes.md). For details on how signals flow through the system, see [Signal Lifecycle](./08_core-concepts.md).

---

## Overview: Generator-Based Architecture

Backtest Kit uses JavaScript async generators (`async function*`) as the primary pattern for orchestrating all three execution modes. This pattern provides:

- **Streaming results**: Values are yielded one at a time without accumulating in arrays
- **Memory efficiency**: Only the current signal state is held in memory
- **Early termination**: Consumers can `break` from loops to stop execution
- **Progressive updates**: Walker mode yields after each strategy completion
- **Lazy evaluation**: Computation happens on-demand as values are consumed

The generator pattern is implemented at two layers:

| Layer | Services | Purpose |
|-------|----------|---------|
| **Private Logic** | `BacktestLogicPrivateService`, `LiveLogicPrivateService`, `WalkerLogicPrivateService` | Core generator implementation with `async *run()` methods |
| **Public Logic** | `BacktestLogicPublicService`, `LiveLogicPublicService`, `WalkerLogicPublicService` | Context propagation wrappers that call private services |


---

## Generator Types: Finite vs Infinite

The framework implements two distinct generator lifecycles depending on the execution mode:

![Mermaid Diagram](./diagrams\24_async-generator-patterns_0.svg)

### Finite Generators (Backtest, Walker)

**Backtest Mode** uses a traditional for-loop pattern with bounded iteration:

- Fetches complete `timeframes` array at start: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:69-72`
- Iterates with index: `while (i < timeframes.length)`
- Advances index: `i++` after processing each frame
- **Natural completion**: Generator exhausts when all timeframes are processed
- **Frame skipping**: After signal closes, `i` advances to `closeTimestamp`: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:403-409`

**Walker Mode** iterates through a finite list of strategies:

- Uses `for (const strategyName of strategies)`: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:115`
- Yields after each strategy backtest completes: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:231`
- **Natural completion**: Generator exhausts when all strategies are tested
- **Early exit**: `break` on stop signal: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:125`

### Infinite Generators (Live)

**Live Mode** uses an infinite loop for continuous monitoring:

- Never-ending loop: `while (true)`: `src/lib/services/logic/private/LiveLogicPrivateService.ts:70`
- Real-time progression: `when = new Date()`: `src/lib/services/logic/private/LiveLogicPrivateService.ts:72`
- Sleep interval: `await sleep(TICK_TTL)` where `TICK_TTL = 1min + 1ms`: `src/lib/services/logic/private/LiveLogicPrivateService.ts:14`, `src/lib/services/logic/private/LiveLogicPrivateService.ts:173`
- **Only terminates on explicit stop**: Checks `getStopped()` flag: `src/lib/services/logic/private/LiveLogicPrivateService.ts:122-136`
- **Graceful shutdown**: Waits for signal to close before breaking: `src/lib/services/logic/private/LiveLogicPrivateService.ts:155-170`


---

## Backtest Generator: Timeframe Iteration with Fast Skip

The backtest generator implements a deterministic iteration pattern that processes historical data minute-by-minute while optimizing performance through timeframe skipping.

![Mermaid Diagram](./diagrams\24_async-generator-patterns_1.svg)

### Key Implementation Details

**Timeframe Generation**: 
- Calls `frameCoreService.getTimeframe()` once at start: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:69-72`
- Stores complete array: `const timeframes = await this.frameCoreService.getTimeframe(...)`
- Tracks progress: `processedFrames: i, totalFrames: timeframes.length`

**Progress Tracking**:
- Emits after each frame: `await progressBacktestEmitter.next({...})`: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:84-92`
- Progress percentage: `progress: totalFrames > 0 ? i / totalFrames : 0`
- Final 100% emission: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:452-461`

**Fast Backtest Optimization**:
When a signal opens (`action === "opened"`), the generator fetches all required candles at once and calls `strategyCoreService.backtest()`:

1. **Calculate buffer**: `bufferMinutes = CC_AVG_PRICE_CANDLES_COUNT - 1` (for VWAP calculation): `src/lib/services/logic/private/BacktestLogicPrivateService.ts:317`
2. **Fetch candles**: `totalCandles = signal.minuteEstimatedTime + bufferMinutes`: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:319`
3. **Process signal**: `backtestResult = await strategyCoreService.backtest(symbol, candles, when, true)`: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:361-366`
4. **Skip timeframes**: Advances `i` to `closeTimestamp`: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:403-409`

This optimization avoids tick-by-tick processing while signals are active, drastically improving performance.

**Scheduled Signal Handling**:
For scheduled signals (`priceOpen` not yet reached), the generator:

1. Fetches extended candles: `bufferMinutes + CC_SCHEDULE_AWAIT_MINUTES + minuteEstimatedTime + 1`: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:176`
2. Includes wait time: `CC_SCHEDULE_AWAIT_MINUTES` for activation window
3. Monitors both activation and cancellation: `backtest()` handles both paths

**Performance Metrics**:
- Tracks frame duration: `performance.now()` before/after processing: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:79`, `src/lib/services/logic/private/BacktestLogicPrivateService.ts:434`
- Tracks signal duration: Start when opened/scheduled, end when closed: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:155`, `src/lib/services/logic/private/BacktestLogicPrivateService.ts:259`
- Emits `performanceEmitter` events: `src/lib/services/logic/private/BacktestLogicPrivateService.ts:391-401`


---

## Live Generator: Infinite Loop with Real-Time Polling

The live generator implements an infinite loop that continuously monitors real-time market conditions with crash recovery and graceful shutdown support.

![Mermaid Diagram](./diagrams\24_async-generator-patterns_2.svg)

### Key Implementation Details

**Infinite Loop Structure**:
- Never-ending: `while (true)`: `src/lib/services/logic/private/LiveLogicPrivateService.ts:70`
- Real-time timestamp: `const when = new Date()`: `src/lib/services/logic/private/LiveLogicPrivateService.ts:72`
- Tick interval: `TICK_TTL = 1 * 60 * 1_000 + 1` (1 minute + 1ms): `src/lib/services/logic/private/LiveLogicPrivateService.ts:14`
- Sleep between iterations: `await sleep(TICK_TTL)`: `src/lib/services/logic/private/LiveLogicPrivateService.ts:173`

**Selective Yielding**:
The generator only yields `opened` and `closed` results, filtering out `idle`, `active`, and `scheduled`:

```typescript
// Skip idle/active/scheduled - only sleep
if (result.action === "idle") {
  await sleep(TICK_TTL);
  continue;
}
// ... similar for active, scheduled

// Yield opened/closed
yield result as IStrategyTickResultClosed | IStrategyTickResultOpened;
```

This keeps the consumer loop clean and focused on actionable events: `src/lib/services/logic/private/LiveLogicPrivateService.ts:118-152`

**Crash Recovery**:
The live generator relies on `ClientStrategy.waitForInit()` to load persisted signal state:
- Called automatically during `strategyCoreService.tick()` initialization
- Reads from `PersistSignalAdapter` file storage
- Restores `pendingSignal` if process crashed mid-signal
- Reference: `docs/internals.md:76`

**Error Handling with Continue**:
If `tick()` throws an error, the generator:
1. Logs warning: `src/lib/services/logic/private/LiveLogicPrivateService.ts:78-91`
2. Emits to `errorEmitter`: `src/lib/services/logic/private/LiveLogicPrivateService.ts:92`
3. Sleeps: `await sleep(TICK_TTL)`
4. **Continues loop**: `continue` instead of breaking: `src/lib/services/logic/private/LiveLogicPrivateService.ts:94`

This ensures transient errors (network issues, API rate limits) don't kill the live trading process.

**Graceful Shutdown Logic**:

The generator implements two stop checks:

| Condition | Location | Behavior |
|-----------|----------|----------|
| Idle state | `LiveLogicPrivateService.ts:118-136` | Immediate break if no active signal |
| Signal closed | `LiveLogicPrivateService.ts:155-170` | Break after signal closes |

This ensures:
- **No orphaned positions**: Never stops with active signal
- **Clean exit**: Always waits for `action === "closed"`
- **User control**: Responds to `strategyCoreService.getStopped()` flag

**Performance Tracking**:
- Measures tick duration: `performance.now()` before/after: `src/lib/services/logic/private/LiveLogicPrivateService.ts:71`, `src/lib/services/logic/private/LiveLogicPrivateService.ts:103`
- Tracks delta: `previousTimestamp` for inter-tick timing: `src/lib/services/logic/private/LiveLogicPrivateService.ts:68`
- Emits `performanceEmitter` with `metricType: "live_tick"`: `src/lib/services/logic/private/LiveLogicPrivateService.ts:105-115`


---

## Walker Generator: Progressive Strategy Comparison

The walker generator orchestrates multiple backtests sequentially, yielding progress updates after each strategy completes to enable real-time comparison tracking.

![Mermaid Diagram](./diagrams\24_async-generator-patterns_3.svg)

### Key Implementation Details

**Sequential Backtest Execution**:
- Iterates: `for (const strategyName of strategies)`: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:115`
- Creates backtest iterator: `backtestLogicPublicService.run(symbol, context)`: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:137-141`
- Consumes fully: `await resolveDocuments(iterator)`: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:144`

**Stop Signal Management**:
Uses a `Set` to track stopped strategies with subscription filtering:

```typescript
const stoppedStrategies = new Set<StrategyName>();

const unsubscribe = walkerStopSubject
  .filter((data) => data.symbol === symbol && data.walkerName === context.walkerName)
  .connect((data) => {
    stoppedStrategies.add(data.strategyName);
  });
```

This enables:
- **Per-strategy stopping**: Specific strategies can be stopped mid-comparison
- **Symbol/walker isolation**: Filter by both `symbol` AND `walkerName`: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:99`
- **Cleanup**: `unsubscribe()` called in `finally` block: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:113`, `src/lib/services/logic/private/WalkerLogicPrivateService.ts:235`

**Metric Extraction & Ranking**:

```typescript
const stats = await this.backtestMarkdownService.getData(symbol, strategyName);
const value = stats[metric];
const metricValue = /* safe number check */;

const isBetter = bestMetric === null || (metricValue !== null && metricValue > bestMetric);
if (isBetter && metricValue !== null) {
  bestMetric = metricValue;
  bestStrategy = strategyName;
}
```

- Extracts dynamic metric: `stats[metric]` where `metric` is configurable: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:172`
- Safe math checking: Validates finite, non-NaN values: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:173-180`
- Higher-is-better: Uses `>` comparison for ranking: `src/lib/services/logic/private/WalkerLogicPrivateService.ts:183-190`

**Progressive Result Yielding**:

After each strategy completes, the generator constructs a `WalkerContract`:

```typescript
const walkerContract: WalkerContract = {
  walkerName, exchangeName, frameName, symbol,
  strategyName,  // Current strategy
  stats,          // Full statistics for current strategy
  metricValue,    // Extracted metric value
  metric,         // Metric being compared
  bestMetric,     // Best value so far
  bestStrategy,   // Best strategy so far
  strategiesTested,
  totalStrategies
};

await walkerEmitter.next(walkerContract);
yield walkerContract;
```

This enables consumers to:
- Track live progress: `strategiesTested / totalStrategies`
- See running best: `bestStrategy`, `bestMetric`
- Access full stats: Complete statistics for current strategy

**Lifecycle Callbacks**:

The walker supports optional callbacks throughout execution:

| Callback | Timing | Location |
|----------|--------|----------|
| `onStrategyStart` | Before backtest starts | `WalkerLogicPrivateService.ts:129-131` |
| `onStrategyError` | On backtest failure | `WalkerLogicPrivateService.ts:157-159` |
| `onStrategyComplete` | After successful backtest | `WalkerLogicPrivateService.ts:221-228` |
| `onComplete` | After all strategies tested | `WalkerLogicPrivateService.ts:254-256` |

**Final Results Emission**:

After loop completion, the generator emits comprehensive results:

```typescript
const finalResults = {
  walkerName, symbol, exchangeName, frameName,
  metric,
  totalStrategies: strategies.length,
  bestStrategy,
  bestMetric,
  bestStats: bestStrategy !== null 
    ? await this.backtestMarkdownService.getData(symbol, bestStrategy) 
    : null
};

await walkerCompleteSubject.next(finalResults);
```


---

## Memory Efficiency Through Streaming

Async generators enable constant memory usage regardless of dataset size by avoiding result accumulation.

### Traditional Array Accumulation (Anti-Pattern)

```typescript
// ❌ Memory grows linearly with signals
async function runBacktest_WRONG(symbol: string): Promise<IStrategyTickResultClosed[]> {
  const results: IStrategyTickResultClosed[] = []; // Growing array
  
  for (const when of timeframes) {
    const result = await tick(symbol, when);
    if (result.action === "closed") {
      results.push(result); // Accumulates in memory
    }
  }
  
  return results; // All results held until end
}
```

### Generator-Based Streaming (Actual Implementation)

```typescript
// ✅ Constant memory - yields one result at a time
async *run(symbol: string) {
  for (const when of timeframes) {
    const result = await tick(symbol, when);
    if (result.action === "closed") {
      yield result; // Consumer processes immediately
      // result is eligible for garbage collection
    }
  }
}
```

The framework's generators maintain constant memory by:

1. **No result arrays**: Never accumulating closed signals in internal arrays
2. **Immediate yielding**: Passing results to consumer as soon as available
3. **Lazy markdown accumulation**: `BacktestMarkdownService` subscribes to events but limits to 250 events per key: `docs/internals.md:101`

### Memory Usage Comparison

| Approach | Memory Formula | 10K Signals | 100K Signals |
|----------|---------------|-------------|--------------|
| Array accumulation | O(n) = `n * sizeof(result)` | ~10MB | ~100MB |
| Async generator | O(1) = `sizeof(currentResult)` | ~1KB | ~1KB |
| Markdown service | O(min(n, 250)) | 250 events | 250 events |

The generator pattern enables processing multi-year backtests (hundreds of thousands of signals) with minimal memory footprint.


---

## Early Termination Support

All generators support early termination, allowing consumers to stop execution mid-stream by breaking from the `for await` loop.

### Consumer-Side Termination

```typescript
// Consumer can break at any time
for await (const result of backtest.run(symbol, context)) {
  console.log(result.closeReason, result.pnl.pnlPercentage);
  
  // Early exit on loss threshold
  if (result.pnl.pnlPercentage < -10) {
    break; // Generator stops immediately
  }
}
```

When the consumer breaks:
1. Generator's next iteration is never requested
2. Generator's `finally` blocks execute (if any)
3. Resources are released
4. No further computation occurs

### Producer-Side Stop Mechanism

The framework also supports **producer-initiated stopping** via `getStopped()` checks:

![Mermaid Diagram](./diagrams\24_async-generator-patterns_4.svg)

### Backtest Stop Checks

The backtest generator includes three stop checks:

| Location | Condition | Line Reference |
|----------|-----------|----------------|
| Before tick | Always checks before processing frame | `BacktestLogicPrivateService.ts:95-110` |
| After idle tick | Only when no active signal | `BacktestLogicPrivateService.ts:132-150` |
| After signal closes | After yielding closed result | `BacktestLogicPrivateService.ts:284-300`, `BacktestLogicPrivateService.ts:413-430` |

This ensures:
- **Responsive stopping**: Checks on every frame
- **Safe termination**: Never stops mid-signal (only when idle or just closed)
- **Clean state**: Signal always completes before stopping

### Live Stop Checks

The live generator includes two conditional checks:

| Location | Condition | Line Reference |
|----------|-----------|----------------|
| Idle state | When `action === "idle"` | `LiveLogicPrivateService.ts:118-136` |
| After signal closes | When `action === "closed"` | `LiveLogicPrivateService.ts:155-170` |

The logic ensures graceful shutdown:
```typescript
if (result.action === "closed") {
  if (await this.strategyCoreService.getStopped(symbol, strategyName)) {
    this.loggerService.info("stopped by user request (after signal closed)");
    break; // Only break after position is closed
  }
}
```

### Walker Stop Signals

The walker uses a different pattern with pre-filtering:

```typescript
const stoppedStrategies = new Set<StrategyName>();

walkerStopSubject
  .filter((data) => data.symbol === symbol && data.walkerName === context.walkerName)
  .connect((data) => stoppedStrategies.add(data.strategyName));

for (const strategyName of strategies) {
  if (stoppedStrategies.has(strategyName)) {
    break; // Skip remaining strategies
  }
  // ... run backtest
}
```

This allows:
- **Selective stopping**: Stop specific strategies, not entire walker
- **Symbol isolation**: Filter by `symbol` AND `walkerName`
- **No active signal disruption**: Check happens before backtest starts


---

## Error Handling in Generators

Generators implement error handling strategies appropriate to their execution mode, with different levels of fault tolerance.

### Backtest: Try-Catch with Continue

Backtest mode catches errors during `tick()` and continues processing:

```typescript
let result: IStrategyTickResult;
try {
  result = await this.strategyCoreService.tick(symbol, when, true);
} catch (error) {
  console.warn(`backtestLogicPrivateService tick failed when=${when.toISOString()}`);
  this.loggerService.warn("tick failed, skipping timeframe", { error });
  await errorEmitter.next(error);
  i++; // Skip this frame
  continue; // Continue to next frame
}
```

Also catches during candle fetching and `backtest()` calls:
- Candle fetch error: `BacktestLogicPrivateService.ts:179-202`
- Backtest method error: `BacktestLogicPrivateService.ts:222-242`

Strategy:
- **Non-fatal errors**: Individual frame failures don't stop entire backtest
- **Skip and continue**: Move to next timeframe
- **Error emission**: Notify listeners via `errorEmitter`
- **Logging**: Detailed context for debugging

### Live: Try-Catch with Sleep-Retry

Live mode uses a different strategy due to infinite loop:

```typescript
let result: IStrategyTickResult;
try {
  result = await this.strategyCoreService.tick(symbol, when, false);
} catch (error) {
  console.warn(`liveLogicPrivateService tick failed when=${when.toISOString()}`);
  this.loggerService.warn("tick failed, retrying after sleep", { error });
  await errorEmitter.next(error);
  await sleep(TICK_TTL); // Wait before retry
  continue; // Retry on next iteration
}
```

Strategy:
- **Transient error tolerance**: Assumes errors are temporary (network, API limits)
- **Sleep before retry**: `TICK_TTL` delay prevents tight error loops
- **Never terminates**: Infinite loop continues despite errors
- **Suitable for live trading**: Brief API outages don't kill the process

### Walker: Try-Catch with Skip Strategy

Walker mode catches errors during individual strategy backtests:

```typescript
try {
  await resolveDocuments(iterator);
} catch (error) {
  console.warn(`walkerLogicPrivateService backtest failed strategyName=${strategyName}`);
  this.loggerService.warn("backtest failed for strategy, skipping", { error });
  await errorEmitter.next(error);
  
  if (walkerSchema.callbacks?.onStrategyError) {
    walkerSchema.callbacks.onStrategyError(strategyName, symbol, error);
  }
  
  continue; // Skip this strategy, continue to next
}
```

Strategy:
- **Isolation**: One strategy failure doesn't affect others
- **Callback notification**: `onStrategyError` allows custom handling
- **Skip and continue**: Move to next strategy
- **Comparison integrity**: Best strategy still calculated from successful runs

### Error Event Flow

All three modes follow this pattern:

![Mermaid Diagram](./diagrams\24_async-generator-patterns_5.svg)

- **Local logging**: `loggerService` records context
- **Global emission**: `errorEmitter` broadcasts to subscribers
- **User notification**: `listenError()` callbacks can handle errors: `docs/internals.md:87`


---

## Context Propagation Through Generators

All generator patterns integrate with the framework's context services to propagate ambient information without explicit parameter threading.

### Context Service Integration

![Mermaid Diagram](./diagrams\24_async-generator-patterns_6.svg)

### Public Logic Layer: Method Context Setup

Public services wrap private generators with context initialization:

**BacktestLogicPublicService**:
```typescript
public async *run(
  symbol: string,
  context: { strategyName: string; exchangeName: string; frameName: string; }
): AsyncGenerator<IStrategyBacktestResult> {
  yield* this.methodContextService.runInContext(async () => {
    return this.backtestLogicPrivateService.run(symbol);
  }, context);
}
```

This sets `MethodContext` containing:
- `strategyName`: Strategy being executed
- `exchangeName`: Exchange for data fetching
- `frameName`: Timeframe definition (backtest only)

### Private Logic Layer: Execution Context per Tick

Private services set `ExecutionContext` for each tick/frame:

**BacktestLogicPrivateService** implicitly via `strategyCoreService.tick()`:
```typescript
// StrategyCoreService internally does:
await this.executionContextService.runInContext(async () => {
  return this.strategyConnectionService.get(symbol, strategyName).tick();
}, { symbol, when, backtest: true });
```

This sets `ExecutionContext` containing:
- `symbol`: Current trading pair
- `when`: Current timestamp (historical or real-time)
- `backtest`: Boolean flag for mode detection

### Accessing Context Within Generators

Context is available throughout the call stack without passing parameters:

```typescript
// In BacktestLogicPrivateService
await progressBacktestEmitter.next({
  exchangeName: this.methodContextService.context.exchangeName,
  strategyName: this.methodContextService.context.strategyName,
  symbol, // From parameter
  // ... other fields
});
```

```typescript
// In ClientStrategy (deep in call stack)
const candles = await getCandles(symbol, interval, count);
// getCandles internally uses:
// - executionContextService.context.symbol
// - executionContextService.context.when
// - methodContextService.context.exchangeName
```

### Benefits for Generator Pattern

Context propagation enables generators to:
1. **Avoid parameter drilling**: No need to pass `strategyName`, `exchangeName` through every function
2. **Maintain clean signatures**: Generator methods have minimal parameters
3. **Support nested calls**: Context automatically flows to all nested services
4. **Enable lazy initialization**: Services can access context when needed


---

## Yield Semantics and Consumer Patterns

Generators use the `yield` keyword to pass values to consumers, with different semantics for each mode.

### Backtest: Yield Closed Signals Only

Backtest mode yields only when signals close:

```typescript
// Opens signal → fetches candles → calls backtest() → yields result
if (result.action === "opened") {
  // ... fetch candles, call backtest()
  yield backtestResult; // Always IStrategyBacktestResult (closed)
}

if (result.action === "scheduled") {
  // ... fetch candles, call backtest()
  yield backtestResult; // IStrategyBacktestResult (closed or cancelled)
}
```

**Type**: `AsyncGenerator<IStrategyBacktestResult>`

**Yielded results**:
- `IStrategyBacktestResult` with `action: "closed"` or `action: "cancelled"`
- Contains full signal with PNL calculation
- One yield per signal lifecycle

**Consumer pattern**:
```typescript
for await (const result of backtest.run(symbol, context)) {
  // result is always closed
  console.log(result.closeReason); // "take_profit" | "stop_loss" | "time_expired"
  console.log(result.pnl.pnlPercentage);
}
```

### Live: Yield Opened and Closed

Live mode yields at signal boundaries:

```typescript
// Skip idle/active/scheduled
if (result.action === "idle") {
  await sleep(TICK_TTL);
  continue; // Don't yield
}
if (result.action === "active") {
  await sleep(TICK_TTL);
  continue; // Don't yield
}
if (result.action === "scheduled") {
  await sleep(TICK_TTL);
  continue; // Don't yield
}

// Yield opened and closed
yield result as IStrategyTickResultClosed | IStrategyTickResultOpened;
```

**Type**: `AsyncGenerator<IStrategyTickResultClosed | IStrategyTickResultOpened>`

**Yielded results**:
- `IStrategyTickResultOpened`: Signal just activated
- `IStrategyTickResultClosed`: Signal closed with PNL

**Consumer pattern**:
```typescript
for await (const result of live.run(symbol, context)) {
  if (result.action === "opened") {
    console.log("New signal:", result.signal.id);
    // Send Telegram notification
  }
  if (result.action === "closed") {
    console.log("PNL:", result.pnl.pnlPercentage);
    // Log trade to database
  }
}
```

### Walker: Yield Per Strategy Completion

Walker mode yields after each strategy test:

```typescript
for (const strategyName of strategies) {
  // ... run backtest for strategy
  // ... calculate stats
  
  const walkerContract: WalkerContract = {
    strategyName,
    stats,
    metricValue,
    bestMetric,
    bestStrategy,
    strategiesTested,
    totalStrategies,
    // ...
  };
  
  await walkerEmitter.next(walkerContract);
  yield walkerContract;
}
```

**Type**: `AsyncGenerator<WalkerContract>`

**Yielded results**:
- `WalkerContract`: Contains stats for just-completed strategy
- Includes running best: `bestStrategy`, `bestMetric`
- Progress tracking: `strategiesTested / totalStrategies`

**Consumer pattern**:
```typescript
for await (const progress of walker.run(symbol, context)) {
  console.log(`[${progress.strategiesTested}/${progress.totalStrategies}]`);
  console.log(`Strategy: ${progress.strategyName}`);
  console.log(`Metric: ${progress.metricValue}`);
  console.log(`Best so far: ${progress.bestStrategy} (${progress.bestMetric})`);
}
```

### Yield vs Emit Pattern

The framework uses both `yield` (generator protocol) and event emission:

| Mechanism | Purpose | Persistence |
|-----------|---------|-------------|
| `yield` | Return value to consumer | Consumed once |
| `await emitter.next()` | Broadcast event | Multiple subscribers |

Generators yield **and** emit:
```typescript
yield backtestResult; // Consumer gets result
await signalBacktestEmitter.next(backtestResult); // Event subscribers notified
```

This dual approach enables:
- **Consumer control**: Generator consumer gets direct results
- **Observability**: Event listeners (markdown services) can monitor independently
- **Decoupling**: Consumer and observers are independent


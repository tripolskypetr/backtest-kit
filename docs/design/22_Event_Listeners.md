# Event Listeners

This page documents all event listener functions available in the public API for subscribing to framework events. Event listeners enable real-time monitoring of signal lifecycle, execution progress, completion events, performance metrics, and errors.

For information about the underlying event system architecture and Subject-based pub-sub pattern, see [3.4](./13_Event_System.md). For details on signal lifecycle states that trigger events, see [8.1](./47_Signal_States.md). For execution mode differences in event emission, see [2.1](./06_Execution_Modes.md).

## Overview

The framework provides 19 event listener functions organized into five categories:

| Category | Purpose | Functions |
|----------|---------|-----------|
| **Signal Events** | Subscribe to signal lifecycle state changes | `listenSignal`, `listenSignalOnce`, `listenSignalLive`, `listenSignalLiveOnce`, `listenSignalBacktest`, `listenSignalBacktestOnce` |
| **Completion Events** | Subscribe to execution completion (done) | `listenDoneLive`, `listenDoneLiveOnce`, `listenDoneBacktest`, `listenDoneBacktestOnce`, `listenDoneWalker`, `listenDoneWalkerOnce` |
| **Progress Events** | Subscribe to execution progress updates | `listenProgress`, `listenWalker`, `listenWalkerOnce` |
| **Performance Events** | Subscribe to timing metrics for profiling | `listenPerformance` |
| **Error Events** | Subscribe to validation errors and failures | `listenError`, `listenValidation`, `listenWalkerComplete` |

All listener functions return an unsubscribe function that can be called to stop receiving events. Events are processed sequentially using a queued wrapper to prevent concurrent callback execution.


## Event Emitter Architecture

![Mermaid Diagram](./diagrams/22_Event_Listeners_0.svg)

**Event Flow**: Event producers (ClientStrategy, logic services, ClientRisk) emit events to Subject instances. Listener functions subscribe to these Subjects and forward events to user callbacks wrapped in `queued()` for sequential processing.


## Signal Event Listeners

Signal event listeners subscribe to signal lifecycle state changes: `idle`, `scheduled`, `opened`, `active`, `closed`, `cancelled`. All signal listeners receive `IStrategyTickResult` discriminated union types.

### listenSignal

Subscribes to all signal events from both live and backtest execution modes.

**Function Signature**:
```typescript
function listenSignal(fn: (event: IStrategyTickResult) => void): () => void
```

**Parameters**:
- `fn` - Callback function receiving signal events. Callback is wrapped with `queued()` for sequential async processing.

**Returns**: Unsubscribe function to stop listening.

**Event Source**: [src/config/emitters.ts:13]() `signalEmitter`

**Usage Example**:
```typescript
const unsubscribe = listenSignal((event) => {
  if (event.action === "opened") {
    console.log("Signal opened:", event.signal.id);
  } else if (event.action === "closed") {
    console.log("Signal closed:", event.pnl.pnlPercentage);
  }
});

// Later: stop listening
unsubscribe();
```


### listenSignalOnce

Subscribes to filtered signal events with automatic one-time unsubscribe. Useful for waiting for specific signal conditions.

**Function Signature**:
```typescript
function listenSignalOnce(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
): () => void
```

**Parameters**:
- `filterFn` - Predicate function to filter events. Only matching events trigger the callback.
- `fn` - Callback function called once when filter matches.

**Returns**: Unsubscribe function to cancel before event fires.

**Event Source**: [src/config/emitters.ts:13]() `signalEmitter`

**Usage Example**:
```typescript
// Wait for first take profit hit
listenSignalOnce(
  (event) => event.action === "closed" && event.closeReason === "take_profit",
  (event) => {
    console.log("Take profit hit! PNL:", event.pnl.pnlPercentage);
  }
);
```


### listenSignalLive

Subscribes to signal events from live trading execution only. Does not receive backtest events.

**Function Signature**:
```typescript
function listenSignalLive(fn: (event: IStrategyTickResult) => void): () => void
```

**Event Source**: [src/config/emitters.ts:19]() `signalLiveEmitter`


### listenSignalLiveOnce

Filtered one-time subscription to live trading signal events.

**Function Signature**:
```typescript
function listenSignalLiveOnce(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
): () => void
```

**Event Source**: [src/config/emitters.ts:19]() `signalLiveEmitter`


### listenSignalBacktest

Subscribes to signal events from backtest execution only. Does not receive live events.

**Function Signature**:
```typescript
function listenSignalBacktest(fn: (event: IStrategyTickResult) => void): () => void
```

**Event Source**: [src/config/emitters.ts:25]() `signalBacktestEmitter`


### listenSignalBacktestOnce

Filtered one-time subscription to backtest signal events.

**Function Signature**:
```typescript
function listenSignalBacktestOnce(
  filterFn: (event: IStrategyTickResult) => boolean,
  fn: (event: IStrategyTickResult) => void
): () => void
```

**Event Source**: [src/config/emitters.ts:25]() `signalBacktestEmitter`


## Signal Event Types

![Mermaid Diagram](./diagrams/22_Event_Listeners_1.svg)

**Discriminated Union**: Use `event.action` for type-safe handling. Each action type has different properties available.


## Completion Event Listeners

Completion event listeners subscribe to execution done events. Emitted when `background()` methods complete execution for Live, Backtest, or Walker modes.

### listenDoneLive

Subscribes to live trading background execution completion events.

**Function Signature**:
```typescript
function listenDoneLive(fn: (event: DoneContract) => void): () => void
```

**Event Source**: [src/config/emitters.ts:37]() `doneLiveSubject`

**Event Payload** (`DoneContract`):
```typescript
{
  exchangeName: string;
  strategyName: string;
  backtest: false;
  symbol: string;
}
```

**Emission Point**: [src/classes/Live.ts:123-128]() after `Live.background()` completes.


### listenDoneLiveOnce

Filtered one-time subscription to live completion events.

**Function Signature**:
```typescript
function listenDoneLiveOnce(
  filterFn: (event: DoneContract) => boolean,
  fn: (event: DoneContract) => void
): () => void
```

**Event Source**: [src/config/emitters.ts:37]() `doneLiveSubject`


### listenDoneBacktest

Subscribes to backtest background execution completion events.

**Function Signature**:
```typescript
function listenDoneBacktest(fn: (event: DoneContract) => void): () => void
```

**Event Source**: [src/config/emitters.ts:43]() `doneBacktestSubject`

**Event Payload** (`DoneContract`):
```typescript
{
  exchangeName: string;
  strategyName: string;
  backtest: true;
  symbol: string;
}
```

**Emission Point**: [src/classes/Backtest.ts:108-113]() after `Backtest.background()` completes.


### listenDoneBacktestOnce

Filtered one-time subscription to backtest completion events.

**Function Signature**:
```typescript
function listenDoneBacktestOnce(
  filterFn: (event: DoneContract) => boolean,
  fn: (event: DoneContract) => void
): () => void
```

**Event Source**: [src/config/emitters.ts:43]() `doneBacktestSubject`


### listenDoneWalker

Subscribes to walker background execution completion events.

**Function Signature**:
```typescript
function listenDoneWalker(fn: (event: DoneContract) => void): () => void
```

**Event Source**: [src/config/emitters.ts:49]() `doneWalkerSubject`

**Event Payload** (`DoneContract`):
```typescript
{
  exchangeName: string;
  strategyName: string; // walkerName
  backtest: true;
  symbol: string;
}
```

**Emission Point**: [src/classes/Walker.ts:128-133]() after `Walker.background()` completes all strategy comparisons.


### listenDoneWalkerOnce

Filtered one-time subscription to walker completion events.

**Function Signature**:
```typescript
function listenDoneWalkerOnce(
  filterFn: (event: DoneContract) => boolean,
  fn: (event: DoneContract) => void
): () => void
```

**Event Source**: [src/config/emitters.ts:49]() `doneWalkerSubject`


## Progress Event Listeners

Progress event listeners subscribe to execution progress updates during backtest and walker execution.

### listenProgress

Subscribes to backtest execution progress events. Emitted periodically during `Backtest.run()` or `Backtest.background()` to track frame processing progress.

**Function Signature**:
```typescript
function listenProgress(fn: (event: ProgressContract) => void): () => void
```

**Event Source**: [src/config/emitters.ts:55]() `progressEmitter`

**Event Payload** (`ProgressContract`):
```typescript
{
  progress: number;        // 0.0 to 1.0
  processedFrames: number;
  totalFrames: number;
  strategyName: string;
  exchangeName: string;
  symbol: string;
}
```

**Usage Example**:
```typescript
const unsubscribe = listenProgress((event) => {
  console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
  console.log(`${event.processedFrames} / ${event.totalFrames} frames`);
});
```


### listenWalker

Subscribes to walker progress events. Emitted after each strategy completes during `Walker.run()` execution.

**Function Signature**:
```typescript
function listenWalker(fn: (event: WalkerContract) => void): () => void
```

**Event Source**: [src/config/emitters.ts:67]() `walkerEmitter`

**Event Payload** (`WalkerContract`):
```typescript
{
  strategiesTested: number;
  totalStrategies: number;
  bestStrategy: string;
  bestMetric: number;
  strategyName: string;      // current strategy
  metricValue: number;       // current strategy metric
  walkerName: string;
  exchangeName: string;
  frameName: string;
  symbol: string;
}
```

**Usage Example**:
```typescript
const unsubscribe = listenWalker((event) => {
  console.log(`Progress: ${event.strategiesTested} / ${event.totalStrategies}`);
  console.log(`Best: ${event.bestStrategy} (${event.bestMetric})`);
  console.log(`Current: ${event.strategyName} (${event.metricValue})`);
});
```


### listenWalkerOnce

Filtered one-time subscription to walker progress events.

**Function Signature**:
```typescript
function listenWalkerOnce(
  filterFn: (event: WalkerContract) => boolean,
  fn: (event: WalkerContract) => void
): () => void
```

**Event Source**: [src/config/emitters.ts:67]() `walkerEmitter`

**Usage Example**:
```typescript
// Wait for walker to complete all strategies
listenWalkerOnce(
  (event) => event.strategiesTested === event.totalStrategies,
  (event) => {
    console.log("Walker completed!");
    console.log("Best strategy:", event.bestStrategy, event.bestMetric);
  }
);
```


### listenWalkerComplete

Subscribes to walker final completion events with aggregated results. Emitted once when all strategies have been tested.

**Function Signature**:
```typescript
function listenWalkerComplete(fn: (event: IWalkerResults) => void): () => void
```

**Event Source**: [src/config/emitters.ts:73]() `walkerCompleteSubject`

**Event Payload** (`IWalkerResults`):
```typescript
{
  walkerName: string;
  bestStrategy: string;
  bestMetric: number;
  metric: WalkerMetric;         // "sharpeRatio" | "winRate" | etc
  totalStrategies: number;
  results: IWalkerStrategyResult[];  // per-strategy details
}
```

**Usage Example**:
```typescript
const unsubscribe = listenWalkerComplete((results) => {
  console.log(`Walker ${results.walkerName} completed!`);
  console.log(`Best strategy: ${results.bestStrategy}`);
  console.log(`Best ${results.metric}: ${results.bestMetric}`);
  console.log(`Tested ${results.totalStrategies} strategies`);
});
```


## Performance Event Listeners

### listenPerformance

Subscribes to performance timing metric events for profiling strategy execution. Emitted during both backtest and live execution.

**Function Signature**:
```typescript
function listenPerformance(fn: (event: PerformanceContract) => void): () => void
```

**Event Source**: [src/config/emitters.ts:61]() `performanceEmitter`

**Event Payload** (`PerformanceContract`):
```typescript
{
  metricType: PerformanceMetricType;  // "backtest_total" | "backtest_timeframe" | etc
  duration: number;                   // milliseconds
}
```

**Metric Types**:
- `backtest_total` - Total backtest execution time
- `backtest_timeframe` - Single timeframe iteration time
- `backtest_signal` - Single signal processing time
- `live_tick` - Single tick execution time

**Usage Example**:
```typescript
const unsubscribe = listenPerformance((event) => {
  console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
  if (event.duration > 100) {
    console.warn("Slow operation detected:", event.metricType);
  }
});
```


## Error Event Listeners

### listenError

Subscribes to background execution errors. Emitted when errors are caught in `background()` methods for Live, Backtest, or Walker execution.

**Function Signature**:
```typescript
function listenError(fn: (error: Error) => void): () => void
```

**Event Source**: [src/config/emitters.ts:31]() `errorEmitter`

**Emission Points**:
- [src/classes/Live.ts:130-132]() - Errors in `Live.background()`
- [src/classes/Backtest.ts:115-117]() - Errors in `Backtest.background()`
- [src/classes/Walker.ts:135-137]() - Errors in `Walker.background()`

**Usage Example**:
```typescript
const unsubscribe = listenError((error) => {
  console.error("Background execution error:", error.message);
  // Log to monitoring service, send alerts, etc.
});
```


### listenValidation

Subscribes to risk validation errors. Emitted when risk validation functions throw errors during signal checking in `ClientRisk.checkSignal()`.

**Function Signature**:
```typescript
function listenValidation(fn: (error: Error) => void): () => void
```

**Event Source**: [src/config/emitters.ts:79]() `validationSubject`

**Usage Example**:
```typescript
const unsubscribe = listenValidation((error) => {
  console.error("Risk validation error:", error.message);
  // Log to monitoring service for debugging
});
```


## Queued Processing Pattern

All event listener functions wrap user callbacks with `queued()` from `functools-kit` to ensure sequential async processing. This prevents concurrent execution of callbacks even if they are async functions.

![Mermaid Diagram](./diagrams/22_Event_Listeners_2.svg)

**Key Behavior**:
- Events arrive in order at Subject
- `queued()` wrapper enqueues events for processing
- Each callback waits for previous callback to complete before executing
- Prevents race conditions in async callbacks
- No concurrent execution of same callback

**Implementation**: [src/function/event.ts:9]() imports `queued` from `functools-kit`. All subscription calls use pattern: `emitter.subscribe(queued(async (event) => fn(event)))`.


## Event Listener Summary Table

| Function | Event Type | Emitter | Mode | Filter | Once |
|----------|-----------|---------|------|--------|------|
| `listenSignal` | `IStrategyTickResult` | `signalEmitter` | All | No | No |
| `listenSignalOnce` | `IStrategyTickResult` | `signalEmitter` | All | Yes | Yes |
| `listenSignalLive` | `IStrategyTickResult` | `signalLiveEmitter` | Live | No | No |
| `listenSignalLiveOnce` | `IStrategyTickResult` | `signalLiveEmitter` | Live | Yes | Yes |
| `listenSignalBacktest` | `IStrategyTickResult` | `signalBacktestEmitter` | Backtest | No | No |
| `listenSignalBacktestOnce` | `IStrategyTickResult` | `signalBacktestEmitter` | Backtest | Yes | Yes |
| `listenError` | `Error` | `errorEmitter` | All | No | No |
| `listenDoneLive` | `DoneContract` | `doneLiveSubject` | Live | No | No |
| `listenDoneLiveOnce` | `DoneContract` | `doneLiveSubject` | Live | Yes | Yes |
| `listenDoneBacktest` | `DoneContract` | `doneBacktestSubject` | Backtest | No | No |
| `listenDoneBacktestOnce` | `DoneContract` | `doneBacktestSubject` | Backtest | Yes | Yes |
| `listenDoneWalker` | `DoneContract` | `doneWalkerSubject` | Walker | No | No |
| `listenDoneWalkerOnce` | `DoneContract` | `doneWalkerSubject` | Walker | Yes | Yes |
| `listenProgress` | `ProgressContract` | `progressEmitter` | Backtest | No | No |
| `listenPerformance` | `PerformanceContract` | `performanceEmitter` | All | No | No |
| `listenWalker` | `WalkerContract` | `walkerEmitter` | Walker | No | No |
| `listenWalkerOnce` | `WalkerContract` | `walkerEmitter` | Walker | Yes | Yes |
| `listenWalkerComplete` | `IWalkerResults` | `walkerCompleteSubject` | Walker | No | No |
| `listenValidation` | `Error` | `validationSubject` | All | No | No |

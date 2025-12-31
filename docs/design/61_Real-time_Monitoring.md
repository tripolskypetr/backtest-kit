# Real-time Monitoring

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/index.ts](src/index.ts)
- [src/lib/services/core/StrategyCoreService.ts](src/lib/services/core/StrategyCoreService.ts)
- [src/lib/services/logic/private/BacktestLogicPrivateService.ts](src/lib/services/logic/private/BacktestLogicPrivateService.ts)
- [src/lib/services/logic/private/LiveLogicPrivateService.ts](src/lib/services/logic/private/LiveLogicPrivateService.ts)
- [src/lib/services/logic/private/WalkerLogicPrivateService.ts](src/lib/services/logic/private/WalkerLogicPrivateService.ts)
- [types.d.ts](types.d.ts)

</details>



Real-time monitoring is the continuous process of evaluating signal states during live trading execution. The system uses an infinite loop with periodic sleep intervals to check signal status, emit events, collect performance metrics, and handle errors without interrupting execution. This page covers the monitoring loop architecture, tick evaluation, event emission, and state-specific monitoring behavior.

For information about the overall live execution flow, see [10.1](#10.1). For crash recovery mechanisms, see [10.2](#10.2). For interval-based throttling to prevent signal spam, see [10.4](#10.4).

---

## Monitoring Loop Architecture

The monitoring loop is implemented in `LiveLogicPrivateService` as an infinite `while(true)` loop that continuously evaluates signal status. Each iteration creates a real-time timestamp with `new Date()`, calls `tick()` to evaluate signal state, emits events, and sleeps for `TICK_TTL` before the next iteration.

```mermaid
graph TB
    START["LiveLogicPrivateService.run()"] --> LOOP_START["while(true)"]
    
    LOOP_START --> CREATE_TIMESTAMP["when = new Date()<br/>Real-time timestamp"]
    CREATE_TIMESTAMP --> CALL_TICK["strategyCoreService.tick()<br/>symbol, when, backtest=false"]
    
    CALL_TICK --> CHECK_ERROR{"Error?"}
    CHECK_ERROR -->|Yes| LOG_ERROR["Log warning<br/>errorEmitter.next(error)"]
    LOG_ERROR --> SLEEP_ERROR["sleep(TICK_TTL)"]
    SLEEP_ERROR --> LOOP_START
    
    CHECK_ERROR -->|No| EMIT_PERF["performanceEmitter.next()<br/>metricType: 'live_tick'<br/>duration: tick time"]
    
    EMIT_PERF --> CHECK_ACTION{"result.action"}
    
    CHECK_ACTION -->|"idle"| CHECK_STOPPED_IDLE{"getStopped()?"}
    CHECK_STOPPED_IDLE -->|Yes| BREAK_IDLE["break<br/>Exit loop"]
    CHECK_STOPPED_IDLE -->|No| SLEEP_IDLE["sleep(TICK_TTL)"]
    SLEEP_IDLE --> LOOP_START
    
    CHECK_ACTION -->|"active"| SLEEP_ACTIVE["sleep(TICK_TTL)"]
    SLEEP_ACTIVE --> LOOP_START
    
    CHECK_ACTION -->|"scheduled"| SLEEP_SCHEDULED["sleep(TICK_TTL)"]
    SLEEP_SCHEDULED --> LOOP_START
    
    CHECK_ACTION -->|"opened"<br/>or<br/>"closed"| YIELD["yield result<br/>Emit to generator consumer"]
    
    YIELD --> CHECK_CLOSED{"action === 'closed'"}
    CHECK_CLOSED -->|Yes| CHECK_STOPPED_CLOSED{"getStopped()?"}
    CHECK_STOPPED_CLOSED -->|Yes| BREAK_CLOSED["break<br/>Exit loop"]
    CHECK_STOPPED_CLOSED -->|No| SLEEP_YIELD["sleep(TICK_TTL)"]
    CHECK_CLOSED -->|No| SLEEP_YIELD
    SLEEP_YIELD --> LOOP_START
    
    BREAK_IDLE --> END["Generator completes"]
    BREAK_CLOSED --> END
```

**Key Components:**

| Component | Type | Purpose |
|-----------|------|---------|
| `TICK_TTL` | `const number` | Sleep interval between ticks: `1 * 60 * 1_000 + 1` (just over 1 minute) |
| `when` | `Date` | Real-time timestamp created with `new Date()` for each iteration |
| `result` | `IStrategyTickResult` | Discriminated union returned by `tick()` method |
| `sleep()` | Function | Async delay from `functools-kit` to pause between iterations |

**Loop Behavior:**

1. **Continuous Execution**: Never exits except via `getStopped()` check when idle or after signal closes
2. **Real-time Timestamps**: Each iteration uses current time, not historical data
3. **Error Recovery**: Errors are logged and emitted but do not break the loop
4. **State-Aware Sleep**: All states sleep for `TICK_TTL` except when breaking

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:14-177]()

---

## Tick Evaluation Process

The `tick()` method evaluates the current signal state by checking for pending signals, validating scheduled signals, or generating new signals via `getSignal()`. The evaluation is wrapped in an execution context containing symbol, timestamp, and backtest flag.

```mermaid
graph TB
    TICK_START["strategyCoreService.tick()"] --> VALIDATE["validate(symbol, strategyName)<br/>Memoized validation"]
    
    VALIDATE --> WRAP_CONTEXT["ExecutionContextService.runInContext()"]
    
    WRAP_CONTEXT --> INJECT["Inject context:<br/>symbol, when, backtest=false"]
    
    INJECT --> DELEGATE["strategyConnectionService.tick()"]
    
    DELEGATE --> GET_INSTANCE["getStrategy(symbol, strategyName)<br/>Memoized ClientStrategy instance"]
    
    GET_INSTANCE --> CALL_TICK["clientStrategy.tick(symbol, when)"]
    
    CALL_TICK --> GET_PENDING["Check _pendingSignal<br/>from PersistSignalAdapter"]
    
    GET_PENDING --> HAS_PENDING{"Has pending<br/>signal?"}
    
    HAS_PENDING -->|Yes| GET_SCHEDULED["Check _scheduledSignal<br/>from PersistScheduleAdapter"]
    HAS_PENDING -->|No| GET_SCHEDULED
    
    GET_SCHEDULED --> HAS_SCHEDULED{"Has scheduled<br/>signal?"}
    
    HAS_SCHEDULED -->|Yes| CHECK_ACTIVATION["Check priceOpen<br/>against currentPrice"]
    CHECK_ACTIVATION --> ACTIVATE{"Price reached<br/>priceOpen?"}
    ACTIVATE -->|Yes| CONVERT_PENDING["Convert scheduled → pending<br/>Set pendingAt = when.getTime()"]
    CONVERT_PENDING --> RETURN_OPENED["Return IStrategyTickResultOpened<br/>action: 'opened'"]
    
    ACTIVATE -->|No| CHECK_TIMEOUT["Check timeout<br/>CC_SCHEDULE_AWAIT_MINUTES"]
    CHECK_TIMEOUT --> TIMEOUT{"Timeout<br/>reached?"}
    TIMEOUT -->|Yes| RETURN_CANCELLED["Return IStrategyTickResultCancelled<br/>action: 'cancelled'"]
    TIMEOUT -->|No| RETURN_SCHEDULED["Return IStrategyTickResultScheduled<br/>action: 'scheduled'"]
    
    HAS_PENDING -->|No| CHECK_INTERVAL["Check lastGeneratedAt<br/>vs interval throttle"]
    CHECK_INTERVAL --> THROTTLED{"Within<br/>interval?"}
    THROTTLED -->|Yes| RETURN_IDLE_THROTTLE["Return IStrategyTickResultIdle<br/>action: 'idle'"]
    THROTTLED -->|No| CALL_GET_SIGNAL["schema.getSignal(symbol, when)"]
    
    CALL_GET_SIGNAL --> GET_SIGNAL_RESULT{"Result?"}
    GET_SIGNAL_RESULT -->|null| RETURN_IDLE_NULL["Return IStrategyTickResultIdle<br/>action: 'idle'"]
    
    GET_SIGNAL_RESULT -->|ISignalDto| VALIDATE_SIGNAL["Validate signal<br/>Type, price, logic, distance, risk"]
    VALIDATE_SIGNAL --> HAS_PRICE_OPEN{"priceOpen<br/>specified?"}
    
    HAS_PRICE_OPEN -->|Yes| CREATE_SCHEDULED["Create IScheduledSignalRow<br/>Set scheduledAt, _isScheduled"]
    CREATE_SCHEDULED --> RETURN_SCHEDULED
    
    HAS_PRICE_OPEN -->|No| CREATE_PENDING["Create ISignalRow<br/>Set pendingAt = scheduledAt"]
    CREATE_PENDING --> RETURN_OPENED
    
    HAS_PENDING -->|Yes, existing| MONITOR["Monitor TP/SL/time_expired"]
    MONITOR --> CHECK_TP{"priceTakeProfit<br/>reached?"}
    CHECK_TP -->|Yes| CLOSE_TP["Close with PNL<br/>closeReason: 'take_profit'"]
    CLOSE_TP --> RETURN_CLOSED_TP["Return IStrategyTickResultClosed<br/>action: 'closed'"]
    
    CHECK_TP -->|No| CHECK_SL{"priceStopLoss<br/>reached?"}
    CHECK_SL -->|Yes| CLOSE_SL["Close with PNL<br/>closeReason: 'stop_loss'"]
    CLOSE_SL --> RETURN_CLOSED_SL["Return IStrategyTickResultClosed<br/>action: 'closed'"]
    
    CHECK_SL -->|No| CHECK_TIME{"minuteEstimatedTime<br/>exceeded?"}
    CHECK_TIME -->|Yes| CLOSE_TIME["Close with PNL<br/>closeReason: 'time_expired'"]
    CLOSE_TIME --> RETURN_CLOSED_TIME["Return IStrategyTickResultClosed<br/>action: 'closed'"]
    
    CHECK_TIME -->|No| CALC_PROGRESS["Calculate percentTp, percentSl"]
    CALC_PROGRESS --> RETURN_ACTIVE["Return IStrategyTickResultActive<br/>action: 'active'"]
```

**Validation Chain:**

The signal validation process runs multiple checks sequentially before allowing a signal to be created:

| Validation Type | Service | Checks |
|----------------|---------|---------|
| Schema Existence | `StrategyValidationService` | Strategy is registered via `addStrategy()` |
| Risk Existence | `RiskValidationService` | Risk profiles exist if specified |
| Signal Type | `ClientStrategy` | `position` is "long" or "short" |
| Price Logic | `ClientStrategy` | TP > priceOpen > SL for long, SL > priceOpen > TP for short |
| Price Distance | `ClientStrategy` | TP/SL meet minimum distance requirements |
| Time Validity | `ClientStrategy` | `minuteEstimatedTime` is positive |
| Risk Checks | `ClientRisk.checkSignal()` | Portfolio limits, custom validations |

**Sources:** [src/lib/services/core/StrategyCoreService.ts:135-160](), [src/lib/services/connection/StrategyConnectionService.ts](), [src/client/ClientStrategy.ts]()

---

## Event-Driven Monitoring

The monitoring system emits events through RxJS Subjects for external observers to track execution without coupling to internal logic. Events are emitted at multiple points during tick evaluation and are processed sequentially via `queued()` wrapper.

```mermaid
graph TB
    subgraph "Emission Points in LiveLogicPrivateService"
        TICK_START["tick() called"] --> TICK_RESULT["result received"]
        TICK_RESULT --> EMIT_PERF["performanceEmitter.next()<br/>live_tick metrics"]
        TICK_RESULT --> EMIT_SIGNAL["signalEmitter.next(result)<br/>signalLiveEmitter.next(result)"]
        TICK_RESULT --> CHECK_ERROR{"Error caught?"}
        CHECK_ERROR -->|Yes| EMIT_ERROR["errorEmitter.next(error)"]
    end
    
    subgraph "Emission Points in ClientStrategy"
        STRATEGY_TICK["clientStrategy.tick()"] --> EMIT_IDLE["callbacks?.onIdle()<br/>signalEmitter"]
        STRATEGY_TICK --> EMIT_SCHEDULED["callbacks?.onSchedule()<br/>signalEmitter"]
        STRATEGY_TICK --> EMIT_OPENED["callbacks?.onOpen()<br/>signalEmitter"]
        STRATEGY_TICK --> EMIT_ACTIVE["callbacks?.onActive()<br/>signalEmitter"]
        STRATEGY_TICK --> EMIT_CLOSED["callbacks?.onClose()<br/>signalEmitter"]
        STRATEGY_TICK --> EMIT_CANCELLED["callbacks?.onCancel()<br/>signalEmitter"]
    end
    
    subgraph "Emission Points in ClientPartial"
        PARTIAL_CHECK["partial.profit()/loss()"] --> CHECK_LEVELS["Check milestone levels<br/>10%, 20%, 30%, etc"]
        CHECK_LEVELS --> EMIT_PARTIAL_PROFIT["partialProfitSubject.next()<br/>level, data, price"]
        CHECK_LEVELS --> EMIT_PARTIAL_LOSS["partialLossSubject.next()<br/>level, data, price"]
    end
    
    subgraph "Emission Points in ClientRisk"
        RISK_CHECK["risk.checkSignal()"] --> VALIDATION_FAIL{"Validation<br/>failed?"}
        VALIDATION_FAIL -->|Yes| EMIT_RISK["riskSubject.next()<br/>rejection details"]
        VALIDATION_FAIL -->|No| EMIT_ALLOWED["callbacks?.onAllowed()<br/>NOT emitted to riskSubject"]
    end
    
    subgraph "Listener Functions (Public API)"
        LISTEN_SIGNAL["listenSignal(fn)<br/>listenSignalLive(fn)"]
        LISTEN_ERROR["listenError(fn)"]
        LISTEN_PERF["listenPerformance(fn)"]
        LISTEN_PARTIAL["listenPartialProfit(fn)<br/>listenPartialLoss(fn)"]
        LISTEN_RISK["listenRisk(fn)"]
    end
    
    EMIT_SIGNAL --> LISTEN_SIGNAL
    EMIT_ERROR --> LISTEN_ERROR
    EMIT_PERF --> LISTEN_PERF
    EMIT_PARTIAL_PROFIT --> LISTEN_PARTIAL
    EMIT_PARTIAL_LOSS --> LISTEN_PARTIAL
    EMIT_RISK --> LISTEN_RISK
```

**Event Types and Payloads:**

| Emitter | Contract Type | Emitted When | Key Fields |
|---------|--------------|--------------|------------|
| `signalEmitter` | `IStrategyTickResult` | Every tick result | `action`, `signal`, `currentPrice`, `symbol` |
| `signalLiveEmitter` | `IStrategyTickResult` | Live mode only | Same as `signalEmitter` |
| `performanceEmitter` | `PerformanceContract` | Every tick | `metricType: "live_tick"`, `duration`, `timestamp` |
| `errorEmitter` | `Error` | Tick fails | `message`, `stack` |
| `partialProfitSubject` | `PartialProfitContract` | Profit milestone | `level`, `data`, `currentPrice`, `backtest` |
| `partialLossSubject` | `PartialLossContract` | Loss milestone | `level`, `data`, `currentPrice`, `backtest` |
| `riskSubject` | `RiskContract` | Signal rejected | `symbol`, `pendingSignal`, `activePositionCount`, `comment` |

**Listener Pattern:**

All listener functions use the `queued()` wrapper to ensure sequential processing:

```typescript
// From src/function/event.ts
export function listenSignalLive(fn: (event: IStrategyTickResult) => void) {
  return signalLiveEmitter.subscribe(queued(async (event) => fn(event)));
}
```

The `queued()` wrapper guarantees that:
- Events are processed in the order they are emitted
- The next event waits for the previous callback to complete
- No concurrent execution of the same callback
- Async callbacks are properly awaited

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:63-177](), [src/config/emitters.ts:1-133](), [src/function/event.ts:135-167]()

---

## Performance Metrics Collection

Each tick iteration emits performance metrics to track execution duration and detect bottlenecks. The metrics include operation type, duration, timestamp, and delta from the previous event.

```mermaid
graph TB
    START["Tick iteration starts"] --> RECORD_START["tickStartTime = performance.now()"]
    
    RECORD_START --> EXECUTE["Execute tick()"]
    
    EXECUTE --> RECORD_END["tickEndTime = performance.now()"]
    
    RECORD_END --> CALC_DURATION["duration = tickEndTime - tickStartTime"]
    
    CALC_DURATION --> GET_TIMESTAMP["currentTimestamp = Date.now()"]
    
    GET_TIMESTAMP --> EMIT["performanceEmitter.next()"]
    
    EMIT --> CONTRACT["PerformanceContract:<br/>timestamp: currentTimestamp<br/>previousTimestamp: previousEventTimestamp<br/>metricType: 'live_tick'<br/>duration: duration<br/>strategyName: strategyName<br/>exchangeName: exchangeName<br/>symbol: symbol<br/>backtest: false"]
    
    CONTRACT --> UPDATE["previousEventTimestamp = currentTimestamp"]
    
    UPDATE --> NEXT_TICK["Continue to next tick"]
```

**Performance Contract Fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `timestamp` | `number` | Current event timestamp in milliseconds |
| `previousTimestamp` | `number \| null` | Previous event timestamp for delta calculation |
| `metricType` | `"live_tick"` | Operation type being measured |
| `duration` | `number` | Execution time in milliseconds (from `performance.now()`) |
| `strategyName` | `string` | Strategy being executed |
| `exchangeName` | `string` | Exchange being used |
| `symbol` | `string` | Trading pair symbol |
| `backtest` | `boolean` | Always `false` for live mode |

**Metric Types:**

For live trading, the primary metric is:
- `"live_tick"`: Time to complete one monitoring iteration including tick evaluation, event emission, and state checks

The `previousTimestamp` field enables calculating time between events for monitoring system throughput.

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:103-115](), [src/contract/Performance.contract.ts]()

---

## Error Handling During Monitoring

The monitoring loop implements graceful error handling to ensure that transient failures do not stop live trading execution. Errors are logged, emitted for external observers, and followed by a sleep before retry.

```mermaid
graph TB
    TICK_CALL["strategyCoreService.tick()"] --> TRY_BLOCK["try { ... }"]
    
    TRY_BLOCK --> TICK_EXECUTE["Execute tick logic"]
    
    TICK_EXECUTE --> CATCH{"Error<br/>thrown?"}
    
    CATCH -->|No| SUCCESS["result received<br/>Continue normal flow"]
    
    CATCH -->|Yes| CONSOLE_WARN["console.warn()<br/>Log to stderr with details"]
    
    CONSOLE_WARN --> LOGGER_WARN["loggerService.warn()<br/>'tick failed, retrying after sleep'"]
    
    LOGGER_WARN --> EMIT_ERROR["errorEmitter.next(error)"]
    
    EMIT_ERROR --> SLEEP_RETRY["sleep(TICK_TTL)"]
    
    SLEEP_RETRY --> CONTINUE["continue<br/>Skip to next iteration"]
    
    CONTINUE --> TICK_CALL
```

**Error Handling Strategy:**

| Step | Action | Purpose |
|------|--------|---------|
| Console Warning | `console.warn()` with context | Immediate visibility in logs |
| Logger Service | `loggerService.warn()` with `errorData()` | Structured logging with stack trace |
| Error Emission | `errorEmitter.next(error)` | External observers can react |
| Sleep | `sleep(TICK_TTL)` | Prevent tight error loops |
| Continue | `continue` keyword | Skip to next iteration without breaking loop |

**Error Context:**

The warning message includes full context for debugging:
```
backtestLogicPrivateService tick failed when=${when.toISOString()} 
symbol=${symbol} strategyName=${strategyName} exchangeName=${exchangeName}
```

**Retry Behavior:**

- No retry limit - loop continues indefinitely
- Errors do not accumulate - each is handled independently
- Sleep interval matches normal tick interval to maintain timing
- Next iteration starts fresh with new `Date()` timestamp

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:74-95]()

---

## State-Specific Monitoring Behavior

The monitoring loop handles each signal state differently, with varying sleep durations and yield behavior. Understanding state-specific behavior is critical for efficient monitoring.

```mermaid
graph TB
    TICK_RESULT["tick() returns<br/>IStrategyTickResult"] --> CHECK_ACTION{"result.action"}
    
    CHECK_ACTION -->|"idle"| IDLE_NODE["State: Idle<br/>No active signal"]
    IDLE_NODE --> CHECK_STOPPED_IDLE{"getStopped()?"}
    CHECK_STOPPED_IDLE -->|Yes| LOG_STOP_IDLE["Log: 'stopped by user request (idle state)'"]
    LOG_STOP_IDLE --> BREAK_IDLE["break<br/>Exit generator"]
    CHECK_STOPPED_IDLE -->|No| SLEEP_IDLE["sleep(TICK_TTL)<br/>continue"]
    
    CHECK_ACTION -->|"scheduled"| SCHEDULED_NODE["State: Scheduled<br/>Waiting for priceOpen"]
    SCHEDULED_NODE --> SLEEP_SCHEDULED["sleep(TICK_TTL)<br/>continue<br/>NOT yielded"]
    
    CHECK_ACTION -->|"active"| ACTIVE_NODE["State: Active<br/>Monitoring TP/SL"]
    ACTIVE_NODE --> SLEEP_ACTIVE["sleep(TICK_TTL)<br/>continue<br/>NOT yielded"]
    
    CHECK_ACTION -->|"opened"| OPENED_NODE["State: Opened<br/>New signal created"]
    OPENED_NODE --> YIELD_OPENED["yield result<br/>Emit to consumer"]
    YIELD_OPENED --> SLEEP_OPENED["sleep(TICK_TTL)<br/>continue"]
    
    CHECK_ACTION -->|"closed"| CLOSED_NODE["State: Closed<br/>Signal completed"]
    CLOSED_NODE --> YIELD_CLOSED["yield result<br/>Emit to consumer"]
    YIELD_CLOSED --> CHECK_STOPPED_CLOSED{"getStopped()?"}
    CHECK_STOPPED_CLOSED -->|Yes| LOG_STOP_CLOSED["Log: 'stopped by user request<br/>(after signal closed)'"]
    LOG_STOP_CLOSED --> BREAK_CLOSED["break<br/>Exit generator"]
    CHECK_STOPPED_CLOSED -->|No| SLEEP_CLOSED["sleep(TICK_TTL)<br/>continue"]
    
    CHECK_ACTION -->|"cancelled"| CANCELLED_NODE["State: Cancelled<br/>Scheduled signal expired"]
    CANCELLED_NODE --> YIELD_CANCELLED["yield result<br/>Emit to consumer"]
    YIELD_CANCELLED --> SLEEP_CANCELLED["sleep(TICK_TTL)<br/>continue"]
```

**State Behavior Summary:**

| State | Yielded? | Sleep After? | Stop Check? | Purpose |
|-------|----------|--------------|-------------|---------|
| `idle` | No | Yes | Before sleep | No signal exists, safe to stop |
| `scheduled` | No | Yes | No | Waiting for price activation, keep monitoring |
| `active` | No | Yes | No | Position open, keep monitoring TP/SL |
| `opened` | Yes | Yes | No | Notify consumer of new position |
| `closed` | Yes | Yes | After yield | Notify consumer of PNL, allow graceful stop |
| `cancelled` | Yes | Yes | No | Notify consumer of cancelled scheduled signal |

**Yield Behavior:**

Only `opened`, `closed`, and `cancelled` results are yielded to the async generator consumer. This means:
- Consumer receives notification when positions open or close
- Consumer does not receive continuous updates during active monitoring
- For continuous monitoring, use event listeners instead of generator consumption

**Stop Check Timing:**

The `getStopped()` check occurs at strategic points:
- **Before idle sleep**: Safe to stop when no active position
- **After closed yield**: Graceful exit after position completes
- **Not during active/scheduled**: Prevents stopping mid-position

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:118-176](), [types.d.ts:769-890]()

---

## Continuous Monitoring vs. Backtest Monitoring

The monitoring behavior differs significantly between live and backtest modes. Live monitoring operates on real-time data with sleep intervals, while backtest monitoring fast-forwards through historical data without delays.

| Aspect | Live Monitoring | Backtest Monitoring |
|--------|----------------|---------------------|
| Loop Type | `while(true)` infinite loop | `while (i < timeframes.length)` finite loop |
| Timestamp Source | `new Date()` real-time | `timeframes[i]` historical array |
| Sleep Intervals | `sleep(TICK_TTL)` between ticks | No sleep, continuous iteration |
| Timeframe Skipping | No skipping, monitors every minute | Skips to `closeTimestamp` after signal opens |
| Signal Processing | `tick()` only, monitors one signal | `tick()` for idle, `backtest()` for opened |
| Persistence | Writes after every tick | No disk I/O during backtest |
| Performance Focus | Minimize latency for real-time response | Maximize throughput for historical analysis |
| Stop Behavior | Breaks loop when idle or closed | Breaks loop at any idle state |
| Event Emission | `signalLiveEmitter` | `signalBacktestEmitter` |

**Key Architectural Difference:**

Live monitoring prioritizes **reliability** and **real-time response**:
- Persistence after every tick for crash recovery
- Sleep intervals prevent API rate limiting
- Error recovery without stopping execution

Backtest monitoring prioritizes **speed** and **efficiency**:
- No persistence to avoid disk I/O overhead
- Timeframe skipping reduces redundant checks
- Fast-forward through signal duration with `backtest()` method

**Sources:** [src/lib/services/logic/private/LiveLogicPrivateService.ts:63-177](), [src/lib/services/logic/private/BacktestLogicPrivateService.ts:62-481]()
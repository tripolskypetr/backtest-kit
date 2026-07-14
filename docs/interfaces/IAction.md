---
title: docs/interface/IAction
group: docs
---

# IAction

Action interface for state manager integration.

Provides methods to handle all events emitted by connection services.
Each method corresponds to a specific event type emitted via .next() calls.

Use this interface to implement custom state management logic:
- Redux/Zustand action dispatchers
- Event logging systems
- Real-time monitoring dashboards
- Analytics and metrics collection

## Methods

### signal

```ts
signal: (event: IStrategyTickResult) => void | Promise<void>
```

Handles signal events from all modes (live + backtest).

Emitted by: StrategyConnectionService via signalEmitter
Source: StrategyConnectionService.tick() and StrategyConnectionService.backtest()
Frequency: Every tick/candle when strategy is evaluated

### signalLive

```ts
signalLive: (event: IStrategyTickResult) => void | Promise<void>
```

Handles signal events from live trading only.

Emitted by: StrategyConnectionService via signalLiveEmitter
Source: StrategyConnectionService.tick() when backtest=false
Frequency: Every tick in live mode

### signalBacktest

```ts
signalBacktest: (event: IStrategyTickResult) => void | Promise<void>
```

Handles signal events from backtest only.

Emitted by: StrategyConnectionService via signalBacktestEmitter
Source: StrategyConnectionService.backtest() when backtest=true
Frequency: Every candle in backtest mode

### breakevenAvailable

```ts
breakevenAvailable: (event: BreakevenContract) => void | Promise<void>
```

Handles breakeven events when stop-loss is moved to entry price.

Emitted by: BreakevenConnectionService via breakevenSubject
Source: COMMIT_BREAKEVEN_FN callback in BreakevenConnectionService
Frequency: Once per signal when breakeven threshold is reached

### partialProfitAvailable

```ts
partialProfitAvailable: (event: PartialProfitContract) => void | Promise<void>
```

Handles partial profit level events (10%, 20%, 30%, etc).

Emitted by: PartialConnectionService via partialProfitSubject
Source: COMMIT_PROFIT_FN callback in PartialConnectionService
Frequency: Once per profit level per signal (deduplicated)

### partialLossAvailable

```ts
partialLossAvailable: (event: PartialLossContract) => void | Promise<void>
```

Handles partial loss level events (-10%, -20%, -30%, etc).

Emitted by: PartialConnectionService via partialLossSubject
Source: COMMIT_LOSS_FN callback in PartialConnectionService
Frequency: Once per loss level per signal (deduplicated)

### pingScheduled

```ts
pingScheduled: (event: SchedulePingContract) => void | Promise<void>
```

Handles scheduled ping events during scheduled signal monitoring.

Emitted by: StrategyConnectionService via schedulePingSubject
Source: CREATE_COMMIT_SCHEDULE_PING_FN callback in StrategyConnectionService
Frequency: Every minute while scheduled signal is waiting for activation

### scheduleEvent

```ts
scheduleEvent: (event: ScheduleEventContract) => void | Promise<void>
```

Handles scheduled signal lifecycle events (creation / cancellation).

Emitted by: StrategyConnectionService via scheduleEventSubject
Source: CREATE_COMMIT_SCHEDULE_EVENT_FN callback in StrategyConnectionService
Frequency: Once when a scheduled signal is created ("scheduled") and once when it is
cancelled before activation ("cancelled": timeout / price_reject / user). The
scheduled -&gt; active transition is NOT reported here.

Manual wiring — EVENT-BASED: implement the user-facing callback {@link IActionCallbacks.onScheduleEvent} (via
`addActionSchema`) to drive the exchange (`commitActivateScheduled` / `commitCancelScheduled`).

### pendingEvent

```ts
pendingEvent: (event: SignalEventContract) => void | Promise<void>
```

Handles pending signal lifecycle events (open / close).

Emitted by: StrategyConnectionService via signalEventSubject
Source: CREATE_COMMIT_SIGNAL_EVENT_FN callback in StrategyConnectionService
Frequency: Once when a pending position is opened (action "opened") and once when it is
closed (action "closed" with closeReason take_profit / stop_loss / time_expired / closed).

Manual wiring — EVENT-BASED: implement the user-facing callback {@link IActionCallbacks.onPendingEvent} (via
`addActionSchema`) to drive the exchange; for per-tick fills use `onPingActive`.

### pingActive

```ts
pingActive: (event: ActivePingContract) => void | Promise<void>
```

Handles active ping events during active pending signal monitoring.

Emitted by: StrategyConnectionService via activePingSubject
Source: CREATE_COMMIT_ACTIVE_PING_FN callback in StrategyConnectionService
Frequency: Every minute while pending signal is active

### pingIdle

```ts
pingIdle: (event: IdlePingContract) => void | Promise<void>
```

Handles idle ping events when no signal is active.

Emitted by: StrategyConnectionService via idlePingSubject
Source: CREATE_COMMIT_IDLE_PING_FN callback in StrategyConnectionService
Frequency: Every tick while no signal is pending or scheduled

### riskRejection

```ts
riskRejection: (event: RiskContract) => void | Promise<void>
```

Handles risk rejection events when signals fail risk validation.

Emitted by: RiskConnectionService via riskSubject
Source: COMMIT_REJECTION_FN callback in RiskConnectionService
Frequency: Only when signal is rejected (not emitted for allowed signals)

### orderSync

```ts
orderSync: (event: OrderSyncContract) => void | Promise<void>
```

Called when framework attempts to open or close a position via limit order.
Throw to reject — framework will retry on next tick.

NOTE: Exceptions are NOT swallowed here — they propagate to CREATE_SYNC_FN.

MANUAL WIRING — EXCEPTION-BASED GATE: action-side equivalent of the Broker
`onOrderOpenCommit` / `onOrderCloseCommit`. Throw on "signal-open" → open rolls back to idle
(scheduled activation cancelled); throw on "signal-close" → close skipped, position stays open;
retried next tick. Same `syncSubject` emission as the Broker commit hooks (collapsed to false by
CREATE_SYNC_FN). Live-only. Implement via the {@link IActionCallbacks.onOrderSync} callback.

### orderCheck

```ts
orderCheck: (event: OrderCheckContract) => void | Promise<void>
```

Called on every live tick while a pending signal is monitored, BEFORE TP/SL/time evaluation,
to confirm the order is still pending (open) on the exchange.

Query the exchange by `event.signalId` and THROW ONLY when the order is NOT FOUND by that id
(filled, cancelled, or liquidated externally) — the framework then closes the position with
closeReason "closed".

CRITICAL: swallow transient/network errors (timeout, 5xx, rate limit, disconnect) — return
normally instead of throwing, otherwise a connectivity blip would wrongly close an open
position. Throw exclusively on a confirmed "order not found by id" result.

NOTE: Exceptions are NOT swallowed here — they propagate to CREATE_SYNC_PENDING_FN.

MANUAL WIRING — EXCEPTION-BASED GATE: action-side equivalent of the Broker `onOrderCheck`. A
throw on a confirmed "order not found by id" closes the position with closeReason "closed"
(retried via CREATE_SYNC_PENDING_FN). Throw-driven alternative to the imperative
`commitClosePending` (call it from `pingActive`) — pick one, not both. Live-only. Implement via
the {@link IActionCallbacks.onOrderCheck} callback.

### dispose

```ts
dispose: () => void | Promise<void>
```

Cleans up resources and subscriptions when action handler is no longer needed.

Called by: Connection services during shutdown
Use for: Unsubscribing from observables, closing connections, flushing buffers

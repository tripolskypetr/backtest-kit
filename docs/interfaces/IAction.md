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
Throw to reject (the return value is IGNORED).

NOTE: Exceptions are NOT swallowed here — they propagate to CREATE_SYNC_FN and resolve
into an IBrokerOrderVerdict: non-typed throw or OrderTransientError = "transient" (bounded retry — opens
identity-stably up to CC_ORDER_OPEN_RETRY_ATTEMPTS, closes up to
CC_ORDER_CLOSE_RETRY_ATTEMPTS with force-close on exhaustion); throw
OrderRejectedError = "rejected", terminal at once (open dropped / close force-closed).

MANUAL WIRING — EXCEPTION-BASED GATE: action-side equivalent of the Broker
`onOrderOpenCommit` / `onOrderCloseCommit`. Same `syncSubject` emission as the Broker
commit hooks — identical verdict semantics. `event.attempt` = prior STARTED attempts
(pre-armed into persistence before the gate fires, holds across a crash mid-attempt —
at attempt &gt; 0 reconcile with the exchange BEFORE re-sending). Live-only. Implement
via the {@link IActionCallbacks.onOrderSync} callback.

### orderCheck

```ts
orderCheck: (event: OrderCheckContract) => void | Promise<void>
```

Called on every live tick while a pending signal is monitored, BEFORE TP/SL/time evaluation,
to confirm the order is still pending (open) on the exchange.

NOTE: Exceptions are NOT swallowed here — they propagate to CREATE_SYNC_PENDING_FN and
resolve into an IBrokerOrderVerdict: non-typed throw or OrderTransientError = "transient" (tolerated, order
assumed still open, up to CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive failures — then the
terminal action fires); throw OrderDeletedError = "deleted", terminal AT ONCE, bypassing
the tolerance counter — the CONFIRMED "order not found by `event.signalId`" (filled,
cancelled, or liquidated externally). Terminal action: close with closeReason "closed"
(event.type "active") or cancel with reason "user" (event.type "schedule").
`event.attempt` = consecutive prior failed checks; a successful check resets it to 0.

MANUAL WIRING — EXCEPTION-BASED GATE: action-side equivalent of the Broker
`onOrderActiveCheck` / `onOrderScheduleCheck` — identical verdict semantics. Throw-driven
alternative to the imperative `commitClosePending` (call it from `pingActive`) — pick one,
not both. Live-only. Implement via the {@link IActionCallbacks.onOrderCheck} callback.

### dispose

```ts
dispose: () => void | Promise<void>
```

Cleans up resources and subscriptions when action handler is no longer needed.

Called by: Connection services during shutdown
Use for: Unsubscribing from observables, closing connections, flushing buffers

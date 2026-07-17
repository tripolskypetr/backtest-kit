---
title: docs/interface/IActionCallbacks
group: docs
---

# IActionCallbacks

Lifecycle and event callbacks for action handlers.

Provides hooks for initialization, disposal, and event handling.
All callbacks are optional and support both sync and async execution.

Use cases:
- Resource initialization (database connections, file handles)
- Resource cleanup (close connections, flush buffers)
- Event logging and monitoring
- State persistence

## Methods

### onInit

```ts
onInit: (actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when action handler is initialized.

Use for:
- Opening database connections
- Initializing external services
- Loading persisted state
- Setting up subscriptions

### onDispose

```ts
onDispose: (actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when action handler is disposed.

Use for:
- Closing database connections
- Flushing buffers
- Saving state to disk
- Unsubscribing from observables

### onSignal

```ts
onSignal: (event: IStrategyTickResult, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on signal events from all modes (live + backtest).

Triggered by: StrategyConnectionService via signalEmitter
Frequency: Every tick/candle when strategy is evaluated

### onSignalLive

```ts
onSignalLive: (event: IStrategyTickResult, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on signal events from live trading only.

Triggered by: StrategyConnectionService via signalLiveEmitter
Frequency: Every tick in live mode

### onSignalBacktest

```ts
onSignalBacktest: (event: IStrategyTickResult, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on signal events from backtest only.

Triggered by: StrategyConnectionService via signalBacktestEmitter
Frequency: Every candle in backtest mode

### onBreakevenAvailable

```ts
onBreakevenAvailable: (event: BreakevenContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when breakeven is triggered (stop-loss moved to entry price).

Triggered by: BreakevenConnectionService via breakevenSubject
Frequency: Once per signal when breakeven threshold is reached

### onPartialProfitAvailable

```ts
onPartialProfitAvailable: (event: PartialProfitContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when partial profit level is reached (10%, 20%, 30%, etc).

Triggered by: PartialConnectionService via partialProfitSubject
Frequency: Once per profit level per signal (deduplicated)

### onPartialLossAvailable

```ts
onPartialLossAvailable: (event: PartialLossContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when partial loss level is reached (-10%, -20%, -30%, etc).

Triggered by: PartialConnectionService via partialLossSubject
Frequency: Once per loss level per signal (deduplicated)

### onPingScheduled

```ts
onPingScheduled: (event: SchedulePingContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called during scheduled signal monitoring (every minute while waiting for activation).

Triggered by: StrategyConnectionService via schedulePingSubject
Frequency: Every minute while scheduled signal is waiting

### onScheduleEvent

```ts
onScheduleEvent: (event: ScheduleEventContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on scheduled signal lifecycle events (creation / cancellation).

Triggered by: StrategyConnectionService via scheduleEventSubject
Frequency: Once on creation (action "scheduled") and once on cancellation before activation
(action "cancelled": timeout / price_reject / user). The scheduled -&gt; active transition is
NOT reported here — activation surfaces as an "opened" signal instead.

Manual wiring — EVENT-BASED (driving the exchange from an action registered via `addActionSchema`)

An action is the alternative to a Broker adapter for binding the framework to a real exchange:
both run inside the strategy tick, so the commit-functions from `src/function/strategy.ts` are
callable here and take effect on the next tick. On `event.action === "scheduled"` place the real
resting/limit order (tag it with `event.data.id`) and, if it resolves at once, call
`commitActivateScheduled(event.symbol, { id })`; on a reject call
`commitCancelScheduled(event.symbol, { id })`. On `event.action === "cancelled"` (the strategy has
already dropped the scheduled signal) cancel the matching exchange order; `event.reason` says why.
For ongoing polling of the resting order use `onPingScheduled` (every tick).

### onPendingEvent

```ts
onPendingEvent: (event: SignalEventContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on pending signal lifecycle events (open / close).

Triggered by: StrategyConnectionService via signalEventSubject
Frequency: Once when a pending position is opened (action "opened": new signal / immediate /
scheduled or user activation) and once when it is closed (action "closed" with closeReason
take_profit / stop_loss / time_expired / closed).

Manual wiring — EVENT-BASED (driving the exchange from an action registered via `addActionSchema`)

Alternative to a Broker adapter — the commit-functions from `src/function/strategy.ts` are
callable here (same tick context) and apply on the next tick. On `event.action === "opened"`
place the real entry + protective TP/SL orders; on `event.action === "closed"` (the strategy has
already removed the signal) flatten the real position and cancel leftover orders.

Note: `onPendingEvent` fires only at open/close — it is NOT a per-tick monitor. To translate
intra-position exchange fills into `commitCreateTakeProfit` / `commitCreateStopLoss` /
`commitClosePending` on every tick, use `onPingActive` (fires each tick while the position is open).

### onPingActive

```ts
onPingActive: (event: ActivePingContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called during active pending signal monitoring (every minute while position is active).

Triggered by: StrategyConnectionService via activePingSubject
Frequency: Every minute while pending signal is active

### onPingIdle

```ts
onPingIdle: (event: IdlePingContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called every tick when no signal is active (idle state).

Triggered by: StrategyConnectionService via idlePingSubject
Frequency: Every tick while no signal is pending or scheduled

### onRiskRejection

```ts
onRiskRejection: (event: RiskContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when signal is rejected by risk management.

Triggered by: RiskConnectionService via riskSubject
Frequency: Only when signal fails risk validation (not emitted for allowed signals)

### onOrderSync

```ts
onOrderSync: (event: OrderSyncContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called when framework attempts to open or close a position via limit order.
THROW to reject the operation — the return value is IGNORED (only a throw gates).

NOTE: Unlike other callbacks, exceptions from this method are NOT swallowed.
They propagate up to CREATE_SYNC_FN which resolves them into an
IBrokerOrderVerdict (see interfaces/Broker.interface):
- non-typed throw (or explicit OrderTransientError) → "transient": the open retries identity-stably (same signalId,
  `event.attempt` incremented) up to CC_ORDER_OPEN_RETRY_ATTEMPTS, then is dropped;
  the close retries up to CC_ORDER_CLOSE_RETRY_ATTEMPTS, then the engine
  FORCE-CLOSES its state with the original closeReason (loud errorEmitter);
- throw OrderRejectedError → "rejected", TERMINAL: the open is dropped at once
  without arming the retry; the close is force-closed at once.

MANUAL WIRING — EXCEPTION-BASED GATE: the action-side equivalent of the Broker
`onOrderOpenCommit` / `onOrderCloseCommit` gate. Rides the same `syncSubject` emission
as the Broker commit hooks — the verdict semantics are identical for both channels.
`event.attempt` carries the number of prior STARTED attempts (0 = first try). The
counter is PRE-ARMED — persisted before the gate fires — so `attempt &gt; 0` holds even
across a crash mid-attempt: a prior order MAY have reached the exchange, reconcile by
clientOrderId (open) / position state (close) BEFORE re-sending. Do NOT rely on
catching "duplicate" on re-send — Binance's duplicate-clientOrderId guard only covers
OPEN orders; an instantly-filled one will not dup.
Backtest short-circuits the gate to "confirmed" (live-only).

### onOrderCheck

```ts
onOrderCheck: (event: OrderCheckContract, actionName: string, strategyName: string, frameName: string, backtest: boolean) => void | Promise<void>
```

Called on every live tick while a pending signal is monitored, BEFORE TP/SL/time evaluation,
to confirm the order is still pending (open) on the exchange.

Fires for both monitored states, discriminated by `event.type`: "active" — pending signal
(open position); "schedule" — scheduled signal (resting entry order awaiting activation).

Exceptions are NOT swallowed — they propagate up to CREATE_SYNC_PENDING_FN which resolves
them into an IBrokerOrderVerdict (see interfaces/Broker.interface):
- non-typed throw (or explicit OrderTransientError) → "transient": the failed check is TOLERATED (order assumed still open,
  monitoring continues, `event.attempt` incremented) up to CC_ORDER_CHECK_RETRY_ATTEMPTS
  consecutive failures; exhaustion acts terminally — close with closeReason "closed"
  (type "active") / cancel with reason "user" (type "schedule"). A network blip no longer
  kills a live position on the spot;
- throw OrderDeletedError → "deleted", TERMINAL at once, bypassing the tolerance counter —
  the adapter's CONFIRMED "order not found by id" (filled, cancelled, or liquidated
  externally; e.g. the user deleted the order manually).
A successful check resets `event.attempt` to 0.

MANUAL WIRING — EXCEPTION-BASED GATE: the action-side equivalent of the Broker
`onOrderActiveCheck` / `onOrderScheduleCheck` — the verdict semantics are identical for both
channels. Throw-driven alternative to the imperative `commitClosePending` (call it from
`pingActive` instead) — pick one, not both, for the same "order gone" condition.
Backtest short-circuits the gate (live-only).

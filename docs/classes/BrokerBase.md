---
title: docs/class/BrokerBase
group: docs
---

# BrokerBase

Implements `IBroker`

Base class for custom broker adapter implementations.

Provides default no-op implementations for all IBroker methods that log events.
Extend this class to implement a real exchange adapter for:
- Placing and canceling limit/market orders
- Updating stop-loss and take-profit levels on exchange
- Tracking position state in an external system
- Sending trade notifications (Telegram, Discord, Email)
- Recording trades to a database or analytics service

Key features:
- All methods have default implementations (no need to override unused methods)
- Automatic logging of all events via bt.loggerService
- Implements the full IBroker interface
- `makeExtendable` applied for correct subclass instantiation

Lifecycle:
1. Constructor called (no arguments)
2. `waitForInit()` called once for async initialization (e.g. exchange login)
3. Event methods called as strategy executes
4. No explicit dispose — clean up in `waitForInit` teardown or externally

Event flow (called only in live mode, skipped in backtest):
- `onOrderOpenCommit` — new position opened
- `onOrderCloseCommit` — position closed (SL/TP hit or manual close)
- `onPartialProfitCommit` — partial close at profit executed
- `onPartialLossCommit` — partial close at loss executed
- `onTrailingStopCommit` — trailing stop-loss updated
- `onTrailingTakeCommit` — trailing take-profit updated
- `onBreakevenCommit` — stop-loss moved to entry price
- `onAverageBuyCommit` — new DCA entry added to position

## Constructor

```ts
constructor();
```

## Methods

### waitForInit

```ts
waitForInit(): Promise<void>;
```

Performs async initialization before the broker starts receiving events.

Called once by BrokerProxy via `waitForInit()` (singleshot) before the first event.
Override to establish exchange connections, authenticate API clients, load configuration.

RECOMMENDED: run an ORPHAN SWEEP here (see {@link IBroker.waitForInit}). A prior
run that died on transient-budget exhaustion may have left a filled-but-unconfirmed
entry order (the engine dropped the signal) or a real position the engine already
force-closed. Reconcile before the first tick: cancel/flatten orphans, or re-adopt
a live position via `commitCreateSignal` to bring it back under TP/SL management —
otherwise a fresh signal may open ON TOP of an unmanaged orphan.

TIMING CAVEATS for re-adoption: `waitForInit` is LAZY (awaited before the first
proxied hook call, not at `enable()`) — when the strategy trades on its first tick,
the sweep runs INSIDE the open gate with the retry slot already pre-armed, and
`commitCreateSignal` throws "a rejected open is awaiting retry". An idle tick is
no guarantee either: rejected opens and rejected user-close drains also emit idle
pings while state is live. Check `getStrategyStatus` and adopt ONLY when
`pendingSignalId` / `retryOpenSignal` / `closedSignal` / `createdSignal` are all
clear; otherwise limit the sweep to exchange-side cleanup.

Default implementation: Logs initialization event.

### onOrderOpenCommit

```ts
onOrderOpenCommit(payload: BrokerOrderOpenPayload): Promise<void>;
```

Called when a position is being opened (signal activated).

Triggered automatically via syncSubject when a scheduled signal's priceOpen is hit.
Use to place the actual entry order on the exchange.

Default implementation: Logs signal-open event.

Manual wiring — EXCEPTION-BASED GATE: emitted BEFORE the framework mutates state.
Throw semantics: a plain Error / OrderTransientError rolls back the open and retries
identity-stably (same signalId, `payload.attempt` increments, pre-armed so a crash
mid-attempt still counts) up to CC_ORDER_OPEN_RETRY_ATTEMPTS; OrderRejectedError
drops the open terminally without arming the retry. Return normally to let it open.
Tag orders with `clientOrderId = payload.signalId` and RECONCILE at `attempt &gt; 0`
(query the prior order BEFORE re-sending — Binance's duplicate guard does not cover
instantly-filled orders). Live-only (backtest short-circuits). See
{@link IBroker.onOrderOpenCommit} for the full semantics.

### onOrderActiveCheck

```ts
onOrderActiveCheck(payload: BrokerOrderCheckPayload): Promise<void>;
```

Called on every live tick while a pending signal (open position) is monitored, BEFORE
TP/SL/time evaluation.

Override to query the exchange for the order by `payload.signalId`. The default
implementation logs and returns normally, which keeps the position under normal TP/SL
monitoring. Throw semantics: OrderDeletedError = confirmed "order not found by id"
(filled, cancelled, or liquidated externally) — the framework closes the position with
closeReason "closed" at once; a plain Error / OrderTransientError (timeout, 5xx, rate
limit, disconnect) is TOLERATED as a transient failure up to
CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive times (`payload.attempt` increments, a
successful check resets it) before the framework acts terminally — a connectivity blip
no longer closes a live position on the spot.

Manual wiring — EXCEPTION-BASED VARIANT: the throw-driven alternative to the imperative
commit-function wiring in `onSignalActivePing`. See {@link IBroker.onOrderActiveCheck} for the
full comparison and example.

### onOrderScheduleCheck

```ts
onOrderScheduleCheck(payload: BrokerOrderCheckPayload): Promise<void>;
```

Called on every live tick while a scheduled signal (resting entry order) is monitored, BEFORE
timeout/price-activation evaluation.

Override to query the exchange for the resting order by `payload.signalId`. The default
implementation logs and returns normally. Throw semantics: OrderDeletedError =
confirmed "order not found by id" — the framework cancels the scheduled signal with
reason "user" at once (a FILLED resting order must be confirmed via
`commitActivateScheduled`, not by throwing); a plain Error / OrderTransientError
(timeout, 5xx, rate limit, disconnect) is TOLERATED as a transient failure up to
CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive times (`payload.attempt` increments, a
successful check resets it) before the framework acts terminally.

Manual wiring — EXCEPTION-BASED VARIANT: the throw-driven alternative to the imperative
commit-function wiring in `onSignalSchedulePing`. See {@link IBroker.onOrderScheduleCheck} for
the full comparison and example.

### onSignalActivePing

```ts
onSignalActivePing(payload: BrokerActivePingPayload): Promise<void>;
```

Called on every live tick while a pending (open) signal is monitored.

Purely informational mirror of the active-ping lifecycle — unlike `onOrderActiveCheck`, a throw here
does NOT close the position. Override to mirror live monitoring state into your own systems.
The default implementation logs.

Manual wiring — EVENT-BASED: this is the primary per-tick hook to drive an open position from real exchange
state (`commitCreateTakeProfit` / `commitCreateStopLoss` / `commitClosePending`). See the
{@link IBroker.onSignalActivePing} contract docs for the full guidance and example.

### onSignalSchedulePing

```ts
onSignalSchedulePing(payload: BrokerSchedulePingPayload): Promise<void>;
```

Called on every live tick while a scheduled signal is monitored (waiting for priceOpen).

Purely informational. Override to mirror scheduled-monitoring state. The default logs.

Manual wiring — EVENT-BASED: per-tick hook to drive a scheduled (resting) order from real exchange state
(`commitActivateScheduled` / `commitCancelScheduled`). See {@link IBroker.onSignalSchedulePing}
for full guidance and example.

### onSignalIdlePing

```ts
onSignalIdlePing(payload: BrokerIdlePingPayload): Promise<void>;
```

Called on every live tick while the strategy is idle (no pending or scheduled signal).

Purely informational. Override to track idle heartbeats. The default logs.

### onSignalScheduleOpen

```ts
onSignalScheduleOpen(payload: BrokerScheduleOpenPayload): Promise<void>;
```

Called when a new scheduled signal is created and starts waiting for priceOpen activation.

The scheduled -&gt; active transition is reported via `onOrderOpenCommit`, not here. Override to
place a resting/limit order on the exchange. The default logs.

Manual wiring — EVENT-BASED: fires ONCE at creation — place the real resting order (tag it with
`payload.signalId`) and optionally `commitActivateScheduled` / `commitCancelScheduled`. See
{@link IBroker.onSignalScheduleOpen} for full guidance and example.

### onSignalScheduleCancelled

```ts
onSignalScheduleCancelled(payload: BrokerScheduleCancelledPayload): Promise<void>;
```

Called when a scheduled signal is cancelled before activation (timeout / price_reject / user).

Override to cancel the resting/limit order on the exchange. The default logs.

Manual wiring — EVENT-BASED (outbound): the strategy already dropped the scheduled signal — cancel the matching
exchange order by `payload.signalId`. See {@link IBroker.onSignalScheduleCancelled}.

### onSignalPendingOpen

```ts
onSignalPendingOpen(payload: BrokerPendingOpenPayload): Promise<void>;
```

Called when a pending position is opened (new signal / immediate / scheduled or user activation).

Informational lifecycle hook. Override to mirror the open into your own systems. The default logs.

Manual wiring — EVENT-BASED: fires ONCE at open — place entry + protective TP/SL orders (tag with
`payload.signalId`), then drive per-tick from `onSignalActivePing`. See
{@link IBroker.onSignalPendingOpen}.

### onSignalPendingClose

```ts
onSignalPendingClose(payload: BrokerPendingClosePayload): Promise<void>;
```

Called when a pending position is closed (take_profit / stop_loss / time_expired / closed).

Informational lifecycle hook. Override to mirror the close into your own systems. The default logs.

Manual wiring — EVENT-BASED (outbound): the strategy already removed the pending signal — flatten the real
position and cancel leftover TP/SL orders by `payload.signalId`. See
{@link IBroker.onSignalPendingClose}.

### onOrderCloseCommit

```ts
onOrderCloseCommit(payload: BrokerOrderClosePayload): Promise<void>;
```

Called when a position is being closed (SL/TP hit or manual close).

Triggered automatically via syncSubject when a pending signal is closed.
Use to place the exit order and record final PnL.

Default implementation: Logs signal-close event.

Manual wiring — EXCEPTION-BASED GATE: emitted BEFORE the framework mutates state.
Throw semantics: a plain Error / OrderTransientError SKIPS the close — the position
stays open and the close retries next tick (`payload.attempt` increments) up to
CC_ORDER_CLOSE_RETRY_ATTEMPTS, then the engine force-closes its state with the
original closeReason; OrderRejectedError force-closes terminally at once. Return
normally to let it close. Live-only (backtest short-circuits). See
{@link IBroker.onOrderCloseCommit} for the full semantics.

### onPartialProfitCommit

```ts
onPartialProfitCommit(payload: BrokerPartialProfitPayload): Promise<void>;
```

Called when a partial close at profit is executed.

Triggered explicitly from strategy.ts / Live.ts / Backtest.ts after all validations pass,
before `strategyCoreService.partialProfit()`. If this method throws, the DI mutation is skipped.
Use to partially close the position on the exchange at the profit level.

Default implementation: Logs partial profit event.

### onPartialLossCommit

```ts
onPartialLossCommit(payload: BrokerPartialLossPayload): Promise<void>;
```

Called when a partial close at loss is executed.

Triggered explicitly from strategy.ts / Live.ts / Backtest.ts after all validations pass,
before `strategyCoreService.partialLoss()`. If this method throws, the DI mutation is skipped.
Use to partially close the position on the exchange at the loss level.

Default implementation: Logs partial loss event.

### onTrailingStopCommit

```ts
onTrailingStopCommit(payload: BrokerTrailingStopPayload): Promise<void>;
```

Called when the trailing stop-loss level is updated.

Triggered explicitly after all validations pass, before `strategyCoreService.trailingStop()`.
`newStopLossPrice` is the absolute SL price — use it to update the exchange order directly.

Default implementation: Logs trailing stop event.

### onTrailingTakeCommit

```ts
onTrailingTakeCommit(payload: BrokerTrailingTakePayload): Promise<void>;
```

Called when the trailing take-profit level is updated.

Triggered explicitly after all validations pass, before `strategyCoreService.trailingTake()`.
`newTakeProfitPrice` is the absolute TP price — use it to update the exchange order directly.

Default implementation: Logs trailing take event.

### onBreakevenCommit

```ts
onBreakevenCommit(payload: BrokerBreakevenPayload): Promise<void>;
```

Called when the stop-loss is moved to breakeven (entry price).

Triggered explicitly after all validations pass, before `strategyCoreService.breakeven()`.
`newStopLossPrice` equals `effectivePriceOpen` — the position's effective entry price.
`newTakeProfitPrice` is unchanged by breakeven.

Default implementation: Logs breakeven event.

### onAverageBuyCommit

```ts
onAverageBuyCommit(payload: BrokerAverageBuyPayload): Promise<void>;
```

Called when a new DCA entry is added to the active position.

Triggered explicitly after all validations pass, before `strategyCoreService.averageBuy()`.
`currentPrice` is the market price at which the new averaging entry is placed.
`cost` is the dollar amount of the new DCA entry.

Default implementation: Logs average buy event.

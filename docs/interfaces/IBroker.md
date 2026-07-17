---
title: docs/interface/IBroker
group: docs
---

# IBroker

Broker adapter interface for live order execution.

Implement this interface to connect the framework to a real exchange or broker.
All methods are called BEFORE the corresponding DI-core state mutation, so if any
method throws, the internal state remains unchanged (transaction semantics).

In backtest mode all calls are silently skipped by BrokerAdapter — the adapter
never receives backtest traffic.

## Methods

### waitForInit

```ts
waitForInit: () => Promise<void>
```

Called once before first use. Connect to exchange, load credentials, etc.

RECOMMENDED: run an ORPHAN SWEEP here. After a fatal exit (transient-budget
exhaustion — see OrderTransientError) the exchange may hold artifacts the engine
has already forgotten: a FILLED entry order under `clientOrderId = signalId`
whose open was never confirmed (dropped signal), or a still-open position the
engine force-closed on its side. `waitForInit` runs before the first event of a
fresh process — the one moment to reconcile: list open orders/positions, match
clientOrderIds against the engine state (`getStrategyStatus` / `getPendingSignal`),
then either flatten the orphans on the exchange or re-adopt a live position via
`commitCreateSignal` so it comes back under TP/SL management. Skipping the sweep
risks trading a fresh signal ON TOP of an unmanaged orphan position.

### onOrderCloseCommit

```ts
onOrderCloseCommit: (payload: BrokerOrderClosePayload) => Promise<void>
```

Called when a signal is being closed (take-profit, stop-loss, or manual close). Emitted via
syncSubject BEFORE the framework mutates strategy state, so it is also the close **gate**.

MANUAL WIRING — EXCEPTION-BASED: place the real exit order here (tag/look up by `payload.signalId`)
and record final PnL. Return normally to let the close proceed. THROW semantics
(resolved into IBrokerOrderVerdict):
- plain Error or OrderTransientError ("the network/exchange failed temporarily") →
  "transient": the close is SKIPPED, the position stays open and the close retries on
  the next tick with `payload.attempt` incremented, up to CC_ORDER_CLOSE_RETRY_ATTEMPTS
  consecutive rejections. On exhaustion the engine FORCE-CLOSES its own state with the
  ORIGINAL closeReason and signals a fatal exit (exitEmitter) — the real exchange
  position must then be reconciled by the adapter/operator (the close lifecycle event
  still reaches `onSignalPendingClose`). With the config at 0 the cap is disabled and
  a rejected close retries forever (legacy).
- OrderRejectedError ("no counterparty, retrying is pointless") → "rejected",
  TERMINAL: the engine force-closes immediately, bypassing the retry counter. No fatal
  exit (business outcome, not a network failure).
- OrderDeletedError here is a userspace protocol violation (it belongs to the check
  hooks) and intentionally degrades to "transient".
Backtest short-circuits this (no live exchange), so the gate is live-only.

This differs from `onSignalPendingClose`, which is the informational lifecycle hook that fires
AFTER the close is committed (and cannot veto it).

### onOrderOpenCommit

```ts
onOrderOpenCommit: (payload: BrokerOrderOpenPayload) => Promise<void>
```

Called when an order is being opened. Emitted via syncSubject BEFORE the framework mutates
strategy state, so it is also the open **gate**. Discriminated by `payload.type`:
- "active" — position entry (immediate open or activation fill of the resting order);
- "schedule" — PLACEMENT of the resting entry order at scheduled-signal creation.

MANUAL WIRING — EXCEPTION-BASED: place the real order here (tag the exchange order with
`clientOrderId = payload.signalId` so later `onOrderActiveCheck` / `onOrderScheduleCheck` /
`onSignalActivePing` can find it). Return normally to let the open proceed. THROW
semantics (resolved into IBrokerOrderVerdict):
- plain Error or OrderTransientError ("the network/exchange failed temporarily, outcome
  unknown") → "transient": the framework ROLLS BACK (type "active": pending returns to
  idle; type "schedule": scheduled not registered, risk reservation released) and
  retries IDENTITY-STABLY — the SAME signal row with the SAME signalId is re-submitted
  on the next tick with `payload.attempt` incremented, up to
  CC_ORDER_OPEN_RETRY_ATTEMPTS. The attempt is PRE-ARMED (persisted before this hook
  runs), so even a crash mid-attempt resumes with `attempt &gt;= 1`. Because the id is
  stable, the adapter MUST reconcile at `attempt &gt; 0`: query the prior order by
  clientOrderId BEFORE re-sending and confirm the open if it filled. Do NOT rely on
  catching a "duplicate" error on re-send — on Binance the duplicate-clientOrderId
  guard only covers OPEN orders, an instantly-filled market order will not dup.
  Exhaustion drops the signal and signals a fatal exit (exitEmitter).
  With the config at 0 the retry slot is disabled: the next tick regenerates a FRESH id.
- OrderRejectedError ("the exchange definitively refused, retrying is pointless") →
  "rejected", TERMINAL: the open is dropped at once, no retry armed, an already-armed
  retry for this id is wiped. No fatal exit (business outcome).
- OrderDeletedError here is a userspace protocol violation (it belongs to the check
  hooks) and intentionally degrades to "transient".
Backtest short-circuits this, so the gate is live-only.

This differs from `onSignalPendingOpen`, which is the informational lifecycle hook that fires
AFTER the open is committed (and cannot veto it).

### onOrderActiveCheck

```ts
onOrderActiveCheck: (payload: BrokerOrderCheckPayload) => Promise<void>
```

Called on every live tick while a pending signal (open position) is monitored,
BEFORE TP/SL/time evaluation (`payload.type` is always "active").

Query the exchange by `payload.signalId`. Return normally to keep monitoring.
THROW semantics (resolved into IBrokerOrderVerdict):
- OrderDeletedError — the CONFIRMED "order not found by id": the framework closes the
  position with closeReason "closed" AT ONCE, bypassing the tolerance counter.
- plain Error or OrderTransientError (timeout, 5xx, rate limit, disconnect) →
  "transient": the failed check is TOLERATED — the order is assumed still open,
  monitoring continues and the next ping carries `payload.attempt` incremented, up to
  CC_ORDER_CHECK_RETRY_ATTEMPTS CONSECUTIVE failures (a successful check resets the
  streak to 0). A connectivity blip no longer closes a live position on the spot.
  Exhaustion acts terminally (close "closed") and signals a fatal exit (exitEmitter).
  With the config at 0 any failure is terminal immediately (legacy).
- OrderRejectedError here is a userspace protocol violation (it belongs to the
  open/close gates) and intentionally degrades to "transient".

Manual wiring — EXCEPTION-BASED VARIANT

This is the throw-driven **alternative** to the imperative commit-function wiring in
`onSignalActivePing`:
- **Exception-based (here):** THROW → framework closes the position with closeReason "closed".
  One binary gate, no reason distinction. Good when "order gone" is the only condition you handle.
- **Imperative (`onSignalActivePing` + `src/function/strategy.ts`):** call
  `commitClosePending` / `commitCreateTakeProfit` / `commitCreateStopLoss` to close with the
  correct reason and handle TP vs SL vs no-counterparty separately.

Pick ONE per condition — do not both throw here AND `commitClosePending` in the active-ping for
the same "order gone" event.

### onOrderScheduleCheck

```ts
onOrderScheduleCheck: (payload: BrokerOrderCheckPayload) => Promise<void>
```

Called on every live tick while a scheduled signal (resting entry order) is monitored,
BEFORE timeout/price-activation evaluation (`payload.type` is always "schedule").

Query the exchange by `payload.signalId`. Return normally to keep monitoring.
THROW semantics (resolved into IBrokerOrderVerdict):
- OrderDeletedError — the CONFIRMED "resting order not found by id": the framework
  cancels the scheduled signal with reason "user" AT ONCE, bypassing the tolerance
  counter. A FILLED resting order is NOT a deleted order — confirm the fill via
  `commitActivateScheduled` instead (a throw here is a terminal cancel, not an
  activation).
- plain Error or OrderTransientError (timeout, 5xx, rate limit, disconnect) →
  "transient": the failed check is TOLERATED — the resting order is assumed still
  open, the next ping carries `payload.attempt` incremented, up to
  CC_ORDER_CHECK_RETRY_ATTEMPTS CONSECUTIVE failures (a successful check resets the
  streak). Exhaustion cancels the scheduled signal (reason "user") and signals a fatal
  exit (exitEmitter). With the config at 0 any failure is terminal immediately (legacy).
- OrderRejectedError here is a userspace protocol violation (it belongs to the
  open/close gates) and intentionally degrades to "transient".

Manual wiring — EXCEPTION-BASED VARIANT: the throw-driven alternative to the imperative
commit-function wiring in `onSignalSchedulePing` (`commitActivateScheduled` /
`commitCancelScheduled`). Pick ONE per condition.

### onSignalActivePing

```ts
onSignalActivePing: (payload: BrokerActivePingPayload) => Promise<void>
```

Called on every live tick while a pending (open) signal is monitored.
Purely informational mirror of the active-ping lifecycle — a throw here does NOT close the
position (unlike `onOrderActiveCheck`).

Manual wiring — EVENT-BASED (driving an open position from real exchange state)

Primary per-tick **event-based** hook for an open position (a throw does NOT close it — react to
the event and decide imperatively). This is where you reconcile the framework's VWAP view with
real fills: catch a **SL that gapped through** the level, or a **TP that filled before VWAP**
reached it. Poll your real order and translate its state into strategy state via the
commit-functions from `src/function/strategy.ts` (callable here because the ping is emitted inside
the strategy tick; effects are deferred to the next tick):
- `commitCreateTakeProfit(symbol, { id })` — real TP order filled (possibly before VWAP reached
  the level) → force close, reason "take_profit".
- `commitCreateStopLoss(symbol, { id })` — real SL order filled (e.g. price gapped through SL) →
  force close, reason "stop_loss".
- `commitClosePending(symbol, { id })` — no counterparty (no buyer/seller, liquidity gap) → close
  now with reason "closed", instead of throwing.

### onSignalSchedulePing

```ts
onSignalSchedulePing: (payload: BrokerSchedulePingPayload) => Promise<void>
```

Called on every live tick while a scheduled signal is monitored (waiting for priceOpen
activation). Purely informational.

Manual wiring — EVENT-BASED (driving the scheduled phase from real exchange state)

Per-tick **event-based** hook (a throw does NOT veto anything — react and decide imperatively).
Poll your real resting/limit order and translate it via the commit-functions from
`src/function/strategy.ts` (deferred to the next tick):
- `commitActivateScheduled(symbol, { id })` — resting order filled/resolved → activate now,
  without waiting for VWAP to reach priceOpen (surfaces as `onOrderOpenCommit` next tick).
- `commitCancelScheduled(symbol, { id })` — resting order cancelled/rejected externally → drop it.

### onSignalIdlePing

```ts
onSignalIdlePing: (payload: BrokerIdlePingPayload) => Promise<void>
```

Called on every live tick while the strategy is idle (no pending or scheduled signal).
Purely informational.

MANUAL WIRING — EVENT-BASED: no signal is active, so there is nothing to commit; use it for idle
heartbeats / housekeeping. A throw does not affect strategy state.

### onSignalScheduleOpen

```ts
onSignalScheduleOpen: (payload: BrokerScheduleOpenPayload) => Promise<void>
```

Called when a new scheduled signal is created and starts waiting for priceOpen activation.
The scheduled -&gt; active transition is reported via `onOrderOpenCommit`, not here.

Manual wiring — EVENT-BASED (placing the resting order)

Fires ONCE at creation — place the real resting/limit order (tag it with `payload.signalId` so
`onSignalSchedulePing` can poll it later). If it resolves immediately, promote it with
`commitActivateScheduled(symbol, { id })`; if rejected, drop it with
`commitCancelScheduled(symbol, { id })`. Use `onSignalSchedulePing` for ongoing polling.

### onSignalScheduleCancelled

```ts
onSignalScheduleCancelled: (payload: BrokerScheduleCancelledPayload) => Promise<void>
```

Called when a scheduled signal is cancelled before it ever activated
(reason: timeout / price_reject / user).

Manual wiring — EVENT-BASED (tearing down the resting order)

Outbound side — the framework has already dropped the scheduled signal, so there is nothing to
`commitCancelScheduled` here; instead cancel the real resting order you placed in
`onSignalScheduleOpen` (look it up by `payload.signalId`). `payload.reason` tells you why.

### onSignalPendingOpen

```ts
onSignalPendingOpen: (payload: BrokerPendingOpenPayload) => Promise<void>
```

Called when a pending position is opened (new signal / immediate / scheduled or user
activation). Purely informational lifecycle hook for the active phase of a signal.

Manual wiring — EVENT-BASED (placing entry + protective orders)

Fires ONCE at open — place the real entry confirmation and protective TP/SL orders (tag them with
`payload.signalId`). Drive the rest per-tick from `onSignalActivePing`. This hook does not gate
the position; for a true entry gate use `onOrderSync` (signal-open).

### onSignalPendingClose

```ts
onSignalPendingClose: (payload: BrokerPendingClosePayload) => Promise<void>
```

Called when a pending position is closed
(reason: take_profit / stop_loss / time_expired / closed).

Manual wiring — EVENT-BASED (tearing down the position)

Outbound side — the framework has already removed the pending signal, so there is nothing to
`commitClosePending` here; instead flatten the real position and cancel leftover TP/SL orders by
`payload.signalId`, and record final PnL. `payload.closeReason` says which path closed it. If you
need to FORCE the close yourself (e.g. no counterparty), do it earlier in `onSignalActivePing`.

### onPartialProfitCommit

```ts
onPartialProfitCommit: (payload: BrokerPartialProfitPayload) => Promise<void>
```

Called when a partial profit close is committed.

### onPartialLossCommit

```ts
onPartialLossCommit: (payload: BrokerPartialLossPayload) => Promise<void>
```

Called when a partial loss close is committed.

### onTrailingStopCommit

```ts
onTrailingStopCommit: (payload: BrokerTrailingStopPayload) => Promise<void>
```

Called when a trailing stop update is committed.

### onTrailingTakeCommit

```ts
onTrailingTakeCommit: (payload: BrokerTrailingTakePayload) => Promise<void>
```

Called when a trailing take-profit update is committed.

### onBreakevenCommit

```ts
onBreakevenCommit: (payload: BrokerBreakevenPayload) => Promise<void>
```

Called when a breakeven stop is committed (stop loss moved to entry price).

### onAverageBuyCommit

```ts
onAverageBuyCommit: (payload: BrokerAverageBuyPayload) => Promise<void>
```

Called when a DCA (average-buy) entry is committed.

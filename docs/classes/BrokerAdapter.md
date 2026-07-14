---
title: docs/class/BrokerAdapter
group: docs
---

# BrokerAdapter

Facade for broker integration — intercepts all commit* operations before DI-core mutations.

Acts as a transaction control point: if any commit* method throws, the DI-core mutation
is never reached and the state remains unchanged.

In backtest mode all commit* calls are silently skipped (payload.backtest === true).
In live mode the call is forwarded to the registered IBroker adapter via BrokerProxy.

signal-open and signal-close events are routed automatically via syncSubject subscription
(activated on `enable()`). All other commit* methods are called explicitly from
Live.ts / Backtest.ts / strategy.ts before the corresponding strategyCoreService call.

## Constructor

```ts
constructor();
```

## Properties

### _brokerFactory

```ts
_brokerFactory: any
```

Factory producing the active `BrokerProxy` instance

### getInstance

```ts
getInstance: any
```

Lazily constructs the `BrokerProxy` from the registered factory and
memoizes the result via `singleshot`.

The proxy is built on the first call and cached for all subsequent calls.
Returns `null` when no adapter has been registered via `useBrokerAdapter()`.

Reset via `clear()` so the next call rebuilds from the current factory
(e.g. when `process.cwd()` changes between strategy iterations).

### commitOrderOpen

```ts
commitOrderOpen: (payload: BrokerOrderOpenPayload) => Promise<void>
```

Forwards a signal-open event to the registered broker adapter.

Called automatically via syncSubject when `enable()` is active.
Skipped silently in backtest mode or when no adapter is registered.

### commitOrderClose

```ts
commitOrderClose: (payload: BrokerOrderClosePayload) => Promise<void>
```

Forwards a signal-close event to the registered broker adapter.

Called automatically via syncSubject when `enable()` is active.
Skipped silently in backtest mode or when no adapter is registered.

### commitOrderCheck

```ts
commitOrderCheck: (payload: BrokerOrderCheckPayload) => Promise<void>
```

Forwards an order ping to the registered broker adapter.

Called automatically via syncPendingSubject when `enable()` is active, on every live tick
while a pending signal (payload.type "active") or a scheduled signal (payload.type
"schedule") is monitored — routed to `onOrderActiveCheck` / `onOrderScheduleCheck`
respectively. Skipped silently in backtest mode or when no adapter is registered.
Exceptions are NOT swallowed: a throw from the adapter propagates up to
syncPendingSubject.next() → CREATE_SYNC_PENDING_FN, which closes the position with "closed"
(type "active") or cancels the scheduled signal with reason "user" (type "schedule").

### commitActivePing

```ts
commitActivePing: (payload: BrokerActivePingPayload) => Promise<void>
```

Forwards an active-ping to the registered broker adapter.

Called automatically via activePingSubject when `enable()` is active, on every live tick while a
pending signal is monitored. Skipped silently in backtest mode or when no adapter is registered.
Purely informational — a throw does NOT close the position.

### commitSchedulePing

```ts
commitSchedulePing: (payload: BrokerSchedulePingPayload) => Promise<void>
```

Forwards a schedule-ping to the registered broker adapter.

Called automatically via schedulePingSubject when `enable()` is active, on every live tick while
a scheduled signal is monitored. Skipped silently in backtest mode or when no adapter is
registered. Purely informational.

### commitIdlePing

```ts
commitIdlePing: (payload: BrokerIdlePingPayload) => Promise<void>
```

Forwards an idle-ping to the registered broker adapter.

Called automatically via idlePingSubject when `enable()` is active, on every live tick while the
strategy has no pending or scheduled signal. Skipped silently in backtest mode or when no adapter
is registered. Purely informational.

### commitScheduleOpen

```ts
commitScheduleOpen: (payload: BrokerScheduleOpenPayload) => Promise<void>
```

Forwards a scheduled-signal-open to the registered broker adapter.

Called automatically via scheduleEventSubject (action "scheduled") when a scheduled signal is
created. Skipped silently in backtest mode or when no adapter is registered.

### commitScheduleCancelled

```ts
commitScheduleCancelled: (payload: BrokerScheduleCancelledPayload) => Promise<void>
```

Forwards a scheduled-signal-cancelled to the registered broker adapter.

Called automatically via scheduleEventSubject (action "cancelled") when a scheduled signal is
removed before activation. Skipped silently in backtest mode or when no adapter is registered.

IMPORTANT (adapter responsibility): the cancel may race the real fill. The framework decides
to drop the scheduled signal from ITS view (risk reject at activation, sync reject, stop,
timeout), but the resting limit order on the exchange may have ALREADY filled by the time this
arrives. The adapter MUST check the actual order status before cancelling: if the order is
filled, cancelling is a no-op on the exchange and the adapter owns the resulting position
(close it or reconcile via onOrderActiveCheck / onSignalActivePing). The framework cannot model
this case — from its side the signal is terminally cancelled.

### commitPendingOpen

```ts
commitPendingOpen: (payload: BrokerPendingOpenPayload) => Promise<void>
```

Forwards a pending-signal-open to the registered broker adapter.

Called automatically via signalEventSubject (action "opened") when a pending position is opened.
Skipped silently in backtest mode or when no adapter is registered.

### commitPendingClose

```ts
commitPendingClose: (payload: BrokerPendingClosePayload) => Promise<void>
```

Forwards a pending-signal-close to the registered broker adapter.

Called automatically via signalEventSubject (action "closed") when a pending position is closed.
Skipped silently in backtest mode or when no adapter is registered.

### commitPartialProfit

```ts
commitPartialProfit: (payload: BrokerPartialProfitPayload) => Promise<void>
```

Intercepts a partial-profit close before DI-core mutation.

Called explicitly from Live.ts / Backtest.ts / strategy.ts after all validations pass,
but before `strategyCoreService.partialProfit()`. If this method throws, the DI mutation
is skipped and state remains unchanged.

Skipped silently in backtest mode or when no adapter is registered.

### commitPartialLoss

```ts
commitPartialLoss: (payload: BrokerPartialLossPayload) => Promise<void>
```

Intercepts a partial-loss close before DI-core mutation.

Called explicitly from Live.ts / Backtest.ts / strategy.ts after all validations pass,
but before `strategyCoreService.partialLoss()`. If this method throws, the DI mutation
is skipped and state remains unchanged.

Skipped silently in backtest mode or when no adapter is registered.

### commitTrailingStop

```ts
commitTrailingStop: (payload: BrokerTrailingStopPayload) => Promise<void>
```

Intercepts a trailing stop-loss update before DI-core mutation.

Called explicitly after all validations pass, but before `strategyCoreService.trailingStop()`.
`newStopLossPrice` is the absolute price computed from percentShift + original SL + effectivePriceOpen.

Skipped silently in backtest mode or when no adapter is registered.

### commitTrailingTake

```ts
commitTrailingTake: (payload: BrokerTrailingTakePayload) => Promise<void>
```

Intercepts a trailing take-profit update before DI-core mutation.

Called explicitly after all validations pass, but before `strategyCoreService.trailingTake()`.
`newTakeProfitPrice` is the absolute price computed from percentShift + original TP + effectivePriceOpen.

Skipped silently in backtest mode or when no adapter is registered.

### commitBreakeven

```ts
commitBreakeven: (payload: BrokerBreakevenPayload) => Promise<void>
```

Intercepts a breakeven operation before DI-core mutation.

Called explicitly after all validations pass, but before `strategyCoreService.breakeven()`.
`newStopLossPrice` equals effectivePriceOpen (entry price).
`newTakeProfitPrice` equals `_trailingPriceTakeProfit ?? priceTakeProfit` (TP is unchanged by breakeven).

Skipped silently in backtest mode or when no adapter is registered.

### commitAverageBuy

```ts
commitAverageBuy: (payload: BrokerAverageBuyPayload) => Promise<void>
```

Intercepts a DCA average-buy entry before DI-core mutation.

Called explicitly after all validations pass, but before `strategyCoreService.averageBuy()`.
`currentPrice` is the market price at which the new DCA entry is added.
`cost` is the dollar amount of the new entry (default: CC_POSITION_ENTRY_COST).

Skipped silently in backtest mode or when no adapter is registered.

### useBrokerAdapter

```ts
useBrokerAdapter: (broker: TBrokerCtor | Partial<IBroker>) => void
```

Registers a broker adapter instance or constructor to receive commit* callbacks.

Must be called before `enable()`. Accepts either a class constructor (called with `new`)
or an already-instantiated object implementing `Partial&lt;IBroker&gt;`.

### enable

```ts
enable: (() => () => void) & ISingleshotClearable<() => () => void>
```

Activates the broker: subscribes to syncSubject for signal-open / signal-close routing.

Must be called after `useBrokerAdapter()`. Returns a dispose function that unsubscribes
from syncSubject (equivalent to calling `disable()`).

Calling `enable()` without a registered adapter throws immediately.
Calling `enable()` more than once is idempotent (singleshot guard).

### disable

```ts
disable: () => void
```

Deactivates the broker: unsubscribes from syncSubject and resets the singleshot guard.

Idempotent — safe to call even if `enable()` was never called.
After `disable()`, `enable()` can be called again to reactivate.

### clear

```ts
clear: () => void
```

Clears the cached broker instance and resets the enable singleshot.
Call this when process.cwd() changes between strategy iterations
so a new broker instance is created with the updated base path.

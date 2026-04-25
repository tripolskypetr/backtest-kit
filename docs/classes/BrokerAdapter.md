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

### _brokerInstance

```ts
_brokerInstance: any
```

### commitSignalOpen

```ts
commitSignalOpen: (payload: BrokerSignalOpenPayload) => Promise<void>
```

Forwards a signal-open event to the registered broker adapter.

Called automatically via syncSubject when `enable()` is active.
Skipped silently in backtest mode or when no adapter is registered.

### commitSignalClose

```ts
commitSignalClose: (payload: BrokerSignalClosePayload) => Promise<void>
```

Forwards a signal-close event to the registered broker adapter.

Called automatically via syncSubject when `enable()` is active.
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

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

### onSignalCloseCommit

```ts
onSignalCloseCommit: (payload: BrokerSignalClosePayload) => Promise<void>
```

Called when a new signal is closed (take-profit, stop-loss, or manual close).

### onSignalOpenCommit

```ts
onSignalOpenCommit: (payload: BrokerSignalOpenPayload) => Promise<void>
```

Called when a new signal is opened (position entry confirmed).

### onOrderPing

```ts
onOrderPing: (payload: BrokerSignalPendingPayload) => Promise<void>
```

Called on every live tick while a pending signal is monitored, BEFORE TP/SL/time evaluation.
Query the exchange by `payload.signalId` and THROW ONLY when the order is NOT FOUND by that id
— the framework will then close the position with closeReason "closed". Return normally to keep
monitoring.

CRITICAL: swallow transient/network errors (timeout, 5xx, rate limit, disconnect) — return
normally instead of throwing, otherwise a connectivity blip would wrongly close an open
position. Throw exclusively on a confirmed "order not found by id" result.

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

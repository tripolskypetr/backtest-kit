---
title: docs/function/listenSync
group: docs
---

# listenSync

```ts
declare function listenSync(fn: (event: OrderSyncContract) => void, warned?: boolean): () => void;
```

Subscribes to signal synchronization events with queued async processing.
This is an order GATE: a throw from the listener rejects the open/close.

Emits when signals are being synchronized (e.g. pending signal being opened/closed).

Throw semantics (resolved into IBrokerOrderVerdict, identical to the Broker
`onOrderOpenCommit` / `onOrderCloseCommit` channel):
- plain Error or {@link OrderTransientError} → "transient": the open retries
  identity-stably (same signalId, `event.attempt` increments) up to
  CC_ORDER_OPEN_RETRY_ATTEMPTS; the close retries up to
  CC_ORDER_CLOSE_RETRY_ATTEMPTS, then the engine FORCE-CLOSES its state with the
  original closeReason. Exhaustion of either signals a fatal exit (exitEmitter).
- {@link OrderRejectedError} → "rejected", TERMINAL at once: the open is dropped
  without arming the retry; the close is force-closed immediately. No exit signal
  (business outcome).
- {@link OrderDeletedError} here is a userspace protocol violation (it belongs to
  the CHECK channel) and intentionally degrades to "transient".

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle sync events. If the function returns a promise, signal processing will wait until it resolves. |
| `warned` | |

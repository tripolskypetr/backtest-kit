---
title: docs/function/listenOrderReject
group: docs
---

# listenOrderReject

```ts
declare function listenOrderReject(fn: (event: OrderRejectContract) => void): () => void;
```

Subscribes to TERMINAL order rejection events with queued async processing.

Post-verdict mirror of the rejection branch: fires ONLY when the onOrderSync gate
resolved into the "rejected" verdict — the broker adapter threw OrderRejectedError
("the exchange definitively refused this order, retrying is pointless"). Exactly
once per dropped order attempt: an open consumes its signalId (the whipsaw guard
blocks re-emission of the same id), a close force-closes with the original
closeReason. Transient failures never fire here — they retry silently within the
bounded budgets.

Live-only: backtest gates short-circuit to "confirmed" without an exchange.

Like {@link listenOrderFill} this is a NOTIFICATION channel, not a gate: a throw
from the listener is swallowed at the emission site (logged + errorEmitter) and
cannot affect the already-resolved verdict. Safe for telegram/webhook/audit
consumers.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle terminal rejection events. If the function returns a promise, processing is queued sequentially. |
